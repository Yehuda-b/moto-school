// Device detection (touch vs. keyboard/mouse) and fullscreen.
// The mode follows the last input used, so hybrid devices (touch laptops, tablets with a keyboard) switch on the fly.

const doc = document;
const listeners = [];

function detectTouch() {
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);
}

export const device = {
  touch: detectTouch(),
  get portrait() { return innerHeight > innerWidth; },
  onChange(fn) { listeners.push(fn); },
  setTouch(on) {
    if (on === this.touch) return;
    this.touch = on;
    applyClasses();
    for (const fn of listeners) fn(on);
  },
};

function applyClasses() {
  doc.body.classList.toggle('touch', device.touch);
  doc.body.classList.toggle('no-fs', !fullscreen.supported);
}

addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') device.setTouch(true); }, true);
addEventListener('keydown', () => device.setTouch(false), true);
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) device.setTouch(false);
}, true);

// Lesson texts name keyboard keys; on touch, name the on-screen buttons instead.
const TOUCH_LABELS = { W: 'גז', S: 'ברקס', I: 'התנעה', Q: '▼', E: '▲', X: 'איתות ▶', Z: '◀ איתות', N: 'N', C: 'מצלמה' };
export function forDevice(text) {
  if (!device.touch || typeof text !== 'string') return text;
  // phones always ride with the automatic gearbox: drop gear / clutch advice
  if (/לוחצים מצמד בזמן הבלימה/.test(text)) return '';
  return text
    .replace(/ — הילוך ראשון או שני,/g, ' —')
    .replace(/הילוך ראשון, /g, '')
    .replace(/הכנס להילוך, /g, '')
    .replace(/ — העלה הילוכים בדרך/g, '')
    .replace(/\s*\(Shift\)/g, '')
    .replace(/— Shift/g, '— כפתור המצמד')
    .replace(/החזק Shift/g, 'החזק את המצמד')
    // a lone key letter: "(W)", "לחץ I", "ראשון: Q", "X לימין"...
    .replace(/(^|[\s(:,])([A-Z])(?=$|[\s).,:])/g, (m, pre, k) => {
      const label = TOUCH_LABELS[k];
      if (!label || label === k) return m;
      return pre + (pre === '(' ? label : `"${label}"`);
    })
    // "גז (גז)", "התנע (התנעה)" -> just the word
    .replace(/(\S+) \(([^()]+)\)/g, (m, word, label) =>
      (LABEL_SET.has(label) && (label.startsWith(word) || word.endsWith(label)) ? word : m));
}
const LABEL_SET = new Set(Object.values(TOUCH_LABELS));

export const fullscreen = {
  supported: !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled),
  get active() { return !!(doc.fullscreenElement || doc.webkitFullscreenElement); },
  /** Must be called from a user gesture (click / tap / key). */
  async toggle() {
    try {
      if (this.active) {
        await (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
        return;
      }
      const el = doc.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else el.webkitRequestFullscreen?.();
      // phones: ride in landscape (works on Android; iOS ignores it)
      if (device.touch) await screen.orientation?.lock?.('landscape');
    } catch { /* refused or unsupported */ }
  },
  onChange(fn) {
    doc.addEventListener('fullscreenchange', fn);
    doc.addEventListener('webkitfullscreenchange', fn);
  },
};

applyClasses();
fullscreen.onChange(() => doc.body.classList.toggle('fs-on', fullscreen.active));
