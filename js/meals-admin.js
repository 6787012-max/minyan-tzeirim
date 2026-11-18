(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var key = decodeURIComponent((location.hash.match(/k=([^&]+)/) || [])[1] || '');
  if (!key) { $('err').textContent = 'חסר מפתח בקישור.'; return; }
  var api = null, SITE = location.origin;
  var KINDS = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב', shabbat_1: 'סעודה ראשונה (ליל שבת)', shabbat_2: 'סעודה שנייה', shabbat_3: 'סעודה שלישית' };
  var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var DEF_TPL = { '0': ['breakfast', 'lunch'], '1': ['breakfast', 'lunch'], '2': ['breakfast', 'lunch'], '3': ['breakfast', 'lunch'], '4': ['lunch'], '5': [], '6': ['shabbat_1', 'shabbat_2', 'shabbat_3'] };
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
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fmtFull(i) { return dt(i).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fmtShort(i) { return dt(i).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); }
  function toast(t) { var e = $('toast'); e.textContent = t; e.className = 'toast on'; setTimeout(function () { e.className = 'toast'; }, 2600); }
  function copy(text) {
    var done = function () { toast('הועתק'); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* */ } document.body.removeChild(t); }
  }
  function pubLink(slug) { return SITE + '/meals.html?e=' + slug; }
  function homeLink() { return SITE + '/yoledet.html'; }
  function groupMsg(e) {
    return 'שלום וברכה,\nמזל טוב ל' + e.family + '!\nפותחים לוח פינוקים: מי שרוצה לפנק את היולדת בארוחה טעימה בוחרת יום בקישור:\n' + pubLink(e.slug) + '\nוכאן כל השמחות שלנו עכשיו, ומה עוד מחכה לפינוק היום ומחר:\n' + homeLink() + '\nאיזה כיף שאנחנו יחד!';
  }
  function remindUrl(e, s) {
    var t = s.taken, first = t.name.split(' ')[0];
    var text = 'שלום ' + first + ',\nתזכורת חמה: ב' + fmtFull(s.day) + ' (' + s.label + ') את מפנקת עם ' + t.dish + ' את ' + e.family + '.' +
      (e.address ? '\nהכתובת: ' + e.address + '.' : '') + '\nהיא תשמח מאוד, איזה כיף שאת מפנקת!';
    return 'https://wa.me/972' + String(t.phone_raw).replace(/^0/, '') + '?text=' + encodeURIComponent(text);
  }
  function tplHtml(tpl) {
    var ks = Object.keys(KINDS);
    return '<div class="tplwrap"><table class="tpl"><tr><th></th>' + ks.map(function (k) { return '<th>' + esc(KINDS[k]) + '</th>'; }).join('') + '</tr>' +
      DAYS.map(function (n, i) {
        return '<tr><td>' + n + '</td>' + ks.map(function (k) { return '<td><input type="checkbox" data-d="' + i + '" data-k="' + k + '"' + ((tpl[String(i)] || []).indexOf(k) >= 0 ? ' checked' : '') + '></td>'; }).join('') + '</tr>';
      }).join('') + '</table></div>';
  }
  function readTpl() {
    var t = {}; for (var i = 0; i < 7; i++) t[String(i)] = [];
    document.querySelectorAll('.tpl input').forEach(function (c) { if (c.checked) t[c.getAttribute('data-d')].push(c.getAttribute('data-k')); });
    return t;
  }
  function bringHtml(b) {
    b = b || {};
    return Object.keys(KINDS).map(function (k) { return '<div class="f"><label>מה מביאים: ' + esc(KINDS[k]) + '</label><input data-bring="' + k + '" maxlength="300" value="' + esc(b[k] || '') + '" placeholder="למשל: מנה עיקרית, תוספת וסלט"></div>'; }).join('');
  }
  function readBring() { var o = {}; document.querySelectorAll('[data-bring]').forEach(function (i) { o[i.getAttribute('data-bring')] = i.value; }); return o; }

  var EV = null, SL = null;

  function showList() {
    EV = null; SL = null;
    call({ action: 'events' }).then(function (d) {
      if (!d.ok) { $('err').textContent = d.error === 'auth' ? 'המפתח אינו תקין.' : 'אין חיבור. נסו לרענן.'; return; }
      $('err').textContent = '';
      if (d.kinds) KINDS = d.kinds; if (d.default_template) DEF_TPL = d.default_template;
      $('view').innerHTML = '<div class="card"><h2>דף הבית</h2><div class="link">' + esc(homeLink()) + '</div><div class="row"><a class="sm pri" target="_blank" rel="noopener" href="yoledet.html">פתיחת דף הבית</a><button class="sm" data-copy="' + esc(homeLink()) + '" type="button">העתק קישור</button></div></div>' +
        '<div class="row"><button class="sm pri" id="nw" type="button">אירוע חדש</button></div>' +
        (d.events.map(function (e) {
          return '<div class="card"><div class="ev"><div><div class="nm">' + esc(e.family) + ' ' + (e.closed ? '<span class="badge cl">סגור</span>' : '<span class="badge">פתוח</span>') + '</div>' +
            '<div class="meta">' + esc(fmtShort(e.date_from)) + ' עד ' + esc(fmtShort(e.date_to)) + ' · ' + e.filled + ' מתוך ' + e.total + ' משבצות תפוסות</div></div>' +
            '<div class="row"><button class="sm pri" data-open="' + e.id + '" type="button">ניהול</button><button class="sm" data-copy="' + esc(pubLink(e.slug)) + '" type="button">העתק קישור</button><button class="sm red" data-del="' + e.id + '" data-nm="' + esc(e.family) + '" type="button">מחיקת אירוע</button></div></div>' +
            '<div class="link">' + esc(pubLink(e.slug)) + '</div></div>';
        }).join('') || '<div class="empty">אין עדיין אירועים.</div>');
      $('nw').onclick = function () { showForm(null); };
    });
  }

  function showForm(e) {
    var isNew = !e;
    e = e || { family: '', date_from: '', date_to: '', address: '', notes: '', slug: '', template: DEF_TPL, bring: {} };
    $('view').innerHTML = '<div class="card"><h2>' + (isNew ? 'אירוע חדש' : 'עריכת אירוע') + '</h2>' +
      '<div class="f"><label>שם המשפחה / הסיבה</label><input id="xf" maxlength="80" value="' + esc(e.family) + '" placeholder="משפחת כהן, לידה"></div>' +
      '<div class="grid2"><div class="f"><label>מתאריך</label><input id="xa" type="date" value="' + esc(e.date_from) + '"></div><div class="f"><label>עד תאריך</label><input id="xb" type="date" value="' + esc(e.date_to) + '"></div></div>' +
      (isNew ? '<div class="hintline">ברירת מחדל: שבועיים מתאריך ההתחלה.</div>' : '') +
      '<div class="f"><label>כתובת</label><input id="xc" maxlength="160" value="' + esc(e.address) + '"></div>' +
      '<div class="f"><label>הערות (אלרגיות, העדפות, שעת הגעה)</label><textarea id="xd" maxlength="600">' + esc(e.notes) + '</textarea></div>' +
      (isNew ? '<div class="f"><label>כתובת קצרה לקישור (אופציונלי, אותיות באנגלית)</label><input id="xs" class="ltr" maxlength="40" placeholder="נוצר אוטומטית"></div>' : '') +
      '<h2 class="h2s">תבנית ארוחות (לפי יום בשבוע)</h2><div class="hintline">סמנו אילו ארוחות יש בכל יום. התבנית חלה על כל הימים בטווח התאריכים.</div>' + tplHtml(e.template || DEF_TPL) +
      '<h2 class="h2s">מה מביאים לכל סוג ארוחה</h2>' + bringHtml(e.bring) +
      (isNew ? '' : '<label class="chk"><input type="checkbox" id="xr"> בנייה מחדש לפי התבנית (מוחק משבצות ריקות שלא בתבנית; משבצות עם הרשמה נשארות)</label>') +
      '<div class="msg" id="xm"></div><div class="row"><button class="sm pri" id="xok" type="button">שמירה</button><button class="sm" id="xno" type="button">חזרה</button></div></div>';
    $('xa').onchange = function () { if (isNew && $('xa').value && !$('xb').value) { var d = dt($('xa').value); d.setDate(d.getDate() + 13); $('xb').value = iso(d); } };
    $('xno').onclick = function () { e.id ? showEvent(e.id) : showList(); };
    $('xok').onclick = function () {
      var body = { action: 'save', id: e.id || 0, family: $('xf').value, date_from: $('xa').value, date_to: $('xb').value, address: $('xc').value, notes: $('xd').value, template: readTpl(), bring: readBring() };
      if ($('xs')) body.slug = $('xs').value;
      if ($('xr') && $('xr').checked) body.rebuild = true;
      $('xok').disabled = true;
      call(body).then(function (d) {
        $('xok').disabled = false;
        if (d.ok) { toast('נשמר'); showEvent(d.event.id); }
        else $('xm').textContent = { fields: 'נא למלא שם ותאריכים תקינים (עד תאריך אחרי מתאריך).', range: 'טווח ארוך מדי (עד 120 יום).', 'slug-exists': 'הכתובת הקצרה תפוסה.' }[d.error] || 'שגיאה, נסו שוב.';
      });
    };
  }

  function slotRow(e, s, d) {
    if (!s.active) return '<div class="aslot off"><span class="t">' + esc(s.label) + '</span> (בוטלה) <button class="sm" data-add="' + d + '|' + s.kind + '" type="button">החזרה</button></div>';
    var head = '<span class="t">' + esc(s.label) + '</span>' + (s.custom ? ' <small>(שם מותאם)</small>' : '');
    var ren = '<button class="sm" data-ren="' + s.id + '" type="button">שינוי שם</button>';
    if (!s.taken) return '<div class="aslot free" data-s="' + s.id + '">' + head + ' · פנוי <div class="row">' + ren + '<button class="sm" data-edit="' + s.id + '" type="button">שיבוץ ידני</button><button class="sm red" data-rm="' + s.id + '" type="button">מחיקת משבצת</button></div></div>';
    return '<div class="aslot" data-s="' + s.id + '">' + head + ' · <b>' + esc(s.taken.name) + '</b> · <span class="ph">' + esc(s.taken.phone) + '</span><div class="d">' + esc(s.taken.dish) + '</div>' +
      '<div class="row">' + ren + '<button class="sm" data-edit="' + s.id + '" type="button">עריכת הרשמה</button><a class="sm mint" target="_blank" rel="noopener" href="' + esc(remindUrl(e, s)) + '">תזכורת בוואטסאפ</a><button class="sm red" data-clear="' + s.id + '" type="button">ניקוי הרשמה</button><button class="sm red" data-rm="' + s.id + '" type="button">מחיקת משבצת</button></div></div>';
  }

  function showEvent(id) {
    call({ action: 'event', id: id }).then(function (d) {
      if (!d.ok) { $('err').textContent = 'האירוע לא נמצא.'; return; }
      $('err').textContent = ''; EV = d.event; SL = d.slots;
      if (d.kinds) KINDS = d.kinds;
      var e = EV, byDay = {}, order = [], taken = 0, act = 0;
      SL.forEach(function (s) { if (s.active) { act++; if (s.taken) taken++; } if (!byDay[s.day]) { byDay[s.day] = []; order.push(s.day); } byDay[s.day].push(s); });
      order.sort();
      var days = [], x = e.date_from; for (var i = 0; x <= e.date_to && i < 150; i++) { days.push(x); var n = dt(x); n.setDate(n.getDate() + 1); x = iso(n); }
      $('view').innerHTML = '<div class="row"><button class="sm" id="bk" type="button">לכל האירועים</button></div>' +
        '<div class="card"><div class="ev"><div><div class="nm">' + esc(e.family) + ' ' + (e.closed ? '<span class="badge cl">סגור</span>' : '<span class="badge">פתוח</span>') + '</div>' +
        '<div class="meta">' + esc(fmtShort(e.date_from)) + ' עד ' + esc(fmtShort(e.date_to)) + (e.address ? ' · ' + esc(e.address) : '') + ' · ' + taken + ' מתוך ' + act + ' תפוסות</div>' +
        (e.notes ? '<div class="meta">הערות: ' + esc(e.notes) + '</div>' : '') + '</div></div>' +
        '<div class="link">דף המשפחה: ' + esc(pubLink(e.slug)) + '</div><div class="link">דף הבית: ' + esc(homeLink()) + '</div>' +
        '<div class="row"><button class="sm mint" id="cg" type="button">העתק הודעה לקבוצה</button><button class="sm" id="cl" type="button">העתק קישור למשפחה</button><button class="sm" id="ch" type="button">העתק קישור לדף הבית</button>' +
        '<a class="sm" href="' + esc(pubLink(e.slug)) + '" target="_blank" rel="noopener">פתיחת דף המשפחה</a><a class="sm" href="yoledet.html" target="_blank" rel="noopener">פתיחת דף הבית</a>' +
        '<button class="sm" id="ed" type="button">עריכת פרטים, תבנית ומה מביאים</button><button class="sm red" id="cs" type="button">' + (e.closed ? 'פתיחה מחדש' : 'סגירת האירוע') + '</button></div></div>' +
        '<div class="card"><h2>הוספת משבצת</h2><div class="row f"><select id="sd">' + days.map(function (dd) { return '<option value="' + dd + '">' + esc(fmtFull(dd)) + '</option>'; }).join('') + '</select>' +
        '<select id="sk">' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '">' + esc(KINDS[k]) + '</option>'; }).join('') + '<option value="custom">שם אחר...</option></select>' +
        '<input id="sl" maxlength="40" placeholder="שם המשבצת" hidden><button class="sm pri" id="sa" type="button">הוספה</button></div></div>' +
        '<div class="card"><h2>המשבצות</h2>' + (order.map(function (dd) {
          return '<div class="dayh">' + esc(fmtFull(dd)) + '</div>' + byDay[dd].map(function (s) { return slotRow(e, s, dd); }).join('');
        }).join('') || '<div class="empty">אין משבצות.</div>') + '</div>';
      $('bk').onclick = showList;
      $('cg').onclick = function () { copy(groupMsg(e)); };
      $('cl').onclick = function () { copy(pubLink(e.slug)); };
      $('ch').onclick = function () { copy(homeLink()); };
      $('ed').onclick = function () { showForm(e); };
      $('sk').onchange = function () { $('sl').hidden = this.value !== 'custom'; };
      $('cs').onclick = function () { call({ action: 'close', id: e.id, closed: !e.closed }).then(function () { showEvent(e.id); }); };
      $('sa').onclick = function () { call({ action: 'slot_add', event_id: e.id, day: $('sd').value, kind: $('sk').value, label: $('sl').value }).then(function (r) { if (r.ok === false) toast('נא למלא שם למשבצת'); showEvent(e.id); }); };
    });
  }

  function editSignup(sid) {
    var s = SL.filter(function (x) { return x.id === sid; })[0], box = document.querySelector('[data-s="' + sid + '"]'); if (!s || !box) return;
    var old = box.querySelector('.editbox'); if (old) { old.remove(); return; }
    var t = s.taken || { name: '', dish: '', phone: '' };
    var div = document.createElement('div'); div.className = 'editbox';
    div.innerHTML = '<div class="grid2"><div class="f"><label>שם</label><input class="en" maxlength="60" value="' + esc(t.name) + '"></div><div class="f"><label>טלפון' + (s.taken ? ' (ריק = בלי שינוי)' : '') + '</label><input class="ep ltr" maxlength="20" placeholder="' + esc(t.phone || '050-1234567') + '"></div></div>' +
      '<div class="f"><label>מה מכינה</label><input class="ed" maxlength="120" value="' + esc(t.dish) + '"></div><div class="msg"></div><div class="row"><button class="sm pri eok" type="button">שמירה</button></div>';
    box.appendChild(div);
    div.querySelector('.eok').onclick = function () {
      call({ action: 'signup_edit', slot_id: sid, name: div.querySelector('.en').value, phone: div.querySelector('.ep').value, dish: div.querySelector('.ed').value }).then(function (r) {
        if (r.ok) { toast('נשמר'); showEvent(EV.id); } else div.querySelector('.msg').textContent = r.error === 'phone' ? 'נא למלא טלפון תקין.' : 'נא למלא שם ומנה.';
      });
    };
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    var g = function (n) { return t.getAttribute(n); };
    if (g('data-open')) showEvent(+g('data-open'));
    else if (g('data-copy')) copy(g('data-copy'));
    else if (g('data-del')) { if (confirm('למחוק את האירוע "' + g('data-nm') + '" וכל ההרשמות שבו? אי אפשר לשחזר.')) call({ action: 'delete_event', id: +g('data-del') }).then(showList); }
    else if (g('data-add')) { var p = g('data-add').split('|'); call({ action: 'slot_add', event_id: EV.id, day: p[0], kind: p[1] }).then(function () { showEvent(EV.id); }); }
    else if (g('data-ren')) {
      var rid = +g('data-ren'), rs = SL.filter(function (x) { return x.id === rid; })[0];
      var nm = prompt('שם חדש למשבצת (ריק = השם הרגיל):', rs && rs.custom ? rs.label : '');
      if (nm !== null) call({ action: 'slot_rename', slot_id: rid, label: nm }).then(function () { showEvent(EV.id); });
    }
    else if (g('data-edit')) editSignup(+g('data-edit'));
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
