# Planetary Digital Twin - Real Live Weather, Hurricane & Natural Disaster Monitor

This is a professional static web application with a **real 3D Earth globe** and live public API data connections.

## What makes this version real

It is not a fantasy-only dashboard. The app connects to live/public geospatial feeds:

- **ArcGIS Maps SDK for JavaScript 4.x**: real 3D SceneView globe with satellite basemap and elevation.
- **NOAA/NHC + JTWC Active Hurricanes, Cyclones and Typhoons**: loaded through ArcGIS Living Atlas public layer item `248e7b5827a34b248647afb012c58787`.
- **USGS Earthquake GeoJSON**: M2.5+ earthquakes from the past day.
- **NASA EONET v3**: active natural hazard events such as wildfires, severe storms, volcanoes, sea/lake ice, and other hazards.
- **Open-Meteo Forecast API**: live weather points and click-to-query weather anywhere on the globe.

## Run locally

Because this app loads internet APIs and the ArcGIS CDN, run it with a local web server rather than opening directly from file if your browser blocks API calls.

### Option 1: Python

```bash
cd planetary-digital-twin-real
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

### Option 2: VS Code

Install the Live Server extension, right-click `index.html`, and select **Open with Live Server**.

## Deploy to Vercel

This is a static site. Upload the folder to GitHub and import it into Vercel.

Recommended Vercel settings:

- Framework Preset: **Other**
- Build Command: leave empty
- Output Directory: leave empty or `/`

## Important operational notes

This dashboard is appropriate as a professional prototype, demo, or early operational interface. For emergency management or government deployment, add:

1. Official authenticated feeds from national meteorological and disaster agencies.
2. Server-side API proxy/cache for CORS control, rate limiting, and audit logs.
3. User authentication and role-based access.
4. Alert verification workflow before sending public warnings.
5. Database storage for historical events and incident reports.
6. Production monitoring, uptime checks, and API-failure fallback notices.

## Files

- `index.html` - main application shell
- `styles.css` - dashboard UI styling
- `app.js` - API connections, 3D globe, data rendering, and widgets
