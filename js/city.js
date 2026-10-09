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
  if (w < 10 || h < 12) return;
  const R = (col, xx, yy, ww, hh, gg = g) => { gg.fillStyle = col; gg.fillRect(xx, yy, ww, hh); };
  const pick = a => a[Math.floor(r() * a.length)];
  const kind = r() < 0.22 && h > 34 ? "tower" : r() < 0.4 ? "brick" : r() < 0.6 ? "apartment" : "office";
  // the visible front wall: taller buildings show more of it
  const floors = kind === "tower" ? 4 + Math.floor(r() * 3) : 1 + Math.floor(r() * 3);
  const fh = Math.min(h - 8, 4 + floors * 4);
  const rh = h - fh;
  const roof = kind === "tower" ? pick(["#6a7a8a", "#5a6a7a", "#7a8a9a"]) : pick(ROOFS);
  const wall = kind === "brick" ? pick(["#a85a48", "#9a4a3a", "#b86a50"]) : kind === "tower" ? "#3a5a7a" : pick(WALLS);
  // long cast shadow (sun from the top left): longer for taller buildings
  const sh = 2 + floors * 1.2;
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.beginPath(); g.moveTo(x + w, y + 1); g.lineTo(x + w + sh, y + 1 + sh); g.lineTo(x + w + sh, y + h + sh * 0.5); g.lineTo(x + w, y + h); g.fill();
  R("rgba(0,0,0,0.3)", x + 1, y + h, w + sh - 1, Math.min(2.5, sh * 0.4));

  // ---- roof ----
  R("#000", x - 0.5, y - 0.5, w + 1, h + 1);
  R(shade(roof, 34), x, y, w, rh);                                      // parapet rim
  R(shade(roof, -8), x + 1.5, y + 1.5, w - 3, rh - 3);                  // roof deck
  R(shade(roof, -34), x + 1.5, y + 1.5, w - 3, 0.5);                    // inner edge shadow
  R(shade(roof, -22), x + 1.5, y + 1.5, 0.5, rh - 3);
  for (let i = 0; i < w * rh / 30; i++) R(shade(roof, r() < 0.5 ? -18 : 6), x + 2 + Math.floor(r() * (w - 4) * 2) / 2, y + 2 + Math.floor(r() * (rh - 4) * 2) / 2, 0.5, 0.5);
  R(shade(roof, -45), x, y + rh - 1, w, 1);                             // roof edge over the facade
  roofDetails(g, r, x + 2, y + 2, w - 4, rh - 4, kind);

  // ---- facade ----
  const fy = y + rh;
  R(wall, x, fy, w, fh);
  if (kind === "brick") for (let yy = fy + 1; yy < y + h; yy += 1.5) for (let xx = x + ((yy - fy) % 3 ? 0 : 1.5); xx < x + w; xx += 3) R(shade(wall, -14), xx, yy, 0.5, 0.5);
  if (kind === "tower") {
    // glass curtain wall with mullions and a sky reflection
    for (let yy = fy; yy < y + h - 4; yy += 1) R(shade("#3a6a9a", Math.round((yy - fy) / fh * -30) + 20), x, yy, w, 1);
    for (let xx = x + 3; xx < x + w; xx += 3) R("#24384e", xx, fy, 0.5, fh - 4);
    for (let yy = fy + 3.5; yy < y + h - 4; yy += 3.5) R("#24384e", x, yy, w, 0.5);
    for (let i = 0; i < 3; i++) { const rx = x + 2 + r() * (w - 8); g.fillStyle = "rgba(220,240,255,0.35)"; g.beginPath(); g.moveTo(rx, fy); g.lineTo(rx + 3, fy); g.lineTo(rx - 2, y + h - 4); g.lineTo(rx - 5, y + h - 4); g.fill(); }
    for (let yy = fy + 1; yy < y + h - 5; yy += 3.5) for (let xx = x + 1; xx < x + w - 2; xx += 3) if (r() < 0.45) R("#ffe6a0", xx, yy, 2, 2, lg);
  } else {
    // floor ledges and framed windows with sills
    const winW = kind === "office" ? 3 : 2.5, step = kind === "office" ? 4 : 4.5;
    for (let f = 0; f < floors; f++) {
      const yy = fy + 1.5 + f * 4;
      if (f > 0) { R(shade(wall, 22), x, yy - 1, w, 0.5); R(shade(wall, -30), x, yy - 0.5, w, 0.5); }
      for (let xx = x + 2; xx + winW < x + w - 1; xx += step) {
        R("#1a1a24", xx - 0.5, yy - 0.5, winW + 1, 3);                      // frame
        R("#2a3e5e", xx, yy, winW, 2); R("#7aa0d0", xx, yy, winW * 0.4, 0.5); // glass + glint
        R(shade(wall, 30), xx - 0.5, yy + 2.5, winW + 1, 0.5);               // sill
        if (kind === "apartment" && f > 0 && r() < 0.35) { R("#2a2a32", xx - 1, yy + 1.5, winW + 2, 0.5); R("#2a2a32", xx - 1, yy + 1.5, 0.5, 1.5); R("#2a2a32", xx + winW + 0.5, yy + 1.5, 0.5, 1.5); }
        if (r() < 0.5) R("#ffd98a", xx, yy, winW, 2, lg);
      }
    }
  }
  R(shade(wall, -45), x + w - 1, fy, 1, fh);                              // right corner in shade
  R(shade(wall, 18), x, fy, 0.5, fh);                                     // left corner catches light
  // ground floor: shopfront with sign and awning, or a lobby with a canopy and steps
  const gy = y + h - 4.5;
  if (kind !== "tower" && r() < 0.5) {
    const aw = pick(AWNINGS);
    R("#1a1a24", x + 1, gy, w - 2, 4.5);
    R("#8ac8e8", x + 1.5, gy + 1.5, w - 3, 2.5); R("#c8ecff", x + 1.5, gy + 1.5, 1.5, 2.5);
    R("#ffe9b0", x + 1.5, gy + 1.5, w - 3, 2.5, lg);
    for (let xx = x + 1; xx < x + w - 1; xx += 2) R(Math.round(xx - x) % 4 < 2 ? aw : "#f4f4f4", xx, gy - 0.5, 2, 1.5);
    R(shade(aw, -50), x + 1, gy + 1, w - 2, 0.5);
    const sw = Math.min(w - 6, 12); R("#000", x + w / 2 - sw / 2 - 0.5, gy - 3.5, sw + 1, 3); R(pick(["#ffd23f", "#ff7eb6", "#7df9ff", "#6ee07a"]), x + w / 2 - sw / 2, gy - 3, sw, 2);
    R("#ffffff", x + w / 2 - sw / 2 + 1, gy - 2.5, sw - 2, 0.5, lg);
  } else {
    const dw = 5, dx = x + w / 2 - dw / 2;
    R("#000", dx - 0.5, gy - 0.5, dw + 1, 5); R("#3a4a5a", dx, gy, dw, 4.5); R("#9ac8e8", dx + 0.5, gy + 0.5, 1.5, 3.5); R("#9ac8e8", dx + 3, gy + 0.5, 1.5, 3.5);
    R("#ffe9b0", dx, gy, dw, 4.5, lg);
    R("#2a2a32", dx - 1.5, gy - 1.5, dw + 3, 1); R(shade(roof, 20), dx - 1.5, gy - 1.5, dw + 3, 0.5);   // canopy
    R("#c4c4ce", dx - 1, y + h, dw + 2, 1); R("#9a9aa8", dx - 1, y + h + 1, dw + 2, 0.5);               // steps
  }
  R("rgba(0,0,0,0.35)", x, y + h - 0.5, w, 0.5);                          // where the wall meets the pavement
}

function roofDetails(g, r, x, y, w, h, kind) {
  const R = (col, xx, yy, ww, hh) => { g.fillStyle = col; g.fillRect(xx, yy, ww, hh); };
  const box3d = (bx, by, bw, bh, depth, top, side) => {   // a little rooftop box with a visible front
    R("rgba(0,0,0,0.3)", bx + bw, by + 1, 1.5, bh + depth);
    R("#000", bx - 0.5, by - 0.5, bw + 1, bh + depth + 1);
    R(top, bx, by, bw, bh); R(shade(top, 25), bx, by, bw, 0.5);
    R(side, bx, by + bh, bw, depth); R(shade(side, -25), bx + bw - 0.5, by + bh, 0.5, depth);
  };
  const feat = r();
  if (kind === "tower" && w > 18 && h > 14) {               // helipad
    const cx = x + w / 2, cy = y + h / 2;
    litBlob(g, cx, cy, Math.min(8, w / 2 - 1), Math.min(6, h / 2 - 1), ["#3a3a44", "#4a4a54", "#5a5a64"]);
    R("#ffd23f", cx - 2.5, cy - 2.5, 1, 5); R("#ffd23f", cx + 1.5, cy - 2.5, 1, 5); R("#ffd23f", cx - 1.5, cy - 0.5, 3, 1);
    R("#ff5c7a", x + 1, y + 1, 1, 1); R("#ff5c7a", x + w - 2, y + 1, 1, 1);
    return;
  }
  if (feat < 0.22 && h > 10) {                             // solar panels
    for (let yy = y + 1; yy < y + h - 4; yy += 5) for (let xx = x + 1; xx < x + w - 6; xx += 7) { R("#000", xx - 0.5, yy - 0.5, 7, 4.5); R("#2a4a8a", xx, yy, 6, 3.5); R("#4a6aba", xx, yy, 6, 0.5); R("#8aaae8", xx + 0.5, yy + 1, 1.5, 0.5); }
    return;
  }
  if (feat < 0.36 && h > 10) {                             // rooftop garden with planters
    R("#000", x + 0.5, y + 0.5, w - 1, h - 1); R("#4f8a3a", x + 1, y + 1, w - 2, h - 2);
    for (let i = 0; i < 5; i++) litBlob(g, x + 3 + r() * (w - 6), y + 3 + r() * (h - 6), 2, 1.8, ramp(r() < 0.3 ? "#e984b0" : "#5aa04a"));
    return;
  }
  // roof seams, skylights, a stair hut, AC units and maybe a water tower
  for (let yy = y + 8; yy < y + h - 2; yy += 9) { R("rgba(0,0,0,0.18)", x, yy, w, 0.5); R("rgba(255,255,255,0.12)", x, yy + 0.5, w, 0.5); }
  if (w > 20 && h > 16 && r() < 0.6) {
    const cols = Math.floor((w - 6) / 7), sy2 = y + h / 2 - 2;
    for (let i = 0; i < cols; i++) { const sx2 = x + 3 + i * 7; R("#000", sx2 - 0.5, sy2 - 0.5, 5, 4); R("#9ad0f0", sx2, sy2, 4, 3); R("#d8f0ff", sx2, sy2, 1.5, 1); R("#5a8ab0", sx2, sy2 + 2.5, 4, 0.5); }
  }
  if (w > 12 && h > 8) box3d(x + 1 + r() * (w * 0.4), y + 1, 6, 3, 2.5, "#9a9aa4", "#7a7a84");
  for (let i = 0; i < Math.floor(w * h / 220); i++) {      // round vents
    const vx = x + 2 + r() * (w - 4), vy = y + 2 + r() * (h - 4);
    R("#000", vx - 0.5, vy - 0.5, 2.5, 2.5); R("#b4b8c0", vx, vy, 1.5, 1.5); R("#6a6e78", vx + 0.5, vy + 0.5, 1, 1);
  }
  const n = 1 + Math.floor(r() * 2) + Math.floor(w * h / 260);
  for (let i = 0; i < n; i++) {
    const ax = x + 2 + r() * Math.max(1, w - 8), ay = y + 2 + r() * Math.max(1, h - 6);
    box3d(ax, ay, 4, 2, 1.5, "#c4c8d0", "#8a8e98");
    R("#5a5e68", ax + 1, ay + 0.5, 2, 1);
  }
  if (r() < 0.4 && h > 10 && w > 12) {                    // wooden water tower on legs
    const tx = x + w - 6, ty = y + 1;
    R("#2a1a0c", tx, ty + 6, 0.5, 3); R("#2a1a0c", tx + 4, ty + 6, 0.5, 3); R("#2a1a0c", tx + 2, ty + 6, 0.5, 3);
    R("#000", tx - 0.5, ty - 0.5, 5.5, 7); R("#9a6a3a", tx, ty, 4.5, 6); R("#b8844a", tx, ty, 1.5, 6); R("#6a4422", tx + 3.5, ty, 1, 6);
    R("#5a3a1e", tx, ty + 2, 4.5, 0.5); R("#5a3a1e", tx, ty + 4, 4.5, 0.5);
    R("#000", tx - 1, ty - 1.5, 6.5, 1.5); R("#7a4a22", tx - 0.5, ty - 1, 5.5, 0.5);
  }
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
