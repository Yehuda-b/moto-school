// Game-style menus: a stack of full-screen menu screens with keyboard / mouse focus navigation,
// the tabbed settings screen and a confirm dialog.

const $ = (id) => document.getElementById(id);

export const KEYS_HELP = [
  [['W', '↑'], 'גז'],
  [['S', '↓'], 'ברקס'],
  [['A', 'D'], 'היגוי'],
  [['Shift'], 'מצמד (להחזיק)'],
  [['E'], 'הילוך למעלה'],
  [['Q'], 'הילוך למטה'],
  [['N'], 'ניוטרל'],
  [['I'], 'התנעה / כיבוי'],
  [['Z'], 'איתות שמאל'],
  [['X'], 'איתות ימין'],
  [['B'], 'הליכה אחורה (בעמידה, בניוטרל)'],
  [['C'], 'החלפת מצלמה'],
  [['M'], 'השתקת מנוע'],
  [['R'], 'התחלת השיעור מחדש'],
  [['H'], 'הסתרת המקשים'],
  [['Esc'], 'השהיה'],
  [['F'], 'מסך מלא'],
];

export const TOUCH_HELP = [
  [['◀ ▶'], 'היגוי — מחליקים את האגודל על המשטח, שמאל למטה'],
  [['◀ איתות', 'איתות ▶'], 'איתותים — מעל ההיגוי'],
  [['גז', 'ברקס'], 'ימין למטה. הגז גם מתניע את המנוע'],
  [['AUTO'], 'בטלפון ההילוכים אוטומטיים — אין מצמד'],
  [['II', 'מצלמה', 'מסך מלא'], 'הכפתורים ליד המפה'],
];

/** The settings screen, tab by tab. `key` is the field in the settings object. */
export function settingsTabs(qualityOptions) {
  return [
    { label: 'גרפיקה', items: [
      { key: 'quality', type: 'choice', label: 'איכות גרפיקה', hint: 'צללים, תאורה, דשא ואפקטים', options: qualityOptions,
        confirm: 'שינוי איכות הגרפיקה טוען את המשחק מחדש (שיעור פעיל יתחיל מההתחלה). להמשיך?' },
      { key: 'fov', type: 'slider', label: 'שדה ראייה', hint: 'כמה רחב רואים בזמן רכיבה', min: 50, max: 80, step: 2, unit: '°' },
      { key: 'shake', type: 'toggle', label: 'רעידת מצלמה', hint: 'על דשא ובמהירות' },
      { key: 'fps', type: 'toggle', label: 'מונה FPS' },
    ] },
    { label: 'שמע', items: [
      { key: 'volume', type: 'slider', label: 'עוצמה כללית', min: 0, max: 100, step: 5, unit: '%' },
      { key: 'sound', type: 'toggle', label: 'קול מנוע ואפקטים', hint: 'גם מהמקש M בזמן רכיבה' },
      { key: 'uiSound', type: 'toggle', label: 'צלילי תפריט' },
    ] },
    { label: 'משחק', items: [
      { key: 'auto', type: 'toggle', label: 'תיבת הילוכים אוטומטית', hint: 'למתחילים מאוד. שיעורי המצמד וההילוכים תמיד ידניים', kbdOnly: true },
      { key: 'camera', type: 'choice', label: 'מצלמת ברירת מחדל', options: [[0, 'מאחור'], [1, 'מבט רוכב'], [2, 'מלמעלה']] },
      { key: 'minimap', type: 'toggle', label: 'מפה קטנה' },
      { key: 'keys', type: 'toggle', label: 'הצגת מקשים בזמן רכיבה' },
      { key: 'resetProgress', type: 'action', label: 'איפוס התקדמות', hint: 'מחיקת כל הכוכבים והשיאים', button: 'איפוס', danger: true,
        confirm: 'כל הכוכבים והשיאים יימחקו. להמשיך?' },
    ] },
    { label: 'שליטה', keys: true, items: [
      { key: 'touchSize', type: 'slider', label: 'גודל כפתורי מגע', min: 70, max: 140, step: 5, unit: '%', touchOnly: true },
      { key: 'haptics', type: 'toggle', label: 'רטט בלחיצה', hint: 'בטלפונים שתומכים בזה', touchOnly: true },
    ] },
  ];
}

// bottom prompt bar, per screen: [[keys], label]
const PROMPTS = {
  splash: [],
  menu: [[['▲', '▼'], 'ניווט'], [['Enter'], 'בחירה']],
  lessons: [[['Enter'], 'בחירה'], [['Esc'], 'חזרה']],
  briefing: [[['Enter'], 'בחירה'], [['Esc'], 'חזרה']],
  pause: [[['Enter'], 'בחירה'], [['Esc'], 'המשך']],
  settings: [[['Q', 'E'], 'לשונית'], [['◀', '▶'], 'שינוי ערך'], [['Esc'], 'חזרה']],
  howto: [[['Esc'], 'חזרה']],
  result: [[['Enter'], 'בחירה'], [['Esc'], 'לתפריט']],
};
const MODAL_PROMPTS = [[['◀', '▶'], 'ניווט'], [['Enter'], 'בחירה'], [['Esc'], 'ביטול']];

const SFX = {
  move: [[1320, 0.035, 0.03]],
  select: [[880, 0.05, 0.05], [1760, 0.08, 0.04]],
  back: [[660, 0.05, 0.045], [440, 0.08, 0.04]],
  win: [[784, 0.1, 0.06], [988, 0.1, 0.06], [1319, 0.25, 0.06]],
  lose: [[392, 0.12, 0.06], [294, 0.28, 0.06]],
};

export class MenuUI {
  constructor({ audio, settings, tabs, onSetting, onAction }) {
    Object.assign(this, { audio, settings, tabs, onSetting, onAction });
    this.stack = [];
    this.focusEl = null;
    this.focusMem = {};      // last focused item per screen, restored when coming back
    this.backHandlers = {};  // screen id -> what Esc / back does there (default: pop the stack)
    this.modal = null;
    this.rows = {};
    this.tabIdx = 0;

    this.buildSettings();
    $('howto-keys').append(this.keysGrid(), this.keysGrid(TOUCH_HELP));
    $('cf-ok').onclick = () => this.closeModal(true);
    $('cf-cancel').onclick = () => this.closeModal(false);
    $('splash').addEventListener('click', () => this.leaveSplash());

    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest?.('[data-nav]');
      if (el && el !== this.focusEl && this.navItems().includes(el)) this.setFocus(el, false, false);
    });
    // capture phase: some controls stop propagation of their own clicks
    document.addEventListener('click', (e) => {
      if (e.target.type !== 'range' && e.target.closest?.('[data-nav], .tab, .car-arrow')) this.sfx('select');
    }, true);
  }

  get top() { return this.stack[this.stack.length - 1] ?? null; }

  show(id) { this.setStack(id ? [id] : []); }
  push(id) { this.stack.push(id); this.render(); }
  setStack(ids, restore = false) { this.stack = [...ids]; this.render(restore); }

  openSettings(tab = 0) {
    this.push('settings');
    this.selectTab(tab, true);
  }

  back() {
    if (this.modal) { this.sfx('back'); this.closeModal(false); return; }
    const handler = this.backHandlers[this.top];
    if (handler) { this.sfx('back'); handler(); } else if (this.stack.length > 1) {
      this.sfx('back');
      this.stack.pop();
      this.render(true);
    }
  }

  render(restore = false) {
    const top = this.top;
    for (const id of Object.keys(PROMPTS)) $(id).classList.toggle('hidden', id !== top);
    $('menu-bg').classList.toggle('hidden', !['splash', 'menu'].includes(this.stack[0]));
    this.renderPrompts();
    this.focusEl?.classList.remove('is-focus');
    this.focusEl = null;
    if (!top) return;
    const items = this.navItems();
    const mem = restore && this.focusMem[top];
    this.setFocus(items.includes(mem) ? mem : items.find((el) => el.classList.contains('primary')) || items[0], true);
  }

  renderPrompts() {
    const list = this.modal ? MODAL_PROMPTS : PROMPTS[this.top] || [];
    const el = $('prompts');
    el.classList.toggle('hidden', !list.length);
    el.innerHTML = list.map(([keys, label]) => `<span class="pr">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}<span>${label}</span></span>`).join('');
  }

  // ---------- focus & keyboard ----------
  navItems() {
    const root = this.modal ? $('confirm') : this.top && $(this.top);
    if (!root) return [];
    return [...root.querySelectorAll('[data-nav]')].filter((el) => el.getClientRects().length);
  }

  setFocus(el, silent = false, scroll = true) {
    if (!el || el === this.focusEl) return;
    this.focusEl?.classList.remove('is-focus');
    this.focusEl = el;
    el.classList.add('is-focus');
    if (scroll) el.scrollIntoView({ block: 'nearest' });
    if (!this.modal && this.top) this.focusMem[this.top] = el;
    if (!silent) this.sfx('move');
  }

  /** Called every frame while a menu is up. */
  handleKeys(input) {
    if (!this.top) return;
    const hit = (...codes) => codes.some((c) => input.hit(c));
    if (this.top === 'splash') {
      if (input.pressed.size) this.leaveSplash();
      return;
    }
    if (hit('Escape')) { this.back(); return; }
    if (hit('ArrowUp', 'KeyW')) this.move(0, -1);
    else if (hit('ArrowDown', 'KeyS')) this.move(0, 1);
    else if (hit('ArrowLeft', 'KeyA')) this.horizontal(-1);
    else if (hit('ArrowRight', 'KeyD')) this.horizontal(1);
    if (hit('Enter', 'NumpadEnter', 'Space')) this.focusEl?.click();
    if (this.top === 'settings' && !this.modal) {
      // tabs run right-to-left: Q (left on the keyboard) goes left, E goes right
      if (hit('KeyQ')) this.selectTab(this.tabIdx + 1);
      if (hit('KeyE')) this.selectTab(this.tabIdx - 1);
    }
  }

  horizontal(d) {
    const el = this.focusEl;
    if (el?.dataset.adjust) { this.adjust(el.dataset.key, d); this.sfx('move'); } else this.move(d, 0);
  }

  /** Spatial navigation: the nearest item in the pressed direction. */
  move(dx, dy) {
    const items = this.navItems();
    if (!items.length) return;
    const cur = items.includes(this.focusEl) ? this.focusEl : null;
    if (!cur) { this.setFocus(items[0]); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
      const along = dx ? x * dx : y * dy;
      if (along <= 4) continue;
      const score = along + 2 * (dx ? Math.abs(y) : Math.abs(x));
      if (score < bestScore) { bestScore = score; best = el; }
    }
    // vertical lists wrap around
    if (!best && dy) best = dy > 0 ? items[0] : items[items.length - 1];
    if (best && best !== cur) this.setFocus(best);
  }

  sfx(kind) {
    if (!this.settings.uiSound || !this.audio.ctx) return;
    const gap = kind === 'win' || kind === 'lose' ? 130 : 60;
    SFX[kind].forEach(([f, d, v], i) => setTimeout(() => this.audio.beep(f, d, 'square', v), i * gap));
  }

  leaveSplash() {
    if (this.top !== 'splash') return;
    this.audio.init();
    this.audio.resume();
    this.show('menu');
    this.sfx('select');
  }

  // ---------- settings screen ----------
  buildSettings() {
    const tabs = $('set-tabs'), body = $('set-body');
    // right-to-left: E sits on the right edge, Q on the left
    tabs.innerHTML = `<kbd>E</kbd>${this.tabs.map((t, i) => `<button class="tab" data-tab="${i}">${t.label}</button>`).join('')}<kbd>Q</kbd>`;
    tabs.onclick = (e) => {
      const b = e.target.closest('.tab');
      if (b) this.selectTab(+b.dataset.tab, true);
    };
    body.innerHTML = '';
    for (const t of this.tabs) {
      const pane = document.createElement('div');
      pane.className = 'set-pane';
      for (const it of t.items || []) pane.appendChild(this.buildRow(it));
      if (t.keys) pane.append(this.keysGrid(), this.keysGrid(TOUCH_HELP));
      body.appendChild(pane);
    }
    this.selectTab(0, true);
    this.refresh();
  }

  buildRow(it) {
    const row = document.createElement('div');
    row.className = 'set-row' + (it.danger ? ' danger' : '') + (it.touchOnly ? ' touch-only' : '') + (it.kbdOnly ? ' kbd-only' : '');
    row.dataset.nav = '';
    row.dataset.key = it.key;
    if (it.type !== 'action') row.dataset.adjust = it.type;
    row.innerHTML = `<div class="sr-label">${it.label}${it.hint ? `<small>${it.hint}</small>` : ''}</div><div class="sr-ctrl"></div>`;
    const ctrl = row.querySelector('.sr-ctrl');
    if (it.type === 'toggle') {
      ctrl.innerHTML = '<span class="switch"><span class="sw-off">OFF</span><span class="sw-on">ON</span></span>';
      row.onclick = () => this.set(it, !this.settings[it.key]);
    } else if (it.type === 'choice') {
      ctrl.innerHTML = '<span class="carousel"><button class="car-arrow" data-d="-1">◀</button><span class="car-mid"><span class="car-val"></span><span class="car-dots"></span></span><button class="car-arrow" data-d="1">▶</button></span>';
      for (const b of ctrl.querySelectorAll('.car-arrow')) {
        b.onclick = (e) => { e.stopPropagation(); this.stepChoice(it, +b.dataset.d); };
      }
      row.onclick = () => this.stepChoice(it, 1);
    } else if (it.type === 'slider') {
      ctrl.innerHTML = `<input type="range" min="${it.min}" max="${it.max}" step="${it.step}" tabindex="-1"><output></output>`;
      const input = ctrl.querySelector('input');
      input.oninput = () => this.set(it, +input.value);
    } else {
      ctrl.innerHTML = `<span class="btn-chip">${it.button}</span>`;
      row.onclick = () => this.runAction(it);
    }
    this.rows[it.key] = { it, row };
    return row;
  }

  keysGrid(list = KEYS_HELP) {
    const g = document.createElement('div');
    g.className = 'keys-grid ' + (list === KEYS_HELP ? 'kbd-only' : 'touch-only touch-help');
    g.innerHTML = list.map(([keys, label]) =>
      `<div class="key-row"><span class="key-caps">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span><span>${label}</span></div>`).join('');
    return g;
  }

  selectTab(i, silent = false) {
    const n = this.tabs.length;
    this.tabIdx = (i + n) % n;
    $('set-tabs').querySelectorAll('.tab').forEach((b, k) => b.classList.toggle('active', k === this.tabIdx));
    $('set-body').querySelectorAll('.set-pane').forEach((p, k) => p.classList.toggle('hidden', k !== this.tabIdx));
    $('set-body').scrollTop = 0;
    if (this.top === 'settings' && !this.modal) {
      if (!silent) this.sfx('move');
      this.setFocus(this.navItems()[0], true);
    }
  }

  adjust(key, d) {
    const { it } = this.rows[key];
    const v = this.settings[key];
    if (it.type === 'toggle') this.set(it, !v);
    else if (it.type === 'choice') this.stepChoice(it, d);
    else if (it.type === 'slider') this.set(it, Math.min(it.max, Math.max(it.min, v + d * it.step)));
  }

  stepChoice(it, d) {
    const n = it.options.length;
    const idx = Math.max(0, it.options.findIndex(([k]) => k === this.settings[it.key]));
    this.set(it, it.options[(idx + d + n) % n][0]);
  }

  async set(it, v) {
    if (v === this.settings[it.key]) return;
    if (it.confirm && !(await this.confirm(it.confirm))) { this.refresh(); return; }
    this.onSetting(it.key, v);
    this.refresh();
  }

  async runAction(it) {
    if (it.confirm && !(await this.confirm(it.confirm, true))) return;
    this.onAction(it.key);
  }

  /** Sync every control with the settings object. */
  refresh() {
    for (const { it, row } of Object.values(this.rows)) {
      const v = this.settings[it.key];
      if (it.type === 'toggle') row.classList.toggle('on', !!v);
      else if (it.type === 'choice') {
        const idx = it.options.findIndex(([k]) => k === v);
        row.querySelector('.car-val').textContent = it.options[idx]?.[1] ?? '';
        row.querySelector('.car-dots').innerHTML = it.options.map((_, k) => `<i class="${k === idx ? 'on' : ''}"></i>`).join('');
      } else if (it.type === 'slider') {
        const input = row.querySelector('input');
        input.value = v;
        input.style.setProperty('--p', `${((v - it.min) / (it.max - it.min)) * 100}%`);
        row.querySelector('output').textContent = `${v}${it.unit || ''}`;
      }
    }
  }

  // ---------- confirm dialog ----------
  confirm(text, danger = false) {
    if (this.modal) this.closeModal(false);
    return new Promise((resolve) => {
      $('cf-text').textContent = text;
      $('cf-ok').classList.toggle('danger', danger);
      $('confirm').classList.remove('hidden');
      this.modal = { resolve, prevFocus: this.focusEl };
      this.renderPrompts();
      this.setFocus($('cf-cancel'), true);
    });
  }

  closeModal(ok) {
    const m = this.modal;
    if (!m) return;
    this.modal = null;
    $('confirm').classList.add('hidden');
    this.renderPrompts();
    if (m.prevFocus?.isConnected && this.navItems().includes(m.prevFocus)) this.setFocus(m.prevFocus, true, false);
    else {
      this.focusEl?.classList.remove('is-focus');
      this.focusEl = null;
    }
    m.resolve(ok);
  }
}
