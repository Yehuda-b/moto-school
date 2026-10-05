// Keyboard + touch input. Uses KeyboardEvent.code so it works on Hebrew and English layouts alike.
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyI', 'KeyZ', 'KeyX', 'KeyC', 'KeyB', 'KeyN', 'KeyH', 'KeyM', 'KeyR',
  'ShiftLeft', 'ShiftRight', 'Escape', 'Enter', 'NumpadEnter',
]);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();

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
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('pressed');
        this.keys.add(code);
        this.pressed.add(code);
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
