import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { std } from './util.js';

const SKINS = [0xe8b896, 0xd9a07a, 0xc08060, 0x9a6444, 0x6e4630, 0xf0c8a8];
const HAIR = [0x1c1410, 0x3a2416, 0x5a3a1e, 0x8a6a3a, 0x2a2a2a, 0xb0a090];
const SHIRTS = [0x2b6cb0, 0xe53e3e, 0x38a169, 0xf6e05e, 0xffffff, 0x805ad5, 0xed8936, 0x1a202c, 0x4fd1c5, 0xd53f8c];
const PANTS = [0x2d3748, 0x1a365d, 0x4a5568, 0x744210, 0x171923, 0x2c5282];

const geo = {};
function g(key, make) { return geo[key] || (geo[key] = make()); }

/**
 * Articulated low-poly person. Joints are groups so we can animate walk / idle / gestures.
 * opts: role ('pedestrian' | 'instructor'), seed
 */
export function createHuman(opts = {}) {
  let s = opts.seed ?? Math.floor(Math.random() * 1e6);
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const instructor = opts.role === 'instructor';
  const female = r() < 0.45;

  const skin = std(pick(SKINS), { roughness: 0.65 });
  const hair = std(pick(HAIR), { roughness: 0.8 });
  const shirt = std(instructor ? 0x2a4365 : pick(SHIRTS), { roughness: 0.85 });
  const pants = std(instructor ? 0x1a202c : pick(PANTS), { roughness: 0.9 });
  const shoe = std(r() < 0.5 ? 0x111111 : 0xf2f2f2, { roughness: 0.6 });
  const vest = instructor ? std(0xf2ff1a, { roughness: 0.7, emissive: 0xc8ff00, emissiveIntensity: 0.15 }) : null;
  const height = (female ? 0.94 : 1) * (0.95 + r() * 0.1);

  const mesh = (geometry, mat, x = 0, y = 0, z = 0, parent) => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const jointG = (parent, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };

  const root = new THREE.Group();
  const body = jointG(root, 0, 0, 0);
  body.scale.setScalar(height);
  const hips = jointG(body, 0, 0.94, 0);
  mesh(g('pelvis', () => new RoundedBoxGeometry(0.3, 0.16, 0.18, 2, 0.05)), pants, 0, 0, 0, hips);
  const spine = jointG(hips, 0, 0.06, 0);
  const torsoGeo = g(female ? 'torsoF' : 'torsoM', () => new THREE.CapsuleGeometry(female ? 0.14 : 0.16, 0.3, 6, 14));
  const torso = mesh(torsoGeo, shirt, 0, 0.24, 0, spine);
  torso.scale.set(1.05, 1, 0.62);
  if (vest) {
    const v = mesh(torsoGeo, vest, 0, 0.22, 0, spine);
    v.scale.set(1.12, 0.88, 0.7);
    for (const y of [0.12, 0.24]) {
      const strip = mesh(g('strip', () => new THREE.CylinderGeometry(0.172, 0.172, 0.03, 18, 1, true)), std(0xdddddd, { metalness: 0.8, roughness: 0.25 }), 0, y, 0, spine);
      strip.scale.set(1.1, 1, 0.7);
    }
  }
  const neck = jointG(spine, 0, 0.5, 0);
  mesh(g('neck', () => new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10)), skin, 0, 0.02, 0, neck);
  const head = jointG(neck, 0, 0.08, 0);
  const skull = mesh(g('head', () => new THREE.SphereGeometry(0.105, 20, 16)), skin, 0, 0.09, 0, head);
  skull.scale.set(0.92, 1.08, 1);
  const hairM = mesh(g(female ? 'hairF' : 'hairM', () => new THREE.SphereGeometry(female ? 0.115 : 0.11, 20, 12, 0, Math.PI * 2, 0, female ? 1.9 : 1.45)), hair, 0, 0.11, -0.012, head);
  hairM.scale.set(0.95, 1.05, 1.03);
  if (female) {
    const tail = mesh(g('ponytail', () => new THREE.CapsuleGeometry(0.04, 0.12, 4, 8)), hair, 0, 0.05, -0.11, head);
    tail.rotation.x = 0.4;
  }
  for (const sx of [-1, 1]) mesh(g('eye', () => new THREE.SphereGeometry(0.012, 8, 6)), std(0x111111), sx * 0.035, 0.1, 0.092, head);
  mesh(g('nose', () => new THREE.ConeGeometry(0.014, 0.035, 6).rotateX(Math.PI / 2)), skin, 0, 0.075, 0.105, head);
  if (instructor || r() < 0.2) {
    const capMat = std(instructor ? 0x1a202c : pick(SHIRTS), { roughness: 0.8 });
    mesh(g('cap', () => new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, 1.4)), capMat, 0, 0.12, 0, head);
    const brim = mesh(g('brim', () => new THREE.CylinderGeometry(0.08, 0.08, 0.012, 16, 1, false, -Math.PI / 2, Math.PI)), capMat, 0, 0.135, 0.07, head);
    brim.scale.z = 1.2;
  }

  const limb = (parent, r1, r2, len, mat) => {
    const m = mesh(g(`limb${r1}${r2}${len}`, () => new THREE.CapsuleGeometry((r1 + r2) / 2, len, 4, 10)), mat, 0, -len / 2 - 0.02, 0, parent);
    return m;
  };
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = jointG(spine, sx * (female ? 0.17 : 0.2), 0.44, 0);
    limb(sh, 0.062, 0.054, 0.22, shirt);
    const el = jointG(sh, 0, -0.28, 0);
    limb(el, 0.05, 0.044, 0.2, skin);
    const hand = mesh(g('hand', () => new THREE.SphereGeometry(0.042, 10, 8)), skin, 0, -0.27, 0, el);
    hand.scale.set(0.8, 1.1, 0.7);
    sh.rotation.z = sx * 0.08;
    arms.push({ sh, el, sx });
  }
  if (instructor) {
    const board = mesh(g('clip', () => new RoundedBoxGeometry(0.22, 0.3, 0.02, 1, 0.005)), std(0x8b5a2b, { roughness: 0.7 }), 0, -0.25, 0.08, arms[0].el);
    board.rotation.x = -0.6;
    mesh(g('paper', () => new THREE.PlaneGeometry(0.19, 0.25)), std(0xffffff), 0, -0.248, 0.093, arms[0].el).rotation.x = -0.6;
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = jointG(hips, sx * 0.09, -0.04, 0);
    limb(hip, 0.088, 0.07, 0.32, pants);
    const knee = jointG(hip, 0, -0.43, 0);
    limb(knee, 0.066, 0.056, 0.32, pants);
    const ankle = jointG(knee, 0, -0.43, 0);
    mesh(g('shoe', () => new RoundedBoxGeometry(0.1, 0.07, 0.24, 2, 0.03)), shoe, 0, -0.035, 0.04, ankle);
    legs.push({ hip, knee, ankle });
  }

  // ---------- animation ----------
  let phase = r() * 10;
  let t = r() * 10;
  let gesture = 0, gestureT = 2 + r() * 6;
  const look = new THREE.Vector3();
  function update(dt, { speed = 0, lookAt = null, wave = false, sit = false } = {}) {
    t += dt;
    if (sit) {
      hips.position.y = 0.5;
      for (const l of legs) { l.hip.rotation.x = -1.5; l.knee.rotation.x = 1.45; l.ankle.rotation.x = 0; }
      for (const a of arms) { a.sh.rotation.x = -0.35; a.el.rotation.x = -0.9; }
      head.rotation.y = Math.sin(t * 0.3) * 0.6;
      spine.scale.set(1, 1 + Math.sin(t * 1.6) * 0.008, 1);
      return;
    }
    if (speed > 0.05) {
      phase += dt * speed * 4.2;
      const sw = Math.sin(phase);
      legs[0].hip.rotation.x = sw * 0.55;
      legs[1].hip.rotation.x = -sw * 0.55;
      legs[0].knee.rotation.x = Math.max(0, -Math.cos(phase)) * 0.9;
      legs[1].knee.rotation.x = Math.max(0, Math.cos(phase)) * 0.9;
      legs[0].ankle.rotation.x = -legs[0].knee.rotation.x * 0.3;
      legs[1].ankle.rotation.x = -legs[1].knee.rotation.x * 0.3;
      arms[0].sh.rotation.x = -sw * 0.45;
      arms[1].sh.rotation.x = sw * 0.45;
      arms[0].el.rotation.x = -0.35;
      arms[1].el.rotation.x = -0.35;
      hips.position.y = 0.94 + Math.abs(Math.cos(phase)) * 0.03;
      spine.rotation.y = sw * 0.08;
      head.rotation.y *= 0.9;
    } else {
      // idle: breathe, shift weight, look around / at a target
      for (const l of legs) { l.hip.rotation.x *= 0.9; l.knee.rotation.x *= 0.9; l.ankle.rotation.x *= 0.9; }
      hips.position.y = 0.94;
      hips.rotation.z = Math.sin(t * 0.6) * 0.03;
      spine.rotation.z = -hips.rotation.z * 0.8;
      spine.scale.set(1, 1 + Math.sin(t * 1.6) * 0.008, 1);
      if (lookAt) {
        root.worldToLocal(look.copy(lookAt));
        const yaw = Math.atan2(look.x, look.z);
        const clamped = Math.max(-1.1, Math.min(1.1, yaw));
        head.rotation.y += (clamped - head.rotation.y) * Math.min(1, dt * 3);
        spine.rotation.y += (clamped * 0.3 - spine.rotation.y) * Math.min(1, dt * 2);
      } else {
        head.rotation.y = Math.sin(t * 0.4) * 0.5;
      }
      // occasional gesture with the free (right) arm, or waving on request
      gestureT -= dt;
      if (gestureT < 0) { gesture = 2.2; gestureT = 6 + r() * 10; }
      if (wave) gesture = Math.max(gesture, 0.5);
      gesture = Math.max(0, gesture - dt);
      const a = arms[1];
      const up = Math.min(1, gesture * 2) * Math.min(1, 1);
      a.sh.rotation.x += ((-1.5 * up) - a.sh.rotation.x) * Math.min(1, dt * 6);
      a.sh.rotation.z += ((a.sx * (0.08 + up * 0.25)) - a.sh.rotation.z) * Math.min(1, dt * 6);
      a.el.rotation.x = -0.2 - up * 0.3 + (wave ? Math.sin(t * 9) * 0.4 * up : 0);
      const b = arms[0];
      b.sh.rotation.x += ((instructor ? -0.5 : 0) - b.sh.rotation.x) * Math.min(1, dt * 4);
      b.el.rotation.x += ((instructor ? -1.1 : -0.1) - b.el.rotation.x) * Math.min(1, dt * 4);
    }
  }

  return { root, update };
}
