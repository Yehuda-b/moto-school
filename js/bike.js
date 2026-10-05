import * as THREE from 'three';
import { createMotorcycle, WHEEL_R } from './models/motorcycle.js';

// Sequential gearbox: 1 is below neutral, 2-5 above it.
export const GEAR_ORDER = ['1', 'N', '2', '3', '4', '5'];
const VMAX = { 1: 12.5, 2: 19, 3: 25.5, 4: 31, 5: 36 };   // m/s at redline per gear
const FORCE = { 1: 4.3, 2: 3.3, 3: 2.6, 4: 2.1, 5: 1.75 }; // peak drive acceleration per gear
export const IDLE = 1200;
export const REDLINE = 10000;
const STALL_RPM = 500;
const WHEELBASE = 1.4;
const MAX_STEER = 0.75;   // full lock: ~1.5 m turning radius at walking pace
const G = 9.81;
const LAT_G = 1.25;       // max cornering grip (in g) — bounds the radius at speed (r = v² / (LAT_G·g))

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (cur, target, rate, dt) => (cur < target ? Math.min(target, cur + rate * dt) : Math.max(target, cur - rate * dt));

export class Bike {
  constructor(scene) {
    this.scene = scene;
    this.model = createMotorcycle({ paint: 0xd62828, jacket: 0x1f2a3a, helmet: 0xf4f4f4, vest: 0xf5ff1a });
    this.root = this.model.root;
    this.leanG = this.model.lean;
    this.y = 0;
    scene.add(this.root);
    this.events = [];
    this.reset(0, 0, 0);
  }

  reset(x, z, heading, { engineOn = false } = {}) {
    this.x = x; this.z = z; this.heading = heading;
    this.v = 0;
    this.lean = 0;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.clutch = 1;          // engagement: 1 = lever released (engaged), 0 = pulled in
    this.clutchHeld = false;
    this.gearIdx = 1;         // N
    this.engineOn = engineOn;
    this.cranking = 0;
    this.rpm = engineOn ? IDLE : 0;
    this.freeRpm = this.rpm;
    this.stallT = 0;
    this.paddleT = 0;
    this.crashed = false;
    this.crashT = 0;
    this.crashSide = 1;
    this.blinker = 0;         // -1 left, 0 off, 1 right
    this.footDown = true;
    this.surface = 'asphalt';
    this.distance = 0;
    this.time = 0;
    this.events.length = 0;
    this.syncModel(0);
  }

  get gear() { return GEAR_ORDER[this.gearIdx]; }
  get kmh() { return Math.abs(this.v) * 3.6; }
  get fwdX() { return Math.sin(this.heading); }
  get fwdZ() { return Math.cos(this.heading); }
  get wheelRpm() {
    const g = this.gear;
    return g === 'N' ? 0 : (Math.max(0, this.v) / VMAX[g]) * REDLINE;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  toggleEngine(auto) {
    if (this.crashed) return;
    if (this.engineOn || this.cranking > 0) {
      this.engineOn = false;
      this.cranking = 0;
      this.emit('engineOff');
      return;
    }
    if (this.gear !== 'N' && !this.clutchHeld && !auto) {
      this.emit('msg', { text: 'כדי להתניע: העבר לניוטרל (N) או החזק את המצמד (Shift)', kind: 'warn' });
      return;
    }
    this.cranking = 0.7;
    this.emit('crank');
  }

  shift(dir, auto) {
    if (this.crashed) return;
    if (!auto && !this.clutchHeld) {
      this.emit('msg', { text: 'החלפת הילוך רק עם מצמד לחוץ — החזק Shift', kind: 'warn' });
      this.emit('grind');
      return;
    }
    let next = clamp(this.gearIdx + dir, 0, GEAR_ORDER.length - 1);
    // like a real bike, a full click between 1 and 2 while rolling skips the neutral "half-click"
    if (GEAR_ORDER[next] === 'N' && this.v > 1.5) next = clamp(next + dir, 0, GEAR_ORDER.length - 1);
    if (next === this.gearIdx) return;
    this.gearIdx = next;
    this.emit('shift', { gear: this.gear });
    if (this.gear !== 'N' && this.wheelRpm > REDLINE * 1.08) {
      this.emit('msg', { text: 'הורדת הילוך במהירות גבוהה מדי — המנוע מסתובב מהר מדי!', kind: 'warn' });
    }
  }

  toNeutral() {
    if (this.crashed || this.gear === 'N') return;
    if (!this.clutchHeld) {
      this.emit('msg', { text: 'כדי לעבור לניוטרל — החזק את המצמד (Shift)', kind: 'warn' });
      return;
    }
    this.gearIdx = GEAR_ORDER.indexOf('N');
    this.emit('shift', { gear: 'N' });
  }

  stall() {
    this.engineOn = false;
    this.cranking = 0;
    this.stallT = 0;
    this.emit('stall');
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashT = 0;
    this.crashSide = Math.sign(this.lean) || (Math.random() < 0.5 ? -1 : 1);
    this.engineOn = false;
    this.emit('crash', { reason });
  }

  update(dt, input, world, auto) {
    this.world = world;
    this.time += dt;
    const prevX = this.x, prevZ = this.z;

    if (this.crashed) {
      this.crashT += dt;
      this.v = approach(this.v, 0, 7, dt);
      this.lean = approach(this.lean, this.crashSide * 1.38, 4, dt);
      this.rpm = approach(this.rpm, 0, 8000, dt);
      this.throttle = 0;
      this.x += this.fwdX * this.v * dt;
      this.z += this.fwdZ * this.v * dt;
      if (world.collides(this.x, this.z, 0.4)) { this.x = prevX; this.z = prevZ; this.v = 0; }
      this.syncModel(dt);
      return;
    }

    // ----- controls -----
    const thrKey = input.down('KeyW', 'ArrowUp');
    const brkKey = input.down('KeyS', 'ArrowDown', 'Space');
    const left = input.down('KeyA', 'ArrowLeft');
    const right = input.down('KeyD', 'ArrowRight');
    this.clutchHeld = input.down('ShiftLeft', 'ShiftRight');

    if (input.hit('KeyI')) this.toggleEngine(auto);
    if (!auto) {
      if (input.hit('KeyE')) this.shift(1, false);
      if (input.hit('KeyQ')) this.shift(-1, false);
      if (input.hit('KeyN')) this.toNeutral();
    }
    if (input.hit('KeyZ')) { this.blinker = this.blinker === -1 ? 0 : -1; this.emit('blinker'); }
    if (input.hit('KeyX')) { this.blinker = this.blinker === 1 ? 0 : 1; this.emit('blinker'); }

    this.throttle = approach(this.throttle, thrKey ? 1 : 0, thrKey ? 2.4 : 5, dt);
    this.brake = approach(this.brake, brkKey ? 1 : 0, 6, dt);
    const steerTarget = (right ? 1 : 0) - (left ? 1 : 0);
    this.steer = approach(this.steer, steerTarget, steerTarget === 0 ? 5 : 4.5, dt);

    // ----- automatic mode helpers -----
    if (auto) {
      if (!this.engineOn && this.cranking <= 0 && thrKey) this.toggleEngine(true);
      if (this.engineOn) {
        const setGear = (n) => { this.gearIdx = GEAR_ORDER.indexOf(String(n)); this.emit('shift', { gear: this.gear }); };
        if (this.gear === 'N' && thrKey) setGear(1);
        const g = this.gear;
        if (g !== 'N') {
          const wr = this.wheelRpm;
          if (wr > 8200 && +g < 5) { setGear(+g + 1); this.clutch = 0.35; }
          else if (wr < 2600 && +g > 1) setGear(+g - 1);
        }
      }
      const want = (this.v < 1 && this.throttle < 0.05) || this.brake > 0.5 ? 0 : (this.v < 3 ? Math.min(1, this.throttle * 2.5 + this.v / 3) : 1);
      this.clutch = approach(this.clutch, want, 3, dt);
    } else {
      // pulling the lever is fast, releasing it takes ~0.7s so the clutch passes the friction zone
      this.clutch = this.clutchHeld ? approach(this.clutch, 0, 7, dt) : approach(this.clutch, 1, 1.4, dt);
    }

    // ----- engine -----
    if (this.cranking > 0) {
      this.cranking -= dt;
      this.rpm = 400 + Math.random() * 300;
      if (this.cranking <= 0) {
        this.engineOn = true;
        this.rpm = this.freeRpm = IDLE + 600;
        this.emit('engineOn');
      }
    }

    const gname = this.gear;
    const wheelRpm = this.wheelRpm;
    const targetRpm = IDLE + this.throttle * (REDLINE - IDLE);
    let drive = 0;
    if (this.engineOn) {
      this.freeRpm += (targetRpm - this.freeRpm) * Math.min(1, dt * 6);
      if (gname !== 'N' && this.clutch > 0.02) {
        const c = this.clutch;
        drive = c * FORCE[gname] * clamp((targetRpm - wheelRpm) / 3000, -0.4, 1);
        this.rpm = this.freeRpm + (wheelRpm - this.freeRpm) * c * c;
        if (c > 0.5) this.freeRpm = this.rpm;
        if (!auto && c > 0.9 && wheelRpm < STALL_RPM && this.v >= 0) {
          this.stallT += dt;
          if (this.stallT > 0.3) this.stall();
        } else this.stallT = 0;
      } else {
        this.rpm = this.freeRpm;
        this.stallT = 0;
      }
    } else if (this.cranking <= 0) {
      this.rpm = approach(this.rpm, 0, 6000, dt);
      this.freeRpm = this.rpm;
    }

    // ----- longitudinal dynamics -----
    this.surface = world.surfaceAt(this.x, this.z);
    const grass = this.surface === 'grass';
    const resist = 0.12 + (grass ? 1.3 : 0) + 0.0008 * this.v * this.v + this.brake * (grass ? 4.5 : 7.5);

    // walking the bike backwards with the feet: hold B at standstill in neutral / with clutch in
    const canPaddle = this.v <= 0.05 && input.down('KeyB') && !thrKey && (gname === 'N' || this.clutch < 0.3 || !this.engineOn);
    if (canPaddle) this.paddleT += dt; else this.paddleT = 0;

    if (this.paddleT > 0.25) {
      this.v = -0.7;
    } else if (this.v < 0) {
      this.v = 0;
    } else {
      const a = drive - resist;
      this.v = Math.max(0, this.v + a * dt);
    }

    // ----- steering / lean -----
    const sp = Math.abs(this.v);
    const yawLow = (sp / WHEELBASE) * Math.tan(MAX_STEER);
    const yawMax = sp > 0.01 ? Math.min(yawLow, (LAT_G * G) / sp) : 0;
    const yaw = -this.steer * yawMax * (this.v < 0 ? -1 : 1);
    this.heading += yaw * dt;

    this.footDown = sp < 0.4;
    const leanTarget = this.footDown ? -0.09 : Math.atan((sp * Math.abs(yaw)) / G) * Math.sign(this.steer);
    this.lean = approach(this.lean, leanTarget, 2.2, dt);
    this.steerVis = this.steer * MAX_STEER * clamp(1 - sp / 10, 0.14, 1);

    if (this.brake > 0.8 && Math.abs(this.lean) > 0.45 && this.v > 7) {
      this.crash('בלמת חזק בזמן הטיה — הגלגל החליק. בולמים לפני הפנייה, כשהאופנוע ישר!');
    }

    // ----- integrate & collide -----
    this.x += this.fwdX * this.v * dt;
    this.z += this.fwdZ * this.v * dt;
    const fx = this.x + this.fwdX * 0.75, fz = this.z + this.fwdZ * 0.75;
    const rx = this.x - this.fwdX * 0.75, rz = this.z - this.fwdZ * 0.75;
    const hit = world.collides(fx, fz, 0.32) || world.collides(rx, rz, 0.3);
    if (hit) {
      // moving obstacles (people, cars, other riders) carry their own message
      if (sp > (hit.reason ? 1.5 : 3.2)) {
        this.crash(hit.reason || 'התנגשת במכשול!');
      } else {
        this.x = prevX; this.z = prevZ;
        this.v = 0;
        if (sp > 0.6) this.emit('bump');
      }
    }
    this.distance += Math.hypot(this.x - prevX, this.z - prevZ);
    this.syncModel(dt);
  }

  // ---------------- visuals ----------------
  syncModel(dt) {
    // ride up onto curbs smoothly
    const gy = this.world ? this.world.heightAt(this.x, this.z) : 0;
    this.y += (gy - this.y) * Math.min(1, (dt || 0.016) * 12);
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.heading;
    const blinkOn = this.blinker !== 0 && this.time % 0.8 < 0.4;
    this.model.update({
      lean: this.lean,
      steerVis: this.steerVis || 0,
      v: this.v,
      footDown: this.footDown && !this.crashed,
      braking: this.brake > 0.1,
      engineOn: this.engineOn,
      blinkLeft: blinkOn && this.blinker === -1,
      blinkRight: blinkOn && this.blinker === 1,
    }, dt || 0);
  }

  /** Camera anchor for first-person view, in world space. */
  headWorldPosition(target) {
    this.root.updateMatrixWorld();
    return this.leanG.localToWorld(target.set(0, 1.7, 0.08));
  }
}
