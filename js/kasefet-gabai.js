/* kasefet-gabai.js — דף הגבאים לכספת. הקוד נשמר ב-sessionStorage בלבד (נמחק בסגירת הלשונית).
   כל קריאה עוברת RPC של kasefet_admin_* ונבדקת בצד השרת. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'kf-gabai-code';
  var API = null, ROWS = [], CODE = '';
  var ERR = { locked: 'הכניסה נעולה זמנית (15 דקות) אחרי ניסיונות שגויים',
              bad_code: 'קוד שגוי, נא לנסות שוב', not_found: 'הרשומה לא נמצאה' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL'); }
  function msg(t, cls) { var m = $('gbMsg'); m.className = 'gb-msg ' + (cls || ''); m.textContent = t || ''; }

  function loadApi() {
    if (API) return Promise.resolve(API);
    return fetch('data/site.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
      .then(function (d) { API = d.api; return API; });
  }
  function rpc(name, body) {
    return loadApi().then(function (a) {
      return fetch(a.url + '/rest/v1/rpc/' + name, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'apikey': a.anon, 'Authorization': 'Bearer ' + a.anon,
                   'Accept-Profile': 'minyan', 'Content-Profile': 'minyan' },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.text().then(function (t) {
          var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
          if (!r.ok) throw new Error((d && d.message) || 'שגיאה בשרת');
          return d;
        });
      });
    });
  }
  function fail(d) {
    if (d && d.ok === false) return ERR[d.error] || 'שגיאה';
    return '';
  }

  function summary() {
    var pledged = 0, paid = 0;
    ROWS.forEach(function (r) { pledged += Number(r.amount) || 0; paid += Number(r.paid_amount) || 0; });
    $('gbPledged').textContent = money(pledged);
    $('gbPaid').textContent = money(paid);
    $('gbMissing').textContent = money(Math.max(0, pledged - paid));
  }

  function draw() {
    summary();
    var tb = $('gbRows');
    if (!ROWS.length) { tb.innerHTML = '<tr><td colspan="7">אין רשומות עדיין</td></tr>'; return; }
    tb.innerHTML = ROWS.map(function (r) {
      var paid = Number(r.paid_amount) || 0;
      var src = r.source === 'shabbat' ? 'התחייבתי בשבת' : 'מצטרף עכשיו';
      return '<tr data-id="' + r.id + '">' +
        '<td data-l="שם">' + esc(r.name) + (r.show_name ? '' : ' <small>(מוסתר)</small>') + '<span class="src">' + src + '</span></td>' +
        '<td data-l="טלפון">' + esc(r.phone || '') + '</td>' +
        '<td data-l="התחייבות">' + money(r.amount) + '</td>' +
        '<td data-l="אופן">' + (r.method === 'cash' ? 'מזומן' : 'נדרים פלוס') + '</td>' +
        '<td data-l="שולם">' +
          '<input type="number" min="0" max="100000" step="1" value="' + paid + '" class="gb-paid" aria-label="סכום ששולם">' +
          (paid > 0 ? '<span class="paid-yes">' + (r.paid_by ? esc(r.paid_by) : 'שולם') + '</span>' : '<span class="paid-no">לא</span>') +
        '</td>' +
        '<td data-l="הערה"><input type="text" maxlength="300" value="' + esc(r.note || '') + '" class="gb-note" aria-label="הערה"></td>' +
        '<td data-l="פעולות">' +
          '<button type="button" class="p" data-a="save">שמירה</button>' +
          '<button type="button" data-a="full">שולם במלואו</button>' +
          '<button type="button" data-a="edit">תיקון</button>' +
          '<button type="button" data-a="del">מחיקה</button>' +
        '</td></tr>';
    }).join('');
  }

  function load() {
    return rpc('kasefet_admin_list', { p_code: CODE }).then(function (d) {
      var e = fail(d);
      if (e) throw new Error(e);
      ROWS = d.rows || [];
      $('gbWho').textContent = 'מחובר/ת: ' + (d.gabai || '');
      draw();
      $('gbLogin').hidden = true; $('gbApp').hidden = false;
    });
  }

  function clearForm() {
    var f = $('gbForm'); f.reset(); f.id.value = '';
  }

  function fillForm(r) {
    var f = $('gbForm');
    f.id.value = r.id; f.name.value = r.name || ''; f.phone.value = r.phone || '';
    f.amount.value = r.amount; f.method.value = r.method; f.source.value = r.source;
    f.show.value = r.show_name ? '1' : '0';
    window.scrollTo(0, 0);
    f.name.focus();
  }

  function paid(id, amount, note) {
    return rpc('kasefet_mark_paid', { p_code: CODE, p_id: id, p_paid_amount: amount, p_note: note })
      .then(function (d) {
        var e = fail(d); if (e) throw new Error(e);
        msg('נשמר', 'ok');
        return load();
      }).catch(function (e) { msg(e.message, 'err'); });
  }

  $('gbLoginForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var code = $('gbCode').value.trim();
    $('gbLoginMsg').textContent = '';
    CODE = code;
    load().then(function () {
      try { sessionStorage.setItem(KEY, code); } catch (e) { /* פרטי גלישה */ }
      $('gbCode').value = '';
    }).catch(function (e) {
      CODE = '';
      $('gbCode').value = '';
      $('gbLoginMsg').textContent = e.message;
      $('gbCode').focus();
    });
  });

  $('gbRows').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-a]');
    if (!b) return;
    var tr = b.closest('tr'), id = Number(tr.getAttribute('data-id'));
    var r = ROWS.filter(function (x) { return Number(x.id) === id; })[0];
    if (!r) return;
    var a = b.getAttribute('data-a');
    if (a === 'edit') { fillForm(r); return; }
    if (a === 'full') { paid(id, Number(r.amount), r.note || ''); return; }
    if (a === 'save') {
      var amt = parseInt(tr.querySelector('.gb-paid').value, 10);
      var note = tr.querySelector('.gb-note').value;
      if (isNaN(amt) || amt < 0) { msg('סכום לא תקין', 'err'); return; }
      paid(id, amt, note); return;
    }
    if (a === 'del') {
      if (!window.confirm('למחוק את ההתחייבות של ' + r.name + '?')) return;
      rpc('kasefet_admin_delete', { p_code: CODE, p_id: id }).then(function (d) {
        var e = fail(d); if (e) throw new Error(e);
        msg('נמחק', 'ok'); return load();
      }).catch(function (e) { msg(e.message, 'err'); });
    }
  });

  $('gbForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = $('gbForm');
    var body = {
      p_code: CODE, p_id: f.id.value ? Number(f.id.value) : null,
      p_name: f.name.value, p_phone: f.phone.value, p_amount: parseInt(f.amount.value, 10),
      p_method: f.method.value, p_show_name: f.show.value === '1', p_source: f.source.value
    };
    rpc('kasefet_admin_save', body).then(function (d) {
      var e = fail(d); if (e) throw new Error(e);
      msg('נשמר', 'ok'); clearForm(); return load();
    }).catch(function (e) { msg(e.message, 'err'); });
  });

  $('gbReset').addEventListener('click', clearForm);
  $('gbNew').addEventListener('click', function () { clearForm(); window.scrollTo(0, 0); $('gbForm').name.focus(); });

  var saved = '';
  try { saved = sessionStorage.getItem(KEY) || ''; } catch (e) { saved = ''; }
  if (saved) {
    CODE = saved;
    load().catch(function () { CODE = ''; try { sessionStorage.removeItem(KEY); } catch (e) { /* */ } });
  }
})();
