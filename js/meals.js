(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var slug = (new URLSearchParams(location.search).get('e') || '').toLowerCase();
  var api = null, DATA = null, cur = null, picked = null, tmr = null, busy = false;
  var TK = 'meals_tok_' + slug;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tokens() { try { return JSON.parse(localStorage.getItem(TK) || '{}'); } catch (e) { return {}; } }
  function saveTok(id, t) { var o = tokens(); if (t) o[id] = t; else delete o[id]; try { localStorage.setItem(TK, JSON.stringify(o)); } catch (e) { /* */ } }
  function call(body) {
    return fetch(api.url + '/functions/v1/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api.anon, 'Authorization': 'Bearer ' + api.anon },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'net' }; }); });
  }
  function dt(iso) { return new Date(iso + 'T12:00:00'); }
  function fmtFull(iso) { return dt(iso).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fmtShort(iso) { return dt(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function toast(t) { var e = $('toast'); e.textContent = t; e.className = 'toast on'; setTimeout(function () { e.className = 'toast'; }, 3200); }

  function render() {
    var e = DATA.event, tk = tokens(), today = todayIso();
    document.title = 'ארוחות ל' + e.family + ' · מעלה עמוס';
    $('hero').innerHTML = '<div class="hero"><div class="kicker">שיבוץ ארוחות</div><h1>' + esc(e.family) + '</h1>' +
      '<div class="dates">' + esc(fmtShort(e.date_from)) + ' עד ' + esc(fmtShort(e.date_to)) + '</div>' +
      (e.address ? '<div class="addr">' + esc(e.address) + '</div>' : '') +
      (e.notes ? '<div class="note"><b>חשוב לדעת:</b> ' + esc(e.notes) + '</div>' : '') +
      (e.closed ? '<div class="closed-banner">השיבוץ נסגר, תודה לכולן!</div>' : '') + '</div>';
    var byDay = {}, order = [];
    DATA.slots.forEach(function (s) { if (!byDay[s.day]) { byDay[s.day] = []; order.push(s.day); } byDay[s.day].push(s); });
    order.sort();
    if (!order.length) { $('days').innerHTML = '<div class="empty">אין עדיין משבצות.</div>'; return; }
    $('days').innerHTML = order.map(function (d) {
      var w = dt(d).getDay(), past = d < today;
      return '<section class="day' + (w >= 5 ? ' shabbat' : '') + (past ? ' past' : '') + '"><h2>' + esc(fmtFull(d)) + (d === today ? '<small>היום</small>' : '') + '</h2>' +
        byDay[d].map(function (s) {
          if (s.taken) {
            return '<div class="slot taken" data-id="' + s.id + '"><div class="lab">' + esc(s.label) + '</div><div class="who">' + esc(s.taken.name) + '</div>' +
              '<div class="dish">' + esc(s.taken.dish) + '</div><span class="ph">' + esc(s.taken.phone) + '</span>' +
              (tk[s.id] ? '<button class="cancel" data-cancel="' + s.id + '" type="button">ביטול</button>' : '') + '</div>';
          }
          var off = e.closed || past;
          return '<button class="slot free' + (off ? ' off' : '') + '" data-open="' + s.id + '" type="button"' + (off ? ' disabled' : '') + '><span class="lab">' + esc(s.label) + '</span>' +
            (off ? '' : '<span class="go">פנוי, אני לוקחת</span>') + '</button>';
        }).join('') + '</section>';
    }).join('');
  }

  function load(quiet) {
    return call({ action: 'get', slug: slug }).then(function (d) {
      if (!d.ok) { if (!quiet) $('days').innerHTML = '<div class="err">לא מצאנו את הארוחות האלה. כדאי לבדוק את הקישור.</div>'; return; }
      DATA = d; if (!$('bg').classList.contains('on')) render(); else DATA.stale = true;
    }).catch(function () { if (!quiet) $('days').innerHTML = '<div class="err">אין חיבור כרגע. נסו לרענן.</div>'; });
  }

  /* ---------- טופס ---------- */
  function openForm(id) {
    var s = DATA.slots.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    cur = s; picked = null;
    $('fTitle').textContent = s.label + ' · ' + fmtFull(s.day);
    $('fSub').textContent = 'ל' + DATA.event.family;
    $('fName').value = ''; $('fPhone').value = ''; $('fDish').value = ''; $('fMsg').textContent = '';
    $('fPhone').placeholder = '050-1234567'; $('phHint').textContent = 'הטלפון יוצג לכולן בצורה מוסתרת חלקית.';
    $('sug').hidden = true; $('fGo').disabled = false;
    $('bg').classList.add('on'); setTimeout(function () { $('fName').focus(); }, 60);
  }
  function closeForm() { $('bg').classList.remove('on'); cur = null; if (DATA && DATA.stale) { DATA.stale = false; render(); } }

  var sugTimer = null, sugSeq = 0;
  $('fName').addEventListener('input', function () {
    picked = null; $('fPhone').placeholder = '050-1234567'; $('phHint').textContent = 'הטלפון יוצג לכולן בצורה מוסתרת חלקית.';
    var q = this.value.trim(); clearTimeout(sugTimer);
    if (q.length < 2) { $('sug').hidden = true; return; }
    var my = ++sugSeq;
    sugTimer = setTimeout(function () {
      call({ action: 'contacts', q: q }).then(function (d) {
        if (my !== sugSeq || !d.ok || !d.items.length) { if (my === sugSeq) $('sug').hidden = true; return; }
        $('sug').innerHTML = d.items.map(function (c, i) { return '<button type="button" data-i="' + i + '"><span>' + esc(c.name) + '</span><span class="ph">' + esc(c.phone_masked) + '</span></button>'; }).join('');
        $('sug').hidden = false; $('sug')._items = d.items;
      });
    }, 220);
  });
  $('sug').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    var c = $('sug')._items[+b.getAttribute('data-i')]; picked = c;
    $('fName').value = c.name; $('sug').hidden = true;
    $('fPhone').value = ''; $('fPhone').placeholder = 'יושלם אוטומטית (' + c.phone_masked + ')';
    $('phHint').textContent = 'אפשר להשאיר ריק, הטלפון המוכר שלך כבר אצלנו.';
    $('fDish').focus();
  });
  $('fX').onclick = closeForm;
  $('bg').addEventListener('click', function (ev) { if (ev.target === $('bg')) closeForm(); });
  var ERR = { taken: 'מצטערים, מישהי הקדימה אותך ולקחה את המשבצת. בחרי משבצת אחרת.', phone: 'נא למלא טלפון תקין (אפשר להשאיר ריק רק אם בחרת שם מהרשימה).', name: 'נא למלא שם.', dish: 'נא לכתוב מה מכינים.', closed: 'השיבוץ נסגר.', rate: 'נסי שוב בעוד רגע.', net: 'אין חיבור, נסי שוב.' };
  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault(); if (busy || !cur) return;
    busy = true; $('fGo').disabled = true; $('fMsg').textContent = '';
    var slot = cur;
    call({ action: 'sign', slug: slug, slot_id: slot.id, name: $('fName').value, phone: $('fPhone').value, dish: $('fDish').value, contact_id: picked ? picked.id : 0 }).then(function (d) {
      busy = false;
      if (d.ok) { saveTok(slot.id, d.token); closeForm(); toast('תודה רבה! הארוחה שלך נרשמה'); return load(true).then(function () { render(); }); }
      $('fMsg').textContent = ERR[d.error] || 'משהו השתבש, נסי שוב.'; $('fGo').disabled = false;
      if (d.error === 'taken') load(true);
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cur) closeForm(); });

  $('days').addEventListener('click', function (ev) {
    var o = ev.target.closest('[data-open]');
    if (o) { openForm(+o.getAttribute('data-open')); return; }
    var c = ev.target.closest('[data-cancel]');
    if (c) {
      var id = +c.getAttribute('data-cancel');
      if (!confirm('לבטל את ההרשמה שלך למשבצת הזאת?')) return;
      call({ action: 'cancel', slot_id: id, token: tokens()[id] || '' }).then(function (d) {
        if (d.ok) { saveTok(id, null); toast('ההרשמה בוטלה'); } else toast('לא הצלחנו לבטל. אפשר לפנות למארגנת.');
        load(true).then(render);
      });
    }
  });

  if (!slug) { $('days').innerHTML = '<div class="err">חסר קוד אירוע בקישור.</div>'; return; }
  fetch('data/site.json').then(function (r) { return r.json(); }).then(function (d) { api = d.api; return load(false); })
    .then(function () { tmr = setInterval(function () { load(true); }, 25000); })
    .catch(function () { $('days').innerHTML = '<div class="err">אין חיבור. נסו לרענן.</div>'; });
})();
