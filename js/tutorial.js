"use strict";

// ================= Tutorial =================
// A short guided tour for new players. It points at one part of the screen per step,
// some steps ask the player to try something, and it can be skipped at any time.
// The world clock is paused while it runs so the first night doesn't slip away.

const tutPark = n => `.page[data-page="park"] > .card:nth-of-type(${n})`;
// Two tours share these steps. tour: "basic" or "advanced" limits a step to one of them,
// pro: true to Pro mode. text can be a function, for wording that depends on the tour.
const isAdvTour = () => tut.tour === "advanced";
const TUT_STEPS = [
  { title: "Welcome!", target: null,
    text: () => "This is your Verity Sanctuary. Collect Verity variants, give them homes, and earn coins from the guests who come to see them. " +
      (isAdvTour() ? "This full tour covers every part of the game and takes about five minutes." : "This quick tour takes about a minute.") },
  { title: "Look around", target: "#game", task: "Move or zoom the camera",
    text: "Drag the map, or use the arrow keys or WASD, to move around. Scroll or press - and + to zoom. Click the minimap in the corner to jump anywhere.",
    enter: s => { s.view = [view.x, view.y, view.zoom]; },
    done: s => Math.abs(view.x - s.view[0]) + Math.abs(view.y - s.view[1]) > 8 || view.zoom !== s.view[2] },
  { title: "Day and night", target: "#hours-bar",
    text: "The park is open from 8 AM to 10 PM and closed at night. Night is when you build. The clock is paused until this tour ends.",
    simpleText: "The park is open from 8 AM to 10 PM and closed at night. You can build at any time. The clock is paused until this tour ends." },
  { title: "Build your first pen", tab: "park", target: "#game", task: "Build an enclosure",
    text: "Your park is empty! The Enclosure tool is ready: click the grass right beside the path to build your first pen. Pens must touch a path. A Small pen costs 100 coins.",
    enter: s => {
      s.pens = state.enclosures.length;
      s.already = !state.tutorialDone && s.pens > 0;   // first tour: they got ahead of us
      encChoice.shape = "square"; encChoice.size = "small";
      setCollapsed(document.querySelector(tutPark(1)), false);   // show the Build card
      if (!buildLocked()) setTool("enclosure");
      centerOn((GATE.x + 6) * TILE, (GATE.y - 2) * TILE);
      renderUI(true);
    },
    done: s => s.already || state.enclosures.length > s.pens },
  { title: "Hatch an egg", tab: "park", target: "#hatch", task: "Hatch an egg",
    text: "Every variant starts as an egg. Your first egg always hatches a Verity. After that most are common, but you might get lucky.",
    enter: s => { s.hatched = state.stats.hatched; s.already = !state.tutorialDone && s.hatched > 0; },
    done: s => s.already || state.stats.hatched > s.hatched },
  { title: "Give it a home", target: "#game", task: "Place a variant in your enclosure",
    text: "New variants wait in the Incubator. Pick one, then click your enclosure on the map to put it inside. Each pen has limited space, so build more as you grow.",
    enter: s => {
      s.placed = tutPlacedCount();
      s.already = !state.tutorialDone && s.placed > 0 && !state.inventory.length;
      const e = state.enclosures[0];
      if (e) centerOn((e.x + encW(e) / 2) * TILE, (e.y + encH(e) / 2) * TILE);
      if (state.inventory.length && !buildLocked()) { setTool("place"); selectedUid = state.inventory[0].id; renderUI(true); }
    },
    done: s => s.already || tutPlacedCount() > s.placed },
  { title: "Build your park", tab: "park", target: tutPark(1),
    text: "At night, lay paths so guests can walk to your pens, and build new enclosures. Pens and stands must touch a path. Bulldozing refunds half the cost. These tools lock while the park is open.",
    simpleText: "Lay paths so guests can walk to your pens, and build new enclosures. Pens and stands must touch a path. Bulldozing refunds half the cost." },
  { title: "Paths", tab: "park", target: tutPark(1), tour: "advanced", pro: true,
    text: "Paths come in three kinds: Dirt, then Stone (level 5) and Yellow Brick (level 10). Faster paths let guests see more and add a little appeal." },
  { title: "Pen sizes and themes", tab: "park", target: tutPark(1), tour: "advanced",
    text: "Pick Enclosure to choose a size (Small 4x4, Medium 12x12, Large 20x20) and a theme. Bigger pens hold more and add appeal. Some variants love certain themes and earn +50% there. You can also paint custom-shaped pens, choose fences, and remodel a pen later.",
    simpleText: "Pick Enclosure to choose a size (Small 4x4, Medium 12x12, Large 20x20) and a theme. Bigger pens hold more and add appeal. Some variants love certain themes and earn +50% there." },
  { title: "Shops and decor", tab: "park", target: tutPark(2),
    text: "Snack stands sell to guests walking right past, so they must touch a path. Decorations can go anywhere and raise your park's appeal, which brings in more visitors." },
  { title: "Keep them happy", target: "#game",
    text: "With Inspect selected, click any variant to see it up close, feed it and pet it. Fed, happy variants earn more coins.",
    simpleText: "With Inspect selected, click any variant to see it up close and pet it. Each one has its own ability." },
  { title: "Variant close-ups", target: "#game", tour: "advanced",
    text: "In a close-up you can pet, rename, move a variant to another pen, or release it for coins. Variants gain XP while on display, and each level makes them worth 10% more." },
  { title: "Feeding", target: "#game", tour: "advanced", pro: true,
    text: "From level 3, variants get hungry. Hungry variants earn less: feed a whole pen from its card for a few coins, or hire keepers to do it." },
  { title: "Managing a pen", target: "#game", tour: "advanced",
    text: "With Inspect, click a pen to see what it earns, its appeal, and who lives there. Pens with no path beside them earn nothing." },
  { title: "Eggs", tab: "park", target: "#special-eggs", tour: "advanced",
    text: "Eggs get a little pricier each time. Golden eggs (level 6) have much better odds of rare variants. Cursed eggs (level 10) hatch dark variants, sometimes very rare, but often grumpy." },
  { title: "Visitor requests", tab: "park", target: "#request-card", tour: "advanced",
    text: "From level 3, guests sometimes ask to see certain variants. Put enough of them on display before time runs out for a big reward." },
  { title: "Guest feedback", tab: "park", target: "#feedback-card", tour: "advanced",
    text: "Shows how many guests left happy and their top complaints, each with a fix. The end-of-day report has the same, so you always know what to improve." },
  { title: "Guests", target: "#game", tour: "advanced",
    text: "Guests arrive by car, pay at the gate, and pay again for every pen they walk past. They wander for a while, then walk back to their car. Food critics leave star reviews, and influencers can make a variant go viral." },
  { title: "Staff", tab: "park", target: "#staff-card", tour: "advanced", pro: true,
    text: "Janitors sweep up litter, keepers feed hungry pens, and the Verity Mascot cheers guests up. Staff are paid wages every second while the park is open." },
  { title: "The gold pile", tab: "park", target: "#bank-card", tour: "advanced", pro: true,
    text: "Your coins are kept in the gold pile by the gate, guarded by the Securities. It has a limit: coins beyond it are lost, so upgrade it at night. You can also move it." },
  { title: "Parking", tab: "park", target: "#parking-card", pro: true,
    text: "Every guest arrives by car, so parking spaces limit how many can visit at once. Upgrade the lot as your park grows." },
  { title: "Parking", target: "#game", tour: "advanced", only: "simple",
    text: "Every guest arrives by car, so parking limits how many can visit at once. In Simple mode the car park grows by itself as your park levels up." },
  { title: "More land", target: "#game", tour: "advanced",
    text: "Yellow-tinted land with a sign is for sale. Click it to buy more space; the trees are cleared for you. New plots go on sale as your park levels up." },
  { title: "Events", target: "#game", tour: "advanced",
    text: "From level 4, events pop up: a variant going viral, a trending Verity song, a variant parade, and Pirate Clark trying to drag a variant into the Backrooms. Click him fast to save it!" },
  { title: "Escapes", target: "#game", tour: "advanced", pro: true,
    text: "Some wild variants break out of their pens. Escaped variants scare guests, so click them to catch them. Bigger pens are harder to escape." },
  { title: "Weather", target: ".world-info", tour: "advanced",
    text: "Rain and storms bring fewer guests and can spoil their mood. Humidity loves the rain, though." },
  { title: "Level up", target: ".lvl-box",
    text: "Guests, hatching and goals all give park XP. Each new level unlocks something: bigger pens, land, staff, the Fusion Lab and more." },
  { title: "Goals and more", target: ".tabs", tour: "basic",
    text: "Fuse variants in the Lab, track every variant in the Index, and follow Goals for rewards. Your progress saves automatically." },
  { title: "The Fusion Lab", target: '.tab[data-tab="lab"]', tour: "advanced",
    text: "From level 3, fuse two variants in the Lab to discover new ones. Rarer fusions unlock as you level up, and each lab upgrade adds 5% to your chance of success." },
  { title: "Variant Index", target: '.tab[data-tab="index"]', tour: "advanced",
    text: "Every variant you've discovered, with its ability, rarity and the fusion recipes you've found." },
  { title: "Goals and achievements", target: '.tab[data-tab="goals"]', tour: "advanced",
    text: "Goals give coins and XP, and the next one always shows under the map. Each achievement adds +2% income for good." },
  { title: "New Sanctuary", target: '.tab[data-tab="goals"]', tour: "advanced", pro: true,
    text: "From level 15 you can start over with a New Sanctuary. You keep your Index and achievements and earn Truth Shards, which boost income forever." },
  { title: "Daily rewards", target: null, tour: "advanced",
    text: "Come back each day for coins and a free egg. Every third day in a row adds a free golden egg." },
  { title: "Saving and settings", target: '.tab[data-tab="save"]', tour: "advanced",
    text: "Your park saves automatically. Export a save code to back it up or move it to another device. Settings has sound, music, effects and hover tips, and you can replay these tours here." },
  { title: "Help is everywhere", target: ".hint-bar", tour: "advanced",
    text: "This bar cycles game tips. Rest your mouse on anything for 5 seconds to learn what it is, and click any card's header to open or fold it." },
  { title: "Open the park!", target: "#hours-btn",
    text: "When you're ready, press Open park now to let the first guests in. Have fun!" },
];
// Steps for this tour and game mode.
const tutSteps = () => TUT_STEPS.filter(s => !(s.pro && isSimple()) && !(s.only === "simple" && !isSimple()) && (!s.tour || s.tour === (tut.tour || "basic")));

const tut = { active: false, i: 0, s: {}, doneAt: 0, el: null, tour: "basic", choosing: false };

function tutPlacedCount() { return state.enclosures.reduce((n, e) => n + e.variants.length, 0); }
function tutorialActive() { return tut.active || (tut.choosing && $("tour-dialog").open); }   // however the picker got closed

// Starts a tour. Without a tour named, the player picks Basic or Advanced (or skips).
function startTutorial(tour) {
  if (tour !== "basic" && tour !== "advanced") return chooseTour();
  closeDialogsForTutorial();
  tut.tour = tour;
  tut.active = true;
  tut.i = 0;
  tut.s = {};
  $("tutorial").hidden = false;
  showTutStep();
}

const TOURS = {
  basic: { label: "Basic tour", desc: "The essentials, in about a minute.", points: ["Build your first pen, hatch an egg and place it", "Paths, shops, decor and levelling up"] },
  advanced: { label: "Advanced tour", desc: "Every feature, in about five minutes.", points: ["Everything in the basic tour", "Pens, eggs, guests, events, the Lab, goals, saving and more"] },
};
function chooseTour() {
  const dlg = $("tour-dialog"), box = $("tour-options");
  box.innerHTML = "";
  for (const [k, t] of Object.entries(TOURS)) {
    const b = el("button", "mode-option");
    b.type = "button";
    b.appendChild(el("b", "", t.label.toUpperCase()));
    b.appendChild(el("span", "", t.desc));
    const ul = el("ul");
    for (const p of t.points) ul.appendChild(el("li", "", p));
    b.appendChild(ul);
    b.appendChild(el("span", "pick", "▶ Start"));
    b.addEventListener("click", () => { tut.choosing = false; dlg.close(); sfx("click"); startTutorial(k); });
    box.appendChild(b);
  }
  tut.choosing = true;   // the clock waits while they decide
  if (!dlg.open) dlg.showModal();
}
$("tour-skip").addEventListener("click", () => { tut.choosing = false; $("tour-dialog").close(); endTutorial(true); });
$("tour-dialog").addEventListener("cancel", e => { e.preventDefault(); tut.choosing = false; $("tour-dialog").close(); endTutorial(true); });

function closeDialogsForTutorial() {
  const notes = $("notes-dialog");
  if (notes && notes.open) notes.close();
}

function endTutorial(skipped) {
  tut.active = false;
  clearTutTarget();
  $("tutorial").hidden = true;
  state.tutorialDone = true;
  saveGame();
  if (skipped) toast("Tutorial skipped. You can replay it from the Save tab.", 4000);
  else { sfx("achievement"); toast("Tutorial complete! Good luck with your sanctuary.", 4000, "verity"); }
  if (!state.enclosures.length) setTimeout(emptyParkHint, 600);
}

// For an empty park with no tour running: say what to do first.
function emptyParkHint() {
  if (state.enclosures.length || tutorialActive()) return;
  toast("Your park is empty! Build an enclosure beside the path, then hatch an egg. Your first egg is always a Verity.", 7000, "verity");
}

function clearTutTarget() {
  if (tut.el) tut.el.classList.remove("tut-target");
  tut.el = null;
}

function showTutStep() {
  const step = tutSteps()[tut.i];
  clearTutTarget();
  if (step.tab && activeTab !== step.tab) switchTab(step.tab);
  tut.s = {};
  tut.doneAt = 0;
  if (step.enter) step.enter(tut.s);
  $("tut-step").textContent = `${tut.i + 1} / ${tutSteps().length}`;
  $("tut-title").textContent = step.title;
  $("tut-text").textContent = typeof step.text === "function" ? step.text() : isSimple() && step.simpleText || step.text;
  const task = $("tut-task");
  task.hidden = !step.task;
  task.classList.remove("done");
  $("tut-task-text").textContent = step.task || "";
  $("tut-back").disabled = tut.i === 0;
  $("tut-next").textContent = tut.i === tutSteps().length - 1 ? "Finish" : "Next";
  $("tut-next").classList.remove("ready");
  const el = step.target ? document.querySelector(step.target) : null;
  if (el) {
    const card = el.closest(".page > .card.collapsed");
    if (card) setCollapsed(card, false);   // never point at something folded away
    tut.el = el;
    el.classList.add("tut-target");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  placeTutorial();
}

function tutNext() {
  sfx("click");
  if (tut.i >= tutSteps().length - 1) return endTutorial(false);
  tut.i++;
  showTutStep();
}
function tutBack() {
  sfx("click");
  if (tut.i > 0) { tut.i--; showTutStep(); }
}

// Puts the panel beside the highlighted element: right, left, below or above, whichever fits.
function placeTutorial() {
  const box = $("tutorial");
  if (box.hidden) return;
  const vw = window.innerWidth, vh = window.innerHeight, m = 12;
  const bw = box.offsetWidth, bh = box.offsetHeight;
  if (vw < 700) { box.style.left = ""; box.style.top = ""; box.classList.add("docked"); return; }
  box.classList.remove("docked");
  let x = (vw - bw) / 2, y = (vh - bh) / 2;
  if (tut.el) {
    const r = tut.el.getBoundingClientRect();
    const fits = (px, py) => px >= m && py >= m && px + bw <= vw - m && py + bh <= vh - m;
    const cy = Math.min(Math.max(m, r.top), vh - bh - m), cx = Math.min(Math.max(m, r.left), vw - bw - m);
    const options = [[r.right + m, cy], [r.left - bw - m, cy], [cx, r.bottom + m], [cx, r.top - bh - m]];
    const pick = options.find(([px, py]) => fits(px, py));
    if (pick) [x, y] = pick;
    else { // big targets like the map: sit inside the bottom-left corner
      x = Math.max(m, Math.min(r.left + m, vw - bw - m));
      y = Math.max(m, Math.min(r.bottom - bh - m, vh - bh - m));
    }
  }
  box.style.left = Math.round(x) + "px";
  box.style.top = Math.round(y) + "px";
}

// Called every frame from the main loop.
function updateTutorial() {
  if (!tut.active) return;
  const step = tutSteps()[tut.i];
  if (step.done && !tut.doneAt && step.done(tut.s)) {
    tut.doneAt = performance.now();
    $("tut-task").classList.add("done");
    $("tut-next").classList.add("ready");
    sfx("levelup");
  }
  if (tut.doneAt && performance.now() - tut.doneAt > 1400) { tut.doneAt = 0; tutNext(); return; }
  placeTutorial();
}

$("tut-next").addEventListener("click", tutNext);
$("tut-back").addEventListener("click", tutBack);
$("tut-skip").addEventListener("click", () => { sfx("click"); endTutorial(true); });
$("tut-replay").addEventListener("click", () => { sfx("click"); switchTab("park"); startTutorial(); });
