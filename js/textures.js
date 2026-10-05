import * as THREE from 'three';

// Procedural textures: everything is generated on canvases at startup, no image assets needed.

export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTexture(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// ---------- tileable value noise ----------
function makeNoise(seed, period) {
  const r = rng(seed);
  const P = period;
  const grid = new Float32Array(P * P);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = sm(x - xi), yf = sm(y - yi);
    const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P;
    const x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
    const a = grid[y0 * P + x0], b = grid[y0 * P + x1], c = grid[y1 * P + x0], d = grid[y1 * P + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/** Fill a Float32Array (size*size) with tileable fbm in [0,1]. */
export function fbmField(size, { seed = 1, base = 4, octaves = 5, gain = 0.5 } = {}) {
  const out = new Float32Array(size * size);
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeNoise(seed + o * 101, base << o));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 1, norm = 0;
      for (let o = 0; o < octaves; o++) {
        const f = (base << o) / size;
        v += layers[o](x * f, y * f) * amp;
        norm += amp;
        amp *= gain;
      }
      out[y * size + x] = v / norm;
    }
  }
  return out;
}

/** Height field -> tangent-space normal map canvas. */
export function heightToNormal(h, size, strength = 2) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function fieldToCanvas(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fn(i);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- asphalt ----------
export function asphaltSet({ size = 512, seed = 3, tone = 74, stains = 0, cracks = 6, tireMarks = 0 } = {}) {
  const r = rng(seed);
  const n = fbmField(size, { seed, base: 4, octaves: 6, gain: 0.55 });
  const grain = new Float32Array(size * size);
  for (let i = 0; i < grain.length; i++) grain[i] = r();
  // height: fine aggregate + low frequency undulation
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = grain[i] * 0.6 + n[i] * 0.4;

  const color = fieldToCanvas(size, (i) => {
    const g = grain[i];
    let v = tone + (n[i] - 0.5) * 34 + (g - 0.5) * 22;
    if (g > 0.985) v += 40;          // light stones
    if (g < 0.02) v -= 25;           // dark pits
    return [v, v + 1, v + 4];
  });
  const rough = fieldToCanvas(size, (i) => {
    const v = 215 + (grain[i] - 0.5) * 50 - (n[i] - 0.5) * 30;
    return [v, v, v];
  });

  const ctx = color.getContext('2d');
  const rctx = rough.getContext('2d');
  // oil / water stains (darker and smoother)
  for (let i = 0; i < stains; i++) {
    const x = r() * size, y = r() * size, rad = 10 + r() * 40;
    for (const [c2, col] of [[ctx, 'rgba(10,10,14,0.22)'], [rctx, 'rgba(60,60,60,0.5)']]) {
      const g = c2.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c2.fillStyle = g;
      c2.beginPath(); c2.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); c2.fill();
    }
  }
  // tire marks
  for (let i = 0; i < tireMarks; i++) {
    ctx.strokeStyle = `rgba(15,15,18,${0.08 + r() * 0.12})`;
    ctx.lineWidth = 3 + r() * 5;
    ctx.beginPath();
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, L = 60 + r() * 160, bend = (r() - 0.5) * 120;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * L / 2 + bend, y + Math.sin(a) * L / 2 - bend, x + Math.cos(a) * L, y + Math.sin(a) * L);
    ctx.stroke();
  }
  // cracks: random walks, sealed with darker tar
  for (let i = 0; i < cracks; i++) {
    let x = r() * size, y = r() * size, a = r() * Math.PI * 2;
    ctx.strokeStyle = `rgba(25,25,28,${0.18 + r() * 0.17})`;
    ctx.lineWidth = 0.7 + r() * 0.9;
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 20 + r() * 40;
    for (let s = 0; s < steps; s++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 4; y += Math.sin(a) * 4;
      ctx.lineTo(x, y);
      const ix = ((Math.floor(x) % size) + size) % size, iy = ((Math.floor(y) % size) + size) % size;
      for (let k = -1; k <= 1; k++) h[iy * size + ((ix + k + size) % size)] -= 0.5;
    }
    ctx.stroke();
  }

  return {
    map: toTexture(color),
    roughnessMap: toTexture(rough, { srgb: false }),
    normalMap: toTexture(heightToNormal(h, size, 1.6), { srgb: false }),
  };
}

// ---------- ground grass/dirt ----------
export function grassGroundSet({ size = 512, seed = 7 } = {}) {
  const r = rng(seed);
  const n = fbmField(size, { seed, base: 3, octaves: 6, gain: 0.55 });
  const d = fbmField(size, { seed: seed + 50, base: 2, octaves: 4, gain: 0.5 });
  const grain = new Float32Array(size * size).map(() => r());
  const color = fieldToCanvas(size, (i) => {
    const dirt = Math.max(0, Math.min(1, (d[i] - 0.58) * 6));
    const g = grain[i] - 0.5;
    const gr = [62 + n[i] * 40 + g * 30, 98 + n[i] * 50 + g * 36, 38 + n[i] * 20 + g * 20];
    const dr = [118 + g * 30, 98 + g * 26, 70 + g * 20];
    return gr.map((v, k) => v * (1 - dirt) + dr[k] * dirt);
  });
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = grain[i] * 0.5 + n[i] * 0.5;
  return { map: toTexture(color), normalMap: toTexture(heightToNormal(h, size, 2.5), { srgb: false }) };
}

// ---------- sidewalk pavers ----------
export function paversSet({ size = 512, tiles = 4, seed = 11 } = {}) {
  const r = rng(seed);
  const n = fbmField(size, { seed, base: 8, octaves: 4 });
  const ts = size / tiles;
  const tileTone = [];
  for (let i = 0; i < tiles * tiles; i++) tileTone.push((r() - 0.5) * 18);
  const h = new Float32Array(size * size);
  const color = fieldToCanvas(size, (i) => {
    const x = i % size, y = (i / size) | 0;
    const lx = x % ts, ly = y % ts;
    const groove = lx < 3 || ly < 3;
    const tone = tileTone[Math.floor(y / ts) * tiles + Math.floor(x / ts)];
    h[i] = groove ? 0 : 0.6 + n[i] * 0.4;
    const v = groove ? 95 : 168 + tone + (n[i] - 0.5) * 30;
    return [v, v - 2, v - 6];
  });
  return { map: toTexture(color), normalMap: toTexture(heightToNormal(h, size, 3), { srgb: false }) };
}

// ---------- building facades ----------
const FACADES = [
  { wall: [222, 208, 180], stone: true, shutter: [236, 236, 230] },   // Jerusalem stone
  { wall: [238, 234, 226], stone: false, shutter: [210, 214, 218] },  // white plaster
  { wall: [226, 196, 170], stone: false, shutter: [240, 240, 236] },  // peach
  { wall: [206, 200, 188], stone: true, shutter: [190, 196, 200] },   // grey stone
  { wall: [214, 222, 226], stone: false, shutter: [245, 245, 245] },  // light blue-grey
];

/** One texture tile = one floor (3.2m) x one window bay (4m). */
export function facadeSet(variant, seed = 1) {
  const W = 256, H = 205;
  const f = FACADES[variant % FACADES.length];
  const r = rng(seed + variant * 31);
  const col = canvas(W, H), rough = canvas(W, H);
  const c = col.getContext('2d'), rc = rough.getContext('2d');
  const h = new Float32Array(256 * 256);
  const n = fbmField(64, { seed: seed + 9, base: 4, octaves: 3 });

  c.fillStyle = `rgb(${f.wall})`;
  c.fillRect(0, 0, W, H);
  rc.fillStyle = '#e0e0e0';
  rc.fillRect(0, 0, W, H);
  // stone blocks / plaster mottling
  for (let y = 0; y < H; y += f.stone ? 26 : 8) {
    for (let x = (y / 26) % 2 ? -24 : 0; x < W; x += f.stone ? 48 : 8) {
      const v = (r() - 0.5) * (f.stone ? 26 : 10);
      c.fillStyle = `rgb(${f.wall.map((k) => k + v)})`;
      c.fillRect(x + 1, y + 1, (f.stone ? 48 : 8) - 2, (f.stone ? 26 : 8) - 2);
    }
  }
  if (f.stone) {
    c.strokeStyle = 'rgba(120,105,85,0.35)';
    c.lineWidth = 2;
    for (let y = 0; y <= H; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  }
  // window
  const wx = 60, wy = 48, ww = 136, wh = 110;
  const shutterDown = r() * 0.7;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(wx - 6, wy - 6, ww + 12, wh + 14);            // frame shadow
  c.fillStyle = '#8d8a84';
  c.fillRect(wx - 6, wy + wh, ww + 12, 8);                 // sill
  const g = c.createLinearGradient(wx, wy, wx + ww, wy + wh);
  g.addColorStop(0, '#2a3a4c'); g.addColorStop(0.5, '#4f6b86'); g.addColorStop(1, '#1d2734');
  c.fillStyle = g;
  c.fillRect(wx, wy, ww, wh);
  c.fillStyle = '#d8d8d4';
  c.fillRect(wx + ww / 2 - 3, wy, 6, wh);                  // mullion
  // roller shutter (tris)
  const sh = wh * shutterDown;
  c.fillStyle = `rgb(${f.shutter})`;
  c.fillRect(wx, wy, ww, sh);
  c.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = wy; y < wy + sh; y += 5) c.fillRect(wx, y, ww, 1);
  rc.fillStyle = '#1a1a1a';
  rc.fillRect(wx, wy + sh, ww, wh - sh);
  // AC unit under some windows
  if (r() < 0.35) {
    c.fillStyle = '#e9e9e6'; c.fillRect(wx + ww - 50, wy + wh + 14, 44, 26);
    c.fillStyle = '#9a9a96'; for (let i = 0; i < 5; i++) c.fillRect(wx + ww - 46, wy + wh + 18 + i * 4, 36, 1.5);
  }
  // dirt streaks
  for (let i = 0; i < 3; i++) {
    const x = r() * W;
    const gg = c.createLinearGradient(0, wy + wh, 0, H);
    gg.addColorStop(0, 'rgba(70,60,50,0.18)'); gg.addColorStop(1, 'rgba(70,60,50,0)');
    c.fillStyle = gg; c.fillRect(x, wy + wh, 4 + r() * 6, H - wy - wh);
  }
  // height for normals: recessed windows, grooves
  const sx = 256 / W, sy = 256 / H;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const px = x / sx, py = y / sy;
      let v = 0.7 + n[((y >> 2) % 64) * 64 + ((x >> 2) % 64)] * 0.2;
      if (px > wx && px < wx + ww && py > wy && py < wy + wh) v = 0.1;
      if (f.stone && py % 26 < 2) v -= 0.3;
      h[y * 256 + x] = v;
    }
  }
  const nm = heightToNormal(h, 256, 4);
  return {
    map: toTexture(col),
    roughnessMap: toTexture(rough, { srgb: false }),
    normalMap: toTexture(nm, { srgb: false }),
  };
}

export function shopfrontTexture(text, color) {
  const c = canvas(512, 128);
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, 512, 10);
  g.fillStyle = '#fff';
  g.font = 'bold 72px Heebo, Arial';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.fillText(text, 256, 70);
  return toTexture(c, { repeat: false });
}

// ---------- misc ----------
export function softSprite(size = 128) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false });
}

export function cloudTexture(seed) {
  const S = 256;
  const c = canvas(S);
  const g = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 40; i++) {
    const x = S * 0.2 + r() * S * 0.6, y = S * 0.35 + r() * S * 0.3 * (1 - Math.abs(x / S - 0.5));
    const rad = 20 + r() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const shade = 230 + r() * 25;
    gr.addColorStop(0, `rgba(${shade},${shade},${shade + 5},0.55)`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c, { repeat: false });
}

export function treadNormal() {
  const W = 64, H = 256;
  const h = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const groove = (y % 32 < 6) || (Math.abs(x - 128 + ((y % 64) < 32 ? 30 : -30)) < 6);
    h[y * 256 + x] = groove ? 0 : 1;
  }
  return toTexture(heightToNormal(h, 256, 3), { srgb: false });
}

export function textTexture(lines, { w = 256, h = 256, bg = '#fff', fg = '#000', font = 'bold 64px Heebo, Arial', shape = 'rect', border = null } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  if (shape === 'circle') {
    ctx.fillStyle = border || bg;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 26, 0, Math.PI * 2); ctx.fill();
  } else if (shape === 'octagon') {
    const oct = (r) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        ctx[i ? 'lineTo' : 'moveTo'](w / 2 + r * Math.cos(a), h / 2 + r * Math.sin(a));
      }
      ctx.closePath();
    };
    ctx.fillStyle = '#fff'; oct(w / 2 - 2); ctx.fill();
    ctx.fillStyle = bg; oct(w / 2 - 12); ctx.fill();
  } else {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 10; ctx.strokeRect(8, 8, w - 16, h - 16); }
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  const lh = h / (lines.length + 1);
  lines.forEach((l, i) => ctx.fillText(l, w / 2, lh * (i + 1) + 4));
  return toTexture(c, { repeat: false });
}

/** Learner sign: red ל on white (as on Israeli driving-school vehicles). */
export function learnerSignTexture() {
  return textTexture(['ל'], { w: 128, h: 128, bg: '#ffffff', fg: '#d0101e', font: 'bold 110px Heebo, Arial', border: '#d0101e' });
}
