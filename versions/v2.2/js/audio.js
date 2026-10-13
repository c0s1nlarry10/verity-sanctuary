"use strict";

// Tiny chiptune sound effects generated with the Web Audio API (no audio files).
let actx = null;
let lastCoinSfx = 0;

let sfxGain = null, musicGain = null, masterGain = null;

function getCtx() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = actx.createGain();
      sfxGain = actx.createGain();
      musicGain = actx.createGain();
      masterGain.connect(actx.destination);
      sfxGain.connect(masterGain);
      musicGain.connect(masterGain);
      applyVolumes();
    } catch (e) { actx = null; return null; }
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}

function applyVolumes() {
  if (!actx || typeof state === "undefined") return;
  masterGain.gain.value = state.settings.muted ? 0 : 1;
  sfxGain.gain.value = state.settings.sfxVol ?? 0.8;
  musicGain.gain.value = (state.settings.musicVol ?? 0.5) * 0.6;
}

function audioCtx() {
  if (typeof state === "undefined" || !state.settings.sound || state.settings.muted) return null;
  return getCtx();
}

function tone(freq, dur, { type = "square", vol = 0.06, slide = 0, delay = 0 } = {}) {
  const a = audioCtx();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.08, delay = 0, hp = 1000 } = {}) {
  const a = audioCtx();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t);
}

const ARPEGGIO = [523, 659, 784, 1047, 1319, 1568, 2093];
const SFX = {
  click: () => tone(660, 0.05, { vol: 0.03 }),
  coin: () => {
    if (!state.settings.coinSound) return;
    const now = performance.now();
    if (now - lastCoinSfx < 110) return;
    lastCoinSfx = now;
    tone(1320, 0.05, { vol: 0.018 });
    tone(1760, 0.07, { vol: 0.014, delay: 0.04 });
  },
  build: () => { tone(220, 0.08, { type: "triangle", vol: 0.1 }); noise(0.06, { vol: 0.04 }); },
  bulldoze: () => { noise(0.15, { vol: 0.07, hp: 300 }); tone(160, 0.12, { slide: -80, vol: 0.05 }); },
  place: () => { tone(520, 0.06, { type: "triangle", vol: 0.08 }); tone(780, 0.08, { type: "triangle", vol: 0.07, delay: 0.06 }); },
  shake: () => tone(260 + Math.random() * 60, 0.05, { type: "triangle", vol: 0.07 }),
  crack: () => { noise(0.08, { vol: 0.12, hp: 2000 }); tone(900, 0.03, { vol: 0.03 }); },
  pop: () => { tone(300, 0.18, { slide: 900, vol: 0.07 }); noise(0.12, { vol: 0.06, hp: 1500 }); },
  fanfare: (tier = 0) => {
    const n = 3 + Math.min(4, tier);
    for (let i = 0; i < n; i++) tone(ARPEGGIO[i], 0.14, { vol: 0.05, delay: 0.08 * i });
    tone(ARPEGGIO[n - 1] * 2, 0.35, { type: "triangle", vol: 0.05, delay: 0.08 * n });
  },
  fail: () => {
    tone(400, 0.2, { slide: -250, type: "sawtooth", vol: 0.04 });
    tone(220, 0.3, { delay: 0.18, slide: -120, type: "sawtooth", vol: 0.04 });
  },
  whoosh: () => { tone(200, 1.2, { slide: 900, type: "triangle", vol: 0.04 }); noise(1.2, { vol: 0.02, hp: 3000 }); },
  pet: () => { tone(880, 0.08, { type: "sine", vol: 0.08, slide: 300 }); tone(1175, 0.1, { type: "sine", delay: 0.08, vol: 0.07 }); },
  levelup: () => { [784, 988, 1175].forEach((f, i) => tone(f, 0.08, { vol: 0.04, delay: i * 0.06 })); },
  event: () => { [440, 660, 440, 660].forEach((f, i) => tone(f, 0.1, { vol: 0.05, delay: i * 0.12 })); },
  achievement: () => { [659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, { vol: 0.05, delay: i * 0.09 })); },
  tug: () => { tone(180 + Math.random() * 120, 0.06, { vol: 0.06 }); noise(0.04, { vol: 0.04, hp: 800 }); },
};

function sfx(name, ...args) {
  try { if (SFX[name]) SFX[name](...args); } catch (e) { /* audio is optional */ }
}

// ================= Background music (original chiptune loop) =================
const TEMPO = 112;
const STEP = 60 / TEMPO / 2;   // eighth notes
const MELODY = [
  72, 0, 76, 79, 76, 0, 72, 74,   74, 0, 71, 74, 79, 0, 77, 76,
  76, 0, 72, 76, 81, 0, 79, 76,   77, 76, 74, 72, 74, 0, 0, 0,
  72, 74, 76, 72, 79, 0, 76, 0,   74, 76, 77, 74, 79, 0, 83, 0,
  81, 79, 77, 76, 74, 77, 76, 74, 72, 0, 67, 0, 72, 0, 0, 0,
];
const BASS = [48, 43, 45, 41, 48, 43, 41, 43];
let musicTimer = null, musicStep = 0, nextNoteTime = 0;
const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);

function musicNote(freq, t, dur, type, vol) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function scheduleMusic() {
  if (!actx) return;
  if (nextNoteTime < actx.currentTime - 0.1) nextNoteTime = actx.currentTime + 0.05;
  while (nextNoteTime < actx.currentTime + 0.25) {
    const i = musicStep % MELODY.length;
    const bar = Math.floor(i / 8);
    if (MELODY[i]) musicNote(midiHz(MELODY[i]), nextNoteTime, STEP * 0.9, "square", 0.05);
    if (i % 2 === 0) musicNote(midiHz(BASS[bar] + (i % 4 === 2 ? 12 : 0)), nextNoteTime, STEP * 1.6, "triangle", 0.12);
    nextNoteTime += STEP;
    musicStep++;
  }
}

function startMusic() {
  if (musicTimer || typeof state === "undefined" || !state.settings.music || state.settings.muted) return;
  if (!getCtx()) return;
  nextNoteTime = actx.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 60);
}

function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
