(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var key = decodeURIComponent((location.hash.match(/k=([^&]+)/) || [])[1] || '');
  if (!key) { $('err').textContent = 'חסר מפתח בקישור.'; return; }
  var api = null, SITE = location.origin;
  var KINDS = { dinner: 'ארוחת ערב', shabbat_night: 'ליל שבת', shabbat_lunch: 'שבת בצהריים', lunch: 'ארוחת צהריים', shalosh: 'סעודה שלישית' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function call(body) {
    body.admin = key;
    return fetch(api.url + '/functions/v1/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api.anon, 'Authorization': 'Bearer ' + api.anon },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'net' }; }); });
  }
  function dt(iso) { return new Date(iso + 'T12:00:00'); }
  function fmtFull(iso) { return dt(iso).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fmtShort(iso) { return dt(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); }
  function toast(t) { var e = $('toast'); e.textContent = t; e.className = 'toast on'; setTimeout(function () { e.className = 'toast'; }, 2600); }
  function copy(text) {
    var done = function () { toast('הועתק'); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () { fallback(); }); } else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* */ } document.body.removeChild(t); }
  }
  function pubLink(slug) { return SITE + '/meals.html?e=' + slug; }
  function groupMsg(e) {
    return 'שלום וברכה,\nנפתח שיבוץ ארוחות ל' + e.family + '.\nמי שיכולה לקחת ארוחה מוזמנת לבחור יום בקישור:\n' + pubLink(e.slug) + '\nתודה רבה!';
  }
  function remindUrl(e, s) {
    var t = s.taken, first = t.name.split(' ')[0];
    var text = 'שלום ' + first + ',\nתזכורת קטנה: ב' + fmtFull(s.day) + ' (' + s.label + ') את מכינה ' + t.dish + ' ל' + e.family + '.' +
      (e.address ? '\nהכתובת: ' + e.address + '.' : '') + '\nתודה רבה על העזרה!';
    return 'https://wa.me/972' + String(t.phone_raw).replace(/^0/, '') + '?text=' + encodeURIComponent(text);
  }

  var EV = null, SL = null;

  function showList() {
    EV = null; SL = null;
    call({ action: 'events' }).then(function (d) {
      if (!d.ok) { $('err').textContent = d.error === 'auth' ? 'המפתח אינו תקין.' : 'אין חיבור. נסו לרענן.'; return; }
      $('err').textContent = '';
      $('view').innerHTML = '<div class="row"><button class="sm pri" id="nw" type="button">אירוע חדש</button></div>' +
        (d.events.map(function (e) {
          return '<div class="card"><div class="ev"><div><div class="nm">' + esc(e.family) + ' ' + (e.closed ? '<span class="badge cl">סגור</span>' : '<span class="badge">פתוח</span>') + '</div>' +
            '<div class="meta">' + esc(fmtShort(e.date_from)) + ' עד ' + esc(fmtShort(e.date_to)) + ' · ' + e.filled + ' מתוך ' + e.total + ' משבצות תפוסות</div></div>' +
            '<div class="row"><button class="sm pri" data-open="' + e.id + '" type="button">ניהול</button><button class="sm" data-copy="' + esc(pubLink(e.slug)) + '" type="button">העתק קישור</button></div></div>' +
            '<div class="link">' + esc(pubLink(e.slug)) + '</div></div>';
        }).join('') || '<div class="empty">אין עדיין אירועים.</div>');
      $('nw').onclick = function () { showForm(null); };
    });
  }

  function showForm(e) {
    var isNew = !e; e = e || { family: '', date_from: '', date_to: '', address: '', notes: '', slug: '' };
    $('view').innerHTML = '<div class="card"><h2>' + (isNew ? 'אירוע חדש' : 'עריכת אירוע') + '</h2>' +
      '<div class="f"><label>שם המשפחה / הסיבה</label><input id="xf" maxlength="80" value="' + esc(e.family) + '" placeholder="משפחת כהן, לידה"></div>' +
      '<div class="grid2"><div class="f"><label>מתאריך</label><input id="xa" type="date" value="' + esc(e.date_from) + '"></div><div class="f"><label>עד תאריך</label><input id="xb" type="date" value="' + esc(e.date_to) + '"></div></div>' +
      '<div class="f"><label>כתובת</label><input id="xc" maxlength="160" value="' + esc(e.address) + '"></div>' +
      '<div class="f"><label>הערות (אלרגיות, העדפות, שעת הגעה)</label><textarea id="xd" maxlength="600">' + esc(e.notes) + '</textarea></div>' +
      (isNew ? '<div class="f"><label>כתובת קצרה לקישור (אופציונלי, אותיות באנגלית)</label><input id="xs" class="ltr" maxlength="40" placeholder="נוצר אוטומטית"></div>' : '') +
      '<div class="msg" id="xm"></div><div class="row"><button class="sm pri" id="xok" type="button">שמירה</button><button class="sm" id="xno" type="button">חזרה</button></div></div>';
    $('xno').onclick = function () { e.id ? showEvent(e.id) : showList(); };
    $('xok').onclick = function () {
      var body = { action: 'save', id: e.id || 0, family: $('xf').value, date_from: $('xa').value, date_to: $('xb').value, address: $('xc').value, notes: $('xd').value };
      if ($('xs')) body.slug = $('xs').value;
      $('xok').disabled = true;
      call(body).then(function (d) {
        $('xok').disabled = false;
        if (d.ok) { toast('נשמר'); showEvent(d.event.id); }
        else $('xm').textContent = { fields: 'נא למלא שם ותאריכים תקינים (עד תאריך אחרי מתאריך).', range: 'טווח ארוך מדי (עד 120 יום).', 'slug-exists': 'הכתובת הקצרה תפוסה.' }[d.error] || 'שגיאה, נסו שוב.';
      });
    };
  }

  function showEvent(id) {
    call({ action: 'event', id: id }).then(function (d) {
      if (!d.ok) { $('err').textContent = 'האירוע לא נמצא.'; return; }
      $('err').textContent = ''; EV = d.event; SL = d.slots;
      var e = EV, byDay = {}, order = [], taken = 0, act = 0;
      SL.forEach(function (s) { if (s.active) { act++; if (s.taken) taken++; } if (!byDay[s.day]) { byDay[s.day] = []; order.push(s.day); } byDay[s.day].push(s); });
      order.sort();
      var days = [], x = e.date_from; for (var i = 0; x <= e.date_to && i < 150; i++) { days.push(x); var n = dt(x); n.setDate(n.getDate() + 1); x = n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); }
      $('view').innerHTML = '<div class="row"><button class="sm" id="bk" type="button">לכל האירועים</button></div>' +
        '<div class="card"><div class="ev"><div><div class="nm">' + esc(e.family) + ' ' + (e.closed ? '<span class="badge cl">סגור</span>' : '<span class="badge">פתוח</span>') + '</div>' +
        '<div class="meta">' + esc(fmtShort(e.date_from)) + ' עד ' + esc(fmtShort(e.date_to)) + (e.address ? ' · ' + esc(e.address) : '') + ' · ' + taken + ' מתוך ' + act + ' תפוסות</div>' +
        (e.notes ? '<div class="meta">הערות: ' + esc(e.notes) + '</div>' : '') + '</div></div>' +
        '<div class="link">' + esc(pubLink(e.slug)) + '</div>' +
        '<div class="row"><button class="sm mint" id="cg" type="button">העתק הודעה לקבוצה</button><button class="sm" id="cl" type="button">העתק קישור</button><a class="sm" href="' + esc(pubLink(e.slug)) + '" target="_blank" rel="noopener">פתיחת הדף הציבורי</a>' +
        '<button class="sm" id="ed" type="button">עריכה</button><button class="sm red" id="cs" type="button">' + (e.closed ? 'פתיחה מחדש' : 'סגירת האירוע') + '</button></div></div>' +
        '<div class="card"><h2>הוספת משבצת</h2><div class="row f"><select id="sd">' + days.map(function (d) { return '<option value="' + d + '">' + esc(fmtFull(d)) + '</option>'; }).join('') + '</select>' +
        '<select id="sk">' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '">' + KINDS[k] + '</option>'; }).join('') + '</select><button class="sm pri" id="sa" type="button">הוספה</button></div></div>' +
        '<div class="card"><h2>המשבצות</h2>' + order.map(function (d) {
          return '<div class="dayh">' + esc(fmtFull(d)) + '</div>' + byDay[d].map(function (s) {
            if (!s.active) return '<div class="aslot off"><span class="t">' + esc(s.label) + '</span> (בוטלה) <button class="sm" data-add="' + d + '|' + s.kind + '" type="button">החזרה</button></div>';
            if (!s.taken) return '<div class="aslot free"><span class="t">' + esc(s.label) + '</span> · פנוי <button class="sm red" data-rm="' + s.id + '" type="button">ביטול משבצת</button></div>';
            return '<div class="aslot"><span class="t">' + esc(s.label) + '</span> · <b>' + esc(s.taken.name) + '</b> · <span class="ph">' + esc(s.taken.phone) + '</span><div class="d">' + esc(s.taken.dish) + '</div>' +
              '<div class="row"><a class="sm mint" target="_blank" rel="noopener" href="' + esc(remindUrl(e, s)) + '">תזכורת בוואטסאפ</a><button class="sm red" data-clear="' + s.id + '" type="button">ניקוי הרשמה</button><button class="sm red" data-rm="' + s.id + '" type="button">ביטול משבצת</button></div></div>';
          }).join('');
        }).join('') + '</div>';
      $('bk').onclick = showList;
      $('cg').onclick = function () { copy(groupMsg(e)); };
      $('cl').onclick = function () { copy(pubLink(e.slug)); };
      $('ed').onclick = function () { showForm(e); };
      $('cs').onclick = function () { call({ action: 'close', id: e.id, closed: !e.closed }).then(function () { showEvent(e.id); }); };
      $('sa').onclick = function () { call({ action: 'slot_add', event_id: e.id, day: $('sd').value, kind: $('sk').value }).then(function () { showEvent(e.id); }); };
    });
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    var g = function (n) { return t.getAttribute(n); };
    if (g('data-open')) showEvent(+g('data-open'));
    else if (g('data-copy')) copy(g('data-copy'));
    else if (g('data-add')) { var p = g('data-add').split('|'); call({ action: 'slot_add', event_id: EV.id, day: p[0], kind: p[1] }).then(function () { showEvent(EV.id); }); }
    else if (g('data-clear')) { if (confirm('לנקות את ההרשמה במשבצת?')) call({ action: 'signup_clear', slot_id: +g('data-clear') }).then(function () { showEvent(EV.id); }); }
    else if (g('data-rm')) {
      var sid = +g('data-rm'), s = SL.filter(function (x) { return x.id === sid; })[0];
      if (s && s.taken && !confirm('במשבצת יש הרשמה של ' + s.taken.name + '. לבטל גם אותה?')) return;
      call({ action: 'slot_remove', slot_id: sid, force: true }).then(function () { showEvent(EV.id); });
    }
  });

  fetch('data/site.json').then(function (r) { return r.json(); }).then(function (d) { api = d.api; showList(); })
    .catch(function () { $('err').textContent = 'אין חיבור. נסו לרענן.'; });
})();
