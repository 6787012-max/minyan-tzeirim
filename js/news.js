/* news.js — לוח החדשות הציבורי.
 *
 * קורא רק מ-news_public: תצוגה שמחזירה מה שאושר ולא פג, בלי שולח
 * ובלי טקסט OCR גולמי. גם אם מפתח ה-anon גלוי כאן — והוא גלוי —
 * אין דרך להגיע דרכו להודעה שלא אושרה או לפרטי השולח.
 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var ALL = [], CAT = 'all', Q = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* "לפני שעתיים" קריא יותר מתאריך מלא כשרוב ההודעות מהיום */
  function when(iso) {
    var d = new Date(iso), diff = (Date.now() - d.getTime()) / 6e4;
    if (diff < 2) return 'ממש עכשיו';
    if (diff < 60) return 'לפני ' + Math.round(diff) + ' דקות';
    if (diff < 24 * 60) {
      var h = Math.round(diff / 60);
      return 'לפני ' + (h === 1 ? 'שעה' : h + ' שעות');
    }
    var days = Math.round(diff / 1440);
    if (days === 1) return 'אתמול';
    if (days < 7) return 'לפני ' + days + ' ימים';
    return d.toLocaleDateString('he-IL');
  }

  function card(n) {
    var body = String(n.body || '');
    var longer = body.length > 300;
    var imgs = Array.isArray(n.images) ? n.images : (n.image_url ? [n.image_url] : []);
    return '<article class="nw" data-cat="' + esc(n.category || '') + '">' +
      '<div class="nw-top">' +
        (n.category ? '<span class="cat">' + esc(n.category) + '</span>' : '') +
        '<span class="ago">' + esc(when(n.msg_date || n.created_at)) + '</span>' +
      '</div>' +
      '<h3>' + esc(n.title || '') + '</h3>' +
      (body ? '<p class="body' + (longer ? ' clamp' : '') + '">' + esc(body) + '</p>' : '') +
      (longer ? '<button type="button" class="more">להמשך</button>' : '') +
      (imgs.length ? '<div class="nw-imgs">' + imgs.map(function (u) {
        return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(u) + '" alt="המודעה המצורפת" loading="lazy"></a>';
      }).join('') + '</div>' : '') +
    '</article>';
  }

  function render() {
    var list = ALL.filter(function (n) {
      if (CAT !== 'all' && (n.category || '') !== CAT) return false;
      if (!Q) return true;
      var hay = ((n.title || '') + ' ' + (n.body || '')).toLowerCase();
      return hay.indexOf(Q.toLowerCase()) >= 0;
    });

    $('#nwList').innerHTML = list.map(card).join('');
    $('#nwNote').textContent = list.length
      ? list.length + ' הודעות'
      : (ALL.length ? 'אין הודעות שתואמות לחיפוש.'
                    : 'אין כרגע הודעות מאושרות להצגה.');
    if (window.Motion) window.Motion.refresh();
  }

  function filters() {
    var cats = {};
    ALL.forEach(function (n) { if (n.category) cats[n.category] = (cats[n.category] || 0) + 1; });
    var keys = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    $('#nwFilters').innerHTML =
      ['<button type="button" class="chip on" data-c="all" aria-pressed="true">הכול</button>']
      .concat(keys.map(function (k) {
        return '<button type="button" class="chip" data-c="' + esc(k) +
          '" aria-pressed="false">' + esc(k) + ' <i>' + cats[k] + '</i></button>';
      })).join('');
  }

  fetch('data/site.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (c) {
      return fetch(c.api.url + '/rest/v1/news_public?select=*&order=msg_date.desc&limit=120', {
        headers: {
          'apikey': c.api.anon,
          'Authorization': 'Bearer ' + c.api.anon,
          'Accept-Profile': 'minyan'
        }
      });
    })
    .then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    })
    .then(function (rows) {
      ALL = rows || [];
      filters();
      render();
    })
    .catch(function (e) {
      console.warn(e);
      $('#nwNote').textContent = 'לא ניתן לטעון את ההודעות כרגע.';
    });

  $('#nwFilters').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    CAT = b.dataset.c;
    [].forEach.call(this.children, function (c) {
      var on = c === b;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    render();
  });

  var t = null;
  $('#nwQ').addEventListener('input', function () {
    var v = this.value.trim();
    clearTimeout(t);
    t = setTimeout(function () { Q = v; render(); }, 250);
  });

  $('#nwList').addEventListener('click', function (e) {
    var b = e.target.closest('.more');
    if (!b) return;
    b.previousElementSibling.classList.remove('clamp');
    b.remove();
  });
})();
