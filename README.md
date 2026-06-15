# Planetary Digital Twin — Weather, Hurricanes & Natural Disasters

This version was upgraded using the uploaded flood-inundation digital twin as the design/behavior guide.

## Key fixes in this version

- Real ArcGIS 3D globe with terrain/elevation enabled.
- The globe now auto-revolves like the earlier digital twin app.
- Rotation can be turned on/off from the dashboard.
- Rotation speed control was added.
- Base-layer options were added directly in the application:
  - Satellite Imagery
  - Imagery Hybrid
  - Topographic
  - Streets
  - Oceans
  - Terrain
  - Dark Gray
  - Light Gray
- ArcGIS Basemap Gallery widget was added to the 3D view.
- Existing live API-connected layers remain:
  - USGS earthquakes
  - NASA EONET disasters
  - NOAA/NHC-compatible active hurricane layers through ArcGIS services
  - Open-Meteo weather, air quality, marine and flood context through the backend

## Run locally

```bash
cd planetary-digital-twin-weather-real-v2
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## Important note

This is a professional prototype connected to public APIs. It is not an official emergency warning system. For a production emergency platform, add authenticated agency feeds, persistence, monitoring, caching, user accounts, alert verification, and operational SOPs.
