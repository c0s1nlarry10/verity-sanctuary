"use strict";

// ================= Boot =================
applyIcons();
const loaded = loadGame();
rebuildGrids();
ensureVaultSpot();
syncStaff();
if (loaded) applyOfflineEarnings();
if (isOpen() && !state.day) openDay(true);
$("ver-tag").textContent = "v" + GAME_VERSION;
$("ver-small").textContent = GAME_VERSION;
$("loader-version").textContent = "Version " + GAME_VERSION;
resizeView();
setZoom(3);
homeView();
buildTerrain();
buildTrees();
renderSettings();
applyCollapsed();
renderStars();
applyLocks();
setTool("inspect");

let lastTime = performance.now();
let uiTimer = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  const time = now / 1000;
  if (gameStarted) update(dt);   // nothing happens behind the loading screen (no day ending there)
  render(dt, time);
  updateCamera(dt);
  updateTutorial();
  updateFx(dt);
  drawFx(time);
  drawCard(dt, time);
  uiTimer += dt;
  if (uiTimer > 0.25) { uiTimer = 0; renderUI(false); drawMinimap(); }
  updateHintBar(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ================= Loading screen =================
(function finishLoading() {
  const loader = document.getElementById("loader");
  if (!loader) return;
  const setPct = (pct, label) => {
    if (!document.getElementById("loader-fill")) return;
    window.__loader.pct = pct;
    document.getElementById("loader-fill").style.width = pct + "%";
    document.getElementById("loader-roller").style.left = `calc(${pct}% - 18px)`;
    document.getElementById("loader-num").textContent = Math.floor(pct) + "%";
    if (label) document.getElementById("loader-step").textContent = label;
  };
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const minTime = new Promise(r => setTimeout(r, 1600));
  Promise.race([Promise.all([fontsReady, minTime]), new Promise(r => setTimeout(r, 5000))]).then(() => {
    clearInterval(window.__loaderTimer);
    let pct = Math.max(70, window.__loader.pct);
    const tick = setInterval(() => {
      pct = Math.min(100, pct + 4);
      setPct(pct, pct >= 100 ? "Ready!" : "Waking up the variants...");
      if (pct >= 100) {
        clearInterval(tick);
        const btn = document.getElementById("loader-start");
        if (!btn) return;
        btn.hidden = false;
        btn.focus();
      }
    }, 40);
  });
  document.getElementById("loader-start").addEventListener("click", () => {
    loader.classList.add("done");
    setTimeout(() => loader.remove(), 700);
    startMusic();
    startFeedbackReminders();
    sfx("fanfare", 1);
    resizeView();
    chooseMode().then(() => {
      gameStarted = true;
      lastTime = performance.now();
      checkDaily();
      // the first time a returning player loads a new version, show what changed (once)
      const freshPark = !loaded || !state.tutorialDone && state.eggsHatched === 0;
      const played = !!state.seenVersion || state.tutorialDone || state.eggsHatched > 0;   // not just a save written on the loading screen
      const newVersion = loaded && played && state.seenVersion !== GAME_VERSION;
      state.seenVersion = GAME_VERSION;
      saveGame();
      if (newVersion) {
        showPatchNotes();
        if (freshPark) $("notes-dialog").addEventListener("close", startTutorial, { once: true });
      } else if (freshPark) startTutorial();
      else emptyParkHint();
      renderUI(true);
      canvas.focus();
    });
  });
})();
