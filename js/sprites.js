"use strict";

// ================= Pixel helpers =================
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}


// ================= Hi-res canvases =================
// Sprites are drawn at RES pixels per world unit. hiCanvas returns a canvas whose
// context is pre-scaled, so drawing code keeps using world units (0.5 = one fine pixel).
const RES = 2;
function hiCanvas(uw, uh) {
  const c = makeCanvas(Math.ceil(uw * RES), Math.ceil(uh * RES));
  c.uw = uw; c.uh = uh;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.scale(RES, RES);
  queueSmooth(c);
  return [c, g];
}
const uW = c => c.uw || c.width;
const uH = c => c.uh || c.height;
function blit(g, c, x, y, w, h) { g.drawImage(c, x, y, w ?? uW(c), h ?? uH(c)); }
function raw(g, fn) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); fn(); g.restore(); }
// Like raw, but on the classic half-unit art grid (2 px per unit), whatever RES is.
function rawHalf(g, fn) { g.save(); g.setTransform(RES / 2, 0, 0, RES / 2, 0, 0); fn(); g.restore(); }

// ================= Retro pixel grid =================
// Art is authored at RES pixels per unit, then every sprite is reduced to ART pixels
// per unit (1 px per unit = 16 px tiles), so the whole game shares one chunky pixel grid.
// Each 2x2 block keeps a real palette color instead of a blend: dark ink (outlines, eyes)
// wins, otherwise the most common color.
const ART = 1;
const luma = v => (v & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + ((v >> 16) & 255) * 0.11;
function downsamplePixels(src, W, H, f) {
  const w = Math.ceil(W / f), h = Math.ceil(H / f), out = new Uint32Array(w * h);
  const blk = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    blk.length = 0;
    let soft = 0, sr = 0, sg = 0, sb = 0, sa = 0;
    for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) {
      const px = x * f + xx, py = y * f + yy;
      if (px >= W || py >= H) continue;
      const v = src[py * W + px], a = v >>> 24;
      if (a >= 128) blk.push(v);
      else if (a > 0) { soft++; sr += v & 255; sg += (v >> 8) & 255; sb += (v >> 16) & 255; sa += a; }
    }
    const n = f * f;
    if (blk.length * 2 >= n) {
      let darkest = blk[0];
      for (const v of blk) if (luma(v) < luma(darkest)) darkest = v;
      if (luma(darkest) < 48) { out[y * w + x] = darkest; continue; }
      let best = blk[0], bestN = 0;
      for (const v of blk) {
        let c = 0; for (const u of blk) if (u === v) c++;
        if (c > bestN || (c === bestN && luma(v) < luma(best))) { best = v; bestN = c; }
      }
      out[y * w + x] = best;
    } else if (blk.length + soft) {
      if (blk.length) { out[y * w + x] = blk[0]; continue; }
      if (soft * 2 < n) continue;
      out[y * w + x] = ((Math.round(sa / soft) << 24) | (Math.round(sb / soft) << 16) | (Math.round(sg / soft) << 8) | Math.round(sr / soft)) >>> 0;
    }
  }
  return [out, w, h];
}
// Darkens the silhouette's edge pixels into an outline, matching the inked look of the
// people, trees and buildings.
function outlinePixels(px, w, h) {
  const solid = i => (px[i] >>> 24) >= 128;
  const edge = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!solid(i)) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !solid(i - 1) || !solid(i + 1) || !solid(i - w) || !solid(i + w)) edge.push(i);
  }
  for (const i of edge) {
    const v = px[i];
    if (luma(v) < 48) continue;
    const r = (v & 255) * 0.3, g = ((v >> 8) & 255) * 0.3, b = ((v >> 16) & 255) * 0.3 + 12;
    px[i] = ((255 << 24) | (Math.min(255, b) << 16) | (g << 8) | r) >>> 0;
  }
}
// Shrinks a canvas in place to the ART grid. Its context keeps drawing in world units.
function pixelate(c) {
  const f = Math.round(RES / ART);
  if (f <= 1 || c.pixelated || !c.width || !c.height) return c;
  const g = c.getContext("2d", { willReadFrequently: true });
  const src = new Uint32Array(g.getImageData(0, 0, c.width, c.height).data.buffer);
  const [out, w, h] = downsamplePixels(src, c.width, c.height, f);
  if (c.outline) outlinePixels(out, w, h);
  c.width = w; c.height = h;
  const img = g.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(out);
  g.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.setTransform(ART, 0, 0, ART, 0, 0);
  c.pixelated = true;
  return c;
}
// Returns a new canvas holding src reduced to the ART grid (used for the big terrain layer).
function pixelCopy(src, into) {
  const f = Math.round(RES / ART);
  const g = src.getContext("2d", { willReadFrequently: true });
  const [out, w, h] = downsamplePixels(new Uint32Array(g.getImageData(0, 0, src.width, src.height).data.buffer), src.width, src.height, f);
  const c = into && into.width === w && into.height === h ? into : makeCanvas(w, h);
  const cg = c.getContext("2d");
  const img = cg.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(out);
  cg.putImageData(img, 0, 0);
  return c;
}
let pixelQueue = [];
function queueSmooth(c) {
  if (!pixelQueue.length) queueMicrotask(flushPixelQueue);
  pixelQueue.push(c);
}
function flushPixelQueue() {
  const q = pixelQueue; pixelQueue = [];
  for (const c of q) pixelate(c);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + ((1 << 24) | (f(0) << 16) | (f(8) << 8) | f(4)).toString(16).slice(1);
}

function tweak(hex, dh, dl) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + dh + 360) % 360, s, Math.max(5, Math.min(95, l + dl)));
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function pixelArt(rows, palette) {
  const c = makeCanvas(Math.max(...rows.map(r => r.length)), rows.length);
  const g = c.getContext("2d");
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!palette[ch]) return;
    g.fillStyle = palette[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return c;
}

const dots = (g, o, col, pts) => { g.fillStyle = col; for (const [x, y] of pts) g.fillRect(o.x + x, o.y + y, 1, 1); };

// ================= Variant faces (12x12 grid coords) =================
const SMILE = [[4,4],[4,5],[7,4],[7,5],[3,7],[4,8],[5,8],[6,8],[7,8],[8,7]];
const FACES = {
  smile: (g, o, ink) => dots(g, o, ink, SMILE),
  smileBlush: (g, o, ink) => { dots(g, o, ink, SMILE); dots(g, o, "#ff8f8f", [[2,6],[9,6]]); },
  hearts: (g, o) => dots(g, o, "#b0103f", [[3,4],[5,4],[3,5],[4,5],[5,5],[4,6],[6,4],[8,4],[6,5],[7,5],[8,5],[7,6],[4,8],[5,8],[6,8],[7,8]]),
  frown: (g, o, ink) => dots(g, o, ink, [[4,4],[4,5],[6,5],[7,5],[8,5],[3,9],[4,8],[5,8],[6,8],[7,8],[8,9]]),
  sweat: (g, o) => {
    dots(g, o, "#0b2a4a", [[4,4],[4,5],[7,4],[7,5],[4,8],[5,7],[6,8],[7,7]]);
    dots(g, o, "#dff3ff", [[10,2],[10,3],[9,3],[10,4]]);
  },
  calm: (g, o) => dots(g, o, "#123d13", [[3,5],[4,5],[7,5],[8,5],[4,8],[5,8],[6,8],[7,8]]),
  angry: (g, o) => {
    dots(g, o, "#2a0505", [[3,3],[4,4],[8,3],[7,4],[4,5],[7,5],[3,8],[4,8],[5,8],[6,8],[7,8],[8,8]]);
    dots(g, o, "#fff", [[4,9],[7,9]]);
  },
  speed: (g, o) => {
    dots(g, o, "#3a1600", [[3,3],[8,3],[4,4],[4,5],[7,4],[7,5],[3,7],[4,8],[5,8],[6,8],[7,8],[8,7]]);
    dots(g, o, "#fff", [[1,5],[1,7],[2,6]]);
  },
  upside: (g, o) => dots(g, o, "#1b1240", [[4,6],[4,7],[7,6],[7,7],[3,4],[4,3],[5,3],[6,3],[7,3],[8,4]]),
  wide: (g, o) => {
    dots(g, o, "#fff", [[3,4],[4,4],[3,5],[4,5],[7,4],[8,4],[7,5],[8,5]]);
    dots(g, o, "#0a2a24", [[4,5],[8,5],[5,8],[6,8]]);
  },
  bolt: (g, o, ink) => dots(g, o, ink, [[4,4],[4,5],[7,4],[7,5],[3,8],[4,7],[5,8],[6,7],[7,8],[8,7]]),
  toxic: (g, o) => {
    dots(g, o, "#1d3a05", [[3,3],[5,3],[4,4],[3,5],[5,5],[6,3],[8,3],[7,4],[6,5],[8,5],[3,8],[4,9],[5,8],[6,9],[7,8],[8,9]]);
    dots(g, o, "#d8ff8a", [[9,9],[9,10]]);
  },
  star: (g, o, ink) => {
    dots(g, o, "#e8a000", [[4,3],[3,4],[4,4],[5,4],[4,5],[7,3],[6,4],[7,4],[8,4],[7,5]]);
    dots(g, o, ink, [[5,7],[6,7],[5,8],[6,8]]);
  },
  fangs: (g, o) => {
    dots(g, o, "#2a0d00", [[3,3],[4,4],[8,3],[7,4],[4,5],[7,5],[3,7],[4,8],[5,8],[6,8],[7,8],[8,7]]);
    dots(g, o, "#fff", [[4,9],[7,9]]);
  },
  censored: (g, o, ink) => {
    dots(g, o, ink, [[4,4],[4,5],[7,4],[7,5]]);
    const tones = ["#f3b3a6", "#e08f80", "#c46e62", "#f7cfc4"];
    for (let cy = 6; cy <= 8; cy += 2)
      for (let cx = 2; cx <= 8; cx += 2) {
        g.fillStyle = tones[(cx + cy * 3) % 4];
        g.fillRect(o.x + cx, o.y + cy, 2, 2);
      }
  },
  shades: (g, o) => {
    dots(g, o, "#111", [[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[2,5],[3,5],[4,5],[7,5],[8,5],[9,5],[5,8],[6,8],[7,8],[8,7]]);
    dots(g, o, "#9fd4ff", [[3,5],[8,5]]);
  },
  money: (g, o, ink) => {
    dots(g, o, "#2f8a2a", [[3,4],[4,4],[3,5],[4,5],[7,4],[8,4],[7,5],[8,5]]);
    dots(g, o, "#bff0a0", [[3,4],[7,4]]);
    dots(g, o, ink, [[3,7],[4,8],[5,8],[6,8],[7,8],[8,7]]);
  },
  swirl: (g, o) => {
    dots(g, o, "#fff", [[3,4],[4,3],[5,4],[4,5],[7,4],[8,3],[9,4],[8,5]]);
    dots(g, o, "#2a0008", [[3,8],[4,7],[5,8],[6,7],[7,8],[8,7],[1,6],[2,6],[2,7]]);
  },
  neutral: (g, o) => dots(g, o, "#2c3440", [[4,5],[7,5],[4,8],[5,8],[6,8],[7,8]]),
  mog: (g, o) => {
    dots(g, o, "#fff", [[3,4],[4,4],[7,4],[8,4]]);
    dots(g, o, "#2b1d00", [[4,4],[8,4],[3,3],[4,3],[7,2],[8,2],[9,3],[5,8],[6,8],[7,8],[8,7]]);
  },
  infinity: (g, o) => dots(g, o, "#bfe4ff", [[3,4],[4,3],[5,4],[4,5],[6,4],[7,3],[8,4],[7,5],[5,8],[6,8]]),
  crazy: (g, o) => {
    dots(g, o, "#fff", [[3,3],[4,3],[3,4],[4,4],[4,7],[6,7]]);
    dots(g, o, "#1a0030", [[4,4],[7,4],[2,7],[3,8],[4,8],[5,8],[6,8],[7,8],[8,8],[9,7]]);
  },
  serene: (g, o, ink) => {
    dots(g, o, ink, [[3,5],[4,4],[5,5],[6,5],[7,4],[8,5],[5,8],[6,8]]);
    dots(g, o, "#ffd23f", [[3,-3],[4,-3],[5,-3],[6,-3],[7,-3],[8,-3],[2,-2],[9,-2]]);
    dots(g, o, "#fff09a", [[4,-3],[5,-3]]);
  },
  blank: (g, o) => dots(g, o, "#3a3010", [[4,5],[7,5]]),
  steve: (g, o) => {
    g.fillStyle = "#4a2e14";
    g.fillRect(o.x + 2, o.y - 1, 8, 4);
    g.fillRect(o.x + 1, o.y + 1, 10, 2);
    dots(g, o, "#fff", [[3,4],[8,4]]);
    dots(g, o, "#3b5bd6", [[4,4],[7,4]]);
    dots(g, o, "#b07a3a", [[5,6],[6,6]]);
    dots(g, o, "#4a2e14", [[4,8],[5,8],[6,8],[7,8]]);
  },
  pirate: (g, o, ink) => {
    dots(g, o, ink, [[7,4],[7,5],[3,7],[4,8],[5,8],[6,8],[7,8],[8,7]]);
    dots(g, o, "#111", [[3,4],[4,4],[5,4],[3,5],[4,5],[5,5],[2,3],[6,3],[7,2],[8,2],[9,2]]);
    g.fillStyle = "#111";
    g.fillRect(o.x + 1, o.y - 2, 10, 3);
    g.fillRect(o.x + 3, o.y - 4, 6, 2);
    dots(g, o, "#fff", [[5,-3],[6,-3],[5,-2]]);
    dots(g, o, "#c9a227", [[1,0],[10,0]]);
  },
};

function drawMarking(g, o, ind, color, inside) {
  const dark = shade(color, -45);
  if (ind.mark === "freckles") dots(g, o, dark, [[2,6],[3,7],[9,6],[8,7]]);
  else if (ind.mark === "blush") dots(g, o, "#ff8f8f", [[2,6],[3,6],[8,6],[9,6]]);
  else if (ind.mark === "spots") {
    const r = seeded(ind.seed + 7);
    g.fillStyle = shade(color, -30);
    for (let n = 0; n < 4; n++) {
      const x = o.x + 1 + Math.floor(r() * 10), y = o.y + 1 + Math.floor(r() * 9);
      if (inside(x, y) && inside(x + 1, y)) g.fillRect(x, y, 2, 1);
    }
  } else if (ind.mark === "band") {
    g.fillStyle = shade(color, -25);
    for (let x = 0; x < 12; x++) if (inside(o.x + x, o.y + 2) && inside(o.x + x - 1, o.y + 2) && inside(o.x + x + 1, o.y + 2)) g.fillRect(o.x + x, o.y + 2, 1, 1);
  }
}

function drawAccessory(g, o, acc) {
  switch (acc) {
    case "bow": dots(g, o, "#ff5fa2", [[7,-1],[7,0],[8,0],[10,-1],[10,0],[9,0]]); dots(g, o, "#a0124f", [[8,-1],[9,-1]]); break;
    case "sprout": dots(g, o, "#2f7a2c", [[6,-1],[6,-2]]); dots(g, o, "#6cdc4a", [[5,-3],[4,-3],[7,-3],[8,-4]]); break;
    case "tophat":
      g.fillStyle = "#111"; g.fillRect(o.x + 3, o.y - 4, 6, 4); g.fillRect(o.x + 2, o.y - 1, 8, 1);
      g.fillStyle = "#d93a3a"; g.fillRect(o.x + 3, o.y - 2, 6, 1); break;
    case "glasses": dots(g, o, "#222", [[2,4],[5,4],[6,4],[9,4],[2,5],[5,5],[6,5],[9,5],[3,3],[4,3],[7,3],[8,3],[3,6],[4,6],[7,6],[8,6]]); break;
    case "flower": dots(g, o, "#fff", [[10,0],[9,1],[11,1],[10,2]]); dots(g, o, "#ffb000", [[10,1]]); break;
    case "antenna": dots(g, o, "#222", [[6,-1],[6,-2],[6,-3]]); dots(g, o, "#ff5c7a", [[5,-5],[6,-5],[5,-4],[6,-4]]); break;
    case "bandaid": dots(g, o, "#e8c39e", [[8,6],[9,6],[8,7],[9,7]]); dots(g, o, "#b08060", [[8,6],[9,7]]); break;
    case "scarf":
      g.fillStyle = "#d93a3a"; g.fillRect(o.x + 2, o.y + 9, 8, 1); g.fillRect(o.x + 3, o.y + 10, 6, 1);
      dots(g, o, "#a01f1f", [[8,11],[8,12]]); break;
  }
}

const PAL = {
  k: "#000", y: "#ffd23f", Y: "#fff09a", o: "#c99a00", w: "#ffffff", g: "#6ee07a", G: "#2e8b3a",
  b: "#5fb4ff", B: "#2b5fa8", r: "#ff5c7a", R: "#a8203f", n: "#a8703c", m: "#7a4a22", N: "#4e2c10",
  s: "#c9c5e8", S: "#6f6a99", t: "#d8b47a", T: "#a8834d", p: "#f2c9a0", e: "#f6efe0", E: "#d9cdb4",
  c: "#29b6c6", d: "#c0392b", D: "#3b5bd6",
  V: "#833ab4", P: "#e1306c", O: "#f58529",
};

// ================= Hi-res shading =================
const BAYER = [[0, 0.5], [0.75, 0.25]];
function ramp(base) { return [shade(base, -110), shade(base, -58), shade(base, -28), base, shade(base, 26), shade(base, 64)]; }

// Lit ellipse filled pixel by pixel (light from the upper left), with a 1px outline.
function litBlob(g, cx, cy, rx, ry, pal, opts = {}) {
  raw(g, () => {
    const x0 = Math.floor((cx - rx) * RES), x1 = Math.ceil((cx + rx) * RES);
    const y0 = Math.floor((cy - ry) * RES), y1 = Math.ceil((cy + ry) * RES);
    const inn = (px, py) => { const nx = ((px + 0.5) / RES - cx) / rx, ny = ((py + 0.5) / RES - cy) / ry; return nx * nx + ny * ny <= 1; };
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        if (!inn(px, py)) continue;
        const nx = ((px + 0.5) / RES - cx) / rx, ny = ((py + 0.5) / RES - cy) / ry;
        const edge = !opts.noOutline && (!inn(px - 1, py) || !inn(px + 1, py) || !inn(px, py - 1) || !inn(px, py + 1));
        let col;
        if (edge) col = pal[0];
        else {
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const lum = -0.55 * nx - 0.65 * ny + 0.55 * nz + (BAYER[py & 1][px & 1] - 0.4) * 0.2 + (opts.bias || 0);
          col = lum > 0.95 ? pal[5] : lum > 0.58 ? pal[4] : lum > 0.12 ? pal[3] : lum > -0.28 ? pal[2] : pal[1];
        }
        g.fillStyle = col;
        g.fillRect(px + (opts.ox || 0), py + (opts.oy || 0), 1, 1);
      }
  });
}

// Eight body models. Each returns f(nx, ny): about 0 at the body's middle and 1 at its
// edge (nx, ny run -1..1 across the D x D body box). Shading treats f as a height field,
// so every shape gets the same lit, rounded 3D look.
const BODY_MODELS = [
  { name: "Round",       f: (x, y) => x * x + y * y },
  { name: "Bean",        f: (x, y) => { const w = 0.74 + 0.12 * y; return (x / w) ** 2 + y * y; } },
  { name: "Mochi",       f: (x, y) => { const yy = (y - 0.12) / 0.8; return y > 0.9 ? 2 : (x / 1.0) ** 2 + yy * yy * (yy < 0 ? 1 : 0.45); } },
  { name: "Gumdrop",     f: (x, y) => y < 0 ? x * x / 0.86 + y * y : (Math.abs(x) / 0.93) ** 4 + y ** 4 },
  { name: "Pear",        f: (x, y) => { const w = 0.62 + 0.34 * (y + 1) / 2; return (x / w) ** 2 + y * y; } },
  { name: "Marshmallow", f: (x, y) => (Math.abs(x) / 0.94) ** 4 + (Math.abs(y) / 0.94) ** 4 },
  { name: "Onion",       f: (x, y) => { const body = (x / 0.92) ** 2 + ((y - 0.14) / 0.86) ** 2; const tip = y < -0.5 ? (Math.abs(x) / Math.max(0.01, (y + 1.02) * 0.62)) ** 2 : 9; return Math.min(body, tip > 1 ? 9 : body > 1 && y > -1 ? 0.97 : body); } },
  { name: "Blobby",      f: (x, y) => { const body = (x / 0.92) ** 2 + ((y - 0.1) / 0.9) ** 2; const ear = (cx) => ((x - cx) ** 2 + (y + 0.7) ** 2) / 0.08; return Math.min(body, ear(-0.5), ear(0.5)); } },
];

function drawBody(g, ox, oy, D, color, shape, pattern, model = 0) {
  const c = D / 2, R = D / 2;
  const M = (BODY_MODELS[model] || BODY_MODELS[0]).f;
  // the variant's own shape trait (tall Elasticity, square-jawed Moggity) still applies on top
  const field = (dx, dy) => {
    let x = dx / R, y = dy / R;
    if (shape === "tall") x *= 1.25;
    let f = M(x, y);
    if (shape === "jaw" && y > 0) f = Math.min(f, Math.max(Math.abs(x) * 1.04, Math.abs(y) * 1.04) ** 2);
    return f;
  };
  const inU = (ux, uy) => ux >= 0 && uy >= 0 && ux < D && uy < D && field(ux - c, uy - c) <= 0.97;
  const pal = ramp(color);
  const s = 1 / RES;
  raw(g, () => {
    const N = D * RES;
    for (let py = 0; py < N; py++)
      for (let px = 0; px < N; px++) {
        const ux = (px + 0.5) / RES, uy = (py + 0.5) / RES;
        if (!inU(ux, uy)) continue;
        const edge = !inU(ux - s, uy) || !inU(ux + s, uy) || !inU(ux, uy - s) || !inU(ux, uy + s);
        let col;
        if (edge) col = pal[0];
        else {
          // surface normal from the height field h = sqrt(1 - f)
          const h = (dx, dy) => Math.sqrt(Math.max(0, 1 - field(dx, dy)));
          const e = 0.35, hc = h(ux - c, uy - c);
          // the height field's slope gives a sphere-like normal: (nx, ny) point outwards
          const gx = (h(ux - c + e, uy - c) - h(ux - c - e, uy - c)) / (2 * e) * R;
          const gy = (h(ux - c, uy - c + e) - h(ux - c, uy - c - e)) / (2 * e) * R;
          const len = Math.hypot(gx, gy, 1);
          const nx = -gx / len, ny = -gy / len, nz = Math.max(hc, 1 / len) * 0.6 + hc * 0.4;
          const lum = -0.5 * nx - 0.6 * ny + 0.62 * nz + (BAYER[py & 1][px & 1] - 0.4) * 0.16;
          col = lum > 0.98 ? pal[5] : lum > 0.6 ? pal[4] : lum > 0.1 ? pal[3] : lum > -0.32 ? pal[2] : pal[1];
          if (pattern === "stripes" && Math.floor(ux) % 3 === 0) col = shade(col, -22);
          if (pattern === "dither" && (Math.floor(ux) + Math.floor(uy)) % 2 === 0) col = shade(col, 20);
        }
        g.fillStyle = col;
        g.fillRect(ox * RES + px, oy * RES + py, 1, 1);
      }
    // rim light along the lower right edge
    g.fillStyle = "rgba(255,255,255,0.18)";
    for (let py = 0; py < N; py++)
      for (let px = 0; px < N; px++) {
        const ux = (px + 0.5) / RES, uy = (py + 0.5) / RES;
        if (inU(ux, uy) && inU(ux + s, uy + s) && !inU(ux + 2 * s, uy + 2 * s) && ux > c && uy > c) g.fillRect(ox * RES + px, oy * RES + py, 1, 1);
      }
    // specular highlight near the upper left of the body
    const top = bodyTop(inU, D), gx = Math.round((ox + c - R * 0.42) * RES), gy = Math.round((oy + top + R * 0.35) * RES);
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.fillRect(gx, gy, 2, 1);
    g.fillRect(gx, gy + 1, 1, 1);
  });
  const inside = (x, y) => inU(x - ox + 0.5, y - oy + 0.5);
  inside.top = bodyTop(inU, D);
  inside.bottom = bodyBottom(inU, D);
  return inside;
}
// Highest / lowest body row down the middle column, in units from the top of the body box.
function bodyTop(inU, D) { for (let y = 0; y < D; y += 0.5) if (inU(D / 2, y + 0.25) || inU(D / 2 - 1, y + 0.25) || inU(D / 2 + 1, y + 0.25)) return y; return 0; }
function bodyBottom(inU, D) { for (let y = D; y > 0; y -= 0.5) if (inU(D / 2, y - 0.25)) return y; return D; }

const SPR_PAD_X = 3, SPR_PAD_T = 6, SPR_PAD_B = 3;

function bodySize(key, ind) {
  return (VARIANTS[key].size || 12) + (ind ? SIZES[ind.size].d : 0);
}

// Eye rectangles (12-grid units) used for glints and blinking
const FACE_EYES = {
  smile: [[4, 4, 1, 2], [7, 4, 1, 2]], smileBlush: [[4, 4, 1, 2], [7, 4, 1, 2]], sweat: [[4, 4, 1, 2], [7, 4, 1, 2]],
  speed: [[4, 4, 1, 2], [7, 4, 1, 2]], bolt: [[4, 4, 1, 2], [7, 4, 1, 2]], censored: [[4, 4, 1, 2], [7, 4, 1, 2]],
  frown: [[4, 4, 1, 2]], pirate: [[7, 4, 1, 2]], money: [[3, 4, 2, 2], [7, 4, 2, 2]], fangs: [[4, 5, 1, 1], [7, 5, 1, 1]],
  angry: [[4, 5, 1, 1], [7, 5, 1, 1]], mog: [[3, 4, 2, 1], [7, 4, 2, 1]], wide: [[3, 4, 2, 2], [7, 4, 2, 2]],
  blank: [[4, 5, 1, 1], [7, 5, 1, 1]], neutral: [[4, 5, 1, 1], [7, 5, 1, 1]], steve: [[3, 4, 2, 1], [7, 4, 2, 1]],
  upside: [[4, 6, 1, 2], [7, 6, 1, 2]], crazy: [[7, 4, 1, 1]],
};
const NO_GLINT = new Set(["wide", "mog", "steve"]);

function accessoryShine(g, o, acc) {
  g.fillStyle = "rgba(255,255,255,0.75)";
  if (acc === "bow") g.fillRect(o.x + 7, o.y - 1, 0.5, 0.5);
  if (acc === "tophat") { g.fillStyle = "#555"; g.fillRect(o.x + 3.5, o.y - 3.5, 0.5, 1.5); }
  if (acc === "glasses") { g.fillRect(o.x + 3, o.y + 4, 0.5, 0.5); g.fillRect(o.x + 7, o.y + 4, 0.5, 0.5); }
  if (acc === "antenna") g.fillRect(o.x + 5, o.y - 5, 0.5, 0.5);
  if (acc === "scarf") { g.fillStyle = "#ff8080"; g.fillRect(o.x + 2.5, o.y + 9, 7, 0.5); }
  if (acc === "flower") { g.fillStyle = "#fff6c0"; g.fillRect(o.x + 10, o.y + 1, 0.5, 0.5); }
}

function buildVariantSprite(key, ind, blink = false) {
  const def = VARIANTS[key];
  const D = bodySize(key, ind);
  const [c, g] = hiCanvas(D + SPR_PAD_X * 2, D + SPR_PAD_T + SPR_PAD_B);
  let color = def.color;
  if (ind) {
    color = tweak(color, ind.hue, ind.light);
    if (ind.shiny) color = tweak(color, 150, 6);
  }
  const inside = drawBody(g, SPR_PAD_X, SPR_PAD_T, D, color, def.shape, def.pattern, ind ? ind.model || 0 : 0);
  const off = (D - 12) / 2;
  // centre the face between the body's top and bottom, so squat and tall models look right
  const faceShift = Math.round(((inside.top + inside.bottom) / 2 - D / 2) * 2) / 2;
  const o = { x: SPR_PAD_X + off, y: SPR_PAD_T + off + faceShift };
  if (ind) drawMarking(g, o, ind, color, inside);
  const ink = def.ink || "#2b1d00";
  FACES[def.face](g, o, ink, color);
  const eyes = FACE_EYES[def.face];
  if (eyes) {
    if (blink) {
      for (const [x, y, w, h] of eyes) {
        g.fillStyle = color; g.fillRect(o.x + x, o.y + y, w, h);
        g.fillStyle = ink; g.fillRect(o.x + x - 0.25, o.y + y + h - 0.75, w + 0.5, 0.5);
      }
    } else if (!NO_GLINT.has(def.face)) {
      g.fillStyle = "#fff";
      for (const [x, y] of eyes) g.fillRect(o.x + x, o.y + y, 0.5, 0.5);
    }
  }
  c.outline = true;
  return c;
}

const spriteCache = new Map();
function spriteFor(ind, blink = false) {
  if (blink && !FACE_EYES[VARIANTS[ind.k].face]) blink = false;
  const key = "i" + ind.id + (blink ? "b" : "");
  if (!spriteCache.has(key)) spriteCache.set(key, buildVariantSprite(ind.k, ind, blink));
  return spriteCache.get(key);
}
function baseSprite(k) {
  const key = "b" + k;
  if (!spriteCache.has(key)) spriteCache.set(key, buildVariantSprite(k, null));
  return spriteCache.get(key);
}
function silhouetteSprite() {
  if (spriteCache.has("sil")) return spriteCache.get("sil");
  const [c, g] = hiCanvas(18, 21);
  drawBody(g, 3, 6, 12, "#1d1a36", null, null);
  g.fillStyle = "#5b5690";
  [[8, 9], [9, 9], [10, 10], [9, 11], [8, 12], [8, 14]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  spriteCache.set("sil", c);
  return c;
}

// ================= Terrain palettes =================
const GRASS = { base: [74, 154, 63], dark: [63, 138, 54], light: [91, 174, 75], deep: [52, 120, 46] };
const BIOMES = {
  meadow:   { ground: [[74, 154, 63], [63, 138, 54], [91, 174, 75]], trees: [["oak", 0.8], ["bush", 0.2]], density: 0.55 },
  oak:      { ground: [[60, 128, 52], [50, 112, 44], [74, 146, 62]], trees: [["oak", 0.8], ["bush", 0.2]], density: 0.75 },
  pine:     { ground: [[47, 90, 42], [38, 73, 31], [61, 107, 50]], trees: [["pine", 0.88], ["rock", 0.12]], density: 0.88 },
  birch:    { ground: [[95, 158, 74], [79, 138, 60], [120, 181, 92]], trees: [["birch", 0.7], ["oak", 0.12], ["bush", 0.18]], density: 0.62 },
  autumn:   { ground: [[138, 106, 42], [110, 80, 32], [168, 128, 47]], trees: [["autumn", 0.85], ["bush", 0.15]], density: 0.78 },
  mushroom: { ground: [[47, 95, 85], [36, 76, 68], [63, 114, 102]], trees: [["mushroom", 0.55], ["darkoak", 0.3], ["pine", 0.15]], density: 0.68 },
  rocky:    { ground: [[110, 122, 98], [90, 101, 80], [135, 145, 122]], trees: [["rock", 0.62], ["pine", 0.38]], density: 0.6 },
  flower:   { ground: [[90, 160, 74], [74, 138, 60], [108, 184, 90]], trees: [["bush", 0.7], ["birch", 0.3]], density: 0.62 },
  swamp:    { ground: [[63, 90, 58], [46, 74, 46], [79, 107, 69]], trees: [["willow", 0.5], ["reeds", 0.5]], density: 0.58 },
  jungle:   { ground: [[42, 106, 42], [31, 85, 32], [58, 128, 48]], trees: [["palm", 0.55], ["fern", 0.45]], density: 0.92 },
  snow:     { ground: [[222, 230, 240], [198, 210, 226], [240, 245, 250]], trees: [["snowpine", 0.85], ["rock", 0.15]], density: 0.7 },
  cherry:   { ground: [[104, 166, 84], [88, 148, 70], [124, 184, 98]], trees: [["cherry", 0.78], ["bush", 0.22]], density: 0.66 },
};

// ================= Paths =================
const PATH_EDGE = { 1: "#9c7a46", 2: "#5e5e72", 3: "#b8902a" };
const pathTiles = {
  1: (() => {
    const [c, g] = hiCanvas(TILE, TILE);
    rawHalf(g, () => {
      const r = seeded(7);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const n = r();
        g.fillStyle = n < 0.12 ? "#c49d62" : n > 0.9 ? "#e6c793" : "#d8b47a";
        g.fillRect(x, y, 1, 1);
      }
      for (let i = 0; i < 9; i++) {
        const x = Math.floor(r() * 30), y = Math.floor(r() * 30);
        g.fillStyle = "#8f7a5c"; g.fillRect(x, y + 1, 2, 1);
        g.fillStyle = "#b8a68a"; g.fillRect(x, y, 2, 1);
      }
      g.fillStyle = "rgba(120,90,50,0.18)"; g.fillRect(9, 0, 2, 32); g.fillRect(21, 0, 2, 32);
    });
    return c;
  })(),
  2: (() => {
    const [c, g] = hiCanvas(TILE, TILE);
    rawHalf(g, () => {
      g.fillStyle = "#6f6f84"; g.fillRect(0, 0, 32, 32);
      const r = seeded(11);
      const stones = [];
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) stones.push([col * 8 + (row % 2 ? 4 : 0) + 4, row * 8 + 4]);
      for (const [sx, sy] of stones) {
        const w = 3 + r() * 0.8, h = 2.9 + r() * 0.6;
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
          const d = (x * x) / (w * w) + (y * y) / (h * h);
          if (d > 1) continue;
          const px = (sx + x + 32) % 32, py = (sy + y + 32) % 32;
          g.fillStyle = d > 0.72 ? (x + y > 0 ? "#7c7c90" : "#d2d2de") : (x + y < -2 ? "#c4c4d2" : x + y > 2 ? "#9a9aae" : "#b0b0c0");
          g.fillRect(px, py, 1, 1);
        }
      }
    });
    return c;
  })(),
  3: (() => {
    const [c, g] = hiCanvas(TILE, TILE);
    rawHalf(g, () => {
      g.fillStyle = "#b8902a"; g.fillRect(0, 0, 32, 32);
      for (let row = 0; row < 4; row++)
        for (let b = -1; b < 3; b++) {
          const x = b * 16 + (row % 2 ? 8 : 0), y = row * 8;
          g.fillStyle = "#f0c63a"; g.fillRect(x + 1, y + 1, 14, 6);
          g.fillStyle = "#fff09a"; g.fillRect(x + 1, y + 1, 14, 1); g.fillRect(x + 1, y + 1, 1, 6);
          g.fillStyle = "#d9a826"; g.fillRect(x + 1, y + 6, 14, 1); g.fillRect(x + 14, y + 1, 1, 6);
        }
    });
    return c;
  })(),
};
const pathTile = pathTiles[1];

// ================= Enclosure grounds =================
const FENCES = {
  wood:   { dark: "#4e2c10", hi: "#a8703c", mid: "#7a4a22", post: "#2a1a0c" },
  metal:  { dark: "#3a3f4c", hi: "#c4cad6", mid: "#7a8292", post: "#1e2129" },
  wall:   { dark: "#6b5a1e", hi: "#efe08a", mid: "#c9b458", post: "#4a3d10" },
  picket: { dark: "#8a8a96", hi: "#ffffff", mid: "#e4e4ee", post: "#6a6a76" },
  hedge:  { dark: "#1f5a24", hi: "#6ec05a", mid: "#3f8a36", post: "#174a1c" },
  stone:  { dark: "#55555f", hi: "#c4c4ce", mid: "#8e8e98", post: "#3e3e48" },
};
const THEME_FENCE = { meadow: "wood", pool: "wood", lab: "metal", stage: "wood", backrooms: "wall" };
const encGroundCache = {};
function makeEncGround(size, theme = "meadow", fenceKey = null) {
  const key = size + ":" + theme + ":" + (fenceKey || "");
  if (encGroundCache[key]) return encGroundCache[key];
  const W = size * TILE;
  const [c, g] = hiCanvas(W, W);
  const r = seeded(42 + size * 7 + theme.length * 13);
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const sprinkle = (cols, n, x0 = 0, y0 = 0, w = W, h = W, sz = 0.5) => { for (let i = 0; i < n; i++) R(cols[Math.floor(r() * cols.length)], x0 + Math.floor(r() * w * 2) / 2, y0 + Math.floor(r() * h * 2) / 2, sz, sz); };
  let fence = FENCES.wood;
  if (theme === "pool") {
    R("#6cbf55", 0, 0, W, W); sprinkle(["#5aad47", "#83d06a"], W * 6);
    R("#000", 6, 7, W - 12, W - 16); R("#e8e0c8", 7, 8, W - 14, W - 18);
    for (let x = 7; x < W - 7; x += 2) R("#d4cbb0", x, 8, 0.5, W - 18);
    R("#2f7fd0", 9, 10, W - 18, W - 22); R("#3d8fe0", 10, 11, W - 20, W - 24);
    for (let i = 0; i < size * 6; i++) R(r() < 0.5 ? "#9fd4ff" : "#6fb4f0", 11 + Math.floor(r() * (W - 26)), 12 + Math.floor(r() * (W - 28)), 1 + r() * 2, 0.5);
    R("#c9c9d9", W - 14, 8, 1, 6); R("#c9c9d9", W - 11, 8, 1, 6); R("#c9c9d9", W - 14, 10, 4, 0.5); R("#c9c9d9", W - 14, 12, 4, 0.5);
    R("#ff5c7a", 9, W - 9, 6, 2); R("#fff", 11, W - 9, 2, 2); R("#ffd23f", 15, W - 9, 3, 2);
  } else if (theme === "lab") {
    fence = FENCES.metal;
    for (let y = 0; y < W; y += 4) for (let x = 0; x < W; x += 4) {
      R(((x + y) / 4) % 2 ? "#cfd6e0" : "#b8c2d0", x, y, 4, 4);
      R("rgba(255,255,255,0.35)", x, y, 4, 0.5); R("rgba(0,0,0,0.12)", x + 3.5, y, 0.5, 4);
    }
    R("#000", W - 18, 5, 13, 6); R("#5a6070", W - 17, 6, 11, 4); R("#7a8292", W - 17, 6, 11, 0.5);
    R("#6ee07a", W - 16, 4, 2, 3); R("#ff7eb6", W - 12, 3, 2, 4); R("#5fb4ff", W - 9, 4, 2, 3);
    R("#fff", W - 16, 4, 0.5, 1); R("#fff", W - 12, 3, 0.5, 1); R("#fff", W - 9, 4, 0.5, 1);
    for (let x = 4; x < W - 4; x += 4) { R("#ffd23f", x, W - 7, 2, 2); R("#222", x + 2, W - 7, 2, 2); }
    R("#2b2b3a", 6, 14, 1, W - 24); R("#ff5c7a", 6, 14, 1, 1);
  } else if (theme === "stage") {
    for (let y = 0; y < W; y += 3) {
      R(y % 6 ? "#b07a44" : "#9a6838", 0, y, W, 3); R("#6b4220", 0, y + 2.5, W, 0.5);
      for (let x = (y * 7) % 11; x < W; x += 11) R("#6b4220", x, y, 0.5, 2.5);
    }
    for (let i = 0; i < size * 10; i++) R("rgba(80,40,10,0.35)", Math.floor(r() * W * 2) / 2, Math.floor(r() * W / 3) * 3 + 1, 2, 0.5);
    R("#7a1020", 3, 3, W - 6, 7);
    for (let x = 3; x < W - 3; x += 3) { R("#a3203a", x, 3, 2, 7); R("#c43a52", x, 3, 0.5, 7); }
    R("#ffd23f", 3, 10, W - 6, 1); R("#fff09a", 3, 10, W - 6, 0.5);
    g.fillStyle = "rgba(255,240,180,0.18)";
    for (const cx of [W * 0.3, W * 0.7]) { g.beginPath(); g.ellipse(cx, W * 0.62, W * 0.18, W * 0.12, 0, 0, Math.PI * 2); g.fill(); }
  } else if (theme === "backrooms") {
    fence = FENCES.wall;
    R("#b8a35a", 0, 0, W, W);
    for (let y = 0; y < W; y += 0.5) for (let x = 0; x < W; x += 0.5) if (r() < 0.18) R(r() < 0.5 ? "#a8934a" : "#c4b066", x, y, 0.5, 0.5);
    for (let x = 0; x < W; x += 3) { R(x % 6 ? "#e0cf7a" : "#cdbb63", x, 3, 3, 7); R("#f2e49a", x, 3, 0.5, 7); }
    R("#fffbe0", W / 2 - 6, 14, 12, 3); R("#fff3a1", W / 2 - 5, 15, 10, 1);
    sprinkle(["#8a7a3a"], size * 8, 4, 12, W - 8, W - 16, 1);
  } else {
    R("#6cbf55", 0, 0, W, W); sprinkle(["#5aad47", "#83d06a", "#5aad47"], W * 8);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - W / 2, (y - W / 2 - 1) * 1.3) < W * 0.19 && r() < 0.55) R(r() < 0.5 ? "#8fb25a" : "#a3be6c", x, y, 1, 1);
    for (let i = 0; i < size * 14; i++) { const x = Math.floor(r() * W * 2) / 2, y = Math.floor(r() * W * 2) / 2; R("#3f8f3a", x, y, 0.5, 1.5); R("#9ade7c", x, y - 0.5, 0.5, 0.5); }
    R("#000", W - 17, W - 11, 12, 7); R("#7a4a22", W - 16, W - 10, 10, 5); R("#a8703c", W - 16, W - 10, 10, 0.5); R("#3d8fe0", W - 15, W - 9, 8, 2); R("#9fd4ff", W - 14, W - 9, 3, 0.5);
    litBlob(g, W - 8, 6.5, 4.5, 3.8, ramp("#3f8f3a"));
    R("#ff8fb8", W - 7, 6, 1, 1); R("#fff3a1", W - 10, 7, 0.5, 0.5);
  }
  R("#000", 5, W - 10, 8, 5); R("#c94a4a", 6, W - 9, 6, 3); R("#e8c15a", 7, W - 9, 4, 1); R("#ffe9a0", 7, W - 9, 2, 0.5); R("#ff8080", 6, W - 9, 6, 0.5);
  if (fenceKey && FENCES[fenceKey]) fence = FENCES[fenceKey];
  R(fence.dark, 0, 0, W, 3); R(fence.dark, 0, W - 3, W, 3); R(fence.dark, 0, 0, 3, W); R(fence.dark, W - 3, 0, 3, W);
  R(fence.hi, 0, 0, W, 1); R(fence.hi, 0, W - 3, W, 1); R(fence.hi, 0, 0, 1, W); R(fence.hi, W - 3, 0, 1, W);
  R(fence.mid, 1, 1, W - 2, 1); R(fence.mid, 1, W - 2, W - 2, 1); R(fence.mid, 1, 1, 1, W - 2); R(fence.mid, W - 2, 1, 1, W - 2);
  for (let x = 2; x < W - 2; x += 5) { R("rgba(0,0,0,0.25)", x, 1.5, 2, 0.5); R("rgba(0,0,0,0.25)", x, W - 1.5, 2, 0.5); }
  for (let p = 0; p < W; p += 8) {
    const q = Math.min(p, W - 4);
    for (const [px, py] of [[q, 0], [q, W - 4], [0, q], [W - 4, q]]) {
      R(fence.post, px, py, 4, 4); R(fence.hi, px + 0.5, py + 0.5, 3, 0.5); R(fence.hi, px + 0.5, py + 0.5, 0.5, 3);
      R(fence.mid, px + 1.5, py + 1.5, 1, 1);
    }
  }
  return (encGroundCache[key] = c);
}
const encGround = makeEncGround(3, "meadow");

// A pen of any shape: w x h tiles, with only the tiles in `cells` (a Set of "dx,dy") fenced in.
// Each tile gets the theme's floor, water and decor flow across neighbouring tiles, and the
// fence runs along every outside edge.
const penSpriteCache = new Map();
function makePenSprite(w, h, cells, theme = "meadow", fenceKey = null) {
  const key = [w, h, [...cells].sort().join(";"), theme, fenceKey || ""].join("|");
  if (penSpriteCache.has(key)) return penSpriteCache.get(key);
  const [c, g] = hiCanvas(w * TILE, h * TILE);
  const r = seeded(w * 31 + h * 17 + cells.size * 7 + theme.length);
  const R = (col, x, y, ww, hh) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  const has = (x, y) => cells.has(x + "," + y);
  const list = [...cells].map(k => k.split(",").map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const fence = FENCES[fenceKey || THEME_FENCE[theme]] || FENCES.wood;
  // floors
  for (const [cx, cy] of list) {
    const X = cx * TILE, Y = cy * TILE;
    if (theme === "lab") {
      for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x += 4) { R(((x + y) / 4) % 2 ? "#cfd6e0" : "#b8c2d0", X + x, Y + y, 4, 4); R("rgba(255,255,255,0.35)", X + x, Y + y, 4, 0.5); }
    } else if (theme === "stage") {
      for (let y = 0; y < TILE; y += 3) { R(y % 6 ? "#b07a44" : "#9a6838", X, Y + y, TILE, 3); R("#6b4220", X, Y + y + 2.5, TILE, 0.5); R("#6b4220", X + ((y * 7 + cx * 5) % 11), Y + y, 0.5, 2.5); }
    } else if (theme === "backrooms") {
      R("#b8a35a", X, Y, TILE, TILE);
      for (let i = 0; i < 40; i++) R(r() < 0.5 ? "#a8934a" : "#c4b066", X + Math.floor(r() * 32) / 2, Y + Math.floor(r() * 32) / 2, 0.5, 0.5);
    } else {
      R("#6cbf55", X, Y, TILE, TILE);
      for (let i = 0; i < 26; i++) R(r() < 0.5 ? "#5aad47" : "#83d06a", X + Math.floor(r() * 32) / 2, Y + Math.floor(r() * 32) / 2, 0.5, 0.5);
      for (let i = 0; i < 4; i++) { const x = X + Math.floor(r() * 28) / 2 + 1, y = Y + Math.floor(r() * 28) / 2 + 1; R("#3f8f3a", x, y, 0.5, 1.5); R("#9ade7c", x, y - 0.5, 0.5, 0.5); }
    }
  }
  // pool water flows across neighbouring tiles; a deck rim lines the outside edge
  if (theme === "pool") {
    for (const [cx, cy] of list) {
      const X = cx * TILE, Y = cy * TILE;
      const l = has(cx - 1, cy) ? 0 : 6, rr = has(cx + 1, cy) ? 0 : 6, t = has(cx, cy - 1) ? 0 : 7, b = has(cx, cy + 1) ? 0 : 6;
      R("#e8e0c8", X + l - 2, Y + t - 2, TILE - l - rr + 4, TILE - t - b + 4);
    }
    for (const [cx, cy] of list) {
      const X = cx * TILE, Y = cy * TILE;
      const l = has(cx - 1, cy) ? 0 : 6, rr = has(cx + 1, cy) ? 0 : 6, t = has(cx, cy - 1) ? 0 : 7, b = has(cx, cy + 1) ? 0 : 6;
      R("#2f7fd0", X + l, Y + t, TILE - l - rr, TILE - t - b);
      R("#3d8fe0", X + l + (l ? 1 : 0), Y + t + (t ? 1 : 0), TILE - l - rr - (l ? 1 : 0) - (rr ? 1 : 0), TILE - t - b - (t ? 1 : 0) - (b ? 1 : 0));
      for (let i = 0; i < 3; i++) R(r() < 0.5 ? "#9fd4ff" : "#6fb4f0", X + l + r() * (TILE - l - rr - 3), Y + t + r() * (TILE - t - b - 1), 1 + r() * 2, 0.5);
    }
  }
  // decor: theme features along the top edge and a food bowl near the bottom
  const tops = list.filter(([x, y]) => !has(x, y - 1));
  if (theme === "stage") for (const [cx, cy] of tops) { const X = cx * TILE, Y = cy * TILE; R("#7a1020", X, Y + 3, TILE, 7); for (let x = 0; x < TILE; x += 3) { R("#a3203a", X + x, Y + 3, 2, 7); R("#c43a52", X + x, Y + 3, 0.5, 7); } R("#ffd23f", X, Y + 10, TILE, 1); }
  if (theme === "backrooms") for (const [cx, cy] of tops) { const X = cx * TILE, Y = cy * TILE; for (let x = 0; x < TILE; x += 3) { R(x % 6 ? "#e0cf7a" : "#cdbb63", X + x, Y + 3, 3, 7); R("#f2e49a", X + x, Y + 3, 0.5, 7); } }
  if (theme === "lab" && tops.length) { const [cx, cy] = tops[Math.floor(tops.length / 2)]; const X = cx * TILE, Y = cy * TILE; R("#000", X + 2, Y + 5, 12, 6); R("#5a6070", X + 3, Y + 6, 10, 4); R("#6ee07a", X + 4, Y + 4, 2, 3); R("#ff7eb6", X + 8, Y + 3, 2, 4); }
  if (theme === "meadow" && list.length > 3) { const [cx, cy] = list[Math.floor(list.length / 2)]; litBlob(g, cx * TILE + 8, cy * TILE + 7, 4, 3.4, ramp("#3f8f3a")); R("#ff8fb8", cx * TILE + 9, cy * TILE + 6, 1, 1); }
  const bottom = list[list.length - 1];
  { const X = bottom[0] * TILE, Y = bottom[1] * TILE; R("#000", X + 4, Y + 6, 8, 5); R("#c94a4a", X + 5, Y + 7, 6, 3); R("#e8c15a", X + 6, Y + 7, 4, 1); R("#ff8080", X + 5, Y + 7, 6, 0.5); }
  // fences along every outside edge, with posts at the corners and every 8 units
  for (const [cx, cy] of list) {
    const X = cx * TILE, Y = cy * TILE;
    const rail = (x, y, ww, hh, horiz) => {
      R(fence.dark, x, y, ww, hh);
      if (horiz) { R(fence.hi, x, y, ww, 1); R(fence.mid, x, y + 1, ww, 1); } else { R(fence.hi, x, y, 1, hh); R(fence.mid, x + 1, y, 1, hh); }
    };
    if (!has(cx, cy - 1)) rail(X, Y, TILE, 3, true);
    if (!has(cx, cy + 1)) rail(X, Y + TILE - 3, TILE, 3, true);
    if (!has(cx - 1, cy)) rail(X, Y, 3, TILE, false);
    if (!has(cx + 1, cy)) rail(X + TILE - 3, Y, 3, TILE, false);
  }
  const post = (x, y) => { R(fence.post, x, y, 4, 4); R(fence.hi, x + 0.5, y + 0.5, 3, 0.5); R(fence.hi, x + 0.5, y + 0.5, 0.5, 3); R(fence.mid, x + 1.5, y + 1.5, 1, 1); };
  for (const [cx, cy] of list) {
    const X = cx * TILE, Y = cy * TILE;
    const up = !has(cx, cy - 1), dn = !has(cx, cy + 1), lf = !has(cx - 1, cy), rt = !has(cx + 1, cy);
    if (up) { post(X, Y); post(X + 8, Y); }
    if (dn) { post(X, Y + TILE - 4); post(X + 8, Y + TILE - 4); }
    if (lf) { post(X, Y); post(X, Y + 8); }
    if (rt) { post(X + TILE - 4, Y); post(X + TILE - 4, Y + 8); }
    if (up || rt) post(X + TILE - 4, Y);
    if (dn || rt) post(X + TILE - 4, Y + TILE - 4);
    if (dn || lf) post(X, Y + TILE - 4);
    // inside corners where the fence turns
    if (!up && !lf && !has(cx - 1, cy - 1)) post(X, Y);
    if (!up && !rt && !has(cx + 1, cy - 1)) post(X + TILE - 4, Y);
    if (!dn && !lf && !has(cx - 1, cy + 1)) post(X, Y + TILE - 4);
    if (!dn && !rt && !has(cx + 1, cy + 1)) post(X + TILE - 4, Y + TILE - 4);
  }
  if (penSpriteCache.size > 120) penSpriteCache.delete(penSpriteCache.keys().next().value);
  penSpriteCache.set(key, c);
  return c;
}

// ================= Trees & wild plants (hi-res, anchored at bottom centre) =================
function treeBase(w, h) { const [c, g] = hiCanvas(w, h); c.ax = w / 2; c.ay = h - 2; return [c, g]; }
function shadowEllipse(g, cx, cy, rx, ry) { g.fillStyle = "rgba(0,0,0,0.22)"; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
function trunk(g, x, y, w, h, col = "#6b4122") {
  g.fillStyle = shade(col, -60); g.fillRect(x - 0.5, y, w + 1, h);
  g.fillStyle = col; g.fillRect(x, y, w, h);
  g.fillStyle = shade(col, 30); g.fillRect(x, y, w * 0.35, h);
  g.fillStyle = shade(col, -30); for (let i = 1; i < h; i += 2.5) g.fillRect(x + w * 0.5, y + i, w * 0.4, 0.5);
}
function leafSpecks(g, cx, cy, rx, ry, col, n, seed) {
  const r = seeded(seed); g.fillStyle = col;
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()); g.fillRect(cx + Math.cos(a) * rx * d * 0.85, cy + Math.sin(a) * ry * d * 0.85, 0.5, 0.5); }
}
const AUTUMN_COLS = ["#d9622b", "#e8a23a", "#c0392b", "#f0c040"];
function makeTree(kind, v = 0) {
  const r = seeded(kind.length * 31 + v * 977);
  const jit = () => (r() - 0.5) * 18;
  if (kind === "pine" || kind === "snowpine") {
    const snowy = kind === "snowpine";
    const [c, g] = treeBase(16, 28);
    shadowEllipse(g, 8, 26, 6, 1.8);
    trunk(g, 7, 20, 2, 6, "#5a3a1e");
    const base = snowy ? tweak("#2a5a48", jit(), jit() / 3) : tweak("#2f6b34", jit(), jit() / 3);
    for (let i = 0; i < 4; i++) {
      const y = 3 + i * 4.5, w = 3 + i * 1.6;
      raw(g, () => {
        for (let py = Math.round(y * RES); py < Math.round((y + 7) * RES); py++) {
          const t = (py / RES - y) / 7, half = w * t * RES;
          for (let px = Math.round(8 * RES - half); px < Math.round(8 * RES + half); px++) {
            const rel = (px - 8 * RES) / Math.max(1, half);
            const edge = px === Math.round(8 * RES - half) || px === Math.round(8 * RES + half) - 1 || py === Math.round((y + 7) * RES) - 1;
            g.fillStyle = edge ? "#0f2a12" : rel < -0.3 ? shade(base, 26) : rel > 0.45 ? shade(base, -30) : ((px + py) % 5 === 0 ? shade(base, -15) : base);
            if (snowy && !edge && (t < 0.38 || (t > 0.75 && rel < 0.2))) g.fillStyle = rel > 0.35 ? "#c4d2e6" : "#f4f8ff";
            g.fillRect(px, py, 1, 1);
          }
        }
      });
    }
    g.fillStyle = shade(base, 60); g.fillRect(7.5, 3, 0.5, 2);
    return c;
  }
  if (kind === "rock") {
    const [c, g] = treeBase(14, 12);
    shadowEllipse(g, 7.5, 10.2, 6, 1.6);
    const base = tweak("#8a8f96", jit() / 2, jit() / 3);
    litBlob(g, 7, 6.5, 5.5, 4, ramp(base));
    litBlob(g, 10.5, 8, 2.6, 2, ramp(shade(base, -10)));
    g.fillStyle = "#5f8f3f"; g.fillRect(4, 4, 2, 0.5); g.fillRect(5, 3.5, 1.5, 0.5);
    g.fillStyle = shade(base, -50); g.fillRect(7, 5, 0.5, 2); g.fillRect(7.5, 6.5, 1, 0.5);
    return c;
  }
  if (kind === "bush" || kind === "fern") {
    const [c, g] = treeBase(14, 12);
    shadowEllipse(g, 7, 10.2, 6, 1.6);
    const base = kind === "fern" ? tweak("#1f8a4a", jit(), 0) : tweak("#3f8f3a", jit(), jit() / 3);
    litBlob(g, 5, 7, 4, 3.3, ramp(base));
    litBlob(g, 9, 7.3, 4, 3, ramp(shade(base, -6)));
    litBlob(g, 7, 5, 4, 3.2, ramp(shade(base, 6)));
    if (kind === "bush") {
      const fc = ["#ff8fb8", "#fff3a1", "#ffffff", "#ffb35c", "#c9a7ff"][v % 5];
      for (let i = 0; i < 6; i++) { g.fillStyle = fc; g.fillRect(3 + r() * 8, 4 + r() * 5, 1, 1); g.fillStyle = "#fff"; g.fillRect(3 + r() * 8, 4 + r() * 5, 0.5, 0.5); }
    } else {
      g.fillStyle = shade(base, 40);
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.45; g.fillRect(7 + Math.cos(a) * 4, 7 + Math.sin(a) * 4, 0.5, 0.5); }
    }
    return c;
  }
  if (kind === "reeds") {
    const [c, g] = treeBase(12, 14);
    g.fillStyle = "rgba(40,80,90,0.35)"; g.beginPath(); g.ellipse(6, 12, 5.5, 1.8, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 2 + Math.floor(r() * 2) * 0.5, h = 6 + Math.floor(r() * 5);
      g.fillStyle = "#1e3a1c"; g.fillRect(x - 0.5, 12 - h, 2, h);
      g.fillStyle = i % 2 ? "#5f8f45" : "#4f7a3a"; g.fillRect(x, 12 - h, 1, h);
      if (i % 2 === 0) { g.fillStyle = "#2a1a0c"; g.fillRect(x - 0.5, 12 - h - 0.5, 2, 3.5); g.fillStyle = "#6b4122"; g.fillRect(x, 12 - h, 1, 2.5); }
    }
    return c;
  }
  if (kind === "mushroom") {
    const [c, g] = treeBase(16, 20);
    shadowEllipse(g, 8, 18.2, 5.5, 1.6);
    g.fillStyle = "#3a2f20"; g.fillRect(6, 9, 4, 9.5);
    g.fillStyle = "#efe6cf"; g.fillRect(6.5, 9, 3, 9); g.fillStyle = "#fffaf0"; g.fillRect(6.5, 9, 1, 9); g.fillStyle = "#cfc4a8"; g.fillRect(8.5, 9, 1, 9);
    const cap = ["#d9413f", "#9b4ad0", "#e8822a"][v % 3];
    litBlob(g, 8, 7.5, 7.5, 5, ramp(cap));
    g.fillStyle = shade(cap, -70); g.fillRect(1.5, 9.5, 13, 1);
    for (const [x, y, s] of [[5, 5, 1.5], [9, 4, 1], [11, 7, 1.5], [4, 8, 1], [7.5, 7.5, 1]]) { g.fillStyle = "#fff"; g.fillRect(x, y, s, s); g.fillStyle = "#e0d8d0"; g.fillRect(x + s - 0.5, y + s - 0.5, 0.5, 0.5); }
    return c;
  }
  if (kind === "willow") {
    const [c, g] = treeBase(22, 28);
    shadowEllipse(g, 11, 26, 8, 2);
    trunk(g, 10, 15, 2.5, 11, "#5a4630");
    const base = tweak("#4f7a3a", jit(), jit() / 3);
    litBlob(g, 11, 9, 9, 7, ramp(base));
    for (let i = 0; i < 16; i++) {
      const x = 3 + i * 1.05 + r() * 0.5, len = 8 + r() * 7;
      g.fillStyle = shade(base, i % 2 ? -20 : 10); g.fillRect(x, 10, 0.5, len);
      g.fillStyle = shade(base, 30); g.fillRect(x, 10 + len - 1, 0.5, 0.5);
    }
    return c;
  }
  if (kind === "palm") {
    const [c, g] = treeBase(22, 30);
    shadowEllipse(g, 11, 28, 6, 1.8);
    for (let i = 0; i < 9; i++) { const x = 10 + Math.sin(i * 0.35) * 1.5, y = 27 - i * 2.4; g.fillStyle = "#3a2a14"; g.fillRect(x - 0.5, y, 3, 2.4); g.fillStyle = i % 2 ? "#8a6a3a" : "#a8844a"; g.fillRect(x, y, 2, 2); g.fillStyle = "#c8a46a"; g.fillRect(x, y, 0.5, 2); }
    const base = tweak("#2f8f3a", jit(), 0);
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI + (k / 6) * Math.PI + (r() - 0.5) * 0.2, len = 9 + r() * 2;
      for (let t = 0; t < len; t += 0.5) {
        const x = 11.5 + Math.cos(a) * t, y = 6 + Math.sin(a) * t * 0.6 + (t * t) / 26;
        const w = Math.max(0.5, 1.8 - Math.abs(t - len * 0.4) * 0.18);
        g.fillStyle = "#0f3a14"; g.fillRect(x - w / 2 - 0.25, y - 0.25, w + 0.5, 1);
        g.fillStyle = t < len * 0.4 ? shade(base, 25) : base; g.fillRect(x - w / 2, y, w, 0.5);
      }
    }
    litBlob(g, 11.5, 6.5, 1.6, 1.4, ramp("#6b4a2a"));
    return c;
  }
  // round-canopy trees: oak, darkoak, birch, autumn
  const big = kind === "birch" ? 0.85 : 1;
  const [c, g] = treeBase(22, 28);
  shadowEllipse(g, 11, 26, 8 * big, 2);
  if (kind === "birch") {
    g.fillStyle = "#2a2a2a"; g.fillRect(9.5, 13, 3, 13);
    g.fillStyle = "#f0ece0"; g.fillRect(10, 13, 2, 13); g.fillStyle = "#ffffff"; g.fillRect(10, 13, 0.5, 13);
    g.fillStyle = "#2a2a2a"; for (let y = 15; y < 26; y += 2.5) g.fillRect(10 + (y % 2), y, 1, 0.5);
  } else trunk(g, 9.5, 14, 3, 12);
  let base = kind === "autumn" ? tweak(AUTUMN_COLS[v % AUTUMN_COLS.length], jit() / 2, 0)
    : kind === "cherry" ? tweak(["#f29cc0", "#f7b6d2", "#e984b0", "#fbc8dc"][v % 4], jit() / 3, 0)
    : kind === "darkoak" ? tweak("#1f5a3a", jit(), -4)
    : kind === "birch" ? tweak("#7ab84a", jit(), 4)
    : tweak("#3d8a3a", jit(), jit() / 3);
  const blobs = kind === "birch"
    ? [[8, 11, 4.5, 4], [14, 11.5, 4.5, 4], [11, 6.5, 5, 4.5]]
    : [[6.5, 12, 5.5, 4.8], [15.5, 12.5, 5.5, 4.6], [11, 7, 7, 6], [11, 13, 6, 4.5]];
  for (const [bx, by, rx, ry] of blobs) litBlob(g, bx, by, rx * big + (r() - 0.5), ry * big, ramp(shade(base, Math.round((r() - 0.5) * 16))));
  leafSpecks(g, 11, 10, 8, 6, shade(base, -40), 26, v + 3);
  leafSpecks(g, 9, 7, 5, 4, shade(base, 50), 14, v + 9);
  if (kind === "autumn" || kind === "cherry") { g.fillStyle = shade(base, 20); for (let i = 0; i < 6; i++) g.fillRect(4 + r() * 14, 25 + r() * 2, 1, 0.5); }
  return c;
}
const TREE_KINDS = ["oak", "darkoak", "pine", "birch", "autumn", "mushroom", "rock", "bush", "fern", "reeds", "willow", "palm", "snowpine", "cherry"];
const TREE_SPRITES = {};
for (const k of TREE_KINDS) TREE_SPRITES[k] = [0, 1, 2, 3].map(v => makeTree(k, v));
const TREES = TREE_SPRITES.oak;

const cloudShadow = (() => {
  const c = makeCanvas(64, 28);
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  for (const [cx, cy, r] of [[18, 16, 10], [32, 11, 11], [46, 16, 9], [30, 19, 9]])
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 64; x++)
        if (Math.hypot(x - cx, y - cy) <= r) g.fillRect(x, y, 1, 1);
  return c;
})();

// ================= People (hi-res with walk frames) =================
const SKINS = ["#f6d2ae", "#e8b98a", "#c98d5c", "#9a6440", "#6e4428"];
const HAIRS = ["#2b1a0e", "#6b3e1e", "#e8c15a", "#111111", "#b5462c", "#d9d0c0", "#ff7eb6"];
const SHIRTS = ["#e94f4f", "#4f8ee9", "#f2a93b", "#9b5de5", "#2ec4b6", "#f4f4f4", "#ff7eb6", "#3fa34d", "#ffd23f"];
const PANTS = ["#2d3a6e", "#3a3a44", "#6b4a2a", "#4a6a8a", "#5a2a4a"];
const HAIR_STYLES = ["short", "long", "pony", "cap", "bun", "spiky"];

function randomLook(type) {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  return {
    type, skin: pick(SKINS), hair: type === "influencer" ? "#ff7eb6" : pick(HAIRS), style: type === "critic" ? "beret" : pick(HAIR_STYLES),
    shirt: pick(SHIRTS), pants: pick(PANTS), cap: pick(SHIRTS), balloon: type === "kid" ? pick(["#ff5c7a", "#5fb4ff", "#ffd23f", "#6ee07a"]) : null,
  };
}

function personFrame(look, frame) {
  const kid = look.type === "kid";
  const [c, g] = hiCanvas(7, 12);
  rawHalf(g, () => {
    const P = (col, x, y, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const top = kid ? 6 : 1;
    const hx = 3, hw = 8;
    // head
    P("#000", hx - 1, top + 1, hw + 2, 7); P("#000", hx, top, hw, 9);
    P(look.skin, hx, top + 1, hw, 7);
    P(shade(look.skin, 25), hx, top + 1, 3, 1);
    P(shade(look.skin, -25), hx + hw - 1, top + 2, 1, 6);
    P("#1a1010", hx + 2, top + 4, 1, 2); P("#1a1010", hx + 5, top + 4, 1, 2);
    P("#fff", hx + 2, top + 4, 1, 1); P("#fff", hx + 5, top + 4, 1, 1);
    P(shade(look.skin, -40), hx + 3, top + 7, 2, 1);
    P("rgba(255,120,120,0.45)", hx + 1, top + 6, 1, 1); P("rgba(255,120,120,0.45)", hx + 6, top + 6, 1, 1);
    // hair
    const H = look.hair, Hd = shade(H, -35), Hl = shade(H, 35);
    if (look.style === "cap") { P(look.cap, hx - 1, top - 1, hw + 2, 3); P(shade(look.cap, 30), hx, top - 1, hw, 1); P(shade(look.cap, -30), hx + hw - 2, top + 2, 4, 1); }
    else if (look.style === "beret") { P("#7a1020", hx - 1, top - 1, hw + 2, 3); P("#a3203a", hx, top - 1, 4, 1); P("#3a0810", hx + 3, top - 2, 1, 1); }
    else {
      P(H, hx - 1, top, hw + 2, 3); P(Hl, hx + 1, top, 3, 1); P(Hd, hx - 1, top + 2, 1, 2); P(Hd, hx + hw, top + 2, 1, 2);
      if (look.style === "long") { P(H, hx - 1, top + 2, 2, 7); P(H, hx + hw - 1, top + 2, 2, 7); P(Hd, hx - 1, top + 6, 1, 3); }
      if (look.style === "pony") { P(H, hx + hw, top + 3, 2, 4); P(Hd, hx + hw + 1, top + 5, 1, 2); }
      if (look.style === "bun") { P(H, hx + 2, top - 3, 4, 3); P(Hl, hx + 3, top - 3, 1, 1); }
      if (look.style === "spiky") { for (let i = 0; i < 4; i++) P(H, hx + i * 2, top - 2 + (i % 2), 2, 2); }
    }
    // body
    const by = top + 9, bh = kid ? 5 : 7;
    P("#000", 2, by, 10, bh + 1);
    P(look.shirt, 3, by, 8, bh);
    P(shade(look.shirt, 30), 3, by, 2, bh - 1);
    P(shade(look.shirt, -30), 9, by, 2, bh);
    // arms swing with the walk
    const swing = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    P(look.skin, 1, by + 1 + swing, 1, 4); P(look.skin, 12, by + 1 - swing, 1, 4);
    P(look.shirt, 1, by + swing, 2, 2); P(look.shirt, 11, by - swing, 2, 2);
    if (look.type === "influencer") { P("#111", 12, by + 3 - swing, 2, 3); P("#5fb4ff", 12, by + 3 - swing, 1, 2); }
    if (look.type === "critic") { P("#fff", 0, by + 2 + swing, 2, 3); P("#bbb", 0, by + 4 + swing, 2, 1); }
    // legs
    const ly = by + bh, lh = kid ? 3 : 5;
    const lOff = frame === 1 ? -1 : 0, rOff = frame === 2 ? -1 : 0;
    P("#000", 3, ly, 8, lh + 2);
    P(look.pants, 4, ly, 3, lh + lOff); P(look.pants, 8, ly, 3, lh + rOff);
    P(shade(look.pants, 25), 4, ly, 1, lh + lOff);
    P("#2a1a10", 3, ly + lh + lOff, 4, 2); P("#2a1a10", 8, ly + lh + rOff, 4, 2);
    P("#5a4a40", 4, ly + lh + lOff, 2, 1); P("#5a4a40", 9, ly + lh + rOff, 2, 1);
  });
  return c;
}
const personCache = new Map();
function personFrames(look) {
  const key = JSON.stringify(look);
  if (!personCache.has(key)) personCache.set(key, [0, 1, 2].map(f => personFrame(look, f)));
  return personCache.get(key);
}

// ================= Staff =================
function staffFrame(type, frame) {
  if (type === "mascot") {
    const [c, g] = hiCanvas(18, 26);
    const leg = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    g.fillStyle = "#000"; g.fillRect(5.5, 18, 3, 6 + leg); g.fillRect(9.5, 18, 3, 6 - leg);
    g.fillStyle = "#e8b830"; g.fillRect(6, 18, 2, 5.5 + leg); g.fillRect(10, 18, 2, 5.5 - leg);
    g.fillStyle = "#c0392b"; g.fillRect(4.5, 23 + leg, 4, 2); g.fillRect(9.5, 23 - leg, 4, 2);
    g.fillStyle = "#ff8080"; g.fillRect(5, 23 + leg, 2, 0.5); g.fillRect(10, 23 - leg, 2, 0.5);
    blit(g, baseSprite("verity"), 0, 0);
    g.fillStyle = "#ffd23f"; g.fillRect(1, 12 + leg, 2.5, 2.5); g.fillRect(14.5, 12 - leg, 2.5, 2.5);
    g.fillStyle = "#fff"; g.fillRect(0.5, 13 + leg, 2, 2); g.fillRect(15.5, 13 - leg, 2, 2);
    return c;
  }
  const look = type === "janitor"
    ? { type: "staff", skin: "#e8b98a", hair: "#6b3e1e", style: "cap", cap: "#2b5fa8", shirt: "#3b6fd0", pants: "#2b4f98" }
    : { type: "staff", skin: "#f6d2ae", hair: "#2b1a0e", style: "cap", cap: "#2e8b3a", shirt: "#3fa34d", pants: "#6b4a2a" };
  const base = personFrame(look, frame);
  const [c, g] = hiCanvas(10, 12);
  if (type === "janitor") {
    g.strokeStyle = "#8a5a32"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(7, 3 + (frame === 1 ? 0.5 : 0)); g.lineTo(9, 11); g.stroke();
    g.fillStyle = "#e8c15a"; g.fillRect(8, 10.5, 2, 1.5); g.fillStyle = "#c99a2a"; g.fillRect(8, 11.5, 2, 0.5);
  }
  blit(g, base, 0, 0);
  if (type === "keeper") { g.fillStyle = "#000"; g.fillRect(6, 7, 3.5, 3); g.fillStyle = "#9aa0b0"; g.fillRect(6.5, 7.5, 2.5, 2); g.fillStyle = "#e8913a"; g.fillRect(6.5, 7.5, 2.5, 0.5); }
  return c;
}
const STAFF_FRAMES = {};
for (const t of ["janitor", "keeper", "mascot"]) STAFF_FRAMES[t] = [0, 1, 2].map(f => staffFrame(t, f));
const STAFF_SPR = { janitor: STAFF_FRAMES.janitor[0], keeper: STAFF_FRAMES.keeper[0], mascot: STAFF_FRAMES.mascot[0] };

// Original blocky-guy and pirate characters for the tug-of-war event
const STEVE_SPR = pixelArt(["kkkkkkkk", "kNNNNNNk", "kNppppNk", "kpwDDwpk", "kppNNppk", "kkkkkkkk", "kcccccck", "pccccccp", "pccccccp", "kcccccck", "kDDDDDDk", "kDDkkDDk", "kDDkkDDk", "kkk..kkk"], PAL);
const PIRATE_SPR = pixelArt(["..kkkk..", ".kkwkkk.", "kkkkkkkk", "kppppppk", "kpkppkpk", "kmmmmmmk", ".kmmmmk.", "kddwwddk", "pddwwddp", "pddwwddp", "kddddddk", "kNNkkNNk", "kNNkkNNk", "kkk..kkk"], PAL);

// ================= Cars =================
const CAR_COLORS = ["#e94f4f", "#4f8ee9", "#f2a93b", "#f4f4f4", "#3a3a44", "#3fa34d", "#9b5de5", "#ffd23f", "#ff7eb6"];
function makeCarUp(color) {
  const [c, g] = hiCanvas(10, 16);
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(1, 1.5, 9, 14.5);
  R("#111", 0.5, 2, 1, 3); R("#111", 8.5, 2, 1, 3); R("#111", 0.5, 11, 1, 3); R("#111", 8.5, 11, 1, 3);
  R("#000", 1, 0.5, 8, 15);
  R(color, 1.5, 1, 7, 14);
  R(shade(color, 35), 1.5, 1, 1.5, 14); R(shade(color, -35), 7, 1, 1.5, 14);
  R("#ffe98a", 2, 0.5, 1.5, 1); R("#ffe98a", 6.5, 0.5, 1.5, 1);
  R("#c0392b", 2, 14.5, 1.5, 1); R("#c0392b", 6.5, 14.5, 1.5, 1);
  R("#1a2a40", 2, 3.5, 6, 2.5); R("#7fb8e8", 2.5, 3.5, 2, 1); R("#4a7aa8", 2.5, 4.5, 5, 1);
  R(shade(color, -15), 2, 6.5, 6, 4); R(shade(color, 20), 2.5, 6.5, 4, 0.5);
  R("#1a2a40", 2, 11, 6, 2); R("#4a7aa8", 2.5, 11, 5, 0.5);
  R(shade(color, -50), 0.5, 5, 1, 1); R(shade(color, -50), 8.5, 5, 1, 1);
  return c;
}
function rotateCanvas(src, quarter) {
  const w = uW(src), h = uH(src);
  const [c, g] = quarter % 2 ? hiCanvas(h, w) : hiCanvas(w, h);
  g.save();
  if (quarter === 1) { g.translate(h, 0); g.rotate(Math.PI / 2); }
  if (quarter === 2) { g.translate(w, h); g.rotate(Math.PI); }
  if (quarter === 3) { g.translate(0, w); g.rotate(-Math.PI / 2); }
  blit(g, src, 0, 0);
  g.restore();
  return c;
}
// dir: 0 up, 1 right, 2 down, 3 left
const CAR_SPRITES = CAR_COLORS.map(col => { const up = makeCarUp(col); return [up, rotateCanvas(up, 1), rotateCanvas(up, 2), rotateCanvas(up, 3)]; });

// ================= Gate =================
// The park entrance, seen from above: stone pillars stand north and south of the
// east-west path, a timber beam spans it, and a sign board sits on top. Built on first
// use (it uses the pixel font defined at the end of this file).
// Sprite origin is 16 units left of and 34 units above the gate tile's top-left corner.
let GATE_SPR = null;
function gateSprite() {
  if (GATE_SPR) return GATE_SPR;
  const [c, g] = hiCanvas(48, 64);
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const stone = (x, y, w, h) => {
    R("#000", x - 0.5, y - 0.5, w + 1, h + 1);
    R("#8a8494", x, y, w, h);
    for (let yy = y; yy < y + h; yy += 3) {
      R("#6a6474", x, yy + 2.5, w, 0.5);
      for (let xx = x + ((yy - y) % 6 ? 0 : 2.5); xx < x + w; xx += 5) R("#6a6474", xx, yy, 0.5, 2.5);
      R("#a8a2b4", x, yy, w, 0.5);
    }
    R("#5a5464", x + w - 1.5, y, 1.5, h);   // shaded east side
    R("#b4aec0", x, y, 1, h);               // lit west side
  };
  const pillar = (baseY) => {
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(21, baseY - 1, 12, 3);
    stone(19, baseY - 14, 10, 14);
    R("#000", 17.5, baseY - 17.5, 13, 4); R("#c4bed0", 18, baseY - 17, 12, 3); R("#e0dcea", 18, baseY - 17, 12, 1); R("#8a8494", 18, baseY - 14.5, 12, 0.5);
    // lantern on the cap
    R("#000", 22, baseY - 22, 4, 5); R("#ffe98a", 22.5, baseY - 21.5, 3, 3.5); R("#fff8d0", 22.5, baseY - 21.5, 1, 1); R("#2a2a2a", 21.5, baseY - 22.5, 5, 1);
  };
  // ticket booth by the car park
  g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(3, 33, 12, 2);
  R("#000", 1.5, 21.5, 12, 13); R("#f0e4c8", 2, 22, 11, 12); R("#d8c8a4", 12, 22, 1, 12);
  R("#000", 4, 24.5, 7, 5); R("#3a5a7a", 4.5, 25, 6, 4); R("#9ac8e8", 4.5, 25, 2, 1); R("#ffd9a0", 6, 27, 2, 2);
  R("#7a4a22", 3.5, 30, 8, 1.5); R("#a8703c", 3.5, 30, 8, 0.5);
  R("#000", 0.5, 17.5, 14, 5);
  for (let x = 1; x < 14; x += 2) R(Math.floor(x / 2) % 2 ? "#ffffff" : "#e94f4f", x, 18, 2, 4);
  R("#a3203a", 1, 21.5, 13, 0.5);
  pillar(34);
  pillar(60);
  // timber beam resting on the two pillar caps
  R("#000", 20.5, 16.5, 7, 30); R("#8a5a32", 21, 17, 6, 29); R("#b07a44", 21, 17, 2, 29); R("#5a3a1e", 26, 17, 1, 29);
  for (let y = 20; y < 45; y += 6) R("#5a3a1e", 21, y, 6, 0.5);
  // sign board raised on posts above the north end of the beam, facing the visitors
  R("#000", 20.5, 11, 2, 7); R("#5a3a1e", 21, 11, 1, 7); R("#000", 25.5, 11, 2, 7); R("#5a3a1e", 26, 11, 1, 7);
  R("#000", 1, -1, 46, 15); R("#7a4a22", 2, 0, 44, 13); R("#ffd23f", 3, 0, 42, 13); R("#fff09a", 3, 0, 42, 1); R("#c99a00", 3, 12, 42, 1);
  pixelText(g, "VERITY", 24, 1, "#2b1d00");
  pixelText(g, "SANCTUARY", 24, 7, "#7a4a22");
  GATE_SPR = c;
  return c;
}

// ================= Shops & decor sprites (16x20, bottom-anchored) =================
function makeObjSprite(type) {
  const [c, g] = hiCanvas(16, 20);
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const stand = (c1, c2) => {
    R("rgba(0,0,0,0.25)", 1, 18, 15, 2);
    R("#000", 1, 10, 14, 9); R("#a8703c", 2, 11, 12, 7); R("#c48a4a", 2, 12, 12, 1); R("#7a4a22", 2, 16, 12, 2);
    for (let x = 3; x < 14; x += 3) R("#8a5a2c", x, 13, 0.5, 3);
    R("#e8d3b0", 1, 9, 14, 2); R("#fff4dc", 1, 9, 14, 0.5); R("#000", 1, 9, 14, 0.5);
    R("#2a1a0c", 2, 4, 1, 6); R("#2a1a0c", 13, 4, 1, 6); R("#5a3a1e", 2, 4, 0.5, 6); R("#5a3a1e", 13, 4, 0.5, 6);
    R("#000", 0, 0, 16, 6);
    for (let x = 1; x < 15; x++) { R(Math.floor((x - 1) / 2) % 2 ? c2 : c1, x, 1, 1, 4); }
    R("rgba(255,255,255,0.35)", 1, 1, 14, 0.5); R("rgba(0,0,0,0.18)", 1, 4.5, 14, 0.5);
    for (let x = 0; x < 16; x += 4) { R(c1, x + 1, 5, 2, 1); R("#000", x + 1, 6, 2, 0.5); }
  };
  switch (type) {
    case "fries":
      stand("#e33d3d", "#fff");
      R("#000", 6, 6, 5, 5); R("#e33d3d", 7, 8, 3, 3); R("#ff7070", 7, 8, 0.5, 3); R("#ffd23f", 7, 6, 1, 2); R("#ffd23f", 9, 6, 1, 2); R("#ffe98a", 8, 5, 1, 3); R("#fff6c0", 8, 5, 0.5, 1);
      break;
    case "lemonade":
      stand("#ff7eb6", "#fff");
      R("#000", 6, 5, 5, 6); R("#fff8b0", 7, 6, 3, 4); R("#ffd23f", 7, 8, 3, 2); R("#fff", 7, 6, 0.5, 4); R("#ff7eb6", 9, 3, 1, 4); R("#6ee07a", 7.5, 7, 1, 1);
      break;
    case "burger":
      stand("#3fa34d", "#fff");
      R("#000", 5, 5, 7, 6); R("#d98b3a", 6, 6, 5, 1); R("#e8a85a", 6, 5, 5, 1); R("#fff3c0", 7, 5, 0.5, 0.5); R("#fff3c0", 9, 5, 0.5, 0.5); R("#5ab84a", 6, 7, 5, 1); R("#ffd23f", 6, 7.5, 5, 0.5); R("#6b3a1a", 6, 8, 5, 1); R("#d98b3a", 6, 9, 5, 1);
      break;
    case "flowers": {
      R("rgba(0,0,0,0.2)", 2, 17, 13, 2);
      R("#000", 2, 12, 12, 6); R("#6b4122", 3, 13, 10, 4); R("#8a5a32", 3, 13, 10, 1);
      for (let x = 3; x < 13; x += 1.5) R("#4e2c10", x, 15, 0.5, 0.5);
      const cols = ["#ff8fb8", "#fff3a1", "#c9a7ff", "#ff5c7a", "#ffffff"];
      for (let i = 0; i < 5; i++) {
        const x = 3 + i * 2;
        R("#2f7a2c", x + 0.5, 10, 0.5, 3); R("#4fbf3a", x - 0.5, 11, 1, 0.5);
        R(cols[i], x, 8 + (i % 2), 2, 2); R("#ffd23f", x + 0.5, 8.5 + (i % 2), 1, 1);
      }
      break;
    }
    case "bench":
      R("rgba(0,0,0,0.25)", 1, 17, 15, 2);
      R("#2a1a0c", 3, 14, 1, 4); R("#2a1a0c", 12, 14, 1, 4);
      R("#000", 1, 8, 14, 3); R("#a8703c", 2, 9, 12, 1); R("#c48a4a", 2, 9, 12, 0.5);
      R("#000", 1, 12, 14, 3); R("#c48a4a", 2, 13, 12, 1); R("#e0a868", 2, 13, 12, 0.5);
      R("#2a1a0c", 2, 10, 1, 3); R("#2a1a0c", 13, 10, 1, 3);
      break;
    case "lamp":
      R("rgba(0,0,0,0.25)", 4, 18, 9, 2);
      R("#000", 5, 16, 6, 3); R("#3a3a4a", 6, 17, 4, 1);
      R("#000", 7, 4, 2, 13); R("#4a4a5e", 7, 5, 1, 11); R("#7a7a8e", 7, 5, 0.5, 11);
      R("#000", 4, 0, 8, 5); R("#ffe98a", 5, 1, 6, 3); R("#fff", 6, 1, 2, 1); R("#ffd23f", 5, 3.5, 6, 0.5);
      break;
    case "fountain":
      R("rgba(0,0,0,0.25)", 1, 18, 15, 2);
      R("#000", 0, 11, 16, 8); R("#9a9aae", 1, 12, 14, 6); R("#c9c9d9", 1, 12, 14, 1);
      for (let x = 2; x < 15; x += 3) R("#7a7a8e", x, 15, 0.5, 3);
      R("#3d8fe0", 2, 13, 12, 3); R("#9fd4ff", 3, 13, 4, 0.5); R("#6fb4f0", 8, 14, 3, 0.5);
      R("#000", 6, 5, 4, 8); R("#9a9aae", 7, 6, 2, 6); R("#c9c9d9", 7, 6, 0.5, 6);
      R("#000", 4, 4, 8, 2); R("#c9c9d9", 5, 4, 6, 1);
      break;
    case "statue": {
      R("rgba(0,0,0,0.25)", 1, 18, 15, 2);
      R("#000", 2, 12, 12, 7); R("#9a9aae", 3, 13, 10, 5); R("#c9c9d9", 3, 13, 10, 1); R("#6f6f84", 3, 17, 10, 1);
      R("#ffd23f", 5, 15, 6, 1);
      const [og, gg] = hiCanvas(12, 12);
      drawBody(gg, 1, 1, 10, "#e8b830", null, null);
      dots(gg, { x: 0, y: 0 }, "#6b4a00", [[4, 4], [4, 5], [7, 4], [7, 5], [3, 7], [4, 8], [5, 8], [6, 8], [7, 8], [8, 7]]);
      blit(g, og, 2, 1);
      break;
    }
  }
  return c;
}
const OBJ_SPRITES = {};
for (const k of Object.keys(OBJECTS)) OBJ_SPRITES[k] = makeObjSprite(k);

// ================= UI icons =================
const ICONS = {
  coin: ["..kkkkkk..", ".kyyyyyyk.", "kyYyyyyyok", "kyykyykyok", "kyykyykyok", "kyyyyyyyok", "kykyyyykok", "kyykkkkyok", ".kooooook.", "..kkkkkk.."],
  rate: ["....kk....", "...kggk...", "..kggggk..", ".kggggggk.", "kkkggggkkk", "...kggk...", "...kggk...", "...kGGk...", "...kGGk...", "...kkkk..."],
  visitor: ["..kkkkkk..", ".kNNNNNNk.", ".kpkppkpk.", ".kppppppk.", "..kkkkkk..", ".kbbbbbbk.", "kbbbbbbbbk", "kbkbbbbkbk", "..kBkkBk..", "..kk..kk.."],
  heart: [".kk....kk.", "krrk..krrk", "krwrkkrrrk", "krrrrrrrRk", "krrrrrrrRk", ".krrrrrRk.", "..krrrRk..", "...krRk...", "....kk...."],
  info: ["..kkkkkk..", ".kbbbbbbk.", "kbbbwwbbbk", "kbbbbbbbbk", "kbbbwwbbbk", "kbbbwwbbbk", "kbbbwwbbbk", "kbbbwwbbbk", ".kbbbbbbk.", "..kkkkkk.."],
  hammer: [".kkkkkkk..", ".ksssssk..", ".kSSSSSk..", ".kkkmkkk..", "...kmk....", "...kmk....", "...kmk....", "...kmk....", "...kNk....", "...kkk...."],
  inspect: ["..kkkk....", ".kbwbbk...", "kbwbbbbk..", "kbbbbbbk..", "kbbbbbbk..", ".kbbbbk...", "..kkkkmk..", "......kmk.", ".......kmk", "........kk"],
  path: ["kkkkkkkkkk", "kgggggGggk", "kttttttttk", "ktTttttTtk", "kttttTtttk", "kttTttttTk", "kttttttttk", "kggGgggggk", "kgggggggGk", "kkkkkkkkkk"],
  fence: ["kk..kk..kk", "nk..nk..nk", "kkkkkkkkkk", "nmmmmmmmmk", "kkkkkkkkkk", "nk..nk..nk", "kkkkkkkkkk", "nmmmmmmmmk", "kkkkkkkkkk", "Nk..Nk..Nk"],
  shovel: ["........kk", ".......kmk", "......kmk.", ".....kmk..", "..k.kmk...", ".kskmk....", "kssSk.....", "ksssSk....", ".kssSk....", "..kkk....."],
  egg: ["...kkkk...", "..keeeek..", ".keweeeek.", ".kweeyeek.", "keeeyyeeek", "keeeeeyeEk", "keyeeeeeEk", "keeeeeeEEk", ".keeeEEEk.", "..kkkkkk.."],
  book: ["kkkkkkkkkk", "kRrrrrrrrk", "kRrwwwwrrk", "kRrrrrrrrk", "kRrrrrrrrk", "kRrrrrrrrk", "kRrrrrrrrk", "kRwwwwwwwk", "kRkkkkkkkk", "kkkkkkkkk."],
  disk: ["kkkkkkkkk.", "kbkwwwwkbk", "kbkwwwwkbk", "kbkkkkkkbk", "kbbbbbbbbk", "kbkkkkkkbk", "kbksssskbk", "kbksssskbk", "kbksssskbk", "kkkkkkkkkk"],
  flask: ["...kkkk...", "...kwwk...", "...kwwk...", "..kwwwwk..", ".kwwwwwwk.", "kggggggggk", "kgwggggggk", "kggggggGGk", ".kgggGGGk.", "..kkkkkk.."],
  trophy: ["kkkkkkkkkk", "kyYyyyyyok", "kyYyyyyyok", ".kyyyyyok.", "..kyyyok..", "...kyok...", "...kook...", "...kook...", "..kyyyyk..", "..kkkkkk.."],
  star: ["....kk....", "...kyyk...", "kkkkyykkkk", "kyyyYyyyyk", ".kyyyyyyk.", "..kyyyyk..", ".kyyookyyk", ".kyk..kyk.", ".kk....kk."],
  sound: ["....k.....", "...kk..k..", "kkkwk...k.", "kwwwk.k.k.", "kwwwk.k.k.", "kkkwk...k.", "...kk..k..", "....k....."],
  mute: ["....k.....", "...kk.....", "kkkwk.r.r.", "kwwwk..r..", "kwwwk.r.r.", "kkkwk.....", "...kk.....", "....k....."],
  shop: ["kkkkkkkkkk", "krwrwrwrwk", "krwrwrwrwk", "kkkkkkkkkk", ".kmmmmmmk.", ".kmyyyymk.", ".kmyyyymk.", ".kmmmmmmk.", ".kkkkkkkk."],
};
const iconURLCache = {};
function iconURL(name) {
  if (!iconURLCache[name]) {
    const c = name === "logo" ? baseSprite("verity") : pixelArt(ICONS[name], PAL);
    iconURLCache[name] = c.toDataURL();
  }
  return iconURLCache[name];
}
function applyIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(el => {
    el.style.backgroundImage = `url(${iconURL(el.dataset.icon)})`;
  });
}



// ================= Trash, bubbles, crown, eggs =================
const TRASH_SPR = [
  pixelArt(["kk.", "rrk", "wrk"], PAL),
  pixelArt(["kkk", "yyk"], PAL),
  pixelArt([".k.", "kbk", "kbk"], PAL),
];

const BUBBLE_ICONS = {
  food:    ["..o..", ".ooo.", "GGGGG", "NNNNN", ".ooo."],
  heart:   [".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."],
  coin:    [".yyy.", "yyyyy", "yyoyy", "yyyyy", ".yyy."],
  bored:   ["..kk.", ".k..k", "...k.", "..k..", "..k.."],
  scared:  ["..r..", "..r..", "..r..", ".....", "..r.."],
  angry:   ["r...r", ".r.r.", ".....", ".rrr.", "r...r"],
  rain:    ["..b..", ".bbb.", "bbbbb", "..k..", ".kk.."],
  star:    ["..y..", ".yyy.", "yyyyy", ".y.y.", "y...y"],
  sleep:   ["kkkk.", "..k..", ".k...", "kkkk.", "....."],
};
const BUBBLE_SPR = {};
for (const [k, rows] of Object.entries(BUBBLE_ICONS)) {
  const c = makeCanvas(9, 9), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 9, 7); g.fillRect(3, 7, 2, 1); g.fillRect(3, 8, 1, 1);
  g.fillStyle = "#fff"; g.fillRect(1, 1, 7, 5); g.fillRect(3, 6, 1, 1);
  g.drawImage(pixelArt(rows, PAL), 2, 1, 5, 5);
  BUBBLE_SPR[k] = c;
}

const CROWN_SPR = (() => {
  const [c, g] = hiCanvas(5, 3.5);
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R("#5a3a00", 0, 0.5, 5, 3); R("#ffd23f", 0.5, 1, 4, 2); R("#fff09a", 0.5, 1, 4, 0.5);
  R("#5a3a00", 0, 0, 1, 1); R("#5a3a00", 2, 0, 1, 1); R("#5a3a00", 4, 0, 1, 1);
  R("#ffd23f", 0.25, 0.25, 0.5, 0.75); R("#ffd23f", 2.25, 0.25, 0.5, 0.75); R("#ffd23f", 4.25, 0.25, 0.5, 0.75);
  R("#ff5c7a", 1, 2, 0.5, 0.5); R("#5fb4ff", 2.25, 2, 0.5, 0.5); R("#6ee07a", 3.5, 2, 0.5, 0.5);
  return c;
})();

function makeEggSprite(light, base, dark, outline, spot) {
  const c = makeCanvas(26, 32), g = c.getContext("2d");
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 26; x++) {
      const dx = (x - 12.5) / 12.5, dy = (y - 17) / (y < 17 ? 16 : 14.5);
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      g.fillStyle = d > 0.9 ? outline : (x + y < 18 ? light : (x > 16 && y > 18 ? dark : base));
      g.fillRect(x, y, 1, 1);
    }
  g.fillStyle = spot;
  for (const [x, y, sz] of [[7, 10, 3], [15, 7, 2], [17, 17, 3], [8, 21, 2], [13, 25, 2]]) g.fillRect(x, y, sz, sz);
  return c;
}
const EGG_SPR = {
  regular: makeEggSprite("#fffaf0", "#f6efe0", "#d9cdb4", "#3a2f20", "#ffd23f"),
  golden:  makeEggSprite("#fff6c0", "#ffd23f", "#d9a820", "#5a3a00", "#ffffff"),
  cursed:  makeEggSprite("#8a5ab0", "#5a2a7a", "#3a1a50", "#120018", "#9be22d"),
};

Object.assign(ICONS, {
  tree: ["...kkkk...", "..kGGGGk..", ".kGgGGGGk.", "kGgGGGGGGk", "kGGGGGGGGk", ".kGGGGGGk.", "..kkmmkk..", "....mm....", "....mm....", "...kkkk..."],
  staff: ["..kkkkkk..", ".kggggggk.", "kkkkkkkkkk", "..kppppk..", "..kpkkpk..", "..kkkkkk..", ".kggggggk.", "kggggggggk", "kgkggggkgk", "..kk..kk.."],
  insta: [".kkkkkkkk.", "kwwwwwwwwk", "kwVVVVwVwk", "kwPPwwPPwk", "kwPwPPwPwk", "kwPwPPwPwk", "kwOOwwOOwk", "kwOOOOOOwk", "kwwwwwwwwk", ".kkkkkkkk."],
  scroll: ["kkkkkkkk..", "keeeeeeek.", "keEEEEek..", "keeeeeek..", "keEEEEek..", "keeeeeek..", "keEEEek...", "keeeeeeek.", ".kkkkkkkk."],
  shard: ["....kk....", "...kbbk...", "..kbwbbk..", ".kbwbbbbk.", ".kbbbbbBk.", ".kbbbbbBk.", "..kbbbBk..", "...kbBk...", "....kk...."],
  camera: ["..kkk.....", "kkkkkkkkkk", "ksssssssSk", "ksskwwkssk", "kskwbbwksk", "kskwbbwksk", "ksskwwkssk", "ksssssssSk", "kkkkkkkkkk"],
  music: ["...kkkkkk.", "...kyyyyk.", "...k....k.", "...k....k.", "...k....k.", ".kkk..kkk.", "kyyk.kyyk.", "kyyk.kyyk.", ".kk...kk.."],
  sun: ["....yy....", ".y..yy..y.", "..yyyyyy..", "..yYYYYy..", "yyyYYYYyyy", "yyyYYYYyyy", "..yYYYYy..", "..yyyyyy..", ".y..yy..y.", "....yy...."],
  moon: ["...kkkk...", "..kYYYk...", ".kYYYk....", ".kYYk.....", ".kYYk.....", ".kYYk.....", ".kYYYk....", "..kYYYk...", "...kkkkk.."],
  cloud: ["..........", "...kkkk...", "..kssssk..", ".kssssssk.", "kssssssssk", "kSSSSSSSSk", ".kkkkkkkk."],
  rain: ["..kkkkk...", ".kssssssk.", "kssssssssk", "kSSSSSSSSk", ".kkkkkkkk.", "..b..b..b.", ".b..b..b..", "..b..b..b.", ".b..b..b.."],
  storm: ["..kkkkk...", ".kSSSSSSk.", "kSSSSSSSSk", "kSSSSSSSSk", ".kkkkkkkk.", "....yy....", "...yy.....", "..yyyy....", "....yy....", "...yy....."],
  car: ["..........", "..kkkkkk..", ".krrrrrrk.", ".krbbbbrk.", "kkrrrrrrkk", "krrrrrrrrk", "krYrrrrYrk", "kkkkkkkkkk", ".kk....kk.", ".........."],
  goldegg: ["...kkkk...", "..kYYYYk..", ".kYwYYYYk.", ".kwYYyYYk.", "kYYYyyYYYk", "kYYYYYyYok", "kYyYYYYYok", "kYYYYYYook", ".kYYYoook.", "..kkkkkk.."],
  cursedegg: ["...kkkk...", "..kRRRRk..", ".kRrRRRRk.", ".krRRgRRk.", "kRRRggRRRk", "kRRRRRgRNk", "kRgRRRRRNk", "kRRRRRRNNk", ".kRRRNNNk.", "..kkkkkk.."],
});


// ================= Tiny pixel font (3x5) for text drawn in the world =================
const PIXEL_FONT = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111",
  9: "111101111001110", "?": "110001010000010", "!": "010010010000010", "-": "000000111000000", ".": "000000000000010",
  "+": "000010111010000", "%": "101001010100101", ":": "000010000010000", " ": "000000000000000",
};
// Draws text centred on x with its top at y, 1 world unit per font pixel (times `scale`).
function pixelText(g, text, x, y, color, scale = 1) {
  text = String(text).toUpperCase();
  const w = text.length * 4 * scale - scale;
  let cx = Math.round(x - w / 2);
  g.fillStyle = color;
  for (const ch of text) {
    const bits = PIXEL_FONT[ch] || PIXEL_FONT["?"];
    for (let i = 0; i < 15; i++) if (bits[i] === "1") g.fillRect(cx + (i % 3) * scale, Math.round(y) + Math.floor(i / 3) * scale, scale, scale);
    cx += 4 * scale;
  }
}
