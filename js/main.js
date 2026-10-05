import * as THREE from 'three';
import { World } from './world.js';
import { Bike } from './bike.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { EngineAudio } from './audio.js';
import { Session } from './session.js';
import { LESSONS, FREE_RIDE } from './lessons.js';
import { Graphics, QUALITY } from './graphics.js';
import { NPCs } from './npc.js';
import { Effects } from './effects.js';
import { GrassField } from './grass.js';
import { MenuUI, settingsTabs } from './ui.js';

const $ = (id) => document.getElementById(id);

// ---------- persistence ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ }
  },
};
const DEFAULTS = {
  auto: false, sound: true, quality: 'high', volume: 80, uiSound: true,
  fov: 60, shake: true, fps: false, camera: 0, minimap: true, keys: true,
};
const settings = { ...DEFAULTS, ...store.get('moto.settings', {}) };
const saveSettings = () => store.set('moto.settings', settings);
const progress = store.get('moto.progress', {});

// ---------- renderer / scene ----------
const gfx = new Graphics($('c'), settings.quality);
const { scene, camera } = gfx;

const world = new World(scene, gfx.qName);
const bike = new Bike(scene);
const input = new Input();
const hud = new HUD(world);
const audio = new EngineAudio();
audio.enabled = settings.sound;
audio.volume = settings.volume / 100;
const npc = new NPCs(scene, world);
const effects = new Effects(scene);
const grass = new GrassField(scene, world, gfx.q.grass);
gfx.prepare(scene);

const game = { scene, world, bike, hud, audio, settings, npc, effects };

// ---------- state ----------
let state = 'menu';      // menu | briefing | playing | paused | result
let session = null;
let currentDef = null;
let camMode = 0;          // 0 chase, 1 first person, 2 top
const CAM_NAMES = ['מצלמה: מאחור', 'מצלמה: מבט רוכב', 'מצלמה: מלמעלה'];
const camPos = new THREE.Vector3(0, 5, -10);
const camLook = new THREE.Vector3();

// ---------- menus ----------
const ui = new MenuUI({
  audio, settings,
  tabs: settingsTabs(Object.entries(QUALITY).map(([k, q]) => [k, q.label])),
  onSetting(key, value) {
    settings[key] = value;
    saveSettings();
    if (key === 'quality') location.reload();
    else applySettings();
  },
  onAction(key) {
    if (key === 'resetProgress') {
      for (const k of Object.keys(progress)) delete progress[k];
      store.set('moto.progress', progress);
      buildMenu();
    } else if (key === 'defaults') {
      // quality needs a reload, so it keeps its current value
      Object.assign(settings, DEFAULTS, { quality: settings.quality });
      saveSettings();
      applySettings();
    }
  },
});
ui.backHandlers = {
  briefing: () => toMenu(currentDef?.free ? ['menu'] : ['menu', 'lessons']),
  pause: () => resume(),
  result: () => toMenu(),
};

function applySettings() {
  audio.setEnabled(settings.sound);
  audio.setVolume(settings.volume / 100);
  hud.setMinimap(settings.minimap);
  hud.setKeys(settings.keys);
  hud.setFps(settings.fps);
  ui.refresh();
}

function starsText(n) {
  return '★'.repeat(n) + '<span class="off">' + '★'.repeat(3 - n) + '</span>';
}

const cardFor = {};
function buildMenu() {
  const grid = $('lesson-grid');
  grid.innerHTML = '';
  let total = 0;
  for (const def of LESSONS) {
    const best = progress[def.id];
    total += best?.stars || 0;
    const b = document.createElement('button');
    b.className = 'lesson-card' + (best ? ' passed' : '');
    b.dataset.nav = '';
    b.innerHTML = `
      <span class="lc-num">${String(def.num).padStart(2, '0')}</span>
      <span class="lc-body">
        <span class="lc-title">${def.title}</span>
        <span class="lc-desc">${def.desc}</span>
      </span>
      <span class="lc-foot">
        <span class="lc-stars">${starsText(best?.stars || 0)}</span>
        <span class="lc-best">${best ? `שיא <b>${best.score}</b>` : 'טרם הושלם'}</span>
      </span>`;
    b.onclick = () => openBriefing(def);
    grid.appendChild(b);
    cardFor[def.id] = b;
  }
  const max = LESSONS.length * 3;
  $('m-progress').textContent = `★ ${total} / ${max} כוכבים`;
  $('ls-stars').innerHTML = `<span class="st">★</span><span>${total}</span><small>/ ${max}</small>`;
}

function openBriefing(def) {
  audio.init();
  currentDef = def;
  state = 'briefing';
  $('b-num').textContent = def.free ? 'חופשי' : `שיעור ${def.num}`;
  $('b-title').textContent = def.title;
  $('b-intro').innerHTML = def.intro;
  $('b-tips').innerHTML = def.tips.map((t) => `<li>${t}</li>`).join('');
  const note = $('b-note');
  if (def.manualOnly && settings.auto) {
    note.textContent = 'שיעור זה מלמד עבודה עם מצמד והילוכים, ולכן ייערך עם תיבה ידנית.';
    note.classList.remove('hidden');
  } else note.classList.add('hidden');
  ui.show('briefing');
  // preview the starting position behind the overlay
  bike.reset(def.spawn.x, def.spawn.z, def.spawn.h, { engineOn: !!def.spawn.engineOn });
  camMode = settings.camera;
  snapCamera();
}

function startLesson(def) {
  session?.dispose();
  currentDef = def;
  session = new Session(def, game);
  effects.clearSkids();
  npc.setLessonInstructor(def.instructor || null);
  hud.setLesson(def);
  hud.show(true);
  ui.show(null);
  state = 'playing';
  audio.init();
  audio.resume();
  audio.setPaused(false);
  camMode = settings.camera;
  snapCamera();
  if (!def.free) hud.toast(def.title, 'info', 2200, true);
}

function isAuto() {
  return settings.auto && !currentDef?.manualOnly;
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  ui.show('pause');
  audio.setPaused(true);
}
function resume() {
  state = 'playing';
  ui.show(null);
  audio.setPaused(false);
}
function toMenu(stack = ['menu']) {
  session?.dispose();
  session = null;
  npc.setLessonInstructor(null);
  hud.show(false);
  state = 'menu';
  buildMenu();
  if (currentDef && cardFor[currentDef.id]) ui.focusMem.lessons = cardFor[currentDef.id];
  ui.setStack(stack, true);
  audio.setPaused(false);
  audio.update(0, 0, false);
}

function showResult() {
  const r = session.result;
  const def = session.def;
  state = 'result';
  hud.show(false);
  $('r-kicker').textContent = r.passed ? 'LESSON COMPLETE' : 'TRY AGAIN';
  $('r-badge').textContent = r.passed ? '🏆' : '🔁';
  $('r-title').textContent = r.passed ? `עברת את "${def.title}"!` : 'לא נורא, מנסים שוב';
  $('r-stars').innerHTML = [0, 1, 2].map((i) =>
    `<span class="star${i < r.stars ? ' on' : ''}" style="animation-delay:${0.3 + i * 0.22}s">★</span>`).join('');
  const t = Math.floor(r.time);
  const stat = (label, value, id = '') => `<div class="stat"><small>${label}</small><b${id ? ` id="${id}"` : ''}>${value}</b></div>`;
  $('r-summary').innerHTML = stat('ניקוד', 0, 'r-score') + stat('זמן', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)
    + r.stats.map(([k, v]) => stat(k, v)).join('');
  // score counts up
  const scoreEl = $('r-score'), t0 = performance.now();
  const countUp = (now) => {
    const k = Math.min(1, (now - t0) / 900);
    scoreEl.textContent = Math.round(r.score * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(countUp);
  };
  requestAnimationFrame(countUp);
  const ul = $('r-mistakes');
  ul.innerHTML = r.mistakes.length
    ? r.mistakes.map((m) => `<li><span>${m.msg}${m.count > 1 ? ` ×${m.count}` : ''}</span><span class="pts" dir="ltr">−${m.pts}</span></li>`).join('')
    : (r.passed ? '<li class="ok">רכיבה נקייה — בלי טעויות!</li>' : '');
  const tip = $('r-tip');
  if (r.failMsg) { tip.textContent = r.failMsg; tip.classList.remove('hidden'); } else tip.classList.add('hidden');

  const idx = LESSONS.indexOf(def);
  const next = LESSONS[idx + 1];
  $('r-next').classList.toggle('hidden', !(r.passed && next));
  $('r-next').onclick = () => openBriefing(next);
  $('r-retry').classList.toggle('primary', !r.passed);

  if (r.passed) {
    const prev = progress[def.id];
    if (!prev || r.score > prev.score) {
      progress[def.id] = { score: r.score, stars: r.stars };
      store.set('moto.progress', progress);
    }
  }
  ui.show('result');
  ui.sfx(r.passed ? 'win' : 'lose');
}

$('m-lessons').onclick = () => ui.push('lessons');
$('m-free').onclick = () => openBriefing(FREE_RIDE);
$('m-howto').onclick = () => ui.push('howto');
$('m-settings').onclick = () => ui.openSettings();
$('howto-back').onclick = () => ui.back();
$('set-back').onclick = () => ui.back();
$('set-defaults').onclick = async () => {
  if (await ui.confirm('לשחזר את כל ההגדרות לברירת המחדל?')) ui.onAction('defaults');
};
$('b-start').onclick = () => startLesson(currentDef);
$('b-back').onclick = () => ui.back();
$('p-resume').onclick = resume;
$('p-restart').onclick = () => startLesson(currentDef);
$('p-settings').onclick = () => ui.openSettings();
$('p-menu').onclick = async () => {
  if (await ui.confirm('לצאת לתפריט הראשי? ההתקדמות בשיעור הנוכחי תאבד.')) toMenu();
};
$('r-retry').onclick = () => startLesson(currentDef);
$('r-menu').onclick = () => toMenu();

// ---------- camera ----------
function cameraTargets(outPos, outLook, mode = camMode) {
  const fx = bike.fwdX, fz = bike.fwdZ;
  if (mode === 0) {
    const dist = 4.6 + bike.kmh * 0.025;
    outPos.set(bike.x - fx * dist, bike.y + 1.85 + bike.kmh * 0.006, bike.z - fz * dist);
    outLook.set(bike.x + fx * 5, bike.y + 1.05, bike.z + fz * 5);
  } else if (mode === 2) {
    outPos.set(bike.x - fx * 7, 24, bike.z - fz * 7);
    outLook.set(bike.x + fx * 3, 0, bike.z + fz * 3);
  }
}

function snapCamera() {
  // the rider view follows the head every frame; keep the chase camera ready behind it
  cameraTargets(camPos, camLook, camMode === 1 ? 0 : camMode);
  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  camera.lookAt(camLook);
}

const _head = new THREE.Vector3();
const _q = new THREE.Quaternion();
let shakeT = 0;
function updateCamera(dt) {
  // a touch of speed feel: wider FOV when fast
  const fov = settings.fov + Math.min(14, bike.kmh * 0.13);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
  if (camMode === 1) {
    bike.headWorldPosition(_head);
    camera.position.copy(_head);
    camera.up.set(0, 1, 0).applyQuaternion(bike.leanG.getWorldQuaternion(_q));
    camera.lookAt(_head.x + bike.fwdX * 10, _head.y - 0.6, _head.z + bike.fwdZ * 10);
    return;
  }
  const p = new THREE.Vector3(), l = new THREE.Vector3();
  cameraTargets(p, l);
  const k = 1 - Math.exp(-dt * (camMode === 2 ? 3 : 4.5));
  camPos.lerp(p, k);
  camLook.lerp(l, 1 - Math.exp(-dt * 8));
  // keep the camera above ground
  camPos.y = Math.max(camPos.y, 0.6);
  camera.position.copy(camPos);
  // subtle shake on rough ground / at speed
  shakeT += dt;
  const rough = settings.shake ? (bike.surface === 'grass' ? 0.03 : 0.004) * Math.min(1, bike.kmh / 30) : 0;
  camera.position.x += Math.sin(shakeT * 31) * rough;
  camera.position.y += Math.sin(shakeT * 27 + 1) * rough;
  camera.up.set(0, 1, 0);
  camera.lookAt(camLook);
  // lean the horizon slightly with the bike
  if (camMode === 0) camera.rotateZ(-bike.lean * 0.12);
}

// ---------- events from the bike ----------
function handleBikeEvents() {
  for (const ev of bike.events) {
    switch (ev.type) {
      case 'msg': hud.toast(ev.text, ev.kind || 'info'); break;
      case 'crank': audio.blip(220, 0.5, 'sawtooth', 0.06); break;
      case 'engineOn': hud.toast('המנוע מותנע', 'good', 1400); break;
      case 'engineOff': hud.toast('המנוע כובה', 'info', 1400); break;
      case 'stall': hud.toast('המנוע כבה!', 'bad', 2200, true); audio.blip(70, 0.35, 'sawtooth', 0.2); break;
      case 'shift': audio.clunk(); break;
      case 'grind': audio.blip(180, 0.15, 'square', 0.1); break;
      case 'blinker': audio.tick(); break;
      case 'bump': audio.clunk(); break;
      case 'crash': audio.blip(60, 0.6, 'sawtooth', 0.3); effects.burst(bike.x, bike.z); break;
    }
    session?.onBikeEvent(ev);
  }
  bike.events.length = 0;
}

// ---------- main loop ----------
let last = performance.now();
let blinkWasOn = false;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, raw);
  last = Math.max(last, now);
  hud.tickFps(raw);
  tick(dt, now);
  gfx.render(dt);
}

function tick(dt, now) {
  // menus own the keyboard whenever one is up (Esc there means "back")
  if (state !== 'playing') ui.handleKeys(input);
  else if (input.hit('Escape')) pause();
  if (state === 'playing') {
    if (input.hit('KeyC')) { camMode = (camMode + 1) % 3; hud.toast(CAM_NAMES[camMode], 'info', 1200); }
    if (input.hit('KeyH')) hud.toggleKeys();
    if (input.hit('KeyM')) { settings.sound = !settings.sound; saveSettings(); applySettings(); hud.toast(settings.sound ? 'קול: פועל' : 'קול: מושתק', 'info', 1200); }
    if (input.hit('KeyR')) { startLesson(currentDef); input.endFrame(); return; }
  }

  if (state === 'playing' || state === 'result') {
    // physics in small substeps for stability
    const n = Math.ceil(dt / 0.01);
    for (let i = 0; i < n; i++) {
      bike.update(dt / n, state === 'playing' && !session?.ended ? input : NO_INPUT, world, isAuto());
      if (i === 0) NO_INPUT.pressed.clear();
      // discrete key presses should only fire once per frame
      if (i === 0) input.endFrame();
    }
    handleBikeEvents();
    effects.bikeFx(dt, bike, true);
    session?.update(dt);
    if (state === 'playing' && session?.ended && session.endTimer <= 0 && !session.def.free) showResult();
    hud.update(bike, session);
    audio.update(bike.rpm, bike.throttle, bike.engineOn);
    const blinkOn = bike.blinker !== 0 && bike.time % 0.8 < 0.4;
    if (blinkOn !== blinkWasOn) { blinkWasOn = blinkOn; if (bike.blinker !== 0) audio.tick(); }
  } else {
    input.endFrame();
    if (state === 'menu') {
      // cinematic orbit over the practice area where the students ride
      menuT += dt;
      const a = menuT * 0.05;
      camera.position.set(24 + Math.cos(a) * 46, 13 + Math.sin(menuT * 0.11) * 3, 4 + Math.sin(a) * 46);
      camera.up.set(0, 1, 0);
      camera.lookAt(30, 1, 4);
      if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
    }
  }

  world.update(dt);
  npc.update(dt, camera.position, bike);
  effects.update(dt);
  if (state !== 'menu') updateCamera(dt);
  _bikePos.set(bike.x, 0, bike.z);
  grass.update(dt, camera.position, _bikePos);
}
let menuT = 0;
const _bikePos = new THREE.Vector3();

// Input used once a lesson is over: clutch in + brake, so the bike settles without stalling.
const NO_INPUT = { pressed: new Set(), down: (...c) => c.includes('KeyS') || c.includes('ShiftLeft'), hit: () => false, endFrame() {} };

buildMenu();
applySettings();
ui.show('splash');
$('loading').classList.add('hidden');
requestAnimationFrame(frame);

// handy for debugging from the console: __moto.advance(2) simulates two seconds of play
window.__moto = {
  game, input, LESSONS, startLesson, ui,
  get session() { return session; },
  get state() { return state; },
  advance(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) { last += dt * 1000; tick(dt, last); }
    gfx.render(dt);
  },
  gfx, npc,
};
