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

  /* איור היכל (ארון קודש) לרקע הדף והכרטיס: קשת, עמודים, פרוכת עם רקמה, כתר, לוחות הברית,
     נר תמיד שמהבהב ואור זהוב. חפצים ואדריכלות בלבד, בלי דמויות אדם. */
  function artSVG() {
    var dust = [[60,70],[118,150],[205,52],[262,206],[336,118],[424,64],[486,186],[88,300],
                [512,326],[160,382],[300,28],[444,292],[380,36],[226,340],[540,126],[30,200]];
    var dustSVG = dust.map(function (p, i) {
      return '<circle class="kf-dust" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (1 + (i % 3) * 0.6) +
             '" style="animation-delay:' + (i * 0.45) + 's"/>';
    }).join('');
    var folds = [186, 222, 258, 342, 378, 414].map(function (x) {
      return '<path d="M' + x + ' 150 V420" stroke="#06101F" stroke-opacity=".55" stroke-width="2"/>' +
             '<path d="M' + (x + 4) + ' 150 V420" stroke="#3A62A0" stroke-opacity=".35" stroke-width="1.5"/>';
    }).join('');
    var tablets = '';
    [[222, 292, 257], [308, 378, 343]].forEach(function (t) {
      tablets += '<path d="M' + t[0] + ' 300 V205 A35 35 0 0 1 ' + t[1] + ' 205 V300 Z" fill="#EBDCB6" stroke="#8A6D2A" stroke-width="3"/>';
      [232, 250, 268, 286].forEach(function (y) {
        tablets += '<path d="M' + (t[2] - 16) + ' ' + y + ' H' + (t[2] + 16) + '" stroke="#8A6D2A" stroke-width="2.5" stroke-opacity=".6"/>';
      });
    });
    function lamp(x) {
      return '<path d="M' + x + ' 96 V146" stroke="#B08D3E" stroke-width="2"/>' +
             '<circle class="kf-flame-glow" cx="' + x + '" cy="158" r="24" fill="#F6D27A" opacity=".5"/>' +
             '<path d="M' + (x - 9) + ' 146 H' + (x + 9) + ' L' + (x + 6) + ' 166 Q' + x + ' 172 ' + (x - 6) + ' 166 Z" fill="url(#kfGoldG)"/>' +
             '<ellipse class="kf-flame" cx="' + x + '" cy="156" rx="4.5" ry="8" fill="#FFF1C0"/>';
    }
    return '<svg viewBox="0 0 600 440" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">' +
      '<defs>' +
        '<radialGradient id="kfGlowG" cx="50%" cy="34%" r="58%"><stop offset="0" stop-color="#F6D27A" stop-opacity=".5"/><stop offset="1" stop-color="#F6D27A" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="kfGoldG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2DFA8"/><stop offset=".5" stop-color="#B08D3E"/><stop offset="1" stop-color="#7A5F22"/></linearGradient>' +
        '<linearGradient id="kfCurtainG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0B2452"/><stop offset=".5" stop-color="#1E4A8C"/><stop offset="1" stop-color="#0B2452"/></linearGradient>' +
        '<linearGradient id="kfArchG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050C18"/><stop offset="1" stop-color="#0E1D38"/></linearGradient>' +
        '<pattern id="kfEmb" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M13 3 L23 13 L13 23 L3 13 Z" fill="none" stroke="#D9BE7C" stroke-width="1" stroke-opacity=".5"/><circle cx="13" cy="13" r="1.6" fill="#D9BE7C" fill-opacity=".7"/></pattern>' +
      '</defs>' +
      '<ellipse cx="300" cy="200" rx="330" ry="260" fill="url(#kfGlowG)"/>' +
      '<g class="kf-rays" fill="#F2DFA8">' +
        '<path d="M300 40 L118 420 L206 420 Z" opacity=".10"/>' +
        '<path d="M300 40 L394 420 L482 420 Z" opacity=".10"/>' +
        '<path d="M300 40 L30 330 L30 262 Z" opacity=".06"/>' +
        '<path d="M300 40 L570 330 L570 262 Z" opacity=".06"/>' +
      '</g>' +
      dustSVG +
      '<path d="M112 420 V200 Q112 58 300 58 Q488 58 488 200 V420 Z" fill="url(#kfArchG)" stroke="url(#kfGoldG)" stroke-width="6"/>' +
      '<path d="M128 420 V204 Q128 74 300 74 Q472 74 472 204 V420" fill="none" stroke="#B08D3E" stroke-opacity=".45" stroke-width="2"/>' +
      '<rect x="84" y="190" width="28" height="230" fill="url(#kfGoldG)" opacity=".85"/>' +
      '<rect x="488" y="190" width="28" height="230" fill="url(#kfGoldG)" opacity=".85"/>' +
      '<rect x="78" y="180" width="40" height="12" rx="2" fill="url(#kfGoldG)"/>' +
      '<rect x="482" y="180" width="40" height="12" rx="2" fill="url(#kfGoldG)"/>' +
      '<rect x="78" y="410" width="40" height="10" rx="2" fill="url(#kfGoldG)"/>' +
      '<rect x="482" y="410" width="40" height="10" rx="2" fill="url(#kfGoldG)"/>' +
      '<path d="M150 420 V190 Q150 104 300 104 Q450 104 450 190 V420 Z" fill="url(#kfCurtainG)"/>' +
      '<path d="M150 420 V190 Q150 104 300 104 Q450 104 450 190 V420 Z" fill="url(#kfEmb)" opacity=".9"/>' +
      folds +
      '<path d="M150 420 V190 Q150 104 300 104 Q450 104 450 190 V420" fill="none" stroke="url(#kfGoldG)" stroke-width="5"/>' +
      '<path d="M166 420 V196 Q166 122 300 122 Q434 122 434 196 V420" fill="none" stroke="#D9BE7C" stroke-opacity=".5" stroke-width="1.5"/>' +
      '<path d="M262 98 V70 L282 84 L300 56 L318 84 L338 70 V98 Z" fill="url(#kfGoldG)" stroke="#7A5F22" stroke-width="1.5"/>' +
      '<circle cx="262" cy="70" r="4" fill="#F2DFA8"/><circle cx="300" cy="56" r="4.5" fill="#F2DFA8"/><circle cx="338" cy="70" r="4" fill="#F2DFA8"/>' +
      tablets +
      lamp(172) + lamp(428) +
      '<rect x="40" y="420" width="520" height="12" rx="3" fill="#0A1424" stroke="url(#kfGoldG)" stroke-width="2"/>' +
      '<rect x="66" y="432" width="468" height="6" rx="2" fill="#08101E"/>' +
      '</svg>';
  }

  /* כספת SVG: היכל סגור שנפתח לפי היחס. ארבעה ספרי תורה נדלקים בכל רבע מהיעד, ומטבעות נופלים. בלי דמויות. */
  function vaultSVG() {
    var colors = ['#7A1F2B', '#1F3A6B', '#7A1F2B', '#1F3A6B'];
    var xs = [60, 83, 117, 140];
    var scrolls = xs.map(function (x, i) {
      return '<g class="kf-s" data-n="' + (i + 1) + '">' +
        '<rect x="' + (x - 7) + '" y="66" width="14" height="78" rx="3" fill="' + colors[i] + '"/>' +
        '<rect x="' + (x - 7) + '" y="100" width="14" height="4" fill="#D9BE7C"/>' +
        '<rect x="' + (x - 9) + '" y="60" width="18" height="6" rx="3" fill="#D9BE7C"/>' +
        '<rect x="' + (x - 9) + '" y="144" width="18" height="6" rx="3" fill="#D9BE7C"/>' +
        '<path d="M' + (x - 5) + ' 56 L' + (x - 5) + ' 48 L' + (x - 2) + ' 52 L' + x + ' 45 L' + (x + 2) + ' 52 L' + (x + 5) + ' 48 L' + (x + 5) + ' 56 Z" fill="#F2DFA8"/>' +
        '</g>';
    }).join('');
    var ticks = '';
    for (var k = 0; k < 12; k++) {
      var a = k * Math.PI / 6;
      ticks += '<line x1="' + (96 + 13 * Math.cos(a)).toFixed(1) + '" y1="' + (100 + 13 * Math.sin(a)).toFixed(1) +
               '" x2="' + (96 + 16 * Math.cos(a)).toFixed(1) + '" y2="' + (100 + 16 * Math.sin(a)).toFixed(1) +
               '" stroke="#D9BE7C" stroke-width="1.5"/>';
    }
    var corners = [[24, 28], [168, 28], [24, 160], [168, 160]].map(function (p) {
      return '<rect x="' + p[0] + '" y="' + p[1] + '" width="8" height="8" rx="2" fill="#D9BE7C"/>';
    }).join('');
    var rivets = [[44, 50], [156, 50], [44, 150], [156, 150]].map(function (p) {
      return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.5" fill="#D9BE7C"/>';
    }).join('');
    return '<svg class="kf-vault" viewBox="0 0 200 200" role="img" aria-label="כספת לארון הקודש, נפתחת לפי ההתקדמות">' +
      '<defs>' +
        '<linearGradient id="kfSteelG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E4D7E"/><stop offset=".55" stop-color="#16294A"/><stop offset="1" stop-color="#0D1A30"/></linearGradient>' +
        '<linearGradient id="kfDoorG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#26426F"/><stop offset="1" stop-color="#132643"/></linearGradient>' +
        '<linearGradient id="kfVGoldG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2DFA8"/><stop offset=".5" stop-color="#B08D3E"/><stop offset="1" stop-color="#7A5F22"/></linearGradient>' +
        '<radialGradient id="kfInG" cx="50%" cy="60%" r="70%"><stop offset="0" stop-color="#F6D27A" stop-opacity=".95"/><stop offset=".6" stop-color="#B08D3E" stop-opacity=".35"/><stop offset="1" stop-color="#B08D3E" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<rect x="18" y="22" width="164" height="160" rx="14" fill="url(#kfSteelG)" stroke="url(#kfVGoldG)" stroke-width="5"/>' +
      '<rect x="26" y="30" width="148" height="144" rx="10" fill="none" stroke="#B08D3E" stroke-opacity=".35" stroke-width="1.5"/>' +
      corners +
      '<rect x="12" y="56" width="10" height="18" rx="3" fill="#7A5F22"/>' +
      '<rect x="12" y="118" width="10" height="18" rx="3" fill="#7A5F22"/>' +
      '<rect x="34" y="40" width="132" height="124" rx="8" fill="#050B16"/>' +
      scrolls +
      '<rect class="kf-glow" x="34" y="40" width="132" height="124" rx="8" fill="url(#kfInG)" opacity="0"/>' +
      '<g class="kf-door">' +
        '<rect x="34" y="40" width="132" height="124" rx="8" fill="url(#kfDoorG)" stroke="url(#kfVGoldG)" stroke-width="3"/>' +
        '<rect x="42" y="48" width="116" height="108" rx="5" fill="none" stroke="#B08D3E" stroke-opacity=".45" stroke-width="1.5"/>' +
        '<g class="kf-dial"><circle cx="96" cy="100" r="18" fill="#0C1828" stroke="url(#kfVGoldG)" stroke-width="3"/>' + ticks +
          '<circle cx="96" cy="100" r="3" fill="#F2DFA8"/></g>' +
        '<circle cx="146" cy="100" r="13" fill="none" stroke="url(#kfVGoldG)" stroke-width="4"/>' +
        '<path d="M146 87 V113 M133 100 H159 M136 90 L156 110 M156 90 L136 110" stroke="#D9BE7C" stroke-width="2.5"/>' +
        '<circle cx="146" cy="100" r="3.5" fill="#F2DFA8"/>' +
        rivets +
      '</g>' +
      '<circle class="kf-coin" cx="80" cy="176" r="7" fill="#EBDCB6" stroke="#8A6D2A" style="animation-delay:.1s"/>' +
      '<circle class="kf-coin" cx="100" cy="172" r="7" fill="#EBDCB6" stroke="#8A6D2A" style="animation-delay:.35s"/>' +
      '<circle class="kf-coin" cx="120" cy="176" r="7" fill="#EBDCB6" stroke="#8A6D2A" style="animation-delay:.6s"/>' +
      '<rect x="30" y="184" width="140" height="8" rx="4" fill="#B08D3E" opacity=".6"/>' +
      '</svg>';
  }

  function setVault(el, paid, goal, animate) {
    if (!el) return;
    var door = el.querySelector('.kf-door');
    if (!door) { el.innerHTML = vaultSVG(); door = el.querySelector('.kf-door'); }
    var ratio = Math.max(0, Math.min(1, goal ? paid / goal : 0));
    /* הדלת נפתחת מהציר שלה (שמאל) לפי היחס: סגורה ב-0, פתוחה לגמרי ב-100 */
    door.style.transform = 'scaleX(' + (1 - 0.9 * ratio).toFixed(3) + ')';
    var glow = el.querySelector('.kf-glow');
    if (glow) glow.style.opacity = ratio.toFixed(3);
    /* כל רבע מהיעד מדליק ספר תורה נוסף */
    var lit = Math.min(4, Math.floor(ratio * 4 + 1e-9));
    el.querySelectorAll('.kf-s').forEach(function (g) {
      g.classList.toggle('kf-on', Number(g.getAttribute('data-n')) <= lit);
    });
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
    document.querySelectorAll('[data-kf="art"]').forEach(function (n) { n.innerHTML = artSVG(); });
    if ($('kfHome')) initHome();
    if ($('kfPage')) initPage();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
