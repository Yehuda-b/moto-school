import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { safeMerge as mergeGeometries } from './models/util.js';
import {
  rng, canvas, toTexture, asphaltSet, grassGroundSet, paversSet, facadeSet, shopfrontTexture,
  cloudTexture, textTexture, fbmField,
} from './textures.js';
import { std, phys } from './models/util.js';

export { rng, textTexture };

// Layout (meters): training lot in the middle, a ring road around it and a connector road heading -z.
export const LOT = 60;
export const RING = 150;
export const ROAD_HALF = 5;
export const WALK_W = 3;          // sidewalk width
export const CURB_H = 0.14;
export const WORLD_HALF = 320;

// ---------- ground paint helpers (used by lessons too) ----------
const paintMats = {};
export function paintMaterial(color) {
  if (!paintMats[color]) {
    paintMats[color] = new THREE.MeshStandardMaterial({
      color, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
  }
  return paintMats[color];
}

export function paintLine(x1, z1, x2, z2, width = 0.15, color = 0xffffff, y = 0.03) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const geo = new THREE.PlaneGeometry(len, width).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, paintMaterial(color));
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(-dz, dx);
  m.receiveShadow = true;
  return m;
}

export function paintRect(x, z, w, l, color = 0xffd23f, width = 0.15) {
  const g = new THREE.Group();
  const hw = w / 2, hl = l / 2;
  g.add(paintLine(x - hw, z - hl, x + hw, z - hl, width, color));
  g.add(paintLine(x - hw, z + hl, x + hw, z + hl, width, color));
  g.add(paintLine(x - hw, z - hl, x - hw, z + hl, width, color));
  g.add(paintLine(x + hw, z - hl, x + hw, z + hl, width, color));
  return g;
}

export function paintFill(x, z, w, l, color, opacity = 0.35) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false }),
  );
  m.position.set(x, 0.03, z);
  m.receiveShadow = true;
  return m;
}

/** Painted text on the ground (e.g. "עצור"). */
export function paintText(text, x, z, size, rotY = 0, color = '#ffffff') {
  const c = canvas(512, 256);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = 'bold 190px Heebo, Arial';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.fillText(text, 256, 140);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2, size).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: toTexture(c, { repeat: false }), transparent: true, opacity: 0.85, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  );
  m.position.set(x, 0.035, z);
  m.rotation.y = rotY;
  m.receiveShadow = true;
  return m;
}

// ---------- props ----------
const coneParts = {};
export function makeCone(color = 0xff5a00) {
  if (!coneParts.geo) {
    const prof = [];
    prof.push(new THREE.Vector2(0.001, 0.52), new THREE.Vector2(0.03, 0.52), new THREE.Vector2(0.15, 0.04), new THREE.Vector2(0.15, 0.03));
    coneParts.geo = new THREE.LatheGeometry(prof, 20);
    coneParts.base = new RoundedBoxGeometry(0.38, 0.035, 0.38, 2, 0.01);
    coneParts.stripe = new THREE.CylinderGeometry(0.083, 0.106, 0.09, 20, 1, true);
    coneParts.white = std(0xf4f4f4, { roughness: 0.35, metalness: 0.3 });
  }
  if (!coneParts[color]) coneParts[color] = std(color, { roughness: 0.45 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(coneParts.geo, coneParts[color]);
  body.castShadow = true;
  const base = new THREE.Mesh(coneParts.base, coneParts[color]);
  base.position.y = 0.0175; base.castShadow = true; base.receiveShadow = true;
  const stripe = new THREE.Mesh(coneParts.stripe, coneParts.white);
  stripe.position.y = 0.3;
  g.add(body, base, stripe);
  return g;
}

const poleMat = std(0x9aa0a6, { metalness: 0.8, roughness: 0.35 });
function sign(texture, { size = 0.8, shape = 'circle', height = 2.2 } = {}) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, height, 10), poleMat);
  pole.position.y = height / 2; pole.castShadow = true;
  g.add(pole);
  const faceGeo = shape === 'octagon'
    ? new THREE.CircleGeometry(size / 2, 8).rotateZ(Math.PI / 8)
    : shape === 'circle' ? new THREE.CircleGeometry(size / 2, 32) : new THREE.PlaneGeometry(size * 1.6, size);
  const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35, metalness: 0.1, transparent: true }));
  face.position.set(0, height, 0.03);
  const plate = new THREE.Mesh(faceGeo.clone(), std(0x8a8f96, { metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }));
  plate.position.set(0, height, 0.02);
  face.castShadow = plate.castShadow = true;
  g.add(face, plate);
  return g;
}

export function makeStopSign() {
  return sign(textTexture(['עצור'], { bg: '#c8102e', fg: '#fff', font: 'bold 92px Heebo, Arial', shape: 'octagon' }), { shape: 'octagon', size: 0.85 });
}
export function makeSpeedSign(n) {
  return sign(textTexture([String(n)], { bg: '#fff', fg: '#111', border: '#c8102e', font: 'bold 110px Arial', shape: 'circle' }), { shape: 'circle', size: 0.75 });
}
export function makeBoard(lines, opts = {}) {
  const tex = textTexture(lines, { w: 512, h: 320, bg: opts.bg || '#1d4e89', fg: '#fff', border: '#fff', font: opts.font || 'bold 60px Heebo, Arial' });
  return sign(tex, { shape: 'rect', size: opts.size || 1.4, height: opts.height || 2.4 });
}

/** Ground beacon showing the next target the rider should reach. */
export function makeBeacon(color = 0xffb703) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.0, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
  );
  ring.position.y = 0.05;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 6, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  beam.position.y = 3;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false }));
  arrow.rotation.x = Math.PI;
  arrow.position.y = 6.6;
  g.add(ring, beam, arrow);
  g.userData.arrow = arrow;
  g.userData.ring = ring;
  return g;
}

// ---------- traffic light ----------
const LAMP_COLORS = { red: 0xff2a2a, yellow: 0xffb000, green: 0x22ff66 };
export class TrafficLight {
  /** facing = direction the lamps face (toward approaching riders) */
  constructor(x, z, facingX, facingZ) {
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.group.rotation.y = Math.atan2(facingX, facingZ);
    const metal = std(0x2d3136, { metalness: 0.6, roughness: 0.45 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 12), metal);
    pole.position.y = 1.7; pole.castShadow = true;
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.42, 1.15, 0.3, 3, 0.05), std(0x15171a, { roughness: 0.6 }));
    head.position.set(0, 3.0, 0); head.castShadow = true;
    this.group.add(pole, head);
    this.lamps = {};
    ['red', 'yellow', 'green'].forEach((c, i) => {
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 16, 1, true, -Math.PI / 2, Math.PI), std(0x111111, { side: THREE.DoubleSide }));
      visor.rotation.x = Math.PI / 2;
      visor.position.set(0, 3.36 - i * 0.36 + 0.02, 0.22);
      const lamp = new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 24),
        new THREE.MeshStandardMaterial({ color: 0x222222, emissive: LAMP_COLORS[c], emissiveIntensity: 0 }),
      );
      lamp.position.set(0, 3.36 - i * 0.36, 0.152);
      this.group.add(lamp, visor);
      this.lamps[c] = lamp;
    });
    this.auto = true;
    this.t = 0;
    this.set('green');
  }

  set(state) {
    this.state = state;
    this.t = 0;
    for (const [c, lamp] of Object.entries(this.lamps)) {
      lamp.material.emissiveIntensity = c === state ? 8 : 0.03;
      lamp.material.color.setHex(c === state ? LAMP_COLORS[c] : 0x1a1a1a);
    }
    for (const f of this.followers || []) f.set(state);
  }

  update(dt) {
    this.t += dt;
    if (!this.auto) return;
    if (this.state === 'green' && this.t > 12) this.set('yellow');
    else if (this.state === 'yellow' && this.t > 2.5) this.set('red');
    else if (this.state === 'red' && this.t > 9) this.set('green');
  }
}

// ---------- the world ----------
export class World {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.solids = [];        // static axis-aligned boxes {minX,maxX,minZ,maxZ}
    this.circles = [];       // static round solids {x,z,r}
    this.dynamic = [];       // moving obstacles {x,z,r,reason} refreshed by the NPC system
    this.buildings = [];
    this.updaters = [];
    this.palmSpots = [];

    this.buildGround();
    this.buildRoads();
    this.buildSidewalks();
    this.buildLot();
    this.buildCity();
    this.buildStreetLamps();
    this.buildTrees();
    this.buildBackdrop();
  }

  // ---------- ground ----------
  buildGround() {
    const gs = grassGroundSet({ size: 512 });
    for (const t of [gs.map, gs.normalMap]) t.repeat.set(1600 / 18, 1600 / 18);
    const geo = new THREE.PlaneGeometry(1600, 1600, 160, 160).rotateX(-Math.PI / 2);
    // low-frequency tint so the tiling disappears
    const macro = fbmField(128, { seed: 77, base: 3, octaves: 4 });
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const u = ((pos.getX(i) / 1600 + 0.5) * 127) | 0, v = ((pos.getZ(i) / 1600 + 0.5) * 127) | 0;
      const m = macro[v * 128 + u];
      cols[i * 3] = 0.82 + m * 0.36;
      cols[i * 3 + 1] = 0.85 + m * 0.25;
      cols[i * 3 + 2] = 0.8 + m * 0.2;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: gs.map, normalMap: gs.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, vertexColors: true,
    }));
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  texturedPlane(set, cx, cz, sx, sz, y, tile) {
    const mat = new THREE.MeshStandardMaterial({
      map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6),
    });
    const geo = new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2);
    // world-space UVs so neighbouring planes line up
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + cx) / tile, (pos.getZ(i) + cz) / tile);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, y, cz);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  buildRoads() {
    const A = asphaltSet({ size: 512, seed: 3, tone: 70, cracks: 8 });
    const R = RING, H = ROAD_HALF;
    this.texturedPlane(A, 0, -R, 2 * (R + H), 2 * H, 0.012, 14);
    this.texturedPlane(A, 0, R, 2 * (R + H), 2 * H, 0.012, 14);
    this.texturedPlane(A, -R, 0, 2 * H, 2 * (R - H), 0.012, 14);
    this.texturedPlane(A, R, 0, 2 * H, 2 * (R - H), 0.012, 14);
    this.texturedPlane(A, 0, -(LOT + R - H) / 2, 2 * H, R - H - LOT, 0.012, 14);

    const g = new THREE.Group();
    const dash = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.floor(len / 7);
      for (let i = 0; i < n; i++) {
        const a = (i * 7 + 1) / len, b = (i * 7 + 4) / len;
        g.add(paintLine(x1 + (x2 - x1) * a, z1 + (z2 - z1) * a, x1 + (x2 - x1) * b, z1 + (z2 - z1) * b, 0.14, 0xf2f2f2));
      }
    };
    const W = 0xf0f0f0;
    const E = H - 0.35;
    dash(-R + H, -R, R - H, -R);
    dash(-R + H, R, R - H, R);
    dash(-R, -R + H, -R, R - H);
    dash(R, -R + H, R, R - H);
    dash(0, -LOT - 1, 0, -R + H + 3);
    g.add(paintLine(-R - E, -R - E, R + E, -R - E, 0.15, W));
    g.add(paintLine(-R - E, R + E, R + E, R + E, 0.15, W));
    g.add(paintLine(-R - E, -R - E, -R - E, R + E, 0.15, W));
    g.add(paintLine(R + E, -R - E, R + E, R + E, 0.15, W));
    g.add(paintLine(-R + E, -R + E, -H, -R + E, 0.15, W));
    g.add(paintLine(H, -R + E, R - E, -R + E, 0.15, W));
    g.add(paintLine(-R + E, R - E, R - E, R - E, 0.15, W));
    g.add(paintLine(-R + E, -R + E, -R + E, R - E, 0.15, W));
    g.add(paintLine(R - E, -R + E, R - E, R - E, 0.15, W));
    g.add(paintLine(-E, -LOT, -E, -R + H, 0.15, W));
    g.add(paintLine(E, -LOT, E, -R + H, 0.15, W));
    g.add(paintLine(0.1, -R + H + 0.6, H, -R + H + 0.6, 0.45, W));
    g.add(paintText('עצור', 2.5, -R + H + 3.2, 2.2, Math.PI));
    for (let i = 0; i < 6; i++) {
      const z = -R - H + 0.9 + i * 1.65;
      g.add(paintLine(73, z, 77, z, 0.8, W));
    }
    g.add(paintLine(71.4, -R + 0.1, 71.4, -R + H - 0.3, 0.45, W));   // eastbound stop line
    g.add(paintLine(78.6, -R - 0.1, 78.6, -R - H + 0.3, 0.45, W));   // westbound stop line
    this.scene.add(g);

    this.stopSign = makeStopSign();
    this.stopSign.position.set(H + 1.2, CURB_H, -R + H + 1.4);
    this.scene.add(this.stopSign);
    this.circles.push({ x: H + 1.2, z: -R + H + 1.4, r: 0.1 });

    this.cityLight = new TrafficLight(71, -R + H + 1.0, -1, 0);
    const twin = new TrafficLight(79, -R - H - 1.0, 1, 0);
    twin.auto = false;
    this.cityLight.followers = [twin];
    this.cityLight.set('green');
    this.scene.add(this.cityLight.group, twin.group);
    this.circles.push({ x: 71, z: -R + H + 1.0, r: 0.12 }, { x: 79, z: -R - H - 1.0, r: 0.12 });
    this.updaters.push((dt) => this.cityLight.update(dt));

    const s1 = makeSpeedSign(50);
    s1.position.set(H + 1.2, CURB_H, -78);
    this.scene.add(s1);
    const s2 = makeSpeedSign(50);
    s2.position.set(20, CURB_H, -R + H + 1.2);
    s2.rotation.y = -Math.PI / 2;
    this.scene.add(s2);
  }

  // ---------- sidewalks & curbs ----------
  sidewalkRects() {
    if (this._walks) return this._walks;
    const R = RING, H = ROAD_HALF, Wd = WALK_W;
    const o = R + H + Wd / 2, i = R - H - Wd / 2;
    const rects = [
      // outer ring
      [0, -o, 2 * (R + H + Wd), Wd], [0, o, 2 * (R + H + Wd), Wd],
      [-o, 0, Wd, 2 * (R + H)], [o, 0, Wd, 2 * (R + H)],
      // inner ring (gap where the connector joins)
      [(-(R - H) - H - 3) / 2, -i, (R - H) - H - 3, Wd], [((R - H) + H + 3) / 2, -i, (R - H) - H - 3, Wd],
      [0, i, 2 * (R - H), Wd],
      [-i, 0, Wd, 2 * (R - H - Wd)], [i, 0, Wd, 2 * (R - H - Wd)],
      // connector
      [-(H + Wd / 2), -(LOT + (R - H - Wd)) / 2 - 0.5, Wd, R - H - Wd - LOT - 1],
      [H + Wd / 2, -(LOT + (R - H - Wd)) / 2 - 0.5, Wd, R - H - Wd - LOT - 1],
    ];
    this._walks = rects.map(([x, z, w, l]) => ({ x, z, w, l }));
    return this._walks;
  }

  buildSidewalks() {
    const P = paversSet({ size: 512 });
    const mat = new THREE.MeshStandardMaterial({ map: P.map, normalMap: P.normalMap, roughness: 0.85, normalScale: new THREE.Vector2(0.7, 0.7) });
    const curbMat = std(0xb9b6ae, { roughness: 0.8 });
    const stripeC = canvas(64, 8);
    const sg = stripeC.getContext('2d');
    sg.fillStyle = '#e8e8e8'; sg.fillRect(0, 0, 64, 8);
    sg.fillStyle = '#c8102e'; sg.fillRect(0, 0, 32, 8);
    const redWhite = std(0xffffff, { map: toTexture(stripeC), roughness: 0.7 });
    const geos = [], curbs = [], rw = [];
    for (const r of this.sidewalkRects()) {
      const g = new THREE.BoxGeometry(r.w, CURB_H, r.l);
      const uv = g.attributes.uv, pos = g.attributes.position, nrm = g.attributes.normal;
      for (let k = 0; k < uv.count; k++) {
        if (Math.abs(nrm.getY(k)) > 0.5) uv.setXY(k, (pos.getX(k) + r.x) / 3, (pos.getZ(k) + r.z) / 3);
      }
      g.translate(r.x, CURB_H / 2, r.z);
      geos.push(g);
      // curb stones along both long edges
      const along = r.l > r.w;
      for (const s of [-1, 1]) {
        const cx = along ? r.x + s * (r.w / 2 - 0.1) : r.x, cz = along ? r.z : r.z + s * (r.l / 2 - 0.1);
        const len = along ? r.l : r.w;
        const cg = new THREE.BoxGeometry(along ? 0.22 : len, CURB_H + 0.04, along ? len : 0.22);
        // red-white curbs near the junction & crosswalk
        const nearJunction = Math.hypot(cx, cz + RING) < 40 || Math.hypot(cx - 75, cz + RING) < 30;
        const cuv = cg.attributes.uv;
        for (let k = 0; k < cuv.count; k++) cuv.setX(k, cuv.getX(k) * len / 2);
        cg.translate(cx, (CURB_H + 0.04) / 2, cz);
        (nearJunction ? rw : curbs).push(cg);
      }
    }
    const walk = new THREE.Mesh(mergeGeometries(geos), mat);
    walk.receiveShadow = true;
    const curb = new THREE.Mesh(mergeGeometries(curbs), curbMat);
    curb.receiveShadow = true;
    this.scene.add(walk, curb);
    if (rw.length) {
      const m = new THREE.Mesh(mergeGeometries(rw), redWhite);
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  onSidewalk(x, z) {
    for (const r of this.sidewalkRects()) if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.l / 2) return true;
    return false;
  }

  heightAt(x, z) {
    return this.onSidewalk(x, z) ? CURB_H : 0;
  }

  // ---------- training lot ----------
  buildLot() {
    const A = asphaltSet({ size: 512, seed: 5, tone: 92, stains: 14, cracks: 5, tireMarks: 18 });
    this.texturedPlane(A, 0, 0, 2 * LOT, 2 * LOT, 0.016, 16);
    const g = new THREE.Group();
    const L = LOT - 0.6;
    g.add(paintLine(-L, -L, L, -L, 0.2, 0xffffff));
    g.add(paintLine(-L, L, L, L, 0.2, 0xffffff));
    g.add(paintLine(-L, -L, -L, L, 0.2, 0xffffff));
    g.add(paintLine(L, -L, L, L, 0.2, 0xffffff));
    g.add(paintText('אזור תרגול', 36, -2, 3.2, Math.PI));
    g.add(paintText('האט', 2.5, -52, 2.2, Math.PI));
    this.scene.add(g);

    // jersey barriers
    const prof = new THREE.Shape();
    prof.moveTo(-0.3, 0); prof.lineTo(0.3, 0); prof.lineTo(0.3, 0.08); prof.lineTo(0.16, 0.3); prof.lineTo(0.1, 0.8); prof.lineTo(-0.1, 0.8); prof.lineTo(-0.16, 0.3); prof.lineTo(-0.3, 0.08); prof.closePath();
    const barrierMat = std(0xd9d6cf, { roughness: 0.9 });
    const stripeMat = std(0xc8102e, { roughness: 0.7 });
    const pieces = [], stripes = [];
    const wall = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const horiz = Math.abs(z2 - z1) < 0.01;
      const eg = new THREE.ExtrudeGeometry(prof, { depth: len, bevelEnabled: false });
      eg.translate(0, 0, -len / 2);
      if (horiz) eg.rotateY(Math.PI / 2);
      eg.translate((x1 + x2) / 2, 0, (z1 + z2) / 2);
      pieces.push(eg);
      const sg = new THREE.BoxGeometry(horiz ? len : 0.24, 0.1, horiz ? 0.24 : len);
      sg.translate((x1 + x2) / 2, 0.66, (z1 + z2) / 2);
      stripes.push(sg);
      this.solids.push({
        minX: Math.min(x1, x2) - (horiz ? 0 : 0.3), maxX: Math.max(x1, x2) + (horiz ? 0 : 0.3),
        minZ: Math.min(z1, z2) - (horiz ? 0.3 : 0), maxZ: Math.max(z1, z2) + (horiz ? 0.3 : 0),
      });
    };
    const B = LOT + 0.3;
    wall(-B, B, B, B);
    wall(-B, -B, -ROAD_HALF - 1, -B);
    wall(ROAD_HALF + 1, -B, B, -B);
    wall(-B, -B, -B, B);
    wall(B, -B, B, B);
    const bm = new THREE.Mesh(mergeGeometries(pieces), barrierMat);
    bm.castShadow = bm.receiveShadow = true;
    const sm = new THREE.Mesh(mergeGeometries(stripes), stripeMat);
    this.scene.add(bm, sm);

    const board = makeBoard(['בית ספר לרכיבה', 'מגרש אימונים'], { size: 1.6, height: 2.6 });
    board.position.set(-ROAD_HALF - 3, 0, -B - 1.5);
    board.rotation.y = Math.PI;
    this.scene.add(board);

    // school office: a portable cabin with a porch
    const office = new THREE.Group();
    const wallM = std(0xf1efe8, { roughness: 0.8 });
    const trimM = std(0x1d4e89, { roughness: 0.6 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(9, 3, 4, 2, 0.08), wallM);
    body.position.y = 1.6; body.castShadow = body.receiveShadow = true;
    const roof = new THREE.Mesh(new RoundedBoxGeometry(9.6, 0.25, 4.8, 2, 0.06), trimM);
    roof.position.y = 3.2; roof.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(9.02, 0.3, 4.02), trimM);
    stripe.position.y = 0.4;
    office.add(body, roof, stripe);
    const glass = phys(0x1b2733, { metalness: 0.6, roughness: 0.05 });
    for (const x of [-3, 0, 3]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), glass);
      w.position.set(x, 1.9, -2.01); w.rotation.y = Math.PI;
      office.add(w);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.1), std(0x6b4a2f));
    door.position.set(3.8, 1.15, -2.01); door.rotation.y = Math.PI;
    office.add(door);
    const ob = makeBoard(['בית ספר לרכיבה "על הגלגלים"'], { size: 0.9, height: 0.01, font: 'bold 44px Heebo, Arial' });
    ob.position.set(0, 2.55, -2.06); ob.rotation.y = Math.PI;
    ob.children[0].visible = false;
    office.add(ob);
    office.position.set(-22, 0, 54);
    this.scene.add(office);
    this.solids.push({ minX: -26.6, maxX: -17.4, minZ: 51.8, maxZ: 56.2 });
    // benches in front of the office
    const benchM = std(0x8a5a32, { roughness: 0.8 });
    for (const x of [-27, -17]) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(2, 0.08, 0.5, 2, 0.02), benchM);
      b.position.set(x, 0.45, 50.5);
      const back = new THREE.Mesh(new RoundedBoxGeometry(2, 0.4, 0.06, 2, 0.02), benchM);
      back.position.set(x, 0.75, 50.78);
      for (const s of [-0.85, 0.85]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), poleMat);
        leg.position.set(x + s, 0.22, 50.55);
        this.scene.add(leg);
      }
      b.castShadow = back.castShadow = true;
      this.scene.add(b, back);
      this.solids.push({ minX: x - 1, maxX: x + 1, minZ: 50.2, maxZ: 50.9 });
    }
    this.benchSeats = [[-27.5, 50.6], [-26.4, 50.6], [-16.6, 50.6]];
    // flood light masts in the lot corners
    for (const [x, z] of [[-57, -57], [57, -57], [-57, 57], [57, 57]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 10, 10), poleMat);
      mast.position.set(x, 5, z);
      mast.castShadow = true;
      const head = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.4, 0.6, 2, 0.06), std(0x2b2e33, { metalness: 0.5 }));
      head.position.set(x - Math.sign(x) * 0.5, 10, z - Math.sign(z) * 0.5);
      head.lookAt(0, 0, 0);
      head.castShadow = true;
      this.scene.add(mast, head);
      this.circles.push({ x, z, r: 0.2 });
    }
  }

  // ---------- city blocks ----------
  buildCity() {
    const r = rng(42);
    const variants = [0, 1, 2, 3, 4].map((v) => {
      const s = facadeSet(v, 5);
      return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1, metalness: 0.05 });
    });
    const wallGeos = variants.map(() => []);
    const roofGeos = [], parapets = [], balconies = [], rails = [], groundFloors = [];
    const solarPanels = [], tanks = [], acUnits = [];
    const shops = [];
    const SHOP_NAMES = [['מכולת', '#2f855a'], ['פיצה', '#c53030'], ['קפה', '#6b4226'], ['פלאפל', '#d69e2e'], ['מספרה', '#2b6cb0'], ['פארם', '#38a169'], ['בורקס', '#b7791f'], ['ספרים', '#553c9a']];

    const face = (cx, cz, w, h, ny, rotY, list, uScale = 4, vScale = 3.2, y0 = 0) => {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / uScale, uv.getY(k) * h / vScale);
      g.rotateY(rotY);
      g.translate(cx, y0 + h / 2, cz);
      list.push(g);
    };

    const place = (cx, cz, w, d, h, facing) => {
      const v = Math.floor(r() * variants.length);
      const floors = Math.max(2, Math.round(h / 3.2));
      h = floors * 3.2;
      const list = wallGeos[v];
      const base = 3.4; // ground floor band
      face(cx, cz + d / 2, w, h - base, 0, 0, list, 4, 3.2, base);
      face(cx, cz - d / 2, w, h - base, 0, Math.PI, list, 4, 3.2, base);
      face(cx + w / 2, cz, d, h - base, 0, Math.PI / 2, list, 4, 3.2, base);
      face(cx - w / 2, cz, d, h - base, 0, -Math.PI / 2, list, 4, 3.2, base);
      const gf = new THREE.BoxGeometry(w + 0.1, base, d + 0.1);
      gf.translate(cx, base / 2, cz);
      groundFloors.push(gf);
      const roof = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
      roof.translate(cx, h, cz);
      roofGeos.push(roof);
      // parapet
      for (const [px, pz, pw, pd] of [[cx, cz + d / 2, w, 0.25], [cx, cz - d / 2, w, 0.25], [cx + w / 2, cz, 0.25, d], [cx - w / 2, cz, 0.25, d]]) {
        const pg = new THREE.BoxGeometry(pw, 0.9, pd);
        pg.translate(px, h + 0.45, pz);
        parapets.push(pg);
      }
      // balconies on the street side
      const fx = facing[0], fz = facing[1];
      const along = fx === 0 ? w : d;
      const bays = Math.floor(along / 4);
      for (let f = 1; f < floors; f++) {
        for (let b = 0; b < bays; b++) {
          if ((b + f) % 2 && r() < 0.6) continue;
          const t = -along / 2 + 2 + b * 4;
          const bx = fx === 0 ? cx + t : cx + fx * (w / 2 + 0.7);
          const bz = fx === 0 ? cz + fz * (d / 2 + 0.7) : cz + t;
          const slab = new THREE.BoxGeometry(fx === 0 ? 3.4 : 1.4, 0.18, fx === 0 ? 1.4 : 3.4);
          slab.translate(bx, f * 3.2 + 0.1, bz);
          balconies.push(slab);
          const rail = new THREE.BoxGeometry(fx === 0 ? 3.4 : 0.06, 1.0, fx === 0 ? 0.06 : 3.4);
          rail.translate(bx + fx * 0.67, f * 3.2 + 0.65, bz + fz * 0.67);
          rails.push(rail);
        }
      }
      // rooftop: solar water heaters ("dud shemesh") and AC units
      const nHeaters = Math.max(1, Math.floor((w * d) / 60));
      for (let k = 0; k < nHeaters; k++) {
        const x = cx + (r() - 0.5) * (w - 3), z = cz + (r() - 0.5) * (d - 3);
        const ry = Math.round(r() * 4) * Math.PI / 2;
        solarPanels.push([x, h + 0.75, z, ry]);
        tanks.push([x + Math.sin(ry) * -0.9, h + 1.25, z + Math.cos(ry) * -0.9, ry]);
      }
      for (let k = 0; k < 3; k++) acUnits.push([cx + (r() - 0.5) * (w - 2), h + 0.35, cz + (r() - 0.5) * (d - 2)]);
      // a shop sign on some street-facing ground floors
      if (r() < 0.55) {
        const [name, col] = SHOP_NAMES[Math.floor(r() * SHOP_NAMES.length)];
        shops.push({ x: cx + fx * (w / 2 + 0.08), z: cz + fz * (d / 2 + 0.08), rot: Math.atan2(fx, fz), name, col, span: Math.min(along - 2, 8) });
      }
      this.solids.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      this.buildings.push({ x: cx, z: cz, w, d, h });
    };

    const rows = [{ off: RING + 22, out: true }, { off: RING - 24, out: false }];
    for (const side of [0, 1, 2, 3]) {
      for (const row of rows) {
        let t = -RING + 14;
        while (t < RING - 14) {
          const w = 12 + r() * 12, d = 11 + r() * 7, h = row.out ? 9 + r() * 20 : 7 + r() * 10;
          const along = t + w / 2;
          const off = row.off + (row.out ? 1 : -1) * r() * 3;
          t += w + 5 + r() * 8;
          if (along > RING - 14) break;
          if (!row.out && Math.abs(along) > RING - 38) continue;
          let x, z, bw = w, bd = d, facing;
          if (side === 0) { x = along; z = -off; facing = [0, row.out ? 1 : -1]; }
          else if (side === 1) { x = along; z = off; facing = [0, row.out ? -1 : 1]; }
          else if (side === 2) { x = -off; z = along; bw = d; bd = w; facing = [row.out ? 1 : -1, 0]; }
          else { x = off; z = along; bw = d; bd = w; facing = [row.out ? -1 : 1, 0]; }
          if (!row.out) {
            if (Math.abs(x) < 20 && z < 0) continue;
            if (side === 0 && x > 55 && x < 95) continue;
          }
          place(x, z, bw, bd, h, facing);
        }
      }
    }

    variants.forEach((mat, i) => {
      if (!wallGeos[i].length) return;
      const m = new THREE.Mesh(mergeGeometries(wallGeos[i]), mat);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    });
    const addMerged = (geos, mat, cast = true) => {
      if (!geos.length) return;
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    addMerged(roofGeos, std(0x9a958c, { roughness: 0.95 }), false);
    addMerged(parapets, std(0xd8d2c6, { roughness: 0.9 }));
    addMerged(groundFloors, std(0x5b5e63, { roughness: 0.4, metalness: 0.3 }));
    addMerged(balconies, std(0xe6e1d6, { roughness: 0.85 }));
    addMerged(rails, phys(0x2a3540, { metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.55 }), false);

    const inst = (geo, mat, list, place) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const o = new THREE.Object3D();
      list.forEach((p, i) => { place(o, p); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.castShadow = true;
      im.receiveShadow = true;
      this.scene.add(im);
    };
    inst(new THREE.BoxGeometry(1.1, 0.05, 1.9), phys(0x1a2a4a, { metalness: 0.6, roughness: 0.15 }), solarPanels, (o, [x, y, z, ry]) => { o.position.set(x, y, z); o.rotation.set(0.6, ry, 0, 'YXZ'); });
    inst(new THREE.CylinderGeometry(0.28, 0.28, 1.5, 16).rotateZ(Math.PI / 2), std(0xf0f0ea, { roughness: 0.4, metalness: 0.2 }), tanks, (o, [x, y, z, ry]) => { o.position.set(x, y, z); o.rotation.set(0, ry, 0); });
    inst(new RoundedBoxGeometry(0.9, 0.6, 0.6, 2, 0.05), std(0xe8e8e4, { roughness: 0.6 }), acUnits, (o, [x, y, z]) => { o.position.set(x, y, z); o.rotation.set(0, 0, 0); });

    for (const s of shops) {
      const tex = shopfrontTexture(s.name, s.col);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(s.span, s.span / 4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }));
      sign.position.set(s.x, 3.0, s.z);
      sign.rotation.y = s.rot;
      const awning = new THREE.Mesh(new THREE.BoxGeometry(s.span, 0.08, 1.4), std(new THREE.Color(s.col).multiplyScalar(0.8), { roughness: 0.8 }));
      awning.position.set(s.x + Math.sin(s.rot) * 0.7, 2.45, s.z + Math.cos(s.rot) * 0.7);
      awning.rotation.y = s.rot;
      awning.rotateX(0.12);
      awning.castShadow = true;
      this.scene.add(sign, awning);
    }
  }

  buildStreetLamps() {
    const spots = [];
    const R = RING, o = R + ROAD_HALF + WALK_W - 0.5;
    for (let t = -R + 10; t <= R - 10; t += 34) {
      spots.push([t, -o, 0, 1], [t, o, 0, -1], [-o, t, 1, 0], [o, t, -1, 0]);
    }
    for (let z = -70; z > -R + 10; z -= 28) spots.push([ROAD_HALF + 2.6, z, -1, 0], [-ROAD_HALF - 2.6, z, 1, 0]);
    const poleG = new THREE.CylinderGeometry(0.07, 0.1, 7, 10).translate(0, 3.5, 0);
    const armG = new THREE.CylinderGeometry(0.045, 0.045, 1.8, 8).rotateZ(Math.PI / 2).translate(0.9, 6.9, 0);
    const headG = new RoundedBoxGeometry(0.7, 0.14, 0.3, 2, 0.05).translate(1.7, 6.85, 0);
    const lampGeo = mergeGeometries([poleG, armG, headG]);
    const im = new THREE.InstancedMesh(lampGeo, std(0x8f969c, { metalness: 0.8, roughness: 0.35 }), spots.length);
    const ob = new THREE.Object3D();
    spots.forEach(([x, z, dx, dz], i) => {
      ob.position.set(x, CURB_H, z);
      ob.rotation.set(0, Math.atan2(-dz, dx), 0);
      ob.updateMatrix();
      im.setMatrixAt(i, ob.matrix);
      this.circles.push({ x, z, r: 0.12 });
    });
    im.castShadow = true;
    this.scene.add(im);
  }

  // ---------- vegetation ----------
  buildTrees() {
    const r = rng(9);
    // leaf card texture
    const lc = canvas(256);
    const lg = lc.getContext('2d');
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 110;
      const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
      const sh = 0.7 + r() * 0.5;
      lg.fillStyle = `rgb(${Math.floor(60 * sh)},${Math.floor(110 * sh)},${Math.floor(42 * sh)})`;
      lg.save(); lg.translate(x, y); lg.rotate(r() * Math.PI);
      lg.beginPath(); lg.ellipse(0, 0, 9 + r() * 6, 4 + r() * 2.5, 0, 0, Math.PI * 2); lg.fill();
      lg.restore();
    }
    const leafTex = toTexture(lc, { repeat: false });
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });

    // crown: ~36 cards scattered inside an ellipsoid, normals pointing outward for soft lighting
    const cards = [];
    for (let i = 0; i < 36; i++) {
      const p = new THREE.PlaneGeometry(1.6, 1.6);
      const dir = new THREE.Vector3(r() - 0.5, (r() - 0.35) * 0.9, r() - 0.5).normalize();
      const pos = dir.clone().multiplyScalar(0.8 + r() * 0.8);
      p.rotateX(r() * Math.PI); p.rotateY(r() * Math.PI); p.rotateZ(r() * Math.PI);
      p.translate(pos.x * 1.4, pos.y * 1.1 + 3.6, pos.z * 1.4);
      const n = p.attributes.normal, ps = p.attributes.position;
      for (let k = 0; k < n.count; k++) {
        const v = new THREE.Vector3(ps.getX(k), ps.getY(k) - 3.4, ps.getZ(k)).normalize();
        n.setXYZ(k, v.x, v.y, v.z);
      }
      cards.push(p);
    }
    const crownGeo = mergeGeometries(cards);
    const coreGeo = new THREE.IcosahedronGeometry(1.25, 1).scale(1.3, 1.0, 1.3).translate(0, 3.6, 0);
    const trunkGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.14, 0.24, 3.4, 8).translate(0, 1.7, 0),
      new THREE.CylinderGeometry(0.05, 0.09, 1.4, 6).rotateZ(0.8).translate(0.45, 2.9, 0),
      new THREE.CylinderGeometry(0.05, 0.09, 1.3, 6).rotateZ(-0.8).rotateY(2).translate(-0.3, 3.0, 0.3),
    ]);

    // palm: curved trunk + fronds
    const pc = canvas(64, 256);
    const pg = pc.getContext('2d');
    pg.strokeStyle = '#4a6a2a'; pg.lineWidth = 3;
    pg.beginPath(); pg.moveTo(32, 0); pg.lineTo(32, 256); pg.stroke();
    for (let y = 8; y < 250; y += 5) {
      const len = 28 * Math.sin((y / 256) * Math.PI) + 4;
      pg.strokeStyle = `rgb(${50 + r() * 20},${100 + r() * 30},${35 + r() * 15})`;
      pg.lineWidth = 3;
      pg.beginPath(); pg.moveTo(32, y); pg.lineTo(32 - len, y + 10); pg.moveTo(32, y); pg.lineTo(32 + len, y + 10); pg.stroke();
    }
    const frondMat = new THREE.MeshStandardMaterial({ map: toTexture(pc, { repeat: false }), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    const fronds = [];
    for (let i = 0; i < 11; i++) {
      const f = new THREE.PlaneGeometry(0.9, 3.4, 1, 8).translate(0, 1.7, 0);
      const ps = f.attributes.position;
      for (let k = 0; k < ps.count; k++) {
        const y = ps.getY(k);
        ps.setZ(k, -0.12 * y * y);       // droop
      }
      f.rotateX(-1.0 - r() * 0.5);
      f.rotateY((i / 11) * Math.PI * 2 + r() * 0.3);
      f.translate(0, 8.2, 0);
      f.computeVertexNormals();
      fronds.push(f);
    }
    const frondGeo = mergeGeometries(fronds);
    const palmTrunkPts = [];
    for (let i = 0; i <= 10; i++) palmTrunkPts.push(new THREE.Vector3(Math.sin(i / 10 * 1.2) * 0.5, i * 0.82, 0));
    const palmTrunkGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(palmTrunkPts), 16, 0.2, 8, false);
    const palmTrunkMat = std(0x8a7350, { roughness: 0.95 });
    // fronds sit at the top of the bent trunk
    frondGeo.translate(Math.sin(1.2) * 0.5, 0, 0);

    const trees = [], palms = [];
    let tries = 0;
    while (trees.length < 320 && tries < 8000) {
      tries++;
      const x = (r() - 0.5) * 2 * (WORLD_HALF - 10);
      const z = (r() - 0.5) * 2 * (WORLD_HALF - 10);
      if (Math.abs(x) < LOT + 6 && Math.abs(z) < LOT + 6) continue;
      if (this.roadDistance(x, z) < ROAD_HALF + WALK_W + 2) continue;
      if (this.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3)) continue;
      trees.push([x, z, 0.8 + r() * 0.6, r() * Math.PI * 2]);
    }
    // palms lining the connector road and the inner side of the south ring
    for (let z = -75; z > -RING + 12; z -= 14) palms.push([-ROAD_HALF - WALK_W - 1.8, z, 1, r() * 6], [ROAD_HALF + WALK_W + 1.8, z, 1, r() * 6]);
    for (let x = -RING + 20; x < RING - 20; x += 22) if (Math.abs(x) > 14 && Math.abs(x - 75) > 10) palms.push([x, -RING + ROAD_HALF + WALK_W + 2, 0.9 + r() * 0.2, r() * 6]);
    // bushes along the lot barriers (outside)
    const bushes = [];
    for (let t = -LOT + 4; t < LOT - 4; t += 3.5) {
      bushes.push([t, LOT + 2.4], [-LOT - 2.4, t], [LOT + 2.4, t]);
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    const make = (geo, mat, list, scaleFn, colorFn) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it[3] || 0);
        const k = scaleFn(it);
        sc.set(k[0], k[1], k[2]);
        p.set(it[0], 0, it[1]);
        m4.compose(p, q, sc);
        im.setMatrixAt(i, m4);
        if (colorFn) im.setColorAt(i, colorFn(col, it));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      this.scene.add(im);
      return im;
    };
    const tint = (c) => c.setHSL(0.25 + r() * 0.08, 0.35 + r() * 0.2, 0.55 + r() * 0.25);
    make(trunkGeo, std(0x5e4330, { roughness: 0.95 }), trees, (t) => [t[2], t[2], t[2]]);
    make(coreGeo, std(0x2f5424, { roughness: 0.9, flatShading: true }), trees, (t) => [t[2], t[2], t[2]], (c) => c.setHSL(0.27, 0.4, 0.45 + r() * 0.15));
    make(crownGeo, leafMat, trees, (t) => [t[2], t[2] * (0.9 + r() * 0.3), t[2]], tint);
    make(palmTrunkGeo, palmTrunkMat, palms, (t) => [t[2], t[2], t[2]]);
    make(frondGeo, frondMat, palms, (t) => [t[2], t[2], t[2]], tint);
    const bushGeo = crownGeo.clone().translate(0, -3.0, 0).scale(0.55, 0.45, 0.55);
    const bushCore = coreGeo.clone().translate(0, -3.0, 0).scale(0.55, 0.45, 0.55);
    make(bushCore, std(0x2f5424, { roughness: 0.9, flatShading: true }), bushes, () => [1, 1, 1]);
    make(bushGeo, leafMat, bushes, () => [1 + r() * 0.3, 1, 1 + r() * 0.3], tint);

    for (const [x, z, k] of trees) this.circles.push({ x, z, r: 0.25 * k });
    for (const [x, z] of palms) this.circles.push({ x, z, r: 0.22 });
  }

  // ---------- far backdrop: clouds & hills ----------
  buildBackdrop() {
    const r = rng(1234);
    const n = 256;
    const pos = [], cols = [], idx = [];
    const ring = (rad, hFn, c) => {
      const start = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        pos.push(Math.cos(a) * rad, -5, Math.sin(a) * rad);
        cols.push(...c[0]);
        pos.push(Math.cos(a) * rad, hFn(a), Math.sin(a) * rad);
        cols.push(...c[1]);
      }
      for (let i = 0; i < n; i++) {
        const a = start + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    };
    const hill = (seed, amp) => {
      const f = Array.from({ length: 8 }, (_, i) => [1 + i * 1.7 + r() * 2, r() * 6.28, amp / (i + 1)]);
      return (a) => 25 + f.reduce((s, [fr, ph, am]) => s + Math.sin(a * fr + ph + seed) * am, 0) + amp * 0.6;
    };
    ring(1300, hill(1, 70), [[0.55, 0.62, 0.72], [0.68, 0.75, 0.84]]);
    ring(1000, hill(4, 45), [[0.42, 0.5, 0.48], [0.58, 0.66, 0.7]]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    const hills = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    hills.userData.noAO = true;
    this.scene.add(hills);

    const cloudTexs = [0, 1, 2, 3].map((i) => cloudTexture(100 + i));
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2, d = 300 + r() * 1300;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexs[i % 4], fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
      s.position.set(Math.cos(a) * d, 220 + r() * 220, Math.sin(a) * d);
      const k = 260 + r() * 380;
      s.scale.set(k, k * 0.5, 1);
      this.scene.add(s);
    }
  }

  /** Distance from (x,z) to the nearest road centerline. */
  roadDistance(x, z) {
    const R = RING;
    const seg = (ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - ax - dx * t, z - az - dz * t);
    };
    return Math.min(seg(-R, -R, R, -R), seg(-R, R, R, R), seg(-R, -R, -R, R), seg(R, -R, R, R), seg(0, -LOT, 0, -R));
  }

  surfaceAt(x, z) {
    if (Math.abs(x) <= LOT && Math.abs(z) <= LOT) return 'asphalt';
    if (this.roadDistance(x, z) <= ROAD_HALF + 0.2) return 'asphalt';
    if (this.onSidewalk(x, z)) return 'sidewalk';
    return 'grass';
  }

  /** Returns the obstacle hit by a circle of radius r at (x,z), or null. */
  collides(x, z, r) {
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return { reason: null };
    for (const b of this.solids) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return b;
    }
    for (const c of this.circles) {
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      if (dx * dx + dz * dz < rr * rr) return c;
    }
    for (const c of this.dynamic) {
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      if (dx * dx + dz * dz < rr * rr) return c;
    }
    return null;
  }

  update(dt) {
    for (const u of this.updaters) u(dt);
  }
}
