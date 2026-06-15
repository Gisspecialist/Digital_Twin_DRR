/*
  Real Planetary Digital Twin Dashboard
  Live/public data connections:
  - ArcGIS Maps SDK 3D SceneView for a real globe
  - NOAA/NHC + JTWC Active Hurricanes via ArcGIS Living Atlas item 248e7b5827a34b248647afb012c58787
  - USGS Earthquake GeoJSON feed
  - NASA EONET v3 open events feed
  - Open-Meteo live forecast/current weather API
*/
const API_STATUS = new Map();
const setStatus = (name, ok, note = '') => {
  API_STATUS.set(name, { ok, note });
  renderConnections();
};
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('en-US');
const trunc = (s, n = 56) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

const weatherCities = [
  { name: 'Belize City', lat: 17.5046, lon: -88.1962 },
  { name: 'Miami', lat: 25.7617, lon: -80.1918 },
  { name: 'Kingston', lat: 17.9712, lon: -76.7936 },
  { name: 'San Juan', lat: 18.4655, lon: -66.1057 },
  { name: 'Manila', lat: 14.5995, lon: 120.9842 },
  { name: 'Dhaka', lat: 23.8103, lon: 90.4125 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'Lagos', lat: 6.5244, lon: 3.3792 },
  { name: 'London', lat: 51.5072, lon: -0.1276 },
  { name: 'São Paulo', lat: -23.5558, lon: -46.6396 }
];

let view, map, layers = {}, autoRotate = false, rotateHandle = null;

function startClock() {
  const tick = () => {
    const d = new Date();
    $('utcClock').textContent = d.toISOString().slice(11, 19) + ' UTC';
  };
  tick(); setInterval(tick, 1000);
}

function renderConnections() {
  const container = $('connectionList');
  if (!container) return;
  const rows = Array.from(API_STATUS.entries()).map(([name, s]) => `
    <div class="connection"><span>${name}</span><span class="${s.ok ? 'ok' : 'fail'}">${s.ok ? 'CONNECTED' : 'OFFLINE'} ${s.note ? '· ' + s.note : ''}</span></div>`).join('');
  container.innerHTML = rows || '<div class="smallText">Connections initializing...</div>';
}

function setUpdated() {
  $('lastUpdated').textContent = 'Last updated: ' + new Date().toLocaleString();
}

function item(title, sub, badge = '', cls = '') {
  return `<div class="item"><div class="itemTop"><span>${title}</span>${badge ? `<span class="badge ${cls}">${badge}</span>` : ''}</div><div class="itemSub">${sub}</div></div>`;
}

function initMap() {
  require([
    'esri/Map', 'esri/views/SceneView', 'esri/layers/GraphicsLayer', 'esri/Graphic',
    'esri/geometry/Point', 'esri/layers/Layer', 'esri/widgets/LayerList', 'esri/widgets/Expand',
    'esri/widgets/BasemapGallery', 'esri/widgets/Home'
  ], function(Map, SceneView, GraphicsLayer, Graphic, Point, Layer, LayerList, Expand, BasemapGallery, Home) {
    map = new Map({ basemap: 'satellite', ground: 'world-elevation' });
    layers.weather = new GraphicsLayer({ title: 'Open-Meteo live weather points' });
    layers.quakes = new GraphicsLayer({ title: 'USGS earthquakes M2.5+ past day' });
    layers.events = new GraphicsLayer({ title: 'NASA EONET active natural hazards' });
    map.addMany([layers.events, layers.quakes, layers.weather]);

    view = new SceneView({
      container: 'viewDiv', map,
      viewingMode: 'global', qualityProfile: 'high', alphaCompositingEnabled: true,
      environment: {
        atmosphere: { quality: 'high' },
        starsEnabled: true,
        lighting: { date: new Date(), directShadowsEnabled: true, ambientOcclusionEnabled: true }
      },
      camera: { position: { x: -92, y: 24, z: 18000000 }, tilt: 0, heading: 0 },
      popup: { dockEnabled: true, dockOptions: { buttonEnabled: false, breakpoint: false, position: 'bottom-right' } }
    });

    view.when(() => {
      setStatus('ArcGIS 3D Globe', true, 'SceneView');
      const layerList = new LayerList({ view });
      view.ui.add(new Expand({ view, content: layerList, expandIcon: 'layers', group: 'top-right' }), 'top-right');
      view.ui.add(new Expand({ view, content: new BasemapGallery({ view }), expandIcon: 'basemap', group: 'top-right' }), 'top-right');
      view.ui.add(new Home({ view }), 'top-left');

      Layer.fromPortalItem({ portalItem: { id: '248e7b5827a34b248647afb012c58787' } })
        .then(layer => {
          layer.title = 'Active Hurricanes, Cyclones and Typhoons - NOAA/NHC + JTWC';
          map.add(layer, 0);
          layers.cyclones = layer;
          setStatus('NOAA/NHC + JTWC Cyclones', true, 'Living Atlas');
          queryCyclones(layer);
        })
        .catch(err => {
          console.warn('Cyclone layer failed:', err);
          setStatus('NOAA/NHC + JTWC Cyclones', false, 'layer blocked');
          $('cycloneCount').textContent = 'Layer unavailable';
          $('cycloneList').innerHTML = item('No cyclone layer loaded', 'The public Living Atlas hurricane layer could not load in this browser/network.', 'CHECK', 'orange');
        });

      view.on('click', async (evt) => {
        if (!evt.mapPoint) return;
        const p = evt.mapPoint;
        try {
          const wx = await fetchWeather(p.latitude, p.longitude);
          view.popup.open({
            title: `Live weather at ${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`,
            location: p,
            content: `<b>${wx.temperature_2m}°C</b> · Wind ${wx.wind_speed_10m} km/h · Precip ${wx.precipitation} mm<br/>Source: Open-Meteo Forecast API`
          });
        } catch (e) {
          view.popup.open({ title: 'Weather query failed', location: p, content: 'Open-Meteo did not return data for this point.' });
        }
      });

      refreshAll();
    }).catch(err => setStatus('ArcGIS 3D Globe', false, err.message));

    $('homeBtn').addEventListener('click', () => view.goTo({ position: { x: -92, y: 24, z: 18000000 }, tilt: 0, heading: 0 }, { duration: 1600 }));
    $('rotateBtn').addEventListener('click', () => toggleRotate());
  });
}

function toggleRotate() {
  autoRotate = !autoRotate;
  $('rotateBtn').classList.toggle('active', autoRotate);
  if (rotateHandle) { clearInterval(rotateHandle); rotateHandle = null; }
  if (autoRotate && view) {
    rotateHandle = setInterval(() => {
      if (!view.interacting && !view.animation) {
        const cam = view.camera.clone(); cam.heading += 0.25; view.camera = cam;
      }
    }, 80);
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code&hourly=precipitation_probability,precipitation,wind_speed_10m&forecast_days=1&timezone=auto`;
  const data = await fetchJson(url);
  return data.current;
}

async function loadWeatherPoints() {
  require(['esri/Graphic', 'esri/geometry/Point'], async function(Graphic, Point) {
    layers.weather.removeAll();
    const results = [];
    for (const city of weatherCities) {
      try {
        const current = await fetchWeather(city.lat, city.lon);
        results.push({ ...city, current });
        const wind = current.wind_speed_10m || 0;
        const precip = current.precipitation || 0;
        layers.weather.add(new Graphic({
          geometry: new Point({ longitude: city.lon, latitude: city.lat }),
          symbol: { type: 'point-3d', symbolLayers: [{ type: 'icon', resource: { primitive: 'circle' }, material: { color: precip > 2 ? '#27d7ff' : '#35f39d' }, size: Math.max(8, Math.min(28, wind / 2 + precip * 4)), outline: { color: '#ffffff', size: 1 } }], verticalOffset: { screenLength: 18, maxWorldLength: 500000, minWorldLength: 10000 }, callout: { type: 'line', color: '#27d7ff', size: 1 } },
          attributes: city,
          popupTemplate: { title: `${city.name} - Open-Meteo live weather`, content: `Temperature: ${current.temperature_2m}°C<br/>Humidity: ${current.relative_humidity_2m}%<br/>Wind: ${current.wind_speed_10m} km/h<br/>Precipitation: ${current.precipitation} mm` }
        }));
      } catch (e) { console.warn('Weather failed', city, e); }
    }
    if (results.length) {
      setStatus('Open-Meteo Weather', true, `${results.length} locations`);
      const wet = [...results].sort((a,b)=>(b.current.precipitation||0)-(a.current.precipitation||0))[0];
      const wind = [...results].sort((a,b)=>(b.current.wind_speed_10m||0)-(a.current.wind_speed_10m||0))[0];
      $('rainCity').textContent = `${wet.name} ${wet.current.precipitation ?? 0}mm`;
      $('windCity').textContent = `${wind.name} ${wind.current.wind_speed_10m ?? 0}km/h`;
      $('weatherList').innerHTML = results.slice(0,6).map(r => item(r.name, `${r.current.temperature_2m}°C · wind ${r.current.wind_speed_10m} km/h · rain ${r.current.precipitation} mm`, 'LIVE')).join('');
    } else {
      setStatus('Open-Meteo Weather', false, 'no response');
    }
  });
}

async function loadEarthquakes() {
  require(['esri/Graphic', 'esri/geometry/Point'], async function(Graphic, Point) {
    try {
      const data = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
      layers.quakes.removeAll();
      let maxMag = 0, maxEvent = null;
      const sorted = (data.features || []).sort((a,b)=>(b.properties.mag||0)-(a.properties.mag||0));
      sorted.forEach(f => {
        const [lon, lat, depth] = f.geometry.coordinates;
        const mag = f.properties.mag || 0; if (mag > maxMag) { maxMag = mag; maxEvent = f; }
        layers.quakes.add(new Graphic({
          geometry: new Point({ longitude: lon, latitude: lat, z: 20000 }),
          symbol: { type: 'point-3d', symbolLayers: [{ type: 'object', resource: { primitive: 'sphere' }, material: { color: mag >= 5 ? '#ff4d6d' : '#ffd166' }, height: Math.max(45000, mag * 36000), width: Math.max(45000, mag * 36000), depth: Math.max(45000, mag * 36000) }] },
          popupTemplate: { title: `M ${mag} Earthquake`, content: `${f.properties.place}<br/>Depth: ${depth} km<br/>Time: ${new Date(f.properties.time).toLocaleString()}<br/><a href="${f.properties.url}" target="_blank">USGS event page</a>` }
        }));
      });
      $('eqCount').textContent = fmt.format(sorted.length);
      $('eqMax').textContent = maxMag ? `M ${maxMag.toFixed(1)}` : '--';
      $('eqList').innerHTML = sorted.slice(0,5).map(f => item(`M ${f.properties.mag} · ${trunc(f.properties.place, 34)}`, new Date(f.properties.time).toLocaleString(), f.properties.mag >= 5 ? 'WATCH' : 'INFO', f.properties.mag >= 5 ? 'red' : '')).join('');
      setStatus('USGS Earthquakes', true, `${sorted.length} events`);
      return { count: sorted.length, max: maxMag, maxEvent };
    } catch (e) {
      setStatus('USGS Earthquakes', false, e.message);
      $('eqList').innerHTML = item('USGS feed unavailable', e.message, 'ERROR', 'red');
      return { count: 0, max: 0 };
    }
  });
}

async function loadEonetEvents() {
  require(['esri/Graphic', 'esri/geometry/Point'], async function(Graphic, Point) {
    try {
      const data = await fetchJson('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100');
      layers.events.removeAll();
      const events = data.events || [];
      events.forEach(ev => {
        const g = ev.geometry && ev.geometry[ev.geometry.length - 1];
        if (!g || !g.coordinates) return;
        let lon, lat;
        if (g.type === 'Point') { [lon, lat] = g.coordinates; }
        else if (g.type === 'Polygon') { [lon, lat] = g.coordinates[0][0]; }
        else return;
        const cat = ev.categories?.[0]?.title || 'Event';
        const color = /wildfire/i.test(cat) ? '#ff8b3d' : /storm|cyclone|severe/i.test(cat) ? '#27d7ff' : /volcano/i.test(cat) ? '#ff4d6d' : '#ffd166';
        layers.events.add(new Graphic({
          geometry: new Point({ longitude: lon, latitude: lat, z: 100000 }),
          symbol: { type: 'point-3d', symbolLayers: [{ type: 'icon', resource: { primitive: 'diamond' }, material: { color }, size: 14, outline: { color: '#fff', size: 1 } }], verticalOffset: { screenLength: 28, maxWorldLength: 600000, minWorldLength: 20000 }, callout: { type: 'line', color, size: 1 } },
          popupTemplate: { title: ev.title, content: `Category: ${cat}<br/>Date: ${g.date ? new Date(g.date).toLocaleString() : 'unknown'}<br/>Source: NASA EONET` }
        }));
      });
      $('alertCount').textContent = fmt.format(events.length);
      $('eventList').innerHTML = events.slice(0,7).map(ev => item(trunc(ev.title, 42), `${ev.categories?.[0]?.title || 'Natural event'} · ${ev.geometry?.[0]?.date ? new Date(ev.geometry[0].date).toLocaleDateString() : 'active'}`, /wildfire/i.test(ev.categories?.[0]?.title || '') ? 'FIRE' : 'OPEN', /wildfire|volcano/i.test(ev.categories?.[0]?.title || '') ? 'orange' : '')).join('');
      setStatus('NASA EONET Hazards', true, `${events.length} open`);
      updateAIInsight(events);
    } catch (e) {
      setStatus('NASA EONET Hazards', false, e.message);
      $('eventList').innerHTML = item('NASA EONET feed unavailable', e.message, 'ERROR', 'red');
      updateAIInsight([]);
    }
  });
}

function updateAIInsight(events = []) {
  const cats = events.reduce((acc, ev) => {
    const c = ev.categories?.[0]?.title || 'Other'; acc[c] = (acc[c] || 0) + 1; return acc;
  }, {});
  const top = Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
  const confidence = Math.min(94, Math.max(45, 55 + (events.length * 0.55)));
  $('confidenceScore').textContent = `${Math.round(confidence)}%`;
  $('confidenceBar').style.width = `${confidence}%`;
  if (top) {
    $('aiInsight').innerHTML = `<b>${top[0]}</b> is the most frequent currently open NASA EONET hazard category in this live session, with <b>${top[1]}</b> active event(s). Use this as a triage signal, then confirm through official national warning centers before operational decisions.`;
  } else {
    $('aiInsight').textContent = 'No open EONET events loaded. Check network/API access and refresh.';
  }
}

function queryCyclones(layer) {
  try {
    const q = layer.createQuery ? layer.createQuery() : null;
    if (!q) throw new Error('Layer query not supported');
    q.where = '1=1'; q.outFields = ['*']; q.returnGeometry = false; q.num = 10;
    layer.queryFeatures(q).then(fs => {
      const features = fs.features || [];
      $('cycloneCount').textContent = features.length ? `${features.length} features` : 'No active features';
      if (features.length) {
        $('cycloneList').innerHTML = features.slice(0,5).map((g, idx) => {
          const a = g.attributes || {};
          const title = a.STORMNAME || a.STORM_NAME || a.NAME || a.TC_NAME || a.BASIN || `Cyclone feature ${idx + 1}`;
          const sub = Object.entries(a).slice(0,4).map(([k,v]) => `${k}: ${v}`).join(' · ');
          return item(trunc(title, 38), trunc(sub, 98), 'LIVE');
        }).join('');
      } else {
        $('cycloneList').innerHTML = item('No active tropical cyclone features returned', 'The layer is connected, but there may be no active NHC/JTWC storms or no queryable rows at this moment.', 'LIVE');
      }
    }).catch(() => {
      $('cycloneCount').textContent = 'Layer connected';
      $('cycloneList').innerHTML = item('Cyclone layer is visible on globe', 'Querying attributes is blocked, but live tracks will render when active.', 'MAP');
    });
  } catch(e) {
    $('cycloneCount').textContent = 'Layer connected';
  }
}

function refreshAll() {
  loadWeatherPoints();
  loadEarthquakes();
  loadEonetEvents();
  if (layers.cyclones) queryCyclones(layers.cyclones);
  setUpdated();
}

$('refreshBtn').addEventListener('click', refreshAll);
startClock();
renderConnections();
initMap();
setInterval(refreshAll, 10 * 60 * 1000);
