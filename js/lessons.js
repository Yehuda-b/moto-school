import * as THREE from 'three';
import { paintLine, TrafficLight, RING } from './world.js';
import { segDist } from './session.js';

const gearNum = (g) => (g === 'N' ? 0 : +g);
const dot = (s, x, z, color = 0xffffff) => {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -5 }),
  );
  m.position.set(x, 0.04, z);
  s.group.add(m);
};
/** Did the bike's front cross the line z = zLine (moving in +z) this frame? */
const crossedZ = (s, zLine, prev) => prev < zLine && s.bike.z >= zLine;

export const LESSONS = [
  // ------------------------------------------------------------------ 1
  {
    id: 'start',
    instructor: [-36.5, -40],
    num: 1,
    title: 'התנעה ויציאה לדרך',
    desc: 'מתניעים, מכניסים להילוך ראשון עם המצמד, יוצאים לנסיעה ועוצרים בריבוע.',
    manualOnly: true,
    intro: `<p>ברוכים הבאים למגרש! בשיעור הראשון לומדים את הבסיס: להתניע, להכניס הילוך בעזרת המצמד, לצאת לנסיעה בצורה חלקה ולעצור במקום מסומן.</p>
      <p>תיבת ההילוכים באופנוע היא <b>סדרתית</b>: <b dir="ltr">1 – N – 2 – 3 – 4 – 5</b>. הילוך ראשון נמצא <b>מתחת</b> לניוטרל (Q), וכל השאר מעליו (E).</p>`,
    tips: [
      'תמיד מחזיקים את המצמד (Shift) לפני שמחליפים הילוך.',
      'ביציאה: נותנים מעט גז (W) ומשחררים את המצמד בהדרגה — שחרור בלי גז עלול לכבות את המנוע.',
      'בעצירה: לוחצים מצמד ואז בולמים (S), אחרת המנוע ייכבה.',
    ],
    spawn: { x: -40, z: -45, h: 0, engineOn: false },
    build(s) {
      s.box = s.addBox(-40, 8, 3.2, 5);
      s.group.add(paintLine(-42.5, -50, -42.5, 14, 0.12, 0xffffff));
      s.group.add(paintLine(-37.5, -50, -37.5, 14, 0.12, 0xffffff));
    },
    steps: [
      { text: 'התנע את המנוע — לחץ I', done: (s) => s.bike.engineOn },
      { text: 'לחץ והחזק את המצמד — Shift', done: (s) => s.bike.clutch < 0.3 || s.bike.gear !== 'N' },
      { text: 'כשהמצמד לחוץ — הכנס להילוך ראשון: Q', done: (s) => s.bike.gear === '1' || s.bike.v > 1.5 },
      { text: 'תן מעט גז (W) ושחרר את המצמד בהדרגה', done: (s) => s.bike.v > 1.5 },
      { text: 'סע ישר לכיוון הריבוע הצהוב', enter: (s) => s.setTarget(-40, 8), done: (s) => s.bike.z > -1 },
      { text: 'עצור בתוך הריבוע: מצמד (Shift) + ברקס (S)', done: (s) => s.stopped() && s.inBox(s.box) },
    ],
    update(s) {
      if (s.bike.z > s.box.z + s.box.l / 2 + 4) s.fail('עברת את אזור העצירה — מתחילים לבלום מוקדם יותר.');
    },
  },

  // ------------------------------------------------------------------ 2
  {
    id: 'gears',
    instructor: [-44.5, -48],
    num: 2,
    title: 'החלפת הילוכים',
    desc: 'מעלים הילוכים עד שלישי, מגיעים ל-40 קמ"ש, מורידים הילוכים ועוצרים בלי לכבות את המנוע.',
    manualOnly: true,
    intro: `<p>אופנוע צריך הילוך שמתאים למהירות. כשהסל"ד (סיבובי המנוע) גבוה — מעלים הילוך. כשמאטים — מורידים הילוך.</p>
      <p>כל החלפה: <b>מצמד ← הילוך ← שחרור מצמד</b>. שימו לב למד הסל"ד בלוח המחוונים.</p>`,
    tips: [
      'מעלים הילוך בסביבות 6,000–7,000 סל"ד. אם המחוג באדום — איחרת.',
      'להעלאת הילוך: משחררים גז, מצמד, E, משחררים מצמד וחוזרים לגז.',
      'בהאטה המנוע עצמו עוזר לבלום (בלימת מנוע). מורידים הילוך עם Q.',
    ],
    spawn: { x: -50, z: -55, h: 0, engineOn: false },
    build(s) {
      s.box = s.addBox(-50, 46, 3.2, 5);
      s.group.add(paintLine(-53, -58, -53, 52, 0.12, 0xffffff));
      s.group.add(paintLine(-47, -58, -47, 52, 0.12, 0xffffff));
      s.redT = 0;
    },
    steps: [
      { text: 'התנע (I), הכנס להילוך ראשון וצא לדרך', done: (s) => s.bike.v > 2 },
      { text: 'העלה להילוך שני: מצמד (Shift) + E', done: (s) => gearNum(s.bike.gear) >= 2 && s.bike.clutch > 0.9 },
      { text: 'העלה להילוך שלישי והאץ ל-40 קמ"ש', done: (s) => gearNum(s.bike.gear) >= 3 && s.kmh >= 38 },
      {
        text: 'שחרר גז, בלום והורד להילוך 2 או 1',
        enter: (s) => s.setTarget(-50, 46),
        done: (s) => s.kmh < 18 && gearNum(s.bike.gear) <= 2,
      },
      { text: 'עצור בריבוע — בלי שהמנוע ייכבה', done: (s) => s.stopped() && s.inBox(s.box) && s.bike.engineOn },
    ],
    update(s, dt) {
      const bk = s.bike;
      if (bk.rpm > 9300 && bk.clutch > 0.9) s.redT += dt; else s.redT = 0;
      if (s.redT > 1.2) s.penalty(5, 'סל"ד גבוה מדי — הגיע הזמן להעלות הילוך', { cooldown: 6 });
      if (gearNum(bk.gear) >= 3 && bk.rpm < 1800 && bk.engineOn && bk.throttle > 0.5) s.toast('הסל"ד נמוך מדי להילוך הזה — הורד הילוך', 'info');
      if (bk.z > s.box.z + s.box.l / 2 + 5) s.fail('עברת את אזור העצירה — מתחילים להאט מוקדם יותר.');
    },
  },

  // ------------------------------------------------------------------ 3
  {
    id: 'slalom',
    instructor: [4.5, -40],
    num: 3,
    title: 'סלאלום',
    desc: 'נסיעה איטית ומבוקרת בין קונוסים, לסירוגין ימינה ושמאלה.',
    intro: `<p>סלאלום מלמד שליטה בהיגוי ובמהירות נמוכה. עוברים בין 8 קונוסים לסירוגין — קונוס אחד מימין, הבא משמאל וכן הלאה.</p>
      <p>הנקודות הלבנות על הקרקע מסמנות את המסלול המומלץ.</p>`,
    tips: [
      'רוכבים לאט — הילוך ראשון או שני, בערך 10–20 קמ"ש.',
      'מסתכלים קדימה לקונוס הבא, לא לגלגל הקדמי.',
      'גז עדין וקבוע עוזר לאופנוע להישאר יציב.',
    ],
    spawn: { x: 0, z: -52, h: 0, engineOn: true },
    build(s) {
      s.gateZ = [];
      for (let i = 0; i < 8; i++) {
        const z = -30 + i * 6;
        s.addCone(0, z);
        s.gateZ.push(z);
      }
      for (let z = -33; z <= 15; z += 0.9) dot(s, 1.8 * Math.cos((Math.PI * (z + 30)) / 6), z);
      s.gate = 0;
      s.box = s.addBox(0, 32, 3.2, 5);
      s.prevZ = s.bike.z;
    },
    steps: [
      { text: 'הכנס להילוך, צא לדרך והתקרב לקונוס הראשון', done: (s) => s.bike.z > -35 },
      { text: (s) => `עבור בין הקונוסים לסירוגין (${s.gate}/8)`, done: (s) => s.gate >= 8 },
      { text: 'צא מהסלאלום ועצור בריבוע', enter: (s) => s.setTarget(0, 32), done: (s) => s.stopped() && s.inBox(s.box) },
    ],
    update(s) {
      const bk = s.bike;
      while (s.gate < 8 && crossedZ(s, s.gateZ[s.gate], s.prevZ)) {
        const want = s.gate % 2 === 0 ? 1 : -1; // +x first (rider's left)
        const side = bk.x > 0.2 ? 1 : bk.x < -0.2 ? -1 : 0;
        if (side !== want) s.penalty(15, 'פספסת קונוס בסלאלום', { key: `gate${s.gate}` });
        s.gate++;
        s.lastHud = null;
      }
      if (s.stepIdx === 1 && s.kmh > 30) s.toast('לאט יותר — בסלאלום שולטים בקצב', 'info');
      if (s.stepIdx === 1 && bk.footDown && s.gate > 0) s.penalty(10, 'הורדת רגל באמצע התרגיל', { cooldown: 5 });
      if (bk.z > s.box.z + 8) s.fail('עברת את אזור העצירה.');
      s.prevZ = bk.z;
    },
  },

  // ------------------------------------------------------------------ 4
  {
    id: 'eight',
    instructor: [-5, -22],
    num: 4,
    title: 'שמינייה',
    desc: 'רכיבה בצורת 8 סביב שני עיגולים — בלי להוריד רגל ובלי לצאת מהמסלול.',
    timeLimit: 150,
    intro: `<p>תרגיל השמינייה (8) הוא חלק מהמבחן המעשי. מקיפים עיגול אחד שמאלה ואז עיגול שני ימינה, בתוך המסלול שמסומן בקונוסים.</p>
      <p><b>אסור להוריד רגל</b> מרגע הכניסה לתרגיל ועד היציאה ממנו. עקבו אחרי הסמן הצהוב.</p>`,
    tips: [
      'מהירות נמוכה וקבועה: הילוך ראשון, מעט גז ונגיעה עדינה בבלם האחורי מוסיפה יציבות.',
      'מסתכלים לכיוון היציאה מהפנייה — הראש מוביל את האופנוע.',
      'אם מתקרבים לקונוסים החיצוניים — מטים עוד קצת פנימה, לא בולמים חזק.',
    ],
    spawn: { x: 0, z: -30, h: 0, engineOn: true },
    build(s) {
      const C = [{ x: 8, z: 0 }, { x: -8, z: 0 }];
      for (const [i, c] of C.entries()) {
        const o = C[1 - i];
        for (let k = 0; k < 28; k++) {
          const a = (k / 28) * Math.PI * 2;
          const x = c.x + Math.cos(a) * 11.5, z = c.z + Math.sin(a) * 11.5;
          if (Math.hypot(x - o.x, z - o.z) > 14) s.addCone(x, z);
        }
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          s.addCone(c.x + Math.cos(a) * 4.5, c.z + Math.sin(a) * 4.5, 0x2d7ff9);
        }
      }
      for (let a = 0; a < Math.PI * 2; a += 0.12) {
        dot(s, 8 + Math.cos(a) * 8, Math.sin(a) * 8);
        dot(s, -8 + Math.cos(a) * 8, Math.sin(a) * 8);
      }
      s.box = s.addBox(0, 24, 3.2, 5);
      s.cpA = [[8, 8], [16, 0], [8, -8], [0, 0]];
      s.cpB = [[-8, 8], [-16, 0], [-8, -8], [0, 0]];
      s.cp = 0;
    },
    steps: [
      { text: 'צא לדרך ונסע לנקודת הכניסה', enter: (s) => s.setTarget(0, -6), done: (s) => s.nearTarget(3) },
      {
        text: (s) => `סיבוב שמאלה סביב העיגול השמאלי (${s.cp}/4)`,
        enter: (s) => { s.cp = 0; s.noFootDown = true; s.circle = { x: 8, z: 0 }; s.setTarget(...s.cpA[0]); },
        done: (s) => s.cp >= 4,
      },
      {
        text: (s) => `עכשיו סיבוב ימינה סביב העיגול הימני (${s.cp}/4)`,
        enter: (s) => { s.cp = 0; s.circle = { x: -8, z: 0 }; s.setTarget(...s.cpB[0]); },
        done: (s) => s.cp >= 4,
      },
      {
        text: 'צא ישר מהשמינייה ועצור בריבוע',
        enter: (s) => { s.circle = null; s.setTarget(0, 24); },
        done: (s) => s.stopped() && s.inBox(s.box),
      },
    ],
    update(s) {
      const bk = s.bike;
      const list = s.stepIdx === 1 ? s.cpA : s.stepIdx === 2 ? s.cpB : null;
      if (list && s.cp < 4 && s.nearTarget(3.6)) {
        s.cp++;
        s.game.audio.tick();
        if (s.cp < 4) s.setTarget(...list[s.cp]);
      }
      if (s.stepIdx === 3 && bk.z > 12) s.noFootDown = false;
      if (s.circle) {
        const d = Math.hypot(bk.x - s.circle.x, bk.z - s.circle.z);
        if (d < 3.6 || d > 12.6) s.penalty(10, 'יצאת מהמסלול המסומן', { cooldown: 3 });
      }
      if (bk.z > s.box.z + 8) s.fail('עברת את אזור העצירה.');
    },
  },

  // ------------------------------------------------------------------ 5
  {
    id: 'brake',
    instructor: [-39, 5],
    num: 5,
    title: 'בלימת חירום',
    desc: 'נוסעים ב-40 קמ"ש, וכשהרמזור מתחלף לאדום — בולמים בחדות ועוצרים לפני הקו.',
    intro: `<p>בלימת חירום היא אחת המיומנויות החשובות ביותר. מאיצים ל-40 קמ"ש לפחות ושומרים על קו ישר. ברגע לא צפוי הרמזור יתחלף לאדום — צריך לעצור לפני קו העצירה.</p>
      <p>נמדוד את זמן התגובה ואת מרחק הבלימה שלכם.</p>`,
    tips: [
      'בולמים כשהאופנוע ישר לגמרי — בלימה חזקה בהטיה מפילה.',
      'לוחצים מצמד בזמן הבלימה כדי שהמנוע לא ייכבה.',
      'מסתכלים קדימה, לא למטה. האצבעות מוכנות על הבלם.',
    ],
    spawn: { x: -45, z: -56, h: 0, engineOn: true },
    build(s) {
      s.trigZ = 2 + Math.random() * 12;
      s.stopLine = s.trigZ + 21;
      s.group.add(paintLine(-47.5, -58, -47.5, 58, 0.12, 0xffffff));
      s.group.add(paintLine(-42.5, -58, -42.5, 58, 0.12, 0xffffff));
      s.group.add(paintLine(-47.5, s.stopLine, -42.5, s.stopLine, 0.45, 0xffffff));
      s.light = new TrafficLight(-41.6, s.stopLine + 0.6, 0, -1);
      s.light.auto = false;
      s.group.add(s.light.group);
      s.world.circles.push(s.lightSolid = { x: -41.6, z: s.stopLine + 0.6, r: 0.12 });
      s.triggered = false;
    },
    cleanup(s) {
      const i = s.world.circles.indexOf(s.lightSolid);
      if (i >= 0) s.world.circles.splice(i, 1);
    },
    steps: [
      { text: 'האץ ל-40 קמ"ש לפחות — העלה הילוכים בדרך', done: (s) => s.kmh >= 38 },
      { text: 'המשך ישר ושמור על המהירות... היה מוכן!', done: (s) => s.triggered },
      {
        text: 'בלימת חירום! עצור לפני קו העצירה',
        done: (s) => {
          if (!s.stopped()) return false;
          s.stopDist = s.bike.z - s.trigPos;
          return true;
        },
      },
    ],
    update(s) {
      const bk = s.bike;
      if (!s.triggered && s.stepIdx === 1 && bk.kmh < 25 && bk.z < s.trigZ - 3) {
        s.penalty(10, 'האטת לפני הזמן — שמור על המהירות', { cooldown: 5 });
      }
      if (!s.triggered && bk.z >= s.trigZ && s.stepIdx >= 1) {
        s.triggered = true;
        s.light.set('red');
        s.trigT = s.t;
        s.trigPos = bk.z;
        s.trigSpeed = bk.kmh;
        s.game.audio.buzz();
        s.toast('אדום! בלום!', 'bad', 1500, true);
        if (bk.kmh < 30) s.penalty(15, 'המהירות ברגע הבלימה הייתה נמוכה מ-30 קמ"ש', { cooldown: 99 });
      }
      if (s.triggered && s.reaction == null && bk.brake > 0.3) s.reaction = s.t - s.trigT;
      if (!s.triggered && s.stepIdx === 0 && bk.z >= s.trigZ) {
        s.fail('הגעת לרמזור לפני שהאצת ל-40 קמ"ש. נסה להאיץ מהר יותר.');
      }
      if (bk.z + bk.fwdZ * 0.9 > s.stopLine + 0.3) {
        s.fail('לא הספקת לעצור לפני הקו. בלום מהר וחזק יותר — ובקו ישר!');
      }
    },
    resultStats(s) {
      if (!s.triggered) return [];
      return [
        ['מהירות בתחילת הבלימה', `${Math.round(s.trigSpeed)} קמ"ש`],
        ['זמן תגובה', s.reaction != null ? `${s.reaction.toFixed(2)} שנ'` : '—'],
        ['מרחק עצירה', s.stopDist != null ? `${s.stopDist.toFixed(1)} מ'` : '—'],
      ];
    },
  },

  // ------------------------------------------------------------------ 6
  {
    id: 'city',
    instructor: [7, -73],
    num: 6,
    title: 'נסיעה בעיר',
    desc: 'יוצאים לכביש: תמרור עצור, איתות, רמזור, מגבלת מהירות ושמירה על הנתיב הימני.',
    timeLimit: 300,
    intro: `<p>הגיע הזמן לצאת מהמגרש! נוסעים בכביש עם תנועה בכיוון אחד בכל נתיב — תמיד <b>בנתיב הימני</b>.</p>
      <p>בדרך: תמרור <b>עצור</b> (חובה עצירה מלאה), שתי פניות ימינה (חובה <b>לאותת</b> לפני כל פנייה ולכבות אחריה), <b>רמזור</b> ומגבלת מהירות של <b>50 קמ"ש</b>.</p>`,
    tips: [
      'מאותתים לפחות כמה שניות לפני הפנייה: X לימין, Z לשמאל. לחיצה נוספת מכבה.',
      'בתמרור עצור — עוצרים לגמרי לפני הקו, גם אם הדרך פנויה.',
      'ברמזור צהוב — אם אפשר לעצור בבטחה, עוצרים.',
    ],
    spawn: { x: 2.5, z: -64, h: Math.PI, engineOn: true },
    build(s) {
      s.route = [[2.5, -58], [2.5, -147.5], [147.5, -147.5], [147.5, -50]];
      s.corners = [[2.5, -147.5], [147.5, -147.5]];
      s.box = s.addBox(147.5, -62, 3.2, 5);
      s.light = s.world.cityLight;
      s.light.auto = false;
      s.light.set('green');
      s.lightPhase = 0;
      s.prev = { x: s.bike.x, z: s.bike.z };
      s.blink1 = s.blink2 = false;
      s.stopOk = false;
    },
    cleanup(s) { s.light.auto = true; },
    steps: [
      { text: 'סע בנתיב הימני לכיוון הצומת (עד 50 קמ"ש)', enter: (s) => s.setTarget(2.5, -136), done: (s) => s.bike.z < -122 },
      { text: 'אותת ימינה (X) ועצור עצירה מלאה לפני קו העצירה', enter: (s) => s.setTarget(2.5, -142.5), done: (s) => s.stopOk },
      { text: 'ודא שהדרך פנויה ופנה ימינה', enter: (s) => s.setTarget(22, -147.5), done: (s) => s.bike.x > 16 && s.bike.z < -140 },
      { text: 'שים לב לרמזור ולמעבר החצייה', enter: (s) => s.setTarget(88, -147.5), done: (s) => s.bike.x > 80 },
      { text: 'בפינה הבאה — אותת ופנה ימינה', enter: (s) => s.setTarget(147.5, -126), done: (s) => s.bike.x > 140 && s.bike.z > -132 },
      { text: 'עצור במפרץ המסומן', enter: (s) => s.setTarget(147.5, -62), done: (s) => s.stopped() && s.inBox(s.box) },
    ],
    update(s, dt) {
      const bk = s.bike;
      const { x, z } = bk;
      const R = RING;

      // speed limit
      if (bk.kmh > 55) s.penalty(10, 'חריגה מהמהירות המותרת (50 קמ"ש)', { cooldown: 8 });

      // lane keeping: distance from the right-lane centerline, relaxed inside intersections
      let d = Infinity;
      for (let i = 0; i < s.route.length - 1; i++) d = Math.min(d, segDist(x, z, ...s.route[i], ...s.route[i + 1]));
      const nearCorner = s.corners.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 14);
      if (d > (nearCorner ? 7 : 2.7)) s.penalty(10, 'סטית מהנתיב הימני', { cooldown: 4 });

      // stop sign + first turn
      if (z < -128 && z > -146 && x < 6) {
        if (bk.blinker === 1) s.blink1 = true;
        if (z > -145.2 && z < -137.5 && bk.v < 0.1) s.stopOk = true;
        if (z > -137.5 && z < -126 && bk.v < 0.05 && !s.stopOk) s.toast('התקדם לאט עד קו העצירה הלבן ועצור שם', 'info');
      }
      if (s.prev.z > -R + 5 && z <= -R + 5 && x < 6) {
        if (!s.stopOk) { s.penalty(25, 'לא עצרת עצירה מלאה בתמרור עצור', { cooldown: 99 }); s.stopOk = true; }
        if (!s.blink1) s.penalty(10, 'לא איתתת לפני הפנייה', { key: 'blink1', cooldown: 99 });
      }
      if (x > 40 && x < 60 && z < -140 && bk.blinker !== 0) s.penalty(5, 'שכחת לכבות את האיתות אחרי הפנייה', { key: 'off1', cooldown: 99 });

      // traffic light: turns red as the rider approaches
      if (s.lightPhase === 0 && x > 18 && z < -140) { s.lightPhase = 1; s.lightT = 0; s.light.set('yellow'); }
      if (s.lightPhase > 0) {
        s.lightT += dt;
        if (s.lightPhase === 1 && s.lightT > 2) { s.lightPhase = 2; s.lightT = 0; s.light.set('red'); }
        else if (s.lightPhase === 2 && s.lightT > 7) { s.lightPhase = 3; s.light.set('green'); }
      }
      const fx = x + bk.fwdX * 0.9;
      if (s.prev.fx < 71.4 && fx >= 71.4 && z < -R + 5 && z > -R) {
        if (s.light.state === 'red') { s.fail('עברת ברמזור אדום!'); return; }
      }
      if (s.lightPhase === 2 && fx < 71.4 && fx > 60 && bk.v < 0.1 && !s.praisedLight) {
        s.praisedLight = true;
        s.toast('יפה! עצרת ברמזור האדום', 'good');
      }

      // second turn
      if (x > 110 && x < 146 && z < -140 && bk.blinker === 1) s.blink2 = true;
      if (s.prev.x <= 140 && x > 140 && z < -140 && !s.blink2) s.penalty(10, 'לא איתתת לפני הפנייה', { key: 'blink2', cooldown: 99 });
      if (x > 140 && z > -112 && z < -95 && bk.blinker !== 0) s.penalty(5, 'שכחת לכבות את האיתות אחרי הפנייה', { key: 'off2', cooldown: 99 });

      if (s.stepIdx === 5 && z > s.box.z + 8) s.fail('עברת את מפרץ העצירה.');
      s.prev = { x, z, fx };
    },
  },
];

export const FREE_RIDE = {
  id: 'free',
  free: true,
  title: 'רכיבה חופשית',
  desc: 'בלי משימות ובלי ציונים — מתאמנים במגרש ויוצאים לכביש הטבעת.',
  intro: '<p>רכיבה חופשית בכל העולם: מגרש האימונים, כביש הטבעת ושכונות העיר. אם נופלים — חוזרים לנקודה בטוחה.</p>',
  tips: ['היציאה מהמגרש נמצאת ממש מולך בתחילת הנסיעה.', 'נסה את המצלמות השונות עם C.'],
  spawn: { x: 2.5, z: -40, h: Math.PI, engineOn: true },
};
