const $ = (id) => document.getElementById(id);
const fmt = (v, suffix = '', digits = 0) => (v === null || v === undefined || Number.isNaN(Number(v))) ? '--' : `${Number(v).toFixed(digits)}${suffix}`;
let view, markerLayer, eonetLayer, stormLayerGroup = [], quakeLayer;
let targetGraphic;

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
    if(fly && view) view.goTo({center:[lng,lat], zoom: 5, tilt: 55}, {duration: 1200}).catch(()=>{});
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
    symbol: { type: 'simple-marker', color, size: 18, outline: { color: [255,255,255,0.95], width: 2 } },
    popupTemplate: { title:'Digital Twin Target', content:`Latitude: ${Number(lat).toFixed(4)}<br>Longitude: ${Number(lng).toFixed(4)}<br>Risk: ${level}` }
  };
  markerLayer.add(targetGraphic);
}

function bootstrapArcGIS(){
  require([
    'esri/Map','esri/views/SceneView','esri/layers/GraphicsLayer','esri/layers/GeoJSONLayer','esri/layers/FeatureLayer','esri/Graphic','esri/widgets/Legend','esri/widgets/Expand'
  ], (Map, SceneView, GraphicsLayer, GeoJSONLayer, FeatureLayer, Graphic, Legend, Expand) => {
    const map = new Map({ basemap: 'satellite', ground: 'world-elevation' });
    markerLayer = new GraphicsLayer({ title:'Digital Twin Target' });
    eonetLayer = new GraphicsLayer({ title:'NASA EONET Open Events', visible: true });
    view = new SceneView({
      container: 'viewDiv', map,
      qualityProfile: 'high',
      camera: { position: { longitude: -66, latitude: 23, z: 17500000 }, tilt: 0, heading: 0 },
      environment: { atmosphereEnabled: true, starsEnabled: true, lighting: { directShadowsEnabled: true, date: new Date() } },
      ui: { components: ['attribution'] }
    });

    quakeLayer = new GeoJSONLayer({
      url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
      title:'USGS M4.5+ Earthquakes Today',
      copyright:'USGS',
      renderer:{ type:'simple', symbol:{ type:'simple-marker', style:'circle', color:[255,82,82,0.9], size:9, outline:{ color:[255,255,255,0.75], width:1 } }, visualVariables:[{ type:'size', field:'mag', stops:[{value:4.5,size:7},{value:7,size:22}] }] },
      popupTemplate:{ title:'{place}', content:'Magnitude: {mag}<br>Depth: {depth} km<br>Time: {time}' }
    });
    map.add(quakeLayer);

    const stormUrls = [
      'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer/0',
      'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer/1',
      'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer/2'
    ];
    stormUrls.forEach((url, idx) => {
      const layer = new FeatureLayer({
        url, title: idx === 0 ? 'NOAA/NHC Active Hurricanes' : `NOAA/NHC Tropical Cyclone Layer ${idx+1}`,
        visible: true,
        outFields:['*'],
        opacity: idx === 0 ? 0.95 : 0.75,
        popupTemplate:{ title:'Active Tropical Cyclone', content:'{*}' }
      });
      stormLayerGroup.push(layer); map.add(layer);
      layer.when(() => layer.queryFeatureCount()).then(count => {
        $('stormCount').textContent = count > 0 ? `${count} features` : 'No active features';
        $('stormsMini').textContent = count > 0 ? count : '0';
      }).catch(() => {
        $('stormCount').textContent = 'Layer unavailable';
        $('stormsMini').textContent = 'API';
      });
    });

    map.add(eonetLayer); map.add(markerLayer);

    const legend = new Legend({ view });
    const expandLegend = new Expand({ view, content: legend, expanded: false, expandTooltip:'Map legend' });
    view.ui.add(expandLegend, 'top-right');

    view.when(() => {
      $('bootOverlay').style.opacity = 0;
      setTimeout(() => $('bootOverlay').style.display='none', 400);
      loadEventsOverlay(Graphic);
      runScan(17.25, -88.7667, false);
    });

    view.on('click', (event) => {
      const p = view.toMap({x:event.x,y:event.y});
      if(p?.latitude && p?.longitude) runScan(p.latitude, p.longitude, false);
    });

    $('toggleQuakes').addEventListener('change', e => quakeLayer.visible = e.target.checked);
    $('toggleEvents').addEventListener('change', e => eonetLayer.visible = e.target.checked);
    $('toggleStorms').addEventListener('change', e => stormLayerGroup.forEach(l => l.visible = e.target.checked));
  });
}

async function loadEventsOverlay(GraphicClass){
  try{
    const res = await fetch('/api/events');
    const data = await res.json();
    const events = data.eonet?.events || [];
    $('eonetCount').textContent = `${events.length} open`;
    $('eventMini').textContent = events.length;
    events.slice(0,100).forEach(ev => {
      const g = ev.geometry?.[0]; if(!g?.coordinates) return;
      const [lon, lat] = g.coordinates;
      if(!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return;
      const cat = ev.categories?.[0]?.title || 'Event';
      let color = [255,173,47,0.9];
      if(/wildfire|fire/i.test(cat)) color = [255,82,82,0.95];
      if(/storm|severe/i.test(cat)) color = [37,201,255,0.95];
      if(/volcano/i.test(cat)) color = [167,108,255,0.95];
      const graphic = new GraphicClass({
        geometry:{ type:'point', longitude:Number(lon), latitude:Number(lat) },
        symbol:{ type:'simple-marker', style:'diamond', color, size:10, outline:{ color:[255,255,255,0.75], width:1 } },
        attributes:{ title:ev.title, category:cat },
        popupTemplate:{ title:'NASA EONET: {title}', content:`Category: {category}<br>Source: NASA EONET open events` }
      });
      eonetLayer.add(graphic);
    });
    const quakes = data.usgs?.features || [];
    $('quakeMini').textContent = quakes.length;
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
