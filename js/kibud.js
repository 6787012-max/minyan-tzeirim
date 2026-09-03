/* kibud.js — מיזם הכיבוד ללומדי «חלקי בקהילתי».
 *
 * הכאב שהפאנל בא לפתור (מתוך ניתוח שנה של מיילי הרכזת):
 *   · ספירה ידנית של תאריכים ריקים, ואז מייל תזכורת — עשרות פעמים בשנה.
 *   · אין תזכורת למי שנרשמה, ולכן מגלים על החמצה בדיעבד.
 *   · ביטול ברגע האחרון מחייב מייל חירום.
 * לכן שלושת הכפתורים כאן הם: הרשמה, תזכורת ליומן, וביטול מסודר —
 * ועוד כפתור אחד לרכזת שמייצר את הודעת התזכורת לקבוצה בלחיצה.
 *
 * לוח הערבים נבנה מהחודש העברי בעצמו (js/luach.js) — אין צורך להקליד
 * תאריכים ידנית בכל חודש, וזה בדיוק מה שגרם ל-16 גיליונות נפרדים.
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var K = null, DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var CUR = null, PICKED = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function mail(o) {
    if (!o) return '';
    if (o.email) return o.email;
    try { return o.email_b64 ? atob(o.email_b64) : ''; } catch (e) { return ''; }
  }

  /* ── בניית לוח ערבי הלימוד ────────────────────────────────────── */
  function buildEvenings(now) {
    var ev = K.evenings || {};
    var wd = ev.weekdays || [0, 1, 2, 3, 4];
    var skip = ev.skipDates || [];
    var out = [];

    /* תחילת החודש העברי */
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var m0 = Luach.hebrew(d).m;
    var guard = 0;
    while (Luach.hebrew(d).d > 1 && guard++ < 40) d.setDate(d.getDate() - 1);

    guard = 0;
    while (Luach.hebrew(d).m === m0 && guard++ < 40) {
      var iso = Luach.iso(d);
      if (wd.indexOf(d.getDay()) >= 0 && skip.indexOf(iso) < 0) {
        var h = Luach.hebrew(d);
        out.push({
          iso: iso, date: new Date(d), dow: DAYS[d.getDay()],
          heb: Luach.numToHeb(h.d, true) + ' ב' + h.monthName,
          greg: d.getDate() + '.' + (d.getMonth() + 1)
        });
      }
      d.setDate(d.getDate() + 1);
    }

    /* openMode=week — רק השבוע הקרוב נפתח, כדי שחודש ריק לא ירתיע */
    if (ev.openMode === 'week') {
      var end = new Date(now.getTime() + 8 * 864e5);
      out.forEach(function (x) { x.locked = x.date > end; });
    }
    return out;
  }

  function signupFor(iso) {
    var s = K.signups || {};
    var v = s[iso];
    return (v && v.name) ? v : null;
  }

  /* ── תצוגה ────────────────────────────────────────────────────── */
  function render(now) {
    var evenings = buildEvenings(now);
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var open = evenings.filter(function (x) { return !x.locked && x.date >= today; });
    var free = open.filter(function (x) { return !signupFor(x.iso); });
    var taken = evenings.filter(function (x) { return signupFor(x.iso); }).length;

    var h = Luach.hebrew(now);
    $('#kbMonth').textContent = 'ערבי הלימוד — ' + h.monthName + ' ' +
      Luach.numToHeb(h.y % 1000, true);

    /* מד התקדמות — מחליף את מייל "נותרו X ימים" */
    var box = $('#kbProg');
    box.hidden = false;
    $('#kbProgLabel').textContent = 'ערבים מאוישים החודש';
    $('#kbProgVal').textContent = taken + ' מתוך ' + evenings.length;
    $('#kbCap').textContent = free.length
      ? 'נותרו ' + free.length + ' ערבים פנויים' + (free.length <= 3 ? ' — ממש קרוב לסיום!' : '')
      : 'כל הערבים מאוישים. יישר כוח!';
    var pct = evenings.length ? taken / evenings.length * 100 : 0;
    requestAnimationFrame(function () { $('#kbFill').style.width = pct + '%'; });

    /* הרשת */
    $('#kbGrid').innerHTML = evenings.map(function (x) {
      var s = signupFor(x.iso);
      var past = x.date < today;
      var cls = 'kb-day' + (s ? ' taken' : '') + (past ? ' past' : '') +
                (x.locked ? ' locked' : '');
      var body = s
        ? '<span class="who">' + esc(s.name) + '</span>' +
          (s.brings ? '<span class="br">' + esc(s.brings) + '</span>' : '')
        : (x.locked ? '<span class="br">נפתח בהמשך</span>'
                    : '<span class="free">פנוי — לחצי כאן</span>');
      var tag = '<span class="d"><b>' + esc(x.dow) + '</b>' +
        '<span class="hb">' + esc(x.heb) + '</span>' +
        '<span class="gr">' + esc(x.greg) + '</span></span>';
      if (s || past || x.locked) return '<div class="' + cls + '">' + tag + body + '</div>';
      return '<button type="button" class="' + cls + '" data-iso="' + x.iso + '">' +
        tag + body + '</button>';
    }).join('');

    var sh = (K.sheet || {}).csvUrl;
    if (sh) { $('#kbSheet').hidden = false; $('#kbSheet').href = sh; }

    $('#kbNote').innerHTML = 'הרשמה נשלחת ל<b>' + esc((K.coordinator || {}).name || 'רכזת') +
      '</b>. ' + esc(K.learners || '') +
      '. אין במיזם תשלום — רק כיבוד קל שמביאים לבית המדרש.';
    $('#kbFoot').textContent = K.slogan || '';
    if (window.Motion) window.Motion.refresh();
    return evenings;
  }

  /* ── חלונית ההרשמה ────────────────────────────────────────────── */
  function openModal(iso, evenings) {
    CUR = evenings.filter(function (x) { return x.iso === iso; })[0];
    if (!CUR) return;
    PICKED = [];
    $('#kbMTitle').textContent = 'יום ' + CUR.dow + ' · ' + CUR.heb;
    $('#kbMSub').textContent = CUR.greg + ' · ' + (K.learners || '');
    $('#kbHint').textContent = '';
    $('#kbChips').innerHTML = (K.options || []).map(function (o) {
      return '<button type="button" class="chip" data-o="' + esc(o) + '" ' +
        'aria-pressed="false">' + esc(o) + '</button>';
    }).join('');
    $('#kbModal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#kbName').focus();
  }

  function closeModal() {
    $('#kbModal').hidden = true;
    document.body.style.overflow = '';
    CUR = null;
  }

  function brings() {
    var extra = $('#kbOther').value.trim();
    return PICKED.concat(extra ? [extra] : []).join(', ');
  }

  function sendSignup() {
    var nm = $('#kbName').value.trim();
    if (!nm) {
      $('#kbHint').innerHTML = '<b style="color:#9B1E1E">יש למלא שם.</b>';
      $('#kbName').focus();
      return;
    }
    var c = K.coordinator || {};
    var body = [
      'הרשמה לכיבוד — ' + (K.title || ''),
      '',
      'תאריך: יום ' + CUR.dow + ' · ' + CUR.heb + ' · ' + CUR.greg,
      'שם: ' + nm,
      $('#kbPhone').value.trim() ? 'טלפון: ' + $('#kbPhone').value.trim() : '',
      brings() ? 'מביאה: ' + brings() : '',
      '',
      'נשלח מהאתר — minyan.mokad.co.il/kibud.html'
    ].filter(Boolean).join('\n');

    if (c.whatsapp) {
      window.open('https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(body), '_blank');
    } else if (mail(c)) {
      location.href = 'mailto:' + mail(c) +
        '?subject=' + encodeURIComponent('כיבוד ' + CUR.greg + ' — ' + nm) +
        '&body=' + encodeURIComponent(body);
    }
    $('#kbHint').innerHTML = '<b>נשלח לרכזת.</b> כדאי להוריד תזכורת ליומן ' +
      'כדי שלא תישכח — הכפתור לידך.';
  }

  /* ── תזכורת ליומן — .ics שנוצר בדפדפן ─────────────────────────── */
  function icsFor(ev, name) {
    function stamp(d) {
      return d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
    }
    var d = ev.date;
    var next = new Date(d.getTime() + 864e5);
    var uid = 'kibud-' + ev.iso + '@minyan.mokad.co.il';
    /* אירוע יום־שלם, עם תזכורת יום לפני ב-09:00 ותזכורת בבוקר עצמו */
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//minyan.mokad.co.il//kibud//HE',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + stamp(new Date()) + 'T090000Z',
      'DTSTART;VALUE=DATE:' + stamp(d),
      'DTEND;VALUE=DATE:' + stamp(next),
      'SUMMARY:כיבוד ללומדי חלקי בקהילתי',
      'DESCRIPTION:' + (name ? name + ' — ' : '') + (brings() || 'כיבוד קל ללומדים') +
        '\\nיום ' + ev.dow + ' · ' + ev.heb,
      'LOCATION:בית המדרש · מעלה עמוס',
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
      'DESCRIPTION:מחר הכיבוד ללומדים', 'END:VALARM',
      'BEGIN:VALARM', 'TRIGGER:-PT4H', 'ACTION:DISPLAY',
      'DESCRIPTION:היום הכיבוד ללומדים', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
  }

  function downloadIcs() {
    if (!CUR) return;
    var blob = new Blob([icsFor(CUR, $('#kbName').value.trim())],
                        { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kibud-' + CUR.iso + '.ics';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $('#kbHint').innerHTML = '<b>התזכורת ירדה.</b> לפתוח את הקובץ כדי להוסיף ליומן.';
  }

  /* ── שיתוף התאריכים הפנויים — מחליף את מייל התזכורת הידני ─────── */
  function shareFree(evenings) {
    var today = new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var free = evenings.filter(function (x) {
      return !x.locked && x.date >= today && !signupFor(x.iso);
    });
    var h = Luach.hebrew(new Date());
    var txt;
    if (!free.length) {
      txt = 'ברוך השם — כל ערבי הלימוד ב' + h.monthName + ' מאוישים! יישר כוח לכולן 🌸';
    } else {
      txt = ['בס״ד', '',
        '*כיבוד ללומדי חלקי בקהילתי* — ' + h.monthName,
        '',
        'נותרו ' + free.length + ' ערבים פנויים:',
        free.map(function (x) { return '· יום ' + x.dow + ' — ' + x.heb + ' (' + x.greg + ')'; }).join('\n'),
        '',
        'מי זוכה? ' + location.origin + '/kibud.html',
        '',
        K.slogan || ''].filter(Boolean).join('\n');
    }
    var c = K.coordinator || {};
    if (c.whatsapp || navigator.share) {
      if (navigator.share) {
        navigator.share({ text: txt }).catch(function () { copy(txt); });
      } else {
        window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
      }
    } else {
      copy(txt);
    }
  }

  function copy(txt) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(function () {
        $('#kbNote').innerHTML = '<b>ההודעה הועתקה.</b> אפשר להדביק בקבוצה.';
      });
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
    }
  }

  /* ── הפעלה ────────────────────────────────────────────────────── */
  fetch('data/kibud.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      K = d;
      $('#kbEyebrow').textContent = K.eyebrow || '';
      $('#kbTitle').textContent = K.title || '';
      $('#kbIntro').textContent = K.intro || '';
      $('#kbSlogan').textContent = K.slogan || '';
      document.title = (K.title || 'כיבוד') + ' · מניין הצעירים';

      var evenings = render(new Date());

      $('#kbGrid').addEventListener('click', function (e) {
        var b = e.target.closest('button.kb-day');
        if (b) openModal(b.dataset.iso, evenings);
      });
      $('#kbChips').addEventListener('click', function (e) {
        var b = e.target.closest('.chip');
        if (!b) return;
        var o = b.dataset.o, i = PICKED.indexOf(o);
        if (i >= 0) PICKED.splice(i, 1); else PICKED.push(o);
        b.setAttribute('aria-pressed', String(i < 0));
      });
      $('#kbClose').addEventListener('click', closeModal);
      $('#kbModal').addEventListener('click', function (e) {
        if (e.target === this) closeModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !$('#kbModal').hidden) closeModal();
      });
      $('#kbSend').addEventListener('click', sendSignup);
      $('#kbIcs').addEventListener('click', downloadIcs);
      $('#kbShare').addEventListener('click', function () { shareFree(evenings); });
    })
    .catch(function (e) {
      $('#kbIntro').textContent = 'שגיאה בטעינת הלוח.';
      console.error(e);
    });
})();
