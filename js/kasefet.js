/* kasefet.js — כספת לארון הקודש. שני מצבים לפי מה שקיים בדף:
   #kfHome  = כרטיס קומפקטי בדף הבית (נשלט מ-config.kasefet.show).
   #kfPage  = הדף המלא kasefet.html (לשוניות: מצב, הצטרפות, תשלום, עדכון אישי).
   כל הנתונים מגיעים מ-RPC ציבורי בלבד (kasefet_public / kasefet_pledge / kasefet_get / kasefet_update).
   אין כאן טלפונים, טוקנים או סכומים אישיים של אחרים. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var C1 = 2 * Math.PI * 86, C2 = 2 * Math.PI * 70; /* היקפי הטבעות ב-viewBox 200 */
  var API = null, CFG = null, TIMER = null, LAST = null;
  var TOKEN_KEY = 'kf-token';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shekel(n) { return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL'); }
  function intFmt(n) { return String(Math.round(Number(n) || 0)); }
  function pctFmt(n) { return Math.round(Number(n) || 0) + '%'; }
  function fld(f, name) { return f.querySelector('[name="' + name + '"]'); }

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
          if (!r.ok) throw new Error((data && data.message) || 'שגיאה בשרת');
          return data;
        });
      });
    });
  }

  function readTok() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function saveTok(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* פרטי גלישה */ } }
  function forgetTok() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* פרטי גלישה */ } }

  function nedarimUrl(amount) {
    var base = 'https://www.matara.pro/nedarimplus/online/?mosad=' + encodeURIComponent(CFG.nedarim.mosad);
    base += '&Groupe=' + encodeURIComponent('כספת לארון הקודש');
    if (amount) base += '&Amount=' + encodeURIComponent(amount) + '&AmountLock=1';
    return base;
  }

  /* ── טבעת ההתקדמות (SVG בלבד, בלי איורים) ───────────────────────── */
  function ringHTML() {
    return '<div class="kf-ring">' +
      '<svg viewBox="0 0 200 200" focusable="false" aria-hidden="true">' +
        '<defs><linearGradient id="kfRingG" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#F2DFA8"/><stop offset=".5" stop-color="#B08D3E"/><stop offset="1" stop-color="#7A5F22"/>' +
        '</linearGradient></defs>' +
        '<circle class="kf-ring-track" cx="100" cy="100" r="86"/>' +
        '<circle class="kf-ring-fill" data-kf="ringFill" cx="100" cy="100" r="86" stroke="url(#kfRingG)" ' +
          'stroke-dasharray="' + C1.toFixed(2) + '" stroke-dashoffset="' + C1.toFixed(2) + '"/>' +
        '<circle class="kf-ring-in-track" cx="100" cy="100" r="70"/>' +
        '<circle class="kf-ring-in" data-kf="ringIn" cx="100" cy="100" r="70" ' +
          'stroke-dasharray="' + C2.toFixed(2) + '" stroke-dashoffset="' + C2.toFixed(2) + '"/>' +
        '<g class="kf-ring-spin"><circle class="kf-ring-glow" cx="100" cy="14" r="9"/><circle class="kf-ring-glint" cx="100" cy="14" r="4"/></g>' +
      '</svg>' +
      '<div class="kf-ring-c">' +
        '<b class="kf-ring-pct" data-kf="pct"><i class="kf-sk"></i></b>' +
        '<span class="kf-ring-amt"><bdi data-kf="ringAmt"><i class="kf-sk"></i></bdi></span>' +
      '</div>' +
      '<div class="kf-ring-sp" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
    '</div>';
  }

  /* ── מספרים שרצים למעלה ────────────────────────────────────────── */
  function tween(root, key, to, fmt) {
    var el = root.querySelector('[data-kf="' + key + '"]');
    if (!el) return;
    var from = parseFloat(el.getAttribute('data-v'));
    if (isNaN(from)) from = 0;
    el.setAttribute('data-v', String(to));
    var id = (el._tw = (el._tw || 0) + 1);
    if (REDUCED || from === to) { el.textContent = fmt(to); return; }
    var t0 = 0;
    function step(ts) {
      if (el._tw !== id) return;
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function bump(n) {
    if (!n || REDUCED) return;
    n.classList.remove('kf-bump'); void n.offsetWidth; n.classList.add('kf-bump');
  }

  /* קונפטי זהוב קצר. בלי תנועה מופחתת לא מוצג */
  function confetti() {
    if (REDUCED) return;
    var box = document.createElement('div');
    box.className = 'kf-confetti'; box.setAttribute('aria-hidden', 'true');
    var cols = ['#F2DFA8', '#D9BE7C', '#B08D3E', '#FBF6E8', '#12233F'];
    for (var i = 0; i < 36; i++) {
      var s = document.createElement('i');
      s.style.left = (Math.random() * 100).toFixed(1) + '%';
      s.style.background = cols[i % cols.length];
      s.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
      s.style.setProperty('--x', ((Math.random() - 0.5) * 160).toFixed(0) + 'px');
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 2600);
  }

  /* תמונה אמיתית: רק אם config.kasefet.photo מוגדר (נתיב יחסי תחת img/) */
  function mountPhotos(c) {
    var k = (c && c.kasefet) || {};
    var src = typeof k.photo === 'string' ? k.photo.trim() : '';
    if (!/^img\/[A-Za-z0-9_\-\/.]+\.(jpe?g|png|webp)$/i.test(src)) return;
    var W = Number(k.photoW), H = Number(k.photoH);
    if (!W || !H) return;
    /* הכרטיס נשאר מוסתר עד שהתמונה נטענה ומידותיה תואמות לערכים מה-config.
       כך תמונה אחרת, תמונת המתנה, או כשל טעינה לא מופיעים לקהל ואין קפיצה בפריסה. */
    document.querySelectorAll('[data-kf="photo"]').forEach(function (box) {
      var img = document.createElement('img');
      img.className = 'kf-photo-img'; img.alt = 'כספת לספרי התורה'; img.loading = 'lazy'; img.decoding = 'async';
      img.onload = function () {
        if (img.naturalWidth === W && img.naturalHeight === H) {
          box.hidden = false;
        } else {
          box.hidden = true;
        }
      };
      img.onerror = function () { box.hidden = true; };
      img.src = src;
      box.appendChild(img);
      if (k.photoCredit) {
        var cap = document.createElement('figcaption');
        cap.className = 'kf-cap';
        cap.textContent = String(k.photoCredit);
        box.appendChild(cap);
      }
    });
  }

  /* ── מצב המגבית ──────────────────────────────────────────────── */
  function render(d, root) {
    var goal = Number(d.goal) || 10000, pledged = Number(d.pledged) || 0, paid = Number(d.paid) || 0;
    var partners = Number(d.partners) || 0;
    var prev = LAST; LAST = d;
    var grew = !!prev && partners > (Number(prev.partners) || 0);
    var rPaid = Math.max(0, Math.min(1, paid / goal)), rPl = Math.max(0, Math.min(1, pledged / goal));

    /* הפס הראשי והטבעת = שולם בפועל. הפס השני והטבעת הפנימית = מה שסומן */
    var fillPl = root.querySelector('[data-kf="barPledged"]'), fillPd = root.querySelector('[data-kf="barPaid"]');
    if (fillPl) fillPl.style.width = (rPl * 100).toFixed(2) + '%';
    if (fillPd) fillPd.style.width = (rPaid * 100).toFixed(2) + '%';
    var rf = root.querySelector('[data-kf="ringFill"]'), ri = root.querySelector('[data-kf="ringIn"]');
    if (rf) rf.style.strokeDashoffset = (C1 * (1 - rPaid)).toFixed(2);
    if (ri) ri.style.strokeDashoffset = (C2 * (1 - rPl)).toFixed(2);

    tween(root, 'paid', paid, shekel);
    tween(root, 'pledged', pledged, shekel);
    tween(root, 'partners', partners, intFmt);
    tween(root, 'leftPay', Math.max(0, goal - paid), shekel);
    tween(root, 'leftMark', Math.max(0, goal - pledged), shekel);
    tween(root, 'ringAmt', paid, shekel);
    tween(root, 'pct', rPaid * 100, pctFmt);
    var gl = root.querySelector('[data-kf="goal"]');
    if (gl) gl.textContent = shekel(goal);

    var sr = root.querySelector('[data-kf="sr"]');
    if (sr) sr.textContent = 'שולם ' + shekel(paid) + ' מתוך ' + shekel(goal) + '. סומנו ' + shekel(pledged) + ', ' + partners + ' שותפים.';

    /* 100%: הודעה מיוחדת, וקונפטי רק במעבר מ"לא שולם" ל"שולם במלואו" */
    var done = goal > 0 && paid >= goal;
    var cel = root.querySelector('[data-kf="celebrate"]');
    if (cel) cel.hidden = !done;
    if (done && prev && !(Number(prev.paid) >= (Number(prev.goal) || goal))) confetti();

    /* הרשימה נבנית מחדש רק כשהתוכן השתנה, כדי שכל רענון לא יפעיל את האנימציה שוב */
    var list = root.querySelector('[data-kf="people"]');
    if (list) {
      var people = d.people || [];
      var sig = people.map(function (p) { return (p.name || '') + (p.paid ? '1' : '0'); }).join('|');
      if (list.getAttribute('data-sig') !== sig) {
        list.setAttribute('data-sig', sig);
        list.innerHTML = people.length ? people.map(function (p, i) {
          var isNew = grew && i === people.length - 1;
          return '<li class="' + (p.paid ? 'kf-paid' : '') + (isNew ? ' kf-new' : '') + '" style="--i:' + i + '">' +
            '<span class="kf-pname">' + esc(p.name || 'שותף בעילום שם') + '</span>' +
            (p.paid ? '<span class="kf-tag kf-tag-paid">שילם</span>' : '<span class="kf-tag">ממתין</span>') +
          '</li>';
        }).join('') : '<li class="kf-empty">היו הראשונים לסמן את עצמכם.</li>';
      }
    }

    if (grew) {
      ['partners', 'pledged', 'leftPay', 'paid'].forEach(function (k) {
        var n = root.querySelector('[data-kf="' + k + '"]');
        if (n) bump(n.closest('.kf-stat, .kf-nums > div'));
      });
    }
  }

  function loadStatus(root) {
    return rpc('kasefet_public').then(function (d) {
      var note = root.querySelector('[data-kf="err"]');
      if (note) note.hidden = true;
      render(d, root);
      return d;
    }).catch(function () {
      /* בכשל משאירים את הערך האחרון, לא מאפסים */
      var note = root.querySelector('[data-kf="err"]');
      if (note) { note.textContent = 'לא הצלחנו לטעון את המצב כרגע. ננסה שוב בעוד רגע.'; note.hidden = false; }
    });
  }

  /* ── הופעה בגלילה ────────────────────────────────────────────── */
  function initReveal() {
    var els = document.querySelectorAll('.kf-reveal');
    if (!els.length) return;
    if (REDUCED || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
    /* אם ההצגה בגלילה לא רצה תוך שנייה וחצי (לשונית ברקע וכדומה), מציגים הכול */
    setTimeout(function () { els.forEach(function (e) { e.classList.add('in'); }); }, 1500);
  }

  /* ── דף הבית ─────────────────────────────────────────────────── */
  function initHome() {
    var home = $('kfHome');
    loadStatus(home);
    TIMER = setInterval(function () { loadStatus(home); }, 20000);
    loadCfg().then(function (c) {
      mountPhotos(c);
      if (((c && c.kasefet) || {}).show === false) return;
      home.hidden = false;
    }).catch(function () { /* לא מציגים כלום אם הקונפיגורציה לא נטענה */ });
  }

  /* ── שדות וטפסים ─────────────────────────────────────────────── */
  function fieldErr(input, text) {
    var box = input.closest('.kf-field');
    var p = box && box.querySelector('.kf-ferr');
    if (p) { p.textContent = text; p.hidden = false; }
    input.setAttribute('aria-invalid', 'true');
  }
  function clearErrs(f) {
    f.querySelectorAll('.kf-ferr').forEach(function (p) { p.hidden = true; p.textContent = ''; });
    f.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
  }
  function wireErrClear(f) {
    f.addEventListener('input', function (ev) {
      var t = ev.target, box = t.closest && t.closest('.kf-field');
      if (!box) return;
      var p = box.querySelector('.kf-ferr');
      if (p) p.hidden = true;
      t.removeAttribute('aria-invalid');
    });
  }
  function validate(f) {
    clearErrs(f);
    var bad = [];
    var nameEl = fld(f, 'name'), amtEl = fld(f, 'amount');
    if (nameEl.value.trim().length < 2) bad.push([nameEl, 'נא למלא שם מלא']);
    var a = amtEl.value.trim(), n = Number(a);
    if (a === '') bad.push([amtEl, 'נא למלא סכום']);
    else if (isNaN(n) || n < 1) bad.push([amtEl, 'הסכום צריך להיות לפחות 1 ש"ח']);
    else if (n > 100000) bad.push([amtEl, 'הסכום גבוה מדי, נא לבדוק']);
    bad.forEach(function (b) { fieldErr(b[0], b[1]); });
    if (bad.length) bad[0][0].focus();
    return !bad.length;
  }
  function formValues(f) {
    return {
      name: fld(f, 'name').value.trim(), phone: fld(f, 'phone').value.trim(),
      amount: Math.floor(Number(fld(f, 'amount').value)),
      method: f.querySelector('input[name=method]:checked').value,
      show: fld(f, 'show').checked
    };
  }

  /* ── דף מלא ──────────────────────────────────────────────────── */
  function moveInd(btn) {
    var ind = document.querySelector('.kf-ind');
    if (!ind || !btn || btn.hidden) return;
    ind.style.width = btn.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
  }

  function initPage() {
    var page = $('kfPage');
    var params = new URLSearchParams(location.search);
    var urlTok = params.get('t') || '';
    var fromUrl = !!urlTok;
    var token = urlTok || readTok();          /* קישור אישי מהכתובת, או טוקן שנשמר במכשיר */
    var joinF = $('kfJoin'), editF = $('kfEdit');
    var NED_AMOUNT = 0;

    function setNedarim(amount) {
      NED_AMOUNT = Number(amount) || 0;
      var np = $('kfNedarim');
      if (np && CFG) np.href = nedarimUrl(NED_AMOUNT);
    }
    function showEditTab() { var t = document.querySelector('.kf-tab[data-tab="edit"]'); if (t) t.hidden = false; }
    function hideEditTab() { var t = document.querySelector('.kf-tab[data-tab="edit"]'); if (t) t.hidden = true; }

    function selectTab(id) {
      var active = null;
      document.querySelectorAll('.kf-tab').forEach(function (b) {
        var on = b.getAttribute('data-tab') === id;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.setAttribute('tabindex', on ? '0' : '-1');
        if (on) active = b;
      });
      document.querySelectorAll('.kf-panel').forEach(function (p) { p.hidden = p.id !== 'panel-' + id; });
      moveInd(active);
      if (history.replaceState) history.replaceState(null, '', location.pathname + (id === 'edit' ? location.search : '') + '#' + id);
    }

    document.querySelectorAll('.kf-tab').forEach(function (b) {
      b.addEventListener('click', function () { selectTab(b.getAttribute('data-tab')); });
    });
    window.addEventListener('resize', function () { moveInd(document.querySelector('.kf-tab[aria-selected="true"]')); });
    window.addEventListener('load', function () { moveInd(document.querySelector('.kf-tab[aria-selected="true"]')); });

    function badToken() {
      if (fromUrl) {
        var m = $('kfEditErr'); m.textContent = 'הקישור לא נמצא, ייתכן שהוא ישן'; m.hidden = false;
        return;
      }
      /* טוקן ששמור במכשיר ולא תקף עוד: מסירים בשקט */
      forgetTok(); token = ''; hideEditTab();
      if (document.querySelector('.kf-tab[data-tab="edit"][aria-selected="true"]')) selectTab('join');
    }

    function fillEdit(r) {
      fld(editF, 'name').value = r.name || '';
      fld(editF, 'phone').value = r.phone || '';
      fld(editF, 'amount').value = r.amount || '';
      editF.querySelectorAll('input[name=method]').forEach(function (x) { x.checked = x.value === r.method; });
      fld(editF, 'show').checked = !!r.show_name;
      $('kfEditIntro').textContent = 'שלום ' + (r.name || '') + ', כאן אפשר לעדכן את ההתחייבות שלך.';
      $('kfPaidInfo').textContent = Number(r.paid_amount) > 0
        ? 'נרשם אצלנו ששולמו ' + shekel(r.paid_amount) + '. תודה רבה!'
        : 'עדיין לא נרשם תשלום. אפשר לשלם במזומן לגבאי או דרך נדרים פלוס.';
      setNedarim(r.amount);
    }

    function loadEdit() {
      var t = token;
      rpc('kasefet_get', { p_token: t }).then(function (r) {
        if (t !== token) return;
        if (!r || r.ok === false) { badToken(); return; }
        fillEdit(r);
        if (fromUrl) saveTok(t);              /* קישור תקף נשמר במכשיר, והלשונית תישאר גם בלי הכתובת */
        showEditTab();
        $('kfEditErr').hidden = true;
        $('kfEditBox').hidden = false;
      }).catch(function () {
        var m = $('kfEditErr');
        m.textContent = 'לא הצלחנו לטעון את ההתחייבות כרגע. נא לנסות שוב בעוד רגע.';
        m.hidden = false;
      });
    }

    loadStatus(page);
    TIMER = setInterval(function () { loadStatus(page); }, 20000);
    loadCfg().then(function (c) {
      mountPhotos(c);
      setNedarim(NED_AMOUNT);
    }).catch(function () { /* בלי קונפיגורציה הקישורים נשארים ריקים */ });

    if (token) { showEditTab(); loadEdit(); }

    wireErrClear(joinF);
    wireErrClear(editF);

    joinF.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = $('kfJoinMsg'), btn = joinF.querySelector('button[type=submit]');
      msg.className = 'kf-msg'; msg.textContent = '';
      if (!validate(joinF)) return;
      var v = formValues(joinF);
      var src = joinF.querySelector('input[name=source]:checked').value;
      btn.disabled = true;
      rpc('kasefet_pledge', {
        p_name: v.name, p_phone: v.phone, p_amount: v.amount, p_method: v.method,
        p_show_name: v.show, p_source: src
      }).then(function (tok) {
        if (typeof tok !== 'string' || !tok) throw new Error('empty');
        token = tok; saveTok(tok);
        var link = location.origin + location.pathname.replace(/[^/]*$/, '') + 'kasefet.html?t=' + encodeURIComponent(tok) + '#edit';
        $('kfThanksLink').textContent = link;
        $('kfThanks').hidden = false;
        joinF.reset(); clearErrs(joinF);
        showEditTab(); loadEdit();
        loadStatus(page);
        confetti();
        $('kfThanks').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      }).catch(function () {
        msg.className = 'kf-msg err'; msg.textContent = 'לא הצלחנו לשמור. נא לנסות שוב בעוד רגע.';
      }).then(function () { btn.disabled = false; });
    });

    var copy = $('kfCopy');
    if (copy) copy.addEventListener('click', function () {
      var txt = $('kfThanksLink').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { copy.textContent = 'הועתק'; }, function () {});
      }
    });

    editF.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = $('kfEditMsg'), btn = editF.querySelector('button[type=submit]');
      msg.className = 'kf-msg'; msg.textContent = '';
      if (!token || !validate(editF)) return;
      var v = formValues(editF);
      btn.disabled = true;
      rpc('kasefet_update', {
        p_token: token, p_name: v.name, p_phone: v.phone, p_amount: v.amount,
        p_method: v.method, p_show_name: v.show
      }).then(function () {
        msg.className = 'kf-msg ok'; msg.textContent = 'נשמר. תודה!';
        saveTok(token);
        setNedarim(v.amount);              /* הקישור לנדרים פלוס מתעדכן מיד לסכום החדש */
        loadStatus(page);
      }).catch(function () {
        msg.className = 'kf-msg err'; msg.textContent = 'לא הצלחנו לשמור. נא לנסות שוב בעוד רגע.';
      }).then(function () { btn.disabled = false; });
    });

    if (token && (fromUrl || location.hash === '#edit')) selectTab('edit');
    else {
      var hash = (location.hash || '').replace('#', '');
      if (hash === 'join' || hash === 'pay' || hash === 'status') selectTab(hash);
      else moveInd(document.querySelector('.kf-tab[aria-selected="true"]'));
    }
  }

  function start() {
    document.body.classList.add('kf-js');
    document.querySelectorAll('[data-kf="vault"]').forEach(function (v) { v.innerHTML = ringHTML(); });
    initReveal();
    if ($('kfHome')) initHome();
    if ($('kfPage')) initPage();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
