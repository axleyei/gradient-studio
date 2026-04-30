import { useState, useEffect, useRef, useCallback } from "react";

// ─── Presets ─────────────────────────────────────────────────────────────────
const DEFAULT_PALETTE = {
  name: "Apple Music Brand",
  colors: ["#FA233B", "#C00020", "#FF4DC3", "#591962", "#FFFFFF", "#000000"],
};

const BUILT_IN_PALETTES = [
  DEFAULT_PALETTE,
  { name: "Artemis Ward",  colors: ["#C371F9", "#CCFF2B", "#000000", "#3D98FF", "#FF6C25"] },
  { name: "Ocean Depth",  colors: ["#03045E", "#023E8A", "#0077B6", "#00B4D8", "#90E0EF"] },
  { name: "Sunset",       colors: ["#D62246", "#FF3864", "#F7882F", "#FFC107", "#F77F00"] },
  { name: "Aurora",       colors: ["#10002B", "#6A0DAD", "#4FC3F7", "#00E676", "#B2FF59"] },
  { name: "Noir",         colors: ["#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560"] },
  { name: "Candy",        colors: ["#f953c6", "#b91d73", "#ee0979", "#ff6a00", "#ee0979"] },
];

const FORMAT_PRESETS = [
  { label: "16:9",               w: 1920, h: 1080 },
  { label: "9:16",               w: 1080, h: 1920 },
  { label: "Instagram Square",   w: 1080, h: 1080 },
  { label: "Instagram Portrait", w: 1080, h: 1350 },
  { label: "Instagram Story",    w: 1080, h: 1920 },
  { label: "Twitter/X Banner",   w: 1500, h: 500  },
  { label: "Facebook Cover",     w: 820,  h: 312  },
  { label: "LinkedIn Banner",    w: 1584, h: 396  },
  { label: "YouTube Thumbnail",  w: 1280, h: 720  },
  { label: "Custom",             w: null, h: null },
];

const GRADIENT_TYPES   = ["Linear", "Circle", "Mesh", "Wave", "Mosaic"];
const ANIMATABLE_TYPES = ["Mesh", "Wave"];
const MAX_COLORS = 6;

// ─── localStorage ────────────────────────────────────────────────────────────
const STORAGE_KEY = "gradient-studio-palettes-v1";
function loadUserPalettes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function persistUserPalettes(allPalettes) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allPalettes.slice(BUILT_IN_PALETTES.length))); } catch {}
}

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

// ─── Core Renderer ────────────────────────────────────────────────────────────
// animT: 0..1 normalised cycle time; colorDrift: 0..1 hue shift amount
function renderGradient(canvas, params, seed, animT = 0, colorDrift = 0) {
  const { w, h, type, angle, colors, stops, softness, meshPoints,
          waveFreq, waveAmp, noiseIntensity, grainStatic,
          animDriftFactor = 1, circleStyle = "spiral" } = params;

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
    return hslToHex((h + colorDrift * 20) % 360, s, l);
  });

  // Spread stops evenly across the full palette so stops=2 always uses first+last,
  // stops=3 uses first/middle/last, etc. — rather than just picking adjacent colors.
  const colorList = Array.from({ length: stops }, (_, i) => {
    const t = stops === 1 ? 0 : i / (stops - 1);
    return driftedColors[Math.round(t * (driftedColors.length - 1))];
  });
  const stopPositions = colorList.map((c, i) => ({ pos: i / (colorList.length - 1 || 1), color: c }));

  if (type === "Linear") {
    const x1 = cx - Math.cos(angleRad) * w * 0.7, y1 = cy - Math.sin(angleRad) * h * 0.7;
    const x2 = cx + Math.cos(angleRad) * w * 0.7, y2 = cy + Math.sin(angleRad) * h * 0.7;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    stopPositions.forEach(({ pos, color }) => grad.addColorStop(pos, color));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  } else if (type === "Circle") {
    if (circleStyle === "radial") {
      const r = Math.max(w, h) * (0.3 + softness / 200);
      const offsetX = (seed % 100) / 100 * w * 0.3 - w * 0.15;
      const offsetY = ((seed * 7) % 100) / 100 * h * 0.3 - h * 0.15;
      const grad = ctx.createRadialGradient(cx + offsetX, cy + offsetY, 0, cx, cy, r);
      stopPositions.forEach(({ pos, color }) => grad.addColorStop(pos, color));
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    } else {
      // Spiral
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

  } else if (type === "Mesh") {
    ctx.fillStyle = colorList[0]; ctx.fillRect(0, 0, w, h);
    const rng = (n) => (Math.sin(seed * 9.7 + n * 43.7) * 0.5 + 0.5);
    // A small 2nd harmonic perturbs the elliptical path for more organic motion.
    for (let i = 0; i < meshPoints; i++) {
      const baseX = rng(i * 3) * w, baseY = rng(i * 3 + 1) * h;
      const phase = rng(i * 3 + 5) * Math.PI * 2;
      const driftAmt = Math.max(w, h) * 0.18 * Math.min(2.5, animDriftFactor);
      const p1 = animT * Math.PI * 2;
      const p2 = animT * Math.PI * 4;
      const px = baseX + (Math.sin(p1 + phase) * 0.85 + Math.sin(p2 + phase * 0.7) * 0.15) * driftAmt;
      const py = baseY + (Math.cos(p1 + phase * 1.3) * 0.85 + Math.cos(p2 + phase * 1.9) * 0.15) * driftAmt * 0.7;
      const radius = (0.3 + rng(i * 3 + 2) * 0.6) * Math.max(w, h) * (softness / 100 + 0.2);
      const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
      g.addColorStop(0, colorList[i % colorList.length] + "EE");
      g.addColorStop(1, colorList[i % colorList.length] + "00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }

  } else if (type === "Mosaic") {
    const { mosaicCols = 8, mosaicRows = 6, mosaicGap = 2,
            mosaicCellAngle = 45, mosaicCellOpacity = 0.5, mosaicBlend = 0.3 } = params;

    // Sample a blended colour from stopPositions at normalised position t (0–1).
    // Uses linear RGB interpolation between the two bracketing stops, matching
    // what the browser does inside createLinearGradient.
    const sampleStops = (t) => {
      const clamped = Math.max(0, Math.min(1, t));
      if (stopPositions.length === 1) return stopPositions[0].color;
      let lo = stopPositions[0], hi = stopPositions[stopPositions.length - 1];
      for (let i = 0; i < stopPositions.length - 1; i++) {
        if (clamped >= stopPositions[i].pos && clamped <= stopPositions[i + 1].pos) {
          lo = stopPositions[i]; hi = stopPositions[i + 1]; break;
        }
      }
      const f = hi.pos === lo.pos ? 0 : (clamped - lo.pos) / (hi.pos - lo.pos);
      const p = hex => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
      const [r1,g1,b1] = p(lo.color), [r2,g2,b2] = p(hi.color);
      return `#${Math.round(r1+(r2-r1)*f).toString(16).padStart(2,'0')}${Math.round(g1+(g2-g1)*f).toString(16).padStart(2,'0')}${Math.round(b1+(b2-b1)*f).toString(16).padStart(2,'0')}`;
    };

    // ── Layer 1: Macro gradient (full canvas) ───────────────────────────────
    // softness maps to gradient reach: low = compressed dark end, high = spread
    const spread = 0.3 + (softness / 100) * 0.7;
    const macroLen = Math.max(w, h) * spread;
    const mx1 = cx - Math.cos(angleRad) * macroLen, my1 = cy - Math.sin(angleRad) * macroLen;
    const mx2 = cx + Math.cos(angleRad) * macroLen, my2 = cy + Math.sin(angleRad) * macroLen;
    const macroGrad = ctx.createLinearGradient(mx1, my1, mx2, my2);
    stopPositions.forEach(({ pos, color }) => macroGrad.addColorStop(pos, color));
    ctx.fillStyle = macroGrad; ctx.fillRect(0, 0, w, h);

    // Project a canvas point onto the macro gradient axis to get its t-value
    const macroT = (px, py) => {
      const dx = mx2 - mx1, dy = my2 - my1, lenSq = dx*dx + dy*dy;
      return lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px-mx1)*dx + (py-my1)*dy) / lenSq));
    };

    // ── Layer 2: Cell overlay ───────────────────────────────────────────────
    const cellW = (w - mosaicGap * (mosaicCols - 1)) / mosaicCols;
    const cellH = (h - mosaicGap * (mosaicRows - 1)) / mosaicRows;
    const cellRad = (mosaicCellAngle * Math.PI) / 180;
    const lerp = (a, b, f) => a + (b - a) * f;

    for (let row = 0; row < mosaicRows; row++) {
      for (let col = 0; col < mosaicCols; col++) {
        const cellX = col * (cellW + mosaicGap);
        const cellY = row * (cellH + mosaicGap);
        const ccx = cellX + cellW / 2, ccy = cellY + cellH / 2;

        // Sample macro ramp at cell centre; derive dark/light tones from it.
        // Small seed-driven jitter shifts each cell's t slightly so New Seed
        // produces visibly different colour variation across the grid.
        const jitter = (Math.sin(seed * 9.7 + (row * mosaicCols + col) * 43.7) * 0.5 + 0.5 - 0.5) * 0.08;
        const t = Math.max(0, Math.min(1, macroT(ccx, ccy) + jitter));
        const darkColor  = sampleStops(Math.max(0, t - 0.18));
        const lightColor = sampleStops(Math.min(1, t + 0.35));

        // Local endpoints: cell-sized gradient anchored to cell centre
        const halfDiag = Math.sqrt(cellW * cellW + cellH * cellH) / 2;
        const lx1 = ccx - Math.cos(cellRad) * halfDiag, ly1 = ccy - Math.sin(cellRad) * halfDiag;
        const lx2 = ccx + Math.cos(cellRad) * halfDiag, ly2 = ccy + Math.sin(cellRad) * halfDiag;

        // Blend toward global (macro-scale) endpoints → seamless at blend = 1
        const x1 = lerp(lx1, mx1, mosaicBlend), y1 = lerp(ly1, my1, mosaicBlend);
        const x2 = lerp(lx2, mx2, mosaicBlend), y2 = lerp(ly2, my2, mosaicBlend);

        ctx.save();
        ctx.beginPath(); ctx.rect(cellX, cellY, cellW, cellH); ctx.clip();

        const cellGrad = ctx.createLinearGradient(x1, y1, x2, y2);
        cellGrad.addColorStop(0, darkColor); cellGrad.addColorStop(1, lightColor);
        ctx.globalAlpha = mosaicCellOpacity;
        ctx.fillStyle = cellGrad; ctx.fillRect(cellX, cellY, cellW, cellH);

        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

  } else if (type === "Wave") {
    // waveAlpha encodes softness: full softness=100 → 0xCC opacity, softness=0 → 0x00
    const waveAlpha = Math.round((softness / 100) * 0xCC).toString(16).padStart(2, "0");
    ctx.fillStyle = colorList[0]; ctx.fillRect(0, 0, w, h);
    for (let i = 1; i < colorList.length; i++) {
      const freq = waveFreq * (i * 0.7 + 0.3);
      const amp  = (waveAmp / 100) * h * 0.4;
      const phase = (seed * 0.01 + i * 1.3) + animT * Math.PI * 2;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, colorList[i] + "00");
      g.addColorStop(0.5, colorList[i] + waveAlpha);
      g.addColorStop(1, colorList[i] + "00");
      ctx.fillStyle = g; ctx.save(); ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 2) ctx.lineTo(x, cy + Math.sin((x/w)*Math.PI*2*freq+phase)*amp);
      ctx.lineTo(w, h); ctx.closePath(); ctx.globalAlpha = 0.7; ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Film grain
  if (noiseIntensity > 0) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const intensity = (noiseIntensity / 100) * 120;
    const grainSeed = grainStatic ? seed : seed + Math.round(animT * 10000);
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

function Toggle({ label, checked, onChange, id, disabled = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} id={id}
        disabled={disabled}
        style={{ accentColor: "#FF1A5E", width: 14, height: 14, cursor: disabled ? "default" : "pointer" }} />
      <label htmlFor={id} style={{ fontSize: 13, color: disabled ? "#444" : checked ? "#fff" : "#666", cursor: disabled ? "default" : "pointer" }}>{label}</label>
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
  const [palettes, setPalettes] = useState(() => [...BUILT_IN_PALETTES, ...loadUserPalettes()]);
  const [activePaletteIdx, setActivePaletteIdx] = useState(0);
  const [newPaletteName, setNewPaletteName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // tempPalette holds unsaved edits/generated colors; null = using palettes[activePaletteIdx]
  const [tempPalette, setTempPalette] = useState(null);
  const [brandTipVisible, setBrandTipVisible] = useState(false);

  // Format
  const [formatIdx, setFormatIdx] = useState(0);
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const [scale, setScale] = useState(1);

  // Gradient
  const [type, setType]             = useState("Mesh");
  const [circleStyle, setCircleStyle] = useState("spiral"); // "radial" | "spiral"
  const [angle, setAngle]           = useState(135);
  const [stops, setStops]           = useState(5);
  const [softness, setSoftness]     = useState(65);
  const [meshPoints, setMeshPoints] = useState(5);
  const [waveFreq, setWaveFreq]     = useState(1.5);
  const [waveAmp, setWaveAmp]       = useState(40);
  const [mosaicCols, setMosaicCols]               = useState(9);
  const [mosaicRows, setMosaicRows]               = useState(5);
  const [mosaicGap, setMosaicGap]                 = useState(0);
  const [mosaicCellAngle, setMosaicCellAngle]     = useState(0);
  const [mosaicCellOpacity, setMosaicCellOpacity] = useState(0.7);
  const [mosaicBlend, setMosaicBlend]             = useState(0.2);

  // Noise
  const [noiseOn, setNoiseOn]               = useState(false);
  const [noiseIntensity, setNoiseIntensity] = useState(30);
  const [grainStatic, setGrainStatic]       = useState(false);

  // Animation
  const [animEnabled, setAnimEnabled]       = useState(false);
  const [isPlaying, setIsPlaying]           = useState(false);
  const [animDuration, setAnimDuration]     = useState(6);
  const [animSpeed, setAnimSpeed]           = useState(50);
  const [animFps, setAnimFps]               = useState(30);
  const [animLoop, setAnimLoop]             = useState(true);
  const [animMovement, setAnimMovement]     = useState(true);
  // const [animColorDrift, setAnimColorDrift] = useState(false); // Color Drift deactivated
  const [isExporting, setIsExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const activeFormat     = FORMAT_PRESETS[formatIdx];
  const outputW          = (activeFormat.w ?? customW) * scale;
  const outputH          = (activeFormat.h ?? customH) * scale;
  const activePalette    = tempPalette ?? palettes[activePaletteIdx];
  const isAnimatable     = ANIMATABLE_TYPES.includes(type);
  const isBuiltInPalette = !tempPalette && activePaletteIdx < BUILT_IN_PALETTES.length;

  const params = {
    w: outputW, h: outputH, type, angle, circleStyle,
    colors: activePalette.colors,
    stops, softness, meshPoints, waveFreq, waveAmp,
    mosaicCols, mosaicRows, mosaicGap, mosaicCellAngle, mosaicCellOpacity, mosaicBlend,
    noiseIntensity: noiseOn ? noiseIntensity : 0,
    grainStatic,
    animDriftFactor: animSpeed / 50,
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
  const animRef = useRef({ duration: animDuration, loop: animLoop, movement: animMovement });
  useEffect(() => { animRef.current = { duration: animDuration, loop: animLoop, movement: animMovement }; },
    [animDuration, animLoop, animMovement]);

  const startAnimation = useCallback(() => {
    stopAnimation();
    setIsPlaying(true);
    animStartRef.current = null;
    const tick = (timestamp) => {
      if (!animStartRef.current) animStartRef.current = timestamp;
      const { duration, loop, movement } = animRef.current;
      const elapsed = timestamp - animStartRef.current;
      const t = (elapsed / (duration * 1000)) % 1;
      // Wave is always animated; Mesh respects the movement toggle.
      const isWave = paramsRef.current.type === "Wave";
      renderGradient(canvasRef.current, paramsRef.current, seed, (movement || isWave) ? t : 0, 0);
      if (!loop && elapsed >= duration * 1000) { stopAnimation(); renderGradient(canvasRef.current, paramsRef.current, seed, 0, 0); return; }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [seed, stopAnimation]);

  // Stop animation when disabled or switching to non-animatable type
  useEffect(() => {
    if (!animEnabled || !isAnimatable) stopAnimation();
  }, [animEnabled, isAnimatable, stopAnimation]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  // ── WebM Export ───────────────────────────────────────────────────────────────
  const exportWebM = useCallback(() => {
    if (!canvasRef.current) return;
    stopAnimation();
    setIsExporting(true); setExportProgress(0);

    const fps = animFps, totalFrames = Math.ceil(fps * animDuration);
    // Honor scale in export
    const exportW = (activeFormat.w ?? customW) * scale;
    const exportH = (activeFormat.h ?? customH) * scale;
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
      const tBase = frame / totalFrames;
      const isWave = exportParams.type === "Wave";
      renderGradient(exportCanvas, exportParams, seed, (animMovement || isWave) ? tBase : 0, 0);
      setExportProgress(Math.round((frame / totalFrames) * 100));
      frame++;
    }, 1000 / fps);
  }, [params, seed, animFps, animDuration, animMovement, activeFormat, customW, customH, scale, stopAnimation]);

  // ── Regenerate / Randomize ───────────────────────────────────────────────────
  const regenerate = () => { stopAnimation(); setSeed(s => s + 1); };
  const randomize  = () => {
    stopAnimation();
    const newType = GRADIENT_TYPES[Math.floor(Math.random() * GRADIENT_TYPES.length)];
    setType(newType);
    if (newType === "Circle") setCircleStyle(Math.random() < 0.5 ? "radial" : "spiral");
    if (newType === "Mosaic") {
      setMosaicCols(Math.floor(randBetween(4, 14)));
      setMosaicRows(Math.floor(randBetween(3, 10)));
      setMosaicGap(Math.floor(randBetween(0, 8)));
      setMosaicCellAngle(Math.floor(Math.random() * 360));
      setMosaicCellOpacity(parseFloat(randBetween(0.25, 0.75).toFixed(2)));
      setMosaicBlend(parseFloat(randBetween(0, 0.8).toFixed(2)));
    }
    setAngle(Math.floor(Math.random() * 360));
    setStops(Math.floor(randBetween(3, 8)));
    setSoftness(Math.floor(randBetween(20, 100)));
    setMeshPoints(Math.floor(randBetween(3, 8)));
    setNoiseIntensity(Math.floor(randBetween(0, 60)));
    setWaveFreq(parseFloat(randBetween(0.5, 4).toFixed(1)));
    setWaveAmp(Math.floor(randBetween(10, 80)));
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
  // Enter temp mode: show unsaved colors in the dropdown as "Custom (unsaved)"
  // without touching the palettes array. Pre-fills the name input.
  const startTemp = (colors, suggestedName) => {
    setTempPalette({ colors });
    setNewPaletteName(suggestedName);
    setDeleteConfirm(false);
  };

  const addColor = () => {
    if (activePalette.colors.length >= MAX_COLORS) return;
    const newColors = [...activePalette.colors, "#ffffff"];
    if (tempPalette || isBuiltInPalette) {
      startTemp(newColors, tempPalette ? newPaletteName : `${palettes[activePaletteIdx].name} custom`);
    } else {
      const u = [...palettes];
      u[activePaletteIdx] = { ...u[activePaletteIdx], colors: newColors };
      setPalettes(u); persistUserPalettes(u);
    }
  };

  const removeColor = (i) => {
    if (activePalette.colors.length <= 2) return;
    const newColors = activePalette.colors.filter((_, ci) => ci !== i);
    if (tempPalette || isBuiltInPalette) {
      startTemp(newColors, tempPalette ? newPaletteName : `${palettes[activePaletteIdx].name} custom`);
    } else {
      const u = [...palettes];
      u[activePaletteIdx] = { ...u[activePaletteIdx], colors: newColors };
      setPalettes(u); persistUserPalettes(u);
    }
  };

  const updateColor = (i, hex) => {
    const newColors = [...activePalette.colors]; newColors[i] = hex;
    if (tempPalette || isBuiltInPalette) {
      startTemp(newColors, tempPalette ? newPaletteName : `${palettes[activePaletteIdx].name} custom`);
    } else {
      const u = [...palettes];
      u[activePaletteIdx] = { ...u[activePaletteIdx], colors: newColors };
      setPalettes(u); persistUserPalettes(u);
    }
  };

  const savePalette = () => {
    if (!newPaletteName.trim()) return;
    const colors = activePalette.colors; // uses tempPalette if active, else current
    const next = [...palettes, { name: newPaletteName.trim(), colors: [...colors] }];
    setPalettes(next); setActivePaletteIdx(next.length - 1);
    setTempPalette(null); setNewPaletteName("");
    persistUserPalettes(next);
  };

  const deletePalette = () => {
    if (isBuiltInPalette || tempPalette) return;
    const next = palettes.filter((_, i) => i !== activePaletteIdx);
    setPalettes(next);
    setActivePaletteIdx(Math.max(0, activePaletteIdx - 1));
    setDeleteConfirm(false);
    persistUserPalettes(next);
  };

  const generatePalette = () => {
    const hue = Math.floor(Math.random() * 360);
    const colors = Array.from({ length: 5 }, (_, i) =>
      hslToHex((hue + i * 25 + Math.random() * 15) % 360, 70 + Math.random() * 30, 35 + Math.random() * 30));
    startTemp(colors, "Generated");
    setSeed(s => s + 1);
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:"#111", color:"#fff", fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden" }}>

      {/* Sidebar */}
      <div style={{ width:284, minWidth:284, maxWidth:284, background:"#1a1a1a", borderRight:"1px solid #2a2a2a", overflowY:"auto", overflowX:"hidden", padding:"16px 14px", display:"flex", flexDirection:"column", gap:2 }}>

        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:16, fontWeight:800, letterSpacing:-0.5 }}>Gradient Studio</div>
          <div style={{ fontSize:11, color:"#666" }}>Visual Generator</div>
        </div>

        {/* Format */}
        <SectionTitle>Format</SectionTitle>
        <Select value={formatIdx}
          options={FORMAT_PRESETS.map((f,i)=>({label:f.label,value:i}))}
          onChange={v=>{ const i=Number(v); setFormatIdx(i); if(FORMAT_PRESETS[i].w){setCustomW(FORMAT_PRESETS[i].w);setCustomH(FORMAT_PRESETS[i].h);} }}
        />
        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          {[["Width",customW,setCustomW],["Height",customH,setCustomH]].map(([lbl,val,set])=>(
            <div key={lbl} style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, color:"#aaa", marginBottom:4 }}>{lbl}</div>
              <input type="number" value={val} onChange={e=>{set(Number(e.target.value));setFormatIdx(FORMAT_PRESETS.length-1);}}
                style={{ width:"100%", minWidth:0, boxSizing:"border-box", background:"#222", border:"1px solid #444", borderRadius:6, padding:"5px 6px", color:"#fff", fontSize:13 }} />
            </div>
          ))}
        </div>

        {/* Palette */}
        <SectionTitle>Color Palette</SectionTitle>
        <Select
          value={tempPalette ? -1 : activePaletteIdx}
          options={[
            ...palettes.map((p, i) => ({ label: p.name, value: i })),
            ...(tempPalette ? [{ label: "Custom (unsaved)", value: -1 }] : []),
          ]}
          onChange={v => {
            const n = Number(v);
            if (n < 0) return;
            setActivePaletteIdx(n); setTempPalette(null);
            setNewPaletteName(""); setDeleteConfirm(false);
          }}
        />

        {/* Swatches row — brand tooltip icon anchored top-right */}
        <div style={{ position:"relative", marginBottom:8 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, paddingRight: activePaletteIdx===0 && !tempPalette ? 22 : 0 }}>
            {activePalette.colors.map((c,i)=>(
              <div key={i} style={{ position:"relative" }}>
                <div style={{ width:32, height:32, borderRadius:6, background:c, border:"2px solid #444", cursor:"pointer", position:"relative", overflow:"hidden" }}>
                  <input type="color" value={c} onChange={e=>updateColor(i,e.target.value)} style={{ position:"absolute", inset:0, opacity:0, cursor:"pointer", width:"100%", height:"100%" }} />
                </div>
                {activePalette.colors.length>2 && <div onClick={()=>removeColor(i)} style={{ position:"absolute", top:-6, right:-6, width:14, height:14, background:"#ff4444", borderRadius:"50%", fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontWeight:700 }}>✕</div>}
              </div>
            ))}
            {activePalette.colors.length < MAX_COLORS && (
              <button onClick={addColor} style={{ width:32, height:32, borderRadius:6, background:"#2a2a2a", border:"2px dashed #555", color:"#888", fontSize:18, cursor:"pointer" }}>+</button>
            )}
          </div>
          {activePaletteIdx === 0 && !tempPalette && (
            <div style={{ position:"absolute", top:0, right:0 }}
              onMouseEnter={()=>setBrandTipVisible(true)} onMouseLeave={()=>setBrandTipVisible(false)}>
              <span style={{ fontSize:15, color:"#555", cursor:"help", userSelect:"none", lineHeight:1 }}>ⓘ</span>
              {brandTipVisible && (
                <div style={{ position:"absolute", right:0, top:"calc(100% + 6px)", zIndex:200, background:"#2a2a2a", border:"1px solid #555", borderRadius:8, padding:"10px 12px", width:196, fontSize:11, color:"#bbb", lineHeight:1.8, boxShadow:"0 4px 20px rgba(0,0,0,0.7)" }}>
                  <div style={{ fontWeight:700, color:"#fff", marginBottom:4, fontSize:12 }}>Apple Music Brand</div>
                  Red ≥50%<br/>Dark Red ≤25%<br/>Fuchsia ≤25%
                </div>
              )}
            </div>
          )}
        </div>

        <Btn onClick={generatePalette} bg="#222" style={{ width:"100%", marginBottom:8, fontSize:11, color:"#aaa" }}>🎲 Generate New Palette</Btn>

        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          <input value={newPaletteName} onChange={e=>setNewPaletteName(e.target.value)} placeholder="Name & save current palette…"
            style={{ flex:1, minWidth:0, background:"#222", border:"1px solid #444", borderRadius:6, padding:"5px 8px", color:"#fff", fontSize:12 }} />
          <Btn onClick={savePalette} bg="#333">Save</Btn>
        </div>

        {/* Delete saved palette */}
        {!isBuiltInPalette && !tempPalette && (
          deleteConfirm
            ? <div style={{ display:"flex", gap:6, marginBottom:12, alignItems:"center" }}>
                <span style={{ fontSize:11, color:"#aaa", flex:1 }}>Delete "{palettes[activePaletteIdx].name}"?</span>
                <Btn onClick={deletePalette} bg="#991b1b" style={{ fontSize:11, padding:"4px 10px" }}>Delete</Btn>
                <Btn onClick={()=>setDeleteConfirm(false)} bg="#333" style={{ fontSize:11, padding:"4px 10px" }}>Cancel</Btn>
              </div>
            : <div style={{ marginBottom:12 }}>
                <Btn onClick={()=>setDeleteConfirm(true)} bg="#2a2a2a" style={{ fontSize:11, color:"#888" }}>🗑 Delete Palette</Btn>
              </div>
        )}
        {(isBuiltInPalette || tempPalette) && <div style={{ marginBottom:12 }} />}

        {/* Gradient Type */}
        <SectionTitle>Gradient Type</SectionTitle>
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:10 }}>
          {GRADIENT_TYPES.map(t=>(
            <button key={t} onClick={()=>setType(t)}
              style={{ padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer", background:type===t?"#FF1A5E":"#2a2a2a", color:type===t?"#fff":"#aaa", border:"none" }}>
              {t}
            </button>
          ))}
        </div>

        {/* Circle sub-toggle */}
        {type === "Circle" && (
          <div style={{ display:"flex", gap:0, marginBottom:12, borderRadius:8, overflow:"hidden", border:"1px solid #444" }}>
            <button onClick={()=>setCircleStyle("radial")}
              style={{ flex:1, padding:"6px 0", fontSize:11, fontWeight:700, cursor:"pointer", border:"none", background:circleStyle==="radial"?"#FF1A5E":"#2a2a2a", color:circleStyle==="radial"?"#fff":"#777" }}>
              Radial
            </button>
            <button onClick={()=>setCircleStyle("spiral")}
              style={{ flex:1, padding:"6px 0", fontSize:11, fontWeight:700, cursor:"pointer", border:"none", background:circleStyle==="spiral"?"#FF1A5E":"#2a2a2a", color:circleStyle==="spiral"?"#fff":"#777" }}>
              Spiral
            </button>
          </div>
        )}

        {(type==="Linear" || type==="Mosaic" || (type==="Circle" && circleStyle==="spiral")) && <Slider label="Angle" value={angle} min={0} max={360} onChange={setAngle} unit="°" />}
        <Slider label="Color Stops" value={stops} min={2} max={10} onChange={setStops} />
        {type !== "Linear" && <Slider label="Softness / Spread" value={softness} min={10} max={100} onChange={setSoftness} unit="%" />}
        {type==="Mesh" && <Slider label="Mesh Points" value={meshPoints} min={2} max={10} onChange={setMeshPoints} />}
        {type==="Wave" && <>
          <Slider label="Wave Frequency" value={waveFreq} min={0.5} max={5} step={0.1} onChange={setWaveFreq} />
          <Slider label="Wave Amplitude" value={waveAmp}  min={5}   max={100} onChange={setWaveAmp} unit="%" />
        </>}
        {type==="Mosaic" && <>
          <Slider label="Columns"        value={mosaicCols}        min={2}   max={16}  onChange={setMosaicCols} />
          <Slider label="Rows"           value={mosaicRows}        min={2}   max={12}  onChange={setMosaicRows} />
          <Slider label="Gap"            value={mosaicGap}         min={0}   max={20}  onChange={setMosaicGap} unit="px" />
          <Slider label="Cell Angle"     value={mosaicCellAngle}   min={0}   max={360} onChange={setMosaicCellAngle} unit="°" />
          <Slider label="Cell Opacity"   value={mosaicCellOpacity} min={0}   max={1}   step={0.05} onChange={setMosaicCellOpacity} />
          <Slider label="Seamless Blend" value={mosaicBlend}       min={0}   max={1}   step={0.05} onChange={setMosaicBlend} />
        </>}

        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          <Btn onClick={regenerate} bg="#333" style={{ flex:1 }}>↺ New Seed</Btn>
          <Btn onClick={randomize}  bg="#FF1A5E" style={{ flex:1 }}>⚡ Randomize</Btn>
        </div>

        {/* Noise */}
        <SectionTitle>Noise / Film Grain</SectionTitle>
        <Toggle label="Enable Film Grain" checked={noiseOn} onChange={setNoiseOn} id="noiseToggle" />
        {noiseOn && <Slider label="Grain Intensity" value={noiseIntensity} min={1} max={100} onChange={setNoiseIntensity} unit="%" />}

        {/* Animation */}
        <SectionTitle>Animation</SectionTitle>
        {!isAnimatable ? (
          <div>
            <Toggle label="Enable Animation" checked={false} onChange={()=>{}} id="animEnabled" disabled />
            <div style={{ fontSize:11, color:"#555", marginBottom:12, lineHeight:1.5 }}>
              Animation not available for {type} gradients.
            </div>
          </div>
        ) : (
          <Toggle label="Enable Animation" checked={animEnabled} onChange={setAnimEnabled} id="animEnabled" />
        )}

        {animEnabled && isAnimatable && <>
          {/* Color Drift deactivated — uncomment to restore: */}
          {/* <Toggle label="Color drift (hue shift)" checked={animColorDrift} onChange={setAnimColorDrift} id="animCol" /> */}
          <Slider label="Duration"                   value={animDuration} min={2}  max={30}  onChange={setAnimDuration} unit="s" />
          <Slider label="Speed / Movement Intensity" value={animSpeed}    min={5}  max={200} onChange={setAnimSpeed} unit="%" />
          <Slider label="Frame Rate"                 value={animFps}      min={6}  max={60}  onChange={setAnimFps} unit=" fps" />
          {type === "Mesh" && <Toggle label="Blob drift" checked={animMovement} onChange={setAnimMovement} id="animMov" />}
          {noiseOn && <Toggle label="Static grain (fixed pattern)" checked={grainStatic} onChange={setGrainStatic} id="grainStatic" />}
          <Toggle label="Loop seamlessly" checked={animLoop} onChange={setAnimLoop} id="animLoop" />
          <div style={{ display:"flex", gap:6, marginBottom:4 }}>
            {!isPlaying
              ? <Btn onClick={startAnimation} bg="#1a6e3a" style={{ flex:1 }}>▶ Preview</Btn>
              : <Btn onClick={stopAnimation}  bg="#555"    style={{ flex:1 }}>■ Stop</Btn>
            }
          </div>
        </>}

        {/* Export */}
        <SectionTitle>Export</SectionTitle>

        <div style={{ display:"flex", gap:6, marginBottom:6 }}>
          {[1,2].map(s=>(
            <button key={s} onClick={()=>setScale(s)}
              style={{ flex:1, padding:"5px 0", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer", background:scale===s?"#FF1A5E":"#2a2a2a", color:scale===s?"#fff":"#aaa", border:"none" }}>
              {s}× Size
            </button>
          ))}
        </div>
        <div style={{ fontSize:11, color:"#555", marginBottom:10, textAlign:"center" }}>{outputW} × {outputH}px</div>
        <div style={{ fontSize:10, color:"#666", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Still</div>
        <button onClick={downloadPng}
          style={{ width:"100%", marginBottom:14, padding:"10px 0", borderRadius:8, background:"linear-gradient(135deg,#FF1A5E,#C8003A)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", border:"none", letterSpacing:0.5 }}>
          ⬇ Download PNG
        </button>

        {animEnabled && isAnimatable && <>
          <div style={{ fontSize:10, color:"#666", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Animation</div>
          {isExporting ? (
            <div style={{ background:"#222", borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
              <div style={{ fontSize:12, color:"#aaa", marginBottom:6 }}>Rendering… {exportProgress}%</div>
              <div style={{ height:6, background:"#333", borderRadius:3 }}>
                <div style={{ height:"100%", width:`${exportProgress}%`, background:"#FF1A5E", borderRadius:3, transition:"width 0.2s" }} />
              </div>
            </div>
          ) : (
            <button onClick={exportWebM}
              style={{ width:"100%", marginBottom:8, padding:"9px 0", borderRadius:8, background:"linear-gradient(135deg,#7c3aed,#4f46e5)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", border:"none" }}>
              ⬇ Download WebM
            </button>
          )}
          <div style={{ fontSize:10, color:"#555", marginBottom:12, lineHeight:1.5 }}>
            {animDuration}s @ {animFps}fps · {Math.round(animDuration*animFps)} frames · {outputW}×{outputH}px
          </div>
        </>}

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
