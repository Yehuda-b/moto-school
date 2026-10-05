import * as THREE from 'three';
import { createMotorcycle } from './models/motorcycle.js';
import { createHuman } from './models/human.js';
import { createCar } from './models/car.js';
import { makeCone, RING, ROAD_HALF, WALK_W, CURB_H } from './world.js';
import { rng } from './textures.js';

const G = 9.81;

/** Closed polyline sampled densely, addressed by arc length. */
class PolyPath {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      this.cum.push(this.cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.length = this.cum[pts.length];
  }
  at(s) {
    s = ((s % this.length) + this.length) % this.length;
    let lo = 0, hi = this.pts.length;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[(lo + 1) % this.pts.length];
    const seg = this.cum[lo + 1] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    return { x: a[0] + dx * t, z: a[1] + dz * t, h: Math.atan2(dx, dz) };
  }
}

/** Rounded rectangle path; dir=1 travels +x along the -z side. */
function roundedRect(half, rc, dir, step = 1) {
  const pts = [];
  // corner arc centers with the arc start angle, in travel order for dir = 1
  const centers = [[half, -half, -Math.PI / 2], [half, half, 0], [-half, half, Math.PI / 2], [-half, -half, Math.PI]]
    .map(([cx, cz, a0]) => [cx - Math.sign(cx) * rc, cz - Math.sign(cz) * rc, a0]);
  for (let c = 0; c < 4; c++) {
    const [ox, oz, a0] = centers[c];
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * (Math.PI / 2);
      pts.push([ox + Math.cos(a) * rc, oz + Math.sin(a) * rc]);
    }
    const [nx, nz, na0] = centers[(c + 1) % 4];
    const ex = ox + Math.cos(a0 + Math.PI / 2) * rc, ez = oz + Math.sin(a0 + Math.PI / 2) * rc;
    const sx = nx + Math.cos(na0) * rc, sz = nz + Math.sin(na0) * rc;
    const n = Math.max(1, Math.floor(Math.hypot(sx - ex, sz - ez) / step));
    for (let k = 1; k < n; k++) pts.push([ex + (sx - ex) * (k / n), ez + (sz - ez) * (k / n)]);
  }
  return dir > 0 ? pts : pts.reverse();
}

function curvePath(points, step = 0.5) {
  const c = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const n = Math.ceil(c.getLength() / step);
  return new PolyPath(c.getSpacedPoints(n).slice(0, -1).map((p) => [p.x, p.z]));
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class NPCs {
  constructor(scene, world, prepare) {
    this.scene = scene;
    this.world = world;
    this.riders = [];
    this.cars = [];
    this.walkers = [];
    this.statics = [];
    this.r = rng(2024);
    this.player = { x: 0, z: 0, v: 0, head: new THREE.Vector3() };
    this.lessonInstructor = null;

    this.buildLotPractice();
    this.buildTraffic();
    this.buildPedestrians();
    this.buildStaff();
    prepare?.(scene);
  }

  // ---------- learner riders practicing in the east part of the lot ----------
  buildLotPractice() {
    const W = this.world;
    const cone = (x, z, c) => {
      const m = makeCone(c);
      m.position.set(x, 0, z);
      this.scene.add(m);
      W.circles.push({ x, z, r: 0.17 });
    };
    // A) oval track with boundary cones
    const oval = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      oval.push([37 + Math.cos(a) * 10, 30 + Math.sin(a) * 15]);
    }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      cone(37 + Math.cos(a) * 5.5, 30 + Math.sin(a) * 10.5, 0x2d7ff9);
    }
    const ovalPath = curvePath(oval);
    // B) slalom up, wide return down
    const sl = [];
    for (let z = -50; z <= -14; z += 2) sl.push([36 + 1.7 * Math.cos(Math.PI * (z + 46) / 5), z]);
    sl.push([39, -9], [45, -8], [49, -13], [49, -30], [48, -48], [44, -54], [38, -54]);
    for (let i = 0; i < 7; i++) cone(36, -46 + i * 5);
    const slalomPath = curvePath(sl);
    // C) tight U-turn circle
    const circ = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; circ.push([40 + Math.cos(a) * 6.5, 2 + Math.sin(a) * 6.5]); }
    cone(40, 2, 0xffd000);
    const circPath = curvePath(circ);

    const palette = [
      { paint: 0x1d5fbf, jacket: 0x2b2b2b, helmet: 0xffffff, vest: 0xf5ff1a },
      { paint: 0xf2f2f2, jacket: 0x7a1f1f, helmet: 0x111111, vest: 0xff7a00 },
      { paint: 0x2a9d4b, jacket: 0x1f3a5f, helmet: 0xffd000, vest: 0xf5ff1a },
      { paint: 0xf28c28, jacket: 0x333333, helmet: 0xe53e3e, vest: 0xf5ff1a },
      { paint: 0x7a2bd1, jacket: 0x204060, helmet: 0xffffff, vest: 0xff7a00 },
    ];
    const add = (path, s0, speed, look, pauseAt, i) => {
      const model = createMotorcycle({ ...palette[i % palette.length], learner: true });
      this.scene.add(model.root);
      const rider = { model, path, s: s0, v: 0, speed, pauseAt, pause: 0, paused: false, heading: 0, lean: 0, yawPrev: null, x: 0, z: 0, wobble: this.r() * 10, look };
      rider.dyn = { x: 0, z: 0, r: 0.55, reason: 'התנגשת בתלמיד אחר!' };
      this.world.dynamic.push(rider.dyn);
      this.riders.push(rider);
    };
    add(ovalPath, 0, 5.5, 8, 0.0, 0);
    add(ovalPath, ovalPath.length * 0.5, 4.5, 8, 0.5, 1);
    add(slalomPath, 0, 3.6, 6, 0.95, 2);
    add(slalomPath, slalomPath.length * 0.55, 4.0, 6, 0.4, 3);
    add(circPath, 0, 3.2, 4, 0.0, 4);
  }

  updateRiders(dt) {
    const P = this.player;
    for (const r of this.riders) {
      const cur = r.path.at(r.s);
      // curvature-limited speed: look ahead a few meters
      const ahead = r.path.at(r.s + r.look);
      const turn = Math.abs(wrapAngle(ahead.h - cur.h));
      let target = Math.min(r.speed, Math.sqrt((0.32 * G * r.look) / Math.max(0.05, turn)));
      // periodic stop: the student waits for the instructor's signal
      const u = (r.s % r.path.length) / r.path.length;
      if (!r.paused && Math.abs(u - r.pauseAt) < 0.004 && r.pause <= 0) { r.paused = true; r.pause = 2.5 + this.r() * 3; }
      if (r.paused) {
        target = 0;
        if (r.v < 0.05) { r.pause -= dt; if (r.pause <= 0) { r.paused = false; r.s += 0.5; } }
      }
      // yield to the player and to other riders ahead on the same path
      const fx = Math.sin(cur.h), fz = Math.cos(cur.h);
      const dx = P.x - cur.x, dz = P.z - cur.z;
      const fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
      if (fwd > 0 && fwd < 9 && lat < 2.2) target = Math.min(target, Math.max(0, (fwd - 3) * 0.8));
      for (const o of this.riders) {
        if (o === r || o.path !== r.path) continue;
        const gap = ((o.s - r.s) % r.path.length + r.path.length) % r.path.length;
        if (gap < 7) target = Math.min(target, Math.max(0, gap - 3.5) * 0.8);
      }
      r.v += Math.max(-4 * dt, Math.min(1.8 * dt, target - r.v));
      r.s += r.v * dt;
      const p = r.path.at(r.s);
      const yaw = r.yawPrev == null ? 0 : wrapAngle(p.h - r.yawPrev) / Math.max(dt, 1e-3);
      r.yawPrev = p.h;
      r.x = p.x; r.z = p.z; r.heading = p.h;
      const footDown = r.v < 0.35;
      let leanT = footDown ? -0.09 : Math.atan((r.v * -yaw) / G);
      leanT += Math.sin((r.wobble += dt * 2.3)) * 0.015 * Math.min(1, r.v);
      r.lean += (leanT - r.lean) * Math.min(1, dt * 5);
      r.dyn.x = p.x; r.dyn.z = p.z;
      const m = r.model;
      m.root.position.set(p.x, 0, p.z);
      m.root.rotation.y = p.h;
      m.update({ lean: r.lean, steerVis: Math.max(-0.4, Math.min(0.4, -yaw * 0.12)), v: r.v, footDown, braking: target < r.v - 0.2, engineOn: true, blinkLeft: false, blinkRight: false }, dt);
    }
  }

  // ---------- driving-school cars on the ring road ----------
  buildTraffic() {
    const inner = new PolyPath(roundedRect(RING - ROAD_HALF / 2, 9, 1));
    const outer = new PolyPath(roundedRect(RING + ROAD_HALF / 2, 11, -1));
    const add = (path, s, dirSign) => {
      const model = createCar({});
      this.scene.add(model.root);
      const car = { model, path, s, v: 8, dir: dirSign, x: 0, z: 0, h: path.at(s).h, braking: false, cruise: 10 + this.r() * 3 };
      car.dyn = [0, 1, 2].map(() => ({ x: 0, z: 0, r: 0.95, reason: 'התנגשת ברכב!' }));
      this.world.dynamic.push(...car.dyn);
      this.cars.push(car);
    };
    for (let i = 0; i < 4; i++) add(inner, inner.length * (i / 4 + 0.05), 1);
    for (let i = 0; i < 4; i++) add(outer, outer.length * (i / 4 + 0.15), -1);
  }

  updateCars(dt) {
    const P = this.player;
    const light = this.world.cityLight;
    const R = RING;
    for (const c of this.cars) {
      const cur = c.path.at(c.s);
      const fx = Math.sin(cur.h), fz = Math.cos(cur.h);
      let stopDist = Infinity;
      // corners
      const ahead = c.path.at(c.s + 14);
      const turn = Math.abs(wrapAngle(ahead.h - cur.h));
      let target = turn > 0.25 ? 5.5 : c.cruise;
      // traffic light at the crosswalk on the south road
      if (light.state !== 'green' && Math.abs(cur.z + R) < ROAD_HALF + 1) {
        const lineX = c.dir > 0 ? 71.4 : 78.6;
        const dist = (lineX - cur.x) * Math.sign(fx) - 2.4;
        const committed = light.state === 'yellow' && dist < 6;
        if (dist > -1 && dist < 40 && !committed) stopDist = Math.min(stopDist, dist);
      }
      // the player
      const dx = P.x - cur.x, dz = P.z - cur.z;
      const fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
      if (fwd > 0 && fwd < 26 && lat < 2.6) stopDist = Math.min(stopDist, fwd - 8); // leave room for the chase camera
      // people on the crosswalk
      for (const p of this.crossers) {
        const px = p.x - cur.x, pz = p.z - cur.z;
        const pf = px * fx + pz * fz, pl = Math.abs(px * fz - pz * fx);
        if (pf > 0 && pf < 18 && pl < 3) stopDist = Math.min(stopDist, pf - 4);
      }
      // cars ahead
      for (const o of this.cars) {
        if (o === c || o.path !== c.path) continue;
        const gap = ((o.s - c.s) % c.path.length + c.path.length) % c.path.length;
        if (gap < 30) stopDist = Math.min(stopDist, gap - 9);
      }
      if (stopDist < Infinity) target = Math.min(target, Math.sqrt(2 * 3.5 * Math.max(0, stopDist)));
      const prevV = c.v;
      c.v += Math.max(-7 * dt, Math.min(2.2 * dt, target - c.v));
      if (stopDist < 0.3) c.v = Math.min(c.v, 0);
      c.v = Math.max(0, c.v);
      c.braking = c.v < prevV - 0.5 * dt || c.v < 0.1;
      c.s += c.v * dt;
      const p = c.path.at(c.s);
      // smooth heading so corners don't snap
      c.h = c.h + wrapAngle(p.h - c.h) * Math.min(1, dt * 8);
      c.x = p.x; c.z = p.z;
      c.model.root.position.set(p.x, 0, p.z);
      c.model.root.rotation.y = c.h;
      c.model.update(c.v, dt, c.braking);
      const sx = Math.sin(c.h), sz = Math.cos(c.h);
      c.dyn.forEach((d, i) => { d.x = p.x + sx * (i - 1) * 1.35; d.z = p.z + sz * (i - 1) * 1.35; });
    }
  }

  // ---------- pedestrians ----------
  buildPedestrians() {
    const off = RING + ROAD_HALF + WALK_W / 2;
    const cw = new PolyPath(roundedRect(off + 0.5, 3, 1, 2));
    const ccw = new PolyPath(roundedRect(off - 0.5, 3, -1, 2));
    for (let i = 0; i < 18; i++) {
      const path = i % 2 ? cw : ccw;
      const h = createHuman({ seed: 100 + i });
      this.scene.add(h.root);
      const w = { h, path, s: this.r() * path.length, speed: 1.0 + this.r() * 0.6, x: 0, z: 0 };
      w.dyn = { x: 0, z: 0, r: 0.35, reason: 'פגעת בהולך רגל!' };
      this.world.dynamic.push(w.dyn);
      this.walkers.push(w);
    }
    // two people who cross at the crosswalk whenever the light is red for cars
    this.crossers = [];
    for (let i = 0; i < 2; i++) {
      const h = createHuman({ seed: 300 + i });
      this.scene.add(h.root);
      const zA = -RING - ROAD_HALF - 1.2, zB = -RING + ROAD_HALF + 1.2;
      const c = { h, x: 74.6 + i * 0.9, side: i, zA, zB, z: i ? zB : zA, moving: false, wait: 0 };
      c.dyn = { x: c.x, z: c.z, r: 0.35, reason: 'פגעת בהולך רגל!' };
      this.world.dynamic.push(c.dyn);
      this.crossers.push(c);
    }
  }

  updatePedestrians(dt, cam) {
    for (const w of this.walkers) {
      w.s += w.speed * dt;
      const p = w.path.at(w.s);
      w.x = p.x; w.z = p.z;
      w.dyn.x = p.x; w.dyn.z = p.z;
      const far = Math.hypot(p.x - cam.x, p.z - cam.z) > 150;
      w.h.root.visible = !far;
      if (far) continue;
      w.h.root.position.set(p.x, CURB_H, p.z);
      w.h.root.rotation.y = p.h;
      w.h.update(dt, { speed: w.speed });
    }
    const light = this.world.cityLight;
    for (const c of this.crossers) {
      if (!c.moving && light.state === 'red' && light.t > 1 && light.t < 2.5) c.moving = true;
      let speed = 0;
      if (c.moving) {
        const goal = c.side ? c.zA : c.zB;
        const d = goal - c.z;
        speed = 1.9;
        c.z += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
        c.h.root.rotation.y = d > 0 ? 0 : Math.PI;
        if (Math.abs(d) < 0.05) { c.moving = false; c.side = 1 - c.side; }
      } else {
        c.h.root.rotation.y = c.side ? Math.PI : 0;
      }
      c.h.root.position.set(c.x, this.world.heightAt(c.x, c.z), c.z);
      c.dyn.x = c.x; c.dyn.z = c.z;
      c.h.update(dt, { speed });
    }
  }

  // ---------- instructors and students on the side ----------
  buildStaff() {
    const add = (x, z, opts = {}) => {
      const h = createHuman({ role: opts.role, seed: opts.seed });
      h.root.position.set(x, 0, z);
      h.root.rotation.y = opts.rot ?? 0;
      this.scene.add(h.root);
      this.statics.push({ h, ...opts });
      if (!opts.sit) this.world.circles.push({ x, z, r: 0.3 });
      return h;
    };
    add(24.5, 30, { role: 'instructor', seed: 11, rot: Math.PI / 2, watch: true });
    add(30.5, -30, { role: 'instructor', seed: 12, rot: Math.PI / 2, watch: true });
    add(51, 2, { role: 'instructor', seed: 13, rot: -Math.PI / 2, watch: true });
    add(-25, 48.6, { seed: 21, rot: Math.PI });
    add(-24.2, 48.9, { seed: 22, rot: Math.PI * 0.85 });
    for (const [i, [x, z]] of (this.world.benchSeats || []).entries()) {
      const h = createHuman({ seed: 40 + i });
      h.root.position.set(x, 0, z);
      h.root.rotation.y = Math.PI;
      this.scene.add(h.root);
      this.statics.push({ h, sit: true });
    }
    // parked school bikes next to the office
    for (let i = 0; i < 4; i++) {
      const m = createMotorcycle({ paint: [0x1d5fbf, 0xd62828, 0xf2f2f2, 0x1f1f1f][i], learner: true, rider: false });
      m.root.position.set(-12 + i * 1.6, 0, 55);
      m.root.rotation.y = Math.PI;
      m.update({ lean: -0.12, steerVis: 0.3, v: 0, footDown: false, engineOn: false }, 0);
      this.scene.add(m.root);
      (this.parked ||= []).push(m.root);
      this.world.circles.push({ x: -12 + i * 1.6, z: 55, r: 0.6 });
    }
    // the player's personal instructor (moved per lesson)
    const li = createHuman({ role: 'instructor', seed: 7 });
    li.root.visible = false;
    this.scene.add(li.root);
    this.lessonInstructor = { h: li, active: false, x: 0, z: 0 };
  }

  setLessonInstructor(pos) {
    const L = this.lessonInstructor;
    const idx = this.world.circles.indexOf(L.solid);
    if (idx >= 0) this.world.circles.splice(idx, 1);
    if (!pos) { L.active = false; L.h.root.visible = false; return; }
    L.active = true;
    L.h.root.visible = true;
    L.h.root.position.set(pos[0], this.world.heightAt(pos[0], pos[1]), pos[1]);
    L.solid = { x: pos[0], z: pos[1], r: 0.3 };
    this.world.circles.push(L.solid);
  }

  updateStaff(dt) {
    const target = this.player.head;
    for (const s of this.statics) {
      if (s.sit) { s.h.update(dt, { sit: true }); continue; }
      let look = null;
      if (s.watch) {
        // watch the nearest rider
        let best = Infinity;
        for (const r of this.riders) {
          const d = Math.hypot(r.x - s.h.root.position.x, r.z - s.h.root.position.z);
          if (d < best) { best = d; look = new THREE.Vector3(r.x, 1.3, r.z); }
        }
      }
      s.h.update(dt, { lookAt: look });
    }
    const L = this.lessonInstructor;
    if (L.active) {
      const p = L.h.root.position;
      const yaw = Math.atan2(target.x - p.x, target.z - p.z);
      L.h.root.rotation.y += wrapAngle(yaw - L.h.root.rotation.y) * Math.min(1, dt * 1.5);
      const near = Math.hypot(target.x - p.x, target.z - p.z) < 14;
      L.h.update(dt, { lookAt: target, wave: near && Math.abs(this.player.v) < 0.1 });
    }
  }

  update(dt, cam, bike) {
    this.player.x = bike.x;
    this.player.z = bike.z;
    this.player.v = bike.v;
    this.player.head.set(bike.x, 1.5, bike.z);
    this.updateRiders(dt);
    this.updateCars(dt);
    this.updatePedestrians(dt, cam);
    this.updateStaff(dt);
    this.updateLod(cam);
  }

  /**
   * Cheap LOD: only NPCs close to the camera cast shadows (each caster is drawn once
   * per shadow cascade), and far-away ones are hidden entirely.
   */
  updateLod(cam) {
    if (!this.lod) {
      this.lod = [];
      const reg = (root, hideFar = true) => {
        const casters = [];
        root.traverse((o) => { if (o.isMesh && o.castShadow) casters.push(o); });
        this.lod.push({ root, casters, shadow: true, hideFar, hidden: false });
      };
      for (const r of this.riders) reg(r.model.root);
      for (const c of this.cars) reg(c.model.root);
      for (const w of this.walkers) reg(w.h.root, false);
      for (const c of this.crossers) reg(c.h.root);
      for (const s of this.statics) reg(s.h.root);
      for (const b of this.parked || []) reg(b);
      reg(this.lessonInstructor.h.root, false);
    }
    for (const e of this.lod) {
      const d = Math.hypot(e.root.position.x - cam.x, e.root.position.z - cam.z);
      const shadow = d < 60;
      if (shadow !== e.shadow) {
        e.shadow = shadow;
        for (const m of e.casters) m.castShadow = shadow;
      }
      if (e.hideFar) {
        const hide = d > 230;
        if (hide !== e.hidden) { e.hidden = hide; e.root.visible = !hide; }
      }
    }
  }
}
