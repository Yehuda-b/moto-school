import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Sky } from 'three/addons/objects/Sky.js';

export const QUALITY = {
  high: { label: 'גבוהה', pixelRatio: 1.5, cascades: 3, shadowMap: 2048, ao: true, bloom: true, aa: true, grass: 1, shadowFar: 260 },
  medium: { label: 'בינונית', pixelRatio: 1.0, cascades: 3, shadowMap: 2048, ao: false, bloom: true, aa: true, grass: 0.6, shadowFar: 200 },
  low: { label: 'נמוכה', pixelRatio: 1.0, cascades: 2, shadowMap: 1024, ao: false, bloom: false, aa: false, grass: 0, shadowFar: 140 },
};

export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(56), THREE.MathUtils.degToRad(118));

// Final grade: slight warmth, contrast, saturation and a soft vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.28 }, uSat: { value: 1.12 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uSat;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.5) * 1.05 + 0.5;
      c.rgb *= vec3(1.02, 1.0, 0.97);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = c;
    }`,
};

export class Graphics {
  constructor(canvas, qualityName) {
    this.qName = QUALITY[qualityName] ? qualityName : 'high';
    const q = (this.q = QUALITY[this.qName]);

    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.aa && q.bloom === false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);

    this.buildSky();

    // cascaded shadows cover the whole visible area with crisp detail near the player
    this.csm = new CSM({
      maxFar: q.shadowFar,
      cascades: q.cascades,
      mode: 'practical',
      parent: this.scene,
      shadowMapSize: q.shadowMap,
      lightDirection: SUN_DIR.clone().negate(),
      lightIntensity: 3.8,
      lightMargin: 120,
      camera: this.camera,
    });
    this.csm.fade = true;
    for (const l of this.csm.lights) {
      l.color.set(0xfff0d8);
      l.shadow.normalBias = 0.04;
      l.shadow.bias = -0.0002;
    }

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a6b40, 0.25);
    this.scene.add(this.hemi);

    // post-processing
    this.composer = null;
    if (q.ao || q.bloom || q.aa) {
      const composer = (this.composer = new EffectComposer(renderer));
      composer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
      composer.addPass(new RenderPass(this.scene, this.camera));
      if (q.ao) {
        const ao = (this.aoPass = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight));
        ao.output = GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 0.85;
        ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.5, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        // sprites (clouds, particles) and the sky dome must not write into the AO depth/normal buffer
        const hide = ao.overrideVisibility.bind(ao);
        ao.overrideVisibility = () => {
          hide();
          this.scene.traverse((o) => { if (o.isSprite || o.userData.noAO || (o.material && o.material.transparent && !o.material.depthWrite)) o.visible = false; });
        };
        composer.addPass(ao);
      }
      if (q.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 1.6);
        composer.addPass(this.bloom);
      }
      composer.addPass(new OutputPass());
      composer.addPass(new ShaderPass(GradeShader));
      if (q.aa) {
        const pr = renderer.getPixelRatio();
        composer.addPass(new SMAAPass(innerWidth * pr, innerHeight * pr));
      }
    }

    addEventListener('resize', () => this.resize());
    this._prepTimer = 0;
  }

  buildSky() {
    const sky = (this.sky = new Sky());
    sky.scale.setScalar(2500);
    const u = sky.material.uniforms;
    u.turbidity.value = 2.4;
    u.rayleigh.value = 2.0;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(SUN_DIR);
    sky.userData.noAO = true;
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(0xc6d6e4, 220, 950);

    // image based lighting from the same sky
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(100);
    envSky.material.uniforms.turbidity.value = 2.4;
    envSky.material.uniforms.rayleigh.value = 2.0;
    envSky.material.uniforms.mieCoefficient.value = 0.004;
    envSky.material.uniforms.mieDirectionalG.value = 0.82;
    envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
    envScene.add(envSky);
    // a dark ground disc so reflections show a horizon
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3d4434 }));
    ground.position.y = -2;
    envScene.add(ground);
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
  }

  /** Hook every lit material in `root` into the cascaded shadow system. */
  prepare(root = this.scene) {
    root.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.userData.csm || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) continue;
        const extra = m.onBeforeCompile;
        const hasExtra = m.userData.customShader;
        this.csm.setupMaterial(m);
        if (hasExtra) {
          const csmFn = m.onBeforeCompile;
          m.onBeforeCompile = (sh, r) => { csmFn(sh, r); extra(sh, r); };
        }
        m.userData.csm = true;
        m.needsUpdate = true;
      }
    });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.csm.updateFrustums();
  }

  render(dt) {
    this.csm.update();
    // catch any materials created at runtime (lesson props, NPCs...)
    this._prepTimer -= dt;
    if (this._prepTimer <= 0) { this._prepTimer = 1; this.prepare(); }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
