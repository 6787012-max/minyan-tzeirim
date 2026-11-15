/* kasefet.js — כספת לארון הקודש. שני מצבים לפי מה שקיים בדף:
   #kfHome  = כרטיס קומפקטי בדף הבית (נשלט מ-config.kasefet.show).
   #kfPage  = דף המלא kasefet.html (לשוניות: מצב, הצטרפות, תשלום, עדכון אישי).
   כל הנתונים מגיעים מ-RPC ציבורי בלבד (kasefet_public / kasefet_pledge / kasefet_get / kasefet_update).
   אין כאן טלפונים, טוקנים או סכומים אישיים של אחרים. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var API = null, CFG = null, TIMER = null, LAST = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shekel(n) { return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL'); }
  function pct(part, whole) { return whole > 0 ? Math.min(100, Math.round(part / whole * 100)) : 0; }

  function loadApi() {
    if (API) return Promise.resolve(API);
    return fetch('data/site.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
      .then(function (d) { API = d.api; return API; });
  }
  function loadCfg() {
    if (CFG) return Promise.resolve(CFG);
    return fetch('data/config.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
      .then(function (c) { CFG = c; return c; });
  }
  function rpc(name, body) {
    return loadApi().then(function (a) {
      return fetch(a.url + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': a.anon, 'Authorization': 'Bearer ' + a.anon,
                   'Accept-Profile': 'minyan', 'Content-Profile': 'minyan' },
        body: JSON.stringify(body || {})
      }).then(function (r) {
        return r.text().then(function (t) {
          var data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
          if (!r.ok) {
            var msg = (data && data.message) || 'אירעה שגיאה, נסו שוב';
            throw new Error(msg);
          }
          return data;
        });
      });
    });
  }

  /* כספת SVG: גוף כספת, חלל שמתמלא לפי היחס, ומטבעות שנופלים. בלי דמויות. */
  function vaultSVG() {
    return '<svg class="kf-vault" viewBox="0 0 200 200" role="img" aria-label="כספת שמתמלאת">' +
      '<rect x="18" y="34" width="164" height="146" rx="12" fill="#1B3053" stroke="#B08D3E" stroke-width="4"/>' +
      '<rect x="32" y="48" width="136" height="118" rx="6" fill="#0C1828"/>' +
      '<rect class="kf-fill" x="32" y="48" width="136" height="118" rx="6" fill="#B08D3E" opacity=".9"/>' +
      '<circle class="kf-coin" cx="70" cy="128" r="9" fill="#EBDCB6" stroke="#8A6D2A" style="animation-delay:.1s"/>' +
      '<circle class="kf-coin" cx="100" cy="120" r="9" fill="#EBDCB6" stroke="#8A6D2A" style="animation-delay:.35s"/>' +
      '<circle class="kf-coin" cx="130" cy="130" r="9" fill="#EBDCB6" stroke="#8A6D2A" style="animation-delay:.6s"/>' +
      '<circle cx="152" cy="108" r="11" fill="#D9BE7C" stroke="#12233F" stroke-width="3"/>' +
      '<rect x="40" y="172" width="120" height="6" rx="3" fill="#B08D3E" opacity=".6"/>' +
      '</svg>';
  }

  function setVault(el, paid, goal, animate) {
    if (!el) return;
    var svg = el.querySelector('.kf-fill');
    if (!svg) { el.innerHTML = vaultSVG(); svg = el.querySelector('.kf-fill'); }
    var ratio = Math.max(0.02, Math.min(1, (goal ? paid / goal : 0)));
    svg.style.transform = 'scaleY(' + ratio + ')';
    if (animate && !REDUCED) {
      el.classList.remove('kf-drop'); void el.offsetWidth; el.classList.add('kf-drop');
    }
  }

  function bump(n) {
    if (!n || REDUCED) return;
    n.classList.remove('kf-bump'); void n.offsetWidth; n.classList.add('kf-bump');
  }

  /* ── מצב המגבית ──────────────────────────────────────────────── */
  function render(d, root) {
    var goal = Number(d.goal) || 10000, pledged = Number(d.pledged) || 0, paid = Number(d.paid) || 0;
    var partners = Number(d.partners) || 0;
    var prev = LAST; LAST = d;
    var grew = prev && partners > (Number(prev.partners) || 0);

    /* הכספת והפס הראשי = שולם בפועל. הפס השני = מה שסומן (התחייבות שנרשמה). */
    var fillPl = root.querySelector('[data-kf="barPledged"]');
    var fillPd = root.querySelector('[data-kf="barPaid"]');
    if (fillPl) fillPl.style.width = pct(pledged, goal) + '%';
    if (fillPd) fillPd.style.width = pct(paid, goal) + '%';

    setTxt(root, 'paid', shekel(paid));
    setTxt(root, 'pledged', shekel(pledged));
    setTxt(root, 'partners', String(partners));
    setTxt(root, 'leftPay', shekel(Math.max(0, goal - paid)));
    setTxt(root, 'leftMark', shekel(Math.max(0, goal - pledged)));
    setTxt(root, 'pct', pct(paid, goal) + '%');
    setTxt(root, 'goal', shekel(goal));

    var vault = root.querySelector('[data-kf="vault"]');
    setVault(vault, paid, goal, grew);

    var list = root.querySelector('[data-kf="people"]');
    if (list) {
      var people = d.people || [];
      if (!people.length) {
        list.innerHTML = '<li class="kf-empty" style="grid-column:1/-1;justify-content:center;color:var(--muted)">היו הראשונים לסמן את עצמכם.</li>';
      } else {
        list.innerHTML = people.map(function (p, i) {
          var isNew = grew && i === people.length - 1;
          return '<li class="' + (p.paid ? 'kf-paid' : '') + (isNew ? ' kf-new' : '') + '"><span>' + esc(p.name) + '</span></li>';
        }).join('');
      }
    }
    if (grew) {
      ['partners', 'pledged', 'leftPay', 'paid'].forEach(function (k) {
        var n = root.querySelector('[data-kf="' + k + '"]');
        if (n && n.parentNode) bump(n.parentNode);
      });
    }
  }

  function setTxt(root, key, val) {
    var n = root.querySelector('[data-kf="' + key + '"]');
    if (n) n.textContent = val;
  }

  function loadStatus(root) {
    return rpc('kasefet_public').then(function (d) { render(d, root); return d; })
      .catch(function () {
        var note = root.querySelector('[data-kf="err"]');
        if (note) { note.textContent = 'לא הצלחנו לטעון את המצב כרגע. ננסה שוב בעוד רגע.'; note.hidden = false; }
      });
  }

  /* ── דף הבית ─────────────────────────────────────────────────── */
  function initHome() {
    var home = $('kfHome');
    loadCfg().then(function (c) {
      var k = c.kasefet || {};
      if (k.show === false) return;
      home.hidden = false;
      var vault = home.querySelector('[data-kf="vault"]');
      if (vault) vault.innerHTML = vaultSVG();
      loadStatus(home);
      TIMER = setInterval(function () { loadStatus(home); }, 20000);
    }).catch(function () { /* לא מציגים כלום אם הקונפיגורציה לא נטענה */ });
  }

  /* ── דף מלא ──────────────────────────────────────────────────── */
  var TOKEN_KEY = 'kf-token';

  function readTok() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function saveTok(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* פרטי גלישה */ } }

  function selectTab(id) {
    document.querySelectorAll('.kf-tab').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === id ? 'true' : 'false');
    });
    document.querySelectorAll('.kf-panel').forEach(function (p) {
      p.hidden = p.id !== 'panel-' + id;
    });
    if (history.replaceState) history.replaceState(null, '', location.pathname + (id === 'edit' ? location.search : '') + '#' + id);
  }

  function formValues(f) {
    return {
      name: f.name.value, phone: f.phone.value, amount: parseInt(f.amount.value, 10),
      method: f.querySelector('input[name=method]:checked').value,
      show: f.querySelector('input[name=show]').checked
    };
  }

  function nedarimUrl(amount) {
    var base = 'https://www.matara.pro/nedarimplus/online/?mosad=' + encodeURIComponent(CFG.nedarim.mosad);
    base += '&Groupe=' + encodeURIComponent('כספת לארון הקודש');
    if (amount) base += '&Amount=' + encodeURIComponent(amount) + '&AmountLock=1';
    return base;
  }

  function initPage() {
    var page = $('kfPage');
    var params = new URLSearchParams(location.search);
    var token = params.get('t') || '';

    var pageRoot = page;
    loadStatus(pageRoot);
    TIMER = setInterval(function () { loadStatus(pageRoot); }, 20000);
    loadCfg().then(function () {
      var np = $('kfNedarim');
      if (np) np.href = nedarimUrl(0);
      if (token) loadEdit();
    });

    document.querySelectorAll('.kf-tab').forEach(function (b) {
      b.addEventListener('click', function () { selectTab(b.getAttribute('data-tab')); });
    });

    var joinF = $('kfJoin');
    var mine = readTok();
    if (token) {
      var editTab = document.querySelector('.kf-tab[data-tab="edit"]');
      if (editTab) editTab.hidden = false;
    }
    if (mine && !token) {
      $('kfMineBox').hidden = false;
      $('kfMineBtn').addEventListener('click', function () {
        location.href = 'kasefet.html?t=' + encodeURIComponent(mine) + '#edit';
      });
    }

    joinF.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = formValues(joinF), msg = $('kfJoinMsg'), btn = joinF.querySelector('button[type=submit]');
      var src = joinF.querySelector('input[name=source]:checked').value;
      msg.className = 'kf-msg'; msg.textContent = '';
      if (!v.amount) { msg.className = 'kf-msg err'; msg.textContent = 'נא להזין סכום'; return; }
      btn.disabled = true;
      rpc('kasefet_pledge', {
        p_name: v.name, p_phone: v.phone, p_amount: v.amount, p_method: v.method,
        p_show_name: v.show, p_source: src
      }).then(function (tok) {
        saveTok(tok);
        var link = location.origin + location.pathname.replace(/[^/]*$/, '') + 'kasefet.html?t=' + tok + '#edit';
        $('kfThanksLink').textContent = link;
        $('kfThanks').hidden = false;
        joinF.reset(); joinF.amount.value = '';
        loadStatus(pageRoot);
        btn.disabled = false;
        $('kfThanks').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      }).catch(function (e) {
        msg.className = 'kf-msg err'; msg.textContent = e.message; btn.disabled = false;
      });
    });

    var copy = $('kfCopy');
    if (copy) copy.addEventListener('click', function () {
      var txt = $('kfThanksLink').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { copy.textContent = 'הועתק'; }, function () {});
    });

    var editF = $('kfEdit');
    if (token) selectTab('edit');
    else {
      var hash = (location.hash || '').replace('#', '');
      if (hash === 'join' || hash === 'pay' || hash === 'status') selectTab(hash);
    }

    function loadEdit() {
      rpc('kasefet_get', { p_token: token }).then(function (r) {
        if (!r) throw new Error('הקישור לא נמצא, ייתכן שהוא ישן');
        editF.name.value = r.name || ''; editF.phone.value = r.phone || '';
        editF.amount.value = r.amount; editF.show.checked = !!r.show_name;
        editF.querySelectorAll('input[name=method]').forEach(function (x) { x.checked = x.value === r.method; });
        $('kfPaidInfo').textContent = r.paid_amount > 0
          ? 'נרשם אצלנו ששולמו ' + shekel(r.paid_amount) + '. תודה רבה!'
          : 'עדיין לא נרשם תשלום. אפשר לשלם במזומן לגבאי או דרך נדרים פלוס.';
        $('kfNedarim').href = nedarimUrl(r.amount);
        $('kfEditBox').hidden = false;
        $('kfEditIntro').textContent = 'שלום ' + (r.name || '') + ', כאן אפשר לעדכן את ההתחייבות שלך.';
      }).catch(function (e) {
        var m = $('kfEditMsg'); m.className = 'kf-msg err'; m.textContent = e.message;
      });
    }

    editF.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = formValues(editF), msg = $('kfEditMsg'), btn = editF.querySelector('button[type=submit]');
      msg.className = 'kf-msg'; msg.textContent = '';
      btn.disabled = true;
      rpc('kasefet_update', {
        p_token: token, p_name: v.name, p_phone: v.phone, p_amount: v.amount,
        p_method: v.method, p_show_name: v.show
      }).then(function () {
        msg.className = 'kf-msg ok'; msg.textContent = 'נשמר. תודה!';
        saveTok(token);
        btn.disabled = false;
        loadStatus(pageRoot);
      }).catch(function (e) {
        msg.className = 'kf-msg err'; msg.textContent = e.message; btn.disabled = false;
      });
    });
  }

  function start() {
    if ($('kfHome')) initHome();
    if ($('kfPage')) initPage();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
