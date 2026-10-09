"use strict";

// ================= Admin panel =================
// Cheats for testing, behind a passcode. The passcode lives in this file, so anyone who
// reads the source can find it: it keeps players out by accident, not on purpose.
const ADMIN_PASSCODE = "boobity";
const admin = { unlocked: false, freeze: false, freeBuild: false };

async function openAdmin() {
  if (!admin.unlocked) {
    const code = await ask({ title: "ADMIN PANEL", text: "Enter the passcode.", ok: "Unlock", input: "", password: true });
    if (code === null) return;
    if (code.trim().toLowerCase() !== ADMIN_PASSCODE) { sfx("fail"); toast("Wrong passcode.", 2500); return; }
    admin.unlocked = true;
    sfx("achievement");
  }
  renderAdmin();
  $("admin-dialog").showModal();
}

function adminDone(msg) {
  sfx("click");
  if (msg) toast(msg, 2200);
  checkProgress && checkProgress();
  applyLocks(); rebuildGrids(); markWorldDirty();
  renderShop(); renderUI(true);
  renderAdmin();
}

function renderAdmin() {
  const box = $("admin-body");
  box.innerHTML = "";
  const section = (title) => { const s = el("section", "admin-sec"); s.appendChild(el("h4", "", title)); const row = el("div", "admin-row"); s.appendChild(row); box.appendChild(s); return row; };
  const btn = (row, label, fn, cls = "") => { const b = el("button", cls, label); b.addEventListener("click", fn); row.appendChild(b); return b; };
  const toggle = (row, label, key, onChange) => {
    const l = el("label", "check");
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = admin[key];
    c.addEventListener("change", () => { admin[key] = c.checked; if (onChange) onChange(); adminDone(); });
    l.appendChild(c); l.appendChild(document.createTextNode(" " + label)); row.appendChild(l);
  };

  let r = section(`COINS · ${fmt(state.money)}`);
  for (const [label, n] of [["+1K", 1e3], ["+100K", 1e5], ["+10M", 1e7]]) btn(r, label, () => { state.money += n; state.totalEarned += n; adminDone(`+${fmt(n)} coins`); });
  btn(r, "Set to 0", () => { state.money = 0; adminDone(); });

  r = section(`PARK LEVEL · ${state.level}`);
  btn(r, "-1", () => { state.level = Math.max(1, state.level - 1); state.xp = 0; adminDone(); });
  btn(r, "+1", () => { state.level = Math.min(MAX_PARK_LEVEL, state.level + 1); state.xp = 0; adminDone(`Park level ${state.level}`); });
  btn(r, "Max level", () => { state.level = MAX_PARK_LEVEL; state.xp = 0; adminDone("Everything unlocked"); });
  btn(r, "+1,000 XP", () => { gainParkXp(1000); adminDone(); });

  r = section(`TIME · ${clockText()}`);
  btn(r, "Open park (8 AM)", () => { openNow(); adminDone(); });
  btn(r, "Close park (10 PM)", () => { if (isOpen()) { state.worldClock = Math.floor(state.worldClock / CYCLE_SECS) * CYCLE_SECS + DAY_SECS; closeDay(); } adminDone(); });
  btn(r, "+1 hour", () => { const wasOpen = isOpen(); state.worldClock += CYCLE_SECS / 24; if (wasOpen && !isOpen()) closeDay(); else if (!wasOpen && isOpen()) openDay(); adminDone(); });
  r = section("RULES");
  toggle(r, "Freeze the clock", "freeze");
  toggle(r, "Build any time (even while open)", "freeBuild");

  r = section("VARIANTS");
  btn(r, "Discover all", () => { for (const k of VARIANT_KEYS) state.discovered[k] = true; adminDone("Every variant discovered"); });
  const sel = document.createElement("select");
  for (const k of VARIANT_KEYS) { const o = document.createElement("option"); o.value = k; o.textContent = VARIANTS[k].name; sel.appendChild(o); }
  r.appendChild(sel);
  const shinyL = el("label", "check"); const shiny = document.createElement("input"); shiny.type = "checkbox"; shinyL.appendChild(shiny); shinyL.appendChild(document.createTextNode(" shiny")); r.appendChild(shinyL);
  btn(r, "Give", () => {
    const ind = makeIndividual(sel.value, state, { shinyChance: shiny.checked ? 1 : 0 });
    state.inventory.push(ind); state.discovered[sel.value] = true;
    adminDone(`${VARIANTS[sel.value].name} added to the incubator`);
  }, "primary");
  r = section("EGGS & CARE");
  btn(r, "+5 free eggs", () => { state.freeEggs += 5; adminDone(); });
  btn(r, "+3 golden eggs", () => { state.freeGolden += 3; adminDone(); });
  btn(r, "Feed & cheer everyone", () => { for (const e of state.enclosures) for (const ind of e.variants) { ind.food = 100; ind.joy = 100; } adminDone("Everyone is full and happy"); });

  r = section("LAND & PARKING");
  btn(r, "Own all land", () => { for (const k of PLOT_KEYS) state.plots[k] = true; adminDone("All land is yours"); });
  btn(r, "Max parking lot", () => { state.lotLevel = LOT_LEVELS.length; adminDone(); });

  r = section("EVENTS & WEATHER");
  for (const t of ["viral", "song", "tug", "parade"]) btn(r, t[0].toUpperCase() + t.slice(1), () => { if (activeEvent) return toast("An event is already running.", 2000); if (!startEvent(t)) toast("Needs variants on display (and a Verity for the song).", 2600); adminDone(); });
  const wsel = document.createElement("select");
  for (const k of Object.keys(WEATHER)) { const o = document.createElement("option"); o.value = k; o.textContent = WEATHER[k].label; o.selected = k === weather; wsel.appendChild(o); }
  wsel.addEventListener("change", () => { weather = wsel.value; weatherTimer = 300; adminDone(); });
  r.appendChild(wsel);

  r = section("MISC");
  btn(r, "Clean all trash", () => { state.trash = []; adminDone(); });
  btn(r, "Replay tutorial", () => { $("admin-dialog").close(); switchTab("park"); startTutorial(); });
  btn(r, "Lock admin panel", () => { admin.unlocked = false; admin.freeze = false; admin.freeBuild = false; $("admin-dialog").close(); toast("Admin panel locked.", 2000); });
}

$("admin-btn").addEventListener("click", openAdmin);
