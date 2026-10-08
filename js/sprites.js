"use strict";

// ================= Pixel helpers =================
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
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

function drawBody(g, ox, oy, D, color, shape, pattern) {
  const c = (D - 1) / 2, R = D / 2;
  const metric = (dx, dy) => {
    if (shape === "tall") return Math.hypot(dx * 1.25, dy);
    if (shape === "jaw" && dy > 0) return Math.max(Math.abs(dx) * 1.04, Math.abs(dy) * 1.04, Math.hypot(dx, dy) * 0.9);
    return Math.hypot(dx, dy);
  };
  const inLocal = (x, y) => x >= 0 && y >= 0 && x < D && y < D && metric(x - c, y - c) <= R - 0.1;
  const outline = shade(color, -110), low = shade(color, -35), hi = shade(color, 70);
  const stripe = shade(color, -24), dith = shade(color, 28);
  for (let y = 0; y < D; y++)
    for (let x = 0; x < D; x++) {
      if (!inLocal(x, y)) continue;
      const edge = !inLocal(x - 1, y) || !inLocal(x + 1, y) || !inLocal(x, y - 1) || !inLocal(x, y + 1);
      let col = color;
      if (edge) col = outline;
      else if (metric(x - c, y - c) > R - 2.4 && y - c > D * 0.15) col = low;
      else if (pattern === "stripes" && x % 3 === 0) col = stripe;
      else if (pattern === "dither" && (x + y) % 2 === 0) col = dith;
      g.fillStyle = col;
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  const hx = Math.round(c - R * 0.5), hy = Math.round(c - R * 0.55);
  g.fillStyle = hi;
  for (const [x, y] of [[hx, hy], [hx + 1, hy], [hx, hy + 1]]) if (inLocal(x, y)) g.fillRect(ox + x, oy + y, 1, 1);
  return (x, y) => inLocal(x - ox, y - oy);
}

const SPR_PAD_X = 3, SPR_PAD_T = 6, SPR_PAD_B = 3;

function bodySize(key, ind) {
  return (VARIANTS[key].size || 12) + (ind ? SIZES[ind.size].d : 0);
}

function buildVariantSprite(key, ind) {
  const def = VARIANTS[key];
  const D = bodySize(key, ind);
  const c = makeCanvas(D + SPR_PAD_X * 2, D + SPR_PAD_T + SPR_PAD_B);
  const g = c.getContext("2d");
  let color = def.color;
  if (ind) {
    color = tweak(color, ind.hue, ind.light);
    if (ind.shiny) color = tweak(color, 150, 6);
  }
  const inside = drawBody(g, SPR_PAD_X, SPR_PAD_T, D, color, def.shape, def.pattern);
  const off = (D - 12) / 2;
  const o = { x: SPR_PAD_X + off, y: SPR_PAD_T + off };
  if (ind) drawMarking(g, o, ind, color, inside);
  FACES[def.face](g, o, def.ink || "#2b1d00", color);
  if (ind) drawAccessory(g, o, ind.acc);
  return c;
}

const spriteCache = new Map();
function spriteFor(ind) {
  const key = "i" + ind.id;
  if (!spriteCache.has(key)) spriteCache.set(key, buildVariantSprite(ind.k, ind));
  return spriteCache.get(key);
}
function baseSprite(k) {
  const key = "b" + k;
  if (!spriteCache.has(key)) spriteCache.set(key, buildVariantSprite(k, null));
  return spriteCache.get(key);
}
function silhouetteSprite() {
  if (spriteCache.has("sil")) return spriteCache.get("sil");
  const c = makeCanvas(18, 21);
  const g = c.getContext("2d");
  drawBody(g, 3, 6, 12, "#14122a", null, null);
  g.fillStyle = "#4b4778";
  [[8,9],[9,9],[10,10],[9,11],[8,12],[8,14]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  spriteCache.set("sil", c);
  return c;
}

// ================= Tiles =================
const grassTiles = [0, 1, 2, 3].map(i => {
  const c = makeCanvas(TILE, TILE);
  const g = c.getContext("2d");
  g.fillStyle = "#4a9a3f"; g.fillRect(0, 0, TILE, TILE);
  const r = seeded(i * 97 + 13);
  for (let n = 0; n < 10; n++) {
    g.fillStyle = r() < 0.5 ? "#3f8a36" : "#5bae4b";
    g.fillRect(Math.floor(r() * TILE), Math.floor(r() * TILE), 1, r() < 0.4 ? 2 : 1);
  }
  return c;
});

const PATH_EDGE = { 1: "#a8834d", 2: "#6f6f84", 3: "#b8902a" };
const pathTile = (() => {
  const c = makeCanvas(TILE, TILE);
  const g = c.getContext("2d");
  g.fillStyle = "#d8b47a"; g.fillRect(0, 0, TILE, TILE);
  const r = seeded(7);
  for (let n = 0; n < 8; n++) { g.fillStyle = r() < 0.5 ? "#c49d62" : "#e6c793"; g.fillRect(Math.floor(r() * TILE), Math.floor(r() * TILE), 1, 1); }
  return c;
})();

const pathTiles = {
  1: pathTile,
  2: (() => {
    const c = makeCanvas(TILE, TILE), g = c.getContext("2d");
    g.fillStyle = "#a9a9b8"; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = "#8a8a9c";
    for (let y = 0; y < TILE; y += 5) { g.fillRect(0, y, TILE, 1); for (let x = (y / 5) % 2 ? 2 : 6; x < TILE; x += 8) g.fillRect(x, y, 1, 5); }
    g.fillStyle = "#c4c4d2"; [[2, 2], [9, 7], [4, 12], [12, 1], [13, 13]].forEach(([x, y]) => g.fillRect(x, y, 2, 1));
    return c;
  })(),
  3: (() => {
    const c = makeCanvas(TILE, TILE), g = c.getContext("2d");
    g.fillStyle = "#f0c63a"; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = "#c99a2a";
    for (let y = 0; y < TILE; y += 4) { g.fillRect(0, y + 3, TILE, 1); for (let x = (y / 4) % 2 ? 0 : 4; x < TILE; x += 8) g.fillRect(x, y, 1, 3); }
    g.fillStyle = "#fff09a"; for (let y = 0; y < TILE; y += 4) g.fillRect(1, y, 2, 1);
    return c;
  })(),
};

// Enclosure ground for any size (3-5 tiles) and theme, cached
const FENCES = {
  wood:  { dark: "#4e2c10", hi: "#a8703c", mid: "#7a4a22", post: "#2a1a0c" },
  metal: { dark: "#3a3f4c", hi: "#c4cad6", mid: "#7a8292", post: "#1e2129" },
  wall:  { dark: "#6b5a1e", hi: "#efe08a", mid: "#c9b458", post: "#4a3d10" },
};
const encGroundCache = {};
function makeEncGround(size, theme = "meadow") {
  const key = size + ":" + theme;
  if (encGroundCache[key]) return encGroundCache[key];
  const W = size * TILE;
  const c = makeCanvas(W, W);
  const g = c.getContext("2d");
  const r = seeded(42 + size * 7 + theme.length * 13);
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const sprinkle = (cols, n, x0 = 0, y0 = 0, w = W, h = W) => { for (let i = 0; i < n; i++) R(cols[Math.floor(r() * cols.length)], x0 + Math.floor(r() * w), y0 + Math.floor(r() * h), 1, 1); };
  let fence = FENCES.wood;
  if (theme === "pool") {
    R("#6cbf55", 0, 0, W, W); sprinkle(["#5aad47", "#83d06a"], W);
    R("#000", 6, 7, W - 12, W - 16); R("#e8e0c8", 7, 8, W - 14, W - 18);
    R("#2f7fd0", 9, 10, W - 18, W - 22); R("#3d8fe0", 10, 11, W - 20, W - 24);
    for (let i = 0; i < size * 3; i++) R("#9fd4ff", 11 + Math.floor(r() * (W - 26)), 12 + Math.floor(r() * (W - 28)), 3, 1);
    R("#c9c9d9", W - 14, 8, 1, 6); R("#c9c9d9", W - 11, 8, 1, 6); R("#c9c9d9", W - 14, 10, 4, 1); R("#c9c9d9", W - 14, 12, 4, 1);
    R("#ff5c7a", 9, W - 9, 6, 2); R("#fff", 11, W - 9, 2, 2);
  } else if (theme === "lab") {
    fence = FENCES.metal;
    for (let y = 0; y < W; y += 4) for (let x = 0; x < W; x += 4) R(((x + y) / 4) % 2 ? "#cfd6e0" : "#b8c2d0", x, y, 4, 4);
    R("#000", W - 18, 5, 13, 6); R("#5a6070", W - 17, 6, 11, 4);
    R("#6ee07a", W - 16, 4, 2, 3); R("#ff7eb6", W - 12, 3, 2, 4); R("#5fb4ff", W - 9, 4, 2, 3);
    for (let x = 4; x < W - 4; x += 4) { R("#ffd23f", x, W - 7, 2, 2); R("#222", x + 2, W - 7, 2, 2); }
    R("#2b2b3a", 6, 14, 1, W - 24); R("#ff5c7a", 6, 14, 1, 1);
  } else if (theme === "stage") {
    for (let y = 0; y < W; y += 3) { R(y % 6 ? "#b07a44" : "#9a6838", 0, y, W, 3); R("#6b4220", 0, y + 2, W, 1); }
    for (let i = 0; i < size * 2; i++) R("#6b4220", Math.floor(r() * W), Math.floor(r() * W / 3) * 3, 1, 2);
    R("#7a1020", 3, 3, W - 6, 7);
    for (let x = 3; x < W - 3; x += 3) R("#a3203a", x, 3, 2, 7);
    R("#ffd23f", 3, 10, W - 6, 1);
    g.fillStyle = "rgba(255,240,180,0.18)";
    for (const cx of [W * 0.3, W * 0.7]) { g.beginPath(); g.ellipse(cx, W * 0.62, W * 0.18, W * 0.12, 0, 0, Math.PI * 2); g.fill(); }
  } else if (theme === "backrooms") {
    fence = FENCES.wall;
    R("#b8a35a", 0, 0, W, W);
    for (let y = 0; y < W; y++) for (let x = (y % 2); x < W; x += 2) if (r() < 0.25) R("#a8934a", x, y, 1, 1);
    for (let x = 0; x < W; x += 3) R(x % 6 ? "#e0cf7a" : "#cdbb63", x, 3, 3, 7);
    R("#fffbe0", W / 2 - 6, 14, 12, 3); R("#fff3a1", W / 2 - 5, 15, 10, 1);
    sprinkle(["#8a7a3a"], size * 4, 4, 12, W - 8, W - 16);
  } else {
    R("#6cbf55", 0, 0, W, W); sprinkle(["#5aad47", "#83d06a", "#5aad47"], W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - W / 2, (y - W / 2 - 1) * 1.3) < W * 0.19 && r() < 0.55) R("#8fb25a", x, y, 1, 1);
    R("#000", W - 17, W - 11, 12, 7); R("#7a4a22", W - 16, W - 10, 10, 5); R("#3d8fe0", W - 15, W - 9, 8, 2); R("#9fd4ff", W - 14, W - 9, 3, 1);
    R("#1f5a24", W - 12, 4, 8, 6); R("#1f5a24", W - 11, 3, 6, 8); R("#3f8f3a", W - 11, 4, 6, 5); R("#6cc35a", W - 10, 4, 2, 2); R("#ff8fb8", W - 7, 6, 1, 1);
  }
  // food bowl (every theme)
  R("#000", 5, W - 10, 8, 5); R("#c94a4a", 6, W - 9, 6, 3); R("#e8c15a", 7, W - 9, 4, 1);
  // fence
  R(fence.dark, 0, 0, W, 3); R(fence.dark, 0, W - 3, W, 3); R(fence.dark, 0, 0, 3, W); R(fence.dark, W - 3, 0, 3, W);
  R(fence.hi, 0, 0, W, 1); R(fence.hi, 0, W - 3, W, 1); R(fence.hi, 0, 0, 1, W); R(fence.hi, W - 3, 0, 1, W);
  R(fence.mid, 1, 1, W - 2, 1); R(fence.mid, 1, W - 2, W - 2, 1); R(fence.mid, 1, 1, 1, W - 2); R(fence.mid, W - 2, 1, 1, W - 2);
  for (let p = 0; p < W; p += 8) {
    const q = Math.min(p, W - 4);
    for (const [px, py] of [[q, 0], [q, W - 4], [0, q], [W - 4, q]]) { R(fence.post, px, py, 4, 4); R(fence.hi, px + 1, py + 1, 2, 1); }
  }
  return (encGroundCache[key] = c);
}
const encGround = makeEncGround(3, "meadow");

function treeSprite(leaf, leafHi, leafLo) {
  const c = makeCanvas(16, 22);
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(3, 19, 11, 3);
  g.fillStyle = "#2a1a0c"; g.fillRect(6, 13, 4, 8);
  g.fillStyle = "#6b4122"; g.fillRect(7, 13, 2, 7);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, (y - 7.5) * 1.1);
      if (d > 7.6) continue;
      g.fillStyle = d > 6.7 ? "#0f2a12" : (x + y < 11 ? leafHi : (x + y > 19 ? leafLo : leaf));
      g.fillRect(x, y, 1, 1);
    }
  g.fillStyle = leafLo;
  [[5,7],[9,5],[11,9],[6,11],[3,9]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  return c;
}
const TREES = [
  treeSprite("#2f7d32", "#4fa548", "#1f5a24"),
  treeSprite("#357a3a", "#5aae52", "#235c28"),
  treeSprite("#3d8a3a", "#67bb5b", "#27612a"),
];

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

// ================= People =================
const PAL = {
  k: "#000", y: "#ffd23f", Y: "#fff09a", o: "#c99a00", w: "#ffffff", g: "#6ee07a", G: "#2e8b3a",
  b: "#5fb4ff", B: "#2b5fa8", r: "#ff5c7a", R: "#a8203f", n: "#a8703c", m: "#7a4a22", N: "#4e2c10",
  s: "#c9c5e8", S: "#6f6a99", t: "#d8b47a", T: "#a8834d", p: "#f2c9a0", e: "#f6efe0", E: "#d9cdb4",
  c: "#29b6c6", d: "#c0392b", D: "#3b5bd6",
};

function visitorSprite(shirt, hair, type = "normal") {
  if (type === "kid") {
    const c = makeCanvas(6, 10), g = c.getContext("2d");
    g.fillStyle = hair; g.fillRect(1, 2, 4, 2);
    g.fillStyle = "#f2c9a0"; g.fillRect(1, 4, 4, 2);
    g.fillStyle = "#000"; g.fillRect(2, 5, 1, 1); g.fillRect(4, 5, 1, 1);
    g.fillStyle = shirt; g.fillRect(1, 6, 4, 2);
    g.fillStyle = "#2d3a6e"; g.fillRect(1, 8, 1, 2); g.fillRect(4, 8, 1, 2);
    g.fillStyle = "#ff5c7a"; g.fillRect(5, 0, 1, 1); g.fillRect(5, 1, 1, 5);
    return c;
  }
  if (type === "influencer") hair = "#ff7eb6";
  const c = makeCanvas(6, 10);
  const g = c.getContext("2d");
  if (type === "critic") { g.fillStyle = "#7a1020"; g.fillRect(0, 0, 6, 1); }
  g.fillStyle = hair; g.fillRect(1, 0, 4, 2);
  g.fillStyle = "#f2c9a0"; g.fillRect(1, 2, 4, 3);
  g.fillStyle = "#000"; g.fillRect(2, 3, 1, 1); g.fillRect(4, 3, 1, 1);
  g.fillStyle = shirt; g.fillRect(0, 5, 6, 3);
  g.fillStyle = "#2d3a6e"; g.fillRect(1, 8, 2, 2); g.fillRect(3, 8, 2, 2);
  if (type === "influencer") { g.fillStyle = "#fff"; g.fillRect(5, 4, 1, 2); g.fillStyle = "#5fb4ff"; g.fillRect(5, 4, 1, 1); }
  if (type === "critic") { g.fillStyle = "#ffd23f"; g.fillRect(4, 3, 1, 1); g.fillStyle = "#fff"; g.fillRect(0, 5, 1, 2); }
  return c;
}
const SHIRTS = ["#e94f4f", "#4f8ee9", "#f2a93b", "#9b5de5", "#2ec4b6", "#ffffff", "#ff7eb6"];
const HAIRS = ["#2b1a0e", "#6b3e1e", "#e8c15a", "#111111", "#b5462c"];

// Original blocky-guy and pirate characters for the tug-of-war event
const STEVE_SPR = pixelArt(["kkkkkkkk", "kNNNNNNk", "kNppppNk", "kpwDDwpk", "kppNNppk", "kkkkkkkk", "kcccccck", "pccccccp", "pccccccp", "kcccccck", "kDDDDDDk", "kDDkkDDk", "kDDkkDDk", "kkk..kkk"], PAL);
const PIRATE_SPR = pixelArt(["..kkkk..", ".kkwkkk.", "kkkkkkkk", "kppppppk", "kpkppkpk", "kmmmmmmk", ".kmmmmk.", "kddwwddk", "pddwwddp", "pddwwddp", "kddddddk", "kNNkkNNk", "kNNkkNNk", "kkk..kkk"], PAL);

// ================= Shops & decor sprites (16x20, bottom-anchored) =================
function makeObjSprite(type) {
  const c = makeCanvas(16, 20);
  const g = c.getContext("2d");
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const stand = (c1, c2) => {
    R("rgba(0,0,0,0.25)", 1, 18, 15, 2);
    R("#000", 1, 10, 14, 9); R("#a8703c", 2, 11, 12, 7); R("#c48a4a", 2, 12, 12, 1); R("#7a4a22", 2, 16, 12, 2);
    R("#e8d3b0", 1, 9, 14, 2); R("#000", 1, 9, 14, 1);
    R("#2a1a0c", 2, 4, 1, 6); R("#2a1a0c", 13, 4, 1, 6);
    R("#000", 0, 0, 16, 6);
    for (let x = 1; x < 15; x++) R(Math.floor((x - 1) / 2) % 2 ? c2 : c1, x, 1, 1, 4);
    for (let x = 0; x < 16; x += 4) { R(c1, x + 1, 5, 2, 1); R("#000", x + 1, 6, 2, 1); }
  };
  switch (type) {
    case "fries":
      stand("#e33d3d", "#fff");
      R("#000", 6, 6, 5, 5); R("#e33d3d", 7, 8, 3, 3); R("#ffd23f", 7, 6, 1, 2); R("#ffd23f", 9, 6, 1, 2); R("#ffe98a", 8, 5, 1, 3);
      break;
    case "lemonade":
      stand("#ff7eb6", "#fff");
      R("#000", 6, 5, 5, 6); R("#fff8b0", 7, 6, 3, 4); R("#ffd23f", 7, 8, 3, 2); R("#ff7eb6", 9, 3, 1, 4);
      break;
    case "burger":
      stand("#3fa34d", "#fff");
      R("#000", 5, 5, 7, 6); R("#d98b3a", 6, 6, 5, 1); R("#e8a85a", 6, 5, 5, 1); R("#5ab84a", 6, 7, 5, 1); R("#6b3a1a", 6, 8, 5, 1); R("#d98b3a", 6, 9, 5, 1);
      break;
    case "flowers": {
      R("rgba(0,0,0,0.2)", 2, 17, 13, 2);
      R("#000", 2, 12, 12, 6); R("#6b4122", 3, 13, 10, 4); R("#8a5a32", 3, 13, 10, 1);
      const cols = ["#ff8fb8", "#fff3a1", "#c9a7ff", "#ff5c7a", "#ffffff"];
      for (let i = 0; i < 5; i++) {
        const x = 3 + i * 2;
        R("#2f7a2c", x, 10, 1, 3);
        R(cols[i], x, 8 + (i % 2), 2, 2);
      }
      break;
    }
    case "bench":
      R("rgba(0,0,0,0.25)", 1, 17, 15, 2);
      R("#2a1a0c", 3, 14, 1, 4); R("#2a1a0c", 12, 14, 1, 4);
      R("#000", 1, 8, 14, 3); R("#a8703c", 2, 9, 12, 1);
      R("#000", 1, 12, 14, 3); R("#c48a4a", 2, 13, 12, 1);
      R("#2a1a0c", 2, 10, 1, 3); R("#2a1a0c", 13, 10, 1, 3);
      break;
    case "lamp":
      R("rgba(0,0,0,0.25)", 4, 18, 9, 2);
      R("#000", 5, 16, 6, 3); R("#3a3a4a", 6, 17, 4, 1);
      R("#000", 7, 4, 2, 13); R("#4a4a5e", 7, 5, 1, 11);
      R("#000", 4, 0, 8, 5); R("#ffe98a", 5, 1, 6, 3); R("#fff", 6, 1, 2, 1);
      break;
    case "fountain":
      R("rgba(0,0,0,0.25)", 1, 18, 15, 2);
      R("#000", 0, 11, 16, 8); R("#9a9aae", 1, 12, 14, 6); R("#c9c9d9", 1, 12, 14, 1);
      R("#3d8fe0", 2, 13, 12, 3); R("#9fd4ff", 3, 13, 4, 1);
      R("#000", 6, 5, 4, 8); R("#9a9aae", 7, 6, 2, 6);
      R("#000", 4, 4, 8, 2); R("#c9c9d9", 5, 4, 6, 1);
      break;
    case "statue": {
      R("rgba(0,0,0,0.25)", 1, 18, 15, 2);
      R("#000", 2, 12, 12, 7); R("#9a9aae", 3, 13, 10, 5); R("#c9c9d9", 3, 13, 10, 1); R("#6f6f84", 3, 17, 10, 1);
      const og = makeCanvas(12, 12), gg = og.getContext("2d");
      drawBody(gg, 1, 1, 10, "#e8b830", null, null);
      dots(gg, { x: 0, y: 0 }, "#6b4a00", [[4,4],[4,5],[7,4],[7,5],[3,7],[4,8],[5,8],[6,8],[7,8],[8,7]]);
      g.drawImage(og, 2, 1);
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


// ================= Staff, trash, bubbles, crown, eggs =================
const STAFF_SPR = {
  janitor: pixelArt(["..kkk..", ".kBBBk.", ".kpppk.", ".kpkpk.", ".kpppk.", "kbbbbbm", "kbbbbbm", "kbbbbbm", ".kBkBkm", ".kBkBkm", "....yyy"], PAL),
  keeper: pixelArt(["..GGG..", ".GGGGG.", ".kpppk.", ".kpkpk.", ".kpppk.", "kgggggk", "kgygggk", "kgggggk", ".kNkNk.", ".kk.kk."], PAL),
  mascot: (() => {
    const c = makeCanvas(18, 25), g = c.getContext("2d");
    g.drawImage(baseSprite("verity"), 0, 0);
    g.fillStyle = "#000"; g.fillRect(6, 18, 2, 5); g.fillRect(10, 18, 2, 5); g.fillRect(4, 23, 4, 2); g.fillRect(10, 23, 4, 2);
    g.fillStyle = "#ff5c7a"; g.fillRect(2, 13, 2, 2); g.fillRect(14, 13, 2, 2);
    return c;
  })(),
};

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
};
const BUBBLE_SPR = {};
for (const [k, rows] of Object.entries(BUBBLE_ICONS)) {
  const c = makeCanvas(9, 9), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 9, 7); g.fillRect(3, 7, 2, 1); g.fillRect(3, 8, 1, 1);
  g.fillStyle = "#fff"; g.fillRect(1, 1, 7, 5); g.fillRect(3, 6, 1, 1);
  g.drawImage(pixelArt(rows, PAL), 2, 1, 5, 5);
  BUBBLE_SPR[k] = c;
}

const CROWN_SPR = pixelArt(["y.y.y", "yyyyy", "yrYry"], PAL);

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
  scroll: ["kkkkkkkk..", "keeeeeeek.", "keEEEEek..", "keeeeeek..", "keEEEEek..", "keeeeeek..", "keEEEek...", "keeeeeeek.", ".kkkkkkkk."],
  shard: ["....kk....", "...kbbk...", "..kbwbbk..", ".kbwbbbbk.", ".kbbbbbBk.", ".kbbbbbBk.", "..kbbbBk..", "...kbBk...", "....kk...."],
  camera: ["..kkk.....", "kkkkkkkkkk", "ksssssssSk", "ksskwwkssk", "kskwbbwksk", "kskwbbwksk", "ksskwwkssk", "ksssssssSk", "kkkkkkkkkk"],
  music: ["...kkkkkk.", "...kyyyyk.", "...k....k.", "...k....k.", "...k....k.", ".kkk..kkk.", "kyyk.kyyk.", "kyyk.kyyk.", ".kk...kk.."],
  sun: ["....yy....", ".y..yy..y.", "..yyyyyy..", "..yYYYYy..", "yyyYYYYyyy", "yyyYYYYyyy", "..yYYYYy..", "..yyyyyy..", ".y..yy..y.", "....yy...."],
  moon: ["...kkkk...", "..kYYYk...", ".kYYYk....", ".kYYk.....", ".kYYk.....", ".kYYk.....", ".kYYYk....", "..kYYYk...", "...kkkkk.."],
  cloud: ["..........", "...kkkk...", "..kssssk..", ".kssssssk.", "kssssssssk", "kSSSSSSSSk", ".kkkkkkkk."],
  rain: ["..kkkkk...", ".kssssssk.", "kssssssssk", "kSSSSSSSSk", ".kkkkkkkk.", "..b..b..b.", ".b..b..b..", "..b..b..b.", ".b..b..b.."],
  storm: ["..kkkkk...", ".kSSSSSSk.", "kSSSSSSSSk", "kSSSSSSSSk", ".kkkkkkkk.", "....yy....", "...yy.....", "..yyyy....", "....yy....", "...yy....."],
  goldegg: ["...kkkk...", "..kYYYYk..", ".kYwYYYYk.", ".kwYYyYYk.", "kYYYyyYYYk", "kYYYYYyYok", "kYyYYYYYok", "kYYYYYYook", ".kYYYoook.", "..kkkkkk.."],
  cursedegg: ["...kkkk...", "..kRRRRk..", ".kRrRRRRk.", ".krRRgRRk.", "kRRRggRRRk", "kRRRRRgRNk", "kRgRRRRRNk", "kRRRRRRNNk", ".kRRRNNNk.", "..kkkkkk.."],
});
