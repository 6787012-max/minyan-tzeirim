/* app.js — מרכיב את הדף מ-data/config.json ומ-data/shabbat.json.
   אין כאן שום תוכן קשיח: כל טקסט, שעה או סכום מגיעים מקבצי הנתונים. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var CFG = null, LU = null;

  /* ── עזרים ────────────────────────────────────────────────────── */

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* הכתובת שמורה ב-base64 בקובץ הנתונים — לא סוד, רק מונע קצירה
     אוטומטית של בוטי ספאם מהקוד הפתוח. */
  function orderEmail(o) {
    if (!o) return '';
    if (o.email) return o.email;
    try { return o.email_b64 ? atob(o.email_b64) : ''; } catch (e) { return ''; }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shekel(n) {
    return '₪' + Math.round(n).toLocaleString('he-IL');
  }

  var ICONS = {
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H21z"/></svg>',
    sun:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 13.2A8.4 8.4 0 1 1 10.8 3a6.8 6.8 0 0 0 10.2 10.2z"/></svg>',
    pin:  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" style="color:var(--gold);vertical-align:-3px"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    candle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3c1.6 1.6 2.4 2.9 2.4 4a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.4 2.4-4z"/><rect x="8.5" y="10.5" width="7" height="10.5" rx="1.4"/></svg>'
  };

  /* ── פס היום ──────────────────────────────────────────────────── */

  function renderToday(now) {
    var h = Luach.hebrew(now);
    var sun = Luach.sun(now, CFG.geo);
    var special = LU.days[Luach.iso(now)];
    var sel = Luach.isSelichot(now);

    /* האיבר השלישי מסמן שהערך הוא מספר — הוא מקבל את גופן הספרות */
    var cells = [];
    cells.push(['היום', 'יום ' + h.dayName + '<small>' + esc(h.str) + '</small>']);
    if (special) cells.push(['מועד', esc(special)]);
    cells.push(['נץ החמה', Luach.hhmm(sun.sunrise) + '<small>מעלה עמוס</small>', 1]);
    cells.push(['שקיעה', Luach.hhmm(sun.sunset) + '<small>' +
                (sel ? 'ימי הסליחות' : 'שעון ישראל') + '</small>', 1]);

    var next = nextShiur(now, sel);
    if (next) cells.push(['הבא בתור', esc(next.title) + '<small>' + next.when + '</small>']);

    var strip = $('todayStrip');
    strip.innerHTML = '';
    cells.forEach(function (c) {
      strip.appendChild(el('div', 'tcell' + (c[2] ? ' n' : ''),
        '<div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div>'));
    });
  }

  /* פריט תפילה/שיעור יכול להיות מוגבל לימים מסוימים (weekdays: 0=ראשון…6=שבת).
     בלי השדה — הוא חל בכל יום. */
  function runsOn(item, date) {
    if (!item.weekdays || !item.weekdays.length) return true;
    return item.weekdays.indexOf(date.getDay()) >= 0;
  }

  /* מוצא את המופע הקרוב ביותר מבין השיעורים והתפילות */
  function nextShiur(now, sel) {
    var items = (CFG.shiurim || []).concat(CFG.tefillot || []);
    var best = null;
    items.forEach(function (it) {
      var t = (sel && it.timeSelichot) ? it.timeSelichot : it.time;
      if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return;
      var p = t.split(':');
      /* סורקים שבוע קדימה — תפילה שמתקיימת רק בשבת לא בהכרח היום או מחר */
      for (var d = 0; d < 8; d++) {
        var when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d,
                            +p[0], +p[1]);
        if (when <= now || !runsOn(it, when)) continue;
        if (!best || when < best.when) best = { title: it.title, when: when, t: t };
        break;
      }
    });
    if (!best) return null;
    var mins = Math.round((best.when - now) / 60000);
    var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    var dayGap = Math.round(
      (new Date(best.when.getFullYear(), best.when.getMonth(), best.when.getDate()) -
       new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    var txt;
    if (mins < 60) txt = 'בעוד ' + mins + ' דק׳ · ' + best.t;
    else if (dayGap === 0) {
      var hh = Math.floor(mins / 60), mm = mins % 60;
      txt = 'בעוד ' + hh + ' שע׳' + (mm ? ' ו-' + mm + ' דק׳' : '') + ' · ' + best.t;
    } else if (dayGap === 1) txt = 'מחר ב-' + best.t;
    else txt = (best.when.getDay() === 6 ? 'בשבת' : 'ביום ' + DAYS[best.when.getDay()]) +
               ' ב-' + best.t;
    return { title: best.title, when: txt };
  }

  /* ── זמני היום ההלכתיים ───────────────────────────────────────── */

  var ZY = [
    ['בוקר', 'sunrise', [
      ['alot',      'עלות השחר',      '16.1° מתחת לאופק'],
      ['mishyakir', 'משיכיר',          'זמן טלית ותפילין · 11.5°'],
      ['sunrise',   'הנץ החמה',        '', 1],
      ['shemaMGA',  'סוף זמן ק״ש',     'מגן אברהם'],
      ['shemaGRA',  'סוף זמן ק״ש',     'הגר״א', 1],
      ['tefilaMGA', 'סוף זמן תפילה',   'מגן אברהם'],
      ['tefilaGRA', 'סוף זמן תפילה',   'הגר״א', 1]
    ]],
    ['אחר הצהריים והערב', 'moon', [
      ['chatzot',  'חצות היום',       ''],
      ['minchaG',  'מנחה גדולה',      'חצי שעה זמנית אחרי חצות'],
      ['minchaK',  'מנחה קטנה',       ''],
      ['plag',     'פלג המנחה',       ''],
      ['sunset',   'שקיעה',           '', 1],
      ['tzet',     'צאת הכוכבים',     '8.5° מתחת לאופק', 1],
      ['tzetRT',   'צאת הכוכבים ר״ת', '72 דקות אחרי השקיעה']
    ]]
  ];

  function renderZmaneiYom(now) {
    var z = Luach.zmanim(now, CFG.geo);
    var box = $('zyGrid');
    if (!z || !box) return;

    /* הזמן הקרוב הבא — מודגש */
    var nextKey = null, best = Infinity;
    ZY.forEach(function (col) {
      col[2].forEach(function (r) {
        var t = z[r[0]];
        if (t && t > now && (t - now) < best) { best = t - now; nextKey = r[0]; }
      });
    });

    box.innerHTML = ZY.map(function (col) {
      var rows = col[2].map(function (r) {
        var t = z[r[0]];
        if (!t) return '';
        var cls = 'zy-row';
        if (r[0] === nextKey) cls += ' now';
        else if (r[3]) cls += ' key';
        if (t < now && r[0] !== nextKey) cls += ' past';
        return '<div class="' + cls + '"><span class="nm">' + esc(r[1]) +
          (r[2] ? '<small>' + esc(r[2]) + '</small>' : '') +
          '</span><span class="tm">' + Luach.hhmm(t) + '</span></div>';
      }).join('');
      return '<div class="zy-col"><h3>' + (ICONS[col[1]] || '') + esc(col[0]) + '</h3>' +
        rows + '</div>';
    }).join('');

    $('zyNote').innerHTML = 'שעה זמנית היום: <b>' +
      Math.round(z.hour / 60000) + ' דקות</b>. ' +
      'הזמנים אסטרונומיים לפי שיטות מקובלות ואינם פסק הלכה — ' +
      '<b>לוח מודפס של הרב המקומי גובר.</b>';
    if (window.Motion) window.Motion.refresh();
  }

  /* ── כרטיסי זמנים ─────────────────────────────────────────────── */

  function renderZmanim(now) {
    var sel = Luach.isSelichot(now);
    var grid = $('zmanimGrid');
    grid.innerHTML = '';
    var items = (CFG.shiurim || []).concat(CFG.tefillot || []);
    if (!items.length) { grid.parentNode.parentNode.hidden = true; return; }

    items.forEach(function (it) {
      var active = (sel && it.timeSelichot) ? it.timeSelichot : it.time;
      var c = el('div', 'card');
      var html = '';
      if (it.icon && ICONS[it.icon]) html += '<div class="ico">' + ICONS[it.icon] + '</div>';
      html += '<h3>' + esc(it.title) + '</h3>';
      if (it.days) html += '<div class="sub">' + esc(it.days) + '</div>';
      html += '<div class="big">' + esc(active) + '</div>';
      if (it.timeSelichot && it.timeSelichot !== it.time) {
        html += '<div class="alt-time">' +
          (sel ? 'מחוץ לימי הסליחות <b>' + esc(it.time) + '</b>'
               : 'בימי הסליחות <b>' + esc(it.timeSelichot) + '</b>') + '</div>';
      }
      if (it.note) html += '<div class="alt-time">' + esc(it.note) + '</div>';
      if (!runsOn(it, now)) c.classList.add('not-today');
      c.innerHTML = html;
      grid.appendChild(c);
    });

    var note = $('zmanimNote');
    if (sel) {
      note.innerHTML = '<b>אנחנו בתקופת הסליחות</b> — השעות המוצגות הן שעות הסליחות.';
      note.hidden = false;
    } else if (items.some(function (i) { return i.timeSelichot; })) {
      note.innerHTML = 'בתקופת הסליחות השעות מתעדכנות באתר אוטומטית.';
      note.hidden = false;
    }
  }

  /* ── שבת ──────────────────────────────────────────────────────── */

  function shabbatInfo(sat) {
    var fri = new Date(sat.getTime() - 864e5);
    var sunFri = Luach.sun(fri, CFG.geo);
    var s = CFG.shabbat || {};
    var rec = LU.shabbat[Luach.iso(sat)] || {};

    /* ראש השנה הוא יומיים — כשיום א׳ שלו חל בשבת, צאת החג הוא במוצאי יום ראשון
       ולא במוצאי שבת. זה החג הדו-יומי היחיד בארץ, ולכן זה המקרה היחיד שמטופל. */
    var endDay = sat;
    if (rec.h && rec.h.indexOf('ראש השנה') >= 0) endDay = new Date(sat.getTime() + 864e5);
    var sunEnd = Luach.sun(endDay, CFG.geo);

    return {
      fri: fri, sat: sat, rec: rec,
      candle: Luach.addMin(sunFri.sunset, -(s.candleBeforeSunset || 40)),
      sunsetFri: sunFri.sunset,
      sunsetSat: sunEnd.sunset,
      havdala: Luach.addMin(sunEnd.sunset, s.havdalaAfterSunset || 42),
      twoDay: endDay !== sat
    };
  }

  function renderShabbat(now) {
    var next = Luach.nextShabbat(now).sat;
    var inf = shabbatInfo(next);
    var s = CFG.shabbat || {};
    var label = inf.rec.p ? 'פרשת ' + inf.rec.p : (inf.rec.h || 'שבת קודש');
    $('shabbatTitle').textContent = 'שבת ' + label;

    var cards = $('shabbatCards');
    cards.innerHTML = '';
    [
      ['הדלקת נרות', Luach.hhmm(inf.candle),
       'יום שישי · ' + (s.candleBeforeSunset || 40) + ' דק׳ לפני השקיעה (' +
       Luach.hhmm(inf.sunsetFri) + ')', 'candle'],
      [inf.twoDay ? 'שקיעה במוצאי החג' : 'שקיעה במוצאי שבת',
       Luach.hhmm(inf.sunsetSat), 'מעלה עמוס', 'sun'],
      [inf.twoDay ? 'צאת החג' : 'צאת השבת', Luach.hhmm(inf.havdala),
       (inf.twoDay ? 'ראש השנה הוא יומיים — במוצאי יום ראשון · ' : '') +
       (s.havdalaNote || 'צאת הכוכבים') + ' · ' + (s.havdalaAfterSunset || 42) +
       ' דק׳ אחרי השקיעה', 'moon']
    ].forEach(function (r) {
      cards.appendChild(el('div', 'card',
        (ICONS[r[3]] ? '<div class="ico">' + ICONS[r[3]] + '</div>' : '') +
        '<h3>' + r[0] + '</h3><div class="big">' + r[1] + '</div>' +
        '<div class="alt-time">' + esc(r[2]) + '</div>'));
    });

    // טבלת שמונה השבתות הקרובות
    var tb = $('shabbatTable').querySelector('tbody');
    tb.innerHTML = '';
    for (var i = 0; i < 8; i++) {
      var sat = new Date(next.getTime() + i * 7 * 864e5);
      if (!LU.shabbat[Luach.iso(sat)]) continue;
      var f = shabbatInfo(sat);
      var name = f.rec.p ? f.rec.p : (f.rec.h || '—');
      var hd = Luach.hebrew(sat);
      var tr = el('tr', i === 0 ? 'now' : '');
      tr.innerHTML =
        '<td class="p">' + esc(name) +
        (f.twoDay ? '<span class="tag">חג יומיים · הצאת במוצאי יום א׳</span>' : '') + '</td>' +
        '<td>' + sat.getDate() + '.' + (sat.getMonth() + 1) +
        ' <span style="color:var(--muted)">· ' + esc(Luach.numToHeb(hd.d, true) + ' ב' + hd.monthName) + '</span></td>' +
        '<td class="t">' + Luach.hhmm(f.candle) + '</td>' +
        '<td class="t" style="font-weight:400;color:var(--muted)">' + Luach.hhmm(f.sunsetFri) + '</td>' +
        '<td class="t">' + Luach.hhmm(f.havdala) + '</td>';
      tb.appendChild(tr);
    }

    $('shabbatNote').innerHTML =
      'הזמנים מחושבים בדפדפן לפי מיקום מעלה עמוס (' + CFG.geo.lat + '°, ' + CFG.geo.lon +
      '°), בגובה פני הים, ולפי שעון ישראל. ' +
      (s.candleNote ? '<b>הדלקת נרות: ' + esc(s.candleNote) + '.</b> ' : '') +
      'בשבתות שחלות בחג ובצום — לברר את זמן הצאת מול הרב המקומי. ' +
      'לוח מודפס של הרב גובר על החישוב כאן.';
  }

  /* ── שותפות ───────────────────────────────────────────────────── */

  function renderGive() {
    var n = CFG.nedarim || {};
    var opts = $('giveOpts');
    opts.innerHTML = '';
    (n.groups || []).forEach(function (g) {
      var url = n.url + '&Groupe=' + encodeURIComponent(g.name);
      if (g.amount) url += '&Amount=' + g.amount;
      if (g.keva) url += '&OnlyKeva=1';
      var a = el('a', 'opt');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = '<span class="l"><b>' + esc(g.name) + '</b><span>' +
        esc(g.desc || '') + '</span></span>' +
        (g.amount ? '<span class="a">₪' + g.amount + (g.keva ? '<span style="font-size:14px"> / חודש</span>' : '') + '</span>' : '');
      opts.appendChild(a);
    });
    var other = el('a', 'opt');
    other.href = n.url; other.target = '_blank'; other.rel = 'noopener';
    other.innerHTML = '<span class="l"><b>סכום אחר</b><span>לבחירתך, בכרטיס אשראי או בביט</span></span>' +
      '<span class="a">←</span>';
    opts.appendChild(other);

    $('giveNote').innerHTML = 'התרומות נגבות דרך <b>נדרים פלוס</b>, מוסד ' + esc(n.mosad) +
      '. הדף נפתח באתר המאובטח שלהם — פרטי האשראי לא עוברים דרך האתר הזה.';

    loadProgress(n);
  }

  /* מושך את יעד המגבית מנדרים פלוס. נכשל בשקט אם אין רשת.
     נדרים מגבילים את GetMosad ל-~100 פניות ב-10 דקות לכל IP ומבקשים במפורש
     לא לקרוא בכל טעינת דף — לכן התשובה נשמרת לשעה אצל המשתמש. */
  var MOSAD_TTL = 3600e3;

  function loadProgress(n) {
    if (!n.mosad) return;
    var key = 'mt-mosad-' + n.mosad, cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
    if (cached && cached.t && (new Date().getTime() - cached.t) < MOSAD_TTL && cached.d) {
      showProgress(cached.d);
      return;
    }
    var url = 'https://www.matara.pro/nedarimplus/online/Files/Manage.aspx?Action=GetMosad&MosadId=' + n.mosad;
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (txt) {
      var d = JSON.parse(txt.replace(/^﻿/, ''));
      try {
        localStorage.setItem(key, JSON.stringify({ t: new Date().getTime(), d: d }));
      } catch (e) { /* מצב פרטי */ }
      showProgress(d);
    }).catch(function () { /* אין רשת — פשוט בלי הפס */ });
  }

  function showProgress(d) {
    var groups = [];
    try { groups = JSON.parse(d.NewGroupe || '[]'); } catch (e) { return; }
    var g = groups.filter(function (x) { return +x.Goal > 0; })[0];
    if (!g) return;
    var have = +g.Cumule || 0, goal = +g.Goal;
    var pct = Math.max(0, Math.min(100, have / goal * 100));
    $('barLabel').textContent = 'מגבית «' + g.Name + '»';
    $('barVal').textContent = shekel(have) + ' מתוך ' + shekel(goal);
    $('barCap').textContent = Math.round(pct) + '% מהיעד · נותרו ' + shekel(goal - have);
    $('giveBar').hidden = false;
    $('barFill').style.width = pct + '%';
  }

  /* ── מקומות לימים הנוראים ─────────────────────────────────────── */

  var YN = null, PLACES = 1, HAS_KEVA = false;

  /* מוצא את התאריכים האמיתיים של ר״ה ויוה״כ מטבלת הלוח */
  function yamimNoraimDates(now) {
    var out = [], seen = {};
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (var i = 0; i < 400; i++) {
      var iso = Luach.iso(d), h = LU.days[iso];
      if (h && /ראש השנה|יום כיפור/.test(h)) {
        var k = /ראש השנה/.test(h) ? 'rh' : 'yk';
        if (!seen[k]) { seen[k] = 1; out.push([k, new Date(d)]); }
        if (out.length === 2) break;
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function renderSeats(now) {
    if (!YN || !YN.price) return;
    $('seats').hidden = false;

    $('seatsEyebrow').textContent = YN.eyebrow || '';
    $('seatsTitle').textContent = YN.title || '';
    $('seatsIntro').textContent = YN.intro || '';
    $('placesLabel').textContent = (YN.places || {}).label || 'כמה מקומות?';

    var dates = yamimNoraimDates(now);
    if (dates.length) {
      $('seatsDates').textContent = dates.map(function (x) {
        var hd = Luach.hebrew(x[1]);
        return (x[0] === 'rh' ? 'ראש השנה' : 'יום כיפור') + ' · ' +
          x[1].getDate() + '.' + (x[1].getMonth() + 1) +
          ' (' + Luach.numToHeb(hd.d, true) + ' ב' + hd.monthName + ')';
      }).join('  ·  ');
    }

    var ex = YN.exemption || {};
    if (ex.enabled) {
      $('kevaLabel').textContent = ex.label || '';
    } else {
      $('kevaWrap').hidden = true;
    }

    PLACES = (YN.places || {}).default || 1;
    $('placesQty').textContent = PLACES;

    $('placesStep').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]');
      if (!b) return;
      var pl = YN.places || {};
      PLACES = Math.max(pl.min || 1, Math.min(pl.max || 10, PLACES + (+b.dataset.d)));
      $('placesQty').textContent = PLACES;
      updateSeats();
    });
    $('kevaChk').addEventListener('change', function () {
      HAS_KEVA = this.checked;
      updateSeats();
    });
    $('seatsSend').addEventListener('click', sendOrder);

    $('seatsNote').innerHTML = esc(YN.note || '') +
      ' התשלום מתבצע באתר המאובטח של נדרים פלוס.';
    updateSeats();
  }

  function orderSummary() {
    return [
      'הזמנת מקומות לימים הנוראים',
      '',
      'שם: ' + ($('ordName').value.trim() || '—'),
      'טלפון: ' + ($('ordPhone').value.trim() || '—'),
      'מספר מקומות: ' + PLACES,
      HAS_KEVA ? 'יש הוראת קבע של שותף — פטור מתשלום' : 'לתשלום: ₪' + seatsTotal(),
      ($('ordNote').value.trim() ? 'הערה: ' + $('ordNote').value.trim() : '')
    ].filter(Boolean).join('\n');
  }

  function seatsTotal() {
    if (HAS_KEVA) return 0;
    return (YN.priceUnit === 'place') ? YN.price * PLACES : YN.price;
  }

  function updateSeats() {
    var total = seatsTotal();
    var pay = $('seatsPay');

    if (HAS_KEVA) {
      $('totalLabel').textContent = 'שותף בהוראת קבע';
      $('seatsTotal').textContent = 'ללא תשלום';
      $('seatsTotal').classList.add('free');
      pay.hidden = true;
      $('seatsSend').textContent = 'שריון המקומות';
      $('seatsSend').className = 'btn btn-g';
    } else {
      $('totalLabel').textContent = (YN.priceUnit === 'place')
        ? PLACES + ' מקומות × ₪' + YN.price : esc(YN.priceLabel || 'לתשלום');
      $('seatsTotal').textContent = '₪' + total.toLocaleString('he-IL');
      $('seatsTotal').classList.remove('free');
      pay.hidden = false;
      $('seatsSend').textContent = 'רישום בלי תשלום כעת';
      $('seatsSend').className = 'btn btn-s';

      var n = CFG.nedarim || {}, yn = YN.nedarim || {};
      var detail = PLACES + ' מקומות · ' + ($('ordName').value.trim() || '');
      pay.href = n.url + '&Amount=' + total + '&AmountLock=1&OnlyNormal=1' +
        '&Groupe=' + encodeURIComponent(yn.groupe || 'מקומות לימים נוראים') +
        '&GroupeLock=1' +
        '&CustomAvour=' + encodeURIComponent(yn.avourTitle || 'פירוט ההזמנה') +
        '&Avour=' + encodeURIComponent(detail) +
        ($('ordName').value.trim() ? '&ClientName=' + encodeURIComponent($('ordName').value.trim()) : '') +
        ($('ordPhone').value.trim() ? '&Phone=' + encodeURIComponent($('ordPhone').value.trim()) : '');
    }
  }

  /* שליחת ההזמנה לגבאי — וואטסאפ אם יש מספר, אחרת מייל */
  function sendOrder() {
    if (!$('ordName').value.trim() || !$('ordPhone').value.trim()) {
      $('seatsNote').innerHTML = '<b style="color:#9B1E1E">יש למלא שם וטלפון לפני השליחה.</b>';
      $('ordName').focus();
      return;
    }
    var o = YN.order || {}, body = orderSummary();
    if (o.whatsapp) {
      window.open('https://wa.me/' + o.whatsapp + '?text=' + encodeURIComponent(body), '_blank');
    } else if (orderEmail(o)) {
      location.href = 'mailto:' + orderEmail(o) +
        '?subject=' + encodeURIComponent('הזמנת מקומות לימים הנוראים — ' + $('ordName').value.trim()) +
        '&body=' + encodeURIComponent(body);
    }
    $('seatsNote').innerHTML = 'ההזמנה נשלחה לגבאי. ' +
      (HAS_KEVA ? 'שותפים בהוראת קבע — אין צורך בתשלום נוסף.'
                : 'אפשר לשלם עכשיו או מאוחר יותר מול הגבאי.');
  }


  /* באנר הש״ס בדף הבית — המספר מגיע מ-shas.json, לא קשיח */
  function renderShasBanner() {
    fetch('data/shas.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var vols = d.volumes || [];
        var free = vols.filter(function (v) { return !(v.by && v.by.trim()); }).length;
        var el1 = $('sbFree');
        if (el1) {
          el1.textContent = free;          /* הערך הסופי תמיד נוכח */
          el1.setAttribute('data-count', free);
          el1.classList.remove('counted');
        }
        var el2 = $('promoShasK');
        if (el2) el2.textContent = vols.length + ' כרכים · ₪' + d.pricePerVolume + ' לכרך';
      })
      .then(function () { if (window.Motion) window.Motion.refresh(); })
      .catch(function () { /* הבאנר נשאר עם ערך ברירת המחדל */ });
  }

  /* ── אודות ותחתית ─────────────────────────────────────────────── */

  function renderAbout() {
    var box = $('aboutText');
    box.innerHTML = '<div class="head" style="margin-bottom:18px">' +
      '<div class="eyebrow">מי אנחנו</div><h2>' + esc(CFG.name) + '</h2></div>' +
      (CFG.about || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');

    /* עובדות — נגזרות מהנתונים, לא טקסט מילוי */
    var facts = [];
    var first = (CFG.shiurim || [])[0];
    if (first) facts.push([first.time, first.title + ' · ' + (first.days || '')]);
    var keva = ((CFG.nedarim || {}).groups || []).filter(function (g) { return g.keva; })[0];
    if (keva) facts.push(['₪' + keva.amount, 'שותפות חודשית קבועה — ' + keva.name]);
    if (CFG.address) facts.push([ICONS.pin, CFG.address, true]);
    var box2 = $('aboutFacts');
    box2.innerHTML = facts.map(function (f) {
      return '<div class="fact"><b>' + (f[2] ? f[0] : esc(f[0])) + '</b><span>' +
        esc(f[1]) + '</span></div>';
    }).join('');
  }

  function renderFooter() {
    var w = [];
    if (CFG.address) w.push(esc(CFG.address));
    (CFG.contacts || []).forEach(function (c) {
      w.push(esc(c.name) + (c.phone ? ' · <a href="tel:' + esc(c.phone).replace(/\D/g, '') + '">' +
        esc(c.phone) + '</a>' : ''));
    });
    $('footWhere').innerHTML = '<b>איפה</b>' + w.join('<br>');
    var n = CFG.nedarim || {};
    $('footGive').innerHTML = '<b>לתרומות</b>' +
      '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">נדרים פלוס · מוסד ' + esc(n.mosad) + '</a>';
    $('footAmuta').textContent = n.amuta ? 'ע״ר ' + n.amuta : '';
  }

  /* ── הפעלה ────────────────────────────────────────────────────── */

  function boot(cfg, luach, yn) {
    CFG = cfg; LU = luach; YN = yn;
    document.title = CFG.name + ' · ' + CFG.place;
    if (CFG.tagline) $('tagline').textContent = CFG.tagline;
    var now = new Date();
    renderToday(now);
    try { renderZmaneiYom(now); } catch (e) { console.error('zmanim', e); }
    try { renderSeats(now); } catch (e) { console.error('seats', e); }
    renderZmanim(now);
    renderShabbat(now);
    renderGive();
    renderAbout();
    renderFooter();
    renderShasBanner();
    if (window.Motion) window.Motion.refresh();
    // רענון פס היום כל דקה (הספירה לאחור)
    setInterval(function () {
      var t = new Date();
      renderToday(t);
      try { renderZmaneiYom(t); } catch (e) {}
    }, 60000);
  }

  function fail(msg) {
    var s = $('todayStrip');
    if (s) s.innerHTML = '<div class="tcell"><div class="v">' + esc(msg) + '</div></div>';
  }

  Promise.all([
    fetch('data/config.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    fetch('data/shabbat.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    fetch('data/yamim_noraim.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (a) { boot(a[0], a[1], a[2]); })
    .catch(function (e) { fail('שגיאה בטעינת הנתונים'); console.error(e); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
