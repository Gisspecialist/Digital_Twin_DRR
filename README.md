# Planetary Digital Twin Weather + Disaster Monitoring — v4 Fixed Loader

This version fixes the stall/loading issue by:

- Loading the real 3D ArcGIS globe first, then loading agency layers progressively.
- Running API requests in parallel on the FastAPI backend instead of sequentially.
- Reducing backend timeout defaults to 5 seconds per source.
- Adding browser-side request timeouts so panels do not hang forever.
- Fixing static file paths so the app works even when launched from a different working directory.
- Keeping the natural revolving Earth globe, basemap options, layer manager, and live public API hooks.

## Run locally

```bash
cd planetary-digital-twin-weather-real-v4
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## Add more layers

Edit:

```text
static/layers.json
```

Add ArcGIS FeatureServer/MapServer or GeoJSON feeds:

```json
{
  "id": "myLayer",
  "label": "My Live Layer",
  "type": "geojson",
  "url": "https://example.com/feed.geojson",
  "visible": true,
  "opacity": 0.85,
  "group": "custom"
}
```

Supported layer types:

- `feature`
- `map-image`
- `geojson`

## Important

This is a real API-connected operational prototype, not an official emergency warning system. Production use should add authenticated agency feeds, persistent storage, alert validation workflows, audit logs, error monitoring, and local calibration.
