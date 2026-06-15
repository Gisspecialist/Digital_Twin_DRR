# Planetary Digital Twin: Weather, Hurricanes & Natural Disaster Monitoring

A professional React/Vite digital twin dashboard inspired by the supplied Weather Prediction Models + GeoAI concept image and the prior CO₂/PM digital twin style. It is ready to run locally and deploy to Vercel.

## What is included

- Full-screen enterprise-style dashboard
- Animated 3D planetary digital twin globe using HTML Canvas
- Live-style simulated metrics for hurricanes, floods, wildfires, earthquakes, heatwaves, landslides, and urban storm risk
- Disaster alerts, forecast model comparison, AI hazard insight panel, emergency response panel, weather layers, regional risk rankings
- Responsive layout for desktop and smaller screens
- Deployment-ready Vercel configuration
- `.env.example` for future live API integration

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite, usually `http://localhost:5173`.

## Build for production

```bash
npm run build
npm run preview
```

## Deploy to Vercel

1. Create a GitHub repository and upload this folder.
2. In Vercel, click **New Project**.
3. Import the GitHub repository.
4. Framework preset: **Vite**.
5. Build command: `npm run build`.
6. Output directory: `dist`.
7. Deploy.

The included `vercel.json` handles browser refresh and nested route rewrites.

## Live data integration plan

The application currently runs with demo/simulated real-time metrics so it can go live immediately as a polished prototype. To connect real feeds, use these sources through backend proxy endpoints to avoid CORS and API-key exposure:

- NOAA/NHC hurricane advisories and active storm feeds
- NOAA/NWS alerts API for severe weather alerts
- USGS earthquake GeoJSON feeds
- NASA FIRMS for fire hotspots
- GDACS for global disaster alerts
- OpenWeather, ECMWF, GFS, ICON, UKMO or commercial forecast APIs for model products
- Copernicus/ESA/NASA imagery for layers

Recommended production architecture:

```text
React/Vite Frontend → API Proxy / FastAPI or Node backend → Weather & disaster feeds → Database/cache → Dashboard
```

## Important note

This is a live-ready front-end prototype. Operational public safety use requires verified authoritative feeds, backend validation, caching, authentication, uptime monitoring, and clear legal disclaimers.
