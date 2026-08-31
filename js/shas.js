/* shas.js — טבלת חלוקת ש״ס שוטנשטיין.
   מקור הנתונים: data/shas.json. כרך "נתפס" כשיש בו שדה by עם שם. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var S = null, CFG = null, SEDER = null, Q = '';

  /* הכתובת שמורה ב-base64 בקובץ הנתונים — לא סוד, רק מונע קצירה
     אוטומטית של בוטי ספאם מהקוד הפתוח. */
  function orderEmail(o) {
    if (!o) return '';
    if (o.email) return o.email;
    try { return o.email_b64 ? atob(o.email_b64) : ''; } catch (e) { return ''; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function shekel(n) { return '₪' + Math.round(n).toLocaleString('he-IL'); }

  function taken(v) { return !!(v.by && v.by.trim()); }

  /* קישור התרומה לכרך בודד */
  function volUrl(v) {
    var n = CFG.nedarim || {};
    var url = n.url + '&Amount=' + S.pricePerVolume + '&AmountLock=1' +
      '&Groupe=' + encodeURIComponent(S.nedarim.groupe) +
      '&GroupeLock=1' +
      '&CustomAvour=' + encodeURIComponent('הכרך שנלקח') +
      '&Avour=' + encodeURIComponent(S.nedarim.avourPrefix + ' ' + v.n + ' — ' + v.name) +
      '&OnlyNormal=1';
    return url;
  }

  /* ── סטטיסטיקה ───────────────────────────────────────────────── */
  function renderStats() {
    var all = S.volumes.length;
    var got = S.volumes.filter(taken).length;
    var left = all - got;
    var raised = got * S.pricePerVolume;
    var goal = all * S.pricePerVolume;
    var per = S.pricePerVolume, bind = S.bindingPerVolume || 0;
    $('#stats').innerHTML = [
      [all, 'כרכים בסט'],
      [shekel(per), bind ? shekel(per - bind) + ' לכרך + ' + shekel(bind) + ' כריכה' : 'לכרך'],
      [got, 'כרכים נלקחו'],
      [left, 'עדיין פנויים']
    ].map(function (r) {
      /* מספר טהור מקבל ספירה עולה; מחיר נשאר כמו שהוא */
      var num = (typeof r[0] === 'number');
      return '<div class="stat"><div class="v"' +
        (num ? ' data-count="' + r[0] + '">' + r[0] : '>' + esc(r[0])) + '</div>' +
        '<div class="k">' + esc(r[1]) + '</div></div>';
    }).join('');
    if (window.Motion) window.Motion.refresh();

    var pct = goal ? Math.min(100, raised / goal * 100) : 0;
    $('#cap').textContent = shekel(raised) + ' מתוך ' + shekel(goal) +
      ' · ' + Math.round(pct) + '%';
    requestAnimationFrame(function () { $('#fill').style.width = pct + '%'; });

    /* תורמים שקיבלו כמה כרכים תמורת סכום */
    var cr = S.credits || [];
    var box = $('#majorBox');
    if (box) {
      if (!cr.length) { box.hidden = true; }
      else {
        box.hidden = false;
        box.innerHTML = '<div class="md-k">תודה לתורמים</div>' +
          cr.map(function (x) {
            return '<div class="md-row"><b>' + esc(x.name) + '</b><span>' +
              shekel(x.paid) + ' · ' + x.volumes + ' כרכים</span></div>';
          }).join('');
      }
    }
  }

  /* ── מסננים ──────────────────────────────────────────────────── */
  function renderFilters() {
    var f = $('#filters');
    var btns = [['', 'הכל']].concat(S.sedarim.map(function (s) { return [s, s]; }));
    btns.push(['_free', 'רק פנויים']);
    f.innerHTML = btns.map(function (b) {
      return '<button type="button" data-s="' + esc(b[0]) + '" aria-pressed="' +
        (SEDER === b[0]) + '">' + esc(b[1]) + '</button>';
    }).join('');
    f.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      SEDER = b.dataset.s;
      f.querySelectorAll('button').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x.dataset.s === SEDER));
      });
      renderGrid();
    });
  }

  /* ── הרשת ────────────────────────────────────────────────────── */
  function match(v) {
    if (SEDER === '_free') { if (taken(v)) return false; }
    else if (SEDER && v.seder !== SEDER) return false;
    if (!Q) return true;
    var q = Q.toLowerCase();
    return (v.name + ' ' + v.n + ' ' + v.seder + ' ' + (v.by || '')).toLowerCase()
      .indexOf(q) >= 0;
  }

  function volHtml(v) {
    var t = taken(v);
    var inner =
      '<span class="n">' + esc(v.n) + '</span>' +
      '<span class="b"><b>' + esc(v.name) + '</b><span>' +
      (t ? esc(v.by) : shekel(S.pricePerVolume) + ' · פנוי') + '</span></span>';
    if (t) return '<div class="vol taken" title="נלקח על ידי ' + esc(v.by) + '">' + inner + '</div>';
    return '<button type="button" class="vol" data-n="' + esc(v.n) + '" ' +
      'title="לקחת את הכרך הזה">' + inner + '</button>';
  }

  function renderGrid() {
    var g = $('#grid'), out = '', any = false;
    S.sedarim.forEach(function (sd) {
      var list = S.volumes.filter(function (v) { return v.seder === sd && match(v); });
      if (!list.length) return;
      any = true;
      var free = list.filter(function (v) { return !taken(v); }).length;
      out += '<div class="seder"><h3>' + esc(sd) +
        '<span>' + list.length + ' כרכים · ' + free + ' פנויים</span></h3>' +
        '<div class="vols">' + list.map(volHtml).join('') + '</div></div>';
    });
    g.innerHTML = any ? out : '<p class="empty">לא נמצאו כרכים שמתאימים לחיפוש.</p>';
  }


  /* ── חלונית נטילת כרך ─────────────────────────────────────────── */
  var CUR = null;

  function openModal(n) {
    CUR = S.volumes.filter(function (v) { return v.n === n; })[0];
    if (!CUR) return;
    $('#mTitle').textContent = 'כרך ' + CUR.n + ' — ' + CUR.name;
    $('#mPrice').textContent = shekel(S.pricePerVolume) + ' · ' + (S.priceNote || '');
    $('#mHint').textContent = '';
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    updateModal();
    $('#mName').focus();
  }

  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    CUR = null;
  }

  function updateModal() {
    if (!CUR) return;
    var n = CFG.nedarim || {};
    var nm = $('#mName').value.trim(), ph = $('#mPhone').value.trim();
    $('#mPay').href = volUrl(CUR) +
      (nm ? '&ClientName=' + encodeURIComponent(nm) : '') +
      (ph ? '&Phone=' + encodeURIComponent(ph) : '');
  }

  /* רישום בלי תשלום — נשלח לגבאי */
  function registerLater() {
    var nm = $('#mName').value.trim(), ph = $('#mPhone').value.trim();
    if (!nm || !ph) {
      $('#mHint').innerHTML = '<b style="color:#9B1E1E">יש למלא שם וטלפון.</b>';
      $('#mName').focus();
      return;
    }
    var o = S.order || {};
    var body = [
      'נטילת כרך בש״ס',
      '',
      'כרך ' + CUR.n + ' — ' + CUR.name + ' (' + CUR.seder + ')',
      'שם: ' + nm,
      'טלפון: ' + ph,
      'סכום: ' + shekel(S.pricePerVolume),
      '',
      'הרישום נעשה באתר. התשלום יתבצע מול הגבאי.'
    ].join('\n');

    if (o.whatsapp) {
      window.open('https://wa.me/' + o.whatsapp + '?text=' + encodeURIComponent(body), '_blank');
    } else if (orderEmail(o)) {
      location.href = 'mailto:' + orderEmail(o) +
        '?subject=' + encodeURIComponent('נטילת כרך ' + CUR.n + ' — ' + nm) +
        '&body=' + encodeURIComponent(body);
    }
    $('#mHint').innerHTML = '<b>נשלח לגבאי.</b> הכרך יסומן על שמך אחרי אישורו.';
  }

  /* ── הפעלה ───────────────────────────────────────────────────── */
  Promise.all([
    fetch('data/shas.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    fetch('data/config.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
  ]).then(function (a) {
    S = a[0]; CFG = a[1];
    document.title = S.title + ' · ' + CFG.name;
    $('#title').textContent = S.title;
    $('#eyebrow').textContent = S.eyebrow;
    $('#intro').textContent = S.intro;

    renderStats();
    renderFilters();
    renderGrid();

    var n = CFG.nedarim || {};
    $('#note').innerHTML = 'התשלום מתבצע באתר המאובטח של <b>נדרים פלוס</b> (מוסד ' +
      esc(n.mosad) + '). ' + esc(S.priceNote || '') +
      ' רשימת הכרכים מתעדכנת ידנית — אם לקחתם כרך והוא עדיין מופיע כפנוי, ' +
      'זה רק עניין של עדכון.';
    $('#footGive').innerHTML = '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">' +
      'תרומה כללית למניין</a>';

    var q = $('#q');
    q.addEventListener('input', function () { Q = q.value.trim(); renderGrid(); });

    $('#grid').addEventListener('click', function (e) {
      var b = e.target.closest('button.vol');
      if (b) openModal(b.dataset.n);
    });
    $('#mClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
    });
    ['#mName', '#mPhone'].forEach(function (sel) {
      $(sel).addEventListener('input', updateModal);
    });
    $('#mLater').addEventListener('click', registerLater);

    if (S.pdf) {
      $('#pdfNote').innerHTML = 'רוצים לתלות דף רישום בבית הכנסת? ' +
        '<a href="' + esc(S.pdf) + '" target="_blank" rel="noopener"><b>להורדת דף הרישום המודפס (PDF)</b></a>';
    }
  }).catch(function (e) {
    $('#intro').textContent = 'שגיאה בטעינת רשימת הכרכים.';
    console.error(e);
  });
})();
