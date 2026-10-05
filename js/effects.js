import * as THREE from 'three';
import { softSprite } from './textures.js';

const MAX = 700;

/** Pooled billboard particles (dust, tire smoke, exhaust) + skid marks. */
export class Effects {
  constructor(scene) {
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, a: 1, r: 1, g: 1, b: 1 });
    this.next = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.color = new Float32Array(MAX * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: softSprite() }, uScale: { value: innerHeight / 2 } },
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vAlpha = aAlpha; vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    addEventListener('resize', () => { mat.uniforms.uScale.value = innerHeight / 2; });

    // skid marks: flat quads laid along the rear wheel path
    this.skidMax = 500;
    this.skids = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }),
      this.skidMax,
    );
    this.skids.count = 0;
    this.skids.frustumCulled = false;
    scene.add(this.skids);
    this.skidNext = 0;
    this.lastSkid = null;
    this._o = new THREE.Object3D();
    this.acc = { dust: 0, exhaust: 0, smoke: 0 };
  }

  emit(x, y, z, o) {
    const p = this.p[this.next];
    this.next = (this.next + 1) % MAX;
    p.x = x; p.y = y; p.z = z;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.life = p.max = o.life ?? 1;
    p.s0 = o.s0 ?? 0.4; p.s1 = o.s1 ?? 2;
    p.a = o.alpha ?? 0.5;
    [p.r, p.g, p.b] = o.color ?? [1, 1, 1];
    p.drag = o.drag ?? 1.5;
    p.rise = o.rise ?? 0.3;
  }

  burst(x, z, n = 30, color = [0.55, 0.48, 0.38]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.emit(x, 0.3, z, { vx: Math.cos(a) * s, vy: Math.random() * 1.5, vz: Math.sin(a) * s, life: 1.5 + Math.random(), s0: 0.6, s1: 3, alpha: 0.45, color });
    }
  }

  addSkid(x, z) {
    if (this.lastSkid) {
      const dx = x - this.lastSkid.x, dz = z - this.lastSkid.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.25) return;
      const o = this._o;
      o.position.set((x + this.lastSkid.x) / 2, 0.022, (z + this.lastSkid.z) / 2);
      o.rotation.set(0, Math.atan2(dx, dz), 0);
      o.scale.set(0.11, 1, len + 0.02);
      o.updateMatrix();
      this.skids.setMatrixAt(this.skidNext, o.matrix);
      this.skidNext = (this.skidNext + 1) % this.skidMax;
      this.skids.count = Math.min(this.skidMax, this.skids.count + 1);
      this.skids.instanceMatrix.needsUpdate = true;
    }
    this.lastSkid = { x, z };
  }

  clearSkids() {
    this.skids.count = 0;
    this.skidNext = 0;
    this.lastSkid = null;
  }

  /** Spawn effects for a motorcycle (player or NPC). */
  bikeFx(dt, b, isPlayer) {
    const fx = b.fwdX, fz = b.fwdZ;
    const rx = b.x - fx * 0.7, rz = b.z - fz * 0.7;
    const sp = Math.abs(b.v);
    if (b.surface === 'grass' && sp > 2.5) {
      this.acc.dust += dt * sp * 3;
      while (this.acc.dust > 1) {
        this.acc.dust--;
        this.emit(rx + (Math.random() - 0.5) * 0.3, 0.15, rz + (Math.random() - 0.5) * 0.3, {
          vx: -fx * sp * 0.15 + (Math.random() - 0.5), vy: 0.5 + Math.random(), vz: -fz * sp * 0.15 + (Math.random() - 0.5),
          life: 1.4, s0: 0.4, s1: 2.6, alpha: 0.35, color: [0.52, 0.45, 0.33],
        });
      }
    }
    if (!isPlayer) return;
    const skidding = b.brake > 0.85 && sp > 6 && b.surface !== 'grass';
    if (skidding) {
      this.addSkid(rx, rz);
      this.acc.smoke += dt * 14;
      while (this.acc.smoke > 1) {
        this.acc.smoke--;
        this.emit(rx, 0.1, rz, { vx: (Math.random() - 0.5) * 0.8, vy: 0.4, vz: (Math.random() - 0.5) * 0.8, life: 1.6, s0: 0.3, s1: 2.2, alpha: 0.28, color: [0.85, 0.85, 0.85] });
      }
    } else this.lastSkid = null;
    if (b.engineOn) {
      // exhaust puffs at the muffler end (model left side, rear)
      this.acc.exhaust += dt * (2 + b.throttle * 10);
      while (this.acc.exhaust > 1) {
        this.acc.exhaust--;
        const lx = 0.2, lz = -0.92;
        const wx = b.x + Math.cos(b.heading) * lx + Math.sin(b.heading) * lz;
        const wz = b.z - Math.sin(b.heading) * lx + Math.cos(b.heading) * lz;
        this.emit(wx, 0.6, wz, { vx: -fx * 0.8, vy: 0.25, vz: -fz * 0.8, life: 0.6 + b.throttle * 0.6, s0: 0.08, s1: 0.6, alpha: 0.12 + b.throttle * 0.12, color: [0.7, 0.7, 0.72], drag: 2 });
      }
    }
  }

  update(dt) {
    let j = 0;
    for (const p of this.p) {
      if (p.life <= 0) { this.alpha[j] = 0; this.size[j] = 0; j++; continue; }
      p.life -= dt;
      const t = 1 - Math.max(0, p.life) / p.max;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.rise * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      this.pos[j * 3] = p.x; this.pos[j * 3 + 1] = p.y; this.pos[j * 3 + 2] = p.z;
      this.size[j] = p.s0 + (p.s1 - p.s0) * t;
      this.alpha[j] = p.a * (1 - t) * Math.min(1, t * 8);
      this.color[j * 3] = p.r; this.color[j * 3 + 1] = p.g; this.color[j * 3 + 2] = p.b;
      j++;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = true;
  }
}
