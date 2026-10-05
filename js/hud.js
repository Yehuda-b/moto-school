import { LOT, RING, ROAD_HALF } from './world.js';
import { REDLINE } from './bike.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.el = {
      hud: $('hud'), num: $('lp-num'), title: $('lp-title'), steps: $('lp-steps'), score: $('lp-score'), time: $('lp-time'),
      gear: $('d-gear'), speed: $('d-speed'), rpm: $('d-rpm'),
      left: $('i-left'), right: $('i-right'), engine: $('i-engine'), neutral: $('i-neutral'), clutch: $('i-clutch'),
      toasts: $('toasts'), keys: $('keys-hint'), panel: $('lesson-panel'),
    };
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.mapImg = this.drawStaticMap(world);
    this.lastSteps = '';
    this.recentToasts = new Map();
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  setLesson(def) {
    this.el.num.textContent = def.free ? 'חופשי' : `שיעור ${def.num}`;
    this.el.title.textContent = def.title;
    this.lastSteps = '';
    this.el.toasts.innerHTML = '';
    this.recentToasts.clear();
  }

  renderSteps(session) {
    const steps = session.def.steps || [];
    const key = `${session.stepIdx}/${steps.length}`;
    if (key === this.lastSteps) return;
    this.lastSteps = key;
    this.el.steps.innerHTML = '';
    if (session.def.free) {
      const li = document.createElement('li');
      li.className = 'current';
      li.textContent = 'סע לאן שבא לך! צא מהמגרש לכביש הטבעת דרך היציאה הדרומית.';
      this.el.steps.appendChild(li);
      return;
    }
    steps.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = typeof s.text === 'function' ? s.text(session) : s.text;
      if (i < session.stepIdx) li.className = 'done';
      else if (i === session.stepIdx) li.className = 'current';
      this.el.steps.appendChild(li);
    });
    this.el.steps.querySelector('.current')?.scrollIntoView?.({ block: 'nearest' });
  }

  update(bike, session) {
    const e = this.el;
    e.speed.textContent = Math.round(bike.kmh);
    e.gear.textContent = bike.gear;
    e.gear.classList.toggle('neutral', bike.gear === 'N');
    e.rpm.style.width = `${Math.min(100, (bike.rpm / REDLINE) * 100)}%`;
    const blink = bike.time % 0.8 < 0.4;
    e.left.classList.toggle('on', bike.blinker === -1 && blink);
    e.right.classList.toggle('on', bike.blinker === 1 && blink);
    e.engine.classList.toggle('on', bike.engineOn);
    e.engine.classList.toggle('cranking', bike.cranking > 0);
    e.neutral.classList.toggle('on', bike.gear === 'N' && (bike.engineOn || bike.cranking > 0));
    e.clutch.classList.toggle('on', bike.clutch < 0.5);
    if (session) {
      e.score.textContent = session.score;
      const t = Math.floor(session.t);
      e.time.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      this.renderSteps(session);
    }
    this.drawMinimap(bike, session);
  }

  toast(text, kind = 'info', ms = 2600, big = false) {
    // de-duplicate identical messages fired in quick succession
    const now = performance.now();
    if (this.recentToasts.get(text) > now - 1500) return;
    this.recentToasts.set(text, now);
    const d = document.createElement('div');
    d.className = `toast ${kind}${big ? ' big' : ''}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => {
      d.classList.add('out');
      setTimeout(() => d.remove(), 320);
    }, ms);
  }

  toggleKeys() { this.el.keys.classList.toggle('hidden'); }

  // ---------- minimap ----------
  drawStaticMap(world) {
    const S = 1024, scale = S / 380; // 380m across
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const P = (v) => S / 2 + v * scale;
    g.fillStyle = '#4c7a3a';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#d8d2c4';
    for (const b of world.buildings) g.fillRect(P(b.x - b.w / 2), P(b.z - b.d / 2), b.w * scale, b.d * scale);
    g.strokeStyle = '#555a60';
    g.lineWidth = ROAD_HALF * 2 * scale;
    g.lineCap = 'square';
    g.strokeRect(P(-RING), P(-RING), RING * 2 * scale, RING * 2 * scale);
    g.beginPath(); g.moveTo(P(0), P(-LOT)); g.lineTo(P(0), P(-RING)); g.stroke();
    g.fillStyle = '#6b6e73';
    g.fillRect(P(-LOT), P(-LOT), LOT * 2 * scale, LOT * 2 * scale);
    this.mapScale = scale;
    this.mapSize = S;
    return c;
  }

  drawMinimap(bike, session) {
    const g = this.mctx;
    const W = this.minimap.width;
    const zoom = 1.6; // canvas px per meter
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    // top-down view (x right, z down) rotated so the bike always points up
    g.translate(W / 2, W / 2);
    g.rotate(bike.heading - Math.PI);
    const k = zoom / this.mapScale;
    g.scale(k, k);
    g.translate(-(this.mapSize / 2 + bike.x * this.mapScale), -(this.mapSize / 2 + bike.z * this.mapScale));
    g.drawImage(this.mapImg, 0, 0);
    // lesson objects
    if (session) {
      for (const cn of session.cones) {
        g.fillStyle = cn.hit ? '#888' : '#ff7a1a';
        g.beginPath(); g.arc(this.mapSize / 2 + cn.x * this.mapScale, this.mapSize / 2 + cn.z * this.mapScale, 0.5 * this.mapScale, 0, Math.PI * 2); g.fill();
      }
      if (session.target) {
        g.fillStyle = '#ffb703';
        g.beginPath(); g.arc(this.mapSize / 2 + session.target.x * this.mapScale, this.mapSize / 2 + session.target.z * this.mapScale, 2.4 * this.mapScale, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    // the bike arrow in the center
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(W / 2, W / 2 - 9); g.lineTo(W / 2 + 6, W / 2 + 7); g.lineTo(W / 2, W / 2 + 3); g.lineTo(W / 2 - 6, W / 2 + 7);
    g.closePath(); g.fill(); g.stroke();
  }
}
