/* form.js — עמוד ציבורי למילוי טופס (form.html?g=<קישור ציבורי> או ?t=<קישור אישי>).
 * בלי התחברות — קורא ושולח רק דרך שתי זוגות ה-RPC שמוגנות בטוקן בלתי-נחיש
 * (minyan.get_public_form/submit_public_form, minyan.get_signing/submit_signature).
 * ראה db/05_forms.sql וגם js/admin-forms.js (צד הניהול, שבונה את הטפסים). */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var app = $('#app');
  var API = '', ANON = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function loadCfg() {
    return fetch('data/site.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
      .then(function (d) { API = d.api.url; ANON = d.api.anon; });
  }

  function rpc(name, args) {
    return fetch(API + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON, 'Accept-Profile': 'minyan', 'Content-Profile': 'minyan' },
      body: JSON.stringify(args),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); });
  }

  function showMsg(text, cls) {
    app.innerHTML = '<div class="msg ' + (cls || '') + '">' + esc(text) + '</div>';
  }

  function renderForm(mode, token, form) {
    var fields = form.fields || [];
    var html = '<h1>' + esc(form.title) + '</h1>';
    if (form.body) html += '<div class="body">' + esc(form.body) + '</div>';
    if (form.status === 'signed') {
      html += '<div class="msg ok">כבר מילאת את הטופס הזה' +
        (form.signer_name ? (' בשם ' + esc(form.signer_name)) : '') +
        (form.signed_at ? (', בתאריך ' + esc(form.signed_at)) : '') + '.</div>';
      app.innerHTML = html;
      return;
    }
    html += '<form id="dynForm">';
    fields.forEach(function (f, i) {
      var id = 'f_' + i;
      if (f.type === 'checkbox') {
        html += '<label class="fld chk"><input type="checkbox" id="' + id + '"' + (f.required ? ' required' : '') + '><span>' + esc(f.label) + (f.required ? ' *' : '') + '</span></label>';
      } else if (f.type === 'select') {
        html += '<label class="fld"><span>' + esc(f.label) + (f.required ? ' *' : '') + '</span><select id="' + id + '"' + (f.required ? ' required' : '') + '>' +
          '<option value="">בחר…</option>' + (f.options || []).map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') +
          '</select></label>';
      } else if (f.type === 'textarea' || f.type === 'question') {
        html += '<label class="fld"><span>' + esc(f.label) + (f.required ? ' *' : '') + '</span><textarea id="' + id + '" rows="3"' + (f.required ? ' required' : '') + '></textarea></label>';
      } else {
        html += '<label class="fld"><span>' + esc(f.label) + (f.required ? ' *' : '') + '</span><input type="text" id="' + id + '"' + (f.required ? ' required' : '') + '></label>';
      }
    });
    html += '<label class="fld"><span>שם מלא לאישור *</span><input type="text" id="signerName" required></label>';
    html += '<div id="errBox"></div>';
    html += '<button type="submit" class="btn-send">שליחה</button></form>';
    app.innerHTML = html;

    $('#dynForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#signerName').value.trim();
      if (name.length < 2) { $('#errBox').innerHTML = '<div class="msg err">נא להזין שם מלא.</div>'; return; }
      var answers = {};
      fields.forEach(function (f, i) {
        var el = document.getElementById('f_' + i);
        if (!el) return;
        answers[f.label] = f.type === 'checkbox' ? (el.checked ? 'כן' : 'לא') : el.value;
      });
      var btn = $('.btn-send'); btn.disabled = true; btn.textContent = 'שולח…';
      var fn = mode === 'g' ? 'submit_public_form' : 'submit_signature';
      var args = mode === 'g' ? { g_token: token, p_name: name, p_answers: answers } : { p_token: token, p_name: name, p_answers: answers };
      rpc(fn, args).then(function (res) {
        if (res.ok && res.data === true) showMsg('תודה, ' + name + '! הטופס נשלח בהצלחה.', 'ok');
        else showMsg('לא ניתן היה לשלוח את הטופס (ייתכן שכבר מילאת אותו, או שהקישור פג). אפשר לפנות לגבאי.', 'err');
      }).catch(function () {
        $('#errBox').innerHTML = '<div class="msg err">שגיאת רשת — נסה שוב.</div>';
        btn.disabled = false; btn.textContent = 'שליחה';
      });
    });
  }

  function boot() {
    var p = new URLSearchParams(location.search);
    var g = p.get('g'), t = p.get('t');
    if (!g && !t) { showMsg('קישור לא תקין.', 'err'); return; }
    loadCfg().then(function () {
      if (g) {
        return rpc('get_public_form', { g_token: g }).then(function (res) {
          if (!res.ok || !res.data || !res.data.length) { showMsg('הטופס אינו זמין — ייתכן שנסגר או שהקישור שגוי.', 'err'); return; }
          renderForm('g', g, res.data[0]);
        });
      }
      return rpc('get_signing', { p_token: t }).then(function (res) {
        if (!res.ok || !res.data || !res.data.length) { showMsg('הקישור אינו תקין.', 'err'); return; }
        renderForm('t', t, res.data[0]);
      });
    }).catch(function () { showMsg('שגיאה בטעינת הטופס.', 'err'); });
  }
  boot();
})();
