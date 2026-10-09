"use strict";

// ================= Help: cycling tips & hover explanations =================
// The bar under the map cycles through game tips. Tool instructions and warnings take it
// over for a few seconds, then the tips come back. Hovering over things (on the map with
// Inspect selected, or anywhere in the menus) shows a short explanation.

// ---- tips ----
// only: "pro" or "simple" limits a tip to one game mode
const GAME_TIPS = [
  { t: "Guests only walk on paths. Make sure every pen touches one." },
  { t: "Each guest pays once for every pen they walk past, so put pens beside busy paths." },
  { t: "Snack stands sell to guests who walk right past them. Put them where the crowds go." },
  { t: "Decorations raise your appeal, and more appeal brings more guests." },
  { t: "Some variants love certain pen themes and earn +50% there. Check a theme's \"Loved by\" list." },
  { t: "Fuse two variants in the Lab to discover new ones. Every recipe you find is saved." },
  { t: "The Guest Feedback card shows what guests want you to fix." },
  { t: "Variants gain XP while on display. Each level makes them worth 10% more." },
  { t: "Pet your variants: click one with Inspect, then press Pet." },
  { t: "Join paths up into loops. Dead ends make guests double back and get bored." },
  { t: "Rarer variants earn far more. Golden eggs have much better odds." },
  { t: "Influencers can make a variant go viral, tripling what it earns for a while." },
  { t: "When Pirate Clark turns up, click him fast or he drags a variant into the Backrooms!" },
  { t: "Visitor requests ask for certain variants. Put them on display for a big reward." },
  { t: "Stuck? The goal under the map always has a next step and a reward." },
  { t: "Buy wild land to grow your sanctuary. New plots go on sale as your park levels up." },
  { t: "Bigger pens hold more variants and add appeal." },
  { t: "Rest your mouse on anything for 5 seconds to learn what it is. You can turn this off in Settings." },
  { t: "Use the button above the map to open early or close early." },
  { t: "Building tools lock while the park is open. Build at night, earn by day.", only: "pro" },
  { t: "Hungry variants earn less. Feed them, or hire keepers to do it for you.", only: "pro" },
  { t: "Litter spoils guests' visits. Janitors sweep it up.", only: "pro" },
  { t: "Your gold pile has a limit. Upgrade it at night, or extra coins are lost.", only: "pro" },
  { t: "A bigger car park lets more guests visit at once.", only: "pro" },
  { t: "Escaped variants scare guests. Click them to catch them.", only: "pro" },
  { t: "Custom pens can be painted in any shape you like.", only: "pro" },
  { t: "In Simple mode you can build at any time, even with guests in the park.", only: "simple" },
  { t: "Your car park grows by itself as your park levels up.", only: "simple" },
];
const TIP_SECS = 9;
let tipIndex = Math.floor(Math.random() * GAME_TIPS.length), tipClock = 0, showingTip = false;
const modeTips = () => GAME_TIPS.filter(x => !x.only || x.only === (isSimple() ? "simple" : "pro"));

function showTip(step = 0) {
  const tips = modeTips();
  tipIndex = ((tipIndex + step) % tips.length + tips.length) % tips.length;
  const box = $("hint");
  box.innerHTML = "";
  box.appendChild(el("b", "tip-tag", "TIP"));
  box.appendChild(document.createTextNode(tips[tipIndex].t));
  box.classList.remove("tip-in");
  void box.offsetWidth;   // restart the fade-in
  box.classList.add("tip-in");
  showingTip = true;
  tipClock = 0;
}
// A message that takes over the bar for a while (tool instructions, warnings).
function showHint(msg, secs = 3) {
  const box = $("hint");
  box.classList.remove("tip-in");
  box.textContent = msg;
  hintTimer = secs;
  showingTip = false;
}
function updateHintBar(dt) {
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) showTip(1); return; }
  if (!showingTip) { showTip(0); return; }
  tipClock += dt;
  if (tipClock >= TIP_SECS) showTip(1);
}
$("hint").parentElement.addEventListener("click", () => { if (showingTip) showTip(1); });   // click for the next tip

// ---- tooltips ----
const tipBox = document.createElement("div");
tipBox.id = "tooltip";
tipBox.className = "tooltip";
tipBox.hidden = true;
document.body.appendChild(tipBox);
const canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;
const tipsOn = () => canHover && state.settings.hoverTips !== false;

function showTooltip(title, text, x, y) {
  tipBox.innerHTML = "";
  if (title) tipBox.appendChild(el("b", "", title));
  if (text) tipBox.appendChild(el("span", "", text));
  tipBox.hidden = false;
  moveTooltip(x, y);
}
function moveTooltip(x, y) {
  if (tipBox.hidden) return;
  const w = tipBox.offsetWidth, h = tipBox.offsetHeight, m = 8;
  let px = x + 16, py = y + 18;
  if (px + w > innerWidth - m) px = x - w - 12;
  if (py + h > innerHeight - m) py = y - h - 12;
  tipBox.style.left = Math.max(m, px) + "px";
  tipBox.style.top = Math.max(m, py) + "px";
}
function hideTooltip() { tipBox.hidden = true; }

// Explanations wait until the pointer has rested on the same thing for a while, so they
// don't pop up while you're just moving the mouse around.
const HOVER_DELAY_MS = 5000;
let hoverKey = "", hoverTimer = 0, hoverAt = [0, 0];
function hoverTip(key, title, text, x, y) {
  hoverAt = [x, y];
  if (key === hoverKey) { moveTooltip(x, y); return; }
  cancelTip();
  hoverKey = key;
  hoverTimer = setTimeout(() => { if (hoverKey === key) showTooltip(title, text, hoverAt[0], hoverAt[1]); }, HOVER_DELAY_MS);
}
function cancelTip() {
  clearTimeout(hoverTimer);
  hoverKey = "";
  hideTooltip();
}

// Explanations for parts of the interface, by CSS selector. Text can depend on the mode.
const UI_TIPS = [
  [".lvl-box", "Park level", () => "Earn XP from guests, hatching, building, goals and achievements. Every level unlocks something new."],
  [".stat.coins", "Coins", () => isSimple() ? "Spend them on pens, eggs, shops, decor and land." : `Your coins live in the gold pile by the gate. It holds ${fmt(bankCap())}; coins beyond that are lost, so upgrade it at night.`],
  [".stat:has(#rate)", "Coins per second", () => "What your park earned per second over the last minute: tickets, pens, snacks and abilities."],
  [".stat:has(#visitors)", "Visitors", () => `Guests in the park right now. Up to ${maxGuests()} at once, limited by the car park.`],
  [".stat:has(#appeal)", "Appeal", () => "How attractive your park is. Variants, bigger pens, decor and stands all add to it. More appeal brings more guests."],
  [".stat:has(#stars)", "Rating", () => "Stars based on your appeal. Each star raises the ticket price guests pay at the gate."],
  ["#hours-bar", "Opening hours", () => isSimple() ? "The park is open 8 AM to 10 PM. In Simple mode you can build at any time." : "The park is open 8 AM to 10 PM. Building, shops and moving variants unlock at night while it's closed."],
  [".world-info", "Time and weather", () => "Rain and storms bring fewer guests and dampen their mood, but Humidity loves it."],
  ["#park-info", "Your park", () => "Pens built, variants on display, and guests in the park out of the most it can hold."],
  ['.tab[data-tab="park"]', "Park", () => "Build, shop, hatch eggs and manage your sanctuary."],
  ['.tab[data-tab="lab"]', "Fusion Lab", () => isUnlocked("lab") ? "Fuse two variants to discover new ones." : `Fuse two variants to discover new ones. Unlocks at park level ${lvlNeeded("lab")}.`],
  ['.tab[data-tab="index"]', "Variant Index", () => "Every variant you've discovered, their abilities, and the recipes you've found."],
  ['.tab[data-tab="goals"]', "Goals", () => "Goals, achievements and your park level. Each achievement adds +2% income."],
  ['.tab[data-tab="save"]', "Save & settings", () => "Save, export or reset your park, change settings and read the patch notes."],
  ['.tool[data-tool="inspect"]', "Inspect", () => "Click a variant for a close-up, or a pen to manage it. Hover over the map to learn what things are."],
  ['.tool[data-tool="path"]', "Path", () => "Click or drag to lay paths. Guests only walk on paths, so connect every pen and stand."],
  ['.tool[data-tool="enclosure"]', "Enclosure", () => "Build a pen for your variants. It earns when guests walk past, so build it beside a path."],
  ['.tool[data-tool="bulldoze"]', "Bulldoze", () => "Remove paths, pens, stands and decor. You get half the cost back."],
  ["#hatch", "Hatch an egg", () => "Buy an egg to get a random variant. Most are common, a few are rare, and 1% are shiny."],
  ["#request-card h2", "Visitor requests", () => "Now and then a guest asks to see certain variants. Put them on display before time runs out for a big reward."],
  ["#feedback-card h2", "Guest feedback", () => "What guests thought of today's visit. Fix their top complaints to keep them happy."],
  ["#staff-card h2", "Staff", () => "Janitors sweep litter, keepers feed hungry pens, and the mascot cheers guests up. Staff are paid wages every second."],
  ["#parking-card h2", "Parking lot", () => "Every guest arrives by car, so parking spaces limit how many guests can visit at once."],
  ["#bank-card h2", "Gold pile", () => "Where your coins are kept. Coins beyond its limit are lost, so upgrade it as you earn more."],
  [".goal-strip", "Goal", () => "Your next goal. Complete it for coins and park XP."],
  ["#minimap", "Minimap", () => "The whole world. Click or drag to jump there."],
  [".hint-bar", "Tips", () => "Game tips, plus instructions for the tool you're using. Click for the next tip."],
];

function uiTipFor(target) {
  // our own explanations first (on the element or any parent), then the nearest title
  for (let n = target; n && n !== document.body; n = n.parentElement) {
    if (n.matches) for (const [sel, title, fn] of UI_TIPS) {
      try { if (n.matches(sel)) return { title, text: fn() }; } catch (e) { /* :has unsupported */ }
    }
  }
  for (let n = target; n && n !== document.body; n = n.parentElement) {
    if (n.title) {   // plain title attributes become our tooltip (and skip the browser's own)
      n.dataset.tip = n.title;
      n.removeAttribute("title");
    }
    if (n.dataset && n.dataset.tip) return { title: n.dataset.tipTitle || "", text: n.dataset.tip };
  }
  return null;
}
document.addEventListener("mouseover", e => {
  if (!tipsOn() || e.target === canvas || document.getElementById("loader")) return;
  const tip = uiTipFor(e.target);
  if (tip) hoverTip(tip.title + "|" + tip.text, tip.title, tip.text, e.clientX, e.clientY);
  else cancelTip();
});
document.addEventListener("mousemove", e => { if (e.target !== canvas) { hoverAt = [e.clientX, e.clientY]; moveTooltip(e.clientX, e.clientY); } });
document.addEventListener("mouseleave", cancelTip);
document.addEventListener("pointerdown", e => { if (e.target !== canvas) cancelTip(); });
window.addEventListener("scroll", cancelTip, true);

// ---- what's on the map under the cursor ----
function explainAt(p) {
  const { gx, gy, x, y } = p;
  const near = (ax, ay, r) => Math.abs(ax - gx) <= r && Math.abs(ay - gy) <= r;
  const cid = critterAt(gx, gy);
  if (cid) {
    const f = findInd(cid), ind = f.ind, def = VARIANTS[ind.k];
    return [`${ind.name} the ${def.name}`, `${RARITY[def.rarity].label}, level ${levelOf(ind)}. ${def.ability} Click for a close-up.`];
  }
  for (const esc of escapes.values()) if (near(esc.x, esc.y - 6, 9)) return [`${esc.ind.name} escaped!`, "Escaped variants scare guests. Click it to catch it and send it home."];
  for (const v of visitors) {
    const [fx_, fy_] = visitorFeet(v);
    if (Math.abs(fx_ - gx) <= 6 && gy <= fy_ + 1 && gy >= fy_ - 15) {
      const type = { critic: "A food critic. Leaves a star review on the way out.", influencer: "An influencer. Might make a variant go viral.", kid: "A kid. Loves snacks." }[v.type] || "A guest.";
      const doing = v.leaving ? "Heading home to their car." : `Seen ${v.pensSeen} pen${v.pensSeen === 1 ? "" : "s"} so far. Mood ${v.mood >= 60 ? "great" : v.mood >= 30 ? "okay" : "fed up"}.`;
      return ["Guest", `${type} ${doing}`];
    }
  }
  for (const w of staffWalkers) {
    const wx = (w.tx + (w.nx - w.tx) * w.prog) * TILE + 8, wy = (w.ty + (w.ny - w.ty) * w.prog) * TILE + 8;
    if (near(wx, wy, 7)) return [STAFF[w.type].label, STAFF[w.type].desc];
  }
  for (const sec of securities) if (near(sec.c.x, sec.c.y - 4, 8)) return ["Security", "Guards the gold pile, day and night."];
  if (!inBounds(x, y)) return ["The city", "The town around your sanctuary. Some of its people visit as guests."];
  if (trashIndexAt(x, y) >= 0) return ["Litter", "Dropped by guests. It spoils their visit. Janitors sweep it up, and the night crew clears half each night."];
  const eid = encAt(x, y);
  if (eid) {
    const e = getEnc(eid), lost = isLost(e);
    return [`Enclosure #${encNumber(e)}`, lost ? "Closed: a variant got dragged into the Backrooms. It reopens soon."
      : `${encLabel(e)}, ${THEMES[e.theme].label} theme. ${e.variants.length}/${capOf(e)} variants. Guests pay to see it as they walk past. Click to manage it.`];
  }
  const oid = objAt(x, y);
  if (oid) {
    const def = OBJECTS[getObj(oid).t];
    return [def.name, def.kind === "stand" ? `Guests who walk right past buy a snack for ${def.price} coins.` : `Decoration: +${def.appeal} appeal, which brings more guests.`];
  }
  if (isVault(x, y)) return ["The gold pile", isSimple() ? "All your coins, guarded by the Securities. It never fills up." : `All your coins, guarded by the Securities. Holds ${fmt(bankCap())} coins; upgrade it at night to keep more.`];
  if (x === GATE.x && y === GATE.y) return ["The front gate", "Guests pay for their ticket here. Better ratings mean pricier tickets."];
  if (isPath(x, y)) return [`${PATH_TYPES[state.tiles[idx(x, y)]].label} path`, "Guests only walk on paths. They see the pens, stands and decor right beside them."];
  const lot = LOT_LEVELS[lotLevel() - 1].rect;
  if (x >= lot[0] && x <= lot[2] && y >= lot[1] && y <= lot[3]) return ["Car park", `Guests arrive by car. ${LOT_LEVELS[lotLevel() - 1].spaces} spaces, room for ${maxGuests()} guests at once.`];
  if (x < OX) return ["Main road", "Cars and pedestrians pass by. Some of them stop to visit."];
  const k = plotOf(x, y);
  if (k && !state.plots[k]) return [PLOTS[k].label, plotForSale(k) ? `Wild land for sale: ${fmt(PLOTS[k].cost)} coins. Click it to buy, then build on it.` : `Wild land. Goes on sale at park level ${lvlNeeded("plot:" + k)}.`];
  return ["Your land", "Open grass. Build pens, shops and decor here."];
}

canvas.addEventListener("pointermove", e => {
  if (!tipsOn() || e.pointerType !== "mouse" || tool !== "inspect" || e.buttons || document.querySelector("dialog[open]") || tutorialActive()) { cancelTip(); return; }
  const info = explainAt(worldFromEvent(e));
  if (!info) { cancelTip(); return; }
  hoverTip("map|" + info[0], info[0], info[1], e.clientX, e.clientY);   // keyed by the thing, so live numbers don't restart the wait
});
canvas.addEventListener("pointerleave", cancelTip);
canvas.addEventListener("pointerdown", cancelTip);
