import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { std, phys, mergeStatic } from './util.js';
import { textTexture, learnerSignTexture } from '../textures.js';

let shared = null;
function assets() {
  if (shared) return shared;
  shared = {
    tire: std(0x151515, { roughness: 0.9 }),
    rim: std(0xb8bec4, { metalness: 0.9, roughness: 0.25 }),
    trim: std(0x202226, { roughness: 0.6 }),
    arch: std(0x0c0c0c, { roughness: 0.9, side: THREE.DoubleSide }),
    glass: phys(0x0f151c, { metalness: 0.6, roughness: 0.04, clearcoat: 1 }),
    chrome: std(0xdde2e6, { metalness: 1, roughness: 0.15 }),
    plate: std(0xffffff, { map: textTexture(['55-123-40'], { w: 256, h: 64, bg: '#f7c900', fg: '#111', font: 'bold 44px Arial' }) }),
    learner: std(0xffffff, { map: learnerSignTexture(), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.05 }),
    sideText: std(0xffffff, {
      map: textTexture(['בית ספר לנהיגה'], { w: 512, h: 96, bg: 'rgba(0,0,0,0)', fg: '#c8102e', font: 'bold 56px Heebo, Arial' }),
      transparent: true, roughness: 0.4,
    }),
  };
  return shared;
}

const CAR_COLORS = [0xf2f2f2, 0xdfe3e6, 0xb9c0c7, 0xf2f2f2, 0x1f4e8c, 0x8f1d21, 0x2b2f33];

export function createCar({ color, learner = true } = {}) {
  const A = assets();
  const paint = phys(color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], { metalness: 0.5, roughness: 0.28 });
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.5 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x500000, emissive: 0xff1515, emissiveIntensity: 0.6 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // lower body
  add(new RoundedBoxGeometry(1.78, 0.62, 4.3, 4, 0.18), paint, 0, 0.66, 0);
  // hood & trunk slope
  add(new RoundedBoxGeometry(1.7, 0.18, 1.2, 3, 0.08), paint, 0, 0.98, 1.45).rotation.x = 0.07;
  add(new RoundedBoxGeometry(1.7, 0.16, 0.9, 3, 0.07), paint, 0, 0.98, -1.65).rotation.x = -0.05;
  // cabin: side profile extruded across the width
  const prof = new THREE.Shape();
  prof.moveTo(-1.25, 0); prof.lineTo(1.0, 0); prof.lineTo(0.35, 0.52); prof.lineTo(-0.95, 0.52); prof.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(prof, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  cabGeo.translate(0, 0, -0.75);
  const cab = add(cabGeo, A.glass, 0, 0.98, -0.1);
  cab.rotation.y = -Math.PI / 2;
  // roof + pillars
  add(new RoundedBoxGeometry(1.58, 0.07, 1.42, 3, 0.03), paint, 0, 1.52, -0.42);
  for (const sx of [-0.78, 0.78]) {
    const a = add(new THREE.BoxGeometry(0.06, 0.62, 0.08), paint, sx, 1.24, 0.6);
    a.rotation.x = -0.9;
    add(new THREE.BoxGeometry(0.06, 0.55, 0.1), paint, sx, 1.24, -0.38);
    const c = add(new THREE.BoxGeometry(0.06, 0.6, 0.1), paint, sx, 1.24, -1.1);
    c.rotation.x = 0.55;
  }
  // bumpers, grille, lights, mirrors
  add(new RoundedBoxGeometry(1.82, 0.22, 0.25, 3, 0.08), A.trim, 0, 0.42, 2.1);
  add(new RoundedBoxGeometry(1.82, 0.22, 0.25, 3, 0.08), A.trim, 0, 0.42, -2.1);
  add(new RoundedBoxGeometry(0.8, 0.14, 0.05, 2, 0.03), A.trim, 0, 0.72, 2.16);
  for (const sx of [-0.62, 0.62]) {
    const h = add(new RoundedBoxGeometry(0.36, 0.12, 0.06, 2, 0.03), head, sx, 0.8, 2.14);
    h.userData.dynamic = true;
    const t = add(new RoundedBoxGeometry(0.34, 0.12, 0.06, 2, 0.03), tail, sx, 0.84, -2.14);
    t.userData.dynamic = true;
    add(new RoundedBoxGeometry(0.06, 0.1, 0.16, 2, 0.02), A.trim, Math.sign(sx) * 0.96, 1.12, 0.7);
    add(new RoundedBoxGeometry(0.02, 0.03, 0.4, 1, 0.01), A.chrome, Math.sign(sx) * 0.9, 0.86, 0.1); // door handles line
  }
  add(new THREE.BoxGeometry(0.5, 0.11, 0.01), A.plate, 0, 0.55, 2.23);
  add(new THREE.BoxGeometry(0.5, 0.11, 0.01), A.plate, 0, 0.6, -2.23).rotation.y = Math.PI;
  // wheel arches
  for (const z of [1.35, -1.35]) for (const sx of [-0.86, 0.86]) {
    // half pipe over the wheel (axis along x, open side down)
    const archGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 20, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
    const arch = add(archGeo, A.arch, sx, 0.36, z);
    arch.castShadow = false;
  }
  if (learner) {
    const sign = add(new RoundedBoxGeometry(0.62, 0.3, 0.3, 2, 0.04), std(0xffffff, { roughness: 0.5 }), 0, 1.72, -0.35);
    sign.castShadow = true;
    for (const [z, ry] of [[-0.35 + 0.152, 0], [-0.35 - 0.152, Math.PI]]) {
      const p = add(new THREE.PlaneGeometry(0.26, 0.26), A.learner, 0, 1.72, z);
      p.rotation.y = ry;
    }
    for (const sx of [-1, 1]) {
      const t = add(new THREE.PlaneGeometry(1.5, 0.28), A.sideText, sx * 0.905, 0.75, -0.2);
      t.rotation.y = sx * Math.PI / 2;
      t.castShadow = false;
    }
  }

  const wheels = [];
  for (const z of [1.35, -1.35]) for (const sx of [-0.8, 0.8]) {
    const w = new THREE.Group();
    w.position.set(sx, 0.33, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 24).rotateZ(Math.PI / 2), A.tire);
    tire.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.23, 10).rotateZ(Math.PI / 2), A.rim);
    w.add(tire, rim);
    root.add(w);
    wheels.push(w);
  }

  mergeStatic(body, { receiveShadow: true });

  function update(v, dt, braking) {
    for (const w of wheels) w.rotation.x += (v / 0.33) * dt;
    tail.emissiveIntensity = braking ? 5 : 0.6;
  }
  return { root, update };
}
