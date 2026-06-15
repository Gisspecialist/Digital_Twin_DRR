import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, Bell, BrainCircuit, Building2, CloudRain, Database,
  Flame, Globe2, Layers, Map, Menu, Plane, Radar, RadioTower, Satellite,
  Search, Settings, ShieldAlert, ThermometerSun, Timer, Waves, Wind, Zap
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';

const regions = [
  { name: 'Southeast Asia', level: 'Very High', score: 8.7, color: '#ff4d4d' },
  { name: 'Caribbean', level: 'High', score: 7.8, color: '#ff8a2a' },
  { name: 'South Asia', level: 'High', score: 7.2, color: '#ffa72b' },
  { name: 'Central America', level: 'Medium', score: 5.6, color: '#ffd34d' },
  { name: 'West Africa', level: 'Medium', score: 4.9, color: '#f7d154' }
];

const stormTracks = [
  { name: 'Hurricane Milton', cat: 'CAT 4', wind: 137, pressure: 950, basin: 'Gulf of Mexico', severity: 'critical' },
  { name: 'Hurricane Imani', cat: 'CAT 2', wind: 110, pressure: 968, basin: 'Atlantic', severity: 'high' },
  { name: 'Tropical Storm Jelp', cat: 'CAT 1', wind: 74, pressure: 1000, basin: 'Pacific', severity: 'medium' }
];

const alerts = [
  ['Hurricane Milton', 'Gulf of Mexico', 'CRITICAL'],
  ['Severe Flooding', 'Bangladesh', 'HIGH'],
  ['Wildfire Threat', 'California', 'HIGH'],
  ['Earthquake M6.1', 'Indonesia', 'MEDIUM'],
  ['Heatwave', 'India', 'MEDIUM']
];

const trend = [
  { t: '00', rain: 28, wind: 38, risk: 41 }, { t: '04', rain: 44, wind: 52, risk: 49 },
  { t: '08', rain: 72, wind: 61, risk: 65 }, { t: '12', rain: 68, wind: 74, risk: 71 },
  { t: '16', rain: 91, wind: 88, risk: 82 }, { t: '20', rain: 64, wind: 71, risk: 66 }
];

const barData = [
  { model: 'GFS', p: 62 }, { model: 'ECMWF', p: 76 }, { model: 'ICON', p: 69 }, { model: 'UKMO', p: 73 }, { model: 'NAVGEM', p: 57 }
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useLiveMetrics() {
  const [metrics, setMetrics] = useState({ hurricanes: 3, floods: 24, wildfires: 18, quakes: 18, heatwaves: 7, landslides: 9, cities: 32, latency: 2.3 });
  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(m => ({
        ...m,
        hurricanes: Math.max(1, Math.round(3 + Math.sin(Date.now() / 22000))),
        floods: Math.max(18, Math.round(24 + Math.sin(Date.now() / 17000) * 3)),
        wildfires: Math.max(12, Math.round(18 + Math.cos(Date.now() / 21000) * 4)),
        quakes: Math.max(12, Math.round(18 + Math.sin(Date.now() / 31000) * 5)),
        latency: +(2.2 + Math.random() * 0.5).toFixed(1)
      }));
    }, 2500);
    return () => clearInterval(id);
  }, []);
  return metrics;
}

function MetricCard({ icon, title, value, sub, tone = 'cyan' }) {
  return <div className={`metric-card ${tone}`}>
    <div className="metric-icon">{icon}</div>
    <div>
      <b>{title}</b>
      <strong>{value}</strong>
      <span>{sub}</span>
    </div>
  </div>;
}

function Panel({ title, icon, children, className = '' }) {
  return <section className={`panel ${className}`}>
    <header><span>{icon}</span><h3>{title}</h3></header>
    {children}
  </section>;
}

function MiniMap({ type = 'storm' }) {
  const dots = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: 8 + Math.random() * 84,
    top: 15 + Math.random() * 70,
    size: 3 + Math.random() * 6,
    delay: Math.random() * 4,
    cls: ['storm', 'fire', 'flood', 'quake'][i % 4]
  })), []);
  return <div className={`mini-map ${type}`}>
    <div className="map-grid" />
    {dots.map((d, i) => <i key={i} className={d.cls} style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size, animationDelay: `${d.delay}s` }} />)}
    <svg viewBox="0 0 260 90" preserveAspectRatio="none" aria-hidden="true">
      <path d="M18 66 C55 28, 95 72, 132 34 S210 42, 244 18" />
      <path d="M20 44 C72 52, 91 19, 140 58 S212 79, 248 46" />
    </svg>
  </div>;
}

function GlobeCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * devicePixelRatio);
      canvas.height = Math.floor(rect.height * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      const w = canvas.width / devicePixelRatio;
      const h = canvas.height / devicePixelRatio;
      const cx = w / 2;
      const cy = h / 2 + 8;
      const r = Math.min(w, h) * 0.34;
      const t = Date.now() / 1000;
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, r * 1.5);
      bg.addColorStop(0, 'rgba(47,160,255,.4)');
      bg.addColorStop(.55, 'rgba(8,41,76,.72)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, r * 1.55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(42,196,255,.18)'; ctx.lineWidth = 1;
      for (let i = 0; i < 110; i++) {
        const a = i * 2.399 + t * .03; const rr = r * (1.08 + (i % 7) * .07);
        const x = cx + Math.cos(a) * rr; const y = cy + Math.sin(a) * rr * .55;
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.stroke();
        if (i % 4 === 0) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
      }
      const globe = ctx.createRadialGradient(cx - r*.28, cy-r*.2, r*.1, cx, cy, r);
      globe.addColorStop(0, '#38bdf8'); globe.addColorStop(.42, '#0f62a8'); globe.addColorStop(.78, '#0a263f'); globe.addColorStop(1, '#051422');
      ctx.fillStyle = globe; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(144,226,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.clip();
      ctx.globalAlpha = .72;
      ctx.fillStyle = 'rgba(25,110,65,.78)';
      for (let i = 0; i < 9; i++) {
        const a = t*.12 + i*.84;
        const x = cx + Math.sin(a) * r*.55;
        const y = cy + Math.cos(a*1.4) * r*.35;
        ctx.beginPath(); ctx.ellipse(x, y, r*(.16 + (i%3)*.04), r*(.055 + (i%2)*.03), a, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = .55; ctx.strokeStyle = 'rgba(63,220,255,.35)';
      for (let lat = -60; lat <= 60; lat += 20) {
        ctx.beginPath(); ctx.ellipse(cx, cy, r, r * Math.cos(lat*Math.PI/180), 0, 0, Math.PI*2); ctx.stroke();
      }
      for (let lon = 0; lon < 180; lon += 20) {
        ctx.beginPath(); ctx.ellipse(cx, cy, r * Math.cos((lon + t*8)*Math.PI/180), r, 0, 0, Math.PI*2); ctx.stroke();
      }
      const hazards = [
        { a: t*.35, rr: .64, c: '#ff3848', label: 'M6.1' },
        { a: t*.28+1.9, rr: .72, c: '#ff8f1f', label: 'FIRE' },
        { a: -t*.22+3.2, rr: .58, c: '#00e1ff', label: 'FLOOD' },
        { a: t*.2+4.6, rr: .78, c: '#e6f7ff', label: 'CAT4' }
      ];
      hazards.forEach((p, idx) => {
        const x = cx + Math.cos(p.a) * r * p.rr; const y = cy + Math.sin(p.a) * r * p.rr * .72;
        ctx.strokeStyle = p.c; ctx.fillStyle = p.c; ctx.globalAlpha = .88;
        for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(x, y, 9*k + (t*7+idx*5)%9, 0, Math.PI*2); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI*2); ctx.fill();
        ctx.font = '11px Inter, sans-serif'; ctx.fillText(p.label, x+12, y-8);
      });
      ctx.strokeStyle = 'rgba(52,211,153,.68)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        const start = -r + i * (2*r/25);
        for (let x = -r; x < r; x += 9) {
          const y = Math.sin((x + t*60 + i*19) / 35) * 10 + start * .35;
          if (x*x + y*y < r*r) ctx[i ? 'lineTo' : 'moveTo'](cx + x, cy + y);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(111,219,255,.34)'; ctx.lineWidth = 1;
      ['SATELLITES 18 ACTIVE','RADAR 42 SITES','SENSOR NODES 8,732','AIRCRAFT 126'].forEach((label, i) => {
        const x = 40 + i*(w-80)/3; const y = 38 + (i%2)*15;
        ctx.beginPath(); ctx.moveTo(x, y+14); ctx.lineTo(cx + (i-1.5)*r*.5, cy-r*.92); ctx.stroke();
        ctx.fillStyle = '#9feaff'; ctx.font = '12px Inter, sans-serif'; ctx.fillText(label, x, y);
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas className="globe-canvas" ref={canvasRef} aria-label="Animated global digital twin map" />;
}

function App() {
  const now = useClock();
  const metrics = useLiveMetrics();
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><Globe2 /><div><b>DIGITAL TWIN</b><span>EARTH SYSTEMS</span></div></div>
      <nav><a className="active">Dashboard</a><a>Globe</a><a>Maps</a><a>Analytics</a><a>Alerts</a><a>Reports</a></nav>
      <div className="title"><h1>Planetary Digital Twin: Weather, Hurricanes & Natural Disaster Monitoring</h1><p>Real-time geospatial intelligence for forecasting, early warning, and impact analysis</p></div>
      <div className="live-meta"><strong>{now.toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC</strong><span>{now.toLocaleDateString()}</span><em>● LIVE</em><Search size={18}/><Bell size={18}/><Settings size={18}/></div>
    </header>

    <section className="dashboard-grid">
      <aside className="left-stack">
        <Panel title="Active Hurricanes" icon={<ShieldAlert/>}>
          {stormTracks.map((s, i) => <div key={s.name} className="storm-row"><span>{i+1}</span><b>{s.name}</b><em className={s.severity}>{s.cat}</em><small>{s.wind} mph · {s.pressure} mb · {s.basin}</small></div>)}
          <MiniMap type="storm" />
        </Panel>
        <Panel title="Tropical Storm Trajectories" icon={<Layers/>}><div className="legend-lines"><i/>Observed <i/>Forecast cone <i/>Ensemble tracks</div><MiniMap type="track" /></Panel>
        <Panel title="Rainfall Intensity (24h)" icon={<CloudRain/>}><div className="big-stat">72 <span>mm</span></div><ResponsiveContainer height={70}><AreaChart data={trend}><Area dataKey="rain" stroke="#16d4ff" fill="#16d4ff55"/><Tooltip/></AreaChart></ResponsiveContainer></Panel>
        <Panel title="Flood Monitoring" icon={<Waves/>}><div className="stat-grid"><b>24<small>High Risk Areas</small></b><b>5.7M<small>People at Risk</small></b><b>1.2M km²<small>Flooded Area</small></b></div><MiniMap type="flood" /></Panel>
        <Panel title="Wildfire Risk" icon={<Flame/>}><div className="risk-line"><strong>18%</strong><span><i style={{width:'18%'}}/></span><em>High risk of global land</em></div><MiniMap type="fire" /></Panel>
        <Panel title="Seismic Alerts (7d)" icon={<Activity/>}><div className="stat-grid"><b>18<small>Events</small></b><b>M 4.5+<small>Max Mag.</small></b><b>5<small>Countries</small></b></div><MiniMap type="quake" /></Panel>
      </aside>

      <section className="center-stage">
        <GlobeCanvas />
        <div className="mode-controls"><button className="selected"><Globe2/>3D Globe</button><button><Map/>2D Map</button><button><Layers/>Layers</button><button><Menu/>Legend</button><button><Timer/>Time</button><button>◀</button><button className="now">NOW</button><button>▶</button></div>
        <div className="overlay-legend"><span><CloudRain/>Precipitation</span><span><Wind/>Wind Stream</span><span><Layers/>Cloud Cover</span><span><Zap/>Storm Track</span><span><Flame/>Wildfire Hotspots</span><span><Waves/>Flood Zones</span><span><Activity/>Seismic Events</span></div>
      </section>

      <aside className="right-stack">
        <Panel title="Disaster Alerts" icon={<AlertTriangle/>}>
          <div className="alert-summary"><strong>7</strong><span>Active Alerts</span></div>
          {alerts.map(a => <div key={a[0]} className="alert-row"><b>{a[0]}</b><span>{a[1]}</span><em className={a[2].toLowerCase()}>{a[2]}</em></div>)}
        </Panel>
        <Panel title="Weather Layers" icon={<Layers/>}><div className="layer-tabs"><span>Radar</span><span>Precipitation</span><span>Clouds</span><span>Wind</span><span>Temperature</span></div></Panel>
        <Panel title="Forecast Models" icon={<Database/>}><ResponsiveContainer height={108}><BarChart data={barData}><CartesianGrid strokeDasharray="3 3" stroke="#123"/><XAxis dataKey="model"/><YAxis hide/><Tooltip/><Bar dataKey="p" fill="url(#grad)" /></BarChart></ResponsiveContainer></Panel>
        <Panel title="AI Hazard Insights" icon={<BrainCircuit/>}><p className="ai-copy">AI confidence <b>HIGH</b>. Increased likelihood of extreme rainfall over Southeast Asia in the next 48–72 hours.</p><div className="prob"><i style={{width:'75%'}}/><span>75%</span></div></Panel>
        <Panel title="Emergency Response Status" icon={<Plane/>}><div className="stat-grid"><b>24<small>Active Missions</small></b><b>156<small>Deployments</small></b><b>8.4K<small>Personnel</small></b></div><MiniMap type="response" /></Panel>
        <Panel title="Risk Ranking by Region" icon={<BarChartIcon/>}>{regions.map(r => <div className="rank" key={r.name}><b>{r.name}</b><span>{r.level}</span><i><em style={{width:`${r.score*10}%`, background:r.color}}/></i><strong>{r.score}</strong></div>)}</Panel>
      </aside>
    </section>

    <section className="bottom-cards">
      <MetricCard icon={<ShieldAlert/>} title="Hurricanes" value={metrics.hurricanes} sub="Active · 2 Cat 3+" />
      <MetricCard icon={<Waves/>} title="Floods" value={metrics.floods} sub="High risk · 5.7M at risk" />
      <MetricCard icon={<Flame/>} title="Wildfires" value={`${metrics.wildfires}%`} sub="High risk · +12% weekly" tone="orange" />
      <MetricCard icon={<Activity/>} title="Earthquakes" value={metrics.quakes} sub="Events · M4.5+" tone="red" />
      <MetricCard icon={<ThermometerSun/>} title="Heatwaves" value="7" sub="Active · 3.2B exposed" tone="orange" />
      <MetricCard icon={<AlertTriangle/>} title="Landslides" value="9" sub="High risk · 0.6M exposed" />
      <MetricCard icon={<Building2/>} title="Urban Storm Risk" value="32" sub="Cities at risk · High" />
    </section>

    <footer className="statusbar"><span>DATA SOURCES: NOAA · NASA · ESA · EUMETSAT · JAXA · USGS · GDACS · IoT Sensor Network · Crowd Reports</span><span>System Status <b>Operational</b> · Data Latency <b>{metrics.latency} min</b> · Uptime <b>99.98%</b> · v3.2.1</span></footer>
  </main>;
}

function BarChartIcon(){ return <BarChart2Fallback/> }
function BarChart2Fallback(){ return <RadioTower/> }

createRoot(document.getElementById('root')).render(<App />);
