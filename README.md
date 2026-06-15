# Planetary Digital Twin: Weather, Hurricanes & Natural Disaster Monitoring

This build uses the attached flood-inundation digital twin as the guide and upgrades the earlier weather dashboard into a **real 3D Earth digital twin prototype** with live API connections.

## What makes this version real

- **Real interactive 3D Earth globe** using ArcGIS Maps SDK for JavaScript `SceneView`.
- **Live coordinate scan API** using FastAPI.
- **Open-Meteo Forecast API** for temperature, humidity, wind, gusts, cloud cover, and precipitation.
- **Open-Meteo Air Quality API** for PM2.5, PM10, AQI, ozone, nitrogen dioxide, carbon monoxide, and dust.
- **Open-Meteo Marine API** for wave height, wave period, currents, sea-surface temperature, and sea level where available.
- **Open-Meteo Flood API** for river discharge context where available.
- **NASA EONET** for active natural disaster events.
- **USGS Earthquake GeoJSON** for M4.5+ earthquakes.
- **NOAA/NHC-compatible ArcGIS active hurricane layers** added directly to the globe when the public service is reachable.
- **AI hazard triage score** that fuses live weather, flood, marine, air-quality, NASA EONET, and USGS proximity signals.

## Run locally

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Start the server:

```bash
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## How to use

1. Wait for the real 3D Earth globe to load.
2. Click anywhere on Earth to run a coordinate-based scan.
3. Or enter latitude and longitude and click **Run Digital Twin Scan**.
4. Use the toggles to switch earthquakes, NASA events, and hurricane layers on or off.
5. Read the left and right panels for live weather, flood/marine context, API status, nearest hazards, and AI risk level.

## API endpoints

Health:

```text
/api/health
```

Coordinate scan:

```text
/api/digital-twin?lat=17.25&lng=-88.7667
```

Live event overlay proxy:

```text
/api/events
```

## Production deployment options

### Render / Railway / Fly.io

This is the easiest approach because the application has a Python backend.

Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Docker

```bash
docker build -t planetary-digital-twin-weather-real .
docker run -p 8000:8000 planetary-digital-twin-weather-real
```

## Important limitations

This is a live operational prototype, not an official emergency warning system. For production emergency use, add:

- Official authenticated agency feeds.
- Backend database and historical archive.
- Alert approval and audit workflow.
- User accounts and role-based permissions.
- Local radar, gauge, DEM/LiDAR, HEC-RAS, and hydrologic model integration.
- Redundant hosting and observability.
- Clear legal disclaimers and incident command operating procedures.

