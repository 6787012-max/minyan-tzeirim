/* shas.js — טבלת חלוקת ש״ס שוטנשטיין.
   מקור הנתונים: data/shas.json. כרך "נתפס" כשיש בו שדה by עם שם. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var S = null, CFG = null, SEDER = null, Q = '';

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
    $('#stats').innerHTML = [
      [all, 'כרכים בסט'],
      [shekel(S.pricePerVolume), 'לכרך · כולל כריכה'],
      [got, 'כרכים נלקחו'],
      [left, 'עדיין פנויים']
    ].map(function (r) {
      return '<div class="stat"><div class="v">' + esc(r[0]) + '</div>' +
        '<div class="k">' + esc(r[1]) + '</div></div>';
    }).join('');

    var pct = all ? got / all * 100 : 0;
    $('#cap').textContent = got + ' מתוך ' + all + ' כרכים · ' +
      shekel(got * S.pricePerVolume) + ' מתוך ' + shekel(all * S.pricePerVolume);
    requestAnimationFrame(function () { $('#fill').style.width = pct + '%'; });
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
    return '<a class="vol" href="' + esc(volUrl(v)) + '" target="_blank" rel="noopener" ' +
      'title="לקחת את הכרך הזה">' + inner + '</a>';
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
  }).catch(function (e) {
    $('#intro').textContent = 'שגיאה בטעינת רשימת הכרכים.';
    console.error(e);
  });
})();
