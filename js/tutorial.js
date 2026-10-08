"use strict";

// ================= Tutorial =================
// A short guided tour for new players. It points at one part of the screen per step,
// some steps ask the player to try something, and it can be skipped at any time.
// The world clock is paused while it runs so the first night doesn't slip away.

const tutPark = n => `.page[data-page="park"] > .card:nth-of-type(${n})`;
const TUT_STEPS = [
  { title: "Welcome!", target: null,
    text: "This is your Verity Sanctuary. Collect Verity variants, give them homes, and earn coins from the guests who come to see them. This quick tour takes about a minute." },
  { title: "Look around", target: "#game", task: "Move or zoom the camera",
    text: "Drag the map, or use the arrow keys or WASD, to move around. Scroll or press - and + to zoom. Click the minimap in the corner to jump anywhere.",
    enter: s => { s.view = [view.x, view.y, view.zoom]; },
    done: s => Math.abs(view.x - s.view[0]) + Math.abs(view.y - s.view[1]) > 8 || view.zoom !== s.view[2] },
  { title: "Day and night", target: "#hours-bar",
    text: "The park is open from 8 AM to 10 PM and closed at night. Night is when you build. The clock is paused until this tour ends." },
  { title: "Hatch an egg", tab: "park", target: "#hatch", task: "Hatch an egg",
    text: "Every variant starts as an egg. Hatch one to get a random variant. Most are common, but you might get lucky.",
    enter: s => { s.hatched = state.stats.hatched; },
    done: s => state.stats.hatched > s.hatched },
  { title: "Give it a home", target: "#game", task: "Place a variant in your enclosure",
    text: "New variants wait in the Incubator. Pick one, then click your enclosure on the map to put it inside. Each pen has limited space, so build more as you grow.",
    enter: s => {
      s.placed = tutPlacedCount();
      const e = state.enclosures[0];
      if (e) centerOn((e.x + encSize(e) / 2) * TILE, (e.y + encSize(e) / 2) * TILE);
      if (state.inventory.length && !buildLocked()) { setTool("place"); selectedUid = state.inventory[0].id; renderUI(true); }
    },
    done: s => tutPlacedCount() > s.placed },
  { title: "Build your park", tab: "park", target: tutPark(1),
    text: "At night, lay paths so guests can walk to your pens, and build new enclosures. Bulldozing refunds half the cost. These tools lock while the park is open." },
  { title: "Shops and decor", tab: "park", target: tutPark(2),
    text: "Snack stands earn coins from guests walking past. Decorations raise your park's appeal, which brings in more visitors." },
  { title: "Keep them happy", target: "#game",
    text: "With Inspect selected, click any variant to see it up close, feed it and pet it. Fed, happy variants earn more coins." },
  { title: "Parking", tab: "park", target: "#parking-card",
    text: "Every guest arrives by car, so parking spaces limit how many can visit at once. Upgrade the lot as your park grows." },
  { title: "Level up", target: ".lvl-box",
    text: "Guests, hatching and goals all give park XP. Each new level unlocks something: bigger pens, land, staff, the Fusion Lab and more." },
  { title: "Goals and more", target: ".tabs",
    text: "Fuse variants in the Lab, track every variant in the Index, and follow Goals for rewards. Your progress saves automatically." },
  { title: "Open the park!", target: "#hours-btn",
    text: "When you're ready, press Open park now to let the first guests in. Have fun!" },
];

const tut = { active: false, i: 0, s: {}, doneAt: 0, el: null };

function tutPlacedCount() { return state.enclosures.reduce((n, e) => n + e.variants.length, 0); }
function tutorialActive() { return tut.active; }

function startTutorial() {
  closeDialogsForTutorial();
  tut.active = true;
  tut.i = 0;
  tut.s = {};
  $("tutorial").hidden = false;
  showTutStep();
}

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
}

function clearTutTarget() {
  if (tut.el) tut.el.classList.remove("tut-target");
  tut.el = null;
}

function showTutStep() {
  const step = TUT_STEPS[tut.i];
  clearTutTarget();
  if (step.tab && activeTab !== step.tab) switchTab(step.tab);
  tut.s = {};
  tut.doneAt = 0;
  if (step.enter) step.enter(tut.s);
  $("tut-step").textContent = `${tut.i + 1} / ${TUT_STEPS.length}`;
  $("tut-title").textContent = step.title;
  $("tut-text").textContent = step.text;
  const task = $("tut-task");
  task.hidden = !step.task;
  task.classList.remove("done");
  $("tut-task-text").textContent = step.task || "";
  $("tut-back").disabled = tut.i === 0;
  $("tut-next").textContent = tut.i === TUT_STEPS.length - 1 ? "Finish" : "Next";
  $("tut-next").classList.remove("ready");
  const el = step.target ? document.querySelector(step.target) : null;
  if (el) {
    tut.el = el;
    el.classList.add("tut-target");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  placeTutorial();
}

function tutNext() {
  sfx("click");
  if (tut.i >= TUT_STEPS.length - 1) return endTutorial(false);
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
  const step = TUT_STEPS[tut.i];
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
