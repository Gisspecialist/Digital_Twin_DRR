const $ = (id) => document.getElementById(id);
const fmt = (v, suffix = '', digits = 0) => (v === null || v === undefined || Number.isNaN(Number(v))) ? '--' : `${Number(v).toFixed(digits)}${suffix}`;

let view, map, markerLayer, eonetLayer, quakeLayer;
let targetGraphic;
let rotating = true;
let rotationSpeedDegPerSecond = 0.75;
let lastFrame = performance.now();
let pauseRotationUntil = 0;
let layerRegistry = {};
let stormLayerIds = [];
let sceneReady = false;

const defaultCamera = {
  position: { longitude: -70, latitude: 12, z: 25500000 },
  tilt: 0,
  heading: 0
};

function safeSet(id, value){ const el = $(id); if(el) el.textContent = value; }
function showBoot(message){ const p = document.querySelector('#bootOverlay p'); if(p) p.textContent = message; }
function hideBoot(){ const boot = $('bootOverlay'); if(!boot) return; boot.style.opacity = 0; setTimeout(() => boot.style.display = 'none', 450); }

// Never leave the app stuck behind the loading screen.
setTimeout(() => {
  if(!sceneReady){
    showBoot('The globe is taking longer than expected. Live panels are still available; check your internet connection for ArcGIS CDN/layers.');
    const loader = document.querySelector('#bootOverlay .loader'); if(loader) loader.style.display = 'none';
  }
}, 18000);

function tickClock(){ safeSet('clock', new Date().toISOString().slice(11,19) + ' UTC'); }
setInterval(tickClock, 1000); tickClock();

function setSpark(values){
  const el = $('rainSpark'); if(!el) return; el.innerHTML = '';
  const nums = (values || []).map(Number).filter(v => Number.isFinite(v)).slice(0, 12);
  const max = Math.max(1, ...nums);
  nums.forEach(v => {
    const i = document.createElement('i');
    i.style.height = `${Math.max(8, (v / max) * 34)}px`;
    el.appendChild(i);
  });
}

function setApiStatus(status){
  const list = $('apiStatus'); if(!list) return; list.innerHTML = '';
  Object.entries(status || {}).forEach(([name, val]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${name.replaceAll('_',' ')}</span><b class="${val.online ? 'ok' : 'bad'}">${val.online ? 'online' : 'limited'}</b>`;
    list.appendChild(li);
  });
}

function setRisk(risk){
  const score = risk?.score ?? 0;
  const bar = $('riskBar'); if(bar) bar.style.width = `${Math.min(100, Math.max(0, score))}%`;
  safeSet('riskLevel', risk?.level || '--');
  safeSet('riskScore', `Score ${fmt(score,'',1)}`);
  safeSet('riskMsg', risk?.message || 'No scan yet.');
  safeSet('riskMini', (risk?.level || '--').toUpperCase());
}

function setHazards(hazards){
  const box = $('hazardList'); if(!box) return; box.innerHTML = '';
  const events = hazards?.nearest_nasa_eonet_events || [];
  const quakes = hazards?.nearest_usgs_earthquakes || [];
  const all = [...events.slice(0,2), ...quakes.slice(0,2)];
  if(!all.length){ box.innerHTML = '<p class="muted">No nearby events returned from live feeds.</p>'; return; }
  all.forEach(h => {
    const div = document.createElement('div'); div.className = 'hazardItem';
    div.innerHTML = `<b>${h.title || 'Unnamed hazard'}</b><small>${h.source || 'Live feed'}${h.category ? ' • ' + h.category : ''} • ${fmt(h.distance_km,' km',0)}</small>`;
    box.appendChild(div);
  });
  safeSet('nearestEvent', events[0] ? `Nearest open event: ${events[0].title} (${fmt(events[0].distance_km,' km',0)})` : 'Nearest open event: none returned');
}

async function fetchWithTimeout(url, ms = 15000){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try{ return await fetch(url, { signal: controller.signal, cache:'no-store' }); }
  finally{ clearTimeout(t); }
}

async function runScan(lat, lng, fly = true){
  lat = Number(lat); lng = Number(lng);
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  $('latInput').value = lat.toFixed(4);
  $('lngInput').value = lng.toFixed(4);
  safeSet('riskMsg', 'Scanning live weather, flood, marine, air-quality, NASA EONET, and USGS feeds...');
  try{
    const res = await fetchWithTimeout(`/api/digital-twin?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, 18000);
    if(!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    const obs = data.observations || {};
    safeSet('tempVal', fmt(obs.temperature_c, '', 1));
    safeSet('windVal', fmt(obs.wind_speed_kmh, '', 0));
    safeSet('gustVal', fmt(obs.wind_gusts_kmh, '', 0));
    safeSet('rainVal', fmt(data.risk?.rainfall_24h_mm, '', 1));
    safeSet('riverVal', fmt(obs.river_discharge_m3s, '', 0));
    safeSet('waveVal', fmt(obs.wave_height_m, '', 1));
    safeSet('seaVal', fmt(obs.sea_level_height_msl_m, '', 2));
    safeSet('aqiVal', fmt(obs.us_aqi, '', 0));
    safeSet('rainMini', fmt(data.risk?.rainfall_24h_mm, 'mm', 0));
    safeSet('floodMini', fmt(obs.river_discharge_m3s, 'm³/s', 0));
    setSpark(data.hourly_preview?.precipitation_mm);
    setRisk(data.risk);
    setApiStatus(data.api_status);
    setHazards(data.hazards);
    addTargetMarker(lat, lng, data.risk?.level || 'low');
    if(fly && view){
      pauseRotationUntil = performance.now() + 9000;
      view.goTo({ center:[lng,lat], zoom: 5, tilt: 54 }, { duration: 1100 }).catch(()=>{});
    }
  }catch(err){
    setApiStatus({backend:{online:false,error:String(err)}});
    safeSet('riskMsg', 'The backend/API scan timed out or is unreachable. The 3D globe can still load; try again or check the server console.');
  }
}

function addTargetMarker(lat, lng, level){
  if(!markerLayer) return;
  if(targetGraphic) markerLayer.remove(targetGraphic);
  const color = level === 'high' ? [255,82,82,0.95] : level === 'moderate' ? [255,173,47,0.95] : [32,227,139,0.95];
  targetGraphic = {
    geometry: { type: 'point', longitude: Number(lng), latitude: Number(lat) },
    symbol: { type: 'point-3d', symbolLayers: [{ type:'icon', resource:{ primitive:'circle' }, material:{ color }, size: 20, outline:{ color:[255,255,255,0.95], size:2 } }] },
    popupTemplate: { title:'Digital Twin Target', content:`Latitude: ${Number(lat).toFixed(4)}<br>Longitude: ${Number(lng).toFixed(4)}<br>Risk: ${level}` }
  };
  markerLayer.add(targetGraphic);
}

async function loadLayerConfig(){
  try{
    const r = await fetchWithTimeout('/static/layers.json', 6000);
    return await r.json();
  }catch(e){ return { operationalLayers: [] }; }
}

function buildRenderer(type){
  if(type === 'geojson'){
    return {
      type:'simple',
      symbol:{ type:'simple-marker', style:'circle', color:[255,82,82,0.9], size:9, outline:{ color:[255,255,255,0.75], width:1 } },
      visualVariables:[{ type:'size', field:'mag', stops:[{value:4.5,size:7},{value:7,size:22}] }]
    };
  }
  return null;
}

function addLayerFromConfig(cfg, constructors){
  const { FeatureLayer, GeoJSONLayer, MapImageLayer } = constructors;
  let layer = null;
  const common = { title: cfg.label, url: cfg.url, visible: cfg.visible !== false, opacity: cfg.opacity ?? 1 };
  try{
    if(cfg.type === 'feature'){
      layer = new FeatureLayer({ ...common, outFields:['*'], popupEnabled:true });
    }else if(cfg.type === 'geojson'){
      layer = new GeoJSONLayer({ ...common, renderer: buildRenderer('geojson'), popupTemplate:{ title:'{place}', content:'Magnitude: {mag}<br>Depth: {depth} km' } });
    }else if(cfg.type === 'map-image'){
      layer = new MapImageLayer({ ...common });
    }
  }catch(e){ console.warn('Layer creation failed', cfg, e); }
  if(!layer) return null;
  layer.__digitalTwinConfig = cfg;
  layerRegistry[cfg.id] = layer;
  if(cfg.group === 'hurricanes') stormLayerIds.push(cfg.id);
  map.add(layer);
  layer.when(() => {
    if(cfg.id === 'usgsEarthquakes') safeSet('quakeMini', 'Live');
    if(cfg.group === 'hurricanes') updateStormCount();
  }).catch(() => {
    if(cfg.group === 'hurricanes') safeSet('stormCount', 'NOAA/NHC layer limited');
  });
  return layer;
}

function updateStormCount(){
  const countable = stormLayerIds.map(id => layerRegistry[id]).filter(l => l && l.queryFeatureCount);
  if(!countable.length){ safeSet('stormCount', 'NOAA/NHC service attached'); safeSet('stormsMini', 'API'); return; }
  Promise.race([
    Promise.allSettled(countable.map(l => l.queryFeatureCount())),
    new Promise(resolve => setTimeout(() => resolve('timeout'), 5000))
  ]).then(results => {
    if(results === 'timeout'){ safeSet('stormCount', 'NOAA/NHC service attached'); safeSet('stormsMini', 'API'); return; }
    const total = results.filter(r => r.status === 'fulfilled').map(r => r.value || 0).reduce((a,b)=>a+b, 0);
    safeSet('stormCount', total > 0 ? `${total} live features` : 'No active live features');
    safeSet('stormsMini', total || '0');
  }).catch(() => { safeSet('stormCount', 'NOAA/NHC service attached'); safeSet('stormsMini', 'API'); });
}

function buildDynamicLayerList(){
  const box = $('dynamicLayerList'); if(!box) return; box.innerHTML = '';
  Object.entries(layerRegistry).forEach(([id, layer]) => {
    const cfg = layer.__digitalTwinConfig || { label:id };
    const label = document.createElement('label');
    label.innerHTML = `<span>${cfg.label}</span><input type="checkbox" ${layer.visible ? 'checked' : ''} />`;
    label.querySelector('input').addEventListener('change', e => layer.visible = e.target.checked);
    box.appendChild(label);
  });
}

function setLayerGroupVisible(group, visible){
  Object.values(layerRegistry).forEach(layer => { if(layer.__digitalTwinConfig?.group === group) layer.visible = visible; });
  buildDynamicLayerList();
}

function enterNaturalOrbit(){
  if(!view) return;
  pauseRotationUntil = 0;
  rotating = true;
  $('toggleRotation').checked = true;
  view.goTo({ camera: defaultCamera }, { duration: 900 }).catch(()=>{});
}

function naturalRotationLoop(){
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if(view && rotating && !view.interacting && !view.animation && now > pauseRotationUntil){
    try{
      const cam = view.camera.clone();
      const atGlobalAltitude = cam.position.z > 9000000;
      const factor = atGlobalAltitude ? 1 : 0.22;
      cam.position.longitude = ((cam.position.longitude + rotationSpeedDegPerSecond * dt * factor + 540) % 360) - 180;
      if(atGlobalAltitude){ cam.tilt = 0; cam.heading = 0; }
      view.camera = cam;
    }catch(e){}
  }
  requestAnimationFrame(naturalRotationLoop);
}

function addAgencyLayers(constructors){
  loadLayerConfig().then(cfg => {
    (cfg.operationalLayers || []).forEach(layerCfg => {
      const layer = addLayerFromConfig(layerCfg, constructors);
      if(layerCfg.id === 'usgsEarthquakes') quakeLayer = layer;
    });
    buildDynamicLayerList();
    updateStormCount();
  });
}

async function loadEventsOverlay(GraphicClass){
  try{
    const res = await fetchWithTimeout('/api/events', 10000);
    const data = await res.json();
    const events = data.eonet?.events || [];
    safeSet('eonetCount', `${events.length} open`);
    safeSet('eventMini', events.length);
    events.slice(0,100).forEach(ev => {
      const g = ev.geometry?.[0]; if(!g?.coordinates) return;
      const [lon, lat] = g.coordinates;
      if(!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return;
      const cat = ev.categories?.[0]?.title || 'Event';
      const color = cat.toLowerCase().includes('wild') ? [255,113,43,.95] : cat.toLowerCase().includes('storm') ? [80,200,255,.95] : [255,217,79,.95];
      eonetLayer.add(new GraphicClass({
        geometry:{ type:'point', longitude:lon, latitude:lat },
        symbol:{ type:'simple-marker', style:'diamond', color, size:10, outline:{ color:[255,255,255,.75], width:1 } },
        attributes:{ title: ev.title, category: cat },
        popupTemplate:{ title:'NASA EONET Event', content:`${ev.title}<br>${cat}` }
      }));
    });
  }catch(err){
    safeSet('eonetCount', 'API limited');
    safeSet('eventMini', '--');
  }
}

function wireControls(){
  $('scanBtn')?.addEventListener('click', () => runScan(Number($('latInput').value), Number($('lngInput').value), true));
  $('belizeBtn')?.addEventListener('click', () => runScan(17.25, -88.7667, true));
  $('caribbeanBtn')?.addEventListener('click', () => runScan(18.2, -75.5, true));
  $('pacificBtn')?.addEventListener('click', () => runScan(14.6, 134.5, true));
  $('toggleQuakes')?.addEventListener('change', e => { if(quakeLayer) quakeLayer.visible = e.target.checked; buildDynamicLayerList(); });
  $('toggleEvents')?.addEventListener('change', e => { if(eonetLayer) eonetLayer.visible = e.target.checked; });
  $('toggleStorms')?.addEventListener('change', e => setLayerGroupVisible('hurricanes', e.target.checked));
  $('toggleRotation')?.addEventListener('change', e => { rotating = e.target.checked; pauseRotationUntil = 0; });
  $('rotationSpeed')?.addEventListener('input', e => { rotationSpeedDegPerSecond = Math.max(0, Number(e.target.value)) / 40; });
  $('basemapSelect')?.addEventListener('change', e => { if(map) map.basemap = e.target.value; });
  $('resetGlobeBtn')?.addEventListener('click', enterNaturalOrbit);
  $('orbitModeBtn')?.addEventListener('click', enterNaturalOrbit);
}

function bootstrapArcGIS(){
  wireControls();
  if(typeof require !== 'function'){
    showBoot('ArcGIS JavaScript API did not load. Check internet access, ad blockers, or firewall settings.');
    return;
  }
  require([
    'esri/Map','esri/views/SceneView','esri/layers/GraphicsLayer','esri/layers/GeoJSONLayer','esri/layers/FeatureLayer','esri/layers/MapImageLayer','esri/Graphic','esri/widgets/Legend','esri/widgets/Expand','esri/widgets/BasemapGallery'
  ], (Map, SceneView, GraphicsLayer, GeoJSONLayer, FeatureLayer, MapImageLayer, Graphic, Legend, Expand, BasemapGallery) => {
    map = new Map({ basemap: 'satellite', ground: 'world-elevation' });
    markerLayer = new GraphicsLayer({ title:'Digital Twin Target' });
    eonetLayer = new GraphicsLayer({ title:'NASA EONET Open Events', visible: true });
    map.add(eonetLayer); map.add(markerLayer);

    view = new SceneView({
      container: 'viewDiv', map,
      qualityProfile: 'medium',
      camera: defaultCamera,
      viewingMode: 'global',
      environment: { atmosphereEnabled: true, starsEnabled: true, lighting: { directShadowsEnabled: false, date: new Date() } },
      constraints: { altitude: { min: 250000, max: 48000000 } },
      ui: { components: ['attribution'] }
    });

    const legend = new Legend({ view });
    view.ui.add(new Expand({ view, content: legend, expanded: false, expandTooltip:'Map legend' }), 'top-right');
    view.ui.add(new Expand({ view, content: new BasemapGallery({ view }), expanded: false, expandTooltip:'Base layer gallery' }), 'top-right');

    const badge = document.createElement('div');
    badge.className = 'naturalBadge';
    badge.textContent = 'Natural Earth Rotation • live layers load progressively';
    document.querySelector('.globeStage')?.appendChild(badge);

    view.when(() => {
      sceneReady = true;
      hideBoot();
      naturalRotationLoop();
      runScan(17.25, -88.7667, false);
      addAgencyLayers({ FeatureLayer, GeoJSONLayer, MapImageLayer });
      loadEventsOverlay(Graphic);
    }).catch(err => {
      showBoot('The 3D globe could not initialize. Check internet access to js.arcgis.com and Esri services.');
      console.error(err);
    });

    view.on('click', (event) => {
      pauseRotationUntil = performance.now() + 9000;
      const p = view.toMap({x:event.x,y:event.y});
      if(Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)) runScan(p.latitude, p.longitude, false);
    });
    view.on('drag', () => pauseRotationUntil = performance.now() + 6000);
    view.on('mouse-wheel', () => pauseRotationUntil = performance.now() + 6000);
  }, (err) => {
    showBoot('ArcGIS modules failed to load. Check internet access/firewall and reload.');
    console.error(err);
  });
}

bootstrapArcGIS();
