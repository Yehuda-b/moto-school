import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();

/** Position/orient a unit-height Y-aligned mesh so it spans from a to b. */
export function setLimb(m, a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  m.position.copy(a).addScaledVector(_d, 0.5);
  m.scale.set(1, len || 0.0001, 1);
  m.quaternion.setFromUnitVectors(_up, _d.normalize());
}

/** Same as setLimb, but bakes the transform into the geometry (for static parts). */
export function tubeGeo(r, a, b, seg = 10, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, 1, seg);
  const m = new THREE.Mesh(g);
  setLimb(m, a, b);
  m.updateMatrix();
  g.applyMatrix4(m.matrix);
  return g;
}

/**
 * Robust mergeGeometries: normalises indexed/non-indexed mixes and keeps only
 * attributes shared by every input (adding blank UVs where missing).
 */
export function safeMerge(list, groups = false) {
  const geos = list.map(g => (g.index ? g.toNonIndexed() : g));
  if (geos.some(g => !g.attributes.uv)) {
    for (const g of geos) if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  const common = Object.keys(geos[0].attributes).filter(k => geos.every(g => g.attributes[k] && g.attributes[k].itemSize === geos[0].attributes[k].itemSize));
  for (const g of geos) {
    for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
  }
  const merged = mergeGeometries(geos, groups);
  if (!merged) { console.warn('safeMerge failed', list); return new THREE.BufferGeometry(); }
  return merged;
}

/**
 * Merge static child meshes of `group` that share a material into single meshes.
 * Children flagged with userData.dynamic are left alone. Cuts draw calls a lot.
 */
export function mergeStatic(group, { castShadow = true, receiveShadow = false } = {}) {
  const buckets = new Map();
  // gather meshes from the whole subtree (nested pivots included); flagged subtrees are skipped
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const found = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (c.userData.dynamic) continue;
      if (c.isMesh && !c.children.length) found.push(c);
      else if (!c.isMesh) walk(c);
    }
  };
  walk(group);
  const rel = new THREE.Matrix4();
  for (const child of found) {
    rel.multiplyMatrices(inv, child.matrixWorld);
    const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    g.applyMatrix4(rel);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!buckets.has(child.material)) buckets.set(child.material, []);
    buckets.get(child.material).push(g);
    child.parent.remove(child);
  }
  for (const [mat, geos] of buckets) {
    const merged = safeMerge(geos, false);
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    group.add(m);
  }
}

export function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
}
export function phys(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, ...o });
}
