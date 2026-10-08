"use strict";

// ================= Individuals =================
function makeIndividual(k, s, opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const r = seeded(seed);
  const pickFrom = arr => arr[Math.floor(r() * arr.length)];
  const sizeRoll = r();
  let acc = "none";
  if (r() < 0.4) {
    const options = Object.keys(ACCESSORIES).filter(a => a !== "none" && !(NO_HEADWEAR.includes(k) && HEADWEAR.includes(a)));
    acc = pickFrom(options);
  }
  const marks = Object.keys(MARKINGS).filter(m => m !== "none");
  const mark = r() < 0.5 ? "none" : pickFrom(marks);
  return {
    id: s.nextUid++,
    k, seed,
    name: pickFrom(NAME_A) + pickFrom(NAME_B),
    size: sizeRoll < 0.2 ? -1 : sizeRoll > 0.82 ? 1 : 0,
    hue: Math.round((r() - 0.5) * 24),
    light: Math.round((r() - 0.5) * 16),
    mark, acc,
    trait: pickFrom(TRAIT_KEYS),
    shiny: Math.random() < (opts.shinyChance ?? SHINY_CHANCE),
    xp: 0,
    food: 100,
    joy: 60,
    born: Date.now(),
  };
}

// ================= State =================
function defaultState() {
  const tiles = new Array(COLS * ROWS).fill(0);
  for (let x = GATE.x; x <= GATE.x + 12; x++) tiles[GATE.y * COLS + x] = 1;
  const s = {
    version: SAVE_VERSION,
    money: 150,
    tiles,
    enclosures: [{ id: 1, x: OX + 4, y: OY + 5, s: 3, theme: "meadow", variants: [], lostUntil: 0 }],
    objects: [],
    inventory: [],
    discovered: { verity: true },
    recipesKnown: {},
    eggsHatched: 0,
    totalEarned: 0,
    visitorsServed: 0,
    incomeRate: 0,
    lastSaved: Date.now(),
    nextId: 2,
    nextUid: 1,
    labLevel: 0,
    level: 1,
    xp: 0,
    goal: 0,
    achievements: {},
    stats: { hatched: 0, fusions: 0, pets: 0, tugWins: 0, renamed: 0, shinies: 0, virals: 0,
             feeds: 0, trashCleaned: 0, escapesCaught: 0, requests: 0, prestiges: 0, reviews5: 0, golden: 0, cursed: 0 },
    settings: { sound: true, coinSound: true, music: true, sfxVol: 0.8, musicVol: 0.5, shake: true, effects: true },
    plots: { start: true },
    staff: {},
    trash: [],
    request: null,
    freeEggs: 0,
    freeGolden: 0,
    eggCounts: { regular: 0, golden: 0, cursed: 0 },
    daily: { last: "", streak: 0 },
    shards: 0,
    runEarned: 0,
    worldClock: DAY_SECS + 1,
    worldVersion: WORLD_VERSION,
    lotLevel: 1,
    day: null,
    seenVersion: "",
  };
  s.enclosures[0].variants.push(makeIndividual("verity", s, { shinyChance: 0 }));
  return s;
}

let state = defaultState();

// Transient (not saved)
let visitors = [];
let floaters = [];
let particles = [];
let encGrid = new Int32Array(COLS * ROWS);
let objGrid = new Int32Array(COLS * ROWS);
let nearPens = new Map();
let critterPos = new Map();
let tool = "inspect";
let selectedUid = 0;
let inspectedId = 0;
let hover = null;
let painting = false;
let spawnTimer = 0;
let secondTimer = 0;
let secondEarnings = 0;
let earningsWindow = [];
let resetting = false;
let activeEvent = null;
let eventTimer = 75;
let fuseSel = [0, 0];
let indexSel = null;
let petCooldown = new Map();
let tickCount = 0;
let hasElectricity = false;
let activeTab = "park";

// ================= Save / load =================
function saveGame() {
  if (resetting) return;
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    setSaveStatus("Saved " + new Date().toLocaleTimeString());
  } catch (e) {
    setSaveStatus("Couldn't save (browser storage blocked).");
  }
}

function sanitizeInd(x, s) {
  if (typeof x === "string") return VARIANTS[x] ? makeIndividual(x, s, { shinyChance: 0 }) : null;
  if (!x || typeof x !== "object" || !VARIANTS[x.k]) return null;
  const ind = Object.assign({ name: "Blob", size: 0, hue: 0, light: 0, mark: "none", acc: "none", trait: "chill", shiny: false, xp: 0, food: 100, joy: 60, born: Date.now(), seed: 1 }, x);
  ind.food = Math.max(0, Math.min(100, Number(ind.food) || 0));
  ind.joy = Math.max(0, Math.min(100, Number(ind.joy) || 0));
  if (!SIZES[ind.size]) ind.size = 0;
  if (!MARKINGS[ind.mark]) ind.mark = "none";
  if (!ACCESSORIES[ind.acc]) ind.acc = "none";
  if (!TRAITS[ind.trait]) ind.trait = "chill";
  ind.name = String(ind.name).slice(0, 16);
  ind.xp = Number(ind.xp) || 0;
  ind.hue = Number(ind.hue) || 0;
  ind.light = Number(ind.light) || 0;
  ind.shiny = !!ind.shiny;
  if (typeof ind.id !== "number") ind.id = 0;
  return ind;
}

function sanitize(data) {
  const base = defaultState();
  if (!data || typeof data !== "object") return base;
  const s = Object.assign(base, data);
  s.stats = Object.assign(defaultState().stats, data.stats || {});
  s.settings = Object.assign(defaultState().settings, data.settings || {});
  s.plots = data.plots && typeof data.plots === "object" ? Object.assign({ start: true }, data.plots) : { start: true, east: true, south: true, corner: true };
  s.staff = Object.fromEntries(Object.keys(STAFF).map(t => [t, Math.max(0, Math.min(STAFF[t].max, Math.floor(Number((data.staff || {})[t]) || 0)))]));
  s.trash = (Array.isArray(data.trash) ? data.trash : []).filter(t => t && Number.isInteger(t.x) && Number.isInteger(t.y)).slice(0, 60);
  s.request = data.request && VARIANTS[data.request.k] ? data.request : null;
  s.eggCounts = Object.assign({ regular: Number(data.eggsHatched) || 0, golden: 0, cursed: 0 }, data.eggCounts || {});
  s.daily = Object.assign({ last: "", streak: 0 }, data.daily || {});
  for (const k of ["freeEggs", "freeGolden", "shards", "runEarned", "worldClock"]) s[k] = Math.max(0, Number(data[k]) || (k === "worldClock" ? DAY_SECS + 1 : 0));
  s.lotLevel = Math.max(1, Math.min(LOT_LEVELS.length, Math.floor(Number(data.lotLevel) || 1)));
  s.day = data.day && typeof data.day === "object" ? data.day : null;
  s.seenVersion = typeof data.seenVersion === "string" ? data.seenVersion : "";
  if (data.worldVersion !== WORLD_VERSION && Array.isArray(data.tiles) && data.tiles.length === CORE_W * CORE_H) {
    // v1.0 parks were 24x16 tiles: move everything into the middle of the bigger world
    const tiles = new Array(COLS * ROWS).fill(0);
    for (let y = 0; y < CORE_H; y++) for (let x = 0; x < CORE_W; x++) tiles[(y + OY) * COLS + x + OX] = data.tiles[y * CORE_W + x];
    s.tiles = tiles;
    for (const e of Array.isArray(s.enclosures) ? s.enclosures : []) if (e) { e.x += OX; e.y += OY; }
    for (const o of Array.isArray(s.objects) ? s.objects : []) if (o) { o.x += OX; o.y += OY; }
    for (const t of s.trash) { t.x += OX; t.y += OY; }
    if (!data.plots) s.plots = { start: true, east: true, south: true, corner: true };
  }
  s.worldVersion = WORLD_VERSION;
  for (const k of Object.keys(s.plots)) if (!PLOTS[k]) delete s.plots[k];
  if (!Array.isArray(s.tiles) || s.tiles.length !== COLS * ROWS) s.tiles = defaultState().tiles;
  if (typeof s.nextUid !== "number") s.nextUid = 1;
  s.inventory = (Array.isArray(s.inventory) ? s.inventory : []).map(x => sanitizeInd(x, s)).filter(Boolean);
  s.enclosures = (Array.isArray(s.enclosures) ? s.enclosures : [])
    .filter(e => e && Number.isInteger(e.x) && Number.isInteger(e.y))
    .map(e => ({
      id: e.id, x: e.x, y: e.y, lostUntil: Number(e.lostUntil) || 0,
      s: SIZE_KEY[e.s] ? e.s : 3,
      theme: THEMES[e.theme] ? e.theme : "meadow",
      variants: (Array.isArray(e.variants) ? e.variants : []).map(x => sanitizeInd(x, s)).filter(Boolean).slice(0, ENC_TYPES[SIZE_KEY[SIZE_KEY[e.s] ? e.s : 3]].cap),
    }));
  s.objects = (Array.isArray(s.objects) ? s.objects : []).filter(o => o && OBJECTS[o.t] && Number.isInteger(o.x) && Number.isInteger(o.y));
  // make sure every individual has a unique id
  const seen = new Set();
  let maxId = 0;
  const all = [...s.inventory, ...s.enclosures.flatMap(e => e.variants)];
  for (const ind of all) if (ind.id > 0 && !seen.has(ind.id)) { seen.add(ind.id); maxId = Math.max(maxId, ind.id); } else ind.id = 0;
  s.nextUid = Math.max(s.nextUid, maxId + 1);
  for (const ind of all) if (!ind.id) ind.id = s.nextUid++;
  let maxObj = 0;
  for (const e of s.enclosures) maxObj = Math.max(maxObj, e.id || 0);
  for (const o of s.objects) maxObj = Math.max(maxObj, o.id || 0);
  s.nextId = Math.max(Number(s.nextId) || 2, maxObj + 1);
  for (const e of s.enclosures) if (!e.id) e.id = s.nextId++;
  for (const o of s.objects) if (!o.id) o.id = s.nextId++;
  if (typeof s.discovered !== "object" || !s.discovered) s.discovered = {};
  s.discovered.verity = true;
  for (const ind of all) s.discovered[ind.k] = true;
  if (typeof s.recipesKnown !== "object" || !s.recipesKnown) s.recipesKnown = {};
  if (typeof s.achievements !== "object" || !s.achievements) s.achievements = {};
  s.money = Number(s.money) || 0;
  s.incomeRate = Number(s.incomeRate) || 0;
  s.goal = Math.max(0, Math.min(GOALS.length, Number(s.goal) || 0));
  s.labLevel = Math.max(0, Math.min(LAB_MAX_LEVEL, Number(s.labLevel) || 0));
  if (typeof data.level !== "number") {
    // Older saves had no park XP: credit what the player already achieved.
    s.level = 1;
    s.xp = discoveredIn(s) * 40 + s.stats.hatched * XP.hatch + s.stats.fusions * 30 + s.goal * 60 + Object.keys(s.achievements).length * XP.achievement;
  }
  s.level = Math.max(1, Math.min(MAX_PARK_LEVEL, Math.floor(Number(s.level) || 1)));
  s.xp = Math.max(0, Number(s.xp) || 0);
  while (s.level < MAX_PARK_LEVEL && s.xp >= xpToNext(s.level)) { s.xp -= xpToNext(s.level); s.level++; }
  s.tiles = s.tiles.map(t => (PATH_TYPES[t] ? t : 0));
  if (!s.tiles[GATE.y * COLS + GATE.x]) s.tiles[GATE.y * COLS + GATE.x] = 1;
  s.version = SAVE_VERSION;
  return s;
}

function discoveredIn(s) { return VARIANT_KEYS.filter(k => s.discovered[k]).length; }

function loadGame() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
  if (!raw) return false;
  try {
    state = sanitize(JSON.parse(raw));
    return true;
  } catch (e) {
    return false;
  }
}

function applyOfflineEarnings() {
  const secondsAway = (Date.now() - (state.lastSaved || Date.now())) / 1000;
  if (secondsAway < 30) return;
  const capped = Math.min(secondsAway, OFFLINE_CAP_SEC);
  const openShare = DAY_SECS / CYCLE_SECS;
  for (const { ind } of placedList()) {
    ind.xp += capped * 0.5 * openShare * xpRate(ind);
    if (isUnlocked("care")) ind.food = Math.max(Math.min(ind.food, CARE.offlineFloor), ind.food - capped * CARE.foodDecay);
  }
  const earned = Math.floor(capped * state.incomeRate * OFFLINE_RATE * openShare);
  if (earned <= 0) return;
  state.money += earned;
  state.totalEarned += earned;
  toast(`Welcome back! You were away ${formatDuration(secondsAway)}. Visitors paid ${fmt(earned)} coins.`, 7000);
}

function exportSave() {
  saveGame();
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

function importSave(code) {
  const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  state = sanitize(data);
  state.lastSaved = Date.now();
  visitors = [];
  critterPos.clear();
  spriteCache.clear();
  activeEvent = null;
  inspectedId = 0;
  selectedUid = 0;
  fuseSel = [0, 0];
  escapes.clear();
  staffWalkers = [];
  markWorldDirty();
  syncStaff();
  rebuildGrids();
  saveGame();
  applyLocks();
  renderUI(true);
}

// ================= Helpers =================
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const idx = (x, y) => y * COLS + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const isPath = (x, y) => inBounds(x, y) && state.tiles[idx(x, y)] > 0;
const encSize = e => e.s || 3;
const capOf = e => ENC_TYPES[SIZE_KEY[encSize(e)]].cap;
const encAt = (x, y) => inBounds(x, y) ? encGrid[idx(x, y)] : 0;
const objAt = (x, y) => inBounds(x, y) ? objGrid[idx(x, y)] : 0;
const getEnc = id => state.enclosures.find(e => e.id === id);
const getObj = id => state.objects.find(o => o.id === id);
const randItem = arr => arr[Math.floor(Math.random() * arr.length)];
const isLost = e => e.lostUntil > Date.now();

function allIndividuals() { return [...state.inventory, ...state.enclosures.flatMap(e => e.variants)]; }
function placedList() { return state.enclosures.flatMap(e => e.variants.map(ind => ({ ind, e }))); }
function findInd(uid) {
  const inv = state.inventory.find(i => i.id === uid);
  if (inv) return { ind: inv, e: null };
  for (const e of state.enclosures) {
    const ind = e.variants.find(i => i.id === uid);
    if (ind) return { ind, e };
  }
  return null;
}
function discoveredCount() { return VARIANT_KEYS.filter(k => state.discovered[k]).length; }
function hasRarity(r) { return VARIANT_KEYS.some(k => state.discovered[k] && VARIANTS[k].rarity === r); }
function countObjects(kind) { return state.objects.filter(o => OBJECTS[o.t].kind === kind).length; }
function levelOf(ind) { return Math.min(10, 1 + Math.floor(Math.sqrt(ind.xp / 45))); }
function xpForLevel(l) { return 45 * (l - 1) * (l - 1); }
function xpRate(ind) { return ind.k === "eternity" ? 3 : ind.k === "humidity" ? 1.5 : 1; }
function encNumber(e) { return state.enclosures.indexOf(e) + 1; }

function fmt(n) {
  n = Math.floor(n);
  if (n < 1e4) return n.toLocaleString();
  const units = ["K", "M", "B", "T"];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + units[u];
}
function fmtVal(v) { return v < 10 ? (Math.round(v * 10) / 10).toString() : fmt(v); }

function formatDuration(sec) {
  if (sec < 60) return Math.floor(sec) + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m";
  const h = Math.floor(sec / 3600);
  return h + "h " + Math.floor((sec % 3600) / 60) + "m";
}

function rebuildGrids() {
  encGrid.fill(0);
  objGrid.fill(0);
  for (const e of state.enclosures)
    for (let dy = 0; dy < encSize(e); dy++)
      for (let dx = 0; dx < encSize(e); dx++)
        if (inBounds(e.x + dx, e.y + dy)) encGrid[idx(e.x + dx, e.y + dy)] = e.id;
  for (const o of state.objects) if (inBounds(o.x, o.y)) objGrid[idx(o.x, o.y)] = o.id;
  nearPens = new Map();
  for (const a of state.enclosures) {
    nearPens.set(a.id, state.enclosures.filter(b => {
      if (a === b) return false;
      const gx = Math.max(b.x - (a.x + encSize(a)), a.x - (b.x + encSize(b)), 0);
      const gy = Math.max(b.y - (a.y + encSize(a)), a.y - (b.y + encSize(b)), 0);
      return gx <= 2 && gy <= 2;
    }));
  }
  hasElectricity = placedList().some(p => p.ind.k === "electricity");
}

function touchesPath(x, y, w, h) {
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      const edge = dx === -1 || dy === -1 || dx === w || dy === h;
      const corner = (dx === -1 || dx === w) && (dy === -1 || dy === h);
      if (edge && !corner && isPath(x + dx, y + dy)) return true;
    }
  return false;
}

// ================= Park XP & unlocks =================
const isUnlocked = id => state.level >= (UNLOCK_LEVEL[id] || 1);
function maxEnclosures() {
  let n = 2;
  for (const u of UNLOCKS) if (u.id.startsWith("enc:") && state.level >= u.level) n++;
  return n;
}
function nextUnlockLevel() {
  const u = UNLOCKS.find(u => u.level > state.level);
  return u ? u.level : null;
}
function fuseLevelFor(rarity) { return UNLOCK_LEVEL["fuse:" + rarity]; }

function gainParkXp(amount) {
  if (!(amount > 0) || state.level >= MAX_PARK_LEVEL) return;
  state.xp += amount;
  let leveled = false;
  while (state.level < MAX_PARK_LEVEL && state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level++;
    leveled = true;
    const unlocked = UNLOCKS.filter(u => u.level === state.level).map(u => u.name);
    toast(`Park level ${state.level}!` + (unlocked.length ? ` Unlocked: ${unlocked.join(", ")}.` : ""), 6000, "celebrity");
  }
  if (leveled) {
    sfx("fanfare", 3);
    const badge = $("park-level");
    badge.classList.remove("pop"); void badge.offsetWidth; badge.classList.add("pop");
    applyLocks();
    renderUI(true);
  }
}

let encChoice = { size: "small", theme: "meadow" };
let pathChoice = 1;
function enclosureCost(size = encChoice.size, theme = encChoice.theme) {
  return Math.round(ENC_TYPES[size].cost * THEMES[theme].costMult * Math.pow(1.3, Math.max(0, state.enclosures.length - 1)));
}
function eggCost() { return eggCostOf("regular"); }
function objectCost(t) { return Math.round(OBJECTS[t].cost * Math.pow(1.15, state.objects.filter(o => o.t === t).length)); }
function labUpgradeCost() { return 500 * Math.pow(4, state.labLevel); }
function releaseValue(ind) { return Math.round(VARIANTS[ind.k].value * 5 * (ind.shiny ? 5 : 1) * (1 + 0.1 * (levelOf(ind) - 1))); }

function indAppeal(ind) { return VARIANTS[ind.k].appeal * (ind.shiny ? 2 : 1); }
function parkAppeal() {
  let a = 0;
  for (const e of state.enclosures) if (!isLost(e)) for (const ind of e.variants) a += indAppeal(ind);
  for (const o of state.objects) a += OBJECTS[o.t].appeal;
  for (const e of state.enclosures) a += ENC_TYPES[SIZE_KEY[encSize(e)]].appeal;
  for (const t of state.tiles) if (t > 1) a += PATH_TYPES[t].appeal;
  a += staffCount("mascot") * STAFF.mascot.appeal;
  a -= state.trash.length * 0.5;
  return Math.max(0, a);
}
function starRating() {
  const a = parkAppeal();
  let s = 1;
  STAR_THRESHOLDS.forEach((t, i) => { if (a >= t) s = i + 1; });
  return s;
}

function globalMult() { return (1 + 0.02 * Object.keys(state.achievements).length) * (1 + SHARD_BONUS * state.shards); }
function eventMult(k) {
  if (!activeEvent) return 1;
  if (activeEvent.type === "viral" && activeEvent.key === k) return 3;
  if (activeEvent.type === "song" && k === "verity") return 5;
  return 1;
}

function penMult(ind, e) {
  let m = 1;
  const others = e.variants.filter(o => o !== ind);
  const calm = e.variants.some(o => o.k === "sanity");
  for (const o of others) {
    if (o.k === "lovity") m += 0.1;
    if (o.k === "backrooms") m += 0.2;
    if (o.k === "cruelty" && ind.k !== "cruelty" && !calm) m -= 0.1;
    if (o.k === "toxicity" && ind.k !== "toxicity" && !calm) m -= 0.2;
  }
  if ((ind.k === "steve" || ind.k === "pirate") && others.some(o => o.k === "backrooms")) m += 1;
  const near = nearPens.get(e.id) || [];
  if (ind.k === "moggity" && near.length) m += 0.5;
  if (ind.k !== "moggity" && near.some(n => n.variants.some(o => o.k === "moggity"))) m -= 0.25;
  return Math.max(0.1, m);
}

function baseValue(ind, e) {
  let v = VARIANTS[ind.k].value * TRAITS[ind.trait].mult * (1 + 0.1 * (levelOf(ind) - 1)) * (ind.shiny ? 5 : 1);
  if (e) v *= penMult(ind, e) * (likesTheme(ind, e) ? 1 + THEME_BONUS : 1);
  v *= careMult(ind);
  if ((ind.k === "insanity" || ind.k === "eternity") && isEvening()) v *= 2;
  if (ind.k === "humidity" && (weather === "rain" || weather === "storm")) v *= 2;
  return v * eventMult(ind.k) * globalMult();
}

function expectedValue(ind, e) {
  let v = baseValue(ind, e);
  if (ind.k === "calamity" || ind.k === "insanity") v *= 1.5;
  if (ind.k === "ferocity") v *= 1.25;
  if (ind.k === "curiosity" && e) v += e.variants.length - 1;
  return v;
}

function payFor(ind, e) {
  let v = baseValue(ind, e);
  const r = Math.random();
  if (ind.k === "falsity") v *= r < 0.2 ? 0 : r < 0.4 ? 2 : 1;
  if (ind.k === "calamity") v *= r * 3;
  if (ind.k === "insanity") v *= 0.5 + r * 2;
  if (ind.k === "ferocity") v *= 1 + r * 0.5;
  if (ind.k === "curiosity") v += e.variants.length - 1;
  return v;
}

function earn(amount, px, py, color, cat = "Other") {
  if (!(amount > 0)) return;
  if (state.day) state.day.revenue[cat] = (state.day.revenue[cat] || 0) + amount;
  state.money += amount;
  state.totalEarned += amount;
  state.runEarned += amount;
  secondEarnings += amount;
  if (px !== undefined && amount >= 0.5) floaters.push({ x: px, y: py, text: "+" + fmt(Math.round(amount)), t: 0, color });
}

function spend(amount, cat = "Purchases") {
  if (state.money < amount) return false;
  state.money -= amount;
  logExpense(amount, cat);
  return true;
}
function logExpense(amount, cat) {
  if (state.day && amount > 0) state.day.expenses[cat] = (state.day.expenses[cat] || 0) + amount;
}

// ================= Canvas =================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

function worldFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  const gx = view.x + (e.clientX - r.left) / view.zoom;
  const gy = view.y + (e.clientY - r.top) / view.zoom;
  return { gx, gy, x: Math.floor(gx / TILE), y: Math.floor(gy / TILE), sx: e.clientX, sy: e.clientY };
}

// Building, bulldozing and moving variants only happen while the park is closed.
function buildLocked() {
  if (!isOpen()) return false;
  hintOnce("The park is open! Building and moving variants unlock at 10 PM. You can also close early.");
  sfx("fail");
  return true;
}

// ================= Building actions =================
function canPlaceEnclosure(x, y, n = ENC_TYPES[encChoice.size].size) {
  for (let dy = 0; dy < n; dy++)
    for (let dx = 0; dx < n; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!inBounds(tx, ty) || !isOwned(tx, ty) || state.tiles[idx(tx, ty)] !== 0 || encAt(tx, ty) || objAt(tx, ty)) return false;
    }
  return true;
}
const canPlaceObject = (x, y) => inBounds(x, y) && isOwned(x, y) && !isPath(x, y) && !encAt(x, y) && !objAt(x, y);
const encOffset = n => Math.floor((n - 1) / 2);

function placePath(x, y) {
  if (!inBounds(x, y) || !isOwned(x, y) || encAt(x, y) || objAt(x, y) || buildLocked()) return;
  const cur = state.tiles[idx(x, y)];
  if (cur === pathChoice) return;
  const cost = PATH_TYPES[pathChoice].cost;
  if (!spend(cost)) return hintOnce(`${PATH_TYPES[pathChoice].label} paths cost ${cost} coins.`);
  state.tiles[idx(x, y)] = pathChoice;
  sfx("click");
}

function placeEnclosure(x, y) {
  if (buildLocked()) return;
  const n = ENC_TYPES[encChoice.size].size;
  const ex = x - encOffset(n), ey = y - encOffset(n);
  if (state.enclosures.length >= maxEnclosures()) return hintOnce(`Enclosure limit reached (${maxEnclosures()}). Level up your park for more slots.`);
  if (!canPlaceEnclosure(ex, ey)) return hintOnce(`This enclosure needs a clear ${n}x${n} patch of your own grass.`);
  const cost = enclosureCost();
  if (!spend(cost)) return hintOnce(`Enclosures cost ${fmt(cost)} coins.`);
  state.enclosures.push({ id: state.nextId++, x: ex, y: ey, s: n, theme: encChoice.theme, variants: [], lostUntil: 0 });
  rebuildGrids();
  sfx("build");
  gainParkXp(XP.enclosure);
  renderUI(true);
}

function placeObject(t, x, y) {
  if (!isUnlocked("obj:" + t) || buildLocked()) return;
  if (!canPlaceObject(x, y)) return hintOnce("That spot is taken. Pick an empty grass tile.");
  const cost = objectCost(t);
  if (!spend(cost)) return hintOnce(`${OBJECTS[t].name} costs ${fmt(cost)} coins.`);
  state.objects.push({ id: state.nextId++, t, x, y });
  rebuildGrids();
  sfx("build");
  gainParkXp(XP.object);
  if (OBJECTS[t].kind === "stand" && !touchesPath(x, y, 1, 1)) hintOnce("Tip: snack stands only sell when they touch a path.");
  renderUI(true);
}

function bulldoze(x, y) {
  if (!inBounds(x, y) || buildLocked()) return;
  const eid = encAt(x, y);
  if (eid) {
    const e = getEnc(eid);
    if (activeEvent && activeEvent.e === e) activeEvent = null;
    state.inventory.push(...e.variants);
    for (const i of e.variants) escapes.delete(i.id);
    state.enclosures = state.enclosures.filter(en => en.id !== eid);
    earn(Math.round(ENC_TYPES[SIZE_KEY[encSize(e)]].cost * THEMES[e.theme].costMult / 2), undefined, undefined, undefined, "Refunds");
    if (inspectedId === eid) inspectedId = 0;
    rebuildGrids();
    sfx("bulldoze");
    renderUI(true);
    return;
  }
  const oid = objAt(x, y);
  if (oid) {
    const o = getObj(oid);
    state.objects = state.objects.filter(ob => ob.id !== oid);
    earn(Math.floor(OBJECTS[o.t].cost / 2), undefined, undefined, undefined, "Refunds");
    rebuildGrids();
    sfx("bulldoze");
    renderUI(true);
    return;
  }
  if (isPath(x, y) && !(x === GATE.x && y === GATE.y)) {
    earn(Math.floor(PATH_TYPES[state.tiles[idx(x, y)]].cost / 2), undefined, undefined, undefined, "Refunds");
    state.tiles[idx(x, y)] = 0;
    const ti = trashIndexAt(x, y);
    if (ti >= 0) state.trash.splice(ti, 1);
    sfx("bulldoze");
  }
}

// ================= Variant actions =================
function placeVariant(x, y) {
  if (buildLocked()) return;
  const eid = encAt(x, y);
  if (!eid) return hintOnce("Click an enclosure to place the variant.");
  const e = getEnc(eid);
  if (e.variants.length >= capOf(e)) return hintOnce(`That enclosure is full (${capOf(e)} max).`);
  const i = state.inventory.findIndex(v => v.id === selectedUid);
  if (i < 0) return setTool("inspect");
  const ind = state.inventory.splice(i, 1)[0];
  e.variants.push(ind);
  sfx("place");
  gainParkXp(XP.place);
  inspectedId = eid;
  rebuildGrids();
  const next = state.inventory[Math.min(i, state.inventory.length - 1)];
  if (next) { selectedUid = next.id; renderUI(true); }
  else setTool("inspect");
}

function pickEggVariant() {
  if (Math.random() < EGG_UNCOMMON_CHANCE) return randItem(UNCOMMONS);
  const total = COMMONS.reduce((s, k) => s + VARIANTS[k].weight, 0);
  let roll = Math.random() * total;
  for (const k of COMMONS) { roll -= VARIANTS[k].weight; if (roll <= 0) return k; }
  return "verity";
}

function addNew(ind) {
  const isNew = !state.discovered[ind.k];
  state.discovered[ind.k] = true;
  if (isNew) gainParkXp(XP.discover(RARITY[VARIANTS[ind.k].rarity].tier));
  if (ind.shiny) state.stats.shinies++;
  state.inventory.push(ind);
  return isNew;
}

function hatchEgg(type = "regular") {
  if (fx || !eggUnlocked(type)) return;
  const free = freeEggsOf(type) > 0;
  if (!free && !spend(eggCostOf(type))) return;
  if (free) { if (type === "golden") state.freeGolden--; else state.freeEggs--; }
  else state.eggCounts[type] = (state.eggCounts[type] || 0) + 1;
  state.eggsHatched++;
  state.stats.hatched++;
  if (type === "golden") state.stats.golden++;
  if (type === "cursed") state.stats.cursed++;
  gainParkXp(XP.hatch * (type === "regular" ? 1 : 3));
  const roll = rollEgg(type);
  const ind = makeIndividual(roll.key, state, { shinyChance: roll.shiny });
  if (roll.grumpy && Math.random() < 0.5) ind.trait = "grumpy";
  const isNew = addNew(ind);
  selectedUid = ind.id;
  if (!isOpen()) tool = "place";
  playFx({ kind: "hatch", ind, isNew, eggType: type });
  renderUI(true);
}

function takeOut(uid) {
  const f = findInd(uid);
  if (!f || !f.e || buildLocked()) return;
  if (activeEvent && activeEvent.ind === f.ind) activeEvent = null;
  f.e.variants.splice(f.e.variants.indexOf(f.ind), 1);
  escapes.delete(uid);
  state.inventory.push(f.ind);
  rebuildGrids();
  renderUI(true);
}

function startPlacing(uid) {
  if (buildLocked()) return;
  selectedUid = uid;
  setTool("place");
  switchTab("park");
}

function releaseInd(uid) {
  const f = findInd(uid);
  if (!f || (f.e && buildLocked())) return;
  if (activeEvent && activeEvent.ind === f.ind) activeEvent = null;
  const list = f.e ? f.e.variants : state.inventory;
  list.splice(list.indexOf(f.ind), 1);
  escapes.delete(uid);
  earn(releaseValue(f.ind), undefined, undefined, undefined, "Sales");
  fuseSel = fuseSel.map(u => (u === uid ? 0 : u));
  rebuildGrids();
  sfx("pop");
  toast(`You released ${f.ind.name}. +${fmt(releaseValue(f.ind))} coins`, 3000, f.ind.k);
  renderUI(true);
}

function gainXp(ind, amount, c) {
  const before = levelOf(ind);
  ind.xp += amount;
  const after = levelOf(ind);
  if (after > before) {
    gainParkXp(XP.variantLevel);
    if (c) floaters.push({ x: c.x, y: c.y - 16, text: "LV " + after + "!", t: 0, color: "#7df9ff" });
    sfx("levelup");
  }
}

function petInd(uid) {
  const f = findInd(uid);
  if (!f) return;
  const now = performance.now();
  if ((petCooldown.get(uid) || 0) > now) return;
  petCooldown.set(uid, now + 4000);
  gainXp(f.ind, 10);
  f.ind.joy = Math.min(100, f.ind.joy + CARE.petJoy);
  earn(Math.max(1, baseValue(f.ind, f.e)), undefined, undefined, undefined, "Petting");
  state.stats.pets++;
  gainParkXp(XP.pet);
  sfx("pet");
  for (let i = 0; i < 6; i++) cardParts.push({ x: 50 + (Math.random() - 0.5) * 30, y: 45, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 25, life: 1.2 });
  renderCard();
}

async function renameInd(uid) {
  const f = findInd(uid);
  if (!f) return;
  const name = await ask({ title: "RENAME", text: `New name for ${f.ind.name}:`, ok: "Rename", input: f.ind.name });
  if (name === null) return;
  const clean = name.trim().slice(0, 16);
  if (!clean || clean === f.ind.name) return;
  f.ind.name = clean;
  state.stats.renamed++;
  renderCard();
  renderUI(true);
}

// ================= Fusion =================
function fusionPreview() {
  const fa = findInd(fuseSel[0]), fb = findInd(fuseSel[1]);
  if (!fa || !fb || fa.e || fb.e) return null;
  const a = fa.ind, b = fb.ind;
  const rk = recipeKey(a.k, b.k);
  const out = RECIPES[rk] || null;
  const tierA = RARITY[VARIANTS[a.k].rarity].tier, tierB = RARITY[VARIANTS[b.k].rarity].tier;
  const rarity = out ? VARIANTS[out].rarity : RARITY_ORDER[Math.min(4, Math.max(tierA, tierB))];
  const r = RARITY[rarity];
  const cost = Math.max(30, r.fuseCost);
  const chance = Math.min(0.98, (out ? r.chance : 0.5) + state.labLevel * 0.05);
  let blocked = null;
  if (state.level < fuseLevelFor(rarity)) blocked = `${RARITY[rarity].label} fusions unlock at park level ${fuseLevelFor(rarity)}.`;
  else if (out === "scarcity" && allIndividuals().some(i => i.k === "scarcity")) blocked = "Only one Scarcity can exist.";
  return { a, b, rk, out, known: !!state.recipesKnown[rk], rarity, cost, chance, blocked };
}

function doFuse() {
  const p = fusionPreview();
  if (!p || p.blocked || fx) return;
  if (!spend(p.cost)) return;
  state.inventory = state.inventory.filter(i => i !== p.a && i !== p.b);
  const success = Math.random() < p.chance;
  let key = "falsity";
  if (success) {
    if (p.out) {
      key = p.out;
      state.recipesKnown[p.rk] = true;
    } else {
      const owned = allIndividuals().some(i => i.k === "scarcity");
      const pool = VARIANT_KEYS.filter(k => VARIANTS[k].rarity === p.rarity && !(k === "scarcity" && owned));
      key = randItem(pool);
    }
  }
  const ind = makeIndividual(key, state, { shinyChance: p.a.shiny || p.b.shiny ? 0.1 : SHINY_CHANCE });
  const isNew = addNew(ind);
  state.stats.fusions++;
  gainParkXp(success ? XP.fuseSuccess(RARITY[VARIANTS[key].rarity].tier) : XP.fuseFail);
  fuseSel = [0, 0];
  playFx({ kind: "fuse", ind, isNew, success, a: p.a, b: p.b });
  renderUI(true);
}

function upgradeLab() {
  if (!isUnlocked("labUpgrade") || buildLocked()) return;
  if (state.labLevel >= LAB_MAX_LEVEL || !spend(labUpgradeCost())) return;
  state.labLevel++;
  sfx("levelup");
  gainParkXp(XP.labUpgrade);
  renderUI(true);
}

// ================= Visitors =================
// Guests walk from their car to the gate (world.js), then enter here and pay for a ticket.
function admitVisitor(w) {
  const look = w ? w.look : randomLook(rollVisitorType());
  const type = look.type;
  visitors.push({
    type, look, frames: w ? w.frames : personFrames(look), carId: w ? w.carId : 0,
    mood: 70, pensSeen: 0, bubble: null,
    tx: GATE.x, ty: GATE.y, px: GATE.x - 1, py: GATE.y, nx: GATE.x, ny: GATE.y,
    prog: 1, speed: (type === "kid" ? 1.4 : 1.1) + Math.random() * 0.6,
    steps: 25 + Math.floor(Math.random() * 40),
    seen: new Set(), alpha: 0.4, leaving: false,
    off: Math.floor(Math.random() * 5) - 2,
    phase: Math.random() * 6,
  });
  const ticket = starRating() * (activeEvent && activeEvent.type === "parade" ? 3 : 1) * globalMult();
  earn(ticket, GATE.x * TILE + 8, GATE.y * TILE, undefined, "Tickets");
  state.visitorsServed++;
  if (state.day) state.day.visitors++;
  gainParkXp(XP.visitor);
}
const spawnVisitor = () => admitVisitor(null);

function arriveAt(v) {
  for (const [dx, dy] of DIRS) {
    const nx = v.tx + dx, ny = v.ty + dy;
    const eid = encAt(nx, ny);
    if (eid && !v.seen.has(eid)) {
      v.seen.add(eid);
      const e = getEnc(eid);
      if (!isLost(e)) {
        let pay = 0;
        for (const ind of e.variants) if (!(activeEvent && activeEvent.ind === ind) && !escapes.has(ind.id)) pay += payFor(ind, e);
        if (pay > 0) {
          earn(pay, v.tx * TILE + 8, v.ty * TILE - 4, undefined, "Exhibits");
          sfx("coin");
          v.pensSeen++;
          v.mood += 12 + (e.variants.some(i => likesTheme(i, e)) ? 6 : 0);
          if (Math.random() < 0.12) v.bubble = { icon: Math.random() < 0.5 ? "heart" : "coin", t: 1.2 };
          if (v.type === "influencer") influencerPost(v, e);
        }
      }
    }
    const oid = objAt(nx, ny);
    if (oid && !v.seen.has("o" + oid)) {
      v.seen.add("o" + oid);
      const def = OBJECTS[getObj(oid).t];
      const buyMult = (hasElectricity ? 1.5 : 1) * (VISITOR_TYPES[v.type].buyMult || 1);
      if (def.kind === "stand" && Math.random() < STAND_BUY_CHANCE * buyMult) {
        earn(def.price * globalMult(), nx * TILE + 8, ny * TILE - 6, "#ff9ad5", "Snacks");
        sfx("coin");
        v.mood += 8;
        if (Math.random() < 0.4) v.bubble = { icon: "food", t: 1.2 };
        if (Math.random() < 0.35) dropTrash(v.tx, v.ty);
      }
    }
  }
}

function updateVisitor(v, dt) {
  v.phase += dt * 10;
  if (v.bubble) { v.bubble.t -= dt; if (v.bubble.t <= 0) v.bubble = null; }
  if (v.leaving) { v.alpha -= dt * 2; return; }
  v.alpha = Math.min(1, v.alpha + dt * 3);
  if (!isPath(v.tx, v.ty)) { leaveVisitor(v); return; }
  if (v.prog < 1) {
    v.prog = Math.min(1, v.prog + dt * v.speed * PATH_TYPES[state.tiles[idx(v.tx, v.ty)]].speed);
    if (v.prog >= 1) { v.tx = v.nx; v.ty = v.ny; arriveAt(v); visitorMoodStep(v); }
    return;
  }
  if (--v.steps <= 0) { leaveVisitor(v); return; }
  const opts = DIRS.map(([dx, dy]) => ({ x: v.tx + dx, y: v.ty + dy })).filter(p => isPath(p.x, p.y));
  if (!opts.length) { leaveVisitor(v); return; }
  const forward = opts.filter(p => !(p.x === v.px && p.y === v.py));
  const choice = randItem(forward.length ? forward : opts);
  v.px = v.tx; v.py = v.ty;
  v.nx = choice.x; v.ny = choice.y;
  v.prog = 0;
}

// ================= Meme events =================
function startEvent(forceType, forceKey) {
  const placed = placedList().filter(p => !isLost(p.e) && !escapes.has(p.ind.id));
  if (!placed.length) return false;
  const types = ["viral", "tug"];
  if (placed.some(p => p.ind.k === "verity")) types.push("song");
  if (new Set(placed.map(p => p.ind.k)).size >= 4) types.push("parade");
  const type = forceType || randItem(types);
  const p = (forceKey && placed.find(q => q.ind.k === forceKey)) || randItem(placed);
  const name = VARIANTS[p.ind.k].name;
  if (type === "viral") {
    activeEvent = { type, key: p.ind.k, t: 0, dur: 30, icon: p.ind.k, text: `${name} is going viral! 17M views. Every ${name} earns 3x.` };
    state.stats.virals++;
    for (let i = 0; i < 3; i++) spawnCar(1 + Math.floor(Math.random() * 3));
  } else if (type === "song") {
    activeEvent = { type, t: 0, dur: 20, icon: "verity", text: "A Verity song is trending! Every Verity earns 5x." };
  } else if (type === "parade") {
    activeEvent = { type, t: 0, dur: 30, icon: "celebrity", text: "Variant Parade! Tickets cost 3x and twice as many visitors arrive." };
  } else {
    activeEvent = { type, ind: p.ind, e: p.e, t: 0, dur: 15, clicks: 0, need: 12, icon: p.ind.k,
      text: `He belongs to the Backrooms! Click Steve and Pirate Clark to save ${p.ind.name}!` };
  }
  sfx("event");
  toast(activeEvent.text, 4500, activeEvent.icon);
  return true;
}

function endEvent(win) {
  const ev = activeEvent;
  activeEvent = null;
  eventTimer = 80 + Math.random() * 70;
  if (!ev || ev.type !== "tug") return;
  const e = ev.e;
  if (win) {
    const reward = Math.max(50, Math.round(state.incomeRate * 30));
    earn(reward, e.x * TILE + 24, e.y * TILE - 6, undefined, "Events");
    state.stats.tugWins++;
    gainParkXp(XP.tugWin);
    sfx("fanfare", 2);
    toast(`${ev.ind.name} stays! +${fmt(reward)} coins`, 4000, ev.ind.k);
  } else {
    e.lostUntil = Date.now() + 60000;
    sfx("fail");
    toast(`${ev.ind.name} got dragged into the Backrooms... Enclosure #${encNumber(e)} is closed for 60s.`, 5000, "backrooms");
  }
  renderUI(true);
}

function tugActors() {
  const e = activeEvent.e;
  return [
    { spr: STEVE_SPR, x: e.x * TILE - 11, y: e.y * TILE + 18 },
    { spr: PIRATE_SPR, x: (e.x + encSize(e)) * TILE + 3, y: e.y * TILE + 18 },
  ];
}

function tugHit(p) {
  const e = activeEvent.e;
  const inPen = p.gx >= e.x * TILE && p.gx < (e.x + encSize(e)) * TILE && p.gy >= e.y * TILE && p.gy < (e.y + encSize(e)) * TILE;
  return inPen || tugActors().some(a => p.gx >= a.x - 5 && p.gx <= a.x + 13 && p.gy >= a.y - 5 && p.gy <= a.y + 19);
}

function tugClick(p) {
  const ev = activeEvent;
  ev.clicks++;
  sfx("tug");
  for (let i = 0; i < 5; i++) particles.push({ x: p.gx, y: p.gy, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 50, life: 0.5, col: randItem(["#fff", "#ffd23f", "#ff5c7a"]) });
  floaters.push({ x: p.gx, y: p.gy - 4, text: randItem(["POW", "BONK", "NO!", "MINE"]), t: 0.4, color: "#fff" });
  if (ev.clicks >= ev.need) endEvent(true);
}

function updateEvent(dt) {
  if (!activeEvent && !isOpen()) return;
  if (!activeEvent) {
    if (!isUnlocked("events")) return;
    eventTimer -= dt;
    if (eventTimer <= 0) { if (!startEvent()) eventTimer = 30; }
    return;
  }
  const ev = activeEvent;
  if (ev.type === "tug" && (!state.enclosures.includes(ev.e) || !ev.e.variants.includes(ev.ind))) {
    activeEvent = null;
    eventTimer = 60;
    return;
  }
  ev.t += dt;
  if (ev.t >= ev.dur) endEvent(false);
}

// ================= Goals & achievements =================
function checkProgress() {
  while (state.goal < GOALS.length) {
    const g = GOALS[state.goal];
    const [cur, max] = g.prog();
    if (cur < max) break;
    state.goal++;
    earn(g.reward, undefined, undefined, undefined, "Goals");
    gainParkXp(XP.goal(state.goal - 1));
    sfx("achievement");
    toast(`Goal complete: ${g.text}! +${fmt(g.reward)} coins`, 4500, "lovity");
  }
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] || !a.test()) continue;
    state.achievements[a.id] = Date.now();
    changed = true;
    gainParkXp(XP.achievement);
    sfx("achievement");
    toast(`Achievement unlocked: ${a.name}! (+2% income)`, 4500, "verity");
  }
  if (changed) renderAchievements();
}

// ================= Update =================
function secondTick() {
  tickCount++;
  earningsWindow.push(secondEarnings);
  secondEarnings = 0;
  if (earningsWindow.length > 60) earningsWindow.shift();
  state.incomeRate = earningsWindow.reduce((a, b) => a + b, 0) / earningsWindow.length;

  const placed = placedList();
  const activeVisitors = visitors.filter(v => !v.leaving).length;
  for (const { ind, e } of placed) {
    if (isLost(e) || !isOpen()) continue;
    const c = critterPos.get(ind.id);
    gainXp(ind, xpRate(ind), c);
    if (ind.k === "prosperity" && tickCount % 10 === 0) earn(baseValue(ind, e), c ? c.x : e.x * TILE + 24, c ? c.y - 14 : e.y * TILE, "#ffe066", "Abilities");
    if (ind.k === "infinity" && activeVisitors) earn(activeVisitors * globalMult(), undefined, undefined, undefined, "Abilities");
  }
  const live = new Set(placed.map(p => p.ind.id));
  for (const id of critterPos.keys()) if (!live.has(id)) critterPos.delete(id);
  hasElectricity = placed.some(p => p.ind.k === "electricity");
  systemsSecond();
  checkProgress();
  if (activeTab === "park") renderShopState();
}

function update(dt) {
  const appeal = parkAppeal();
  const parade = activeEvent && activeEvent.type === "parade" ? 2 : 1;
  const interval = Math.max(0.3, 5 / (1 + appeal * 0.25)) / parade * spawnFactor();
  tickWorld(dt);
  updateStaff(dt);
  updateEscapes(dt);
  spawnTimer += dt;
  if (spawnTimer >= interval * 2.2) {
    spawnTimer = 0;
    if (isOpen() && guestsOnSite() < maxGuests()) spawnCar(1 + Math.floor(Math.random() * (starRating() >= 4 ? 4 : 3)));
  }
  updateCars(dt);
  updateAmbient(dt);
  for (const v of visitors) updateVisitor(v, dt);
  visitors = visitors.filter(v => !(v.leaving && v.alpha <= 0));

  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < 1.2);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);

  updateEvent(dt);

  secondTimer += dt;
  if (secondTimer >= 1) { secondTimer -= 1; secondTick(); }
}

// ================= Render: world =================
function tileHash(x, y) { return Math.floor(hash2(x, y, 1) * 1000); }

const EDGE_TUFT = "#4a9a3f";
function drawPathTile(x, y) {
  const px = x * TILE, py = y * TILE;
  const type = state.tiles[idx(x, y)];
  blit(ctx, pathTiles[type], px, py);
  const gate = x === GATE.x && y === GATE.y;
  const open = (nx, ny) => isPath(nx, ny) || (gate && nx === GATE.x - 1 && ny === GATE.y);
  const edge = PATH_EDGE[type];
  ctx.fillStyle = edge;
  if (!open(x, y - 1)) ctx.fillRect(px, py, TILE, 1);
  if (!open(x, y + 1)) ctx.fillRect(px, py + TILE - 1, TILE, 1);
  if (!open(x - 1, y)) ctx.fillRect(px, py, 1, TILE);
  if (!open(x + 1, y)) ctx.fillRect(px + TILE - 1, py, 1, TILE);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  if (!open(x, y + 1)) ctx.fillRect(px, py + TILE - 1.5, TILE, 0.5);
  ctx.fillStyle = EDGE_TUFT;
  const h = tileHash(x, y);
  if (!open(x, y - 1)) { ctx.fillRect(px + (h % 12) + 1, py, 1.5, 0.5); ctx.fillRect(px + ((h >> 4) % 12) + 2, py, 0.5, 1); }
  if (!open(x, y + 1)) ctx.fillRect(px + ((h >> 2) % 12) + 1, py + TILE - 0.5, 1.5, 0.5);
  if (!open(x - 1, y)) ctx.fillRect(px, py + ((h >> 3) % 12) + 1, 0.5, 1.5);
}

// drifting cloud shadows spread over the whole world
const clouds = Array.from({ length: 14 }, (_, i) => ({ x: hash2(i, 1, 9) * WORLD_W, y: hash2(i, 2, 9) * WORLD_H, speed: 3 + hash2(i, 3, 9) * 4 }));

function drawGate(time) {
  const x = GATE.x * TILE, y = GATE.y * TILE;
  blit(ctx, GATE_SPR, x - 6, y - 18);
  // waving pennants on the pillars
  for (const [px, col] of [[x - 2, "#ff5c7a"], [x + 18, "#5fb4ff"]]) {
    ctx.fillStyle = "#2a2a2a"; ctx.fillRect(px, y - 24, 0.5, 6);
    ctx.fillStyle = col;
    for (let i = 0; i < 6; i++) {
      const wave = Math.sin(time * 6 - i * 0.8) * 0.8;
      const hgt = 3 - i * 0.45;
      ctx.fillRect(px + 0.5 + i * 0.75, y - 24 + wave * (i / 6) + (3 - hgt) / 2, 0.75, Math.max(0.5, hgt));
    }
  }
}

function drawEnclosure(e, time) {
  const px = e.x * TILE, py = e.y * TILE, W = encSize(e) * TILE;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(px + 2, py + 3, W, W);
  blit(ctx, makeEncGround(encSize(e), e.theme), px, py);
  if (e.theme === "pool" && state.settings.effects) {
    ctx.fillStyle = "rgba(220,240,255,0.55)";
    for (let i = 0; i < encSize(e) * 3; i++) {
      const t = (time * 0.25 + hash2(e.id, i, 4)) % 1;
      const lx = px + 11 + hash2(e.id, i, 5) * (W - 26) + Math.sin(time * 2 + i) * 1.5;
      const ly = py + 12 + t * (W - 26);
      ctx.fillRect(lx, ly, 2 + hash2(e.id, i, 6) * 2, 0.5);
    }
  }
  const cap = capOf(e), sw = cap * 3 + 4;
  const sx = Math.round(px + W / 2 - sw / 2), sy = py - 5;
  ctx.fillStyle = "#000"; ctx.fillRect(sx, sy, sw, 7);
  ctx.fillStyle = "#c48a4a"; ctx.fillRect(sx + 1, sy + 1, sw - 2, 5);
  ctx.fillStyle = "#e0a868"; ctx.fillRect(sx + 1, sy + 1, sw - 2, 0.5);
  for (let i = 0; i < cap; i++) {
    const ind = e.variants[i];
    ctx.fillStyle = ind ? VARIANTS[ind.k].color : "#7a4a22";
    ctx.fillRect(sx + 2 + i * 3, sy + 2, 2, 3);
    if (ind) { ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(sx + 2 + i * 3, sy + 2, 0.5, 0.5); }
  }
  if (e.id === inspectedId) {
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 0.5, py - 0.5, W + 1, W + 1);
  }
}

function drawLostOverlay(e, time) {
  const px = e.x * TILE, py = e.y * TILE, W = encSize(e) * TILE;
  ctx.fillStyle = "rgba(201,180,88,0.55)";
  ctx.fillRect(px + 3, py + 3, W - 6, W - 6);
  ctx.fillStyle = "rgba(90,70,20,0.35)";
  for (let x = px + 5; x < px + W - 3; x += 4) ctx.fillRect(x, py + 3, 1, W - 6);
  ctx.font = "16px 'VT323', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#3a2a00";
  ctx.fillText("?", px + W / 2, py + W / 2 + 4 + Math.sin(time * 3) * 2);
  ctx.font = "7px 'VT323', monospace";
  ctx.fillText(Math.ceil((e.lostUntil - Date.now()) / 1000) + "s", px + W / 2, py + W - 6);
}

function critterState(e, ind) {
  const D = bodySize(ind.k, ind);
  const minX = e.x * TILE + 4 + D / 2, maxX = (e.x + encSize(e)) * TILE - 4 - D / 2;
  const minY = e.y * TILE + 4 + D, maxY = (e.y + encSize(e)) * TILE - 4;
  let c = critterPos.get(ind.id);
  if (!c || c.e !== e.id) {
    c = { e: e.id, x: minX + Math.random() * (maxX - minX), y: minY + Math.random() * (maxY - minY), vx: 0, vy: 0, phase: Math.random() * 6, timer: 0 };
    critterPos.set(ind.id, c);
  }
  Object.assign(c, { minX, maxX, minY, maxY, D });
  return c;
}

function drawIndividual(g, ind, c, dt, time, scale = 1) {
  const def = VARIANTS[ind.k];
  const blinking = ((time * 1000 + ind.seed * 37) % 3800) < 140;
  const spr = spriteFor(ind, blinking);
  const D = bodySize(ind.k, ind);
  const SW = uW(spr), SH = uH(spr);
  const moving = c.vx || c.vy;
  let hop = moving ? Math.abs(Math.sin(time * 8 + c.phase)) * 2 : Math.abs(Math.sin(time * 2 + c.phase)) * 0.6;
  let sx = 1, sy = 1, jx = 0;
  if (!moving) { const breath = Math.sin(time * 2.2 + c.phase) * 0.03; sx = 1 + breath; sy = 1 - breath; }
  if (moving) { const sq = Math.abs(Math.sin(time * 8 + c.phase)); sy = 0.94 + sq * 0.08; sx = 1.06 - sq * 0.06; }
  if (def.move === "float") { hop = 4 + Math.sin(time * 2 + c.phase) * 1.5; sx = sy = 1; }
  if (def.move === "squash") { const s = Math.sin(time * 6 + c.phase) * 0.15; sx = 1 + s; sy = 1 - s; }
  if (def.move === "jitter") jx = Math.random() < 0.3 ? (Math.random() < 0.5 ? -0.5 : 0.5) : 0;
  if (def.move === "glitch" && Math.random() < 0.08) jx = Math.random() < 0.5 ? -2 : 2;
  const w = SW * sx * scale, h = SH * sy * scale;
  const baseY = c.y - (SPR_PAD_T + D) * scale;
  const dx = Math.round((c.x - w / 2 + jx * scale) * 2) / 2, dy = Math.round((c.y - (SH - SPR_PAD_B) * sy * scale - hop * scale) * 2) / 2;
  g.fillStyle = "rgba(0,0,0,0.25)";
  const shW = Math.max(2, (D - (def.move === "float" ? 4 : 2)) * scale) * (1 - hop * 0.04);
  g.beginPath(); g.ellipse(c.x, c.y - scale * 0.5, shW / 2, scale, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(spr, dx, dy, w, h);
  if (def.move === "glitch" && Math.random() < 0.06) {
    g.globalAlpha = 0.5;
    g.drawImage(spr, 0, 4 * RES, spr.width, 3 * RES, dx + 3 * scale, dy + 4 * scale, SW * scale, 3 * scale);
    g.globalAlpha = 1;
  }
  if (ind.shiny) {
    const f = Math.floor(time * 3 + c.phase) % 4;
    if (f < 2) {
      const px = dx + ((ind.seed >> (f * 3)) % Math.max(1, D)) * scale + 2 * scale, py = dy + (SPR_PAD_T - 2 + ((ind.seed >> 5) % 6)) * scale;
      g.fillStyle = "#fff";
      g.fillRect(px, py - scale, scale * 0.5, 2 * scale);
      g.fillRect(px - scale * 0.75, py - scale * 0.25, 2 * scale, scale * 0.5);
    }
  }
  if (levelOf(ind) >= 10) blit(g, CROWN_SPR, Math.round((c.x - 2.5 * scale) * 2) / 2, dy + (SPR_PAD_T - 4) * sy * scale, 5 * scale, 3.5 * scale);
  c.hx = c.x - D * scale / 2; c.hy = baseY - hop * scale; c.hw = D * scale; c.hh = D * scale;
}

function drawCritters(e, dt, time) {
  for (const ind of e.variants) {
    if ((activeEvent && activeEvent.ind === ind) || escapes.has(ind.id)) continue;
    const c = critterState(e, ind);
    const def = VARIANTS[ind.k];
    const speed = 16 * TRAITS[ind.trait].move * (def.move === "zoom" ? 2.5 : 1) * (isOpen() ? 1 : 0.35);
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer = 1 + Math.random() * 2;
      const moving = Math.random() < Math.min(0.9, 0.55 * TRAITS[ind.trait].move);
      c.vx = moving ? (Math.random() - 0.5) * speed : 0;
      c.vy = moving ? (Math.random() - 0.5) * speed : 0;
    }
    c.x = Math.max(c.minX, Math.min(c.maxX, c.x + c.vx * dt));
    c.y = Math.max(c.minY, Math.min(c.maxY, c.y + c.vy * dt));
    drawIndividual(ctx, ind, c, dt, time);
    if (c.bubble) { c.bubble.t -= dt; if (c.bubble.t <= 0) c.bubble = null; }
    let icon = c.bubble ? c.bubble.icon : careActive() && ind.food < 30 && Math.floor(time / 2 + c.phase) % 3 === 0 ? "food" : null;
    if (!icon && !isOpen() && darkness() > 0.3 && Math.floor(time / 3 + c.phase) % 4 === 0) icon = "sleep";
    if (icon) drawBubble(icon, c.x, c.hy - 1);
  }
}

function drawObject(o, time) {
  const px = o.x * TILE, py = o.y * TILE;
  if (o.t === "lamp") {
    ctx.fillStyle = "rgba(255,233,138,0.12)";
    ctx.beginPath(); ctx.arc(px + 8, py - 1, 10 + Math.sin(time * 3) * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  blit(ctx, OBJ_SPRITES[o.t], px, py - 4);
  if (OBJECTS[o.t].kind === "stand" && state.settings.effects) {
    // fluttering awning edge
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    const f = Math.floor(time * 4 + o.id) % 4;
    ctx.fillRect(px + 1 + f * 4, py - 4 + 5.5, 2, 0.5);
  }
  if (o.t === "fountain") {
    ctx.fillStyle = "#bfe6ff";
    for (let i = 0; i < 8; i++) {
      const t = (time * 1.5 + i / 8) % 1;
      const side = i % 2 ? 1 : -1;
      ctx.fillRect(px + 8 + side * t * 5, py - 3 + t * 9 - Math.sin(t * Math.PI) * 4, 0.75, 0.75);
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(px + 4 + ((time * 6) % 8), py + 9.5, 1.5, 0.5);
  }
}

function drawTug(time) {
  const ev = activeEvent;
  const e = ev.e;
  const cx = e.x * TILE + encSize(e) * TILE / 2, cy = e.y * TILE + encSize(e) * TILE * 0.7;
  const pull = Math.round(Math.sin(time * 7) * 4);
  const actors = tugActors();
  ctx.strokeStyle = "#e0c080";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(actors[0].x + 8, actors[0].y + 8); ctx.lineTo(cx - 3 + pull, cy - 5);
  ctx.moveTo(actors[1].x, actors[1].y + 8); ctx.lineTo(cx + 3 + pull, cy - 5);
  ctx.stroke();
  const c = { x: cx + pull, y: cy, vx: 1, vy: 0, phase: 0 };
  drawIndividual(ctx, ev.ind, c, 0, time);
  actors.forEach((a, i) => {
    const lean = Math.round(Math.sin(time * 7 + (i ? Math.PI : 0)));
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(a.x, a.y + 13, 8, 2);
    ctx.drawImage(a.spr, a.x + lean, a.y);
  });
  const bw = encSize(e) * TILE;
  ctx.fillStyle = "#000"; ctx.fillRect(e.x * TILE, e.y * TILE - 12, bw, 5);
  ctx.fillStyle = "#ff5c7a"; ctx.fillRect(e.x * TILE + 1, e.y * TILE - 11, Math.round((bw - 2) * (1 - ev.t / ev.dur)), 1);
  ctx.fillStyle = "#6ee07a"; ctx.fillRect(e.x * TILE + 1, e.y * TILE - 10, Math.round((bw - 2) * ev.clicks / ev.need), 2);
}

function drawHover() {
  if (!hover || !inBounds(hover.x, hover.y)) return;
  let x = hover.x, y = hover.y, w = 1, h = 1, ok = true;
  const objType = tool.startsWith("obj:") ? tool.slice(4) : null;
  if (!isOwned(x, y)) {
    const k = plotOf(x, y);
    if (!k) return;
    const pi = PLOT_KEYS.indexOf(k);
    ctx.fillStyle = plotForSale(k) ? "rgba(255,210,63,0.16)" : "rgba(0,0,0,0.18)";
    const vx0 = Math.max(0, Math.floor(view.x / TILE)), vy0 = Math.max(0, Math.floor(view.y / TILE));
    const vx1 = Math.min(COLS - 1, Math.ceil((view.x + viewW()) / TILE)), vy1 = Math.min(ROWS - 1, Math.ceil((view.y + viewH()) / TILE));
    for (let ty = vy0; ty <= vy1; ty++) for (let tx = vx0; tx <= vx1; tx++) if (PLOT_MAP[ty * COLS + tx] === pi) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    return;
  }
  if (tool === "enclosure") {
    const n = ENC_TYPES[encChoice.size].size;
    x -= encOffset(n); y -= encOffset(n); w = h = n;
    ok = canPlaceEnclosure(x, y) && state.money >= enclosureCost() && state.enclosures.length < maxEnclosures() && !isOpen();
    ctx.globalAlpha = 0.55; blit(ctx, makeEncGround(n, encChoice.theme), x * TILE, y * TILE); ctx.globalAlpha = 1;
  } else if (objType) {
    ok = canPlaceObject(x, y) && state.money >= objectCost(objType) && !isOpen();
    ctx.globalAlpha = 0.6; blit(ctx, OBJ_SPRITES[objType], x * TILE, y * TILE - 4); ctx.globalAlpha = 1;
  } else if (tool === "path") {
    ok = state.tiles[idx(x, y)] !== pathChoice && !encAt(x, y) && !objAt(x, y) && state.money >= PATH_TYPES[pathChoice].cost && !isOpen();
    if (ok) { ctx.globalAlpha = 0.6; blit(ctx, pathTiles[pathChoice], x * TILE, y * TILE); ctx.globalAlpha = 1; }
  } else if (tool === "bulldoze") {
    const id = encAt(x, y);
    if (id) { const e = getEnc(id); x = e.x; y = e.y; w = h = encSize(e); }
    ok = (!!id || !!objAt(x, y) || (isPath(x, y) && !(x === GATE.x && y === GATE.y))) && !isOpen();
  } else if (tool === "place" || tool === "inspect") {
    const id = encAt(x, y);
    if (!id) return;
    const e = getEnc(id);
    x = e.x; y = e.y; w = h = encSize(e);
    ok = tool === "inspect" || (e.variants.length < capOf(e) && !isOpen());
  }
  ctx.fillStyle = ok ? "rgba(255,255,255,0.18)" : "rgba(255,60,90,0.35)";
  ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
  ctx.strokeStyle = ok ? "#ffd23f" : "#ff3c5a";
  ctx.lineWidth = 1;
  ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, w * TILE - 1, h * TILE - 1);
}

function drawVisitor(v) {
  const fx_ = v.tx + (v.nx - v.tx) * v.prog;
  const fy_ = v.ty + (v.ny - v.ty) * v.prog;
  const walking = v.prog < 1 && !v.leaving;
  const frame = walking ? (Math.floor(v.phase) % 2 ? 1 : 2) : 0;
  const vx = fx_ * TILE + 4.5 + v.off, vy = fy_ * TILE + 3 + v.off * 0.5;
  ctx.globalAlpha = Math.max(0, v.alpha);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(vx + 3.5, vy + 11.5, 3, 1, 0, 0, Math.PI * 2); ctx.fill();
  if (v.look.balloon) {
    const bx = vx + 6.5 + Math.sin(v.phase * 0.3) * 0.6, by = vy - 6;
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(vx + 6.5, by + 3, 0.5, 9);
    ctx.fillStyle = "#000"; ctx.fillRect(bx - 2, by - 2.5, 4, 5);
    ctx.fillStyle = v.look.balloon; ctx.fillRect(bx - 1.5, by - 2, 3, 4);
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(bx - 1, by - 1.5, 0.5, 1);
  }
  blit(ctx, v.frames[frame], Math.round(vx * 2) / 2, Math.round(vy * 2) / 2);
  if (v.bubble) drawBubble(v.bubble.icon, vx + 3.5, vy - 1);
  ctx.globalAlpha = 1;
}

function render(dt, time) {
  const k = view.zoom * view.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1c3a1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, -Math.round(view.x * k), -Math.round(view.y * k));
  if (terrainDirty) buildTerrain();
  if (treesDirty) buildTrees();

  const x0 = view.x, y0 = view.y, x1 = view.x + viewW(), y1 = view.y + viewH();
  // terrain: copy only the visible part of the big pre-rendered layer
  const sx = Math.max(0, Math.floor(x0)), sy = Math.max(0, Math.floor(y0));
  const ex = Math.min(WORLD_W, Math.ceil(x1) + 1), ey = Math.min(WORLD_H, Math.ceil(y1) + 1);
  if (ex > sx && ey > sy) ctx.drawImage(terrainLayer, sx * RES, sy * RES, (ex - sx) * RES, (ey - sy) * RES, sx, sy, ex - sx, ey - sy);

  const tx0 = Math.max(0, Math.floor(x0 / TILE) - 1), ty0 = Math.max(0, Math.floor(y0 / TILE) - 1);
  const tx1 = Math.min(COLS - 1, Math.ceil(x1 / TILE) + 1), ty1 = Math.min(ROWS - 1, Math.ceil(y1 / TILE) + 2);
  for (let y = ty0; y <= ty1; y++) for (let x = Math.max(tx0, OX); x <= tx1; x++) if (isPath(x, y)) drawPathTile(x, y);

  drawTrash();
  drawTrees(time, x0, y0, x1, y1);
  for (const k2 of PLOT_KEYS) if (plotForSale(k2)) drawSaleSign(k2, time);
  const visibleEnc = state.enclosures.filter(e => (e.x + encSize(e)) * TILE >= x0 - 8 && e.x * TILE <= x1 + 8 && (e.y + encSize(e)) * TILE >= y0 - 8 && e.y * TILE <= y1 + 16);
  for (const e of visibleEnc) drawEnclosure(e, time);
  for (const e of visibleEnc) {
    if (isLost(e)) drawLostOverlay(e, time);
    else drawCritters(e, dt, time);
  }
  for (const o of state.objects.slice().sort((a, b) => a.y - b.y)) if (o.x * TILE >= x0 - 20 && o.x * TILE <= x1 + 4 && o.y * TILE >= y0 - 8 && o.y * TILE <= y1 + 24) drawObject(o, time);
  drawCars(x0, y0, x1, y1);
  for (const w of staffWalkers) drawWalkerSprite(w);
  drawEscapes(time);

  const sorted = visitors.slice().sort((a, b) => (a.ty + (a.ny - a.ty) * a.prog) - (b.ty + (b.ny - b.ty) * b.prog));
  for (const v of sorted) drawVisitor(v);

  drawGate(time);
  if (activeEvent && activeEvent.type === "tug") drawTug(time);

  if (state.settings.effects) {
    ctx.globalAlpha = 0.08;
    for (const c of clouds) {
      const cx = ((c.x + time * c.speed) % (WORLD_W + 140)) - 70;
      if (cx > x1 || cx + 64 < x0 || c.y > y1 || c.y + 28 < y0) continue;
      ctx.drawImage(cloudShadow, Math.round(cx), Math.round(c.y));
    }
    ctx.globalAlpha = 1;
  }
  drawSky(time);
  drawAmbient(time);

  drawHover();

  for (const p of particles) { ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 1, 1); }

  ctx.font = "8px 'VT323', monospace";
  ctx.textAlign = "center";
  for (const f of floaters) {
    const y = Math.round(f.y - f.t * 12);
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
    ctx.fillStyle = "#000";
    ctx.fillText(f.text, f.x + 0.5, y + 0.5);
    ctx.fillStyle = f.color || "#ffd23f";
    ctx.fillText(f.text, f.x, y);
    ctx.globalAlpha = 1;
  }
}

function drawSaleSign(k, time) {
  const [tx, ty] = PLOTS[k].sign;
  const x = tx * TILE + 4, y = ty * TILE - 2 + Math.sin(time * 2 + tx) * 0.5;
  ctx.fillStyle = "#2a1a0c"; ctx.fillRect(x + 7, y + 8, 1.5, 9);
  ctx.fillStyle = "#000"; ctx.fillRect(x - 6, y, 28, 10);
  ctx.fillStyle = "#ffd23f"; ctx.fillRect(x - 5.5, y + 0.5, 27, 9);
  ctx.fillStyle = "#fff09a"; ctx.fillRect(x - 5.5, y + 0.5, 27, 0.5);
  ctx.fillStyle = "#2b1d00"; ctx.font = "7px 'VT323', monospace"; ctx.textAlign = "center";
  ctx.fillText("FOR SALE", x + 8, y + 7, 25);
}

// ================= Hatch / fusion animation =================
const fxCanvas = document.getElementById("fx-canvas");
const fxCtx = fxCanvas.getContext("2d");
let fx = null;

const CRACKS = [
  [[13, 8], [11, 11], [14, 13], [12, 16]],
  [[5, 18], [8, 17], [9, 20], [12, 19]],
  [[20, 14], [18, 17], [21, 19], [19, 22]],
];

function playFx(opts) {
  fx = Object.assign({ t: 0, revealed: false, parts: [], nextShake: 0.1, cracks: 0, revealT: opts.kind === "hatch" ? 1.8 : 1.6 }, opts);
  document.getElementById("fx-overlay").hidden = false;
  document.getElementById("fx-title").textContent = "";
  document.getElementById("fx-sub").textContent = opts.kind === "hatch" ? "Something is moving inside..." : "Fusing...";
  document.getElementById("fx-inspect").hidden = true;
  document.getElementById("fx-ok").textContent = "Skip";
  if (opts.kind === "fuse") sfx("whoosh");
}

function revealFx() {
  fx.revealed = true;
  fx.t = Math.max(fx.t, fx.revealT);
  const ind = fx.ind, def = VARIANTS[ind.k], rar = RARITY[def.rarity];
  const failed = fx.kind === "fuse" && !fx.success;
  const col = failed ? "#888" : rar.color;
  const big = !failed && rar.tier >= 3;
  if (big && state.settings.shake) {
    const box = document.querySelector(".fx-box");
    box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
  }
  for (let i = 0; i < (big ? 140 : 50); i++) {
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * (big ? 110 : 70);
    fx.parts.push({ x: 80, y: 62, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 1 + Math.random(), col: Math.random() < 0.5 ? col : "#fff" });
  }
  if (failed) sfx("fail");
  else { sfx("pop"); sfx("fanfare", rar.tier); }
  const title = document.getElementById("fx-title");
  title.textContent = failed ? "The fusion fizzled..." : `${ind.name} the ${def.name}!`;
  title.style.color = failed ? "var(--muted)" : rar.color;
  const bits = [];
  if (failed) bits.push(`You got a Falsity instead. Typical.`);
  bits.push(rar.label);
  if (fx.isNew) bits.push("NEW!");
  if (ind.shiny) bits.push("✦ SHINY ✦");
  bits.push(TRAITS[ind.trait].label, SIZES[ind.size].label);
  document.getElementById("fx-sub").textContent = bits.join(" · ");
  document.getElementById("fx-inspect").hidden = false;
  document.getElementById("fx-ok").textContent = "Nice!";
}

function closeFx() {
  if (!fx) return;
  if (!fx.revealed) { revealFx(); return; }
  fx = null;
  document.getElementById("fx-overlay").hidden = true;
  if (tool === "place" && state.inventory.some(i => i.id === selectedUid)) setTool("place");
  renderUI(true);
}

function updateFx(dt) {
  if (!fx) return;
  fx.t += dt;
  if (!fx.revealed) {
    if (fx.kind === "hatch") {
      if (fx.t >= fx.nextShake) { sfx("shake"); fx.nextShake += 0.28 - fx.t * 0.06; }
      const want = fx.t > 1.5 ? 3 : fx.t > 1.1 ? 2 : fx.t > 0.6 ? 1 : 0;
      if (want > fx.cracks) { fx.cracks = want; sfx("crack"); }
    }
    if (fx.t >= fx.revealT) revealFx();
  }
  for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt; }
  fx.parts = fx.parts.filter(p => p.life > 0);
}

function drawFx(time) {
  if (!fx) return;
  const g = fxCtx;
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#120f24"; g.fillRect(0, 0, 160, 120);
  for (let y = 0; y < 120; y += 4) { g.fillStyle = y % 8 ? "#16122c" : "#1a1533"; g.fillRect(0, y, 160, 2); }
  const failed = fx.kind === "fuse" && !fx.success;
  const rar = RARITY[VARIANTS[fx.ind.k].rarity];
  if (fx.revealed) {
    g.save();
    g.translate(80, 62);
    g.rotate(time * 0.4);
    g.fillStyle = failed ? "rgba(140,140,140,0.18)" : rar.color + "40";
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(120, -12); g.lineTo(120, 12); g.closePath(); g.fill();
    }
    g.restore();
    const k = Math.min(1, (fx.t - fx.revealT) / 0.35);
    const bounce = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.35 : 1;
    const s = 4 * bounce * Math.max(0.2, k);
    const spr = spriteFor(fx.ind);
    const w = uW(spr) * s, h = uH(spr) * s;
    g.drawImage(spr, Math.round(80 - w / 2), Math.round(62 - h / 2 + Math.sin(time * 3) * 2), Math.round(w), Math.round(h));
    if (fx.ind.shiny && Math.floor(time * 4) % 2) {
      g.fillStyle = "#fff";
      g.fillRect(110, 30, 2, 6); g.fillRect(108, 32, 6, 2);
      g.fillRect(48, 80, 2, 6); g.fillRect(46, 82, 6, 2);
    }
    const flash = 1 - (fx.t - fx.revealT) / 0.4;
    if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, 160, 120); }
  } else if (fx.kind === "hatch") {
    const amp = 1 + fx.t * 2.2;
    const shake = Math.round(Math.sin(fx.t * 40) * amp * (Math.sin(fx.t * 6) > 0 ? 1 : 0.3));
    const s = 2;
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(80 - 22, 96, 44, 4);
    g.save();
    g.translate(80 + shake, 98);
    g.rotate(shake * 0.03);
    g.drawImage(EGG_SPR[fx.eggType || "regular"], -13 * s, -32 * s, 26 * s, 32 * s);
    g.strokeStyle = "#3a2f20"; g.lineWidth = 2;
    for (let i = 0; i < fx.cracks; i++) {
      g.beginPath();
      CRACKS[i].forEach(([x, y], j) => (j ? g.lineTo : g.moveTo).call(g, (x - 13) * s, (y - 32) * s));
      g.stroke();
    }
    g.restore();
  } else {
    const k = Math.min(1, fx.t / fx.revealT);
    const ease = k * k;
    const spin = Math.cos(fx.t * (6 + fx.t * 10));
    [[fx.a, 30], [fx.b, 130]].forEach(([ind, startX]) => {
      const spr = spriteFor(ind);
      const x = startX + (80 - startX) * ease;
      const w = uW(spr) * 3 * Math.abs(spin), h = uH(spr) * 3;
      g.drawImage(spr, Math.round(x - w / 2), Math.round(62 - h / 2 + Math.sin(fx.t * 8 + startX) * 4), Math.max(1, Math.round(w)), h);
    });
    g.fillStyle = `rgba(255,255,255,${k * 0.5})`;
    g.beginPath(); g.arc(80, 62, 4 + k * 20, 0, Math.PI * 2); g.fill();
  }
  for (const p of fx.parts) { g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
}

// ================= Close-up card =================
const cardDialog = document.getElementById("card-dialog");
const cardCanvas = document.getElementById("card-canvas");
cardCanvas.width = cardCanvas.height = 100;
const cardCtx = cardCanvas.getContext("2d");
let cardUid = 0;
let cardParts = [];
const cardCritter = { x: 50, y: 74, vx: 0, vy: 0, phase: 0 };

function openCard(uid) {
  cardUid = uid;
  cardParts = [];
  renderCard();
  if (!cardDialog.open) cardDialog.showModal();
  sfx("click");
}

function renderCard() {
  const f = findInd(cardUid);
  if (!f) { if (cardDialog.open) cardDialog.close(); return; }
  const { ind, e } = f;
  const def = VARIANTS[ind.k], rar = RARITY[def.rarity];
  const lvl = levelOf(ind);
  $("card-name").textContent = ind.name;
  const sp = $("card-species");
  sp.textContent = `${def.name} · ${rar.label}`;
  sp.style.color = rar.color;
  $("card-level").textContent = "LV " + lvl;
  const cur = ind.xp - xpForLevel(lvl), need = xpForLevel(lvl + 1) - xpForLevel(lvl);
  $("card-xp").style.width = (lvl >= 10 ? 100 : Math.min(100, (cur / need) * 100)) + "%";
  const stats = $("card-stats");
  stats.innerHTML = "";
  const rows = [
    ["Personality", TRAITS[ind.trait].label],
    ["Size", SIZES[ind.size].label],
    ["Markings", MARKINGS[ind.mark]],
    ["Accessory", ACCESSORIES[ind.acc]],
    ["Per viewer", `+${fmtVal(expectedValue(ind, e))} coins`],
    ["Appeal", fmtVal(indAppeal(ind))],
    ["Home", e ? `Enclosure #${encNumber(e)}` : "Unplaced"],
    ["Hatched", new Date(ind.born).toLocaleDateString()],
  ];
  for (const [label, val] of rows) {
    const d = document.createElement("div");
    d.textContent = label;
    const b = document.createElement("b");
    b.textContent = val;
    d.appendChild(b);
    stats.appendChild(d);
  }
  const care = $("card-care");
  care.innerHTML = "";
  if (careActive()) care.appendChild(careBars(ind));
  if (e && likesTheme(ind, e)) care.appendChild(el("p", "small", `Loves its ${THEMES[e.theme].label} home (+50% value)`));
  $("card-feed").hidden = !careActive() || !e;
  $("card-feed").disabled = ind.food >= 95;
  $("card-ability").textContent = def.ability;
  $("card-desc").textContent = `"${def.desc}" ${TRAITS[ind.trait].desc}`;
  const badges = $("card-badges");
  badges.innerHTML = "";
  const addBadge = (text, color) => {
    const s = document.createElement("span");
    s.className = "badge";
    s.textContent = text;
    if (color) s.style.color = color;
    badges.appendChild(s);
  };
  addBadge(rar.label, rar.color);
  if (ind.shiny) addBadge("✦ SHINY", "#fff09a");
  if (lvl >= 10) addBadge("MAX LV", "#7df9ff");
  $("card-move").textContent = e ? "Take out" : "Place in park";
  $("card-release").textContent = `Release (+${fmt(releaseValue(ind))})`;
  const cd = (petCooldown.get(ind.id) || 0) > performance.now();
  $("card-pet").disabled = cd;
  $("card-pet").textContent = cd ? "Happy!" : "Pet";
}

function drawCard(dt, time) {
  if (!cardDialog.open) return;
  const f = findInd(cardUid);
  if (!f) return;
  const g = cardCtx;
  g.imageSmoothingEnabled = false;
  g.drawImage(makeEncGround(3, f.e ? f.e.theme : "meadow"), 2, 2, 96, 96);
  g.fillStyle = "#000";
  g.fillRect(0, 0, 100, 2); g.fillRect(0, 98, 100, 2); g.fillRect(0, 0, 2, 100); g.fillRect(98, 0, 2, 100);
  const spr = spriteFor(f.ind);
  const scale = Math.max(2, Math.min(5, Math.floor(84 / uH(spr))));
  cardCritter.phase = 0;
  cardCritter.y = Math.round(52 + (uH(spr) - SPR_PAD_B - SPR_PAD_T / 2) * scale / 2);
  cardCritter.vx = Math.sin(time * 0.7) > 0.6 ? 1 : 0;
  drawIndividual(g, f.ind, cardCritter, dt, time, scale);
  for (const p of cardParts) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    g.globalAlpha = Math.max(0, Math.min(1, p.life));
    g.fillStyle = "#ff5c7a";
    const x = Math.round(p.x), y = Math.round(p.y);
    g.fillRect(x, y, 2, 2); g.fillRect(x + 3, y, 2, 2); g.fillRect(x, y + 1, 5, 2); g.fillRect(x + 1, y + 3, 3, 1); g.fillRect(x + 2, y + 4, 1, 1);
    g.globalAlpha = 1;
  }
  cardParts = cardParts.filter(p => p.life > 0);
  const pet = $("card-pet");
  if (pet.disabled && (petCooldown.get(cardUid) || 0) <= performance.now()) renderCard();
}

// ================= UI =================
const $ = id => document.getElementById(id);
let hintTimer = 0;

// In-game replacement for confirm()/prompt(), which embedded viewers block.
// Resolves true/false, or the entered text/null when `input` is given.
function ask({ title, text, ok = "OK", input = null }) {
  return new Promise(resolve => {
    const d = $("ask-dialog"), inp = $("ask-input");
    $("ask-title").textContent = title;
    $("ask-text").textContent = text;
    $("ask-ok").textContent = ok;
    inp.hidden = input === null;
    inp.value = input ?? "";
    d.returnValue = "";
    d.onclose = () => {
      const yes = d.returnValue === "ok";
      resolve(input === null ? yes : yes ? inp.value : null);
    };
    d.showModal();
    if (input !== null) { inp.focus(); inp.select(); } else $("ask-ok").focus();
  });
}

function hintOnce(msg) {
  hintTimer = 2.5;
  $("hint").textContent = msg;
}

function setSaveStatus(msg) { $("save-status").textContent = msg; }

function toast(msg, ms = 3500, key = "verity") {
  const el = document.createElement("div");
  el.className = "toast";
  el.appendChild(spriteImg(key));
  el.appendChild(document.createTextNode(msg));
  const box = $("toasts");
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, ms);
}

// Copies a sprite into a fresh canvas for the DOM. Accepts an individual, a variant key, or null (silhouette).
function spriteImg(src) {
  const spr = src === null ? silhouetteSprite() : typeof src === "string" ? baseSprite(src) : spriteFor(src);
  const c = makeCanvas(spr.width, spr.height);
  c.getContext("2d").drawImage(spr, 0, 0);
  return c;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const TOOL_HINTS = {
  inspect: "Click a variant for a close-up, or an enclosure to manage it.",
  path: "Click or drag to lay paths. Visitors only walk on paths.",
  enclosure: "Click grass to build the selected enclosure. Put it next to a path!",
  bulldoze: "Click or drag to remove paths, enclosures and objects.",
  place: "Click an enclosure to place the selected variant.",
};

function setTool(t) {
  tool = t;
  if (t !== "place") selectedUid = 0;
  document.querySelectorAll(".tool").forEach(b => b.classList.toggle("active", b.dataset.tool === t));
  if (t.startsWith("obj:")) {
    const def = OBJECTS[t.slice(4)];
    $("hint").textContent = `Click grass to place a ${def.name}.` + (def.kind === "stand" ? " Stands must touch a path to sell." : "");
  } else $("hint").textContent = TOOL_HINTS[t];
  renderBuildOptions();
  renderUI(true);
}

function switchTab(name) {
  if (name === "lab" && !isUnlocked("lab")) name = "park";
  activeTab = name;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".page").forEach(p => { p.hidden = p.dataset.page !== name; });
  renderUI(true);
}

function invSlot(ind, opts = {}) {
  const b = el("button", "slot");
  b.style.setProperty("--rc", RARITY[VARIANTS[ind.k].rarity].color);
  b.title = `${ind.name} the ${VARIANTS[ind.k].name}`;
  b.appendChild(spriteImg(ind));
  b.appendChild(el("span", "nm", ind.name));
  b.appendChild(el("span", "lvl", `${VARIANTS[ind.k].name} · LV${levelOf(ind)}`));
  if (ind.shiny) b.appendChild(el("span", "shiny-tag", "✦"));
  const zoom = el("span", "zoom");
  zoom.style.backgroundImage = `url(${iconURL("inspect")})`;
  zoom.title = "Close-up";
  zoom.addEventListener("click", ev => { ev.stopPropagation(); openCard(ind.id); });
  b.appendChild(zoom);
  if (opts.onClick) b.addEventListener("click", opts.onClick);
  return b;
}

function renderInventory() {
  const box = $("inventory");
  box.innerHTML = "";
  $("inv-count").textContent = state.inventory.length ? `(${state.inventory.length})` : "";
  if (!state.inventory.length) {
    box.appendChild(el("p", "empty", "Hatch an egg to get a variant."));
    return;
  }
  for (const ind of state.inventory) {
    const b = invSlot(ind, { onClick: () => { if (buildLocked()) return; selectedUid = ind.id; setTool("place"); } });
    if (ind.id === selectedUid && tool === "place") b.classList.add("selected");
    box.appendChild(b);
  }
}

const shopButtons = {};
function renderShop() {
  for (const k of Object.keys(shopButtons)) delete shopButtons[k];
  for (const [kind, boxId] of [["stand", "shop-stands"], ["decor", "shop-decor"]]) {
    const box = $(boxId);
    box.innerHTML = "";
    for (const [t, def] of Object.entries(OBJECTS)) {
      if (def.kind !== kind || !isUnlocked("obj:" + t)) continue;
      const b = el("button", "shop-item");
      b.dataset.obj = t;
      const c = makeCanvas(16, 20);
      c.getContext("2d").drawImage(OBJ_SPRITES[t], 0, 0);
      b.appendChild(c);
      b.appendChild(el("span", "", def.name));
      const small = el("small", "", "");
      b.appendChild(small);
      b.title = def.kind === "stand" ? `Sells for ${def.price} coins. Appeal +${def.appeal}` : `Appeal +${def.appeal}`;
      b.addEventListener("click", () => { if (tool !== "obj:" + t && buildLocked()) return; setTool(tool === "obj:" + t ? "inspect" : "obj:" + t); });
      shopButtons[t] = { b, small };
      box.appendChild(b);
    }
  }
  const hiddenCount = Object.keys(OBJECTS).filter(t => !isUnlocked("obj:" + t)).length;
  const standsShown = Object.keys(OBJECTS).some(t => OBJECTS[t].kind === "stand" && isUnlocked("obj:" + t));
  if (!standsShown) $("shop-stands").appendChild(el("p", "empty", "Locked. Keep growing your park!"));
  $("shop-more").textContent = hiddenCount ? `${hiddenCount} more item${hiddenCount > 1 ? "s" : ""} unlock as your park levels up.` : "";
  renderShopState();
}
function renderShopState() {
  for (const [t, { b, small }] of Object.entries(shopButtons)) {
    const cost = objectCost(t);
    small.textContent = fmt(cost) + "c";
    b.classList.toggle("active", tool === "obj:" + t);
    b.classList.toggle("poor", state.money < cost);
  }
}

function renderInspect() {
  const card = $("inspect-card");
  const e = getEnc(inspectedId);
  card.hidden = !e;
  if (!e) return;
  const box = $("inspect");
  box.innerHTML = "";
  const income = e.variants.reduce((s, ind) => s + expectedValue(ind, e), 0);
  const appeal = e.variants.reduce((s, ind) => s + indAppeal(ind), 0);
  const connected = touchesPath(e.x, e.y, encSize(e), encSize(e));
  $("inspect-title").textContent = `ENCLOSURE #${encNumber(e)}`;
  const stats = el("div", "enc-stats");
  const cells = [["Occupants", `${e.variants.length}/${capOf(e)}`], ["Per viewer", `+${fmtVal(income)}c`], ["Appeal", fmtVal(appeal)], ["Path", connected ? "Linked" : "None"],
    ["Size", `${ENC_TYPES[SIZE_KEY[encSize(e)]].label} ${encSize(e)}x${encSize(e)}`], ["Theme", THEMES[e.theme].label]];
  for (const [label, val] of cells) {
    const d = el("div", "enc-stat", label);
    const b = el("b", "", val);
    if (label === "Path" && !connected) b.style.color = "var(--danger)";
    d.appendChild(b);
    stats.appendChild(d);
  }
  box.appendChild(stats);
  if (THEMES[e.theme].likes.length) box.appendChild(el("p", "small", `Loved by: ${THEMES[e.theme].likes.filter(k => state.discovered[k]).map(k => VARIANTS[k].name).join(", ") || "???"} (+50% value)`));
  if (careActive() && e.variants.length) {
    const hungry = hungryIn(e).length;
    const fb = el("button", "wide", hungry ? `Feed pen (${fmt(feedCost(e))}c)` : "Everyone is full");
    fb.disabled = !hungry;
    fb.addEventListener("click", () => { feedPen(e); renderUI(true); });
    box.appendChild(fb);
  }
  if (isLost(e)) box.appendChild(el("p", "warn", "This pen is lost in the Backrooms for a little while..."));
  if (!e.variants.length) box.appendChild(el("p", "empty", "Empty. Select a variant from the incubator and click here."));
  for (const ind of e.variants) {
    const row = el("div", "enc-row");
    row.appendChild(spriteImg(ind));
    const name = el("span", "", ind.name);
    const sub = el("em", "", `${VARIANTS[ind.k].name} · LV${levelOf(ind)} · +${fmtVal(expectedValue(ind, e))}c`);
    sub.style.color = RARITY[VARIANTS[ind.k].rarity].color;
    name.appendChild(sub);
    if (careActive()) name.appendChild(careBars(ind));
    if (escapes.has(ind.id)) name.appendChild(el("em", "", "ESCAPED! Click it in the park"));
    row.appendChild(name);
    const look = el("button", "", "Look");
    look.addEventListener("click", () => openCard(ind.id));
    const out = el("button", "", "Out");
    out.addEventListener("click", () => takeOut(ind.id));
    row.appendChild(look);
    row.appendChild(out);
    box.appendChild(row);
  }
  if (!connected) box.appendChild(el("p", "warn", "No path touches this enclosure, so visitors can't see it."));
}

function renderLab() {
  fuseSel = fuseSel.map(u => (state.inventory.some(i => i.id === u) ? u : 0));
  $("lab-level").textContent = "LV " + state.labLevel;
  document.querySelectorAll(".fuse-slot[data-slot]").forEach(slot => {
    const f = findInd(fuseSel[+slot.dataset.slot]);
    slot.innerHTML = "";
    slot.classList.toggle("filled", !!f);
    if (f) {
      slot.style.setProperty("--rc", RARITY[VARIANTS[f.ind.k].rarity].color);
      slot.appendChild(spriteImg(f.ind));
      slot.appendChild(el("span", "nm", f.ind.name));
    } else slot.textContent = "Pick a variant";
  });
  const p = fusionPreview();
  const res = $("fuse-result");
  res.innerHTML = "";
  res.classList.toggle("filled", !!p);
  const info = $("fuse-info");
  if (!p) {
    res.textContent = "?";
    info.textContent = "Choose two unplaced variants below. Every pair makes something, and some pairs have secret recipes.";
  } else {
    const showName = p.out && state.discovered[p.out] && p.known;
    res.style.setProperty("--rc", RARITY[p.rarity].color);
    res.appendChild(spriteImg(showName ? p.out : null));
    res.appendChild(document.createTextNode(showName ? VARIANTS[p.out].name : p.out ? "???" : "Random"));
    info.innerHTML = "";
    const line = (label, text, color) => {
      const s = el("div");
      s.appendChild(el("b", "", label + " "));
      const t = el("span", "", text);
      if (color) t.style.color = color;
      s.appendChild(t);
      info.appendChild(s);
    };
    line("Result:", `${showName ? VARIANTS[p.out].name : p.out ? "Unknown recipe!" : "Unstable mix (random)"} · ${RARITY[p.rarity].label}`, RARITY[p.rarity].color);
    line("Success:", `${Math.round(p.chance * 100)}% · a failed fusion makes a Falsity`);
    if (p.blocked) line("Blocked:", p.blocked, "var(--danger)");
  }
  $("fuse-cost").textContent = p ? fmt(p.cost) + "c" : "";
  $("fuse-btn").disabled = !p || !!p.blocked || state.money < p.cost;
  const up = $("lab-upgrade");
  up.hidden = !isUnlocked("labUpgrade");
  if (state.labLevel >= LAB_MAX_LEVEL) { up.textContent = "Lab fully upgraded"; up.disabled = true; }
  else {
    up.textContent = `Upgrade lab: +5% success (${fmt(labUpgradeCost())}c)`;
    up.disabled = state.money < labUpgradeCost();
  }
  const box = $("lab-inventory");
  box.innerHTML = "";
  if (!state.inventory.length) box.appendChild(el("p", "empty", "No unplaced variants. Hatch some or take them out of enclosures."));
  for (const ind of state.inventory) {
    const b = invSlot(ind, {
      onClick: () => {
        const at = fuseSel.indexOf(ind.id);
        if (at >= 0) fuseSel[at] = 0;
        else { const free = fuseSel.indexOf(0); fuseSel[free >= 0 ? free : 1] = ind.id; }
        sfx("click");
        renderLab();
      },
    });
    if (fuseSel.includes(ind.id)) b.classList.add("picked");
    box.appendChild(b);
  }
  renderRecipes();
}

function renderRecipes() {
  const box = $("recipes");
  box.innerHTML = "";
  const known = RECIPE_LIST.filter(([a, b]) => state.recipesKnown[recipeKey(a, b)]);
  $("recipe-count").textContent = `${known.length}/${RECIPE_LIST.length}`;
  if (!known.length) { box.appendChild(el("p", "empty", "Successful fusions are recorded here.")); return; }
  for (const [a, b, out] of known) {
    const r = el("div", "recipe");
    r.appendChild(spriteImg(a)); r.appendChild(el("span", "", VARIANTS[a].name));
    r.appendChild(el("span", "op", "+"));
    r.appendChild(spriteImg(b)); r.appendChild(el("span", "", VARIANTS[b].name));
    r.appendChild(el("span", "op", "="));
    r.appendChild(spriteImg(out));
    const n = el("span", "", VARIANTS[out].name);
    n.style.color = RARITY[VARIANTS[out].rarity].color;
    r.appendChild(n);
    box.appendChild(r);
  }
}

function renderIndex() {
  const box = $("index");
  box.innerHTML = "";
  const found = discoveredCount();
  $("index-count").textContent = `${found}/${VARIANT_KEYS.length}`;
  $("index-bar").style.width = (found / VARIANT_KEYS.length * 100) + "%";
  for (const key of VARIANT_KEYS) {
    const def = VARIANTS[key];
    const known = !!state.discovered[key];
    const d = el("div", "slot" + (known ? "" : " locked") + (indexSel === key ? " sel" : ""));
    if (known) d.style.setProperty("--rc", RARITY[def.rarity].color);
    d.appendChild(spriteImg(known ? key : null));
    d.appendChild(document.createTextNode(known ? def.name : "???"));
    const r = el("span", "rar", RARITY[def.rarity].label);
    r.style.color = RARITY[def.rarity].color;
    d.appendChild(r);
    d.addEventListener("click", () => { indexSel = indexSel === key ? null : key; renderIndex(); });
    box.appendChild(d);
  }
  renderIndexDetail();
}

function renderIndexDetail() {
  const box = $("index-detail");
  box.innerHTML = "";
  if (!indexSel) return;
  const def = VARIANTS[indexSel];
  const known = !!state.discovered[indexSel];
  box.appendChild(spriteImg(known ? indexSel : null));
  const info = el("div");
  const h = el("h4", "", known ? def.name : "???");
  h.style.color = RARITY[def.rarity].color;
  info.appendChild(h);
  info.appendChild(el("p", "", RARITY[def.rarity].label + (known ? ` · +${def.value}c per viewer · appeal ${def.appeal}` : "")));
  if (known) {
    info.appendChild(el("p", "", def.ability));
    info.appendChild(el("p", "", `"${def.desc}"`));
  }
  let how;
  if (def.rarity === "common") how = "Found in eggs.";
  else {
    const [a, b] = RECIPE_FOR[indexSel];
    const nm = k => (state.discovered[k] ? VARIANTS[k].name : "???");
    how = `Recipe: ${nm(a)} + ${nm(b)}` + (def.rarity === "uncommon" ? " (or rarely from eggs)" : "");
  }
  info.appendChild(el("p", "", how));
  box.appendChild(info);
}

function renderGoals() {
  const box = $("goal");
  box.innerHTML = "";
  $("goal-count").textContent = `${state.goal}/${GOALS.length}`;
  const g = GOALS[state.goal];
  if (!g) {
    box.appendChild(el("p", "goal-big", "Every goal complete. You are the ultimate Verity tycoon!"));
    return;
  }
  const [cur, max] = g.prog();
  box.appendChild(el("p", "goal-big", g.text));
  const bar = el("div", "progress");
  const fill = el("div", "progress-fill");
  fill.style.width = Math.min(100, (cur / max) * 100) + "%";
  bar.appendChild(fill);
  box.appendChild(bar);
  box.appendChild(el("p", "small", `Progress: ${fmtVal(Math.min(cur, max))} / ${fmt(max)}`));
  box.appendChild(el("p", "goal-reward", `Reward: ${fmt(g.reward)} coins`));
}

function renderGoalStrip() {
  const g = GOALS[state.goal];
  if (!g) { $("goal-strip-text").textContent = "All goals complete!"; $("goal-strip-bar").style.width = "100%"; return; }
  const [cur, max] = g.prog();
  $("goal-strip-text").textContent = `${g.text} (${fmtVal(Math.min(cur, max))}/${fmt(max)}) · ${fmt(g.reward)}c`;
  $("goal-strip-bar").style.width = Math.min(100, (cur / max) * 100) + "%";
}

function renderAchievements() {
  const box = $("achievements");
  box.innerHTML = "";
  const n = Object.keys(state.achievements).length;
  $("ach-count").textContent = `${n}/${ACHIEVEMENTS.length}`;
  for (const a of ACHIEVEMENTS) {
    const got = !!state.achievements[a.id];
    const d = el("div", "ach" + (got ? "" : " locked"));
    const i = el("i", "ico");
    i.style.backgroundImage = `url(${iconURL(got ? "trophy" : "star")})`;
    d.appendChild(i);
    const t = el("div");
    t.appendChild(el("b", "", a.name));
    t.appendChild(document.createTextNode(a.desc));
    d.appendChild(t);
    box.appendChild(d);
  }
}

function renderEventBar() {
  const bar = $("event-bar");
  bar.hidden = !activeEvent;
  if (!activeEvent) return;
  const ev = activeEvent;
  $("event-text").textContent = ev.type === "tug" ? `${ev.text} (${ev.clicks}/${ev.need})` : ev.text;
  $("event-fill").style.width = Math.max(0, (1 - ev.t / ev.dur) * 100) + "%";
}

function renderStars() {
  const s = starRating();
  const box = $("stars");
  box.innerHTML = "";
  for (let i = 1; i <= 5; i++) box.appendChild(el("span", i <= s ? "" : "off", "★"));
}

let lastStars = 0;
function renderUI(full) {
  $("money").textContent = fmt(state.money);
  $("rate").textContent = fmtVal(state.incomeRate) + "/s";
  $("visitors").textContent = visitors.filter(v => !v.leaving).length;
  $("appeal").textContent = fmtVal(parkAppeal());
  const stars = starRating();
  if (stars !== lastStars) { lastStars = stars; renderStars(); }
  const placed = state.enclosures.reduce((s, e) => s + e.variants.length, 0);
  $("park-info").textContent = `${state.enclosures.length} pens · ${placed} variants · ${visitors.filter(v => !v.leaving).length}/${maxGuests()} guests`;
  renderHours();
  $("cost-path").textContent = PATH_TYPES[pathChoice].cost + "c";
  renderWorldInfo();
  $("cost-enclosure").textContent = state.enclosures.length >= maxEnclosures() ? `max ${maxEnclosures()}` : `${fmt(enclosureCost())}c · ${state.enclosures.length}/${maxEnclosures()}`;
  renderLevelBar();

  $("hatch").disabled = (state.money < eggCost() && !state.freeEggs) || !!fx;
  $("cost-egg").textContent = state.freeEggs ? `FREE (${state.freeEggs})` : fmt(eggCost()) + "c";
  renderEventBar();
  renderGoalStrip();
  if (activeTab === "lab") {
    const p = fusionPreview();
    $("fuse-btn").disabled = !p || !!p.blocked || state.money < p.cost;
    $("lab-upgrade").disabled = state.labLevel >= LAB_MAX_LEVEL || state.money < labUpgradeCost();
  }
  if (activeTab === "goals" && !full) renderGoals();
  if (!full) return;
  if (activeTab === "park") { renderShop(); renderInventory(); renderInspect(); renderBuildOptions(); renderEggs(); renderRequest(); renderStaff(); renderLand(); renderParking(); }
  if (activeTab === "save") renderNotes($("notes-card"), 1);
  if (activeTab === "lab") renderLab();
  if (activeTab === "index") renderIndex();
  if (activeTab === "goals") { renderGoals(); renderAchievements(); renderLevelInfo(); renderPrestige(); }
  if (activeTab === "save") renderSettings();
}

function applyLocks() {
  markWorldDirty();
  if (!isUnlocked("size:" + encChoice.size)) encChoice.size = "small";
  if (!isUnlocked("theme:" + encChoice.theme)) encChoice.theme = "meadow";
  if (!isUnlocked("path:" + pathChoice)) pathChoice = 1;
  const labTab = document.querySelector('.tab[data-tab="lab"]');
  labTab.hidden = !isUnlocked("lab");
  if (activeTab === "lab" && !isUnlocked("lab")) switchTab("park");
}

let lastLevelShown = 0;
function renderLevelBar() {
  const need = xpToNext(state.level);
  const max = state.level >= MAX_PARK_LEVEL;
  if (lastLevelShown !== state.level) { lastLevelShown = state.level; $("park-level").textContent = state.level; }
  $("xp-bar").style.width = (max ? 100 : Math.min(100, (state.xp / need) * 100)) + "%";
  $("xp-text").textContent = max ? "MAX LEVEL" : `${fmt(state.xp)} / ${fmt(need)} XP`;
}

function renderLevelInfo() {
  const box = $("level-info");
  box.innerHTML = "";
  $("level-small").textContent = "LV " + state.level;
  const next = nextUnlockLevel();
  const nx = el("div", "level-next");
  if (next) {
    const count = UNLOCKS.filter(u => u.level === next).length;
    nx.appendChild(el("b", "", `NEXT UNLOCK: LV ${next}`));
    nx.appendChild(el("div", "", `${count} hidden reward${count > 1 ? "s" : ""} waiting. ${state.level < MAX_PARK_LEVEL ? fmt(xpToNext(state.level) - state.xp) + " XP to your next level." : ""}`));
  } else nx.appendChild(el("b", "", "EVERYTHING UNLOCKED"));
  box.appendChild(nx);
  box.appendChild(el("p", "small", `Enclosure slots: ${maxEnclosures()}`));
  box.appendChild(el("p", "small", "Earn XP by:"));
  const ul = el("ul", "xp-list");
  for (const t of ["Hatching eggs and discovering new variants", "Fusing variants (rarer = more XP)", "Building enclosures, shops and decor", "Welcoming visitors", "Completing goals and achievements", "Levelling up and petting your variants"]) ul.appendChild(el("li", "", t));
  box.appendChild(ul);
}

let lastHoursOpen = null;
function renderHours() {
  const open = isOpen();
  const secs = Math.ceil(secondsUntilChange()), mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, "0");
  $("hours-bar").classList.toggle("night", !open);
  $("hours-text").textContent = open
    ? `OPEN · ${clockText()} · closes at 10 PM (${mm}:${ss})`
    : `CLOSED · ${clockText()} · night build mode · opens at 8 AM (${mm}:${ss})`;
  if (lastHoursOpen !== open) {
    lastHoursOpen = open;
    $("hours-btn").textContent = open ? "Close early" : "Open park now";
    $("build-lock").hidden = !open;
    document.querySelectorAll(".tool").forEach(b => b.classList.toggle("locked", open && b.dataset.tool !== "inspect"));
    if (activeTab === "park") renderUI(true);
  }
  document.querySelectorAll(".shop-item").forEach(b => b.classList.toggle("locked", open));
}

function renderNotes(box, limit = PATCH_NOTES.length) {
  box.innerHTML = "";
  for (const n of PATCH_NOTES.slice(0, limit)) {
    const d = el("div", "note-version");
    d.appendChild(el("h4", "", `v${n.version} · ${n.title}`));
    const ul = el("ul");
    for (const line of n.notes) ul.appendChild(el("li", "", line));
    d.appendChild(ul);
    box.appendChild(d);
  }
  if (limit < PATCH_NOTES.length) {
    const b = el("button", "wide", "Read all patch notes");
    b.addEventListener("click", showPatchNotes);
    box.appendChild(b);
  }
}
function showPatchNotes() {
  renderNotes($("notes"));
  const d = $("notes-dialog");
  if (!d.open) d.showModal();
}

function renderSettings() {
  $("set-muted").checked = !!state.settings.muted;
  $("set-sound").checked = state.settings.sound;
  $("set-coin").checked = state.settings.coinSound;
  $("set-music").checked = state.settings.music;
  $("set-sfxvol").value = state.settings.sfxVol;
  $("set-musicvol").value = state.settings.musicVol;
  $("set-effects").checked = state.settings.effects;
  $("set-shake").checked = state.settings.shake;
  const btn = $("sound-toggle");
  btn.classList.toggle("muted", !!state.settings.muted);
  btn.title = state.settings.muted ? "Unmute" : "Mute everything";
  btn.querySelector(".ico").style.backgroundImage = `url(${iconURL(state.settings.muted ? "mute" : "sound")})`;
}

// ================= Input =================
function critterAt(gx, gy) {
  const placed = placedList();
  for (let i = placed.length - 1; i >= 0; i--) {
    const { ind, e } = placed[i];
    if (isLost(e)) continue;
    const c = critterPos.get(ind.id);
    if (c && c.hw && gx >= c.hx - 1 && gx <= c.hx + c.hw + 1 && gy >= c.hy - 1 && gy <= c.hy + c.hh + 1) return ind.id;
  }
  return 0;
}

function handleTileAction(x, y, isDrag) {
  if (!inBounds(x, y)) return;
  if (tool === "path") placePath(x, y);
  else if (tool === "bulldoze") bulldoze(x, y);
  else if (isDrag) return;
  else if (tool === "enclosure") placeEnclosure(x, y);
  else if (tool === "place") placeVariant(x, y);
  else if (tool.startsWith("obj:")) placeObject(tool.slice(4), x, y);
  else if (tool === "inspect") {
    inspectedId = encAt(x, y);
    const oid = objAt(x, y);
    if (oid) {
      const def = OBJECTS[getObj(oid).t];
      hintOnce(def.kind === "stand" ? `${def.name}: visitors who pass buy for ${def.price} coins (${Math.round(STAND_BUY_CHANCE * (hasElectricity ? 1.5 : 1) * 100)}% chance).` : `${def.name}: +${def.appeal} appeal.`);
    }
    renderUI(true);
  }
}

// Pointer controls: left click acts, left-drag pans (or paints paths / bulldozes),
// right or middle drag pans, two fingers pinch-zoom and pan.
function clickAction(p) {
  if (activeEvent && activeEvent.type === "tug" && tugHit(p)) { tugClick(p); return; }
  if (catchEscapeAt(p.gx, p.gy)) return;
  const ti = trashNear(p.gx, p.gy);
  if (ti >= 0 && (tool === "inspect" || tool === "bulldoze")) { cleanTrash(ti); sfx("click"); return; }
  if (inBounds(p.x, p.y) && p.x >= OX && !isOwned(p.x, p.y)) {
    const k = plotOf(p.x, p.y);
    if (k && plotForSale(k)) {
      if (isOpen()) hintOnce(`${PLOTS[k].label} is for sale. Land can be bought at night while the park is closed.`);
      else ask({ title: "BUY LAND", text: `Buy ${PLOTS[k].label} for ${fmt(PLOTS[k].cost)} coins?`, ok: "Buy" }).then(yes => { if (yes) buyPlot(k); });
    } else hintOnce("This land isn't for sale yet. Keep levelling up your park!");
    return;
  }
  if (tool === "inspect") {
    const uid = critterAt(p.gx, p.gy);
    if (uid) { openCard(uid); return; }
  }
  handleTileAction(p.x, p.y, false);
}

const pointers = new Map();
let drag = null;     // { mode: "pending" | "pan" | "paint", sx, sy, vx, vy }
let pinch = null;
const PAINT_TOOLS = ["path", "bulldoze"];
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("pointerdown", e => {
  startMusic();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: view.x, vy: view.y };
    drag = null; painting = false;
    return;
  }
  const p = worldFromEvent(e);
  if (e.button === 1 || e.button === 2) { drag = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
  if (PAINT_TOOLS.includes(tool) && isOwned(p.x, p.y)) {
    drag = { mode: "paint" };
    painting = true;
    clickAction(p);
    return;
  }
  drag = { mode: "pending", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
});
canvas.addEventListener("pointermove", e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const r = canvas.getBoundingClientRect();
    view.x = pinch.vx - (mx - pinch.mx) / view.zoom; view.y = pinch.vy - (my - pinch.my) / view.zoom;
    setZoom(pinch.zoom * d / Math.max(1, pinch.d), mx - r.left, my - r.top);
    return;
  }
  const p = worldFromEvent(e);
  const moved = !hover || hover.x !== p.x || hover.y !== p.y;
  hover = { x: p.x, y: p.y };
  if (drag && drag.mode === "pending" && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.mode = "pan";
  if (drag && drag.mode === "pan") {
    view.x = drag.vx - (e.clientX - drag.sx) / view.zoom;
    view.y = drag.vy - (e.clientY - drag.sy) / view.zoom;
    clampView();
    canvas.style.cursor = "grabbing";
    return;
  }
  canvas.style.cursor = (tool === "inspect" && critterAt(p.gx, p.gy)) || (activeEvent && activeEvent.type === "tug" && tugHit(p)) ? "pointer" : "crosshair";
  if (painting && moved) handleTileAction(p.x, p.y, true);
});
function endPointer(e, cancelled) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
  if (drag && drag.mode === "pending" && !cancelled) clickAction(worldFromEvent(e));
  drag = null;
  painting = false;
}
canvas.addEventListener("pointerup", e => endPointer(e, false));
canvas.addEventListener("pointercancel", e => endPointer(e, true));
canvas.addEventListener("pointerleave", () => { hover = null; });

document.querySelectorAll(".tool").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.tool !== "inspect" && buildLocked()) return;
  setTool(b.dataset.tool);
}));
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { sfx("click"); switchTab(b.dataset.tab); }));
$("hatch").addEventListener("click", () => hatchEgg("regular"));
$("fuse-btn").addEventListener("click", doFuse);
$("lab-upgrade").addEventListener("click", upgradeLab);
document.querySelectorAll(".fuse-slot[data-slot]").forEach(s => s.addEventListener("click", () => { fuseSel[+s.dataset.slot] = 0; renderLab(); }));

$("fx-ok").addEventListener("click", closeFx);
$("fx-canvas").addEventListener("click", () => { if (fx && !fx.revealed) revealFx(); });
$("fx-inspect").addEventListener("click", () => { const uid = fx.ind.id; closeFx(); openCard(uid); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && fx) closeFx(); });

$("card-pet").addEventListener("click", () => petInd(cardUid));
$("card-rename").addEventListener("click", () => renameInd(cardUid));
$("card-move").addEventListener("click", () => {
  const f = findInd(cardUid);
  if (!f) return;
  if (f.e) { takeOut(cardUid); renderCard(); }
  else { cardDialog.close(); startPlacing(cardUid); }
});
$("card-release").addEventListener("click", () => {
  const f = findInd(cardUid);
  if (!f) return;
  const uid = cardUid;
  ask({ title: "RELEASE", text: `Release ${f.ind.name} for ${fmt(releaseValue(f.ind))} coins? This can't be undone.`, ok: "Release" }).then(yes => {
    if (!yes) return;
    cardDialog.close();
    releaseInd(uid);
  });
});
$("card-close").addEventListener("click", () => cardDialog.close());

function setMuted(m) {
  state.settings.muted = m;
  applyVolumes();
  if (m) stopMusic(); else startMusic();
  renderSettings();
  if (!m) sfx("click");
}
$("sound-toggle").addEventListener("click", () => setMuted(!state.settings.muted));
$("set-muted").addEventListener("change", e => setMuted(e.target.checked));
$("hours-btn").addEventListener("click", () => { if (isOpen()) closeNow(); else openNow(); });
$("zoom-in").addEventListener("click", () => zoomStep(1));
$("zoom-out").addEventListener("click", () => zoomStep(-1));
$("zoom-home").addEventListener("click", () => homeView());
$("loader-notes").addEventListener("click", showPatchNotes);
$("set-sound").addEventListener("change", e => { state.settings.sound = e.target.checked; renderSettings(); });
$("set-coin").addEventListener("change", e => { state.settings.coinSound = e.target.checked; });
$("set-music").addEventListener("change", e => { state.settings.music = e.target.checked; if (e.target.checked) startMusic(); else stopMusic(); });
$("set-sfxvol").addEventListener("input", e => { state.settings.sfxVol = +e.target.value; applyVolumes(); });
$("set-musicvol").addEventListener("input", e => { state.settings.musicVol = +e.target.value; applyVolumes(); });
$("set-effects").addEventListener("change", e => { state.settings.effects = e.target.checked; });
$("set-shake").addEventListener("change", e => { state.settings.shake = e.target.checked; });
$("snapshot").addEventListener("click", () => downloadSnapshot());
$("snapshot2").addEventListener("click", () => downloadSnapshot());
$("card-feed").addEventListener("click", () => {
  const f = findInd(cardUid);
  if (!f || !f.e) return;
  if (spend(CARE.feedCost)) { f.ind.food = 100; f.ind.joy = Math.min(100, f.ind.joy + 5); state.stats.feeds++; sfx("pet"); renderCard(); }
});

// Save buttons
$("save-now").addEventListener("click", saveGame);
const dialog = $("save-dialog");
let dialogMode = "export";
$("export").addEventListener("click", () => {
  dialogMode = "export";
  $("save-dialog-title").textContent = "EXPORT SAVE";
  $("save-dialog-help").textContent = "Copy this code somewhere safe. Paste it into Import on any device to restore your park.";
  $("save-code").value = exportSave();
  $("save-code").readOnly = true;
  dialog.showModal();
  $("save-code").select();
  try { navigator.clipboard.writeText($("save-code").value).then(() => setSaveStatus("Save code copied to clipboard."), () => {}); } catch (e) { /* clipboard unavailable */ }
});
$("import").addEventListener("click", () => {
  dialogMode = "import";
  $("save-dialog-title").textContent = "IMPORT SAVE";
  $("save-dialog-help").textContent = "Paste a save code. This replaces your current park.";
  $("save-code").value = "";
  $("save-code").readOnly = false;
  dialog.showModal();
});
dialog.addEventListener("close", () => {
  if (dialogMode !== "import" || dialog.returnValue !== "ok") return;
  const code = $("save-code").value;
  if (!code.trim()) return;
  try { importSave(code); toast("Save imported!"); } catch (e) { toast("That save code didn't work."); }
});
$("reset").addEventListener("click", () => {
  ask({ title: "RESET PARK", text: "Delete your park and start over? This can't be undone.", ok: "Delete park" }).then(yes => {
    if (!yes) return;
    resetting = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });
});

setInterval(saveGame, AUTOSAVE_MS);
window.addEventListener("beforeunload", saveGame);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });

