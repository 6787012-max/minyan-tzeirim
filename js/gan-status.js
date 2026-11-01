(function () {
  'use strict';
  // דוח מעקב: מי פתח את המכתב בג'ימייל ומי סימן שתזמן. דורש מפתח מנהל בקישור (#k=...).
  var $ = function (id) { return document.getElementById(id); };
  var key = (location.hash.match(/k=([^&]+)/) || [])[1] || '';
  if (!key) { $('err').textContent = 'חסר מפתח בקישור.'; return; }
  var filter = 'all', DATA = null;
  fetch('data/site.json').then(function (r) { return r.json(); }).then(function (d) {
    var api = d.api || {};
    return fetch(api.url + '/functions/v1/gan-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api.anon, 'Authorization': 'Bearer ' + api.anon },
      body: JSON.stringify({ action: 'status', admin: decodeURIComponent(key) })
    }).then(function (r) { return r.json(); });
  }).then(function (d) {
    if (!d.ok) { $('err').textContent = 'המפתח אינו תקין.'; return; }
    DATA = d; render();
  }).catch(function () { $('err').textContent = 'אין חיבור. נסו לרענן.'; });

  function fmt(iso) { var t = new Date(iso); return t.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) + ' ' + t.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); }
  function render() {
    var st = {};
    DATA.events.forEach(function (e) {
      var s = st[e.n] || (st[e.n] = {});
      if (e.stage === 'scheduled') s.done = e.at; else s.opened = e.at;
      if (e.name) s.name = e.name;
    });
    var newBy = {};
    DATA.newcomers.forEach(function (c) { newBy[c.n] = c; });
    var rows = DATA.sched.filter(function (x) { return x.n !== 0 || true; }), done = 0, opened = 0, none = 0;
    var today = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }).replace('.', '/');
    var html = '';
    rows.forEach(function (x) {
      var s = st[x.n] || {}, who = x.parent || (newBy[x.n] && newBy[x.n].name + ' (חדש)') || s.name || '—';
      var state = s.done ? 'done' : (s.opened ? 'opened' : 'none');
      if (state === 'done') done++; else if (state === 'opened') opened++; else none++;
      if (filter !== 'all' && filter !== state) return;
      var label = state === 'done' ? '<span class="ok">✔ תזמן/שלח</span>' : (state === 'opened' ? '<span class="half">פתח, לא אישר</span>' : '<span class="no">עוד לא</span>');
      var isToday = x.when.indexOf(today) >= 0;
      html += '<tr' + (isToday ? ' class="today"' : '') + '><td>' + x.n + '</td><td>' + esc(who) + '</td><td>' + esc(x.when) + '</td><td>' + esc(x.to) +
              '</td><td>' + label + '</td><td>' + (s.done ? fmt(s.done) : (s.opened ? fmt(s.opened) : '')) + '</td></tr>';
    });
    $('rows').innerHTML = html;
    $('sum').innerHTML = '<div><b class="ok">' + done + '</b>תזמנו / שלחו</div><div><b class="half">' + opened + '</b>פתחו ולא אישרו</div><div><b class="no">' + none + '</b>עוד לא נכנסו</div><div><b>' + DATA.newcomers.length + '</b>משתתפים חדשים</div>';
    $('filters').innerHTML = '';
    [['all', 'הכול'], ['none', 'עוד לא'], ['opened', 'פתחו ולא אישרו'], ['done', 'סיימו']].forEach(function (f) {
      var b = document.createElement('button'); b.textContent = f[1]; if (filter === f[0]) b.className = 'on';
      b.onclick = function () { filter = f[0]; render(); }; $('filters').appendChild(b);
    });
    $('newRows').innerHTML = DATA.newcomers.map(function (c) {
      return '<tr><td>' + c.n + '</td><td>' + esc(c.name) + '</td><td>' + esc((c.kids || []).join(', ')) + '</td><td>' + esc((c.gans || []).join(', ')) + '</td><td>' + fmt(c.created_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">אין עדיין</td></tr>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
})();
