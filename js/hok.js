/* hok.js — טופס הוראת קבע בנקאית.
   כל המילוי קורה בדפדפן. שום נתון לא נשלח לשום מקום, ואין כאן שרת.
   מיקומי השדות מגיעים מ-data/hok.json (נוצר ב-tools/gen_hok_form.py). */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var HOK = null, DAY = null, SIGDATA = null;
  var KEY = 'mt-hok-draft';

  /* ── שלושת המסלולים (מתוך מסמך ההנחיות של נדרים פלוס) ─────────── */
  var TRACKS = [
    {
      name: 'דיגיטלי', tag: 'הכי פשוט לתורם', best: true,
      who: 'התורם חותם מהטלפון, בלי נייר ובלי ביקור בבנק.',
      steps: [
        'הגבאי מקים את ההוראה בממשק נדרים פלוס ובוחר בסטטוס <b>"חתימה דיגיטלית"</b>. נפתח חלון שבו התורם חותם בעצמו.',
        'מגיע למייל טופס הוראת קבע תקני עם חתימת התורם. יש להעביר אותו למייל של משגב.',
        'עוקבים בממשק שהסטטוס משתנה מ"לשכת השרות ממתינה לטופס" ל<b>"הטופס נשלח לבנק"</b>. אם תוך 3 ימי עסקים לא השתנה — לשלוח מחדש.',
        'תוך כ-5 ימי עסקים נרשם תאריך הגבייה הקרוב.'
      ],
      end: 'מרגע זה ההוראה פעילה.',
      note: 'החתימה חייבת להיות זהה לזו שמופיעה בבנק.'
    },
    {
      name: 'טלפוני', tag: 'הכי פשוט לגבאי',
      who: 'התורם מחייג לסניף שלו ופותח את ההרשאה בעצמו.',
      steps: [
        'התורם מחייג לסניף ומבקש לפתוח הרשאה לחיוב חשבון לקוד מוסד <b>47859</b> (משגב).',
        'הגבאי מקים את ההוראה בממשק נדרים פלוס ובוחר בסטטוס <b>"מאושר ע״י הבנק"</b>.'
      ],
      end: 'מרגע זה ההוראה פעילה.'
    },
    {
      name: 'פיזי', tag: 'כשאין ברירה אחרת',
      who: 'טופס נייר חתום, בפקס או במייל.',
      steps: [
        'התורם חותם על טופס הוראת הקבע של משגב. <b>אפשר למלא אותו כאן באתר</b> ולהדפיס.',
        'הגבאי מקים בממשק נדרים פלוס בסטטוס <b>"טופס פיזי חתום"</b>, ושולח את הטופס למשגב בפקס או במייל.',
        'עוקבים אחרי שינוי הסטטוס ל"הטופס נשלח לבנק", ואז לתאריך גבייה.'
      ],
      end: 'מרגע זה ההוראה פעילה.'
    }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── רצועת פרטי המוסד ─────────────────────────────────────────── */
  function renderMosad() {
    var m = HOK.mosad;
    $('#mosadStrip').innerHTML = [
      ['קוד מוסד במס״ב', m.masavCode],
      ['לשכת שירות', m.masavName],
      ['מוסד בנדרים פלוס', m.nedarimMosad]
    ].map(function (r) {
      return '<div class="ms"><div class="k">' + r[0] + '</div><div class="v">' +
        esc(r[1]) + '</div></div>';
    }).join('');
    var f = document.getElementById('footAmuta');
    if (f) f.textContent = m.mosadName;
  }

  function renderTracks() {
    $('#tracksGrid').innerHTML = TRACKS.map(function (t) {
      return '<div class="track' + (t.best ? ' best' : '') + '">' +
        '<span class="tag">' + esc(t.tag) + '</span>' +
        '<h3>' + esc(t.name) + '</h3>' +
        '<div class="who">' + esc(t.who) + '</div>' +
        '<ol>' + t.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
        (t.note ? '<div class="who" style="margin:10px 0 0;font-size:14.5px">* ' + esc(t.note) + '</div>' : '') +
        '<div class="end">' + esc(t.end) + '</div></div>';
    }).join('');
  }

  /* ── שכבת המילוי מעל הטופס ────────────────────────────────────── */
  /* חשוב: מיקום בקואורדינטות *פיזיות* (left) ולא ב-inset-inline.
     הדף כולו dir="rtl", ושם inline-end הוא השמאל — מה שהפך את כל השדות. */
  function buildOverlay() {
    var ov = $('#overlay'), html = '';
    HOK.fields.forEach(function (f) {
      html += '<div class="ov ' + f.align + '" id="ov-' + f.id + '" style="' +
        'left:' + f.x + '%;width:' + f.w + '%;top:' + f.y + '%;' +
        'font-size:' + f.size + 'cqw;transform:translateY(-100%)"></div>';
    });
    HOK.checks.forEach(function (c) {
      html += '<div class="ov-check" id="ov-' + c.id + '" style="' +
        'left:' + c.x + '%;top:' + c.y + '%;font-size:12cqw"></div>';
    });
    HOK.boxes.forEach(function (b) {
      html += '<div class="ov center" id="ov-' + b.id + '" style="' +
        'left:' + b.x + '%;width:' + b.w + '%;top:' + (b.y + b.h) + '%;' +
        'font-size:11cqw;letter-spacing:.18em;transform:translateY(-105%)"></div>';
    });
    html += '<img class="ov-sig" id="ov-sig" alt="" style="display:none;' +
      'left:26%;width:19%;top:93.6%;height:3.4%;transform:translateY(-100%)">';
    ov.innerHTML = html;
    sizeOverlay();
  }

  /* גדלי הגופן נמדדים ביחס לרוחב הנייר, כדי שההדפסה תהיה זהה למסך */
  function sizeOverlay() {
    var w = $('#paper').getBoundingClientRect().width;
    if (!w) return;
    var unit = w / 595.28;                     // פיקסלים לכל נקודת PDF
    $('#overlay').querySelectorAll('[style*="cqw"]').forEach(function (e) {
      var m = /font-size:([\d.]+)cqw/.exec(e.getAttribute('style'));
      if (m) e.style.fontSize = (parseFloat(m[1]) * unit) + 'px';
    });
  }

  /* ── קריאת השדות והצבתם ───────────────────────────────────────── */
  var IDS = ['name', 'zeout', 'phone', 'address', 'email', 'avour', 'notes',
             'amount', 'payments', 'bankNo', 'branchNo', 'account',
             'bankName', 'branchName', 'holder', 'holderId', 'date'];

  function val(id) {
    var e = document.getElementById('f-' + id);
    return e ? e.value.trim() : '';
  }

  function paint() {
    IDS.forEach(function (id) {
      var t = document.getElementById('ov-' + id);
      if (!t) return;
      var v = val(id);
      if (id === 'date' && v) {
        var p = v.split('-');
        v = p[2] + '/' + p[1] + '/' + p[0];
      }
      if (id === 'amount' && v) v = v + ' ₪';
      t.textContent = v;
    });
    // יום חיוב
    HOK.days.forEach(function (d) {
      var e = document.getElementById('ov-day' + d);
      if (e) e.textContent = (DAY === d) ? '✕' : '';
    });
    // ללא הגבלה
    var nl = document.getElementById('ov-noLimit');
    if (nl) nl.textContent = val('payments') ? '' : '✕';
    // חתימה
    var s = document.getElementById('ov-sig');
    if (s) { s.style.display = SIGDATA ? '' : 'none'; if (SIGDATA) s.src = SIGDATA; }
    save();
  }

  /* ── שמירה מקומית (טיוטה) ─────────────────────────────────────── */
  function save() {
    try {
      var o = { day: DAY, sig: SIGDATA };
      IDS.forEach(function (id) { o[id] = val(id); });
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* מצב פרטי — פשוט בלי טיוטה */ }
  }

  function restore() {
    var o;
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return; }
    if (!o) return;
    IDS.forEach(function (id) {
      var e = document.getElementById('f-' + id);
      if (e && o[id]) e.value = o[id];
    });
    if (o.day) DAY = o.day;
    if (o.sig) { SIGDATA = o.sig; drawRestoredSig(o.sig); }
  }

  /* ── תיבות יום החיוב ──────────────────────────────────────────── */
  function renderDays() {
    var box = $('#dayChips');
    box.innerHTML = HOK.days.map(function (d) {
      return '<button type="button" class="chip" data-d="' + d + '" aria-pressed="false">' +
        d + '</button>';
    }).join('');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      DAY = (DAY === +b.dataset.d) ? null : +b.dataset.d;
      box.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', String(+c.dataset.d === DAY));
      });
      paint();
    });
  }

  function syncDayChips() {
    $('#dayChips').querySelectorAll('.chip').forEach(function (c) {
      c.setAttribute('aria-pressed', String(+c.dataset.d === DAY));
    });
  }

  /* ── חתימה ────────────────────────────────────────────────────── */
  function initSig() {
    var cv = $('#sig'), ctx = cv.getContext('2d'), drawing = false, dirty = false;
    ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#10243f';

    function pos(e) {
      var r = cv.getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e;
      return [(p.clientX - r.left) * cv.width / r.width,
              (p.clientY - r.top) * cv.height / r.height];
    }
    function start(e) { e.preventDefault(); drawing = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p[0], p[1]); }
    function move(e) { if (!drawing) return; e.preventDefault(); var p = pos(e); ctx.lineTo(p[0], p[1]); ctx.stroke(); dirty = true; }
    function end() {
      if (!drawing) return;
      drawing = false;
      if (dirty) { SIGDATA = trimmed(cv); paint(); }
    }
    ['mousedown', 'touchstart'].forEach(function (t) { cv.addEventListener(t, start, { passive: false }); });
    ['mousemove', 'touchmove'].forEach(function (t) { cv.addEventListener(t, move, { passive: false }); });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (t) { cv.addEventListener(t, end); });

    $('#sigClear').addEventListener('click', function () {
      ctx.clearRect(0, 0, cv.width, cv.height);
      SIGDATA = null; dirty = false; paint();
    });
  }

  /* חותך שוליים ריקים מהחתימה כדי שתשב במקומה על הקו */
  function trimmed(cv) {
    var ctx = cv.getContext('2d');
    var d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    var x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0, found = false;
    for (var y = 0; y < cv.height; y++) {
      for (var x = 0; x < cv.width; x++) {
        if (d[(y * cv.width + x) * 4 + 3] > 12) {
          found = true;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (!found) return null;
    var pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(cv.width, x1 + pad); y1 = Math.min(cv.height, y1 + pad);
    var o = document.createElement('canvas');
    o.width = x1 - x0; o.height = y1 - y0;
    o.getContext('2d').drawImage(cv, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }

  function drawRestoredSig(src) {
    var cv = $('#sig'), ctx = cv.getContext('2d');
    var im = new Image();
    im.onload = function () {
      var s = Math.min(cv.width / im.width, cv.height / im.height, 1);
      ctx.drawImage(im, 10, (cv.height - im.height * s) / 2, im.width * s, im.height * s);
    };
    im.src = src;
  }

  /* ── שליחה ────────────────────────────────────────────────────── */
  function sendMail() {
    var m = HOK.mosad;
    var lines = [
      'הוראת קבע בנקאית — ' + m.mosadName,
      'קוד מוסד במס״ב: ' + m.masavCode + ' (' + m.masavName + ')',
      '',
      'שם: ' + val('name'),
      'ת.ז.: ' + val('zeout'),
      'טלפון: ' + val('phone'),
      'מייל: ' + val('email'),
      'כתובת: ' + val('address'),
      '',
      'סכום חודשי: ' + val('amount') + ' ₪',
      'מספר חיובים: ' + (val('payments') || 'ללא הגבלה'),
      'יום חיוב: ' + (DAY || '—'),
      'עבור: ' + val('avour'),
      'הערות: ' + val('notes'),
      '',
      'בנק: ' + val('bankNo') + ' ' + val('bankName'),
      'סניף: ' + val('branchNo') + ' ' + val('branchName'),
      'חשבון: ' + val('account'),
      'בעל החשבון: ' + val('holder') + ' · ת.ז. ' + val('holderId'),
      '',
      '— נשלח מטופס ההוראת קבע באתר מניין הצעירים.',
      'שימו לב: יש לצרף למייל את הטופס החתום (הדפסה/שמירה כ-PDF מהאתר).'
    ];
    var url = 'mailto:' + m.masavMail +
      '?subject=' + encodeURIComponent('הוראת קבע — קוד מוסד ' + m.masavCode + ' — ' + val('name')) +
      '&body=' + encodeURIComponent(lines.join('\n'));
    location.href = url;
    $('#sendNote').innerHTML = 'נפתחה תוכנת המייל אל <b>' + esc(m.masavMail) +
      '</b>. <b>חובה לצרף את הטופס החתום</b> — הפרטים בגוף המייל אינם מחליפים אותו. ' +
      'אפשר גם לשלוח בפקס ' + esc(m.masavFax) + '.';
  }

  /* ── הפעלה ────────────────────────────────────────────────────── */
  fetch('data/hok.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      HOK = d;
      renderMosad();
      renderTracks();
      if (window.Motion) window.Motion.refresh();
      renderDays();
      buildOverlay();
      initSig();
      restore();
      syncDayChips();

      if (!val('date')) {
        var n = new Date();
        $('#f-date').value = n.getFullYear() + '-' +
          String(n.getMonth() + 1).padStart(2, '0') + '-' +
          String(n.getDate()).padStart(2, '0');
      }
      /* ?demo — ממלא נתוני דוגמה. שימושי לגבאי שרוצה לראות איך הטופס יוצא,
         ולבדיקת יישור השדות אחרי שינוי במפה. */
      if (/[?&]demo\b/.test(location.search)) {
        var D = { name: 'ישראל ישראלי', zeout: '123456789', phone: '050-1234567',
          address: 'רבנו בחיי 12, מעלה עמוס', email: 'israel@example.com',
          avour: 'החזקת המניין', notes: 'לעילוי נשמת', amount: '180',
          bankNo: '12', branchNo: '345', account: '123456',
          bankName: 'פועלים', branchName: 'אפרת',
          holder: 'ישראל ישראלי', holderId: '123456789' };
        Object.keys(D).forEach(function (k) {
          var e = document.getElementById('f-' + k); if (e) e.value = D[k];
        });
        DAY = 10; syncDayChips();
      }

      $('#fieldsBox').addEventListener('input', paint);
      $('#btnPrint').addEventListener('click', function () { window.print(); });
      $('#btnSend').addEventListener('click', sendMail);
      $('#btnReset').addEventListener('click', function () {
        if (!confirm('לנקות את כל השדות?')) return;
        try { localStorage.removeItem(KEY); } catch (e) {}
        location.reload();
      });
      window.addEventListener('resize', function () { sizeOverlay(); });
      $('#paperImg').addEventListener('load', sizeOverlay);
      paint();
    })
    .catch(function (e) {
      $('#mosadStrip').innerHTML = '<div class="ms"><div class="v">שגיאה בטעינת הטופס</div></div>';
      console.error(e);
    });
})();
