/* meals-core.js: משותף לדף הבית (yoledet.html) ולדף המשפחה (meals.html): קריאות לשרת, תאריכים, וטופס ההרשמה. */
(function () {
  'use strict';
  var api = null;
  var C = window.MealsCore = {};
  var $ = function (id) { return document.getElementById(id); };
  C.$ = $;
  C.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  C.init = function () { return fetch('data/site.json').then(function (r) { return r.json(); }).then(function (d) { api = d.api; }); };
  C.call = function (body) {
    return fetch(api.url + '/functions/v1/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api.anon, 'Authorization': 'Bearer ' + api.anon },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'net' }; }); });
  };
  C.dt = function (iso) { return new Date(iso + 'T12:00:00'); };
  C.fmtFull = function (iso) { return C.dt(iso).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }); };
  C.fmtShort = function (iso) { return C.dt(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); };
  C.dayName = function (iso) { return C.dt(iso).toLocaleDateString('he-IL', { weekday: 'long' }).replace('יום ', ''); };
  C.dayNum = function (iso) { return C.dt(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); };
  C.localToday = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  C.toast = function (t) { var e = $('toast'); e.textContent = t; e.className = 'toast on'; setTimeout(function () { e.className = 'toast'; }, 3200); };

  /* ---------- טוקנים לביטול עצמי (לפי אירוע) ---------- */
  C.tokens = function (slug) { try { return JSON.parse(localStorage.getItem('meals_tok_' + slug) || '{}'); } catch (e) { return {}; } };
  C.saveTok = function (slug, id, t) { var o = C.tokens(slug); if (t) o[id] = t; else delete o[id]; try { localStorage.setItem('meals_tok_' + slug, JSON.stringify(o)); } catch (e) { /* */ } };

  /* ---------- טופס הרשמה (נבנה בדף) ---------- */
  var HTML = '<form class="sheet" id="form" autocomplete="off">' +
    '<h3 id="fTitle"></h3><div class="sub" id="fSub"></div><div class="bringbox" id="fBring" hidden></div>' +
    '<div class="f"><label for="fName">השם שלך</label><input id="fName" maxlength="60" placeholder="מתחילות להקליד, ונציע שם מוכר" required><div class="sug" id="sug" hidden></div></div>' +
    '<div class="f"><label for="fPhone">טלפון</label><input id="fPhone" class="ltr" type="tel" inputmode="tel" maxlength="20" placeholder="050-1234567"><div class="hintline" id="phHint"></div></div>' +
    '<div class="f"><label for="fDish">מה מפנקות?</label><input id="fDish" maxlength="120" placeholder="למשל: מרק עוף, אורז וקוגל" required></div>' +
    '<div class="msg" id="fMsg"></div>' +
    '<div class="btnrow"><button class="btn" id="fGo" type="submit">אני מפנקת!</button><button class="btn ghost" id="fX" type="button">סגירה</button></div></form>';
  var HINT = 'הטלפון יוצג לכולן בצורה מוסתרת חלקית.';
  var ERR = { taken: 'וואו, מישהי הקדימה אותך ופינקה בדיוק את הארוחה הזאת. אפשר לבחור ארוחה אחרת שמחכה לפינוק.', phone: 'נא למלא טלפון תקין (אפשר להשאיר ריק רק אם בחרת שם מהרשימה).', name: 'נא למלא שם.', dish: 'נא לכתוב במה מפנקים.', closed: 'הפינוקים כבר הושלמו, תודה!', rate: 'עוד רגע ננסה שוב, נסי בעוד דקה.', net: 'אין חיבור כרגע, נסי שוב.' };
  var cur = null, picked = null, busy = false, sugTimer = null, sugSeq = 0, built = false;

  function build() {
    if (built) return; built = true;
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'bg'; bg.innerHTML = HTML; document.body.appendChild(bg);
    var inf = document.createElement('div'); inf.className = 'sheet-bg'; inf.id = 'infoBg'; inf.innerHTML = '<div class="sheet" id="info"></div>'; document.body.appendChild(inf);
    $('fName').addEventListener('input', function () {
      picked = null; $('fPhone').placeholder = '050-1234567'; $('phHint').textContent = HINT;
      var q = this.value.trim(); clearTimeout(sugTimer);
      if (q.length < 2) { $('sug').hidden = true; return; }
      var my = ++sugSeq;
      sugTimer = setTimeout(function () {
        C.call({ action: 'contacts', q: q }).then(function (d) {
          if (my !== sugSeq || !d.ok || !d.items.length) { if (my === sugSeq) $('sug').hidden = true; return; }
          $('sug').innerHTML = d.items.map(function (c, i) { return '<button type="button" data-i="' + i + '"><span>' + C.esc(c.name) + '</span><span class="ph">' + C.esc(c.phone_masked) + '</span></button>'; }).join('');
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
    $('fX').onclick = C.closeSign;
    bg.addEventListener('click', function (ev) { if (ev.target === bg) C.closeSign(); });
    inf.addEventListener('click', function (ev) { if (ev.target === inf) C.closeInfo(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (cur) C.closeSign(); else C.closeInfo(); } });
    $('form').addEventListener('submit', function (ev) {
      ev.preventDefault(); if (busy || !cur) return;
      busy = true; $('fGo').disabled = true; $('fMsg').textContent = '';
      var c = cur;
      C.call({ action: 'sign', slug: c.slug, slot_id: c.slot_id, name: $('fName').value, phone: $('fPhone').value, dish: $('fDish').value, contact_id: picked ? picked.id : 0 }).then(function (d) {
        busy = false;
        if (d.ok) { C.saveTok(c.slug, c.slot_id, d.token); C.closeSign(true); C.toast('איזה כיף! הארוחה שלך תשמח מאוד'); if (c.onDone) c.onDone(true); return; }
        $('fMsg').textContent = ERR[d.error] || 'משהו השתבש, נסי שוב.'; $('fGo').disabled = false;
        if (d.error === 'taken' && c.onDone) c.onDone(false);
      });
    });
  }

  /* o = { slug, slot_id, title, sub, bring, onDone(changed) } */
  C.openSign = function (o) {
    build(); cur = o; picked = null;
    $('fTitle').textContent = o.title; $('fSub').textContent = o.sub || '';
    if (o.bring) { $('fBring').hidden = false; $('fBring').innerHTML = '<b>מה כיף להביא?</b> ' + C.esc(o.bring); } else $('fBring').hidden = true;
    $('fName').value = ''; $('fPhone').value = ''; $('fDish').value = ''; $('fMsg').textContent = '';
    $('fPhone').placeholder = '050-1234567'; $('phHint').textContent = HINT;
    $('sug').hidden = true; $('fGo').disabled = false;
    $('bg').classList.add('on'); setTimeout(function () { $('fName').focus(); }, 60);
  };
  C.closeSign = function (done) { if (!built) return; $('bg').classList.remove('on'); var c = cur; cur = null; if (!done && c && c.onClose) c.onClose(); };
  C.openInfo = function (html) { build(); $('info').innerHTML = html; $('infoBg').classList.add('on'); };
  C.closeInfo = function () { if (!built) return; $('infoBg').classList.remove('on'); if (C.onInfoClose) C.onInfoClose(); };
  C.isSignOpen = function () { return !!cur; };
})();
