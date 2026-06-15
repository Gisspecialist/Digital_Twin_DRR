from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "600"))
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "12"))
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

app = FastAPI(
    title="Planetary Weather, Hurricane and Disaster Digital Twin",
    version="3.0.0",
    description="Real 3D Earth digital twin API using Open-Meteo, NASA EONET, USGS and NOAA/NHC-compatible data layers.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
_cache: dict[str, tuple[float, Any]] = {}


@dataclass
class NearestFeature:
    title: str
    distance_km: float
    latitude: float
    longitude: float
    source: str
    category: str | None = None


def cache_get(key: str) -> Any | None:
    item = _cache.get(key)
    if not item:
        return None
    saved_at, value = item
    if time.time() - saved_at > CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any) -> Any:
    _cache[key] = (time.time(), value)
    return value


def build_url(base: str, params: dict[str, Any]) -> str:
    return f"{base}?{urlencode(params, doseq=False)}"


def clamp_coordinate(lat: float, lng: float) -> tuple[float, float]:
    return max(-90.0, min(90.0, float(lat))), max(-180.0, min(180.0, float(lng)))


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def safe_num(value: Any, default: float | None = None) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return default


def first_hourly_value(data: dict[str, Any] | None, variable: str) -> Any:
    hourly = (data or {}).get("hourly") or {}
    values = hourly.get(variable) or []
    return values[0] if values else None


def first_daily_value(data: dict[str, Any] | None, variable: str) -> Any:
    daily = (data or {}).get("daily") or {}
    values = daily.get(variable) or []
    return values[0] if values else None


async def fetch_json(client: httpx.AsyncClient, url: str) -> tuple[bool, dict[str, Any] | None, str | None]:
    try:
        response = await client.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return True, response.json(), None
    except Exception as exc:  # noqa: BLE001
        return False, None, str(exc)


def extract_point_from_geometry(geometry: dict[str, Any]) -> tuple[float, float] | None:
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    try:
        if gtype == "Point" and coords and len(coords) >= 2:
            return float(coords[1]), float(coords[0])
        if gtype == "Polygon":
            p = coords[0][0]
            return float(p[1]), float(p[0])
        if gtype == "MultiPolygon":
            p = coords[0][0][0]
            return float(p[1]), float(p[0])
    except (TypeError, ValueError, IndexError):
        return None
    return None


def nearest_features(lat: float, lng: float, features: list[dict[str, Any]], source: str, limit: int = 5) -> list[NearestFeature]:
    items: list[NearestFeature] = []
    for feature in features:
        geometry = feature.get("geometry") or {}
        props = feature.get("properties") or {}
        point = extract_point_from_geometry(geometry)
        if not point:
            continue
        flat, flng = point
        title = str(feature.get("title") or props.get("title") or props.get("place") or "Unnamed event")
        category = None
        cats = feature.get("categories") or props.get("categories")
        if isinstance(cats, list) and cats:
            category = str(cats[0].get("title") if isinstance(cats[0], dict) else cats[0])
        items.append(NearestFeature(title, haversine_distance_km(lat, lng, flat, flng), flat, flng, source, category))
    return sorted(items, key=lambda x: x.distance_km)[:limit]


def compute_hazard_score(
    *,
    wind_kmh: float | None,
    wind_gust_kmh: float | None,
    precipitation_mm: float | None,
    hourly_precipitation: list[Any] | None,
    temp_c: float | None,
    pm25: float | None,
    wave_height_m: float | None,
    river_discharge_m3s: float | None,
    nearest_event_km: float | None,
    nearest_quake_km: float | None,
) -> dict[str, Any]:
    precip_values = [float(v) for v in (hourly_precipitation or [])[:24] if isinstance(v, (int, float)) and math.isfinite(v)]
    rain_24h = sum(precip_values) if precip_values else (safe_num(precipitation_mm, 0) or 0)
    peak_rain = max(precip_values) if precip_values else (safe_num(precipitation_mm, 0) or 0)
    wind = safe_num(wind_kmh, 0) or 0
    gust = safe_num(wind_gust_kmh, wind) or wind
    temp = safe_num(temp_c, 0) or 0
    pm = safe_num(pm25, 0) or 0
    wave = safe_num(wave_height_m, 0) or 0
    discharge = safe_num(river_discharge_m3s, 0) or 0

    components = {
        "rainfall": min(100, rain_24h * 1.4 + peak_rain * 2.0),
        "wind": min(100, wind * 1.1 + gust * 0.45),
        "heat": min(100, max(0, temp - 28) * 9),
        "air_quality": min(100, pm * 2.4),
        "marine": min(100, wave * 24),
        "river": min(100, discharge / 10),
        "nearby_event": 0 if nearest_event_km is None else max(0, 100 - nearest_event_km / 7),
        "nearby_quake": 0 if nearest_quake_km is None else max(0, 100 - nearest_quake_km / 4),
    }
    score = round(sum(components.values()) / len(components), 1)
    if score >= 60 or rain_24h >= 90 or gust >= 110:
        level = "high"
    elif score >= 32 or rain_24h >= 35 or gust >= 65:
        level = "moderate"
    else:
        level = "low"
    return {
        "level": level,
        "score": score,
        "components": {k: round(v, 1) for k, v in components.items()},
        "rainfall_24h_mm": round(rain_24h, 2),
        "peak_hourly_rain_mm": round(peak_rain, 2),
        "message": {
            "high": "Elevated hazard signal. Validate with local warnings, radar, gauge data, and official emergency management feeds.",
            "moderate": "Watch-level signal. Continue monitoring rainfall, wind, rivers, marine conditions, and nearby active hazards.",
            "low": "Lower immediate signal from currently available open feeds. Keep monitoring because conditions can change quickly.",
        }[level],
    }


@app.get("/")
async def index() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "planetary-weather-hurricane-disaster-digital-twin",
        "version": app.version,
        "cache_items": len(_cache),
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
    }


@app.get("/api/digital-twin")
async def digital_twin(lat: float = Query(..., ge=-90, le=90), lng: float = Query(..., ge=-180, le=180)) -> JSONResponse:
    lat, lng = clamp_coordinate(lat, lng)
    key = f"digital-twin-v3:{lat:.3f}:{lng:.3f}"
    cached = cache_get(key)
    if cached:
        cached["cache"] = {"hit": True, "ttl_seconds": CACHE_TTL_SECONDS}
        return JSONResponse(cached)

    weather_url = build_url(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": lat,
            "longitude": lng,
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
            "hourly": "temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m,wind_gusts_10m",
            "forecast_hours": 24,
            "timezone": "auto",
        },
    )
    air_url = build_url(
        "https://air-quality-api.open-meteo.com/v1/air-quality",
        {
            "latitude": lat,
            "longitude": lng,
            "hourly": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,us_aqi,dust",
            "forecast_hours": 24,
            "timezone": "auto",
        },
    )
    marine_url = build_url(
        "https://marine-api.open-meteo.com/v1/marine",
        {
            "latitude": lat,
            "longitude": lng,
            "hourly": "wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature,sea_level_height_msl",
            "forecast_hours": 24,
            "timezone": "auto",
        },
    )
    flood_url = build_url(
        "https://flood-api.open-meteo.com/v1/flood",
        {
            "latitude": lat,
            "longitude": lng,
            "daily": "river_discharge,river_discharge_mean,river_discharge_max,river_discharge_min",
            "forecast_days": 7,
        },
    )
    eonet_url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100"
    usgs_url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"

    async with httpx.AsyncClient(headers={"User-Agent": "planetary-digital-twin-real/3.0"}) as client:
        weather_ok, weather_data, weather_error = await fetch_json(client, weather_url)
        air_ok, air_data, air_error = await fetch_json(client, air_url)
        marine_ok, marine_data, marine_error = await fetch_json(client, marine_url)
        flood_ok, flood_data, flood_error = await fetch_json(client, flood_url)
        eonet_ok, eonet_data, eonet_error = await fetch_json(client, eonet_url)
        usgs_ok, usgs_data, usgs_error = await fetch_json(client, usgs_url)

    current = (weather_data or {}).get("current") or {}
    hourly = (weather_data or {}).get("hourly") or {}
    eonet_features: list[dict[str, Any]] = []
    for event in (eonet_data or {}).get("events", []):
        geometry_list = event.get("geometry") or []
        if not geometry_list:
            continue
        eonet_features.append(
            {
                "title": event.get("title"),
                "geometry": geometry_list[0],
                "categories": event.get("categories") or [],
                "properties": {"title": event.get("title")},
            }
        )
    nearest_eonet = nearest_features(lat, lng, eonet_features, "NASA EONET", limit=5)
    nearest_quakes = nearest_features(lat, lng, (usgs_data or {}).get("features", []), "USGS Earthquakes", limit=5)

    observations = {
        "temperature_c": current.get("temperature_2m"),
        "relative_humidity_percent": current.get("relative_humidity_2m"),
        "apparent_temperature_c": current.get("apparent_temperature"),
        "precipitation_mm": current.get("precipitation"),
        "weather_code": current.get("weather_code"),
        "cloud_cover_percent": current.get("cloud_cover"),
        "wind_speed_kmh": current.get("wind_speed_10m"),
        "wind_direction_degrees": current.get("wind_direction_10m"),
        "wind_gusts_kmh": current.get("wind_gusts_10m"),
        "pm25_ugm3": first_hourly_value(air_data, "pm2_5"),
        "pm10_ugm3": first_hourly_value(air_data, "pm10"),
        "us_aqi": first_hourly_value(air_data, "us_aqi"),
        "carbon_monoxide_ugm3": first_hourly_value(air_data, "carbon_monoxide"),
        "nitrogen_dioxide_ugm3": first_hourly_value(air_data, "nitrogen_dioxide"),
        "ozone_ugm3": first_hourly_value(air_data, "ozone"),
        "dust_ugm3": first_hourly_value(air_data, "dust"),
        "wave_height_m": first_hourly_value(marine_data, "wave_height"),
        "wave_period_s": first_hourly_value(marine_data, "wave_period"),
        "wave_direction_degrees": first_hourly_value(marine_data, "wave_direction"),
        "sea_surface_temperature_c": first_hourly_value(marine_data, "sea_surface_temperature"),
        "sea_level_height_msl_m": first_hourly_value(marine_data, "sea_level_height_msl"),
        "river_discharge_m3s": first_daily_value(flood_data, "river_discharge"),
        "river_discharge_mean_m3s": first_daily_value(flood_data, "river_discharge_mean"),
        "river_discharge_max_m3s": first_daily_value(flood_data, "river_discharge_max"),
    }
    hazard_score = compute_hazard_score(
        wind_kmh=observations["wind_speed_kmh"],
        wind_gust_kmh=observations["wind_gusts_kmh"],
        precipitation_mm=observations["precipitation_mm"],
        hourly_precipitation=hourly.get("precipitation") or [],
        temp_c=observations["temperature_c"],
        pm25=observations["pm25_ugm3"],
        wave_height_m=observations["wave_height_m"],
        river_discharge_m3s=observations["river_discharge_m3s"],
        nearest_event_km=nearest_eonet[0].distance_km if nearest_eonet else None,
        nearest_quake_km=nearest_quakes[0].distance_km if nearest_quakes else None,
    )

    payload = {
        "coordinate": {"latitude": lat, "longitude": lng},
        "timestamp_utc": int(time.time()),
        "cache": {"hit": False, "ttl_seconds": CACHE_TTL_SECONDS},
        "api_status": {
            "open_meteo_weather": {"online": weather_ok, "error": weather_error},
            "open_meteo_air_quality": {"online": air_ok, "error": air_error},
            "open_meteo_marine": {"online": marine_ok, "error": marine_error},
            "open_meteo_flood": {"online": flood_ok, "error": flood_error},
            "nasa_eonet": {"online": eonet_ok, "error": eonet_error},
            "usgs_earthquakes": {"online": usgs_ok, "error": usgs_error},
        },
        "source_urls": {
            "weather": weather_url,
            "air_quality": air_url,
            "marine": marine_url,
            "flood": flood_url,
            "nasa_eonet": eonet_url,
            "usgs_earthquakes": usgs_url,
            "noaa_nhc_arcgis_active_hurricanes": "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer",
        },
        "observations": observations,
        "hourly_preview": {
            "time": (hourly.get("time") or [])[:12],
            "precipitation_mm": (hourly.get("precipitation") or [])[:12],
            "wind_speed_kmh": (hourly.get("wind_speed_10m") or [])[:12],
            "wind_gusts_kmh": (hourly.get("wind_gusts_10m") or [])[:12],
        },
        "hazards": {
            "nearest_nasa_eonet_events": [item.__dict__ for item in nearest_eonet],
            "nearest_usgs_earthquakes": [item.__dict__ for item in nearest_quakes],
        },
        "risk": hazard_score,
        "digital_twin_workflow": [
            "Ingest live satellite/radar/hazard feeds and open meteorological APIs.",
            "Render operational layers on a 3D Earth scene for global situational awareness.",
            "Allow coordinate targeting for a local digital twin scan.",
            "Fuse weather, flood, marine, air-quality, earthquake, and disaster signals into a hazard score.",
            "Use official agency warnings and calibrated local models before making emergency decisions.",
        ],
        "limitations": "This is an operational prototype using public open feeds. It is not an official warning system. Production use needs authenticated agency feeds, persistent database, alert approval workflow, audit logs, and locally calibrated hydrology/hydraulics models.",
    }
    cache_set(key, payload)
    return JSONResponse(payload)


@app.get("/api/events")
async def live_events() -> JSONResponse:
    """Small proxy endpoint used by the front end to avoid browser CORS issues for live event overlays."""
    eonet_url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100"
    usgs_url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
    async with httpx.AsyncClient(headers={"User-Agent": "planetary-digital-twin-real/3.0"}) as client:
        eonet_ok, eonet_data, eonet_error = await fetch_json(client, eonet_url)
        usgs_ok, usgs_data, usgs_error = await fetch_json(client, usgs_url)
    return JSONResponse({
        "api_status": {"nasa_eonet": {"online": eonet_ok, "error": eonet_error}, "usgs_earthquakes": {"online": usgs_ok, "error": usgs_error}},
        "eonet": eonet_data or {"events": []},
        "usgs": usgs_data or {"features": []},
    })
