"use strict";

// ================= The city around the sanctuary =================
// Purely scenery: a street grid of city blocks fills everything outside the sanctuary.
// Avenues run where (x - 1) % 8 is 0 or 1 (so the sanctuary's own road at x = 1..2 carries
// on into the city) and streets where (y + 2) % 8 is 0 or 1 (a ring road hugs the top and
// bottom edges). Each 6x6-tile block is drawn once into a cached canvas.

const CITY_P = 8;
const mod = (a, n) => ((a % n) + n) % n;
const isAvenue = tx => mod(tx - 1, CITY_P) < 2;
const isStreet = ty => mod(ty + 2, CITY_P) < 2;
const inWorld = (tx, ty) => tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;

const ROOFS = ["#8a8f9c", "#b05a4a", "#6a7f9a", "#c9b48a", "#7a6a8a", "#5f8a7a", "#a0a0a8", "#9a6a4a", "#4f6a8a"];
const WALLS = ["#c9b8a0", "#a85a48", "#8a94a8", "#e0d4bc", "#9a8aa8", "#b8a080", "#7a8a9a"];
const AWNINGS = ["#e94f4f", "#3fa34d", "#4f8ee9", "#f2a93b", "#9b5de5"];
const blockCache = new Map();

function cityBlock(bx, by) {
  const key = bx + "," + by;
  let b = blockCache.get(key);
  if (b) return b;
  if (blockCache.size > 300) blockCache.delete(blockCache.keys().next().value);
  b = makeCityBlock(bx, by);
  blockCache.set(key, b);
  return b;
}

function makeCityBlock(bx, by) {
  const S = 6 * TILE;
  const [c, g] = hiCanvas(S, S);
  const [lc, lg] = hiCanvas(S, S);   // window lights, shown at night
  const r = seeded(Math.floor(hash2(bx, by, 501) * 1e9));
  const R = (col, x, y, w, h, gg = g) => { gg.fillStyle = col; gg.fillRect(x, y, w, h); };
  const pick = a => a[Math.floor(r() * a.length)];
  // sidewalk with paving joints and a curb
  R("#a8a8b4", 0, 0, S, S);
  for (let i = 0; i < S; i += 8) { R("#9a9aa8", i, 0, 0.5, S); R("#9a9aa8", 0, i, S, 0.5); }
  R("#6e6e7c", 0, 0, S, 1); R("#6e6e7c", 0, S - 1, S, 1); R("#6e6e7c", 0, 0, 1, S); R("#6e6e7c", S - 1, 0, 1, S);
  R("#c4c4ce", 1, 1, S - 2, 0.5); R("#c4c4ce", 1, 1, 0.5, S - 2);
  const lotX = 5, lotY = 5, lotW = S - 10, lotH = S - 10;
  const roll = r();
  if (roll < 0.12) cityPark(g, r, lotX, lotY, lotW, lotH);
  else if (roll < 0.22) cityParking(g, r, lotX, lotY, lotW, lotH);
  else if (roll < 0.28) cityPlaza(g, r, lotX, lotY, lotW, lotH);
  else {
    // split the lot into 2-4 buildings
    const rects = [];
    const splitX = r() < 0.6, a = 0.35 + r() * 0.3;
    const halves = splitX
      ? [[lotX, lotY, Math.round(lotW * a) - 1, lotH], [lotX + Math.round(lotW * a) + 1, lotY, lotW - Math.round(lotW * a) - 1, lotH]]
      : [[lotX, lotY, lotW, Math.round(lotH * a) - 1], [lotX, lotY + Math.round(lotH * a) + 1, lotW, lotH - Math.round(lotH * a) - 1]];
    for (const [x, y, w, h] of halves) {
      if (r() < 0.45 && Math.max(w, h) > 40) {
        const b2 = 0.4 + r() * 0.2;
        if (w > h) rects.push([x, y, Math.round(w * b2) - 1, h], [x + Math.round(w * b2) + 1, y, w - Math.round(w * b2) - 1, h]);
        else rects.push([x, y, w, Math.round(h * b2) - 1], [x, y + Math.round(h * b2) + 1, w, h - Math.round(h * b2) - 1]);
      } else rects.push([x, y, w, h]);
    }
    for (const rc of rects) cityBuilding(g, lg, r, ...rc);
  }
  // street trees and lamps along the sidewalk
  for (let i = 10; i < S - 6; i += 22) {
    for (const [tx, ty] of [[i, 2.5], [i, S - 2.5], [2.5, i], [S - 2.5, i]]) {
      if (r() < 0.55) { litBlob(g, tx, ty, 2.2, 2, ramp(pick(["#3d8a3a", "#4f9a3a", "#2f7a3a"]))); }
      else if (r() < 0.4) { R("#2a2a32", tx - 0.5, ty - 0.5, 1, 1); R("#fff3b0", tx - 0.5, ty - 0.5, 1, 1, lg); R("rgba(255,220,120,0.5)", tx - 2, ty - 2, 4, 4, lg); }
    }
  }
  return { c, lc };
}

function cityBuilding(g, lg, r, x, y, w, h) {
  if (w < 8 || h < 8) return;
  const R = (col, xx, yy, ww, hh, gg = g) => { gg.fillStyle = col; gg.fillRect(xx, yy, ww, hh); };
  const pick = a => a[Math.floor(r() * a.length)];
  const tall = r();
  const fh = Math.max(4, Math.min(h * 0.45, 5 + Math.floor(tall * 10)));   // visible front wall
  const rh = h - fh;
  const roof = pick(ROOFS), wall = pick(WALLS);
  // drop shadow on the sidewalk
  R("rgba(0,0,0,0.28)", x + w, y + 2, 2, h - 1);
  R("rgba(0,0,0,0.28)", x + 2, y + h, w, 1.5);
  // roof
  R("#000", x - 0.5, y - 0.5, w + 1, h + 1);
  R(roof, x, y, w, rh);
  R(shade(roof, 28), x, y, w, 1); R(shade(roof, 18), x, y, 1, rh);
  R(shade(roof, -30), x, y + rh - 1.5, w, 1.5);
  // rooftop details
  const feat = r();
  if (feat < 0.18 && w > 22 && rh > 22) {          // helipad
    const cx = x + w / 2, cy = y + rh / 2;
    litBlob(g, cx, cy, 8, 7, ["#3a3a44", "#4a4a54", "#5a5a64"]);
    R("#ffd23f", cx - 3, cy - 3.5, 1, 7); R("#ffd23f", cx + 2, cy - 3.5, 1, 7); R("#ffd23f", cx - 2, cy - 0.5, 4, 1);
  } else if (feat < 0.36 && rh > 14) {             // solar panels
    for (let yy = y + 3; yy < y + rh - 5; yy += 5) for (let xx = x + 3; xx < x + w - 6; xx += 7) { R("#1a2a4a", xx, yy, 6, 4); R("#3a5a9a", xx + 0.5, yy + 0.5, 5, 3); R("#7a9ad8", xx + 0.5, yy + 0.5, 2, 0.5); }
  } else if (feat < 0.5 && rh > 14) {              // rooftop garden
    R("#3f7a3a", x + 3, y + 3, w - 6, rh - 7); R("#2f6a2c", x + 3, y + rh - 5, w - 6, 1);
    for (let i = 0; i < 6; i++) litBlob(g, x + 5 + r() * (w - 10), y + 5 + r() * (rh - 12), 2, 1.8, ramp("#4f9a3a"));
  } else {                                         // AC units, vents and maybe a water tower
    const n = 1 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const ax = x + 3 + r() * Math.max(1, w - 10), ay = y + 3 + r() * Math.max(1, rh - 9);
      R("#000", ax - 0.5, ay - 0.5, 6, 5); R("#c4c8d0", ax, ay, 5, 4); R("#8a8e98", ax, ay + 3, 5, 1); R("#5a5e68", ax + 1, ay + 1, 3, 1.5);
    }
    if (r() < 0.35 && rh > 16) { const tx = x + w - 9, ty = y + 4; litBlob(g, tx, ty + 3, 3.5, 3.5, ramp("#9a6a3a")); R("#5a3a1e", tx - 3, ty + 6, 1, 3); R("#5a3a1e", tx + 2, ty + 6, 1, 3); }
  }
  // front wall with windows
  const wy = y + rh;
  R(wall, x, wy, w, fh);
  R(shade(wall, -25), x, wy, w, 1);
  R(shade(wall, -40), x + w - 1, wy, 1, fh);
  const shop = r() < 0.4;
  for (let yy = wy + 2; yy < y + h - (shop ? 5 : 2.5); yy += 3.5)
    for (let xx = x + 2; xx < x + w - 3; xx += 4) {
      R("#1e2a44", xx, yy, 2.5, 2); R("#6a8ac0", xx, yy, 1, 0.5);
      if (r() < 0.5) R("#ffd98a", xx, yy, 2.5, 2, lg);
    }
  if (shop) {
    const aw = AWNINGS[Math.floor(r() * AWNINGS.length)];
    for (let xx = x + 1; xx < x + w - 1; xx += 2) R(Math.round(xx) % 4 < 2 ? aw : "#f4f4f4", xx, y + h - 5, 2, 1.5);
    R("#2a1a10", x + w / 2 - 1.5, y + h - 3.5, 3, 3.5); R("#ffd98a", x + w / 2 - 1.5, y + h - 3.5, 3, 3.5, lg);
    R("#9ad0f0", x + 2, y + h - 3, w / 2 - 5, 2); R("#ffe9b0", x + 2, y + h - 3, w / 2 - 5, 2, lg);
  } else R("#2a1a10", x + w / 2 - 1.5, y + h - 3, 3, 3);
}

function cityPark(g, r, x, y, w, h) {
  const R = (col, xx, yy, ww, hh) => { g.fillStyle = col; g.fillRect(xx, yy, ww, hh); };
  R("#000", x - 0.5, y - 0.5, w + 1, h + 1);
  R("#4a9a3f", x, y, w, h);
  for (let i = 0; i < w * h / 12; i++) R(r() < 0.5 ? "#3f8a36" : "#5aae4a", x + Math.floor(r() * w * 2) / 2, y + Math.floor(r() * h * 2) / 2, 0.5, 0.5);
  R("#c9b48a", x + w / 2 - 2, y, 4, h); R("#c9b48a", x, y + h / 2 - 2, w, 4);
  litBlob(g, x + w / 2, y + h / 2, 6, 5, ["#2f6fd0", "#4a8fe0", "#9fd4ff"]);
  for (let i = 0; i < 6; i++) {
    const t = TREE_SPRITES[r() < 0.5 ? "oak" : "cherry"][Math.floor(r() * 4)];
    const tx = x + 6 + r() * (w - 12), ty = y + 6 + r() * (h - 12);
    if (Math.abs(tx - (x + w / 2)) < 6 || Math.abs(ty - (y + h / 2)) < 6) continue;
    blit(g, t, tx - t.ax, ty - t.ay);
  }
}

function cityParking(g, r, x, y, w, h) {
  const R = (col, xx, yy, ww, hh) => { g.fillStyle = col; g.fillRect(xx, yy, ww, hh); };
  R("#000", x - 0.5, y - 0.5, w + 1, h + 1);
  R("#4a4a54", x, y, w, h);
  for (let row = 0; row < 2; row++) {
    const yy = row ? y + h - 18 : y + 2;
    for (let xx = x + 2; xx < x + w - 10; xx += 12) {
      R("#e8e8e8", xx, yy, 0.5, 16);
      if (r() < 0.65) { const car = CAR_SPRITES[Math.floor(r() * CAR_SPRITES.length)][row ? 0 : 2]; blit(g, car, xx + 1, yy); }
    }
  }
}

function cityPlaza(g, r, x, y, w, h) {
  const R = (col, xx, yy, ww, hh) => { g.fillStyle = col; g.fillRect(xx, yy, ww, hh); };
  R("#000", x - 0.5, y - 0.5, w + 1, h + 1);
  for (let yy = 0; yy < h; yy += 4) for (let xx = 0; xx < w; xx += 4) R((xx + yy) % 8 ? "#d8c8a8" : "#c4b494", x + xx, y + yy, 4, 4);
  const cx = x + w / 2, cy = y + h / 2;
  litBlob(g, cx, cy, 11, 9, ["#8a8a96", "#a8a8b4", "#c4c4ce"]);
  litBlob(g, cx, cy, 8.5, 6.5, ["#2f6fd0", "#4a8fe0", "#9fd4ff"]);
  R("#c4c4ce", cx - 1, cy - 6, 2, 6); R("#9fd4ff", cx - 0.5, cy - 8, 1, 2);
  for (const [bx, by] of [[x + 6, y + 6], [x + w - 14, y + 6], [x + 6, y + h - 9], [x + w - 14, y + h - 9]]) { R("#2a1a0c", bx, by, 8, 3); R("#a8703c", bx + 0.5, by + 0.5, 7, 1.5); }
}

// ---- traffic ----
const cityCars = [];
(function initCityTraffic() {
  const lanes = [];
  for (const x of [COLS]) lanes.push({ v: true, pos: x * TILE + 8, dir: 2 }, { v: true, pos: (x + 1) * TILE + 8, dir: 0 });
  for (const y of [-2, ROWS]) lanes.push({ v: false, pos: y * TILE + 8, dir: 3 }, { v: false, pos: (y + 1) * TILE + 8, dir: 1 });
  for (const ln of lanes) for (let i = 0; i < 6; i++)
    cityCars.push({ ...ln, t: Math.random(), speed: 38 + Math.random() * 30, set: Math.floor(Math.random() * CAR_SPRITES.length) });
})();
const CITY_SPAN = 8 * TILE;
function updateCityCars(dt) {
  for (const c of cityCars) {
    const len = (c.v ? WORLD_H : WORLD_W) + CITY_SPAN * 2;
    c.t = (c.t + (c.dir === 0 || c.dir === 3 ? -1 : 1) * c.speed * dt / len + 1) % 1;
  }
}
function cityCarPos(c) {
  const along = -CITY_SPAN + c.t * ((c.v ? WORLD_H : WORLD_W) + CITY_SPAN * 2);
  return c.v ? [c.pos, along] : [along, c.pos];
}

// ---- drawing ----
function viewLeavesWorld(x0, y0, x1, y1) { return x0 < 0 || y0 < 0 || x1 > WORLD_W || y1 > WORLD_H; }

function drawCity(x0, y0, x1, y1) {
  if (!viewLeavesWorld(x0, y0, x1, y1)) return;
  ctx.fillStyle = "#4a4a54";
  ctx.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
  const tx0 = Math.floor(x0 / TILE) - 1, ty0 = Math.floor(y0 / TILE) - 1, tx1 = Math.ceil(x1 / TILE) + 1, ty1 = Math.ceil(y1 / TILE) + 1;
  // road markings: dashed centre lines and crosswalks
  for (let tx = tx0; tx <= tx1; tx++) if (mod(tx - 1, CITY_P) === 0)
    for (let y = Math.floor(y0 / 8) * 8; y < y1; y += 8) { ctx.fillStyle = isStreet(Math.floor(y / TILE)) ? "#4a4a54" : "#e8c13a"; ctx.fillRect((tx + 1) * TILE - 0.5, y, 1, 4); }
  for (let ty = ty0; ty <= ty1; ty++) if (mod(ty + 2, CITY_P) === 0)
    for (let x = Math.floor(x0 / 8) * 8; x < x1; x += 8) { ctx.fillStyle = isAvenue(Math.floor(x / TILE)) ? "#4a4a54" : "#e8c13a"; ctx.fillRect(x, (ty + 1) * TILE - 0.5, 4, 1); }
  ctx.fillStyle = "#d8d8e0";
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!isAvenue(tx) || !isStreet(ty) || mod(tx - 1, CITY_P) || mod(ty + 2, CITY_P)) continue;
    const X = tx * TILE, Y = ty * TILE;   // top-left of a 2x2-tile intersection
    for (let i = 2; i < 30; i += 3) { ctx.fillRect(X + i, Y - 4, 1.5, 3); ctx.fillRect(X + i, Y + 33, 1.5, 3); ctx.fillRect(X - 4, Y + i, 3, 1.5); ctx.fillRect(X + 33, Y + i, 3, 1.5); }
  }
  // blocks
  const bx0 = Math.floor((tx0 - 3) / CITY_P), bx1 = Math.floor((tx1 - 3) / CITY_P), by0 = Math.floor(ty0 / CITY_P), by1 = Math.floor(ty1 / CITY_P);
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    const X = bx * CITY_P + 3, Y = by * CITY_P;
    if (X >= 0 && Y >= 0 && X + 6 <= COLS && Y + 6 <= ROWS) continue;   // hidden under the sanctuary
    blit(ctx, cityBlock(bx, by).c, X * TILE, Y * TILE);
  }
  for (const c of cityCars) {
    const [x, y] = cityCarPos(c);
    if (x < x0 - 20 || x > x1 + 20 || y < y0 - 20 || y > y1 + 20 || inWorld(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
    const spr = CAR_SPRITES[c.set][c.dir];
    blit(ctx, spr, Math.round(x - uW(spr) / 2), Math.round(y - uH(spr) / 2));
  }
  drawCityFog(x0, y0, x1, y1);
}

// Past the first ring of streets the city fades into darkness: it's scenery, not a place to explore.
const FOG_START = 2.5 * TILE, FOG_END = 6 * TILE, FOG = "22,20,42";
function drawCityFog(x0, y0, x1, y1) {
  if (!viewLeavesWorld(x0, y0, x1, y1)) return;
  const side = (ax, ay, bx, by, rx, ry, rw, rh) => {
    const grd = ctx.createLinearGradient(ax, ay, bx, by);
    grd.addColorStop(0, `rgba(${FOG},0)`); grd.addColorStop(1, `rgba(${FOG},1)`);
    ctx.fillStyle = grd; ctx.fillRect(rx, ry, rw, rh);
  };
  const W = x1 - x0 + 2, H = y1 - y0 + 2;
  side(-FOG_START, 0, -FOG_END, 0, -FOG_END, y0 - 1, FOG_END - FOG_START, H);
  side(WORLD_W + FOG_START, 0, WORLD_W + FOG_END, 0, WORLD_W + FOG_START, y0 - 1, FOG_END - FOG_START, H);
  side(0, -FOG_START, 0, -FOG_END, x0 - 1, -FOG_END, W, FOG_END - FOG_START);
  side(0, WORLD_H + FOG_START, 0, WORLD_H + FOG_END, x0 - 1, WORLD_H + FOG_START, W, FOG_END - FOG_START);
  ctx.fillStyle = `rgb(${FOG})`;
  if (x0 < -FOG_END) ctx.fillRect(x0 - 1, y0 - 1, -FOG_END - x0 + 1, H);
  if (x1 > WORLD_W + FOG_END) ctx.fillRect(WORLD_W + FOG_END, y0 - 1, x1 - WORLD_W - FOG_END + 1, H);
  if (y0 < -FOG_END) ctx.fillRect(x0 - 1, y0 - 1, W, -FOG_END - y0 + 1);
  if (y1 > WORLD_H + FOG_END) ctx.fillRect(x0 - 1, WORLD_H + FOG_END, W, y1 - WORLD_H - FOG_END + 1);
}

// a fence along the sanctuary's edge where it meets the city
function drawBoundaryFence(x0, y0, x1, y1) {
  if (!viewLeavesWorld(x0 - 8, y0 - 8, x1 + 8, y1 + 8)) return;
  const R = (col, x, y, w, h) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  for (const [ax, ay, horiz, len] of [[4 * TILE, 0, true, WORLD_W - 4 * TILE], [4 * TILE, WORLD_H - 3, true, WORLD_W - 4 * TILE], [WORLD_W - 3, 0, false, WORLD_H]]) {
    if (horiz) {
      if (ay < y0 - 8 || ay > y1 + 8) continue;
      R("#2a1a0c", Math.max(ax, x0 - 2), ay, Math.min(len, x1 - x0 + 4), 3); R("#8a5a32", Math.max(ax, x0 - 2), ay + 0.5, Math.min(len, x1 - x0 + 4), 1);
      for (let x = ax; x < ax + len; x += 8) if (x > x0 - 8 && x < x1 + 8) { R("#2a1a0c", x, ay - 2, 2, 5); R("#a8703c", x + 0.5, ay - 1.5, 1, 4); }
    } else {
      if (ax < x0 - 8 || ax > x1 + 8) continue;
      R("#2a1a0c", ax, Math.max(ay, y0 - 2), 3, Math.min(len, y1 - y0 + 4)); R("#8a5a32", ax + 0.5, Math.max(ay, y0 - 2), 1, Math.min(len, y1 - y0 + 4));
      for (let y = ay; y < ay + len; y += 8) if (y > y0 - 8 && y < y1 + 8) { R("#2a1a0c", ax - 1, y, 5, 2); R("#a8703c", ax - 0.5, y + 0.5, 4, 1); }
    }
  }
}

// lit windows and headlights, drawn with the night lighting
function drawCityLights(glow, x0, y0, x1, y1) {
  if (!viewLeavesWorld(x0, y0, x1, y1)) return;
  const tx0 = Math.floor(x0 / TILE) - 1, ty0 = Math.floor(y0 / TILE) - 1, tx1 = Math.ceil(x1 / TILE) + 1, ty1 = Math.ceil(y1 / TILE) + 1;
  const bx0 = Math.floor((tx0 - 3) / CITY_P), bx1 = Math.floor((tx1 - 3) / CITY_P), by0 = Math.floor(ty0 / CITY_P), by1 = Math.floor(ty1 / CITY_P);
  ctx.globalAlpha = Math.min(1, glow * 2.2);
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    const X = bx * CITY_P + 3, Y = by * CITY_P;
    if (X >= 0 && Y >= 0 && X + 6 <= COLS && Y + 6 <= ROWS) continue;
    if ((X + 6) * TILE < -FOG_END || X * TILE > WORLD_W + FOG_END || (Y + 6) * TILE < -FOG_END || Y * TILE > WORLD_H + FOG_END) continue;
    blit(ctx, cityBlock(bx, by).lc, X * TILE, Y * TILE);
  }
  ctx.globalAlpha = Math.min(1, glow * 1.6);
  ctx.fillStyle = "#fff3b0";
  for (const c of cityCars) {
    const [x, y] = cityCarPos(c);
    if (x < x0 || x > x1 || y < y0 || y > y1 || inWorld(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
    if (x < -FOG_START || x > WORLD_W + FOG_START || y < -FOG_START || y > WORLD_H + FOG_START) continue;
    const hx = x + (c.dir === 1 ? 7 : c.dir === 3 ? -9 : -2), hy = y + (c.dir === 2 ? 7 : c.dir === 0 ? -9 : -2);
    ctx.fillRect(hx, hy, c.v ? 4 : 2, c.v ? 2 : 4);
  }
  ctx.globalAlpha = 1;
}
