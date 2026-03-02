import { useState, useEffect, useRef, useCallback } from "react";

// ─── Presets ─────────────────────────────────────────────────────────────────
const DEFAULT_PALETTE = {
  name: "Apple Music Brand",
  colors: ["#F03497", "#AC1534", "#CD193A", "#E91C32", "#ED2865"],
};

const BUILT_IN_PALETTES = [
  DEFAULT_PALETTE,
  { name: "Ocean Depth",  colors: ["#0052D4", "#4364F7", "#6FB1FC", "#00C6FF", "#0072FF"] },
  { name: "Sunset",       colors: ["#FF512F", "#F09819", "#FF5E62", "#FF9966", "#FFAD5A"] },
  { name: "Aurora",       colors: ["#00C9FF", "#92FE9D", "#00B4DB", "#0083B0", "#6DD5FA"] },
  { name: "Noir",         colors: ["#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560"] },
  { name: "Candy",        colors: ["#f953c6", "#b91d73", "#ee0979", "#ff6a00", "#ee0979"] },
];

const FORMAT_PRESETS = [
  { label: "16:9 (1920×1080)",   w: 1920, h: 1080 },
  { label: "Instagram Square",   w: 1080, h: 1080 },
  { label: "Instagram Portrait", w: 1080, h: 1350 },
  { label: "Instagram Story",    w: 1080, h: 1920 },
  { label: "Twitter/X Banner",   w: 1500, h: 500  },
  { label: "Facebook Cover",     w: 820,  h: 312  },
  { label: "LinkedIn Banner",    w: 1584, h: 396  },
  { label: "YouTube Thumbnail",  w: 1280, h: 720  },
  { label: "Custom",             w: null, h: null },
];

const GRADIENT_TYPES = ["Linear", "Radial", "Conic", "Mesh", "Wave", "Spiral"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randBetween(a, b) { return a + Math.random() * (b - a); }

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
  }
  return "#" + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; } else {
    const d = max - min; s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){ case r: h=((g-b)/d+(g<b?6:0))/6; break; case g: h=((b-r)/d+2)/6; break; case b: h=((r-g)/d+4)/6; break; }
  }
  return [h*360, s*100, l*100];
}

function randomizeParams(current) {
  return {
    ...current,
    type: GRADIENT_TYPES[Math.floor(Math.random() * GRADIENT_TYPES.length)],
    angle: Math.floor(Math.random() * 360),
    stops: Math.floor(randBetween(3, 8)),
    softness: Math.floor(randBetween(20, 100)),
    meshPoints: Math.floor(randBetween(3, 8)),
    noiseIntensity: Math.floor(randBetween(0, 60)),
    waveFreq: parseFloat(randBetween(0.5, 4).toFixed(1)),
    waveAmp: Math.floor(randBetween(10, 80)),
  };
}

// ─── Core Renderer ────────────────────────────────────────────────────────────
// animT: 0..1 normalised loop time; colorDrift: 0..1 hue shift amount
function renderGradient(canvas, params, seed, animT = 0, colorDrift = 0) {
  const { w, h, type, angle, colors, stops, softness, meshPoints,
          waveFreq, waveAmp, noiseIntensity } = params;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const angleRad = (angle * Math.PI) / 180;

  // Apply optional hue drift
  const driftedColors = colors.map(hex => {
    if (colorDrift === 0) return hex;
    const [h, s, l] = hexToHsl(hex);
    return hslToHex((h + colorDrift * 60) % 360, s, l);
  });

  const colorList = Array.from({ length: stops }, (_, i) => driftedColors[i % driftedColors.length]);
  const stopPositions = colorList.map((c, i) => ({ pos: i / (colorList.length - 1 || 1), color: c }));

  if (type === "Linear") {
    const x1 = cx - Math.cos(angleRad) * w * 0.7, y1 = cy - Math.sin(angleRad) * h * 0.7;
    const x2 = cx + Math.cos(angleRad) * w * 0.7, y2 = cy + Math.sin(angleRad) * h * 0.7;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    stopPositions.forEach(({ pos, color }) => grad.addColorStop(pos, color));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  } else if (type === "Radial") {
    const r = Math.max(w, h) * (0.3 + softness / 200);
    const offsetX = (seed % 100) / 100 * w * 0.3 - w * 0.15;
    const offsetY = ((seed * 7) % 100) / 100 * h * 0.3 - h * 0.15;
    const grad = ctx.createRadialGradient(cx + offsetX, cy + offsetY, 0, cx, cy, r);
    stopPositions.forEach(({ pos, color }) => grad.addColorStop(pos, color));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  } else if (type === "Conic") {
    const grad = ctx.createConicGradient(angleRad, cx, cy);
    stopPositions.forEach(({ pos, color }) => grad.addColorStop(pos, color));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  } else if (type === "Mesh") {
    ctx.fillStyle = colorList[0]; ctx.fillRect(0, 0, w, h);
    const rng = (n) => (Math.sin(seed * 9.7 + n * 43.7) * 0.5 + 0.5);
    for (let i = 0; i < meshPoints; i++) {
      const baseX = rng(i * 3) * w, baseY = rng(i * 3 + 1) * h;
      const phase = rng(i * 3 + 5) * Math.PI * 2;
      const driftAmt = Math.max(w, h) * 0.18;
      const px = baseX + Math.sin(animT * Math.PI * 2 + phase) * driftAmt;
      const py = baseY + Math.cos(animT * Math.PI * 2 + phase * 1.3) * driftAmt * 0.7;
      const radius = (0.3 + rng(i * 3 + 2) * 0.6) * Math.max(w, h) * (softness / 100 + 0.2);
      const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
      g.addColorStop(0, colorList[i % colorList.length] + "EE");
      g.addColorStop(1, colorList[i % colorList.length] + "00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }

  } else if (type === "Wave") {
    ctx.fillStyle = colorList[0]; ctx.fillRect(0, 0, w, h);
    for (let i = 1; i < colorList.length; i++) {
      const freq = waveFreq * (i * 0.7 + 0.3);
      const amp  = (waveAmp / 100) * h * 0.4;
      const phase = (seed * 0.01 + i * 1.3) + animT * Math.PI * 2;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, colorList[i] + "00"); g.addColorStop(0.5, colorList[i] + "CC"); g.addColorStop(1, colorList[i] + "00");
      ctx.fillStyle = g; ctx.save(); ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 2) ctx.lineTo(x, cy + Math.sin((x/w)*Math.PI*2*freq+phase)*amp);
      ctx.lineTo(w, h); ctx.closePath(); ctx.globalAlpha = 0.7; ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = 1;

  } else if (type === "Spiral") {
    ctx.fillStyle = colorList[0]; ctx.fillRect(0, 0, w, h);
    const rng2 = (n) => (Math.sin(seed * 5.3 + n * 27.1) * 0.5 + 0.5);
    const turns = 2 + rng2(0) * 3, maxR = Math.max(w, h) * 0.8;
    for (let i = colorList.length - 1; i >= 1; i--) {
      const t = i / colorList.length;
      const startAngle = angleRad + t * Math.PI * 2 * turns + animT * Math.PI * 2;
      const px = cx + Math.cos(startAngle) * (t * maxR * 0.3);
      const py = cy + Math.sin(startAngle) * (t * maxR * 0.3);
      const g = ctx.createRadialGradient(px, py, 0, cx, cy, t * maxR * (softness/80+0.3));
      g.addColorStop(0, colorList[i]); g.addColorStop(1, colorList[i] + "00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  }

  // Film grain
  if (noiseIntensity > 0) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const intensity = (noiseIntensity / 100) * 120;
    const grainSeed = seed + Math.round(animT * 10000);
    const hash = (x, y, s) => {
      let n = (x * 1619 + y * 31337 + s * 6971) & 0x7fffffff;
      n = ((n >> 16) ^ n) * 0x45d9f3b; n = ((n >> 16) ^ n) * 0x45d9f3b; n = (n >> 16) ^ n;
      return (n & 0xffff) / 0xffff;
    };
    for (let i = 0; i < data.length; i += 4) {
      const pi = i / 4, x = pi % w, y = Math.floor(pi / w);
      const grain = (hash(x, y, grainSeed) * 0.7 + hash(x+1, y, grainSeed+1) * 0.3 - 0.5) * 2;
      const lum = (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114) / 255;
      const delta = grain * intensity * (0.6 + lum * 0.4);
      data[i]   = Math.min(255, Math.max(0, data[i]   + delta));
      data[i+1] = Math.min(255, Math.max(0, data[i+1] + delta));
      data[i+2] = Math.min(255, Math.max(0, data[i+2] + delta));
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step = 1, onChange, unit = "" }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#FF1A5E", cursor: "pointer" }} />
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", background: "#2a2a2a", color: "#fff", border: "1px solid #444", borderRadius: 6, padding: "6px 8px", fontSize: 13 }}>
        {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "#FF1A5E", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, marginTop: 4, borderBottom: "1px solid #333", paddingBottom: 6 }}>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange, id }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} id={id}
        style={{ accentColor: "#FF1A5E", width: 14, height: 14, cursor: "pointer" }} />
      <label htmlFor={id} style={{ fontSize: 13, color: checked ? "#fff" : "#666", cursor: "pointer" }}>{label}</label>
    </div>
  );
}

function Btn({ onClick, bg, children, style = {} }) {
  return (
    <button onClick={onClick} style={{ background: bg, color: "#fff", border: "1px solid #444", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", ...style }}>
      {children}
    </button>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function GradientGenerator() {
  const canvasRef    = useRef(null);
  const animFrameRef = useRef(null);
  const animStartRef = useRef(null);
  const chunksRef    = useRef([]);

  const [seed, setSeed] = useState(42);
  const [palettes, setPalettes] = useState([...BUILT_IN_PALETTES]);
  const [activePaletteIdx, setActivePaletteIdx] = useState(0);
  const [newPaletteName, setNewPaletteName] = useState("");

  // Format
  const [formatIdx, setFormatIdx] = useState(0);
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const [scale, setScale] = useState(1);

  // Gradient
  const [type, setType]         = useState("Mesh");
  const [angle, setAngle]       = useState(135);
  const [stops, setStops]       = useState(5);
  const [softness, setSoftness] = useState(65);
  const [meshPoints, setMeshPoints] = useState(5);
  const [waveFreq, setWaveFreq] = useState(1.5);
  const [waveAmp, setWaveAmp]   = useState(40);

  // Noise
  const [noiseOn, setNoiseOn]             = useState(false);
  const [noiseIntensity, setNoiseIntensity] = useState(30);

  // Animation
  const [animMode, setAnimMode]             = useState('still'); // 'still' | 'animated'
  const [isPlaying, setIsPlaying]           = useState(false);
  const [animDuration, setAnimDuration]     = useState(6);
  const [animSpeed, setAnimSpeed]           = useState(50);
  const [animFps, setAnimFps]               = useState(30);
  const [animLoop, setAnimLoop]             = useState(true);
  const [animMovement, setAnimMovement]     = useState(true);
  const [animColorDrift, setAnimColorDrift] = useState(true);
  const [isExporting, setIsExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const activeFormat = FORMAT_PRESETS[formatIdx];
  const outputW = (activeFormat.w ?? customW) * scale;
  const outputH = (activeFormat.h ?? customH) * scale;
  const activePalette = palettes[activePaletteIdx];

  const params = {
    w: outputW, h: outputH, type, angle,
    colors: activePalette.colors,
    stops, softness, meshPoints, waveFreq, waveAmp,
    noiseIntensity: noiseOn ? noiseIntensity : 0,
  };

  // ── Still render ─────────────────────────────────────────────────────────────
  const renderStill = useCallback(() => {
    if (!canvasRef.current) return;
    renderGradient(canvasRef.current, params, seed, 0, 0);
  }, [JSON.stringify(params), seed]);

  useEffect(() => { if (!isPlaying) renderStill(); }, [renderStill, isPlaying]);

  // ── Animation ────────────────────────────────────────────────────────────────
  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    setIsPlaying(false); animStartRef.current = null;
  }, []);

  // Capture params in a ref so the rAF closure always sees latest values
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [JSON.stringify(params)]);
  const animRef = useRef({ duration: animDuration, speed: animSpeed, loop: animLoop, movement: animMovement, colorDrift: animColorDrift });
  useEffect(() => { animRef.current = { duration: animDuration, speed: animSpeed, loop: animLoop, movement: animMovement, colorDrift: animColorDrift }; },
    [animDuration, animSpeed, animLoop, animMovement, animColorDrift]);

  const startAnimation = useCallback(() => {
    stopAnimation();
    setIsPlaying(true);
    animStartRef.current = null;
    const tick = (timestamp) => {
      if (!animStartRef.current) animStartRef.current = timestamp;
      const { duration, speed, loop, movement, colorDrift } = animRef.current;
      const elapsed = timestamp - animStartRef.current;
      const t = (elapsed / (duration * 1000)) % 1;
      const sf = speed / 50;
      renderGradient(canvasRef.current, paramsRef.current, seed, movement ? t * sf % 1 : 0, colorDrift ? t * sf % 1 : 0);
      if (!loop && elapsed >= duration * 1000) { stopAnimation(); renderGradient(canvasRef.current, paramsRef.current, seed, 0, 0); return; }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [seed, stopAnimation]);

  useEffect(() => { if (animMode !== 'animated') stopAnimation(); }, [animMode, stopAnimation]);
  useEffect(() => () => stopAnimation(), [stopAnimation]);

  // ── WebM Export ───────────────────────────────────────────────────────────────
  const exportWebM = useCallback(() => {
    if (!canvasRef.current) return;
    stopAnimation();
    setIsExporting(true); setExportProgress(0);

    const fps = animFps, totalFrames = Math.ceil(fps * animDuration), sf = animSpeed / 50;
    const exportW = activeFormat.w ?? customW, exportH = activeFormat.h ?? customH;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportW; exportCanvas.height = exportH;
    const exportParams = { ...params, w: exportW, h: exportH };

    chunksRef.current = [];
    const stream = exportCanvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `gradient-${exportW}x${exportH}-${animDuration}s.webm`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setIsExporting(false); setExportProgress(0);
    };

    recorder.start();
    let frame = 0;
    const interval = setInterval(() => {
      if (frame >= totalFrames) { clearInterval(interval); recorder.stop(); return; }
      const t = ((frame / totalFrames) * sf) % 1;
      renderGradient(exportCanvas, exportParams, seed, animMovement ? t : 0, animColorDrift ? t : 0);
      setExportProgress(Math.round((frame / totalFrames) * 100));
      frame++;
    }, 1000 / fps);
  }, [params, seed, animFps, animDuration, animSpeed, animMovement, animColorDrift, activeFormat, customW, customH, stopAnimation]);

  // ── Regenerate / Randomize ───────────────────────────────────────────────────
  const regenerate = () => { stopAnimation(); setSeed(s => s + 1); };
  const randomize  = () => {
    stopAnimation();
    const rp = randomizeParams({ type, angle, stops, softness, meshPoints, noiseIntensity, waveFreq, waveAmp });
    setType(rp.type); setAngle(rp.angle); setStops(rp.stops); setSoftness(rp.softness);
    setMeshPoints(rp.meshPoints); setNoiseIntensity(rp.noiseIntensity);
    setWaveFreq(rp.waveFreq); setWaveAmp(rp.waveAmp);
    setSeed(Math.floor(Math.random() * 999999));
  };

  // ── PNG ──────────────────────────────────────────────────────────────────────
  const downloadPng = () => {
    try {
      const off = document.createElement("canvas");
      renderGradient(off, params, seed, 0, 0);
      off.toBlob((blob) => {
        if (!blob) { alert("Could not generate image."); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = `gradient-${outputW}x${outputH}.png`; a.href = url;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    } catch (e) { alert("Download failed: " + e.message); }
  };

  // ── Palette ──────────────────────────────────────────────────────────────────
  const addColor    = () => { const u=[...palettes]; u[activePaletteIdx]={...u[activePaletteIdx],colors:[...u[activePaletteIdx].colors,"#ffffff"]}; setPalettes(u); };
  const removeColor = (i) => { if(activePalette.colors.length<=2)return; const u=[...palettes],c=[...u[activePaletteIdx].colors]; c.splice(i,1); u[activePaletteIdx]={...u[activePaletteIdx],colors:c}; setPalettes(u); };
  const updateColor = (i,hex) => { const u=[...palettes],c=[...u[activePaletteIdx].colors]; c[i]=hex; u[activePaletteIdx]={...u[activePaletteIdx],colors:c}; setPalettes(u); };
  const savePalette = () => { if(!newPaletteName.trim())return; setPalettes([...palettes,{name:newPaletteName.trim(),colors:[...activePalette.colors]}]); setActivePaletteIdx(palettes.length); setNewPaletteName(""); };
  const generatePalette = () => {
    const hue = Math.floor(Math.random()*360);
    const colors = Array.from({length:5},(_,i)=>hslToHex((hue+i*25+Math.random()*15)%360,70+Math.random()*30,35+Math.random()*30));
    const u=[...palettes]; u[activePaletteIdx]={...u[activePaletteIdx],colors}; setPalettes(u); setSeed(s=>s+1);
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:"#111", color:"#fff", fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden" }}>

      {/* Sidebar */}
      <div style={{ width:284, minWidth:284, background:"#1a1a1a", borderRight:"1px solid #2a2a2a", overflowY:"auto", padding:"16px 14px", display:"flex", flexDirection:"column", gap:2 }}>

        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:16, fontWeight:800, letterSpacing:-0.5 }}>Gradient Studio</div>
          <div style={{ fontSize:11, color:"#666" }}>Visual Generator</div>
        </div>

        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          <Btn onClick={regenerate} bg="#333" style={{ flex:1 }}>↺ Regenerate</Btn>
          <Btn onClick={randomize}  bg="#FF1A5E" style={{ flex:1 }}>⚡ Randomize</Btn>
        </div>

        {/* Palette */}
        <SectionTitle>Color Palette</SectionTitle>
        <Select value={activePaletteIdx} options={palettes.map((p,i)=>({label:p.name,value:i}))} onChange={v=>setActivePaletteIdx(Number(v))} />
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
          {activePalette.colors.map((c,i)=>(
            <div key={i} style={{ position:"relative" }}>
              <div style={{ width:32, height:32, borderRadius:6, background:c, border:"2px solid #444", cursor:"pointer", position:"relative", overflow:"hidden" }}>
                <input type="color" value={c} onChange={e=>updateColor(i,e.target.value)} style={{ position:"absolute", inset:0, opacity:0, cursor:"pointer", width:"100%", height:"100%" }} />
              </div>
              {activePalette.colors.length>2 && <div onClick={()=>removeColor(i)} style={{ position:"absolute", top:-6, right:-6, width:14, height:14, background:"#ff4444", borderRadius:"50%", fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontWeight:700 }}>✕</div>}
            </div>
          ))}
          <button onClick={addColor} style={{ width:32, height:32, borderRadius:6, background:"#2a2a2a", border:"2px dashed #555", color:"#888", fontSize:18, cursor:"pointer" }}>+</button>
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:4 }}>
          <Btn onClick={generatePalette} bg="#222" style={{ flex:1, fontSize:11, color:"#aaa" }}>🎲 Generate Palette</Btn>
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:16 }}>
          <input value={newPaletteName} onChange={e=>setNewPaletteName(e.target.value)} placeholder="Name & save palette…"
            style={{ flex:1, background:"#222", border:"1px solid #444", borderRadius:6, padding:"5px 8px", color:"#fff", fontSize:12 }} />
          <Btn onClick={savePalette} bg="#333">Save</Btn>
        </div>

        {/* Gradient Type */}
        <SectionTitle>Gradient Type</SectionTitle>
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:12 }}>
          {GRADIENT_TYPES.map(t=>(
            <button key={t} onClick={()=>setType(t)}
              style={{ padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer", background:type===t?"#FF1A5E":"#2a2a2a", color:type===t?"#fff":"#aaa", border:"none" }}>
              {t}
            </button>
          ))}
        </div>
        {(type==="Linear"||type==="Conic"||type==="Spiral") && <Slider label="Angle" value={angle} min={0} max={360} onChange={setAngle} unit="°" />}
        <Slider label="Color Stops"       value={stops}    min={2}   max={10}  onChange={setStops} />
        <Slider label="Softness / Spread" value={softness} min={10}  max={100} onChange={setSoftness} unit="%" />
        {type==="Mesh" && <Slider label="Mesh Points" value={meshPoints} min={2} max={10} onChange={setMeshPoints} />}
        {type==="Wave" && <>
          <Slider label="Wave Frequency" value={waveFreq} min={0.5} max={5} step={0.1} onChange={setWaveFreq} />
          <Slider label="Wave Amplitude" value={waveAmp}  min={5}   max={100} onChange={setWaveAmp} unit="%" />
        </>}

        {/* Noise */}
        <SectionTitle>Noise / Film Grain</SectionTitle>
        <Toggle label="Enable Film Grain" checked={noiseOn} onChange={setNoiseOn} id="noiseToggle" />
        {noiseOn && <Slider label="Grain Intensity" value={noiseIntensity} min={1} max={100} onChange={setNoiseIntensity} unit="%" />}

        {/* Animation */}
        <SectionTitle>Animation</SectionTitle>
        <div style={{ display:"flex", gap:0, marginBottom:14, borderRadius:8, overflow:"hidden", border:"1px solid #444" }}>
          <button onClick={()=>setAnimMode('still')}
            style={{ flex:1, padding:"7px 0", fontSize:12, fontWeight:700, cursor:"pointer", border:"none", background:animMode==='still'?"#FF1A5E":"#2a2a2a", color:animMode==='still'?"#fff":"#777" }}>
            Still
          </button>
          <button onClick={()=>setAnimMode('animated')}
            style={{ flex:1, padding:"7px 0", fontSize:12, fontWeight:700, cursor:"pointer", border:"none", background:animMode==='animated'?"#FF1A5E":"#2a2a2a", color:animMode==='animated'?"#fff":"#777" }}>
            Animated
          </button>
        </div>

        {animMode === 'animated' && <>
          <div style={{ background:"#222", borderRadius:8, padding:"10px 10px 4px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:"#aaa", marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>Animate</div>
            <Toggle label="Movement (blob drift)" checked={animMovement}   onChange={setAnimMovement}   id="animMov" />
            <Toggle label="Color drift (hue shift)" checked={animColorDrift} onChange={setAnimColorDrift} id="animCol" />
          </div>
          <Slider label="Duration"                    value={animDuration} min={2}  max={30} onChange={setAnimDuration} unit="s" />
          <Slider label="Speed / Movement Intensity"  value={animSpeed}    min={5}  max={100} onChange={setAnimSpeed} unit="%" />
          <Slider label="Frame Rate"                  value={animFps}      min={6}  max={60} onChange={setAnimFps} unit=" fps" />
          <Toggle label="Loop seamlessly" checked={animLoop} onChange={setAnimLoop} id="animLoop" />

          <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            {!isPlaying
              ? <Btn onClick={startAnimation} bg="#1a6e3a" style={{ flex:1 }}>▶ Preview</Btn>
              : <Btn onClick={stopAnimation}  bg="#555"    style={{ flex:1 }}>■ Stop</Btn>
            }
          </div>

          {isExporting ? (
            <div style={{ background:"#222", borderRadius:8, padding:"10px 12px", marginBottom:12 }}>
              <div style={{ fontSize:12, color:"#aaa", marginBottom:6 }}>Rendering… {exportProgress}%</div>
              <div style={{ height:6, background:"#333", borderRadius:3 }}>
                <div style={{ height:"100%", width:`${exportProgress}%`, background:"#FF1A5E", borderRadius:3, transition:"width 0.2s" }} />
              </div>
            </div>
          ) : (
            <button onClick={exportWebM}
              style={{ width:"100%", marginBottom:10, padding:"9px 0", borderRadius:8, background:"linear-gradient(135deg,#7c3aed,#4f46e5)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", border:"none" }}>
              ⬇ Export WebM
            </button>
          )}
          <div style={{ fontSize:10, color:"#555", marginBottom:12, lineHeight:1.5 }}>
            Exports at 1× resolution. {animDuration}s @ {animFps}fps ≈ {Math.round(animDuration*animFps)} frames.
          </div>
        </>}

        {/* Output Size */}
        <SectionTitle>Output Size</SectionTitle>
        <Select value={formatIdx}
          options={FORMAT_PRESETS.map((f,i)=>({label:f.label,value:i}))}
          onChange={v=>{ const i=Number(v); setFormatIdx(i); if(FORMAT_PRESETS[i].w){setCustomW(FORMAT_PRESETS[i].w);setCustomH(FORMAT_PRESETS[i].h);} }}
        />
        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          {[["Width",customW,setCustomW],["Height",customH,setCustomH]].map(([lbl,val,set])=>(
            <div key={lbl} style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"#aaa", marginBottom:4 }}>{lbl}</div>
              <input type="number" value={val} onChange={e=>{set(Number(e.target.value));setFormatIdx(FORMAT_PRESETS.length-1);}}
                style={{ width:"100%", background:"#222", border:"1px solid #444", borderRadius:6, padding:"5px 8px", color:"#fff", fontSize:13 }} />
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:6 }}>
          {[1,2,3].map(s=>(
            <button key={s} onClick={()=>setScale(s)}
              style={{ flex:1, padding:"5px 0", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer", background:scale===s?"#FF1A5E":"#2a2a2a", color:scale===s?"#fff":"#aaa", border:"none" }}>
              {s}×
            </button>
          ))}
        </div>
        <div style={{ fontSize:11, color:"#555", marginBottom:14, textAlign:"center" }}>Output: {outputW} × {outputH}px</div>

        <button onClick={downloadPng}
          style={{ width:"100%", padding:"10px 0", borderRadius:8, background:"linear-gradient(135deg,#FF1A5E,#C8003A)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", border:"none", letterSpacing:0.5 }}>
          ⬇ Download PNG
        </button>

      </div>

      {/* Canvas */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:"#0d0d0d", padding:24, overflow:"hidden" }}>
        <div style={{ position:"relative", maxWidth:"100%", maxHeight:"calc(100vh - 48px)", boxShadow:"0 20px 80px rgba(0,0,0,0.8)" }}>
          <canvas ref={canvasRef}
            style={{ display:"block", maxWidth:"100%", maxHeight:"calc(100vh - 48px)", objectFit:"contain", borderRadius:4 }} />
          {isPlaying && (
            <div style={{ position:"absolute", bottom:10, right:10, background:"rgba(0,0,0,0.6)", borderRadius:20, padding:"3px 10px", fontSize:11, color:"#FF1A5E", fontWeight:700 }}>
              ● LIVE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
