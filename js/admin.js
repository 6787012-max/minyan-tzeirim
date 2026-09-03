/* admin.js — אזור הניהול.
 *
 * מה מגן כאן על מה: לא הדף. הדף הזה ציבורי כמו כל קובץ באתר, וכל
 * אחד יכול להוריד אותו ולקרוא אותו. ההגנה היא ב-RLS של המסד:
 * לטבלאות בסכימת minyan אין שום policy ל-anon, ול-authenticated יש
 * policy שדורשת שורה בטבלת admins. כלומר מי שיתחבר עם משתמש אחר,
 * או שיקרא לשרת עם ה-anon key ישירות, יקבל רשימה ריקה — לא בגלל
 * שהוסתר ממנו משהו בעיצוב, אלא כי המסד לא מחזיר לו שורות.
 *
 * הטוקן נשמר ב-localStorage. זו פשרה מודעת: sessionStorage היה
 * מאלץ התחברות בכל טאב, וזה פאנל שנפתח בטלפון בין מנחה למעריב.
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var KEY = 'mt-admin-session';
  var API = '', ANON = '';
  var SES = null, PAGE = 0, PER = 30, FILTER = 'all', Q = '';
  var NEWSF = 'new';

  var KIND = {
    kibud: 'כיבוד', shas: 'ש״ס', seats: 'מקומות', contact: 'פנייה', other: 'אחר'
  };
  var STATUS = {
    'new': 'ממתין', confirmed: 'אושר', paid: 'שולם',
    cancelled: 'בוטל', duplicate: 'כפילות'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── תצורה וסשן ─────────────────────────────────────────────── */

  function loadCfg() {
    return fetch('data/site.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) { API = d.api.url; ANON = d.api.anon; });
  }

  function saveSes(s) {
    SES = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* מצב פרטי */ }
  }
  function clearSes() {
    SES = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* כנ"ל */ }
  }
  function readSes() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  function login(email, pass) {
    return fetch(API + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON },
      body: JSON.stringify({ email: email, password: pass })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || 'login');
        return j;
      });
    });
  }

  function refresh() {
    if (!SES || !SES.refresh_token) return Promise.reject(new Error('no-session'));
    return fetch(API + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON },
      body: JSON.stringify({ refresh_token: SES.refresh_token })
    }).then(function (r) {
      if (!r.ok) throw new Error('refresh');
      return r.json();
    }).then(function (j) { saveSes(j); return j; });
  }

  /** קריאה למסד עם רענון אוטומטי פעם אחת. בלי זה הפאנל "מתרוקן"
   *  אחרי שעה בלי שום הסבר, וזה נראה כמו באג ולא כמו טוקן שפג. */
  function db(path, init, retried) {
    init = init || {};
    var h = {
      'apikey': ANON,
      'Authorization': 'Bearer ' + (SES && SES.access_token),
      'Accept-Profile': 'minyan',
      'Content-Profile': 'minyan',
      'Content-Type': 'application/json'
    };
    if (init.prefer) h.Prefer = init.prefer;
    return fetch(API + '/rest/v1/' + path, {
      method: init.method || 'GET', headers: h, body: init.body
    }).then(function (r) {
      if ((r.status === 401 || r.status === 403) && !retried) {
        return refresh().then(function () { return db(path, init, true); },
                             function () { gate('הסשן פג. יש להתחבר שוב.'); throw new Error('auth'); });
      }
      return r;
    });
  }

  /* ── תצוגה ──────────────────────────────────────────────────── */

  function gate(msg) {
    clearSes();
    $('#panel').hidden = true;
    $('#gate').hidden = false;
    if (msg) $('#lgHint').innerHTML = '<b style="color:#9B1E1E">' + esc(msg) + '</b>';
  }

  function stats() {
    return db('stats?select=*').then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (!rows.length) {
          $('#stats').innerHTML = '<p class="note">עדיין אין רישומים במערכת.</p>';
          return;
        }
        $('#stats').innerHTML = rows.map(function (s) {
          return '<div class="card">' +
            '<div class="k">' + esc(KIND[s.kind] || s.kind) + '</div>' +
            '<div class="n">' + s.total + '</div>' +
            '<div class="m">' +
              (s.pending ? '<span class="pend">' + s.pending + ' ממתינים</span> · ' : '') +
              s.approved + ' אושרו' +
              (Number(s.paid_sum) > 0 ? ' · ₪' + Number(s.paid_sum).toLocaleString('he-IL') : '') +
            '</div>' +
            '<div class="w">' + s.last_week + ' בשבוע האחרון</div>' +
          '</div>';
        }).join('');
      });
  }

  function rowHtml(x) {
    var d = x.details || {};
    var extra = Object.keys(d).map(function (k) {
      return d[k] ? '<span class="dt"><i>' + esc(k) + '</i> ' + esc(d[k]) + '</span>' : '';
    }).join('');

    var when = new Date(x.created_at);
    var ago = when.toLocaleDateString('he-IL') + ' · ' +
              when.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    var mail = x.mail_status === 'sent' ? ''
      : '<span class="warn" title="' + esc(x.mail_error || '') + '">המייל לא נשלח</span>';

    return '<article class="row st-' + esc(x.status) + '" data-id="' + x.id + '">' +
      '<div class="main">' +
        '<div class="line1">' +
          '<span class="kind">' + esc(KIND[x.kind] || x.kind) + '</span>' +
          '<b>' + esc(x.name) + '</b>' +
          (x.phone ? '<a class="tel" href="tel:' + esc(x.phone) + '">' + esc(x.phone) + '</a>' : '') +
          '<span class="badge b-' + esc(x.status) + '">' + esc(STATUS[x.status] || x.status) + '</span>' +
          mail +
        '</div>' +
        '<div class="line2">' +
          (x.ref_label ? '<span class="ref">' + esc(x.ref_label) + '</span>' : '') +
          (x.qty ? '<span class="dt"><i>כמות</i> ' + x.qty + '</span>' : '') +
          (Number(x.amount) > 0 ? '<span class="dt"><i>סכום</i> ₪' + x.amount + '</span>' : '') +
          extra +
          '<span class="when">' + ago + '</span>' +
        '</div>' +
        (x.admin_note ? '<div class="anote">' + esc(x.admin_note) + '</div>' : '') +
      '</div>' +
      '<div class="acts">' +
        '<button type="button" class="btn btn-g small" data-act="confirmed">אישור</button>' +
        '<button type="button" class="btn btn-s small" data-act="paid">שולם</button>' +
        '<button type="button" class="btn btn-x small" data-act="cancelled">ביטול</button>' +
      '</div>' +
    '</article>';
  }

  function load(reset) {
    if (reset) { PAGE = 0; $('#rows').innerHTML = ''; }
    var q = 'signups?select=*&order=created_at.desc' +
            '&limit=' + PER + '&offset=' + (PAGE * PER);
    if (FILTER === 'pending') q += '&status=eq.new';
    else if (FILTER !== 'all') q += '&kind=eq.' + encodeURIComponent(FILTER);
    if (Q) {
      var v = '*' + Q.replace(/[,()]/g, '') + '*';
      q += '&or=(name.ilike.' + v + ',phone.ilike.' + v + ',ref_label.ilike.' + v + ')';
    }

    return db(q).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        $('#rows').insertAdjacentHTML('beforeend', rows.map(rowHtml).join(''));
        $('#more').hidden = rows.length < PER;
        PAGE++;
        var n = $('#rows').children.length;
        $('#rowsNote').textContent = n ? 'מוצגים ' + n + ' רישומים.'
          : 'אין רישומים שתואמים לסינון.';
      });
  }

  function setStatus(id, status, el) {
    el.closest('.row').classList.add('busy');
    return db('signups?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify({ status: status }),
      prefer: 'return=representation'
    }).then(function (r) {
      return r.text().then(function (t) {
        var row = el.closest('.row');
        row.classList.remove('busy');
        if (!r.ok) { row.classList.add('err'); return; }
        var x = null;
        try { x = JSON.parse(t)[0]; } catch (e) { /* ריק — נטען מחדש */ }
        if (x) row.outerHTML = rowHtml(x);
        stats();
      });
    });
  }

  function news() {
    return db('news?select=*&order=msg_date.desc&limit=60' +
       (NEWSF === 'all' ? '' : '&status=eq.' + NEWSF))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (rows === null) {
          $('#news').innerHTML = '';
          $('#newsNote').textContent =
            'מנוע החדשות עדיין לא הופעל. כשהוא ירוץ, ההודעות מקבוצת ' +
            '«ישר ולעניין» יופיעו כאן לאישור לפני שהן עולות לאתר.';
          return;
        }
        if (!rows.length) {
          $('#newsNote').textContent = 'אין כרגע הודעות שממתינות לאישור.';
          return;
        }
        $('#news').innerHTML = rows.map(newsHtml).join('');
        $('#newsNote').textContent = rows.length + ' הודעות. מה שיאושר יופיע ' +
          'מיד בדף החדשות באתר.';
      });
  }

  function newsHtml(n) {
    var d = n.msg_date ? new Date(n.msg_date) : null;
    var when = d ? d.toLocaleDateString('he-IL') + ' · ' +
      d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';
    var body = String(n.body || '');
    var st = { 'new': 'ממתין', approved: 'מאושר', rejected: 'נדחה', expired: 'פג' };

    /* טלפון או מייל בגוף ההודעה. לרוב זה מכוון — מי שמוכר רוצה
     * שיתקשרו אליו — אבל זה הפרט שהכי מסוכן לפרסם בטעות, ולכן
     * הוא מסומן כאן לפני הלחיצה ולא מתגלה אחריה באתר. */
    var imgs = Array.isArray(n.images) ? n.images : (n.image_url ? [n.image_url] : []);
    var hay = (n.title || '') + ' ' + body;
    var pii = [];
    if (/0\d{1,2}[- ]?\d{7}|05\d[- ]?\d{3}[- ]?\d{4}/.test(hay)) pii.push('טלפון');
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(hay)) pii.push('מייל');
    var piiTag = pii.length
      ? '<span class="warn">מכיל ' + pii.join(' ו') + '</span>' : '';
    return '<article class="row nrow st-' + esc(n.status) + '" data-id="' + n.id + '">' +
      '<div class="main">' +
        '<div class="line1">' +
          (n.category ? '<span class="kind">' + esc(n.category) + '</span>' : '') +
          '<b>' + esc(n.title || '(ללא כותרת)') + '</b>' +
          '<span class="badge b-' + (n.status === 'approved' ? 'confirmed' :
            n.status === 'new' ? 'new' : 'cancelled') + '">' +
            esc(st[n.status] || n.status) + '</span>' +
          piiTag +
          '<span class="when">' + esc(when) + '</span>' +
        '</div>' +
        (body ? '<p class="nbody">' + esc(body.slice(0, 700)) +
                (body.length > 700 ? '…' : '') + '</p>' : '') +
        /* המודעה עצמה. אי אפשר להחליט אם לפרסם תמונה בלי לראות אותה. */
        (imgs.length ? '<div class="nimgs">' + imgs.map(function (u) {
          return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' +
            '<img src="' + esc(u) + '" alt="" loading="lazy"></a>';
        }).join('') + '</div>' : '') +
      '</div>' +
      '<div class="acts">' +
        '<button type="button" class="btn btn-g small" data-nact="approved">פרסום</button>' +
        '<button type="button" class="btn btn-x small" data-nact="rejected">דחייה</button>' +
      '</div>' +
    '</article>';
  }

  function setNews(id, status, el) {
    el.closest('.row').classList.add('busy');
    return db('news?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify({ status: status }),
      prefer: 'return=representation'
    }).then(function (r) {
      return r.text().then(function (t) {
        var row = el.closest('.row');
        row.classList.remove('busy');
        if (!r.ok) { row.classList.add('err'); return; }
        /* בסינון "ממתינות" פריט שטופל כבר לא שייך לרשימה —
         * להשאיר אותו שם היה מייצר תור שנראה כאילו לא התקצר. */
        if (NEWSF === 'new') { row.remove(); return; }
        var x = null;
        try { x = JSON.parse(t)[0]; } catch (e) { /* ריק */ }
        if (x) row.outerHTML = newsHtml(x);
      });
    });
  }

  function boot() {
    $('#gate').hidden = true;
    $('#panel').hidden = false;
    $('#who').textContent = (SES.user && SES.user.email) || '';

    $('#filters').innerHTML =
      [['all', 'הכול'], ['pending', 'ממתינים'], ['kibud', 'כיבוד'],
       ['shas', 'ש״ס'], ['seats', 'מקומות']]
      .map(function (f) {
        return '<button type="button" class="chip' + (f[0] === FILTER ? ' on' : '') +
          '" data-f="' + f[0] + '" aria-pressed="' + (f[0] === FILTER) + '">' +
          f[1] + '</button>';
      }).join('');

    $('#newsFilters').innerHTML =
      [['new', 'ממתינות'], ['approved', 'מפורסמות'], ['rejected', 'שנדחו'], ['all', 'הכול']]
      .map(function (f) {
        return '<button type="button" class="chip' + (f[0] === NEWSF ? ' on' : '') +
          '" data-nf="' + f[0] + '" aria-pressed="' + (f[0] === NEWSF) + '">' +
          f[1] + '</button>';
      }).join('');

    stats();
    load(true);
    news();
  }

  /* ── אירועים ────────────────────────────────────────────────── */

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#lgBtn');
    b.disabled = true;
    $('#lgHint').textContent = 'מתחבר…';
    login($('#lgEmail').value.trim(), $('#lgPass').value)
      .then(function (s) {
        saveSes(s);
        /* ההתחברות הצליחה — אבל זה לא אומר שהמשתמש אדמין.
         * מי שלא רשום ב-admins יקבל רשימה ריקה מהמסד, ואז עדיף
         * לומר לו את זה במפורש מאשר להראות לו פאנל ריק ומבלבל. */
        return db('admins?select=user_id&limit=1').then(function (r) {
          return r.ok ? r.json() : [];
        });
      })
      .then(function (rows) {
        b.disabled = false;
        if (!rows.length) { gate('המשתמש הזה אינו מורשה לנהל את האתר.'); return; }
        $('#lgHint').textContent = '';
        $('#lgPass').value = '';
        boot();
      })
      .catch(function (err) {
        b.disabled = false;
        var m = String(err.message || '');
        $('#lgHint').innerHTML = '<b style="color:#9B1E1E">' +
          (/Invalid login/i.test(m) ? 'מייל או סיסמה שגויים.' : 'ההתחברות נכשלה.') +
          '</b>';
      });
  });

  $('#logout').addEventListener('click', function () {
    clearSes();
    location.reload();
  });

  $('#rows').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var row = b.closest('.row');
    setStatus(row.dataset.id, b.dataset.act, b);
  });

  $('#filters').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    FILTER = b.dataset.f;
    [].forEach.call(this.children, function (c) {
      var on = c === b;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    load(true);
  });

  var qt = null;
  $('#q').addEventListener('input', function () {
    var v = this.value.trim();
    clearTimeout(qt);
    qt = setTimeout(function () { Q = v; load(true); }, 300);
  });

  $('#more').addEventListener('click', function () { load(false); });

  $('#news').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-nact]');
    if (!b) return;
    setNews(b.closest('.row').dataset.id, b.dataset.nact, b);
  });

  $('#newsFilters').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    NEWSF = b.dataset.nf;
    [].forEach.call(this.children, function (c) {
      var on = c === b;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    news();
  });

  /* ── התחלה ──────────────────────────────────────────────────── */
  loadCfg().then(function () {
    SES = readSes();
    if (!SES) { $('#gate').hidden = false; return; }
    /* סשן שמור — מאמתים מול השרת לפני שמראים משהו */
    db('admins?select=user_id&limit=1')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { if (rows.length) boot(); else gate(''); })
      .catch(function () { gate(''); });
  }).catch(function () {
    $('#gate').hidden = false;
    $('#lgHint').innerHTML = '<b style="color:#9B1E1E">שגיאה בטעינת התצורה.</b>';
  });
})();
