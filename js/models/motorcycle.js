import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { V, setLimb, tubeGeo, mergeStatic, std, phys } from './util.js';
import { treadNormal, textTexture, learnerSignTexture } from '../textures.js';

export const WHEEL_R = 0.32;

let shared = null;
function sharedAssets() {
  if (shared) return shared;
  const tread = treadNormal();
  tread.repeat.set(1, 6);
  shared = {
    tire: std(0x141414, { roughness: 0.92, normalMap: tread, normalScale: new THREE.Vector2(0.8, 0.8) }),
    rubber: std(0x1b1b1b, { roughness: 0.9 }),
    chrome: std(0xe8ecef, { metalness: 1, roughness: 0.12 }),
    alloy: std(0x9aa1a8, { metalness: 0.85, roughness: 0.3 }),
    darkMetal: std(0x2a2d31, { metalness: 0.7, roughness: 0.4 }),
    engine: std(0x3a3d42, { metalness: 0.6, roughness: 0.45 }),
    black: std(0x111214, { roughness: 0.55, metalness: 0.2 }),
    seat: std(0x161616, { roughness: 0.75 }),
    gold: std(0xc9a13b, { metalness: 0.9, roughness: 0.25 }),
    red: std(0xb5121b, { metalness: 0.3, roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.35, clearcoat: 1 }),
    plate: std(0xffffff, { map: textTexture(['12-345-67'], { w: 256, h: 128, bg: '#f7c900', fg: '#111', font: 'bold 54px Arial', border: '#111' }), roughness: 0.5 }),
    learner: std(0xffffff, { map: learnerSignTexture(), roughness: 0.5 }),
    skin: std(0xd9a07a, { roughness: 0.7 }),
    glove: std(0x151515, { roughness: 0.8 }),
    boot: std(0x1a1a1a, { roughness: 0.6 }),
    pants: std(0x23252b, { roughness: 0.9 }),
    reflect: std(0xd8d8d8, { metalness: 0.8, roughness: 0.25 }),
  };
  return shared;
}

const PAINTS = [0xd62828, 0x1d5fbf, 0x1f1f1f, 0xf2f2f2, 0x2a9d4b, 0xf28c28, 0x7a2bd1];

/**
 * Detailed procedural motorcycle with rider.
 * opts: paint, jacket, helmet, vest (hi-vis vest color or null), learner (show ל sign)
 */
export function createMotorcycle(opts = {}) {
  const S = sharedAssets();
  const paint = phys(opts.paint ?? PAINTS[0], { metalness: 0.4, roughness: 0.32 });
  const M = {
    paint,
    jacket: std(opts.jacket ?? 0x1f2a3a, { roughness: 0.8 }),
    helmet: phys(opts.helmet ?? 0xf4f4f4, { metalness: 0.15, roughness: 0.2 }),
    visor: phys(0x0b0e12, { metalness: 0.9, roughness: 0.05 }),
    vest: opts.vest ? std(opts.vest, { roughness: 0.7, emissive: opts.vest, emissiveIntensity: 0.12 }) : null,
  };
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 0.4 });
  const blinkMats = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: 0x5a3500, emissive: 0xff9a00, emissiveIntensity: 0 }));
  for (const m of [headMat, tailMat, ...blinkMats]) m.userData.dynamicEmissive = true;

  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const body = new THREE.Group();   // static bodywork (merged)
  lean.add(body);

  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const addGeo = (geo, mat, parent = body) => add(geo, mat, 0, 0, 0, parent);
  const curve = (pts, r, mat, parent = body, seg = 24) =>
    addGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8, false), mat, parent);

  // ---------- wheels ----------
  const makeWheel = (front) => {
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.252, 0.072, 14, 40), S.tire);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    spin.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 36), S.darkMetal);
    rim.rotation.y = Math.PI / 2;
    spin.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 16).rotateZ(Math.PI / 2), S.alloy);
    spin.add(hub);
    for (let i = 0; i < 5; i++) {
      for (const off of [-0.11, 0.11]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.17, 0.028), S.darkMetal);
        s.position.set(0, 0.11, 0);
        const piv = new THREE.Group();
        piv.rotation.x = (i * Math.PI * 2) / 5 + off;
        piv.add(s);
        spin.add(piv);
      }
    }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(front ? 0.15 : 0.12, front ? 0.15 : 0.12, 0.008, 28).rotateZ(Math.PI / 2), S.chrome);
    disc.position.x = 0.07;
    spin.add(disc);
    spin.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const holder = new THREE.Group();
    holder.add(spin);
    // brake caliper (does not spin)
    add(new RoundedBoxGeometry(0.04, 0.09, 0.06, 2, 0.012), S.red, 0.085, front ? 0.13 : 0.1, front ? -0.06 : -0.08, holder);
    return { holder, spin };
  };

  const rear = makeWheel(false);
  rear.holder.position.set(0, WHEEL_R, -0.7);
  lean.add(rear.holder);

  // swingarm, chain, shock
  addGeo(new RoundedBoxGeometry(0.05, 0.07, 0.62, 2, 0.015).translate(0.11, 0.0, 0).rotateX(0.18).translate(0, 0.39, -0.42), S.darkMetal);
  addGeo(new RoundedBoxGeometry(0.05, 0.07, 0.62, 2, 0.015).translate(-0.11, 0.0, 0).rotateX(0.18).translate(0, 0.39, -0.42), S.darkMetal);
  curve([V(-0.075, 0.41, -0.7), V(-0.075, 0.46, -0.06), V(-0.075, 0.37, -0.02), V(-0.075, 0.24, -0.7)], 0.012, S.darkMetal);
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 24).rotateZ(Math.PI / 2), S.alloy, -0.075, WHEEL_R, -0.7);
  // coil-over shock with a helix spring
  const helix = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    helix.push(V(Math.cos(t * Math.PI * 16) * 0.035, t * 0.26, Math.sin(t * Math.PI * 16) * 0.035));
  }
  const spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 120, 0.007, 5, false);
  const springMesh = add(spring, S.red, 0, 0, 0);
  springMesh.position.set(0, 0.5, -0.28);
  springMesh.rotation.x = -0.5;
  addGeo(tubeGeo(0.013, V(0, 0.48, -0.29), V(0, 0.76, -0.14)), S.chrome);

  // ---------- steering assembly ----------
  const steer = new THREE.Group();
  steer.position.set(0, 0, 0.7);
  lean.add(steer);
  const steerBody = new THREE.Group();
  steer.add(steerBody);
  const front = makeWheel(true);
  front.holder.position.set(0, WHEEL_R, 0);
  steer.add(front.holder);
  for (const sx of [-0.095, 0.095]) {
    addGeo(tubeGeo(0.024, V(sx, WHEEL_R + 0.02, 0.01), V(sx, 0.62, -0.08)), S.alloy, steerBody);
    addGeo(tubeGeo(0.02, V(sx, 0.6, -0.075), V(sx, 1.0, -0.21)), S.gold, steerBody);
  }
  add(new RoundedBoxGeometry(0.26, 0.04, 0.09, 2, 0.015), S.alloy, 0, 0.98, -0.2, steerBody);
  addGeo(tubeGeo(0.014, V(-0.38, 1.05, -0.27), V(0.38, 1.05, -0.27)), S.black, steerBody);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.023, 0.023, 0.13, 10).rotateZ(Math.PI / 2), S.rubber, sx * 0.34, 1.05, -0.27, steerBody);
    addGeo(tubeGeo(0.006, V(sx * 0.2, 1.06, -0.25), V(sx * 0.33, 1.07, -0.18)), S.alloy, steerBody); // levers
    addGeo(tubeGeo(0.008, V(sx * 0.24, 1.06, -0.27), V(sx * 0.3, 1.26, -0.3)), S.black, steerBody);
    add(new RoundedBoxGeometry(0.11, 0.06, 0.02, 2, 0.008), S.black, sx * 0.31, 1.28, -0.3, steerBody);
  }
  const fender = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.06, 6, 20, Math.PI * 0.55), paint);
  fender.scale.set(1, 1, 0.9);
  fender.rotation.set(0, Math.PI / 2, Math.PI * 0.22);
  fender.position.set(0, WHEEL_R, 0);
  fender.castShadow = true;
  steerBody.add(fender);
  // headlight + instrument cluster + fly screen
  add(new THREE.CylinderGeometry(0.095, 0.08, 0.12, 24).rotateX(Math.PI / 2), S.black, 0, 0.88, 0.0, steerBody);
  const lens = add(new THREE.CircleGeometry(0.082, 24), headMat, 0, 0.88, 0.061, steerBody);
  lens.userData.dynamic = true;
  add(new RoundedBoxGeometry(0.16, 0.08, 0.05, 2, 0.015), S.black, 0, 1.1, -0.15, steerBody).rotation.x = -0.6;
  const screen = add(new THREE.PlaneGeometry(0.2, 0.16), S.glass, 0, 1.06, -0.03, steerBody);
  screen.rotation.x = -0.45;
  screen.castShadow = false;
  screen.userData.dynamic = true;
  for (const [i, sx] of [[0, -1], [1, 1]]) {
    const b = add(new RoundedBoxGeometry(0.06, 0.035, 0.05, 2, 0.01), blinkMats[i], sx * 0.15, 0.86, 0.0, steerBody);
    b.userData.dynamic = true;
  }

  // ---------- frame, tank, seat, tail ----------
  curve([V(0, 1.0, 0.52), V(0, 0.93, 0.15), V(0, 0.86, -0.25), V(0, 0.88, -0.6)], 0.028, S.darkMetal);
  curve([V(0, 0.98, 0.52), V(0, 0.75, 0.42), V(0, 0.42, 0.26), V(0, 0.33, 0.0)], 0.028, S.darkMetal);
  // tank: sculpted from a squashed sphere plus side shrouds
  const tank = add(new THREE.SphereGeometry(0.2, 32, 20), paint, 0, 0.97, 0.2);
  tank.scale.set(0.9, 0.66, 1.4);
  const shroud = new THREE.Shape();
  shroud.moveTo(0, 0); shroud.lineTo(0.34, 0.04); shroud.quadraticCurveTo(0.42, 0.18, 0.3, 0.28); shroud.lineTo(0.02, 0.2); shroud.closePath();
  const shGeo = new THREE.ExtrudeGeometry(shroud, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3 });
  for (const sx of [-1, 1]) {
    // shape x -> forward, extrusion -> towards -x
    const s = add(shGeo, paint, sx * 0.17 + (sx < 0 ? 0.02 : 0), 0.7, 0.0);
    s.rotation.y = -Math.PI / 2;
  }
  add(new THREE.CircleGeometry(0.045, 20), S.chrome, 0, 1.104, 0.24).rotation.x = -Math.PI / 2 + 0.25; // fuel cap
  add(new RoundedBoxGeometry(0.28, 0.1, 0.62, 3, 0.045), S.seat, 0, 0.9, -0.3);
  const tail = new THREE.Shape();
  tail.moveTo(0, 0); tail.lineTo(0.42, 0.06); tail.lineTo(0.48, 0.12); tail.lineTo(0.0, 0.14); tail.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tail, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3 });
  const tl = add(tailGeo, paint, -0.06, 0.82, -0.52);
  tl.rotation.y = Math.PI / 2;
  const tlight = add(new RoundedBoxGeometry(0.14, 0.05, 0.03, 2, 0.01), tailMat, 0, 0.93, -1.0);
  tlight.userData.dynamic = true;
  for (const [i, sx] of [[0, -1], [1, 1]]) {
    const b = add(new RoundedBoxGeometry(0.05, 0.035, 0.05, 2, 0.01), blinkMats[i], sx * 0.12, 0.86, -0.98);
    b.userData.dynamic = true;
    addGeo(tubeGeo(0.008, V(sx * 0.03, 0.86, -0.95), V(sx * 0.1, 0.86, -0.98)), S.black);
  }
  addGeo(tubeGeo(0.012, V(0, 0.82, -0.9), V(0, 0.68, -1.04)), S.black);
  add(new THREE.BoxGeometry(0.2, 0.1, 0.008), S.plate, 0, 0.66, -1.06).rotation.x = -0.25;
  if (opts.learner) {
    add(new THREE.BoxGeometry(0.17, 0.17, 0.01), S.learner, 0, 1.0, -1.03).rotation.x = -0.1;
  }
  const side = add(new RoundedBoxGeometry(0.25, 0.16, 0.3, 2, 0.03), paint, 0, 0.75, -0.36);
  side.castShadow = true;

  // ---------- engine ----------
  add(new RoundedBoxGeometry(0.3, 0.3, 0.44, 3, 0.05), S.engine, 0, 0.5, 0.05);
  const cyl = add(new RoundedBoxGeometry(0.26, 0.26, 0.2, 2, 0.03), S.engine, 0, 0.73, 0.24);
  cyl.rotation.x = -0.35;
  for (let i = 0; i < 6; i++) {
    const fin = add(new THREE.BoxGeometry(0.33, 0.012, 0.23), S.alloy, 0, 0.62 + i * 0.04, 0.27 - i * 0.014);
    fin.rotation.x = -0.35;
  }
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 24).rotateZ(Math.PI / 2), S.alloy, -0.16, 0.5, 0.08); // clutch cover
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 24).rotateZ(Math.PI / 2), S.alloy, 0.16, 0.46, 0.02);
  // exhaust: header curve + muffler
  curve([V(0.05, 0.7, 0.36), V(0.12, 0.45, 0.4), V(0.16, 0.3, 0.15), V(0.17, 0.33, -0.2), V(0.18, 0.42, -0.36)], 0.028, S.chrome, body, 40);
  addGeo(tubeGeo(0.062, V(0.19, 0.42, -0.34), V(0.2, 0.6, -0.86), 20, 0.055), S.alloy);
  addGeo(tubeGeo(0.035, V(0.2, 0.6, -0.86), V(0.2, 0.615, -0.9), 16), S.black);
  addGeo(tubeGeo(0.014, V(-0.26, 0.4, -0.1), V(0.26, 0.4, -0.1)), S.alloy); // pegs

  // ---------- rider ----------
  const rider = new THREE.Group();
  lean.add(rider);
  const riderBody = new THREE.Group();
  rider.add(riderBody);
  const cap = (r, len, mat) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 12), mat);
    m.castShadow = true;
    return m;
  };
  add(new RoundedBoxGeometry(0.34, 0.2, 0.3, 3, 0.07), S.pants, 0, 1.0, -0.32, riderBody);
  const torso = cap(0.17, 0.3, M.jacket);
  torso.scale.set(1.05, 1, 0.72);
  torso.position.set(0, 1.25, -0.2);
  torso.rotation.x = 0.45;
  riderBody.add(torso);
  if (M.vest) {
    const vest = cap(0.178, 0.24, M.vest);
    vest.scale.set(1.06, 1, 0.75);
    vest.position.set(0, 1.25, -0.2);
    vest.rotation.x = 0.45;
    riderBody.add(vest);
    for (const dy of [-0.05, 0.07]) {
      const strip = new THREE.Mesh(new THREE.CylinderGeometry(0.183, 0.183, 0.03, 20, 1, true), S.reflect);
      strip.scale.set(1.06, 1, 0.76);
      strip.position.set(0, 1.25 + dy * Math.cos(0.45), -0.2 + dy * Math.sin(0.45));
      strip.rotation.x = 0.45;
      riderBody.add(strip);
    }
  }
  add(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 12), M.jacket, 0, 1.53, -0.04, riderBody);
  const helmet = add(new THREE.SphereGeometry(0.155, 28, 20), M.helmet, 0, 1.66, 0.0, riderBody);
  helmet.scale.set(1, 1.02, 1.12);
  const chin = add(new THREE.TorusGeometry(0.13, 0.04, 8, 20, Math.PI * 0.9), M.helmet, 0, 1.585, 0.02, riderBody);
  chin.rotation.set(Math.PI / 2, 0, Math.PI * 0.05);
  const visor = add(new THREE.SphereGeometry(0.158, 24, 12, -1.0, 2.0, 1.15, 0.55), M.visor, 0, 1.66, 0.012, riderBody);
  visor.scale.set(1, 1.02, 1.12);
  add(new RoundedBoxGeometry(0.035, 0.05, 0.28, 2, 0.012), S.red, 0, 1.82, -0.02, riderBody);

  const limbMesh = (r, mat) => {
    // unit-length cylinder stretched per frame; spheres at the joints hide the seams
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 1, 12), mat);
    m.castShadow = true;
    rider.add(m);
    return m;
  };
  const joint = (r, mat) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
    m.castShadow = true;
    rider.add(m);
    return m;
  };
  const limbs = {
    arm: [-1, 1].map(() => ({ up: limbMesh(0.068, M.jacket), lo: limbMesh(0.058, M.jacket), elbow: joint(0.064, M.jacket), hand: joint(0.056, S.glove) })),
    leg: [-1, 1].map(() => ({ up: limbMesh(0.098, S.pants), lo: limbMesh(0.074, S.pants), knee: joint(0.085, S.pants), boot: (() => { const b = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.11, 0.26, 2, 0.03), S.boot); b.castShadow = true; rider.add(b); return b; })() })),
  };

  mergeStatic(body);
  mergeStatic(steerBody);
  mergeStatic(riderBody);
  mergeStatic(front.spin);
  mergeStatic(rear.spin);
  if (opts.rider === false) rider.visible = false;

  // ---------- pose / animation ----------
  let footBlend = 1;
  const _g = V(), _sh = V(), _el = V(), _hip = V(), _knee = V(), _foot = V();
  function update(st, dt) {
    lean.rotation.z = st.lean;
    steer.rotation.y = -(st.steerVis || 0);
    const spinA = (st.v / WHEEL_R) * dt;
    front.spin.rotation.x += spinA;
    rear.spin.rotation.x += spinA;

    tailMat.emissiveIntensity = st.braking ? 6 : 0.6;
    blinkMats[0].emissiveIntensity = st.blinkLeft ? 6 : 0;
    blinkMats[1].emissiveIntensity = st.blinkRight ? 6 : 0;
    headMat.emissiveIntensity = st.engineOn ? 3.5 : 0.15;

    const s = -(st.steerVis || 0);
    for (const [i, side] of [[0, -1], [1, 1]]) {
      const lx = side * 0.33, lz = -0.27;
      _g.set(lx * Math.cos(s) + lz * Math.sin(s), 1.05, 0.7 - lx * Math.sin(s) + lz * Math.cos(s));
      _sh.set(side * 0.2, 1.44, -0.08);
      _el.copy(_sh).lerp(_g, 0.5).add(V(side * 0.1, -0.07, -0.05));
      const a = limbs.arm[i];
      setLimb(a.up, _sh, _el);
      setLimb(a.lo, _el, _g);
      a.elbow.position.copy(_el);
      a.hand.position.copy(_g);
    }
    footBlend += ((st.footDown ? 1 : 0) - footBlend) * Math.min(1, dt * 7);
    for (const [i, side] of [[0, -1], [1, 1]]) {
      _hip.set(side * 0.13, 0.98, -0.3);
      _knee.set(side * 0.22, 0.88, 0.08);
      _foot.set(side * 0.2, 0.42, -0.13);
      if (side < 0 && footBlend > 0.01) {
        _knee.lerp(V(-0.3, 0.6, 0.02), footBlend);
        _foot.lerp(V(-0.44, 0.07, 0.03), footBlend);
      }
      const l = limbs.leg[i];
      setLimb(l.up, _hip, _knee);
      setLimb(l.lo, _knee, _foot);
      l.knee.position.copy(_knee);
      l.boot.position.copy(_foot).add(V(0, -0.02, 0.06));
    }
  }

  return { root, lean, rider, update, materials: { headMat, tailMat, blinkMats, paint }, headAnchor: V(0, 1.7, 0.1) };
}

export { PAINTS };
