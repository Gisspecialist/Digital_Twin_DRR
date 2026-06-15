# Planetary Digital Twin — Real Weather, Hurricanes & Natural Disaster Monitor v3

This version was rebuilt to behave more like the uploaded 3D digital twin example while using a real 3D Earth scene and live public data feeds.

## What changed in v3

- Natural slow Earth revolution, not a fake dashboard animation.
- ArcGIS `SceneView` global globe with terrain/elevation and atmosphere.
- In-app basemap selector and ArcGIS Basemap Gallery.
- Operational layer manager inside the dashboard.
- Easy attachable layer registry at `static/layers.json`.
- NOAA/NHC tropical weather service hook.
- Active hurricanes/cyclone layer hooks.
- USGS live earthquake GeoJSON layer.
- NASA EONET active disaster event overlay.
- Open-Meteo weather, air-quality, marine, and flood API fusion through the FastAPI backend.
- Click anywhere on the globe to scan weather/flood/marine/air/quake context.

## Run locally

```bash
cd planetary-digital-twin-weather-real-v3
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## Adding more layers

Open `static/layers.json` and add a new layer record under `operationalLayers`.

Supported client layer types:

```json
{
  "id": "myLayer",
  "label": "My Live Layer",
  "type": "feature",
  "url": "https://example.com/arcgis/rest/services/my_service/FeatureServer/0",
  "visible": true,
  "opacity": 0.85,
  "group": "custom"
}
```

Use:

- `feature` for ArcGIS FeatureServer layer URLs.
- `map-image` for ArcGIS MapServer services.
- `geojson` for public GeoJSON feeds.

Once added, refresh the browser. The new layer appears automatically in the Operational Layer Manager.

## Important production notes

This is a professional live prototype, not an official emergency warning system. Before operational use, connect authenticated agency feeds, add alert validation, persistent database storage, user accounts, audit logs, sensor feed monitoring, backend caching, and role-based access control.

## Data feeds wired in

- NOAA/NHC Tropical Weather ArcGIS REST service
- ArcGIS Living Atlas active hurricane/cyclone/typhoon service hooks
- USGS earthquakes GeoJSON feed
- NASA EONET events API
- Open-Meteo forecast, air-quality, marine, and flood APIs
