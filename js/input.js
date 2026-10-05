// Keyboard + touch input. Uses KeyboardEvent.code so it works on Hebrew and English layouts alike.
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyI', 'KeyZ', 'KeyX', 'KeyC', 'KeyB', 'KeyN', 'KeyH', 'KeyM', 'KeyR',
  'ShiftLeft', 'ShiftRight', 'Escape', 'Enter', 'NumpadEnter',
]);

// keep receiving a finger that slides off its control (never let a failed capture block input)
const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* pointer already gone */ } };

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.haptics = true;

    addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    for (const btn of document.querySelectorAll('#touch button[data-key]')) {
      const code = btn.dataset.key;
      const press = (e) => {
        e.preventDefault();
        capture(btn, e.pointerId);
        btn.classList.add('pressed');
        this.keys.add(code);
        this.pressed.add(code);
        this.buzz();
      };
      const release = () => {
        btn.classList.remove('pressed');
        this.keys.delete(code);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
    }

    // steering pad: the thumb slides between left and right without lifting
    const pad = document.querySelector('#touch .steer-pad');
    let padId = null;
    const steerTo = (e) => {
      const r = pad.getBoundingClientRect();
      const f = (e.clientX - r.left) / r.width;
      const dir = f < 0.42 ? -1 : f > 0.58 ? 1 : 0;
      if (String(dir) !== pad.dataset.dir) this.buzz();
      pad.dataset.dir = dir;
      this.setKey('KeyA', dir === -1);
      this.setKey('KeyD', dir === 1);
    };
    const steerEnd = (e) => {
      if (e.pointerId !== padId) return;
      padId = null;
      pad.dataset.dir = 0;
      this.setKey('KeyA', false);
      this.setKey('KeyD', false);
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      padId = e.pointerId;
      capture(pad, padId);
      steerTo(e);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) steerTo(e); });
    pad.addEventListener('pointerup', steerEnd);
    pad.addEventListener('pointercancel', steerEnd);
    pad.addEventListener('lostpointercapture', steerEnd);

    // no long-press menus / text selection on the controls
    document.getElementById('touch').addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setKey(code, on) {
    if (on && !this.keys.has(code)) this.pressed.add(code);
    if (on) this.keys.add(code); else this.keys.delete(code);
  }

  /** Short vibration on touch controls (Android; ignored elsewhere). */
  buzz() {
    if (this.haptics) navigator.vibrate?.(8);
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True only on the frame the key was first pressed. */
  hit(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
  }
}
