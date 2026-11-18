(function () {
  'use strict';
  var C = window.MealsCore, $ = C.$, esc = C.esc;
  var slug = (new URLSearchParams(location.search).get('e') || '').toLowerCase();
  var DATA = null, tmr = null, today = C.localToday();
  var KIND_ORDER = ['breakfast', 'lunch', 'dinner', 'shabbat_1', 'shabbat_2', 'shabbat_3'];
  var KIND_LABEL = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב', shabbat_1: 'סעודה ראשונה (ליל שבת)', shabbat_2: 'סעודה שנייה', shabbat_3: 'סעודה שלישית' };

  function sunday(iso) { var d = C.dt(iso); d.setDate(d.getDate() - d.getDay()); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function rank(s) { var i = KIND_ORDER.indexOf(s.kind); return i < 0 ? 50 : i; }

  function render() {
    var e = DATA.event; today = DATA.today || C.localToday();
    document.title = 'ארוחות ל' + e.family + ' · פינוק ליולדת';
    var bring = Object.keys(e.bring || {}).filter(function (k) { return e.bring[k]; });
    $('hero').innerHTML = '<div class="hero"><div class="kicker">פינוק ליולדת · שיבוץ ארוחות</div><h1>' + esc(e.family) + '</h1>' +
      '<div class="dates">' + esc(C.fmtShort(e.date_from)) + ' עד ' + esc(C.fmtShort(e.date_to)) + (e.address ? ' · ' + esc(e.address) : '') + '</div>' +
      (e.notes ? '<div class="note"><b>חשוב לדעת:</b> ' + esc(e.notes) + '</div>' : '') +
      (bring.length ? '<details class="bring"><summary>מה כיף להביא לכל ארוחה</summary>' + bring.map(function (k) { return '<div><b>' + esc(KIND_LABEL[k] || k) + ':</b> ' + esc(e.bring[k]) + '</div>'; }).join('') + '</details>' : '') +
      (e.closed ? '<div class="closed-banner">הפינוקים הושלמו, איזה כיף! תודה לכולן.</div>' : '') + '</div>';
    var byDay = {}, order = [];
    DATA.slots.forEach(function (s) { if (!byDay[s.day]) { byDay[s.day] = []; order.push(s.day); } byDay[s.day].push(s); });
    order.sort();
    if (!order.length) { $('days').innerHTML = '<div class="empty">עוד מכינות את לוח הפינוקים, מיד חוזרים.</div>'; return; }
    var weeks = {}, wOrder = [];
    order.forEach(function (d) { var w = sunday(d); if (!weeks[w]) { weeks[w] = []; wOrder.push(w); } weeks[w].push(d); });
    $('days').innerHTML = wOrder.map(function (w, wi) {
      var ds = weeks[w];
      return '<section class="week"><h2><span class="wn">שבוע ' + (wi + 1) + '</span><small><bdi>' + esc(C.dayNum(ds[0])) + ' עד ' + esc(C.dayNum(ds[ds.length - 1])) + '</bdi></small></h2>' +
        ds.map(function (d) {
          var past = d < today, shab = C.dt(d).getDay() === 6;
          var chips = byDay[d].slice().sort(function (a, b) { return rank(a) - rank(b) || a.id - b.id; }).map(function (s) {
            if (s.taken) {
              return '<button class="chip taken" data-info="' + s.id + '" type="button"><span class="m">' + esc(s.short) + '</span><span class="n">✓ ' + esc(s.taken.name) + '</span></button>';
            }
            var off = e.closed || past;
            return '<button class="chip free' + (off ? ' off' : '') + '" data-open="' + s.id + '" type="button"' + (off ? ' disabled' : '') + '><span class="m">' + esc(s.short) + '</span><span class="n">' + (off ? '·' : 'אני מפנקת') + '</span></button>';
          }).join('');
          return '<div class="drow' + (shab ? ' shab' : '') + (past ? ' past' : '') + (d === today ? ' today' : '') + '"><div class="dlab"><b>' + esc(C.dayName(d)) + '</b><span>' + esc(C.dayNum(d)) + '</span></div><div class="chips">' + chips + '</div></div>';
        }).join('') + '</section>';
    }).join('');
  }

  function find(id) { return DATA.slots.filter(function (x) { return x.id === id; })[0]; }
  function load(quiet) {
    return C.call({ action: 'get', slug: slug }).then(function (d) {
      if (!d.ok) { if (!quiet) $('days').innerHTML = '<div class="err">לא מצאנו את הדף הזה. כדאי לבדוק את הקישור.</div>'; return; }
      DATA = d; if (!C.isSignOpen()) render(); else DATA.stale = true;
    }).catch(function () { if (!quiet) $('days').innerHTML = '<div class="err">אין חיבור כרגע, נסו לרענן.</div>'; });
  }
  function refresh() { return load(true).then(function () { if (DATA) render(); }); }
  C.onInfoClose = function () { if (DATA && DATA.stale) { DATA.stale = false; render(); } };

  $('days').addEventListener('click', function (ev) {
    var o = ev.target.closest('[data-open]');
    if (o) {
      var s = find(+o.getAttribute('data-open')); if (!s) return;
      C.openSign({ slug: slug, slot_id: s.id, title: s.label + ' · ' + C.fmtFull(s.day), sub: 'ל' + DATA.event.family, bring: (DATA.event.bring || {})[s.kind] || '',
        onDone: refresh, onClose: function () { if (DATA && DATA.stale) { DATA.stale = false; render(); } } });
      return;
    }
    var i = ev.target.closest('[data-info]');
    if (i) {
      var t = find(+i.getAttribute('data-info')); if (!t || !t.taken) return;
      var mine = !!C.tokens(slug)[t.id], br = (DATA.event.bring || {})[t.kind];
      C.openInfo('<h3>' + esc(t.label) + '</h3><div class="sub">' + esc(C.fmtFull(t.day)) + ' · ל' + esc(DATA.event.family) + '</div>' +
        '<div class="who">' + esc(t.taken.name) + '</div><div class="dish">' + esc(t.taken.dish) + '</div><div class="ph">' + esc(t.taken.phone) + '</div>' +
        (br ? '<div class="bringbox"><b>מה כיף להביא?</b> ' + esc(br) + '</div>' : '') +
        '<div class="btnrow">' + (mine ? '<button class="btn" id="iCancel" type="button">לשחרר את הארוחה שלי</button>' : '') + '<button class="btn ghost" id="iX" type="button">סגירה</button></div>');
      $('iX').onclick = C.closeInfo;
      if (mine) $('iCancel').onclick = function () {
        if (!confirm('לשחרר את הארוחה שלך, כדי שמישהי אחרת תפנק?')) return;
        C.call({ action: 'cancel', slot_id: t.id, token: C.tokens(slug)[t.id] || '' }).then(function (d) {
          if (d.ok) { C.saveTok(slug, t.id, null); C.toast('שחררת את הארוחה, תודה שעדכנת'); } else C.toast('לא הצלחנו לשחרר. אפשר לפנות למארגנת.');
          C.closeInfo(); refresh();
        });
      };
    }
  });

  if (!slug) { $('days').innerHTML = '<div class="err">חסר קוד אירוע בקישור.</div>'; return; }
  C.init().then(function () { return load(false); })
    .then(function () { tmr = setInterval(function () { load(true); }, 25000); })
    .catch(function () { $('days').innerHTML = '<div class="err">אין חיבור. נסו לרענן.</div>'; });
})();
