import * as THREE from 'three';
import { rng } from './textures.js';

const CHUNK = 16;
const RADIUS = 3;           // chunks around the camera in each direction
const LOD = [1, 1, 0.6, 0.35];

/** A tuft of 7 curved blades with a dark-to-light vertex gradient. */
function tuftGeometry() {
  const r = rng(5);
  const pos = [], col = [], nrm = [], idx = [];
  for (let b = 0; b < 7; b++) {
    const a = r() * Math.PI * 2;
    const ox = (r() - 0.5) * 0.18, oz = (r() - 0.5) * 0.18;
    const h = 0.28 + r() * 0.28;
    const w = 0.035 + r() * 0.02;
    const lean = 0.08 + r() * 0.18;
    const ca = Math.cos(a), sa = Math.sin(a);
    const start = pos.length / 3;
    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const y = t * h;
      const bend = lean * t * t;
      const half = i === rows ? 0 : w * (1 - t * 0.85);
      for (const s of i === rows ? [0] : [-1, 1]) {
        const lx = s * half, lz = bend;
        pos.push(ox + lx * ca - lz * sa, y, oz + lx * sa + lz * ca);
        const shade = 0.35 + t * 0.75;
        col.push(0.32 * shade, 0.55 * shade, 0.2 * shade);
        nrm.push(0, 1, 0);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      const a0 = start + i * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
    const last = start + (rows - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export class GrassField {
  constructor(scene, world, density = 1) {
    this.world = world;
    this.enabled = density > 0;
    if (!this.enabled) return;
    this.perChunk = Math.round(CHUNK * CHUNK * 2.4 * density);
    this.uniforms = { uTime: { value: 0 }, uBike: { value: new THREE.Vector3(9999, 0, 9999) } };

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    mat.userData.customShader = true;
    mat.customProgramCacheKey = () => 'grass-wind';
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uBike = this.uniforms.uBike;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uBike;')
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float hh = max(position.y, 0.0);
          float gust = sin(uTime * 0.7 + iPos.x * 0.05) * 0.5 + 0.5;
          float wv = sin(uTime * 1.9 + iPos.x * 0.35 + iPos.z * 0.27) * (0.35 + gust * 0.5) + sin(uTime * 3.3 + iPos.z * 0.8) * 0.12;
          transformed.x += wv * hh * hh * 1.6;
          transformed.z += wv * hh * hh * 0.8;
          vec2 away = iPos.xz - uBike.xz;
          float d = length(away);
          float push = (1.0 - smoothstep(0.4, 1.4, d)) * hh * 1.4;
          transformed.xz += normalize(away + 0.0001) * push;
          transformed.y -= push * 0.4;
        `);
      // keep the "up" normal on both faces so back faces aren't dark
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    };
    this.mat = mat;
    this.geo = tuftGeometry();

    this.pool = [];
    this.active = new Map();
    const n = (2 * RADIUS + 1) ** 2;
    for (let i = 0; i < n; i++) {
      const m = new THREE.InstancedMesh(this.geo, mat, this.perChunk);
      m.receiveShadow = true;
      m.castShadow = false;
      m.visible = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      this.pool.push(m);
    }
    this.center = null;
  }

  isGrass(x, z) {
    if (this.world.surfaceAt(x, z) !== 'grass') return false;
    for (const b of this.world.solids) if (x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3) return false;
    return true;
  }

  fill(mesh, cx, cz) {
    const r = rng(((cx * 73856093) ^ (cz * 19349663)) | 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < this.perChunk; i++) {
      const x = (cx + r()) * CHUNK, z = (cz + r()) * CHUNK;
      const k = 0.7 + r() * 0.7, rot = r() * 6.28, hue = r(), dry = r();
      if (!this.isGrass(x, z)) continue;
      p.set(x, 0, z);
      q.setFromAxisAngle(up, rot);
      s.set(k, k * (0.8 + dry * 0.5), k);
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      // mostly green, some dry yellowish tufts
      col.setRGB(0.85 + dry * 0.35 * (dry > 0.8 ? 1 : 0.2), 0.95 + hue * 0.15, 0.8 + hue * 0.1);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.userData.full = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.boundingSphere = null;
    mesh.userData.key = `${cx},${cz}`;
  }

  update(dt, camPos, bikePos) {
    if (!this.enabled) return;
    this.uniforms.uTime.value += dt;
    this.uniforms.uBike.value.copy(bikePos);
    const ccx = Math.floor(camPos.x / CHUNK), ccz = Math.floor(camPos.z / CHUNK);
    const key = `${ccx},${ccz}`;
    if (key === this.center) return;
    this.center = key;
    const want = new Map();
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        want.set(`${ccx + dx},${ccz + dz}`, [ccx + dx, ccz + dz, Math.max(Math.abs(dx), Math.abs(dz))]);
      }
    }
    // release chunks that are no longer needed
    for (const [k, mesh] of this.active) {
      if (!want.has(k)) {
        this.active.delete(k);
        mesh.visible = false;
        this.pool.push(mesh);
      }
    }
    for (const [k, [cx, cz, ring]] of want) {
      let mesh = this.active.get(k);
      if (!mesh) {
        mesh = this.pool.pop();
        this.fill(mesh, cx, cz);
        this.active.set(k, mesh);
      }
      mesh.count = Math.floor(mesh.userData.full * LOD[ring]);
      mesh.visible = mesh.count > 0;
    }
  }
}
