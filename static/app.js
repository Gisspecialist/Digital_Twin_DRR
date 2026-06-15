const $ = (id) => document.getElementById(id);
const fmt = (v, suffix = '', digits = 0) => (v === null || v === undefined || Number.isNaN(Number(v))) ? '--' : `${Number(v).toFixed(digits)}${suffix}`;

let view, map, markerLayer, eonetLayer, quakeLayer;
let targetGraphic;
let rotating = true;
let rotationSpeedDegPerSecond = 1.2;
let lastFrame = performance.now();
let pauseRotationUntil = 0;
let layerRegistry = {};
let stormLayerIds = [];
let dynamicLayerConfig = null;

const defaultCamera = {
  position: { longitude: -68, latitude: 16, z: 23500000 },
  tilt: 0,
  heading: 0
};

function tickClock(){
  const now = new Date();
  $('clock').textContent = now.toISOString().slice(11,19) + ' UTC';
}
setInterval(tickClock, 1000); tickClock();

function setSpark(values){
  const el = $('rainSpark'); el.innerHTML = '';
  const nums = (values || []).map(Number).filter(v => Number.isFinite(v)).slice(0, 12);
  const max = Math.max(1, ...nums);
  nums.forEach(v => {
    const i = document.createElement('i');
    i.style.height = `${Math.max(8, (v / max) * 34)}px`;
    el.appendChild(i);
  });
}

function setApiStatus(status){
  const list = $('apiStatus'); list.innerHTML = '';
  Object.entries(status || {}).forEach(([name, val]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${name.replaceAll('_',' ')}</span><b class="${val.online ? 'ok' : 'bad'}">${val.online ? 'online' : 'limited'}</b>`;
    list.appendChild(li);
  });
}

function setRisk(risk){
  const score = risk?.score ?? 0;
  $('riskBar').style.width = `${Math.min(100, Math.max(0, score))}%`;
  $('riskLevel').textContent = risk?.level || '--';
  $('riskScore').textContent = `Score ${fmt(score,'',1)}`;
  $('riskMsg').textContent = risk?.message || 'No scan yet.';
  $('riskMini').textContent = (risk?.level || '--').toUpperCase();
}

function setHazards(hazards){
  const box = $('hazardList'); box.innerHTML = '';
  const events = hazards?.nearest_nasa_eonet_events || [];
  const quakes = hazards?.nearest_usgs_earthquakes || [];
  const all = [...events.slice(0,2), ...quakes.slice(0,2)];
  if(!all.length){ box.innerHTML = '<p class="muted">No nearby events returned from live feeds.</p>'; return; }
  all.forEach(h => {
    const div = document.createElement('div'); div.className = 'hazardItem';
    div.innerHTML = `<b>${h.title}</b><small>${h.source}${h.category ? ' • ' + h.category : ''} • ${fmt(h.distance_km,' km',0)}</small>`;
    box.appendChild(div);
  });
  $('nearestEvent').textContent = events[0] ? `Nearest open event: ${events[0].title} (${fmt(events[0].distance_km,' km',0)})` : 'Nearest open event: none returned';
}

async function runScan(lat, lng, fly = true){
  $('latInput').value = Number(lat).toFixed(4);
  $('lngInput').value = Number(lng).toFixed(4);
  try{
    const res = await fetch(`/api/digital-twin?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
    if(!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    const obs = data.observations || {};
    $('tempVal').textContent = fmt(obs.temperature_c, '', 1);
    $('windVal').textContent = fmt(obs.wind_speed_kmh, '', 0);
    $('gustVal').textContent = fmt(obs.wind_gusts_kmh, '', 0);
    $('rainVal').textContent = fmt(data.risk?.rainfall_24h_mm, '', 1);
    $('riverVal').textContent = fmt(obs.river_discharge_m3s, '', 0);
    $('waveVal').textContent = fmt(obs.wave_height_m, '', 1);
    $('seaVal').textContent = fmt(obs.sea_level_height_msl_m, '', 2);
    $('aqiVal').textContent = fmt(obs.us_aqi, '', 0);
    $('rainMini').textContent = fmt(data.risk?.rainfall_24h_mm, 'mm', 0);
    $('floodMini').textContent = fmt(obs.river_discharge_m3s, 'm³/s', 0);
    setSpark(data.hourly_preview?.precipitation_mm);
    setRisk(data.risk);
    setApiStatus(data.api_status);
    setHazards(data.hazards);
    addTargetMarker(lat, lng, data.risk?.level || 'low');
    if(fly && view){
      pauseRotationUntil = performance.now() + 9000;
      view.goTo({ center:[lng,lat], zoom: 5, tilt: 54 }, { duration: 1300 }).catch(()=>{});
    }
  }catch(err){
    setApiStatus({backend:{online:false,error:String(err)}});
    $('riskMsg').textContent = 'Backend is not reachable. Start with: uvicorn app.main:app --reload';
  }
}

function addTargetMarker(lat, lng, level){
  if(!markerLayer) return;
  if(targetGraphic) markerLayer.remove(targetGraphic);
  const color = level === 'high' ? [255,82,82,0.95] : level === 'moderate' ? [255,173,47,0.95] : [32,227,139,0.95];
  targetGraphic = {
    geometry: { type: 'point', longitude: Number(lng), latitude: Number(lat) },
    symbol: { type: 'point-3d', symbolLayers: [{ type:'icon', resource:{ primitive:'circle' }, material:{ color }, size: 22, outline:{ color:[255,255,255,0.95], size:2 } }] },
    popupTemplate: { title:'Digital Twin Target', content:`Latitude: ${Number(lat).toFixed(4)}<br>Longitude: ${Number(lng).toFixed(4)}<br>Risk: ${level}` }
  };
  markerLayer.add(targetGraphic);
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

async function loadLayerConfig(){
  const fallback = { operationalLayers: [] };
  try{
    const r = await fetch('/static/layers.json', { cache:'no-store' });
    return await r.json();
  }catch(e){ return fallback; }
}

function addLayerFromConfig(cfg, constructors){
  const { FeatureLayer, GeoJSONLayer, MapImageLayer } = constructors;
  let layer = null;
  const common = { title: cfg.label, url: cfg.url, visible: cfg.visible !== false, opacity: cfg.opacity ?? 1 };
  if(cfg.type === 'feature'){
    layer = new FeatureLayer({ ...common, outFields:['*'], popupTemplate:{ title: cfg.label, content:'{*}' } });
  }else if(cfg.type === 'geojson'){
    layer = new GeoJSONLayer({ ...common, copyright:'Live public feed', renderer: buildRenderer('geojson'), popupTemplate:{ title:'{place}', content:'Magnitude: {mag}<br>Depth: {depth} km<br>Time: {time}' } });
  }else if(cfg.type === 'map-image'){
    layer = new MapImageLayer({ ...common });
  }
  if(!layer) return null;
  layer.__digitalTwinConfig = cfg;
  layerRegistry[cfg.id] = layer;
  if(cfg.group === 'hurricanes') stormLayerIds.push(cfg.id);
  map.add(layer);

  layer.when(() => {
    if(cfg.group === 'hurricanes' && layer.queryFeatureCount){
      layer.queryFeatureCount().then(count => updateStormCount()).catch(updateStormCount);
    }
    if(cfg.id === 'usgsEarthquakes' && layer.queryFeatureCount){
      layer.queryFeatureCount().then(count => $('quakeMini').textContent = count).catch(() => $('quakeMini').textContent = 'API');
    }
  }).catch(()=>{});
  return layer;
}

function updateStormCount(){
  const layers = stormLayerIds.map(id => layerRegistry[id]).filter(Boolean);
  const countable = layers.filter(l => l.queryFeatureCount);
  if(!countable.length){ $('stormCount').textContent = 'NOAA/NHC service'; $('stormsMini').textContent = 'API'; return; }
  Promise.allSettled(countable.map(l => l.queryFeatureCount())).then(results => {
    const counts = results.filter(r => r.status === 'fulfilled').map(r => r.value || 0);
    const total = counts.reduce((a,b)=>a+b, 0);
    $('stormCount').textContent = total > 0 ? `${total} live features` : 'No active live features';
    $('stormsMini').textContent = total;
  }).catch(()=>{ $('stormCount').textContent = 'NOAA/NHC service'; $('stormsMini').textContent = 'API'; });
}

function buildDynamicLayerList(){
  const box = $('dynamicLayerList');
  if(!box) return;
  box.innerHTML = '';
  Object.entries(layerRegistry).forEach(([id, layer]) => {
    const cfg = layer.__digitalTwinConfig || { label:id };
    const label = document.createElement('label');
    label.innerHTML = `<span>${cfg.label}</span><input type="checkbox" ${layer.visible ? 'checked' : ''} />`;
    const cb = label.querySelector('input');
    cb.addEventListener('change', e => layer.visible = e.target.checked);
    box.appendChild(label);
  });
}

function setLayerGroupVisible(group, visible){
  Object.values(layerRegistry).forEach(layer => {
    if(layer.__digitalTwinConfig?.group === group) layer.visible = visible;
  });
  buildDynamicLayerList();
}

function enterNaturalOrbit(){
  if(!view) return;
  pauseRotationUntil = 0;
  rotating = true;
  $('toggleRotation').checked = true;
  view.goTo({ camera: defaultCamera }, { duration: 1100 }).catch(()=>{});
}

function naturalRotationLoop(){
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if(view && rotating && !view.interacting && !view.animation && now > pauseRotationUntil){
    try{
      const cam = view.camera.clone();
      const atGlobalAltitude = cam.position.z > 12000000;
      const factor = atGlobalAltitude ? 1 : 0.28;
      cam.position.longitude = ((cam.position.longitude + rotationSpeedDegPerSecond * dt * factor + 540) % 360) - 180;
      // Keep the orbit natural: do not spin the view heading like a dashboard gimmick.
      if(atGlobalAltitude){ cam.tilt = 0; cam.heading = 0; }
      view.camera = cam;
    }catch(e){}
  }
  requestAnimationFrame(naturalRotationLoop);
}

function bootstrapArcGIS(){
  require([
    'esri/Map','esri/views/SceneView','esri/layers/GraphicsLayer','esri/layers/GeoJSONLayer','esri/layers/FeatureLayer','esri/layers/MapImageLayer','esri/Graphic','esri/widgets/Legend','esri/widgets/Expand','esri/widgets/BasemapGallery'
  ], async (Map, SceneView, GraphicsLayer, GeoJSONLayer, FeatureLayer, MapImageLayer, Graphic, Legend, Expand, BasemapGallery) => {
    dynamicLayerConfig = await loadLayerConfig();
    map = new Map({ basemap: 'satellite', ground: 'world-elevation' });
    markerLayer = new GraphicsLayer({ title:'Digital Twin Target' });
    eonetLayer = new GraphicsLayer({ title:'NASA EONET Open Events', visible: true });

    view = new SceneView({
      container: 'viewDiv', map,
      qualityProfile: 'high',
      camera: defaultCamera,
      viewingMode: 'global',
      environment: { atmosphereEnabled: true, starsEnabled: true, lighting: { directShadowsEnabled: true, date: new Date() } },
      constraints: { altitude: { min: 250000, max: 45000000 } },
      ui: { components: ['attribution'] }
    });

    (dynamicLayerConfig.operationalLayers || []).forEach(cfg => {
      const layer = addLayerFromConfig(cfg, { FeatureLayer, GeoJSONLayer, MapImageLayer });
      if(cfg.id === 'usgsEarthquakes') quakeLayer = layer;
    });

    map.add(eonetLayer); map.add(markerLayer);

    const legend = new Legend({ view });
    view.ui.add(new Expand({ view, content: legend, expanded: false, expandTooltip:'Map legend' }), 'top-right');
    view.ui.add(new Expand({ view, content: new BasemapGallery({ view }), expanded: false, expandTooltip:'Base layer gallery' }), 'top-right');

    const badge = document.createElement('div');
    badge.className = 'naturalBadge';
    badge.textContent = 'Natural Earth Rotation • live layers attached from layers.json';
    document.querySelector('.globeStage').appendChild(badge);

    view.when(() => {
      $('bootOverlay').style.opacity = 0;
      setTimeout(() => $('bootOverlay').style.display='none', 400);
      loadEventsOverlay(Graphic);
      runScan(17.25, -88.7667, false);
      buildDynamicLayerList();
      naturalRotationLoop();
    });

    view.on('click', (event) => {
      pauseRotationUntil = performance.now() + 9000;
      const p = view.toMap({x:event.x,y:event.y});
      if(p?.latitude && p?.longitude) runScan(p.latitude, p.longitude, false);
    });

    view.on('drag', () => pauseRotationUntil = performance.now() + 6000);
    view.on('mouse-wheel', () => pauseRotationUntil = performance.now() + 6000);

    $('toggleQuakes').addEventListener('change', e => { if(quakeLayer) quakeLayer.visible = e.target.checked; buildDynamicLayerList(); });
    $('toggleEvents').addEventListener('change', e => eonetLayer.visible = e.target.checked);
    $('toggleStorms').addEventListener('change', e => setLayerGroupVisible('hurricanes', e.target.checked));
    $('toggleRotation').addEventListener('change', e => { rotating = e.target.checked; pauseRotationUntil = 0; });
    $('rotationSpeed').addEventListener('input', e => { rotationSpeedDegPerSecond = Number(e.target.value) / 25; });
    $('basemapSelect').addEventListener('change', e => { map.basemap = e.target.value; });
    $('resetGlobeBtn').addEventListener('click', enterNaturalOrbit);
    $('orbitModeBtn').addEventListener('click', enterNaturalOrbit);
  });
}

async function loadEventsOverlay(GraphicClass){
  try{
    const res = await fetch('/api/events');
    const data = await res.json();
    const events = data.eonet?.events || [];
    $('eonetCount').textContent = `${events.length} open`;
    $('eventMini').textContent = events.length;
    events.slice(0,120).forEach(ev => {
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
    $('eonetCount').textContent = 'API limited';
    $('eventMini').textContent = '--';
  }
}

$('scanBtn').addEventListener('click', () => runScan(Number($('latInput').value), Number($('lngInput').value), true));
$('belizeBtn').addEventListener('click', () => runScan(17.25, -88.7667, true));
$('caribbeanBtn').addEventListener('click', () => runScan(18.2, -75.5, true));
$('pacificBtn').addEventListener('click', () => runScan(14.6, 134.5, true));

bootstrapArcGIS();
