import * as THREE from 'three';
import { makeCone, paintRect, paintFill, makeBeacon } from './world.js';

/**
 * One run of a lesson: tracks steps, score, mistakes and lesson-owned 3D objects.
 * Lesson definitions (lessons.js) drive it through the small API below.
 */
export class Session {
  constructor(def, game) {
    this.def = def;
    this.game = game;
    this.bike = game.bike;
    this.world = game.world;
    this.group = new THREE.Group();
    game.scene.add(this.group);

    this.t = 0;
    this.stepIdx = 0;
    this.score = 100;
    this.mistakes = [];   // {msg, pts, count}
    this.cooldowns = {};
    this.cones = [];
    this.stats = {};
    this.target = null;
    this.noFootDown = false;
    this.ended = false;
    this.endTimer = 0;
    this.result = null;

    this.beacon = makeBeacon();
    this.beacon.visible = false;
    this.group.add(this.beacon);

    const sp = def.spawn;
    this.bike.reset(sp.x, sp.z, sp.h, { engineOn: !!sp.engineOn });
    this.lastSafe = { x: sp.x, z: sp.z, h: sp.h };
    def.build?.(this);
    def.steps?.[0]?.enter?.(this);
  }

  dispose() {
    this.def.cleanup?.(this);
    this.game.scene.remove(this.group);
  }

  get step() { return this.def.steps?.[this.stepIdx]; }
  get kmh() { return this.bike.kmh; }

  // ---------- helpers used by lessons ----------
  toast(text, kind = 'info', ms, big) { this.game.hud.toast(text, kind, ms, big); }

  penalty(pts, msg, { key = msg, cooldown = 3 } = {}) {
    if (this.ended) return;
    if (this.cooldowns[key] > this.t) return;
    this.cooldowns[key] = this.t + cooldown;
    this.score = Math.max(0, this.score - pts);
    const m = this.mistakes.find((x) => x.msg === msg);
    if (m) { m.pts += pts; m.count++; } else this.mistakes.push({ msg, pts, count: 1 });
    this.toast(`${msg}  (⁦−${pts}⁩)`, 'warn');
    this.game.audio.buzz();
  }

  fail(msg) {
    if (this.ended) return;
    this.finish(false, msg);
  }

  finish(passedSteps, failMsg = null) {
    this.ended = true;
    this.endTimer = failMsg ? 2.0 : 1.2;
    const passed = passedSteps && !failMsg && this.score >= 70;
    this.result = {
      passed,
      failMsg: failMsg || (passedSteps && this.score < 70 ? 'צברת יותר מדי טעויות — הציון נמוך מ-70.' : null),
      score: failMsg ? 0 : this.score,
      time: this.t,
      mistakes: this.mistakes,
      stats: this.def.resultStats?.(this) || [],
      stars: passed ? (this.score >= 95 ? 3 : this.score >= 85 ? 2 : 1) : 0,
    };
    if (failMsg) {
      this.toast(failMsg, 'bad', 3000, true);
      this.game.audio.buzz();
    } else {
      this.toast('כל הכבוד! סיימת את השיעור', 'good', 2500, true);
      this.game.audio.ding();
    }
  }

  setTarget(x, z) {
    this.target = { x, z };
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = true;
  }
  clearTarget() {
    this.target = null;
    this.beacon.visible = false;
  }
  nearTarget(r = 3.5) {
    return this.target && Math.hypot(this.bike.x - this.target.x, this.bike.z - this.target.z) < r;
  }

  addCone(x, z, color) {
    const g = makeCone(color);
    g.position.set(x, 0, z);
    this.group.add(g);
    const c = { x, z, g, hit: false, fall: 0, dx: 0, dz: 0 };
    this.cones.push(c);
    return c;
  }

  /** Axis aligned stop box: w along x, l along z. */
  addBox(x, z, w, l, color = 0xffd23f) {
    this.group.add(paintRect(x, z, w, l, color, 0.16));
    this.group.add(paintFill(x, z, w, l, color, 0.18));
    return { x, z, w, l };
  }

  /** Both wheels inside the box. */
  inBox(b) {
    const bk = this.bike;
    for (const s of [0.7, -0.7]) {
      const px = bk.x + bk.fwdX * s, pz = bk.z + bk.fwdZ * s;
      if (Math.abs(px - b.x) > b.w / 2 || Math.abs(pz - b.z) > b.l / 2) return false;
    }
    return true;
  }

  stopped() { return Math.abs(this.bike.v) < 0.05; }

  // ---------- per-frame ----------
  onBikeEvent(ev) {
    if (this.ended) return;
    if (ev.type === 'stall') {
      if (this.def.free) this.toast('המנוע כבה. החזק מצמד או העבר לניוטרל ולחץ I', 'warn');
      else this.penalty(5, 'המנוע כבה', { cooldown: 2 });
      setTimeout(() => this.toast('טיפ: לפני עצירה לוחצים מצמד. ביציאה — מעט גז ושחרור הדרגתי של המצמד.', 'info', 4200), 900);
    } else if (ev.type === 'crash') {
      if (this.def.free) {
        this.toast(ev.reason, 'bad', 2600, true);
        this.respawnAt = this.t + 2.6;
      } else {
        this.fail(ev.reason);
      }
    }
  }

  update(dt) {
    const bk = this.bike;
    if (this.ended) {
      this.endTimer -= dt;
      this.animateCones(dt);
      return;
    }
    this.t += dt;

    // free ride respawn after a crash
    if (this.respawnAt && this.t > this.respawnAt) {
      this.respawnAt = null;
      bk.reset(this.lastSafe.x, this.lastSafe.z, this.lastSafe.h, { engineOn: true });
      this.toast('חזרת לנקודה בטוחה', 'info');
    }
    if (!bk.crashed && bk.v > 1 && bk.surface === 'asphalt' && Math.floor(this.t) !== this._safeTick) {
      this._safeTick = Math.floor(this.t);
      this.lastSafe = { x: bk.x, z: bk.z, h: bk.heading };
    }

    // steps
    const steps = this.def.steps;
    if (steps && this.stepIdx < steps.length) {
      const st = steps[this.stepIdx];
      if (st.done(this)) {
        this.stepIdx++;
        if (this.stepIdx < steps.length) {
          this.game.audio.ding();
          steps[this.stepIdx].enter?.(this);
        } else {
          this.clearTarget();
          this.finish(true);
          return;
        }
      }
    }

    this.def.update?.(this, dt);
    if (this.ended) return;

    // cones
    const fx = bk.x + bk.fwdX * 0.85, fz = bk.z + bk.fwdZ * 0.85;
    const rx = bk.x - bk.fwdX * 0.75, rz = bk.z - bk.fwdZ * 0.75;
    for (const c of this.cones) {
      if (c.hit) continue;
      if (segDist(c.x, c.z, rx, rz, fx, fz) < 0.42) {
        c.hit = true;
        const sp = Math.max(1, Math.abs(bk.v));
        c.dx = bk.fwdX * sp * 0.5 + (Math.random() - 0.5);
        c.dz = bk.fwdZ * sp * 0.5 + (Math.random() - 0.5);
        this.penalty(this.def.conePenalty ?? 10, 'פגעת בקונוס', { key: `cone${this.cones.indexOf(c)}`, cooldown: 999 });
        this.game.audio.clunk();
      }
    }
    this.animateCones(dt);

    if (this.noFootDown && bk.footDown && !bk.crashed) {
      this.fail('הורדת רגל לקרקע — בתרגיל הזה צריך לשמור על שיווי משקל בתנועה');
      return;
    }

    if (this.def.timeLimit && this.t > this.def.timeLimit) {
      this.fail('נגמר הזמן לתרגיל');
      return;
    }

    if (this.beacon.visible) {
      const a = this.beacon.userData.arrow;
      a.position.y = 6.6 + Math.sin(this.t * 4) * 0.3;
      a.rotation.y += dt * 2;
      this.beacon.userData.ring.scale.setScalar(1 + Math.sin(this.t * 5) * 0.06);
    }
  }

  animateCones(dt) {
    for (const c of this.cones) {
      if (!c.hit || c.fall >= 1) continue;
      c.fall = Math.min(1, c.fall + dt * 2.5);
      c.g.position.x += c.dx * dt * (1 - c.fall);
      c.g.position.z += c.dz * dt * (1 - c.fall);
      const ang = Math.atan2(c.dx, c.dz);
      c.g.rotation.set(0, 0, 0);
      c.g.rotateY(ang);
      c.g.rotateX(c.fall * Math.PI / 2);
      c.g.position.y = Math.sin(c.fall * Math.PI) * 0.15;
    }
  }
}

export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
