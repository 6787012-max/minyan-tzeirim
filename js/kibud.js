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
  var CUR = null, PICKED = [], TAKEN = null, EVENINGS = [];

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
      if (past || x.locked) return '<div class="' + cls + '">' + tag + body + '</div>';
      /* גם ערב תפוס לחיץ — כדי שמי שנרשמה תוכל לבטל או לשנות מה היא מביאה */
      return '<button type="button" class="' + cls + '" data-iso="' + x.iso + '">' +
        tag + body + (s ? '<span class="chg">לשינוי או ביטול</span>' : '') + '</button>';
    }).join('');

    var sh = (K.sheet || {}).csvUrl;
    if (sh) { $('#kbSheet').hidden = false; $('#kbSheet').href = sh; }

    $('#kbNote').innerHTML = 'הרשמה נשלחת ל<b>' + esc((K.coordinator || {}).name || 'רכזת') +
      '</b>. ' + esc(K.learners || '') +
      '. אין במיזם תשלום — רק כיבוד קל שמביאים לבית המדרש.';
    $('#kbFoot').textContent = K.slogan || '';
    if (window.Motion) window.Motion.refresh();
    EVENINGS = evenings;
    return evenings;
  }

  /* ── חלונית ההרשמה ────────────────────────────────────────────── */
  function openModal(iso, evenings) {
    CUR = evenings.filter(function (x) { return x.iso === iso; })[0];
    if (!CUR) return;
    PICKED = [];
    var s = signupFor(iso);
    TAKEN = s;
    $('#kbMTitle').textContent = 'יום ' + CUR.dow + ' · ' + CUR.heb;
    $('#kbMSub').textContent = CUR.greg + ' · ' + (K.learners || '');
    $('#kbHint').textContent = '';

    /* ערב תפוס — מצב שינוי/ביטול במקום הרשמה */
    $('#kbModal').querySelector('.eyebrow').textContent = s ? 'הערב הזה כבר נלקח' : 'לקחת ערב';
    $('#kbName').value = s ? s.name : '';
    $('#kbOther').value = s ? (s.brings || '') : '';
    $('#kbSend').textContent = s ? 'עדכון הפרטים' : 'שליחה לרכזת';
    $('#kbCancel').hidden = !s;
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
    /* עדכון מיידי על המסך, ובמקביל שמירה בשרת וכתיבה לגיליון */
    var rec = { name: nm, brings: brings(), phone: $('#kbPhone').value.trim() };
    K.signups = K.signups || {};
    K.signups[CUR.iso] = rec;
    var ev = CUR;
    render(new Date());

    $('#kbHint').innerHTML = 'שומר…';

    /* השמירה בשרת היא מה שקובע. הוואטסאפ/מייל שנפתחו הם גיבוי
     * למקרה שהשרת לא זמין — לא הם שמחזיקים את הרישום. */
    if (window.Forms) {
      Forms.send({
        kind: 'kibud', name: nm, phone: rec.phone,
        ref_key: ev.iso, ref_label: 'יום ' + ev.dow + ' · ' + ev.heb + ' · ' + ev.greg,
        details: rec.brings ? { 'מביאה': rec.brings } : {}
      }).then(function (res) {
        $('#kbHint').innerHTML = res.saved
          ? '<b>הרישום נשמר.</b> ' + (res.mailed ? 'נשלחה הודעה לגבאי. ' : '') +
            'כדאי להוריד תזכורת ליומן — הכפתור לידך.'
          : '<b style="color:#9B1E1E">' + Forms.explain(res) + '</b> ' +
            'ההודעה לרכזת נשלחה בכל מקרה.';
      });
    } else {
      $('#kbHint').innerHTML = '<b>נשלח לרכזת.</b> כדאי להוריד תזכורת ליומן.';
    }

    postToSheet('add', {
      iso: ev.iso, dow: ev.dow, heb: ev.heb, greg: ev.greg,
      name: rec.name, phone: rec.phone, brings: rec.brings
    }).then(function (res) {
      if (res === 'ok' || res === 'sent') {
        $('#kbHint').innerHTML = '<b>נרשם בגיליון.</b> ההודעה נשלחה לרכזת ' +
          'והתאריך כבר מסומן על שמך. כדאי להוריד תזכורת ליומן.';
        if (res === 'ok') loadSheet();
      } else if (res === 'taken') {
        $('#kbHint').innerHTML = '<b style="color:#9B1E1E">מישהי הקדימה אותך ' +
          'לתאריך הזה.</b> ההודעה נשלחה לרכזת בכל מקרה — כדאי לבחור ערב אחר.';
        loadSheet();
      } else if (res === 'fail') {
        $('#kbHint').innerHTML = '<b>ההודעה נשלחה לרכזת</b>, אבל הכתיבה לגיליון ' +
          'לא עברה. הרכזת תסמן ידנית — הרישום לא אבד.';
      }
    });
  }


  /* ביטול מסודר — מחליף את מייל החירום ביום עצמו */
  function cancelSignup() {
    if (!CUR) return;
    var c = K.coordinator || {};
    var who = $('#kbName').value.trim() || (TAKEN && TAKEN.name) || '';
    var body = [
      'ביטול כיבוד — ' + (K.title || ''),
      '',
      'תאריך: יום ' + CUR.dow + ' · ' + CUR.heb + ' · ' + CUR.greg,
      who ? 'נרשמה: ' + who : '',
      '',
      'לא אוכל להביא בתאריך הזה. התאריך מתפנה.',
      'סליחה על ההודעה המאוחרת.'
    ].filter(Boolean).join('\n');

    if (c.whatsapp) {
      window.open('https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(body), '_blank');
    } else if (mail(c)) {
      location.href = 'mailto:' + mail(c) +
        '?subject=' + encodeURIComponent('ביטול כיבוד ' + CUR.greg + ' — ' + who) +
        '&body=' + encodeURIComponent(body);
    }
    var ev = CUR;
    $('#kbHint').innerHTML = 'שולח ביטול…';

    if (window.Forms) {
      Forms.send({
        kind: 'kibud', name: who || 'לא צוין',
        ref_key: 'cancel:' + ev.iso,
        ref_label: 'ביטול — יום ' + ev.dow + ' · ' + ev.heb + ' · ' + ev.greg,
        details: { 'סוג': 'ביטול', 'תאריך שהתפנה': ev.greg }
      }).then(function (res) {
        $('#kbHint').innerHTML = res.saved
          ? '<b>הביטול נקלט.</b> ' + (res.mailed ? 'הגבאי קיבל הודעה. ' : '') +
            'התאריך יסומן כפנוי.'
          : '<b>הודעת הביטול נשלחה לרכזת.</b> התאריך יסומן כפנוי אחרי שתעדכן.';
      });
    } else {
      $('#kbHint').innerHTML = '<b>הודעת הביטול נשלחה לרכזת.</b> ' +
        'התאריך יסומן כפנוי אחרי שתעדכן.';
    }

    postToSheet('cancel', {
      iso: ev.iso, dow: ev.dow, heb: ev.heb, greg: ev.greg, name: who
    }).then(function (res) {
      if (res !== 'ok' && res !== 'sent') return;
      if (K.signups) delete K.signups[ev.iso];
      render(new Date());
      $('#kbHint').innerHTML = '<b>הביטול נקלט.</b> התאריך שוחרר בגיליון ' +
        'ומופיע כפנוי — מישהי אחרת תוכל לקחת אותו.';
      if (res === 'ok') loadSheet();
    });
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

  /* ══ סנכרון עם הגיליון של הרכזת ═════════════════════════════════
   * שני כיוונים, ובכוונה בעלי אמינות שונה:
   *   קריאה  — CSV שפורסם מהגיליון. אנונימי, בלי מפתחות, עובד תמיד.
   *            הגיליון הוא מקור האמת: מה שאלישבע כותבת שם מופיע כאן.
   *   כתיבה  — Apps Script Web App. רשות בלבד: אם היא לא מוגדרת, או
   *            נכשלת (נטפרי, פריסה שפגה), ההרשמה עדיין נשלחת בוואטסאפ
   *            או במייל כמו קודם. שום רישום לא הולך לאיבוד בגלל תקלת רשת.
   * ════════════════════════════════════════════════════════════════ */

  /* CSV אמיתי — עם מרכאות, פסיקים בתוך שדה, ושורות מרובות-שורה */
  function parseCsv(txt) {
    var rows = [], row = [], f = '', q = false, i = 0;
    txt = String(txt).replace(/\r\n?/g, '\n');
    for (; i < txt.length; i++) {
      var c = txt[i];
      if (q) {
        if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.join('').trim() !== ''; });
  }

  /* תאריך מהגיליון → ISO.
   * גיליון מפורסם מחזיר טקסט לפי הלוקאל, ו-7/9 יכול להיות 7 בספט' או 9 ביולי.
   * לכן במקרה דו-משמעי בוחרים את הקריאה שהיא באמת ערב לימוד בלוח. */
  function normDate(s, valid) {
    s = String(s || '').trim();
    if (!s) return '';
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);

    m = s.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/);
    if (!m) return '';
    var a = +m[1], b = +m[2], y = m[3] ? +m[3] : new Date().getFullYear();
    if (y < 100) y += 2000;

    var dmy = y + '-' + pad(b) + '-' + pad(a);   /* יום/חודש — הנוהג בישראל */
    var mdy = y + '-' + pad(a) + '-' + pad(b);   /* חודש/יום — לוקאל אמריקאי */
    if (valid) {
      if (valid[dmy]) return dmy;
      if (valid[mdy]) return mdy;
      return '';                                  /* לא ערב לימוד — מתעלמים */
    }
    return b <= 12 ? dmy : mdy;
  }
  function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }

  /* זיהוי העמודות — לפי הנתונים עצמם, לא לפי הכותרות.
   * בגיליון האמיתי של הרכזת יש ארבע עמודות: תאריך עברי, תאריך לועזי,
   * יום בשבוע, ושם. שלוש מהכותרות מכילות את המילה «תאריך» או «יום»,
   * ולכן זיהוי לפי כותרת בוחר את העמודה הלא נכונה ומחזיר לוח ריק.
   * פרופיל של התוכן חד-משמעי: רק עמודה אחת נראית כמו תאריכים. */
  var DOW_WORDS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת',
                   'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

  function detectCols(rows) {
    var cfg = (K.sheet || {}).columns || {};
    var head = rows[0] || [], body = rows.slice(1);
    var width = 0;
    rows.forEach(function (r) { if (r.length > width) width = r.length; });

    /* אם הוגדרו כותרות מפורשות בקונפיג — הן גוברות על הניחוש */
    function byHeader(key) {
      if (!cfg[key]) return -1;
      for (var i = 0; i < head.length; i++)
        if (String(head[i]).trim() === cfg[key]) return i;
      return -1;
    }

    var prof = [];
    for (var c = 0; c < width; c++) {
      var dates = 0, dow = 0, txt = 0, len = 0, filled = 0;
      for (var r = 0; r < body.length; r++) {
        var v = String((body[r] || [])[c] || '').trim();
        if (!v) continue;
        filled++;
        if (/^\d{4}-\d{1,2}-\d{1,2}/.test(v) || /^\d{1,2}[.\/-]\d{1,2}([.\/-]\d{2,4})?$/.test(v)) dates++;
        else {
          var bare = v.replace(/[׳'"״\s]/g, '');
          if (DOW_WORDS.indexOf(bare) >= 0 || DOW_WORDS.indexOf(bare.replace(/^יום/, '')) >= 0) dow++;
          else { txt++; len += v.length; }
        }
      }
      prof.push({ c: c, dates: dates, dow: dow, txt: txt, filled: filled,
                  avg: txt ? len / txt : 0 });
    }

    var idx = { date: byHeader('date'), name: byHeader('name'),
                brings: byHeader('brings'), phone: byHeader('phone') };

    if (idx.date < 0) {
      var best = prof.slice().sort(function (a, b) { return b.dates - a.dates; })[0];
      idx.date = (best && best.dates) ? best.c : -1;
    }
    /* השם הוא עמודת הטקסט החופשי הארוכה ביותר — לא ימי השבוע,
     * ולא עמודת אותיות עבריות קצרות של התאריך העברי */
    var texty = prof.filter(function (p) {
      return p.c !== idx.date && p.txt > 0 && p.avg >= 3 && p.dow < p.txt;
    }).sort(function (a, b) { return b.avg - a.avg; });
    if (idx.name < 0) idx.name = texty.length ? texty[0].c : -1;
    if (idx.brings < 0 && texty.length > 1) idx.brings = texty[1].c;
    return idx;
  }

  function applySheet(txt) {
    var rows = parseCsv(txt);
    if (rows.length < 2) return -1;
    var idx = detectCols(rows);
    if (idx.date < 0 || idx.name < 0) return -1;

    var valid = {};
    EVENINGS.forEach(function (e) { valid[e.iso] = 1; });

    var out = {}, n = 0, dated = 0;
    rows.slice(1).forEach(function (r) {
      if (String(r[idx.date] || '').trim()) dated++;
      var iso = normDate(r[idx.date], valid);
      var nm = String(r[idx.name] || '').trim();
      if (!iso || !nm) return;
      out[iso] = {
        name: nm,
        brings: idx.brings >= 0 ? String(r[idx.brings] || '').trim() : '',
        phone: idx.phone >= 0 ? String(r[idx.phone] || '').trim() : '',
        src: 'sheet'
      };
      n++;
    });

    /* אם בגיליון יש תאריכים אבל אף אחד מהם אינו ערב בחודש המוצג —
     * זה גיליון של חודש אחר. מוחקים במקרה כזה = לוח ריק לגמרי,
     * וזה גרוע יותר מלא לסנכרן. משאירים את מה שיש ומדווחים. */
    if (n === 0 && dated > 0) return -1;

    /* הגיליון גובר: מי שנמחקה שם נעלמת גם כאן, אחרת התאריך לא מתפנה לעולם */
    K.signups = out;
    return n;
  }

  function loadSheet() {
    var url = (K.sheet || {}).csvUrl;
    if (!url) return Promise.resolve(false);
    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (t) {
        var n = applySheet(t);
        if (n < 0) { syncBadge('mismatch'); return false; }
        render(new Date());
        syncBadge('ok', n);
        return true;
      })
      .catch(function (e) {
        console.warn('sheet', e);
        syncBadge('err');
        return false;
      });
  }

  /* כתיבה חזרה לגיליון. מחזיר Promise שלעולם לא נדחה —
   * הכישלון מדווח למשתמשת בטקסט, לא כשגיאה שמפילה את הזרימה. */
  function postToSheet(action, data) {
    var url = (K.sheet || {}).apiUrl;
    if (!url) return Promise.resolve('skip');
    var body = JSON.stringify({
      action: action, token: (K.sheet || {}).token || '',
      date: data.iso, dow: data.dow, heb: data.heb, greg: data.greg,
      name: data.name || '', phone: data.phone || '', brings: data.brings || ''
    });
    var noCors = (K.sheet || {}).postMode === 'nocors';
    var opt = {
      method: 'POST',
      /* text/plain בכוונה: מונע preflight של CORS, ש-Apps Script לא עונה עליו */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    };
    if (noCors) opt.mode = 'no-cors';

    return fetch(url, opt)
      .then(function (r) {
        /* בתגובה אטומה אי אפשר לקרוא כלום — מניחים שעבר ולא משקרים למשתמשת */
        if (noCors) return 'sent';
        if (!r.ok) return 'fail';
        return r.json().then(function (j) {
          if (j && j.ok) return 'ok';
          if (j && j.error === 'taken') return 'taken';
          return 'fail';
        }, function () { return 'fail'; });
      })
      .catch(function (e) { console.warn('post', e); return 'fail'; });
  }

  function syncBadge(state, n) {
    var el = $('#kbSync');
    if (!el) return;
    el.hidden = false;
    if (state === 'ok') {
      el.className = 'kb-sync ok';
      el.textContent = 'מסונכרן עם הגיליון של הרכזת · ' + (n || 0) + ' רישומים';
    } else if (state === 'mismatch') {
      el.className = 'kb-sync err';
      el.textContent = 'הגיליון נטען אך שייך לחודש אחר — מוצג הלוח של החודש הנוכחי.';
    } else {
      el.className = 'kb-sync err';
      el.textContent = 'הגיליון לא נטען כרגע — מוצג הלוח השמור. ההרשמה עדיין נשלחת לרכזת.';
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

      render(new Date());
      loadSheet();   /* הגיליון מנצח את data/kibud.json ברגע שהוא מגיע */

      $('#kbGrid').addEventListener('click', function (e) {
        var b = e.target.closest('button.kb-day');
        if (b) openModal(b.dataset.iso, EVENINGS);
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
      $('#kbCancel').addEventListener('click', cancelSignup);
      $('#kbShare').addEventListener('click', function () { shareFree(EVENINGS); });
    })
    .catch(function (e) {
      $('#kbIntro').textContent = 'שגיאה בטעינת הלוח.';
      console.error(e);
    });
})();
