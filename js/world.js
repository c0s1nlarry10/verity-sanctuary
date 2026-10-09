"use strict";

// The world outside the core game logic: terrain, wild trees, road & parking,
// cars and arriving guests, the camera (pan/zoom), the minimap and ambient critters.


// ================= Zones =================
const ZONE = { OUT: 0, ROAD: 1, SIDEWALK: 2, DRIVE: 3, LOT: 4, PLAZA: 5, PARK: 6 };
const lotLevel = () => Math.max(1, Math.min(LOT_LEVELS.length, state.lotLevel || 1));
function lotRect(level = lotLevel()) { return LOT_LEVELS[level - 1].rect; }
function inRect(x, y, r) { return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]; }
function zoneAt(x, y) {
  if (x >= OX) return ZONE.PARK;
  if (ROAD_X.includes(x)) return ZONE.ROAD;
  if (x === 0 || x === 3) return ZONE.SIDEWALK;
  const r = lotRect();
  if (inRect(x, y, r)) return x === r[2] ? ZONE.PLAZA : ZONE.LOT;
  if (y === GATE.y && x > 3 && x < r[0]) return ZONE.DRIVE;
  return ZONE.OUT;
}
function lotStalls(level = lotLevel()) {
  const r = lotRect(level), out = [];
  for (let y = r[1]; y <= r[3]; y++)
    for (let x = r[0]; x < r[2]; x++) if (y !== GATE.y) out.push({ x, y });
  return out.slice(0, LOT_LEVELS[level - 1].spaces);
}
function plotKeyAt(x, y) { const i = PLOT_MAP[y * COLS + x]; return i >= 0 ? PLOT_KEYS[i] : null; }
function biomeAt(x, y) { const k = plotKeyAt(x, y); return k ? PLOTS[k].biome : "meadow"; }
// Biomes blend into each other: the wild land is sampled through a smooth noise warp
// (plus a little jitter), so neighbouring biomes interlock instead of meeting at tile edges.
// Land you own keeps a crisp border so it's clear where you can build.
const BIOME_WARP = 3 * TILE;
// What a tile contributes to the blend: its biome if wild, plain meadow grass if it's
// owned park land or the meadow outside, or null for roads and parking.
function blendSource(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
  const z = zoneAt(x, y);
  if (z === ZONE.OUT) return "meadow";
  if (z !== ZONE.PARK) return null;
  return isOwned(x, y) ? "meadow" : biomeAt(x, y);
}
function warpedTile(ux, uy) {
  const px = ux * RES, py = uy * RES;
  const wx = ux + (valueNoise(px, py, 90, 31) - 0.5) * BIOME_WARP + (hash2(ux | 0, uy | 0, 33) - 0.5) * TILE * 0.6;
  const wy = uy + (valueNoise(px, py, 90, 37) - 0.5) * BIOME_WARP + (hash2(ux | 0, uy | 0, 34) - 0.5) * TILE * 0.6;
  return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
}
function wildBiomeAt(ux, uy) {
  const tx = Math.floor(ux / TILE), ty = Math.floor(uy / TILE);
  const [wtx, wty] = warpedTile(ux, uy);
  return blendSource(wtx, wty) || blendSource(tx, ty) || biomeAt(tx, ty);
}


// ================= Terrain layer (whole world, hi-res, rebuilt when land or parking changes) =================
let terrainLayer = null, terrainWork = null, terrainDirty = true;
let minimapBase = null;
const TPX = TILE * RES;   // pixels per tile in the terrain layer

function buildTerrain() {
  const W = COLS * TPX, H = ROWS * TPX;
  if (!terrainWork) terrainWork = makeCanvas(W, H);
  const g = terrainWork.getContext("2d", { willReadFrequently: true });
  const img = g.createImageData(W, H);
  const d = img.data;
  // coarse noise grid, sampled bilinearly per pixel
  const STEP = 8, GW = W / STEP + 1, GH = H / STEP + 1;
  const n1 = new Float32Array(GW * GH), n2 = new Float32Array(GW * GH), n3 = new Float32Array(GW * GH), n4 = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++)
    for (let gx = 0; gx < GW; gx++) {
      n1[gy * GW + gx] = valueNoise(gx * STEP, gy * STEP, 46, 11);
      n2[gy * GW + gx] = valueNoise(gx * STEP, gy * STEP, 13, 23);
      n3[gy * GW + gx] = valueNoise(gx * STEP, gy * STEP, 90, 31);
      n4[gy * GW + gx] = valueNoise(gx * STEP, gy * STEP, 90, 37);
    }
  const WARP_PX = BIOME_WARP * RES;
  const sample = (arr, px, py) => {
    const fx = px / STEP, fy = py / STEP, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const i = iy * GW + ix;
    const a = arr[i], b = arr[i + 1], c = arr[i + GW], e = arr[i + GW + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty;
  };
  const zoneCache = new Int8Array(COLS * ROWS), ownCache = new Uint8Array(COLS * ROWS);
  const srcCache = new Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { zoneCache[y * COLS + x] = zoneAt(x, y); ownCache[y * COLS + x] = isOwned(x, y) ? 1 : 0; srcCache[y * COLS + x] = blendSource(x, y); }
  const grass = [GRASS.deep, GRASS.dark, GRASS.base, GRASS.light];
  let o = 0;
  for (let py = 0; py < H; py++) {
    const ty = (py / TPX) | 0;
    for (let px = 0; px < W; px++, o += 4) {
      const tx = (px / TPX) | 0, ti = ty * COLS + tx;
      const z = zoneCache[ti];
      const dither = BAYER[py & 1][px & 1] - 0.4;
      const fine = ((Math.imul(px * 73856093 ^ py * 19349663, 2654435761) >>> 24) / 255 - 0.5) * 0.22;
      const n = sample(n1, px, py) * 0.65 + sample(n2, px, py) * 0.35 + fine + dither * 0.12;
      let col;
      if (z === ZONE.PARK || z === ZONE.OUT) {
        // blended ground: sample the biome at a warped, jittered position
        const jx = ((Math.imul(px, 2654435761) ^ Math.imul(py, 40503)) >>> 24) / 255 - 0.5;
        const jy = ((Math.imul(py, 2246822519) ^ Math.imul(px, 3266489917)) >>> 24) / 255 - 0.5;
        const wtx = ((px + (sample(n3, px, py) - 0.5) * WARP_PX + jx * TPX * 0.6) / TPX) | 0;
        const wty = ((py + (sample(n4, px, py) - 0.5) * WARP_PX + jy * TPX * 0.6) / TPX) | 0;
        const inside = wtx >= 0 && wty >= 0 && wtx < COLS && wty < ROWS;
        const biome = (inside && srcCache[wty * COLS + wtx]) || srcCache[ti] || "meadow";
        if (biome === "meadow") col = grass[n < 0.3 ? 0 : n < 0.45 ? 1 : n < 0.68 ? 2 : 3];
        else {
          const pal = BIOMES[biome].ground;
          col = n < 0.38 ? pal[1] : n > 0.66 ? pal[2] : pal[0];
          if (biome === "swamp" && sample(n2, Math.min(W - 1, px * 1.7) % W, Math.min(H - 1, py * 1.7) % H) > 0.7) col = [44, 84, 88];
        }
      } else if (z === ZONE.ROAD || z === ZONE.DRIVE || z === ZONE.LOT) {
        const v = 60 + ((n * 26) | 0);
        col = z === ZONE.LOT ? [v + 6, v + 6, v + 14] : [v, v, v + 8];
      } else {
        const v = 196 + ((n * 22) | 0);
        col = z === ZONE.PLAZA ? [v + 14, v + 4, v - 20] : [v, v - 4, v - 16];
        if (px % 16 === 0 || py % 16 === 0) col = [col[0] - 34, col[1] - 34, col[2] - 30];
      }
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.save();
  g.scale(RES, RES);
  g.imageSmoothingEnabled = false;
  drawTerrainDetails(g);
  g.restore();
  terrainLayer = pixelCopy(terrainWork, terrainLayer);
  buildMinimapBase(zoneCache, ownCache);
  terrainDirty = false;
}

const FLOWER_COLS = ["#fff3a1", "#ff8fb8", "#ffffff", "#c9a7ff", "#ffb35c"];
function drawTerrainDetails(g) {
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++) {
      const z = zoneAt(tx, ty), X = tx * TILE, Y = ty * TILE;
      const h = hash2(tx, ty, 5), h2 = hash2(tx, ty, 6), h3 = hash2(tx, ty, 7);
      const ox = 2 + Math.floor(h2 * 10), oy = 3 + Math.floor(h3 * 9);
      if (z === ZONE.ROAD) {
        if (tx === 1) { R("#e8c13a", X + 15.5, Y + 2, 1, 6); R("#e8c13a", X + 15.5, Y + 10, 1, 4); }
        R(tx === 1 ? "#d8d8d8" : "#d8d8d8", tx === 1 ? X + 1 : X + 14.5, Y, 0.5, TILE);
        if (h < 0.15) R("rgba(0,0,0,0.25)", X + ox, Y + oy, 2.5, 1);
        continue;
      }
      if (z === ZONE.SIDEWALK) { R("rgba(0,0,0,0.25)", tx === 0 ? X + 15.5 : X, Y, 0.5, TILE); continue; }
      if (z === ZONE.LOT || z === ZONE.DRIVE) {
        if (z === ZONE.LOT && ty !== GATE.y) {
          R("#e8e8e8", X, Y + 1, 0.5, 14);
          R("#e8e8e8", X, ty < GATE.y ? Y + 1 : Y + 14.5, 16, 0.5);
        }
        if (ty === GATE.y && tx % 2 === 0) { R("#e8e8e8", X + 4, Y + 7.5, 5, 1); R("#e8e8e8", X + 9, Y + 6.5, 1, 3); }
        if (h < 0.2) R("rgba(0,0,0,0.3)", X + ox, Y + oy, 3, 1.5);
        continue;
      }
      if (z === ZONE.PLAZA) continue;
      const owned = z === ZONE.OUT || isOwned(tx, ty);
      const biome = owned && z !== ZONE.OUT ? biomeAt(tx, ty) : wildBiomeAt(X + 8, Y + 8);
      if (!owned) {
        // wild ground details
        if (biome === "autumn" || biome === "birch") for (let i = 0; i < 4; i++) R(biome === "autumn" ? AUTUMN_COLS[(i + tx) % 4] : "#e8e0b0", X + hash2(tx, ty, 20 + i) * 15, Y + hash2(tx, ty, 30 + i) * 15, 1, 0.5);
        else if (biome === "pine") for (let i = 0; i < 5; i++) R("#6b4a2a", X + hash2(tx, ty, 20 + i) * 15, Y + hash2(tx, ty, 30 + i) * 15, 1.5, 0.5);
        else if (biome === "flower") for (let i = 0; i < 5; i++) { R("#2f7a2c", X + hash2(tx, ty, 20 + i) * 14, Y + hash2(tx, ty, 30 + i) * 14 + 0.5, 0.5, 1); R(FLOWER_COLS[(i + tx + ty) % 5], X + hash2(tx, ty, 20 + i) * 14 - 0.25, Y + hash2(tx, ty, 30 + i) * 14, 1, 1); }
        else if (biome === "rocky" && h < 0.5) { R("#6f6f7a", X + ox, Y + oy + 1, 3, 1.5); R("#a9a9b4", X + ox + 0.5, Y + oy, 2, 1); }
        else if (biome === "mushroom" && h < 0.4) { R("#efe6cf", X + ox + 0.5, Y + oy + 1, 0.5, 1.5); R("#9b4ad0", X + ox, Y + oy, 1.5, 1); }
        else if (biome === "jungle") for (let i = 0; i < 3; i++) R("#1f5a2a", X + hash2(tx, ty, 20 + i) * 14, Y + hash2(tx, ty, 30 + i) * 14, 2, 0.5);
        else if (biome === "swamp" && h < 0.35) { R("#3f7a3a", X + ox, Y + oy, 2.5, 1.5); R("#ff8fb8", X + ox + 1, Y + oy, 0.5, 0.5); }
        else if (biome === "snow") { if (h < 0.5) { R("#ffffff", X + ox, Y + oy, 1, 1); R("#b4c4dc", X + ox + 1, Y + oy + 1, 1.5, 0.5); } if (h2 < 0.25) R("#9fb2cc", X + ox + 4, Y + oy + 2, 2, 1); }
        else if (biome === "cherry") for (let i = 0; i < 4; i++) R(i % 2 ? "#f7b6d2" : "#e984b0", X + hash2(tx, ty, 20 + i) * 15, Y + hash2(tx, ty, 30 + i) * 15, 1, 0.5);
        continue;
      }
      // owned or outside grass: tufts, flowers, pebbles, mushrooms with a biome flavour
      if (h < 0.11) {
        R("#2f7a2c", X + ox, Y + oy, 0.5, 2); R("#2f7a2c", X + ox + 1, Y + oy + 0.5, 0.5, 1.5); R("#2f7a2c", X + ox + 2, Y + oy, 0.5, 2);
        R("#8ad66a", X + ox + 1, Y + oy - 0.5, 0.5, 0.5);
      } else if (h < 0.18) {
        const col = FLOWER_COLS[Math.floor(h2 * 5)];
        for (const [dx, dy] of [[0, 0], [3, 1], [1, 3]]) { R("#2f7a2c", X + ox + dx + 0.25, Y + oy + dy + 1, 0.5, 1); R(col, X + ox + dx, Y + oy + dy, 1, 1); R("#ffd23f", X + ox + dx + 0.25, Y + oy + dy + 0.25, 0.5, 0.5); }
      } else if (h < 0.21) {
        R("#5c5c6e", X + ox, Y + oy + 1, 3.5, 1.5); R("#9a9aae", X + ox + 0.5, Y + oy, 2.5, 1.5); R("#c4c4d2", X + ox + 0.5, Y + oy, 1, 0.5);
      } else if (h < 0.23) {
        R("#e9e0c9", X + ox + 1, Y + oy + 2, 1, 2); R("#d9413f", X + ox, Y + oy, 3, 2); R("#fff", X + ox + 0.5, Y + oy + 0.5, 0.5, 0.5); R("#fff", X + ox + 2, Y + oy + 1, 0.5, 0.5);
      } else if (h < 0.3 && biome !== "meadow") {
        if (biome === "autumn") R(AUTUMN_COLS[Math.floor(h2 * 4)], X + ox, Y + oy, 1.5, 1);
        else if (biome === "pine") R("#6b4a2a", X + ox, Y + oy, 1, 1.5);
        else if (biome === "birch") R("#f0ece0", X + ox, Y + oy, 1, 0.5);
      }
    }
  // road curbs
  R("#8a8a92", 0, 0, 0.5, WORLD_H); R("#8a8a92", 4 * TILE - 0.5, 0, 0.5, WORLD_H);
  // parking sign
  const r = lotRect();
  const sx = r[0] * TILE - 7, sy = (GATE.y - 1) * TILE + 2;
  R("#2a2a2a", sx + 2.5, sy + 5, 1, 9); R("#000", sx, sy, 7, 7); R("#2b5fa8", sx + 0.5, sy + 0.5, 6, 6); R("#fff", sx + 2, sy + 1.5, 1, 4); R("#fff", sx + 3, sy + 1.5, 1.5, 0.5); R("#fff", sx + 4.5, sy + 2, 0.5, 1.5); R("#fff", sx + 3, sy + 3.5, 1.5, 0.5);
}

// ================= Wild trees (drawn per frame so they can sway) =================
let treeInstances = [], treesDirty = true;
function pickWeighted(list, r) { let t = 0; for (const [k, w] of list) { t += w; if (r <= t) return k; } return list[list.length - 1][0]; }
// Trees follow the same blended map as the ground, so forests fade out raggedly instead of
// stopping at a straight line. Near the edge of your land a few trees can stand on owned
// tiles; they're scenery and vanish when you build on or next to that tile.
function buildTrees() {
  treeInstances = [];
  const maxLot = LOT_LEVELS[LOT_LEVELS.length - 1].rect;
  const built = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isPath(x + dx, y + dy) || encAt(x + dx, y + dy) || objAt(x + dx, y + dy)) return true; return false; };
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const z = zoneAt(x, y);
      if (z !== ZONE.PARK && z !== ZONE.OUT) continue;
      if (z === ZONE.OUT && (x <= 4 || Math.abs(y - GATE.y) <= 1 || inRect(x, y, [maxLot[0] - 1, maxLot[1] - 1, maxLot[2] + 1, maxLot[3] + 1]))) continue;
      const ux = x * TILE + 8 + (hash2(x, y, 80) - 0.5) * 6, uy = y * TILE + 13 + (hash2(x, y, 81) - 0.5) * 4;
      const [wtx, wty] = warpedTile(ux, uy);
      const src = blendSource(wtx, wty) || blendSource(x, y) || "meadow";
      const wildThere = (zoneAt(wtx, wty) === ZONE.PARK && !isOwned(wtx, wty)) || zoneAt(wtx, wty) === ZONE.OUT;
      let density;
      if (z === ZONE.PARK && isOwned(x, y)) {
        // your own land stays clear, except for stragglers where the wild blends in
        if (!wildThere || zoneAt(wtx, wty) === ZONE.OUT || built(x, y) || (x === GATE.x && y === GATE.y)) continue;
        density = BIOMES[src].density * 0.5;
      } else if (z === ZONE.OUT) density = src === "meadow" ? 0.42 : BIOMES[src].density * 0.8;
      else density = wildThere ? BIOMES[src].density : BIOMES[src].density * 0.35;
      if (hash2(x, y, 77) > density) continue;
      const kind = pickWeighted(BIOMES[src].trees, hash2(x, y, 78));
      const spr = TREE_SPRITES[kind][Math.floor(hash2(x, y, 79) * 4)];
      treeInstances.push({
        x: ux, y: uy,
        spr, phase: hash2(x, y, 82) * 6.28, sway: kind === "rock" || kind === "reeds" ? 0 : kind === "bush" || kind === "fern" ? 0.15 : 0.35,
      });
    }
  treeInstances.sort((a, b) => a.y - b.y);
  treesDirty = false;
}
function drawTrees(time, x0, y0, x1, y1) {
  for (const t of treeInstances) {
    if (t.y < y0 - 4 || t.y > y1 + 32 || t.x < x0 - 16 || t.x > x1 + 16) continue;
    const dx = t.sway ? Math.sin(time * 1.1 + t.phase) * t.sway : 0;
    blit(ctx, t.spr, t.x - t.spr.ax + dx, t.y - t.spr.ay);
  }
}
function markWorldDirty() { terrainDirty = true; treesDirty = true; }

// ================= Cars & arriving guests =================
let cars = [], walkers = [], nextCarId = 1, trafficTimer = 4;
const CAR_SPEED = 70;
const laneDownX = 1 * TILE + 8, laneUpX = 2 * TILE + 8, driveY = GATE.y * TILE + 8;
const maxGuests = () => Math.min(MAX_VISITORS_CAP, LOT_LEVELS[lotLevel() - 1].spaces * GUESTS_PER_SPACE);
function freeStall() {
  const taken = new Set(cars.filter(c => c.stall).map(c => c.stall.x + "," + c.stall.y));
  return lotStalls().find(s => !taken.has(s.x + "," + s.y)) || null;
}
function guestsOnSite() { return visitors.filter(v => !v.leaving).length + walkers.length + cars.reduce((s, c) => s + (c.state === "arrive" ? c.seats : 0), 0); }

function spawnCar(seats) {
  const stall = freeStall();
  if (!stall) return false;
  const fromNorth = Math.random() < 0.5;
  const sx = stall.x * TILE + 8, sy = stall.y * TILE + 8;
  const path = fromNorth
    ? [[laneDownX, -24], [laneDownX, driveY], [sx, driveY], [sx, sy]]
    : [[laneUpX, WORLD_H + 24], [laneUpX, driveY], [sx, driveY], [sx, sy]];
  cars.push({ id: nextCarId++, set: Math.floor(Math.random() * CAR_SPRITES.length), x: path[0][0], y: path[0][1], dir: fromNorth ? 2 : 0, path: path.slice(1), state: "arrive", stall, seats, parkedAt: 0 });
  return true;
}
function spawnTraffic() {
  const down = Math.random() < 0.5;
  cars.push({ id: nextCarId++, set: Math.floor(Math.random() * CAR_SPRITES.length), x: down ? laneDownX : laneUpX, y: down ? -24 : WORLD_H + 24, dir: down ? 2 : 0, path: [[down ? laneDownX : laneUpX, down ? WORLD_H + 30 : -30]], state: "pass", seats: 0 });
}
function carLeave(c) {
  const sx = c.stall.x * TILE + 8;
  const north = Math.random() < 0.5;
  c.path = [[sx, driveY], [north ? laneUpX : laneDownX, driveY], north ? [laneUpX, -30] : [laneDownX, WORLD_H + 30]];
  c.state = "leave";
  c.stall = null;
}

function updateCars(dt) {
  trafficTimer -= dt;
  if (trafficTimer < 0) { trafficTimer = 5 + Math.random() * 10; if (state.settings.effects !== false) spawnTraffic(); }
  for (const c of cars) {
    const wp = c.path[0];
    if (!wp) {
      if (c.state === "arrive") {
        c.state = "parked";
        c.parkedAt = performance.now();
        c.dir = c.stall.y < GATE.y ? 0 : 2;
        for (let i = 0; i < c.seats; i++) {
          const look = randomLook(rollVisitorType());
          walkers.push({ look, frames: personFrames(look), x: c.x + (i - (c.seats - 1) / 2) * 4, y: c.y, path: [[c.x, driveY + (i % 2 ? 3 : -3)], [GATE.x * TILE - 1, driveY]], carId: c.id, delay: i * 0.35, phase: Math.random() * 6 });
        }
      } else if (c.state !== "parked") c.done = true;
      continue;
    }
    const dx = wp[0] - c.x, dy = wp[1] - c.y, dist = Math.hypot(dx, dy), step = CAR_SPEED * dt;
    if (dist <= step) { c.x = wp[0]; c.y = wp[1]; c.path.shift(); }
    else { c.x += (dx / dist) * step; c.y += (dy / dist) * step; }
    if (Math.abs(dx) > Math.abs(dy)) c.dir = dx > 0 ? 1 : 3; else if (dist > 0.5) c.dir = dy > 0 ? 2 : 0;
  }
  // parked cars leave once their whole group has gone home
  for (const c of cars) {
    if (c.state !== "parked") continue;
    const busy = visitors.some(v => v.carId === c.id) || walkers.some(w => w.carId === c.id);
    if (!busy && performance.now() - c.parkedAt > 4000) carLeave(c);
  }
  cars = cars.filter(c => !c.done);
  for (const w of walkers) {
    w.phase += dt * 10;
    if (w.delay > 0) { w.delay -= dt; continue; }
    const wp = w.path[0];
    if (!wp) { w.arrived = true; continue; }
    const dx = wp[0] - w.x, dy = wp[1] - w.y, dist = Math.hypot(dx, dy), step = 26 * dt;
    if (dist <= step) { w.x = wp[0]; w.y = wp[1]; w.path.shift(); } else { w.x += (dx / dist) * step; w.y += (dy / dist) * step; }
  }
  for (const w of walkers) if (w.arrived) { if (isOpen()) admitVisitor(w); }
  walkers = walkers.filter(w => !w.arrived);
}

function drawCars(x0, y0, x1, y1) {
  for (const c of cars.slice().sort((a, b) => a.y - b.y)) {
    if (c.x < x0 - 20 || c.x > x1 + 20 || c.y < y0 - 20 || c.y > y1 + 20) continue;
    const spr = CAR_SPRITES[c.set][c.dir];
    blit(ctx, spr, Math.round((c.x - uW(spr) / 2) * 2) / 2, Math.round((c.y - uH(spr) / 2) * 2) / 2);
  }
  for (const w of walkers) {
    if (w.delay > 0) continue;
    const f = w.frames[Math.floor(w.phase) % 2 ? 1 : 2];
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(w.x - 3, w.y + 5, 6, 1.5);
    blit(ctx, f, w.x - 3.5, w.y - 6.5);
  }
}

// ================= Camera =================
const view = { x: 0, y: 0, zoom: 2, cssW: 800, cssH: 500, dpr: 1, fit: 0 };
const ZOOMS = [1, 2, 3, 4];
const VIEW_PAD = 3 * TILE;    // the camera only peeks at the city's edge
const viewW = () => view.cssW / view.zoom;
const viewH = () => view.cssH / view.zoom;
function clampView() {
  const vw = viewW(), vh = viewH();
  view.x = vw >= WORLD_W - 0.5 ? (WORLD_W - vw) / 2 : Math.max(-VIEW_PAD, Math.min(WORLD_W + VIEW_PAD - vw, view.x));
  view.y = vh >= WORLD_H - 0.5 ? (WORLD_H - vh) / 2 : Math.max(-VIEW_PAD, Math.min(WORLD_H + VIEW_PAD - vh, view.y));
}
function resizeView() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const cx = view.x + viewW() / 2, cy = view.y + viewH() / 2;
  const wasFit = view.zoom === view.fit;
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.cssW = r.width; view.cssH = r.height;
  canvas.width = Math.max(1, Math.round(r.width * view.dpr));
  canvas.height = Math.max(1, Math.round(r.height * view.dpr));
  view.x = cx - viewW() / 2; view.y = cy - viewH() / 2;
  view.fit = fitZoom();
  if (wasFit || view.zoom < view.fit) setZoom(view.fit);
  else clampView();
}
function centerOn(wx, wy) { view.x = wx - viewW() / 2; view.y = wy - viewH() / 2; clampView(); }
// The zoom that shows the whole world at once.
function fitZoom() { return Math.min(view.cssW / WORLD_W, view.cssH / WORLD_H); }
// Zoom steps: "whole map", then whole numbers (so art pixels stay even) above it.
function zoomLevels() {
  const fit = fitZoom();
  return [fit, ...ZOOMS.filter(z => z > fit + 0.05)];
}
function setZoom(z, ax = view.cssW / 2, ay = view.cssH / 2) {
  const levels = zoomLevels();
  z = levels.reduce((best, v) => Math.abs(v - z) < Math.abs(best - z) ? v : best, levels[0]);
  view.fit = levels[0];
  const wx = view.x + ax / view.zoom, wy = view.y + ay / view.zoom;
  view.zoom = z;
  view.x = wx - ax / z; view.y = wy - ay / z;
  clampView();
  const label = $("zoom-label");
  if (label) label.textContent = z === view.fit ? "MAP" : Math.round(z * 50) + "%";
}
function zoomStep(dir, ax, ay) {
  const levels = zoomLevels();
  let i = 0;
  for (let k = 0; k < levels.length; k++) if (Math.abs(levels[k] - view.zoom) < Math.abs(levels[i] - view.zoom)) i = k;
  if (Math.abs(levels[i] - view.zoom) > 0.001 && Math.sign(levels[i] - view.zoom) === dir) setZoom(levels[i], ax, ay);
  else setZoom(levels[Math.max(0, Math.min(levels.length - 1, i + dir))], ax, ay);
}
function homeView() { centerOn(GATE.x * TILE + Math.max(TILE, Math.min(8 * TILE, viewW() / 2 - TILE)), GATE.y * TILE); }

const keysDown = new Set();
const KEYMAP = { ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d", a: "l", d: "r", w: "u", s: "d", A: "l", D: "r", W: "u", S: "d" };
function typingTarget(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) || document.querySelector("dialog[open]") || !document.getElementById("fx-overlay").hidden;
}
window.addEventListener("keydown", e => {
  if (typingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (KEYMAP[e.key]) { keysDown.add(KEYMAP[e.key]); if (e.key.startsWith("Arrow")) e.preventDefault(); }
  else if (e.key === "-" || e.key === "_") { zoomStep(-1); e.preventDefault(); }
  else if (e.key === "=" || e.key === "+") { zoomStep(1); e.preventDefault(); }
});
window.addEventListener("keyup", e => { if (KEYMAP[e.key]) keysDown.delete(KEYMAP[e.key]); });
window.addEventListener("blur", () => keysDown.clear());
function updateCamera(dt) {
  let dx = 0, dy = 0;
  if (keysDown.has("l")) dx--; if (keysDown.has("r")) dx++;
  if (keysDown.has("u")) dy--; if (keysDown.has("d")) dy++;
  if (!dx && !dy) return;
  const sp = 460 / view.zoom;
  view.x += dx * sp * dt; view.y += dy * sp * dt;
  clampView();
}
let wheelAcc = 0, lastWheel = 0;
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  wheelAcc += e.deltaY;
  const now = performance.now();
  if (Math.abs(wheelAcc) < 30 || now - lastWheel < 70) return;
  const r = canvas.getBoundingClientRect();
  zoomStep(wheelAcc < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
  wheelAcc = 0; lastWheel = now;
}, { passive: false });
// keep the map filling the window: track the top bar's height and the canvas's size
function syncLayout() {
  const bar = document.querySelector(".topbar");
  if (bar) document.documentElement.style.setProperty("--topbar-h", bar.offsetHeight + "px");
}
window.addEventListener("resize", () => { syncLayout(); resizeView(); });
syncLayout();
if (window.ResizeObserver) new ResizeObserver(() => resizeView()).observe(canvas);

// ================= Minimap =================
const minimap = document.getElementById("minimap");
const mmCtx = minimap.getContext("2d");
const MM = 2;   // minimap pixels per tile
function buildMinimapBase(zoneCache, ownCache) {
  minimapBase = makeCanvas(COLS * MM, ROWS * MM);
  const g = minimapBase.getContext("2d");
  const colOf = (x, y) => {
    const z = zoneCache[y * COLS + x];
    if (z === ZONE.ROAD || z === ZONE.DRIVE) return "#3c3c46";
    if (z === ZONE.LOT) return "#55555f";
    if (z === ZONE.SIDEWALK || z === ZONE.PLAZA) return "#c9c4b6";
    if (z === ZONE.OUT) return "#3f7a36";
    if (ownCache[y * COLS + x]) return "#5bae4b";
    const p = BIOMES[biomeAt(x, y)].ground[1];
    return `rgb(${p[0] - 10},${p[1] - 10},${p[2] - 10})`;
  };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { g.fillStyle = colOf(x, y); g.fillRect(x * MM, y * MM, MM, MM); }
}
function drawMinimap() {
  if (!minimapBase) return;
  const g = mmCtx;
  g.imageSmoothingEnabled = false;
  g.drawImage(minimapBase, 0, 0);
  g.fillStyle = "#e6c793";
  for (let y = 0; y < ROWS; y++) for (let x = OX; x < COLS; x++) if (state.tiles[idx(x, y)]) g.fillRect(x * MM, y * MM, MM, MM);
  for (const e of state.enclosures) for (const [x, y] of encCells(e)) { g.fillStyle = "#a8703c"; g.fillRect(x * MM, y * MM, MM, MM); }
  g.fillStyle = "#ffd23f";
  for (const k of PLOT_KEYS) if (plotForSale(k)) g.fillRect(PLOTS[k].sign[0] * MM - 1, PLOTS[k].sign[1] * MM - 1, 3, 3);
  g.fillStyle = "#ff5c7a"; g.fillRect(GATE.x * MM - 1, GATE.y * MM - 1, 3, 3);
  g.strokeStyle = "#fff"; g.lineWidth = 1;
  g.strokeRect(Math.round(view.x / TILE * MM) + 0.5, Math.round(view.y / TILE * MM) + 0.5, Math.round(viewW() / TILE * MM), Math.round(viewH() / TILE * MM));
}
function minimapJump(e) {
  const r = minimap.getBoundingClientRect();
  centerOn((e.clientX - r.left) / r.width * WORLD_W, (e.clientY - r.top) / r.height * WORLD_H);
}
let mmDrag = false;
minimap.addEventListener("pointerdown", e => { mmDrag = true; minimap.setPointerCapture(e.pointerId); minimapJump(e); e.stopPropagation(); });
minimap.addEventListener("pointermove", e => { if (mmDrag) minimapJump(e); });
minimap.addEventListener("pointerup", () => { mmDrag = false; });

// ================= Ambient: butterflies by day, fireflies at night =================
const critters = Array.from({ length: 16 }, (_, i) => ({ x: 0, y: 0, t: Math.random() * 10, seed: i, col: ["#ff8fb8", "#fff3a1", "#9fd4ff", "#ffffff", "#c9a7ff"][i % 5], live: false }));
function updateAmbient(dt) {
  const vx = view.x, vy = view.y, vw = viewW(), vh = viewH();
  for (const b of critters) {
    b.t += dt;
    if (!b.live || b.x < vx - 40 || b.x > vx + vw + 40 || b.y < vy - 40 || b.y > vy + vh + 40) {
      b.x = vx + Math.random() * vw; b.y = vy + Math.random() * vh; b.live = true;
      b.vx = (Math.random() - 0.5) * 14; b.vy = (Math.random() - 0.5) * 10;
    }
    b.x += (b.vx + Math.sin(b.t * 1.7 + b.seed) * 8) * dt;
    b.y += (b.vy + Math.cos(b.t * 2.3 + b.seed) * 6) * dt;
  }
}
function drawAmbient(time) {
  if (!state.settings.effects) return;
  const night = darkness() > 0.25;
  if (night) {
    ctx.globalCompositeOperation = "lighter";
    for (const b of critters) {
      const a = 0.5 + Math.sin(b.t * 3 + b.seed) * 0.5;
      ctx.fillStyle = `rgba(220,255,120,${0.25 * a})`; ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      ctx.fillStyle = `rgba(240,255,170,${0.9 * a})`; ctx.fillRect(b.x - 0.5, b.y - 0.5, 1, 1);
    }
    ctx.globalCompositeOperation = "source-over";
  } else if (weather === "clear" || weather === "cloudy") {
    for (const b of critters.slice(0, 9)) {
      const flap = Math.floor(b.t * 12 + b.seed) % 2;
      ctx.fillStyle = "#2a1a10"; ctx.fillRect(b.x - 0.25, b.y - 0.5, 0.5, 1.5);
      ctx.fillStyle = b.col;
      if (flap) { ctx.fillRect(b.x - 1.5, b.y - 1, 1.25, 1.25); ctx.fillRect(b.x + 0.25, b.y - 1, 1.25, 1.25); }
      else { ctx.fillRect(b.x - 1, b.y - 0.5, 0.75, 1); ctx.fillRect(b.x + 0.25, b.y - 0.5, 0.75, 1); }
    }
  }
}
