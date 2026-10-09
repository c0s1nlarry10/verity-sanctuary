"use strict";

// Systems layered on top of the core game: land, care, staff, trash, world (day/night,
// weather), visitor types & moods, requests, escapes, eggs, daily rewards, prestige.

// ================= Land =================
function plotOf(x, y) {
  if (!inBounds(x, y)) return null;
  const i = PLOT_MAP[y * COLS + x];
  return i >= 0 ? PLOT_KEYS[i] : null;
}
function isOwned(x, y) {
  const k = plotOf(x, y);
  return !!k && !!state.plots[k];
}
function plotForSale(k) { return !state.plots[k] && isUnlocked("plot:" + k); }

function buyPlot(k) {
  const p = PLOTS[k];
  if (!p || !plotForSale(k) || buildLocked()) return;
  if (!spend(p.cost, "Land")) return hintOnce(`${p.label} costs ${fmt(p.cost)} coins.`);
  state.plots[k] = true;
  markWorldDirty();
  sfx("build");
  gainParkXp(50);
  toast(`You bought ${p.label}! The trees are cleared and ready to build on.`, 4500, "verity");
  renderUI(true);
}

// ================= Parking =================
function upgradeLot() {
  const next = lotLevel() + 1;
  if (next > LOT_LEVELS.length || !isUnlocked("lot:" + next) || buildLocked()) return;
  if (!spend(LOT_LEVELS[next - 1].cost, "Parking")) return hintOnce(`The upgrade costs ${fmt(LOT_LEVELS[next - 1].cost)} coins.`);
  state.lotLevel = next;
  markWorldDirty();
  sfx("build");
  gainParkXp(40);
  toast(`Parking lot upgraded! ${LOT_LEVELS[next - 1].spaces} spaces, room for ${maxGuests()} guests.`, 4000, "verity");
  renderUI(true);
}

// ================= Care (hunger & happiness) =================
const careActive = () => isUnlocked("care");
function careMult(ind) {
  if (!careActive()) return 1;
  const f = ind.food, j = ind.joy;
  const food = f >= 50 ? 1 : f >= 20 ? 0.75 : 0.4;
  return food * (0.8 + 0.4 * j / 100);
}
function likesTheme(ind, e) { return !!e && THEMES[e.theme].likes.includes(ind.k); }

function tickCare() {
  if (!careActive() || !isOpen()) return;
  for (const { ind, e } of placedList()) {
    if (isLost(e) || escapes.has(ind.id)) continue;
    ind.food = Math.max(0, ind.food - CARE.foodDecay * (ind.k === "obesity" ? 2 : 1));
    let target = likesTheme(ind, e) ? 85 : 55;
    if (ind.food < 20) target -= 35;
    if (weather === "rain" && ind.k === "humidity") target += 25;
    ind.joy = Math.max(0, Math.min(100, ind.joy + (target - ind.joy) * CARE.joyDrift));
  }
}

function hungryIn(e) { return e.variants.filter(i => i.food < 95); }
function feedCost(e) { return hungryIn(e).length * CARE.feedCost; }
function feedPen(e, free = false) {
  const hungry = hungryIn(e);
  if (!hungry.length) return false;
  if (!free && !spend(feedCost(e), "Food")) { hintOnce("Not enough coins to buy food."); return false; }
  for (const i of hungry) { i.food = 100; i.joy = Math.min(100, i.joy + 5); }
  state.stats.feeds += hungry.length;
  for (const i of hungry) {
    const c = critterPos.get(i.id);
    if (c) c.bubble = { icon: "heart", t: 1.5 };
  }
  if (!free) sfx("pet");
  return true;
}

// ================= Staff =================
let staffWalkers = [];
let staffTick = 0;
const staffCount = t => state.staff[t] || 0;
function hireCost(t) { return Math.round(STAFF[t].hire * Math.pow(1.5, staffCount(t))); }
function wagesPerSec() { return Object.keys(STAFF).reduce((s, t) => s + staffCount(t) * STAFF[t].wage, 0); }

function hireStaff(t) {
  if (!isUnlocked("staff:" + t) || staffCount(t) >= STAFF[t].max) return;
  if (!spend(hireCost(t), "Staff")) return hintOnce(`Hiring a ${STAFF[t].label} costs ${fmt(hireCost(t))} coins.`);
  state.staff[t] = staffCount(t) + 1;
  syncStaff();
  sfx("place");
  gainParkXp(15);
  renderUI(true);
}
function fireStaff(t) {
  if (!staffCount(t)) return;
  state.staff[t]--;
  syncStaff();
  renderUI(true);
}

function newWalker(type) {
  return { type, tx: GATE.x, ty: GATE.y, px: GATE.x, py: GATE.y, nx: GATE.x, ny: GATE.y, prog: 1, speed: type === "mascot" ? 0.7 : 0.9, phase: Math.random() * 6 };
}
function syncStaff() {
  for (const t of Object.keys(STAFF)) {
    const mine = staffWalkers.filter(w => w.type === t);
    while (mine.length < staffCount(t)) { const w = newWalker(t); mine.push(w); staffWalkers.push(w); }
    while (mine.length > staffCount(t)) staffWalkers.splice(staffWalkers.indexOf(mine.pop()), 1);
  }
}

// Shared path-walking step for staff (never leave the park)
function stepWalker(w, dt, onArrive) {
  w.phase += dt * 10;
  if (!isPath(w.tx, w.ty)) { Object.assign(w, newWalker(w.type)); return; }
  if (w.prog < 1) {
    w.prog = Math.min(1, w.prog + dt * w.speed * PATH_TYPES[state.tiles[idx(w.tx, w.ty)]].speed);
    if (w.prog >= 1) { w.tx = w.nx; w.ty = w.ny; if (onArrive) onArrive(w); }
    return;
  }
  const opts = DIRS.map(([dx, dy]) => ({ x: w.tx + dx, y: w.ty + dy })).filter(p => isPath(p.x, p.y));
  if (!opts.length) return;
  const forward = opts.filter(p => !(p.x === w.px && p.y === w.py));
  // janitors head for trash when they can see it next door
  let choice = null;
  if (w.type === "janitor") choice = opts.find(p => trashIndexAt(p.x, p.y) >= 0) || null;
  if (!choice) choice = randItem(forward.length ? forward : opts);
  w.px = w.tx; w.py = w.ty;
  w.nx = choice.x; w.ny = choice.y;
  w.prog = 0;
}

function updateStaff(dt) {
  for (const w of staffWalkers) {
    stepWalker(w, dt, s => {
      if (s.type === "janitor") {
        const i = trashIndexAt(s.tx, s.ty);
        if (i >= 0) { cleanTrash(i); s.bubble = { icon: "star", t: 1 }; }
      }
    });
    if (w.bubble) { w.bubble.t -= dt; if (w.bubble.t <= 0) w.bubble = null; }
  }
}

function staffSecond() {
  if (!isOpen()) return;
  staffTick++;
  const wages = wagesPerSec();
  if (wages > 0) {
    if (state.money >= wages) { state.money -= wages; logExpense(wages, "Wages"); }
    else {
      const t = Object.keys(STAFF).filter(k => staffCount(k)).sort((a, b) => STAFF[b].wage - STAFF[a].wage)[0];
      state.staff[t]--;
      syncStaff();
      toast(`You couldn't pay wages, so a ${STAFF[t].label} quit!`, 4000, "falsity");
      renderUI(true);
    }
  }
  if (careActive() && staffTick % 8 === 0) {
    for (let k = 0; k < staffCount("keeper"); k++) {
      const pen = state.enclosures.filter(e => !isLost(e) && e.variants.some(i => i.food < 60))
        .sort((a, b) => Math.min(...a.variants.map(i => i.food)) - Math.min(...b.variants.map(i => i.food)))[0];
      if (!pen) break;
      feedPen(pen, true);
    }
  }
}

function drawWalkerSprite(w) {
  const walking = w.prog < 1;
  const spr = STAFF_FRAMES[w.type][walking ? (Math.floor(w.phase) % 2 ? 1 : 2) : 0];
  const fx = w.tx + (w.nx - w.tx) * w.prog, fy = w.ty + (w.ny - w.ty) * w.prog;
  const SW = uW(spr), SH = uH(spr);
  const x = Math.round((fx * TILE + 8 - SW / 2) * 2) / 2, y = Math.round((fy * TILE + 14 - SH) * 2) / 2;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(x + SW / 2, y + SH - 0.5, SW / 2 - 1, 1.2, 0, 0, Math.PI * 2); ctx.fill();
  blit(ctx, spr, x, y);
  if (w.bubble) drawBubble(w.bubble.icon, x + SW / 2, y - 2);
}

// ================= Trash =================
function trashIndexAt(x, y) { return state.trash.findIndex(t => t.x === x && t.y === y); }
function dropTrash(x, y) {
  if (!isPath(x, y) || state.trash.length >= 60) return;
  state.trash.push({ x, y, ox: 3 + Math.floor(Math.random() * 9), oy: 4 + Math.floor(Math.random() * 8), k: Math.floor(Math.random() * TRASH_SPR.length) });
}
function cleanTrash(i) {
  state.trash.splice(i, 1);
  state.stats.trashCleaned++;
}
function trashNear(gx, gy) {
  return state.trash.findIndex(t => Math.abs(t.x * TILE + t.ox + 1 - gx) <= 4 && Math.abs(t.y * TILE + t.oy + 1 - gy) <= 4);
}
function drawTrash() {
  for (const t of state.trash) blit(ctx, TRASH_SPR[t.k], t.x * TILE + t.ox, t.y * TILE + t.oy);
}

// ================= Bubbles =================
function drawBubble(icon, cx, bottomY) {
  blitFeet(ctx, BUBBLE_SPR[icon], cx, bottomY);
}

// ================= Day / night & weather =================
let weather = "clear";
let weatherTimer = 150;
let lightning = 0;
// Park hours: open 8 AM - 10 PM (DAY_SECS), closed 10 PM - 8 AM (NIGHT_SECS).
const cyclePos = () => state.worldClock % CYCLE_SECS;
const isOpen = () => cyclePos() < DAY_SECS;
const dayNumber = () => Math.floor(state.worldClock / CYCLE_SECS) + 1;
function hourOfDay() {
  const p = cyclePos();
  return p < DAY_SECS ? 8 + 14 * p / DAY_SECS : (22 + 10 * (p - DAY_SECS) / NIGHT_SECS) % 24;
}
function darkness() {
  const h = hourOfDay();
  if (h >= 8 && h < 17) return 0;
  if (h >= 17 && h < 22) return ((h - 17) / 5) * 0.38;
  if (h >= 22 || h < 5) return 0.46;
  return 0.46 * (1 - (h - 5) / 3);
}
const isNight = () => darkness() > 0.3;
const isEvening = () => isOpen() && hourOfDay() >= 18;
function secondsUntilChange() { const p = cyclePos(); return p < DAY_SECS ? DAY_SECS - p : CYCLE_SECS - p; }

function tickWorld(dt) {
  const wasOpen = isOpen();
  if (!tutorialActive() && !admin.freeze) state.worldClock += dt;
  const nowOpen = isOpen();
  if (wasOpen && !nowOpen) closeDay();
  else if (!wasOpen && nowOpen) openDay();
  weatherTimer -= dt;
  if (weatherTimer <= 0) {
    weatherTimer = 120 + Math.random() * 150;
    const total = Object.values(WEATHER).reduce((s, w) => s + w.weight, 0);
    let roll = Math.random() * total, next = "clear";
    for (const [k, w] of Object.entries(WEATHER)) { roll -= w.weight; if (roll <= 0) { next = k; break; } }
    if (next !== weather) {
      weather = next;
      if (weather === "rain" && isOpen()) toast("It's starting to rain. Fewer visitors, but Humidity is thrilled.", 3500, "humidity");
      if (weather === "storm" && isOpen()) toast("A storm rolls in! Visitors are heading home.", 3500, "calamity");
    }
  }
  if (lightning > 0) lightning -= dt;
  else if (weather === "storm" && Math.random() < dt * 0.08) { lightning = 0.18; sfx("crack"); }
}
function spawnFactor() { return WEATHER[weather].spawn; }

function totalParkXp() {
  let t = state.xp;
  for (let l = 1; l < state.level; l++) t += xpToNext(l);
  return t;
}

function openDay(quiet = false) {
  state.day = {
    n: dayNumber(), revenue: {}, expenses: {}, visitors: 0,
    xpStart: totalParkXp(), levelStart: state.level,
    varLevels: Object.fromEntries(allIndividuals().map(i => [i.id, levelOf(i)])),
    disc: discoveredCount(), ach: Object.keys(state.achievements).length,
  };
  if (quiet) return;
  if (tool !== "inspect") setTool("inspect");
  sfx("fanfare", 1);
  toast(`Good morning! Day ${dayNumber()} begins and the park is open until 10 PM.`, 4500, "verity");
  renderUI(true);
}

function closeDay() {
  if (activeEvent) { activeEvent = null; eventTimer = 60; }
  for (const v of visitors) v.leaving = true;
  walkers = [];
  for (const esc of escapes.values()) toast(`${esc.ind.name} wandered back home for the night.`, 2500, esc.ind.k);
  escapes.clear();
  const report = state.day;
  state.day = null;
  sfx("achievement");
  if (report) showDayReport(report);
  else toast("The park is closed for the night. Time to build!", 4000, "verity");
  renderUI(true);
}

function openNow() {
  if (isOpen()) return;
  state.worldClock = Math.floor(state.worldClock / CYCLE_SECS + 1) * CYCLE_SECS;
  openDay();
}
function closeNow() {
  if (!isOpen()) return;
  ask({ title: "CLOSE EARLY", text: "Close the park early? Guests head home and you get tonight's report. Building unlocks right away.", ok: "Close park" }).then(yes => {
    if (!yes || !isOpen()) return;
    state.worldClock = Math.floor(state.worldClock / CYCLE_SECS) * CYCLE_SECS + DAY_SECS;
    closeDay();
  });
}

function showDayReport(d) {
  const box = $("day-report");
  box.innerHTML = "";
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const rev = sum(d.revenue), exp = sum(d.expenses), profit = rev - exp;
  $("day-title").textContent = `DAY ${d.n} REPORT`;
  const top = el("div", "report-top");
  for (const [label, val, cls] of [["Visitors", fmt(d.visitors), ""], ["Revenue", "+" + fmt(rev), "good"], ["Expenses", "-" + fmt(exp), "bad"], ["Profit", (profit >= 0 ? "+" : "-") + fmt(Math.abs(profit)), profit >= 0 ? "good big" : "bad big"]]) {
    const c = el("div", "report-stat " + cls);
    c.appendChild(el("span", "", label));
    c.appendChild(el("b", "", val));
    top.appendChild(c);
  }
  box.appendChild(top);
  const cols = el("div", "report-cols");
  for (const [title, obj, sign] of [["Revenue", d.revenue, "+"], ["Expenses", d.expenses, "-"]]) {
    const col = el("div", "report-col");
    col.appendChild(el("h4", "", title));
    const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    if (!entries.length) col.appendChild(el("p", "small", "Nothing today."));
    for (const [k, v] of entries) {
      const row = el("div", "report-row");
      row.appendChild(el("span", "", k));
      row.appendChild(el("b", "", sign + fmt(v)));
      col.appendChild(row);
    }
    cols.appendChild(col);
  }
  box.appendChild(cols);
  const growth = el("div", "report-growth");
  growth.appendChild(el("h4", "", "What levelled up"));
  const xpGain = Math.max(0, Math.round(totalParkXp() - d.xpStart));
  const parkLine = el("div", "report-row");
  parkLine.appendChild(el("span", "", `Park: +${fmt(xpGain)} XP`));
  parkLine.appendChild(el("b", "", state.level > d.levelStart ? `LV ${d.levelStart} to ${state.level}` : `LV ${state.level}`));
  growth.appendChild(parkLine);
  const ups = allIndividuals().filter(i => d.varLevels[i.id] !== undefined && levelOf(i) > d.varLevels[i.id]);
  if (!ups.length) growth.appendChild(el("p", "small", "No variants levelled up today. Keep them on display to earn XP."));
  for (const i of ups.slice(0, 12)) {
    const row = el("div", "report-row variant");
    row.appendChild(spriteImg(i));
    row.appendChild(el("span", "", `${i.name} the ${VARIANTS[i.k].name}`));
    row.appendChild(el("b", "", `LV ${d.varLevels[i.id]} to ${levelOf(i)}`));
    growth.appendChild(row);
  }
  if (ups.length > 12) growth.appendChild(el("p", "small", `...and ${ups.length - 12} more.`));
  const extras = [];
  if (discoveredCount() > d.disc) extras.push(`${discoveredCount() - d.disc} new variant${discoveredCount() - d.disc > 1 ? "s" : ""} discovered`);
  const achGain = Object.keys(state.achievements).length - d.ach;
  if (achGain > 0) extras.push(`${achGain} achievement${achGain > 1 ? "s" : ""} unlocked`);
  if (extras.length) growth.appendChild(el("p", "small", extras.join(" · ")));
  box.appendChild(growth);
  const dlg = $("day-dialog");
  if (!dlg.open) dlg.showModal();
}

function drawSky(time) {
  if (!state.settings.effects) return;
  const vx = view.x - TILE, vy = view.y - TILE, vw = viewW() + TILE * 2, vh = viewH() + TILE * 2;
  if (weather === "rain" || weather === "storm") {
    const n = Math.round((weather === "storm" ? 0.22 : 0.12) * vw * vh / 256);
    ctx.fillStyle = "rgba(170,200,255,0.55)";
    for (let i = 0; i < n; i++) {
      const x = vx + (((hash2(i, 7, 2) * vw - time * 30) % vw) + vw) % vw;
      const y = vy + (hash2(i, 3, 2) * vh + time * 160) % vh;
      ctx.fillRect(x, y, 0.5, 4);
    }
  }
  const d = darkness() + (weather === "storm" ? 0.18 : weather === "rain" ? 0.1 : weather === "cloudy" ? 0.05 : 0);
  if (d > 0) {
    ctx.fillStyle = `rgba(12,16,52,${Math.min(0.7, d)})`;
    ctx.fillRect(vx, vy, vw, vh);
  }
  const glow = darkness();
  if (glow > 0.05) {
    ctx.globalCompositeOperation = "lighter";
    const lights = state.objects.filter(o => o.t === "lamp" || OBJECTS[o.t].kind === "stand").map(o => [o.x * TILE + 8, o.y * TILE, o.t === "lamp" ? 26 : 14]);
    lights.push([GATE.x * TILE + 8, GATE.y * TILE - 19, 16], [GATE.x * TILE + 8, GATE.y * TILE + 7, 16], [GATE.x * TILE + 8, GATE.y * TILE - 28, 22], [GATE.x * TILE - 9, GATE.y * TILE - 6, 10]);
    for (const c of cars) if (c.state !== "parked") lights.push([c.x + (c.dir === 1 ? 8 : c.dir === 3 ? -8 : 0), c.y + (c.dir === 2 ? 8 : c.dir === 0 ? -8 : 0), 10]);
    for (const [lx, ly, r] of lights) {
      if (lx < vx - r || lx > vx + vw + r || ly < vy - r || ly > vy + vh + r) continue;
      const grd = ctx.createRadialGradient(lx, ly, 1, lx, ly, r);
      grd.addColorStop(0, `rgba(255,220,120,${glow * 0.9})`);
      grd.addColorStop(1, "rgba(255,220,120,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
    }
    drawCityLights(glow, vx, vy, vx + vw, vy + vh);
    ctx.globalCompositeOperation = "source-over";
  }
  if (lightning > 0) {
    ctx.fillStyle = `rgba(255,255,255,${lightning * 3})`;
    ctx.fillRect(vx, vy, vw, vh);
  }
}

function clockText() {
  const h = hourOfDay();
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `Day ${dayNumber()} · ${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

// ================= Visitor types, moods, critics, influencers =================
function rollVisitorType() {
  const total = Object.values(VISITOR_TYPES).reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * total;
  for (const [k, t] of Object.entries(VISITOR_TYPES)) { roll -= t.weight; if (roll <= 0) return k; }
  return "normal";
}

function visitorMoodStep(v) {
  v.mood -= 3;
  if (trashIndexAt(v.tx, v.ty) >= 0) { v.mood -= 8; if (Math.random() < 0.3) v.bubble = { icon: "angry", t: 1.2 }; }
  const crowd = visitors.filter(o => o !== v && !o.leaving && o.tx === v.tx && o.ty === v.ty).length;
  if (crowd >= 3) v.mood -= 4;
  if (staffWalkers.some(w => w.type === "mascot" && Math.abs(w.tx - v.tx) + Math.abs(w.ty - v.ty) <= 1)) { v.mood += 10; if (Math.random() < 0.3) v.bubble = { icon: "heart", t: 1.2 }; }
  if (weather === "rain" || weather === "storm") v.mood -= weather === "storm" ? 4 : 2;
  if (Math.random() < 0.003) dropTrash(v.tx, v.ty);
  if (v.mood <= 0 && !v.leaving) {
    v.bubble = { icon: v.pensSeen ? "bored" : "angry", t: 2 };
    leaveVisitor(v);
  }
}

function leaveVisitor(v) {
  if (v.leaving) return;
  v.leaving = true;
  if (v.type === "critic") criticReview(v);
}

function criticReview(v) {
  const stars = Math.max(1, Math.min(5, Math.round(0.5 + v.pensSeen * 0.6 + v.mood / 40 + starRating() * 0.3)));
  const reward = Math.round(stars * stars * 8 * starRating() * globalMult());
  earn(reward, v.tx * TILE + 8, v.ty * TILE - 10, "#c77dff", "Reviews");
  if (stars >= 5) { state.stats.reviews5++; toast(`A food critic gave your park ★★★★★! +${fmt(reward)} coins`, 4000, "celebrity"); }
  floaters.push({ x: v.tx * TILE + 8, y: v.ty * TILE - 16, text: "★".repeat(stars), t: 0, color: "#c77dff" });
}

function influencerPost(v, e) {
  if (activeEvent || !isUnlocked("events") || !e.variants.length) return;
  if (Math.random() >= VISITOR_TYPES.influencer.viralChance) return;
  v.bubble = { icon: "star", t: 2 };
  startEvent("viral", randItem(e.variants).k);
}

// ================= Requests =================
let requestTimer = 45;
function makeRequest() {
  const tierCap = Math.min(4, Math.floor(state.level / 3));
  const pool = VARIANT_KEYS.filter(k => state.discovered[k] && RARITY[VARIANTS[k].rarity].tier <= tierCap);
  if (!pool.length) return null;
  const k = randItem(pool);
  const tier = RARITY[VARIANTS[k].rarity].tier;
  const n = tier >= 3 ? 1 : 1 + Math.floor(Math.random() * (3 - tier));
  return {
    k, n,
    until: Date.now() + 300000,
    reward: Math.round(VARIANTS[k].value * n * 50 * (1 + state.level * 0.1)),
    xp: 25 * (tier + 1) + 10 * n,
    who: randItem(["A kid", "A tourist", "A Verity superfan", "A grandma", "A TikToker", "A school group"]),
  };
}
function requestProgress() {
  if (!state.request) return 0;
  return placedList().filter(p => p.ind.k === state.request.k && !isLost(p.e) && !escapes.has(p.ind.id)).length;
}
function tickRequests() {
  if (!isUnlocked("requests") || !isOpen()) return;
  const r = state.request;
  if (!r) {
    if (--requestTimer > 0) return;
    state.request = makeRequest();
    requestTimer = 90 + Math.random() * 90;
    if (state.request) { toast(`New request: ${state.request.who} wants to see ${state.request.n} ${VARIANTS[state.request.k].name}!`, 4000, state.request.k); renderRequest(); }
    return;
  }
  if (requestProgress() >= r.n) {
    state.request = null;
    earn(r.reward);
    gainParkXp(r.xp);
    state.stats.requests++;
    sfx("achievement");
    toast(`Request complete! +${fmt(r.reward)} coins, +${r.xp} XP`, 4000, r.k);
    renderRequest();
  } else if (Date.now() > r.until) {
    state.request = null;
    toast("A visitor's request expired.", 3000, "falsity");
    renderRequest();
  }
}

// ================= Escapes =================
const escapes = new Map();   // ind.id -> { ind, e, x, y, vx, vy, t }
function tickEscapes() {
  if (!isUnlocked("events") || !isOpen()) return;
  for (const { ind, e } of placedList()) {
    const chance = ESCAPERS[ind.k];
    if (!chance || escapes.has(ind.id) || isLost(e) || (activeEvent && activeEvent.ind === ind)) continue;
    if (Math.random() >= (chance / 60) * (e.s >= 5 ? 0.5 : 1)) continue;
    const c = critterPos.get(ind.id);
    escapes.set(ind.id, { ind, e, x: c ? c.x : (e.x + encW(e) / 2) * TILE, y: (e.y + encH(e)) * TILE + 6, vx: 0, vy: 0, t: 90, timer: 0 });
    sfx("event");
    toast(`${ind.name} the ${VARIANTS[ind.k].name} broke out! Click it to catch it.`, 4500, ind.k);
  }
  for (const [id, esc] of escapes) {
    if (!findInd(id)) { escapes.delete(id); continue; }
    if (--esc.t <= 0) { escapes.delete(id); toast(`${esc.ind.name} wandered back home.`, 3000, esc.ind.k); continue; }
    for (const v of visitors) {
      const vx = (v.tx + (v.nx - v.tx) * v.prog) * TILE + 8, vy = (v.ty + (v.ny - v.ty) * v.prog) * TILE + 8;
      if (!v.leaving && Math.hypot(vx - esc.x, vy - esc.y) < 18) { v.mood -= 12; v.bubble = { icon: "scared", t: 1.2 }; }
    }
  }
}
function updateEscapes(dt) {
  for (const esc of escapes.values()) {
    esc.timer -= dt;
    if (esc.timer <= 0) {
      esc.timer = 0.6 + Math.random();
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 20;
      esc.vx = Math.cos(a) * sp; esc.vy = Math.sin(a) * sp;
    }
    const nx = esc.x + esc.vx * dt, ny = esc.y + esc.vy * dt;
    if (isOwned(Math.floor(nx / TILE), Math.floor((ny - 4) / TILE))) { esc.x = nx; esc.y = ny; }
    else { esc.vx = -esc.vx; esc.vy = -esc.vy; }
  }
}
function drawEscapes(time) {
  for (const esc of escapes.values()) {
    const c = { x: esc.x, y: esc.y, vx: esc.vx, vy: esc.vy, phase: 0 };
    drawIndividual(ctx, esc.ind, c, 0, time);
    esc.hx = c.hx; esc.hy = c.hy; esc.hw = c.hw; esc.hh = c.hh;
    if (Math.floor(time * 3) % 2) drawBubble("scared", esc.x, c.hy - 1);
  }
}
function catchEscapeAt(gx, gy) {
  for (const [id, esc] of escapes) {
    if (esc.hw && gx >= esc.hx - 3 && gx <= esc.hx + esc.hw + 3 && gy >= esc.hy - 3 && gy <= esc.hy + esc.hh + 3) {
      escapes.delete(id);
      state.stats.escapesCaught++;
      gainParkXp(20);
      sfx("pet");
      toast(`Caught ${esc.ind.name}! Back in the pen you go.`, 3000, esc.ind.k);
      return true;
    }
  }
  return false;
}

// ================= Eggs =================
function eggUnlocked(t) { return t === "regular" || isUnlocked("egg:" + t); }
function eggCostOf(t) { return Math.round(EGGS[t].base * Math.pow(EGGS[t].growth, state.eggCounts[t] || 0)); }
function freeEggsOf(t) { return t === "regular" ? state.freeEggs : t === "golden" ? state.freeGolden : 0; }

function rollEgg(t) {
  if (t === "golden") {
    const r = Math.random();
    const of = rar => VARIANT_KEYS.filter(k => VARIANTS[k].rarity === rar && k !== "scarcity");
    const key = r < 0.03 ? randItem(of("epic")) : r < 0.15 ? randItem(of("rare")) : r < 0.55 ? randItem(of("uncommon")) : pickEggVariant();
    return { key, shiny: 0.05 };
  }
  if (t === "cursed") {
    const total = CURSED_POOL.reduce((s, [, w]) => s + w, 0);
    let roll = Math.random() * total;
    for (const [k, w] of CURSED_POOL) { roll -= w; if (roll <= 0) return { key: k, shiny: 0.02, grumpy: true }; }
    return { key: "falsity", shiny: 0.02, grumpy: true };
  }
  return { key: pickEggVariant(), shiny: SHINY_CHANCE };
}

// ================= Daily reward =================
function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function checkDaily() {
  const today = dayKey(new Date());
  if (state.daily.last === today) return;
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  state.daily.streak = state.daily.last === yesterday ? state.daily.streak + 1 : 1;
  state.daily.last = today;
  const coins = DAILY_COINS_PER_LEVEL * state.level * Math.min(7, state.daily.streak);
  state.money += coins;
  state.totalEarned += coins;
  state.freeEggs++;
  let extra = "";
  if (state.daily.streak % 3 === 0) { state.freeGolden++; extra = " and a FREE golden egg"; }
  sfx("achievement");
  toast(`Daily reward (${state.daily.streak}-day streak): +${fmt(coins)} coins, a free egg${extra}!`, 7000, "prosperity");
}

// ================= Prestige =================
function shardsAvailable() { return Math.floor(Math.sqrt(Math.max(0, state.runEarned) / SHARD_DIVISOR)); }
async function doPrestige() {
  if (!isUnlocked("prestige")) return;
  const gain = shardsAvailable();
  if (gain < 1) return hintOnce("Earn more coins this run to get Truth Shards.");
  const yes = await ask({ title: "NEW SANCTUARY", ok: "Start over",
    text: `You keep: Variant Index, recipes, achievements and stats.\nYou lose: coins, park, variants, staff, land and park level.\n\nYou gain ${gain} Truth Shard${gain > 1 ? "s" : ""} (+${Math.round(gain * SHARD_BONUS * 100)}% income forever).` });
  if (!yes) return;
  const keep = {
    discovered: state.discovered, recipesKnown: state.recipesKnown, achievements: state.achievements,
    stats: state.stats, settings: state.settings, daily: state.daily, goal: state.goal,
    shards: state.shards + gain, totalEarned: state.totalEarned, worldClock: Math.floor(state.worldClock / CYCLE_SECS) * CYCLE_SECS + DAY_SECS + 1, seenVersion: state.seenVersion, tutorialDone: true,
  };
  state = Object.assign(defaultState(), keep);
  state.stats.prestiges++;
  visitors = []; floaters = []; particles = [];
  critterPos.clear(); escapes.clear();
  staffWalkers = []; cars = []; walkers = [];
  markWorldDirty();
  activeEvent = null; fx = null;
  fuseSel = [0, 0]; inspectedId = 0; selectedUid = 0;
  rebuildGrids();
  applyLocks();
  saveGame();
  sfx("fanfare", 5);
  toast(`A New Sanctuary begins! You now have ${state.shards} Truth Shard${state.shards > 1 ? "s" : ""}.`, 6000, "eternity");
  switchTab("park");
}

// ================= Snapshot =================
function downloadSnapshot() {
  const c = makeCanvas(canvas.width, canvas.height + 72);
  const g = c.getContext("2d");
  g.fillStyle = "#121124"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(canvas, 0, 0);
  g.fillStyle = "#ffd23f"; g.fillRect(0, canvas.height, c.width, 6);
  g.font = "22px 'Press Start 2P', monospace";
  g.fillStyle = "#ffd23f";
  g.textAlign = "left";
  g.fillText("VERITY SANCTUARY", 24, canvas.height + 48);
  g.textAlign = "right";
  g.fillStyle = "#f4f1ff";
  const placed = state.enclosures.reduce((s, e) => s + e.variants.length, 0);
  g.fillText(`LV ${state.level} · ${"★".repeat(starRating())} · ${placed} variants · ${discoveredCount()}/${VARIANT_KEYS.length} found`, c.width - 24, canvas.height + 48);
  const url = c.toDataURL("image/png");
  $("snap-img").src = url;
  $("snap-dialog").showModal();
  // Also try a direct download (works on normal websites; embedded viewers ignore it).
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `verity-sanctuary-${dayKey(new Date())}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) { /* the dialog still shows the picture */ }
}

// ================= Per-second hook =================
function systemsSecond() {
  tickCare();
  staffSecond();
  tickRequests();
  tickEscapes();
}

// ================= UI for systems =================
function careBars(ind) {
  const box = el("div", "bars");
  for (const [cls, label, val] of [["food", "Food", ind.food], ["joy", "Happy", ind.joy]]) {
    const row = el("div", "bar " + cls, label);
    const bar = el("div", "progress");
    const fill = el("div", "progress-fill");
    fill.style.width = Math.round(val) + "%";
    bar.appendChild(fill);
    row.appendChild(bar);
    box.appendChild(row);
  }
  return box;
}

let lastWeatherIcon = "";
function renderWorldInfo() {
  $("clock").textContent = clockText();
  $("weather-label").textContent = isNight() ? "Night" : WEATHER[weather].label;
  const icon = isNight() ? "moon" : WEATHER[weather].icon;
  if (icon !== lastWeatherIcon) { lastWeatherIcon = icon; $("weather-ico").style.backgroundImage = `url(${iconURL(icon)})`; }
}

function chip(label, sub, active, onClick, art, lockId) {
  const locked = lockId && !isUnlocked(lockId);
  const b = el("button", "chip" + (active ? " active" : "") + (locked ? " is-locked" : ""));
  if (art) b.appendChild(art);
  b.appendChild(document.createTextNode(label));
  if (locked) b.appendChild(el("small", "lock-tag", lvlTag(lockId)));
  else if (sub) b.appendChild(el("small", "", sub));
  b.addEventListener("click", () => { if (locked) return lockedClick(lockId, label); sfx("click"); onClick(); });
  return b;
}
// A close-up of a pen's top-left corner, so fence styles are easy to tell apart.
function fenceThumb(fenceKey, theme = "meadow") {
  const src = makeEncGround(3, theme, fenceKey), c = makeCanvas(24, 24), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, src.width * 12 / uW(src), src.height * 12 / uH(src), 0, 0, 24, 24);
  return c;
}
function thumb(src, w, h) {
  const c = makeCanvas(w, h);
  c.getContext("2d").drawImage(src, 0, 0, w, h);
  return c;
}

function renderBuildOptions() {
  const box = $("build-options");
  box.innerHTML = "";
  if (tool === "path") {
    const types = Object.keys(PATH_TYPES).map(Number);
    box.appendChild(el("h4", "", "PATH TYPE"));
    const chips = el("div", "chips");
    for (const t of types) chips.appendChild(chip(PATH_TYPES[t].label, `${PATH_TYPES[t].cost}c · ${PATH_TYPES[t].speed}x speed`, pathChoice === t, () => { pathChoice = t; renderUI(true); }, thumb(pathTiles[t], 16, 16), "path:" + t));
    box.appendChild(chips);
    box.hidden = false;
  } else if (tool === "enclosure") {
    const custom = encChoice.shape === "custom";
    box.appendChild(el("h4", "", "SHAPE"));
    const shapes = el("div", "chips");
    for (const k of Object.keys(ENC_TYPES)) shapes.appendChild(chip(`${ENC_TYPES[k].label} ${ENC_TYPES[k].size}x${ENC_TYPES[k].size}`, `holds ${ENC_TYPES[k].cap} · ${fmt(enclosureCost(k))}c`, !custom && encChoice.size === k, () => { encChoice.shape = "square"; encChoice.size = k; renderUI(true); }, null, "size:" + k));
    shapes.appendChild(chip("Custom shape", `paint up to ${customMaxTiles()} tiles`, custom, () => { encChoice.shape = "custom"; renderUI(true); }, null, "size:custom"));
    box.appendChild(shapes);
    if (custom) {
      const n = penDraft.size, problem = draftProblem();
      const panel = el("div", "pen-draft");
      panel.appendChild(el("p", "opt-desc", n ? `${n} tile${n > 1 ? "s" : ""} · holds ${capForTiles(n)} · appeal +${appealForTiles(n)} · ${fmt(customPenCost(n))}c` : "Click and drag on your grass to paint a pen. Click a painted tile to erase."));
      if (n && problem) panel.appendChild(el("p", "opt-desc warn", problem));
      const row = el("div", "tools");
      const buildBtn = el("button", "primary", n ? `Build pen (${fmt(customPenCost(n))}c)` : "Build pen");
      buildBtn.disabled = !n || !!problem || state.money < customPenCost(n) || buildLocked();
      buildBtn.addEventListener("click", buildCustomPen);
      const clear = el("button", "", "Clear");
      clear.disabled = !n;
      clear.addEventListener("click", () => { penDraft = new Set(); renderBuildOptions(); });
      row.appendChild(buildBtn); row.appendChild(clear);
      panel.appendChild(row);
      box.appendChild(panel);
    }
    box.appendChild(el("h4", "", "THEME"));
    const themes = el("div", "chips");
    for (const k of Object.keys(THEMES)) themes.appendChild(chip(THEMES[k].label, `x${THEMES[k].costMult} cost`, encChoice.theme === k, () => { encChoice.theme = k; renderUI(true); }, thumb(makeEncGround(3, k), 24, 24), "theme:" + k));
    box.appendChild(themes);
    box.appendChild(el("p", "opt-desc", THEMES[encChoice.theme].desc));
    box.appendChild(el("h4", "", "FENCE"));
    const fences = el("div", "chips");
    for (const k of Object.keys(FENCE_TYPES)) {
      const art = fenceThumb(k === "theme" ? THEME_FENCE[encChoice.theme] : k, encChoice.theme);
      fences.appendChild(chip(FENCE_TYPES[k].label, FENCE_TYPES[k].costMult === 1 ? "no extra" : `x${FENCE_TYPES[k].costMult} cost`, encChoice.fence === k, () => { encChoice.fence = k; renderUI(true); }, art, k === "theme" || k === "wood" ? null : "fence:" + k));
    }
    box.appendChild(fences);
    box.hidden = false;
  } else box.hidden = true;
}

function renderEggs() {
  $("free-eggs").textContent = state.freeEggs || state.freeGolden ? `${state.freeEggs + state.freeGolden} free` : "";
  const box = $("special-eggs");
  box.innerHTML = "";
  for (const t of ["golden", "cursed"]) {
    const locked = !eggUnlocked(t) && !(t === "golden" && state.freeGolden);
    const b = el("button", (t === "golden" ? "gold" : "curse") + (locked ? " is-locked" : ""));
    const i = el("i", "ico");
    i.style.backgroundImage = `url(${iconURL(t === "golden" ? "goldegg" : "cursedegg")})`;
    b.appendChild(i);
    const free = freeEggsOf(t);
    const txt = el("span", "", EGGS[t].label);
    txt.appendChild(locked ? el("small", "lock-tag", lvlTag("egg:" + t)) : el("small", "", free ? `FREE (${free})` : fmt(eggCostOf(t)) + "c"));
    b.appendChild(txt);
    b.title = locked ? `Unlocks at park level ${lvlNeeded("egg:" + t)}. ${EGGS[t].desc}` : EGGS[t].desc;
    b.disabled = !locked && (!!fx || (!free && state.money < eggCostOf(t)));
    b.addEventListener("click", () => locked ? lockedClick("egg:" + t, EGGS[t].label) : hatchEgg(t));
    box.appendChild(b);
  }
}

function renderRequest() {
  const card = $("request-card");
  card.hidden = false;
  const box = $("request");
  box.innerHTML = "";
  card.classList.toggle("card-locked", !isUnlocked("requests"));
  if (!isUnlocked("requests")) { box.appendChild(el("p", "empty", `Guests ask to see certain variants for big rewards. Unlocks at park level ${lvlNeeded("requests")}.`)); return; }
  const r = state.request;
  if (!r) { box.appendChild(el("p", "empty", "No requests right now. Check back soon!")); return; }
  const row = el("div", "row-item");
  row.appendChild(spriteImg(r.k));
  const g = el("div", "grow");
  g.appendChild(el("p", "request-text", `${r.who} wants to see ${r.n} ${VARIANTS[r.k].name}${r.n > 1 ? "s" : ""} in your park.`));
  const prog = el("div", "progress");
  const fill = el("div", "progress-fill");
  fill.style.width = Math.min(100, requestProgress() / r.n * 100) + "%";
  prog.appendChild(fill);
  g.appendChild(prog);
  g.appendChild(el("p", "small", `${Math.min(requestProgress(), r.n)}/${r.n} on display · ${Math.max(0, Math.ceil((r.until - Date.now()) / 60000))} min left · reward ${fmt(r.reward)}c + ${r.xp} XP`));
  row.appendChild(g);
  box.appendChild(row);
}

function renderStaff() {
  const types = Object.keys(STAFF);
  const card = $("staff-card");
  card.hidden = false;
  $("wages").textContent = wagesPerSec() ? `-${fmtVal(wagesPerSec())}c/s` : "";
  const box = $("staff");
  box.innerHTML = "";
  for (const t of types) {
    const def = STAFF[t];
    const row = el("div", "row-item" + (isUnlocked("staff:" + t) ? "" : " is-locked"));
    row.appendChild(thumb(STAFF_SPR[t], t === "mascot" ? 18 : 7, t === "mascot" ? 25 : 11));
    if (!isUnlocked("staff:" + t)) {
      const g = el("div", "grow");
      g.appendChild(el("b", "", def.label));
      g.appendChild(document.createTextNode(def.desc));
      row.appendChild(g);
      const b = el("button", "", lvlTag("staff:" + t));
      b.addEventListener("click", () => lockedClick("staff:" + t, def.label));
      row.appendChild(b);
      box.appendChild(row);
      continue;
    }
    const g = el("div", "grow");
    g.appendChild(el("b", "", `${def.label} ×${staffCount(t)}`));
    g.appendChild(document.createTextNode(`${def.desc} Wage ${def.wage}c/s.`));
    row.appendChild(g);
    const hire = el("button", "primary", staffCount(t) >= def.max ? "Max" : `Hire ${fmt(hireCost(t))}c`);
    hire.disabled = staffCount(t) >= def.max || state.money < hireCost(t);
    hire.addEventListener("click", () => hireStaff(t));
    row.appendChild(hire);
    if (staffCount(t)) {
      const fire = el("button", "", "Fire");
      fire.addEventListener("click", () => fireStaff(t));
      row.appendChild(fire);
    }
    box.appendChild(row);
  }
}

function renderLand() {
  const forSale = PLOT_KEYS.filter(plotForSale);
  const later = PLOT_KEYS.filter(k => !state.plots[k] && !plotForSale(k)).sort((a, b) => PLOTS[a].level - PLOTS[b].level);
  const card = $("land-card");
  card.hidden = !forSale.length && !later.length;
  if (card.hidden) return;
  const box = $("land");
  box.innerHTML = "";
  for (const k of forSale) {
    const p = PLOTS[k];
    const row = el("div", "row-item");
    const g = el("div", "grow");
    g.appendChild(el("b", "", p.label));
    g.appendChild(document.createTextNode(`${p.tiles} tiles of ${BIOME_LABELS[p.biome]}. Look for the FOR SALE sign.`));
    row.appendChild(g);
    const b = el("button", "primary build-only", `Buy ${fmt(p.cost)}c`);
    b.disabled = state.money < p.cost || isOpen();
    const go = el("button", "", "Show");
    go.addEventListener("click", () => showPlot(k));
    row.appendChild(go);
    b.addEventListener("click", () => buyPlot(k));
    row.appendChild(b);
    box.appendChild(row);
  }
  for (const k of later) {
    const p = PLOTS[k];
    const row = el("div", "row-item is-locked");
    const g = el("div", "grow");
    g.appendChild(el("b", "", p.label));
    g.appendChild(document.createTextNode(`${p.tiles} tiles of ${BIOME_LABELS[p.biome]} · ${fmt(p.cost)}c`));
    row.appendChild(g);
    const go = el("button", "", "Show");
    go.addEventListener("click", () => showPlot(k));
    row.appendChild(go);
    const b = el("button", "", `LV ${p.level}`);
    b.addEventListener("click", () => lockedClick("plot:" + k, p.label));
    row.appendChild(b);
    box.appendChild(row);
  }
}

// "Show" on a plot: fly the camera there and flash the whole plot in yellow for a few seconds.
let plotFlash = null;
function showPlot(k) {
  const tiles = [];
  const pi = PLOT_KEYS.indexOf(k);
  for (let i = 0; i < PLOT_MAP.length; i++) if (PLOT_MAP[i] === pi) tiles.push([i % COLS, Math.floor(i / COLS)]);
  const xs = tiles.map(t => t[0]), ys = tiles.map(t => t[1]);
  const fit = Math.min(view.cssW / ((Math.max(...xs) - Math.min(...xs) + 6) * TILE), view.cssH / ((Math.max(...ys) - Math.min(...ys) + 6) * TILE));
  if (fit < view.zoom) setZoom(fit);
  centerOn((Math.min(...xs) + Math.max(...xs) + 1) / 2 * TILE, (Math.min(...ys) + Math.max(...ys) + 1) / 2 * TILE);
  plotFlash = { tiles, until: performance.now() + 5000 };
  sfx("click");
}
function drawPlotFlash(time) {
  if (!plotFlash) return;
  const left = plotFlash.until - performance.now();
  if (left <= 0) { plotFlash = null; return; }
  const a = Math.min(1, left / 800) * (0.32 + 0.14 * Math.sin(time * 6));
  ctx.fillStyle = `rgba(255,210,63,${a})`;
  for (const [x, y] of plotFlash.tiles) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  ctx.globalAlpha = Math.min(1, left / 800);
  outlineCells(plotFlash.tiles, "#ffd23f");
  ctx.globalAlpha = 1;
}

function renderPrestige() {
  const card = $("prestige-card");
  card.hidden = false;
  card.classList.toggle("card-locked", !isUnlocked("prestige") && !state.shards);
  $("shards").textContent = `${state.shards} shard${state.shards === 1 ? "" : "s"}`;
  const box = $("prestige");
  box.innerHTML = "";
  box.appendChild(el("p", "small", `Truth Shards give +${Math.round(SHARD_BONUS * 100)}% income each, forever. Current bonus: +${Math.round(state.shards * SHARD_BONUS * 100)}%.`));
  box.appendChild(el("p", "small", "Starting over keeps your Variant Index, recipes, achievements and stats. Everything else resets."));
  const gain = shardsAvailable();
  const b = el("button", "big", "");
  b.appendChild(el("span", "", !isUnlocked("prestige") ? `Unlocks at park level ${lvlNeeded("prestige")}` : gain ? `Start a New Sanctuary (+${gain} shard${gain > 1 ? "s" : ""})` : "Earn more coins to get shards"));
  b.disabled = !gain || !isUnlocked("prestige");
  b.addEventListener("click", doPrestige);
  box.appendChild(b);
  const next = Math.pow(gain + 1, 2) * SHARD_DIVISOR;
  box.appendChild(el("p", "small", `Coins earned this run: ${fmt(state.runEarned)}. Next shard at ${fmt(next)}.`));
}

const BIOME_LABELS = { meadow: "meadow", oak: "oak forest", pine: "pine forest", birch: "birch woods", autumn: "autumn forest", mushroom: "mushroom grove", rocky: "rocky hills", flower: "flower thicket", swamp: "swamp", jungle: "jungle", snow: "snowy forest", cherry: "cherry blossom grove" };

function renderParking() {
  const box = $("parking");
  if (!box) return;
  box.innerHTML = "";
  const lvl = lotLevel(), cur = LOT_LEVELS[lvl - 1];
  const parked = cars.filter(c => c.state === "parked").length;
  $("lot-level").textContent = "LV " + lvl;
  box.appendChild(el("p", "small", `${cur.spaces} spaces (${parked} in use) · room for up to ${maxGuests()} guests at once.`));
  const next = LOT_LEVELS[lvl];
  if (!next) { box.appendChild(el("p", "small", "Your parking lot is fully upgraded.")); return; }
  if (!isUnlocked("lot:" + (lvl + 1))) {
    const lb = el("button", "wide is-locked build-only", `Upgrade to ${next.spaces} spaces · LV ${lvlNeeded("lot:" + (lvl + 1))}`);
    lb.addEventListener("click", () => lockedClick("lot:" + (lvl + 1), "The next parking upgrade"));
    box.appendChild(lb);
    return;
  }
  if (dayLocked()) { box.appendChild(el("p", "small", `Next: ${next.spaces} spaces for ${fmt(next.cost)}c. Upgrade at night while the park is closed.`)); return; }
  const b = el("button", "wide primary", `Upgrade to ${next.spaces} spaces (${fmt(next.cost)}c)`);
  b.disabled = state.money < next.cost;
  b.addEventListener("click", upgradeLot);
  box.appendChild(b);
}
