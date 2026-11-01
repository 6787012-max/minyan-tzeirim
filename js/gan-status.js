(function () {
  'use strict';
  // דוח מעקב: מי פתח את המכתב בג'ימייל ומי סימן שתזמן. דורש מפתח מנהל בקישור (#k=...).
  // לחיצה על שורה: המכתב שהוכן (עריכה ושמירה), מה נשלח בפועל, ומייל ההורה.
  var $ = function (id) { return document.getElementById(id); };
  var key = decodeURIComponent((location.hash.match(/k=([^&]+)/) || [])[1] || '');
  if (!key) { $('err').textContent = 'חסר מפתח בקישור.'; return; }
  var filter = 'all', DATA = null, LET = {}, api = null;

  function call(body) {
    body.admin = key;
    return fetch(api.url + '/functions/v1/gan-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api.anon, 'Authorization': 'Bearer ' + api.anon },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }
  function reload() {
    return call({ action: 'status' }).then(function (d) {
      if (!d.ok) { $('err').textContent = 'המפתח אינו תקין.'; return; }
      DATA = d; render();
    });
  }
  Promise.all([
    fetch('data/site.json').then(function (r) { return r.json(); }).then(function (d) { api = d.api || {}; }),
    fetch('data/gan-letters.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (a) { a.forEach(function (x) { LET[x.n] = x; }); })
  ]).then(reload).catch(function () { $('err').textContent = 'אין חיבור. נסו לרענן.'; });

  function fmt(iso) { var t = new Date(iso); return t.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) + ' ' + t.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function stateOf() {
    var st = {};
    DATA.events.forEach(function (e) {
      var s = st[e.n] || (st[e.n] = { sent: [] });
      if (e.stage === 'scheduled') s.done = e.at; else s.opened = e.at;
      if (e.name) s.name = e.name;
      if (e.login) s.login = e.login;
      if (e.body) s.sent.push(e);
    });
    return st;
  }
  function render() {
    var st = stateOf(), newBy = {}, logins = {};
    DATA.newcomers.forEach(function (c) { newBy[c.n] = c; });
    (DATA.claims || []).forEach(function (c) { if (c.login) (logins[c.n] = logins[c.n] || []).indexOf(c.login) < 0 && logins[c.n].push(c.login); });
    var ovBy = {}; (DATA.overrides || []).forEach(function (o) { ovBy[o.n] = o; });
    var done = 0, opened = 0, none = 0, html = '';
    var today = new Date(), dd = ('0' + today.getDate()).slice(-2) + '/' + ('0' + (today.getMonth() + 1)).slice(-2);
    DATA.sched.forEach(function (x) {
      var s = st[x.n] || {}, who = x.parent || (newBy[x.n] && newBy[x.n].name + ' (חדש)') || s.name || '—';
      var state = s.done ? 'done' : (s.opened ? 'opened' : 'none');
      if (state === 'done') done++; else if (state === 'opened') opened++; else none++;
      if (filter !== 'all' && filter !== state) return;
      var label = state === 'done' ? '<span class="ok">✔ תזמן/שלח</span>' : (state === 'opened' ? '<span class="half">פתח, לא אישר</span>' : '<span class="no">עוד לא</span>');
      var mail = s.login || (logins[x.n] || []).join(', ');
      html += '<tr data-n="' + x.n + '"' + (x.when.indexOf(dd) >= 0 ? ' class="today"' : '') + '><td>' + x.n + '</td><td>' + esc(who) +
              (ovBy[x.n] ? ' <small class="ed">✎ נערך</small>' : '') + '</td><td>' + esc(x.when) + '</td><td>' + esc(x.to) +
              '</td><td>' + label + '</td><td class="ml">' + esc(mail) + '</td><td>' + (s.done ? fmt(s.done) : (s.opened ? fmt(s.opened) : '')) + '</td></tr>';
    });
    $('rows').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr'), function (tr) { tr.onclick = function () { panel(+tr.getAttribute('data-n')); }; });
    $('sum').innerHTML = '<div><b class="ok">' + done + '</b>תזמנו / שלחו</div><div><b class="half">' + opened + '</b>פתחו ולא אישרו</div><div><b class="no">' + none + '</b>עוד לא נכנסו</div><div><b>' + DATA.newcomers.length + '</b>משתתפים חדשים</div>';
    $('filters').innerHTML = '';
    [['all', 'הכול'], ['none', 'עוד לא'], ['opened', 'פתחו ולא אישרו'], ['done', 'סיימו']].forEach(function (f) {
      var b = document.createElement('button'); b.textContent = f[1]; if (filter === f[0]) b.className = 'on';
      b.onclick = function () { filter = f[0]; render(); }; $('filters').appendChild(b);
    });
    $('newRows').innerHTML = DATA.newcomers.map(function (c) {
      return '<tr><td>' + c.n + '</td><td>' + esc(c.name) + '</td><td>' + esc((c.kids || []).join(', ')) + '</td><td>' + esc((c.gans || []).join(', ')) + '</td><td class="ml">' + esc(c.login || '') + '</td><td>' + fmt(c.created_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="6">אין עדיין</td></tr>';
  }

  // ---------- חלון פרטי הורה ----------
  function rawOf(L) { return L.parts.map(function (p) { return p.t !== undefined ? p.t : '[[' + p.f + ']]'; }).join(''); }
  function panel(n) {
    var L = LET[n], x = DATA.sched.filter(function (s) { return s.n === n; })[0];
    if (!L || !x) return;
    var st = stateOf()[n] || { sent: [] }, ov = (DATA.overrides || []).filter(function (o) { return o.n === n; })[0];
    var logins = (DATA.claims || []).filter(function (c) { return c.n === n && c.login; }).map(function (c) { return c.login; });
    if (st.login && logins.indexOf(st.login) < 0) logins.push(st.login);
    $('pTitle').textContent = 'מכתב ' + n + ' – ' + (x.parent || st.name || 'פנוי');
    $('pInfo').innerHTML = '<b>מתי:</b> ' + esc(x.when) + ' · <b>אל:</b> ' + esc(x.to) + ' (' + esc(L.addr || 'אין כתובת') + ')<br><b>מייל ההורה:</b> ' +
      (logins.length ? '<span class="ml">' + esc(logins.join(', ')) + '</span>' : 'עוד לא נכנס עם מייל');
    $('pSubj').value = ov && ov.subject ? ov.subject : L.subject;
    $('pBody').value = ov ? ov.body : rawOf(L);
    $('pState').textContent = ov ? 'נוסח ערוך (עודכן ' + fmt(ov.updated_at) + ')' : 'נוסח מקורי';
    $('pReset').hidden = !ov;
    $('pMsg').textContent = '';
    var last = st.sent.length ? st.sent[st.sent.length - 1] : null;
    $('pSent').innerHTML = last
      ? '<div class="when">נשמר ' + fmt(last.at) + (last.login ? ' · מהמייל ' + esc(last.login) : '') + '</div><div class="subj">' + esc(last.subject || '') + '</div><div class="body">' + esc(last.body) + '</div>'
      : '<div class="none">עוד לא נשלח. כאן יופיע הנוסח המדויק שההורה העביר לג\'ימייל.</div>';
    $('pSave').onclick = function () {
      $('pMsg').textContent = 'שומר…';
      call({ action: 'save', n: n, subject: $('pSubj').value, body: $('pBody').value }).then(function (d) {
        if (!d.ok) { $('pMsg').textContent = d.error === 'short' ? 'המכתב קצר מדי.' : 'השמירה נכשלה.'; return; }
        $('pMsg').textContent = '✔ נשמר. ההורה יראה את הנוסח החדש.'; reload().then(function () { panel(n); });
      });
    };
    $('pReset').onclick = function () {
      if (!confirm('לחזור לנוסח המקורי של מכתב ' + n + '?')) return;
      call({ action: 'save', n: n, reset: true }).then(function () { reload().then(function () { panel(n); }); });
    };
    $('panel').classList.add('on');
  }
  $('pClose').onclick = function () { $('panel').classList.remove('on'); };
})();
