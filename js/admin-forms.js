/* admin-forms.js — טפסים דינמיים (מקביל ל"טפסים וחתימות" של בית התלמוד).
 * בונה טופס עם שדות מותאמים, שולח קישור ציבורי (אחד לכולם) או אישי
 * (שורה + טוקן לכל איש קשר), ומציג תשובות. מילוי הטופס עצמו קורה ב-form.html
 * (עמוד ציבורי נפרד, בלי התחברות) — כאן רק צד הניהול.
 *
 * מודל נתונים (minyan.forms / minyan.form_responses, ראו db/05_forms.sql):
 *   forms: { id, title, body, fields:[{key,label,type,options,required}],
 *            is_public, link_token, closed, created_at }
 *   form_responses: { id, form_id, congregant_id, status:'pending'|'signed',
 *                      signer_name, signed_at, token, answers }
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var TYPES = [
    { v: 'text', t: 'שורת טקסט' },
    { v: 'textarea', t: 'פסקה' },
    { v: 'select', t: 'רשימה נפתחת' },
    { v: 'checkbox', t: 'תיבת סימון' },
    { v: 'question', t: 'שאלה פתוחה' },
    { v: 'confirm', t: 'אישור בשם (כמו חתימה)' },
  ];
  var typeLabel = function (v) { var t = TYPES.filter(function (x) { return x.v === v; })[0]; return t ? t.t : v; };

  var state = { forms: [], congregantsCount: null, inited: false };

  function randToken(prefix) {
    var bytes = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(12)) : null;
    var hex = bytes
      ? Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('')
      : (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36));
    return (prefix || '') + hex;
  }

  /* ── טעינה ורשימה ─────────────────────────────────────────────── */
  function loadForms() {
    return window.MTDb('forms?select=id,title,is_public,closed,created_at&order=created_at.desc')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (forms) {
        return window.MTDb('form_responses?select=id,form_id,status')
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (resp) {
            state.forms = forms.map(function (f) {
              var rs = resp.filter(function (r) { return r.form_id === f.id; });
              return Object.assign({}, f, {
                respCount: rs.length,
                signedCount: rs.filter(function (r) { return r.status === 'signed'; }).length,
              });
            });
            renderList();
          });
      })
      .catch(function () { $('#formsEmpty').hidden = false; $('#formsEmpty').textContent = 'שגיאה בטעינת הטפסים.'; });
  }

  function renderList() {
    var empty = $('#formsEmpty'), tbl = $('#formsTable'), rows = $('#formsRows');
    if (!state.forms.length) {
      empty.hidden = false; empty.textContent = 'אין עדיין טפסים — לוחצים "טופס חדש" כדי להתחיל.';
      tbl.hidden = true; rows.innerHTML = ''; return;
    }
    empty.hidden = true; tbl.hidden = false;
    rows.innerHTML = state.forms.map(function (f) {
      var kind = f.is_public ? '🌐 ציבורי' : 'אישי · ' + f.respCount + ' נמענים';
      var count = f.is_public ? (f.respCount + ' מילאו') : (f.signedCount + ' / ' + f.respCount + ' ענו');
      return '<tr>' +
        '<td>' + esc(f.title) + (f.closed ? ' <span class="note" style="display:inline">(סגור)</span>' : '') + '</td>' +
        '<td>' + kind + '</td>' +
        '<td>' + count + '</td>' +
        '<td><button type="button" class="btn btn-s small" data-view="' + f.id + '">פתיחה</button></td>' +
        '</tr>';
    }).join('');
  }

  /* ── בונה השדות ────────────────────────────────────────────────── */
  function fieldRowHTML(fld) {
    fld = fld || { label: '', type: 'text', options: [], required: false };
    var opts = TYPES.map(function (t) { return '<option value="' + t.v + '"' + (t.v === fld.type ? ' selected' : '') + '>' + t.t + '</option>'; }).join('');
    var optsVal = Array.isArray(fld.options) ? fld.options.join(', ') : (fld.options || '');
    var showOpts = fld.type === 'select';
    return '<div class="fb-row" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:8px">' +
      '<input class="inp mb0 fb-label" style="flex:1 1 130px" placeholder="שם השדה *" value="' + esc(fld.label) + '">' +
      '<select class="inp mb0 fb-type" style="flex:0 1 150px">' + opts + '</select>' +
      '<input class="inp mb0 fb-options" style="flex:1 1 150px;' + (showOpts ? '' : 'display:none') + '" placeholder="אפשרויות (מופרד בפסיקים)" value="' + esc(optsVal) + '">' +
      '<label style="flex:0 0 auto;display:flex;align-items:center;gap:4px;margin:0;font-size:13px"><input type="checkbox" class="fb-req"' + (fld.required ? ' checked' : '') + '> חובה</label>' +
      '<button type="button" class="btn btn-x small fb-del">הסרה</button>' +
      '</div>';
  }
  function wireFieldRow(row) {
    var typeSel = row.querySelector('.fb-type'), optInp = row.querySelector('.fb-options');
    typeSel.addEventListener('change', function () { optInp.style.display = typeSel.value === 'select' ? '' : 'none'; });
    row.querySelector('.fb-del').addEventListener('click', function () { row.remove(); });
  }
  function collectFields(host) {
    var out = [];
    Array.prototype.forEach.call(host.querySelectorAll('.fb-row'), function (row, i) {
      var label = row.querySelector('.fb-label').value.trim();
      if (!label) return;
      var type = row.querySelector('.fb-type').value;
      var optRaw = row.querySelector('.fb-options').value.trim();
      var options = type === 'select' ? optRaw.split(/[\n,]/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
      out.push({ key: 'f' + i, label: label, type: type, options: options, required: row.querySelector('.fb-req').checked });
    });
    return out;
  }

  /* ── יצירת טופס ────────────────────────────────────────────────── */
  function openBuildModal() {
    $('#fb_title').value = ''; $('#fb_body').value = ''; $('#fb_scope').value = 'public';
    var host = $('#fb_fields'); host.innerHTML = '';
    var addRow = function (fld) { host.insertAdjacentHTML('beforeend', fieldRowHTML(fld)); wireFieldRow(host.lastElementChild); };
    addRow({ label: 'שם מלא', type: 'confirm', options: [], required: true });
    $('#fb_addField').onclick = function () { addRow(null); };
    $('#formBuildModal').hidden = false;
    setTimeout(function () { $('#fb_title').focus(); }, 50);
  }
  function closeBuildModal() { $('#formBuildModal').hidden = true; }

  function saveNewForm() {
    var title = $('#fb_title').value.trim();
    if (!title) { $('#fb_title').focus(); return; }
    var body = $('#fb_body').value.trim();
    var scope = $('#fb_scope').value;
    var fields = collectFields($('#fb_fields'));
    var saveBtn = $('#fb_save'); saveBtn.disabled = true;

    var row = { title: title, body: body, fields: fields };
    if (scope === 'public') row.link_token = randToken(), row.is_public = true;

    window.MTDb('forms', { method: 'POST', body: JSON.stringify(row), prefer: 'return=representation' })
      .then(function (r) { if (!r.ok) throw new Error('http-' + r.status); return r.json(); })
      .then(function (rows) {
        var form = rows && rows[0];
        if (!form) throw new Error('no-row');
        if (scope === 'public') {
          closeBuildModal();
          return loadForms().then(function () { showLinkModal(location.href.replace(/admin\.html.*$/, '') + 'form.html?g=' + row.link_token); });
        }
        // אישי — שורה + טוקן לכל איש קשר קיים
        return window.MTDb('congregants?select=id').then(function (r) { return r.ok ? r.json() : []; })
          .then(function (congs) {
            if (!congs.length) { alert('אין עדיין אנשי קשר במערכת לשלוח אליהם.'); return; }
            var writes = congs.map(function (c) {
              return { form_id: form.id, congregant_id: c.id, status: 'pending', token: randToken() };
            });
            return window.MTDb('form_responses', { method: 'POST', body: JSON.stringify(writes) }).then(function (r) {
              if (!r.ok) throw new Error('http-' + r.status);
              closeBuildModal();
              return loadForms().then(function () { openResponses(form.id, title); });
            });
          });
      })
      .catch(function () { alert('יצירת הטופס נכשלה.'); })
      .then(function () { saveBtn.disabled = false; });
  }

  /* ── קישור לטופס ציבורי ───────────────────────────────────────── */
  function showLinkModal(url) {
    $('#formLinkUrl').value = url;
    $('#formLinkModal').hidden = false;
  }

  /* ── תשובות + קישורים אישיים ──────────────────────────────────── */
  var curFormId = null;
  function openResponses(formId, title) {
    curFormId = formId;
    $('#formRespTitle').textContent = 'תשובות · ' + title;
    $('#formRespRows').innerHTML = '<tr><td colspan="4">טוען…</td></tr>';
    $('#formRespModal').hidden = false;
    Promise.all([
      window.MTDb('form_responses?form_id=eq.' + formId + '&select=*&order=id').then(function (r) { return r.ok ? r.json() : []; }),
      window.MTDb('congregants?select=id,full_name').then(function (r) { return r.ok ? r.json() : []; }),
    ]).then(function (res) {
      var resp = res[0], congs = res[1];
      var nameOf = function (id) { var c = congs.filter(function (x) { return x.id === id; })[0]; return c ? c.full_name : ''; };
      if (!resp.length) { $('#formRespRows').innerHTML = '<tr><td colspan="4">אין עדיין תשובות.</td></tr>'; return; }
      $('#formRespRows').innerHTML = resp.map(function (r) {
        var ans = r.answers ? Object.keys(r.answers).map(function (k) { return esc(k) + ': ' + esc(r.answers[k]); }).join('<br>') : '';
        var nameCell = r.status === 'signed' ? esc(r.signer_name || '') : esc(nameOf(r.congregant_id) || '(ציבורי)');
        var actionCell = r.status === 'pending'
          ? '<button type="button" class="btn btn-s small" data-copylink="' + esc(r.token) + '">העתקת קישור אישי</button>'
          : ans;
        return '<tr><td>' + nameCell + '</td><td>' + (r.signed_at || '') + '</td>' +
          '<td>' + (r.status === 'signed' ? 'ענה' : 'ממתין') + '</td><td>' + actionCell + '</td></tr>';
      }).join('');
    }).catch(function () { $('#formRespRows').innerHTML = '<tr><td colspan="4">שגיאה בטעינה.</td></tr>'; });
  }
  function closeResponses() { $('#formRespModal').hidden = true; curFormId = null; }

  function deleteCurrentForm() {
    if (!curFormId) return;
    if (!window.confirm('למחוק את הטופס וכל התשובות אליו? אי אפשר לשחזר.')) return;
    window.MTDb('forms?id=eq.' + curFormId, { method: 'DELETE' }).then(function (r) {
      if (!r.ok) throw new Error('http-' + r.status);
      closeResponses();
      loadForms();
    }).catch(function () { alert('מחיקת הטופס נכשלה.'); });
  }

  /* ── חיבור UI ═════════════════════════════════════════════════ */
  function bind() {
    $('#formsNew').addEventListener('click', openBuildModal);
    $('#fb_cancel').addEventListener('click', closeBuildModal);
    $('#fb_save').addEventListener('click', saveNewForm);
    $('#formLinkCopy').addEventListener('click', function () {
      var inp = $('#formLinkUrl'); inp.select();
      try { document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(inp.value).catch(function () {});
    });
    $('#formLinkClose').addEventListener('click', function () { $('#formLinkModal').hidden = true; });
    $('#formRespClose').addEventListener('click', closeResponses);
    $('#formDeleteBtn').addEventListener('click', deleteCurrentForm);
    $('#formsRows').addEventListener('click', function (e) {
      var b = e.target.closest('[data-view]'); if (!b) return;
      var f = state.forms.filter(function (x) { return String(x.id) === b.dataset.view; })[0];
      if (f) openResponses(f.id, f.title);
    });
    $('#formRespRows').addEventListener('click', function (e) {
      var b = e.target.closest('[data-copylink]'); if (!b) return;
      var url = location.href.replace(/admin\.html.*$/, '') + 'form.html?t=' + b.dataset.copylink;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { b.textContent = 'הועתק!'; setTimeout(function () { b.textContent = 'העתקת קישור אישי'; }, 1500); }).catch(function () { prompt('העתק קישור:', url); });
      else prompt('העתק קישור:', url);
    });
  }

  function init() {
    if (state.inited) return;
    state.inited = true;
    bind();
    loadForms();
  }

  function watchPanel() {
    var sec = document.getElementById('formsSec');
    if (!sec) return;
    var mo = new MutationObserver(function () {
      if (!sec.hidden && !state.inited) setTimeout(init, 30);
    });
    mo.observe(sec, { attributes: true, attributeFilter: ['hidden'] });
    if (!sec.hidden) setTimeout(init, 60);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchPanel);
  else watchPanel();
})();
