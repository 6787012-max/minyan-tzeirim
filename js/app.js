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

    var cells = [];
    cells.push(['היום', 'יום ' + h.dayName + '<small>' + esc(h.str) + '</small>']);
    if (special) cells.push(['מועד', esc(special)]);
    cells.push(['נץ החמה', Luach.hhmm(sun.sunrise) + '<small>מעלה עמוס</small>']);
    cells.push(['שקיעה', Luach.hhmm(sun.sunset) + '<small>' +
                (sel ? 'ימי הסליחות' : 'שעון ישראל') + '</small>']);

    var next = nextShiur(now, sel);
    if (next) cells.push(['הבא בתור', esc(next.title) + '<small>' + next.when + '</small>']);

    var strip = $('todayStrip');
    strip.innerHTML = '';
    cells.forEach(function (c) {
      strip.appendChild(el('div', 'tcell',
        '<div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div>'));
    });
  }

  /* מוצא את המופע הקרוב ביותר מבין השיעורים והתפילות */
  function nextShiur(now, sel) {
    var items = (CFG.shiurim || []).concat(CFG.tefillot || []);
    var best = null;
    items.forEach(function (it) {
      var t = (sel && it.timeSelichot) ? it.timeSelichot : it.time;
      if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return;
      var p = t.split(':');
      var when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +p[0], +p[1]);
      if (when <= now) when = new Date(when.getTime() + 864e5);   // מחר
      if (!best || when < best.when) best = { title: it.title, when: when, t: t };
    });
    if (!best) return null;
    var mins = Math.round((best.when - now) / 60000);
    var txt;
    if (mins < 60) txt = 'בעוד ' + mins + ' דק׳ · ' + best.t;
    else if (mins < 60 * 20) {
      var hh = Math.floor(mins / 60), mm = mins % 60;
      txt = 'בעוד ' + hh + ' שע׳' + (mm ? ' ו-' + mm + ' דק׳' : '') + ' · ' + best.t;
    } else txt = 'מחר ב-' + best.t;
    return { title: best.title, when: txt };
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

  var YN = null, QTY = {};

  /* מוצא את התאריכים האמיתיים של ר״ה ויוה״כ מטבלת הלוח */
  function yamimNoraimDates(now) {
    var out = [], seen = {};
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (var i = 0; i < 400; i++) {
      var iso = Luach.iso(d), h = LU.days[iso];
      if (h && /ראש השנה|יום כיפור/.test(h)) {
        var k = /ראש השנה/.test(h) ? 'rh' : 'yk';
        if (!seen[k]) { seen[k] = 1; out.push([k, new Date(d), h]); }
        if (out.length === 2) break;
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function renderSeats(now) {
    if (!YN || !(YN.options || []).length) return;
    var sec = $('seats');
    sec.hidden = false;

    $('seatsEyebrow').textContent = YN.eyebrow || '';
    $('seatsTitle').textContent = YN.title || '';
    $('seatsIntro').textContent = YN.intro || '';

    var dates = yamimNoraimDates(now);
    if (dates.length) {
      $('seatsDates').textContent = dates.map(function (x) {
        var hd = Luach.hebrew(x[1]);
        return (x[0] === 'rh' ? 'ראש השנה' : 'יום כיפור') + ' · ' +
          x[1].getDate() + '.' + (x[1].getMonth() + 1) +
          ' (' + Luach.numToHeb(hd.d, true) + ' ב' + hd.monthName + ')';
      }).join('  ·  ');
    }

    if (YN.draft) {
      var df = $('seatsDraft');
      df.hidden = false;
      df.innerHTML = '<b>המחירים כאן טרם אושרו</b> — הם ברירת מחדל. יש לאשר אותם ' +
        'בקובץ <code>data/yamim_noraim.json</code> ולהוריד את <code>draft</code> ל-false.';
    }

    var g = $('seatsGrid');
    g.innerHTML = YN.options.map(function (o) {
      QTY[o.id] = QTY[o.id] || 0;
      return '<div class="seat" data-id="' + esc(o.id) + '">' +
        '<span class="info"><b>' + esc(o.name) + '</b><span>' + esc(o.desc || '') + '</span></span>' +
        '<span class="price">₪' + o.price + '</span>' +
        '<span class="stepper">' +
        '<button type="button" data-d="1" aria-label="הוסף">+</button>' +
        '<span class="q">0</span>' +
        '<button type="button" data-d="-1" aria-label="הפחת" disabled>−</button>' +
        '</span></div>';
    }).join('');

    g.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]');
      if (!b) return;
      var row = b.closest('.seat'), id = row.dataset.id;
      var opt = YN.options.filter(function (o) { return o.id === id; })[0];
      var max = opt.max || 9;
      QTY[id] = Math.max(0, Math.min(max, (QTY[id] || 0) + (+b.dataset.d)));
      row.querySelector('.q').textContent = QTY[id];
      row.querySelector('[data-d="-1"]').disabled = QTY[id] === 0;
      row.querySelector('[data-d="1"]').disabled = QTY[id] === max;
      updateSeatsTotal();
    });

    $('seatsNote').innerHTML = esc(YN.note || '') +
      ' התשלום מתבצע באתר המאובטח של נדרים פלוס.';
    updateSeatsTotal();
  }

  function updateSeatsTotal() {
    var total = 0, parts = [];
    YN.options.forEach(function (o) {
      var q = QTY[o.id] || 0;
      if (!q) return;
      total += q * o.price;
      parts.push(o.name + ' ×' + q);
    });
    $('seatsTotal').textContent = '₪' + total.toLocaleString('he-IL');
    var btn = $('seatsBuy');
    btn.setAttribute('aria-disabled', String(total === 0));
    if (!total) { btn.href = '#'; btn.textContent = 'בחרו מקומות'; return; }
    btn.textContent = 'לרכישה מאובטחת · ₪' + total.toLocaleString('he-IL');
    var n = CFG.nedarim || {}, yn = YN.nedarim || {};
    btn.href = n.url + '&Amount=' + total + '&AmountLock=1&OnlyNormal=1' +
      '&Groupe=' + encodeURIComponent(yn.groupe || 'מקומות לימים נוראים') +
      '&GroupeLock=1' +
      '&CustomAvour=' + encodeURIComponent(yn.avourTitle || 'פירוט המקומות') +
      '&Avour=' + encodeURIComponent(parts.join(' · '));
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
    try { renderSeats(now); } catch (e) { console.error('seats', e); }
    renderZmanim(now);
    renderShabbat(now);
    renderGive();
    renderAbout();
    renderFooter();
    // רענון פס היום כל דקה (הספירה לאחור)
    setInterval(function () { renderToday(new Date()); }, 60000);
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
