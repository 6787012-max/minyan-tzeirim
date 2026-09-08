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
  var DONF = 'all';
  var CONGF = 'all', CONGQ = '';
  var CONG_STATUS = { 'new': 'טרם נשלח', drafted: 'טיוטה', sent: 'נשלח',
    responded: 'הגיב', declined: 'סירב' };

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

  function donCard(d) {
    if (!d) return '';
    return '<div class="card">' +
      '<div class="k">תרומות · נדרים פלוס</div>' +
      '<div class="n">₪' + Number(d.total_sum).toLocaleString('he-IL') + '</div>' +
      '<div class="m">' + d.total + ' עסקאות · ' + d.keva_count + ' בהוראת קבע</div>' +
      '<div class="w">₪' + Number(d.last_30d_sum).toLocaleString('he-IL') + ' ב-30 הימים האחרונים</div>' +
    '</div>';
  }

  function stats() {
    return Promise.all([
      db('stats?select=*').then(function (r) { return r.ok ? r.json() : []; }),
      db('donations_stats?select=*').then(function (r) { return r.ok ? r.json() : []; })
    ]).then(function (res) {
      var rows = res[0], don = res[1] && res[1][0];
      var cards = rows.map(function (s) {
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
      });
      cards.unshift(donCard(don));
      $('#stats').innerHTML = cards.join('') ||
        '<p class="note">עדיין אין רישומים במערכת.</p>';
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

  function donationHtml(d) {
    var when = d.transaction_time ? new Date(d.transaction_time) : null;
    var whenStr = when ? when.toLocaleDateString('he-IL') + ' · ' +
      when.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';
    return '<article class="row">' +
      '<div class="main">' +
        '<div class="line1">' +
          '<span class="kind">' + (d.kind === 'keva' ? 'הוראת קבע' : 'חד-פעמי') + '</span>' +
          '<b>' + esc(d.client_name) + '</b>' +
          '<span class="badge b-paid">₪' + Number(d.amount).toLocaleString('he-IL') + '</span>' +
        '</div>' +
        '<div class="line2">' +
          (d.kabala_id ? '<span class="dt"><i>קבלה</i> ' + esc(d.kabala_id) + '</span>' : '') +
          '<span class="when">' + esc(whenStr) + '</span>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function donations() {
    var q = 'donations?select=*&order=transaction_time.desc&limit=200';
    if (DONF !== 'all') q += '&kind=eq.' + DONF;
    return db(q).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (rows === null) { $('#donations').innerHTML = ''; $('#donNote').textContent = ''; return; }
        $('#donations').innerHTML = rows.map(donationHtml).join('');
        $('#donNote').textContent = rows.length ? 'מוצגות ' + rows.length + ' תרומות.'
          : 'אין תרומות שתואמות לסינון.';
      });
  }

  function congHtml(c) {
    var st = c.campaign_status || 'new';
    return '<tr data-id="' + c.id + '">' +
      '<td class="name">' + esc(c.full_name || c.surname) + '</td>' +
      '<td>' + (c.phone ? '<a class="tel" href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '—') + '</td>' +
      '<td>' + (c.email ? '<a class="tel" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—') + '</td>' +
      '<td class="note">' + esc(c.match_note || '') + '</td>' +
      '<td><span class="badge b-' + (st === 'new' ? 'new' : st === 'declined' ? 'cancelled' : 'paid') + '">' +
        esc(CONG_STATUS[st] || st) + '</span></td>' +
      '<td class="acts">' +
        '<button type="button" class="btn btn-g small" data-cact="sent" title="סומן כנשלח">נשלח</button>' +
        '<button type="button" class="btn btn-s small" data-cact="responded" title="הגיב">הגיב</button>' +
        '<button type="button" class="btn btn-x small" data-cact="declined" title="סירב">סירב</button>' +
      '</td>' +
    '</tr>';
  }

  var CONG_CACHE = [];

  function congKpi(rows) {
    var noPhone = rows.filter(function (c) { return !c.phone; }).length;
    var noEmail = rows.filter(function (c) { return !c.email; }).length;
    var sent = rows.filter(function (c) { return c.campaign_status && c.campaign_status !== 'new'; }).length;
    $('#congKpi').innerHTML = [
      ['סה״כ מתפללים', rows.length, ''],
      ['ללא טלפון', noPhone, noPhone ? 'pend' : ''],
      ['ללא מייל', noEmail, noEmail ? 'pend' : ''],
      ['נשלח/הגיב', sent + ' / ' + rows.length, '']
    ].map(function (k) {
      return '<div class="card"><div class="k">' + k[0] + '</div>' +
        '<div class="n"' + (k[2] ? ' style="color:#8A5A16"' : '') + '>' + k[1] + '</div></div>';
    }).join('');
  }

  function congregants() {
    var q = 'congregants?select=*&order=surname.asc&limit=100';
    if (CONGF !== 'all') q += '&campaign_status=eq.' + CONGF;
    if (CONGQ) q += '&or=(surname.ilike.*' + CONGQ + '*,full_name.ilike.*' + CONGQ + '*)';
    return db(q).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        rows = rows.filter(function (c) { return c.full_name || c.phone || c.email; });
        CONG_CACHE = rows;
        $('#congregants').innerHTML = rows.map(congHtml).join('');
        $('#congNote').textContent = rows.length + ' מתפללים מוצגים.';
        if (CONGF === 'all' && !CONGQ) congKpi(rows);
      });
  }

  function congExportCsv() {
    var head = ['שם', 'טלפון', 'מייל', 'הערה', 'סטטוס'];
    var lines = [head.join(',')];
    CONG_CACHE.forEach(function (c) {
      var row = [c.full_name || c.surname, c.phone || '', c.email || '',
        (c.match_note || '').replace(/,/g, ';'), CONG_STATUS[c.campaign_status] || c.campaign_status || ''];
      lines.push(row.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'מתפללים.csv';
    a.click();
  }

  function setCong(id, status, el) {
    var row = el.closest('tr');
    row.style.opacity = '.5';
    return db('congregants?id=eq.' + id, {
      method: 'PATCH', body: JSON.stringify({ campaign_status: status }),
      prefer: 'return=representation'
    }).then(function (r) {
      return r.text().then(function (t) {
        row.style.opacity = '';
        if (!r.ok) { row.style.background = '#FBE9E9'; return; }
        var x = null;
        try { x = JSON.parse(t)[0]; } catch (e) { /* ריק */ }
        if (x) row.outerHTML = congHtml(x);
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

    $('#donFilters').innerHTML =
      [['all', 'הכול'], ['once', 'חד-פעמי'], ['keva', 'הוראת קבע']]
      .map(function (f) {
        return '<button type="button" class="chip' + (f[0] === DONF ? ' on' : '') +
          '" data-df="' + f[0] + '" aria-pressed="' + (f[0] === DONF) + '">' +
          f[1] + '</button>';
      }).join('');

    $('#congFilters').innerHTML =
      [['all', 'הכול'], ['new', 'טרם נשלח'], ['sent', 'נשלח'], ['responded', 'הגיב']]
      .map(function (f) {
        return '<button type="button" class="chip' + (f[0] === CONGF ? ' on' : '') +
          '" data-cf="' + f[0] + '" aria-pressed="' + (f[0] === CONGF) + '">' +
          f[1] + '</button>';
      }).join('');

    stats();
    load(true);
    donations();
    congregants();
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

  $('#donFilters').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    DONF = b.dataset.df;
    [].forEach.call(this.children, function (c) {
      var on = c === b;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    donations();
  });

  $('#congExport').addEventListener('click', congExportCsv);

  $('#congAddOpen').addEventListener('click', function () {
    $('#congAddForm').hidden = false;
    $('#congAddOpen').hidden = true;
    $('#caName').focus();
  });
  $('#congAddCancel').addEventListener('click', function () {
    $('#congAddForm').hidden = true;
    $('#congAddOpen').hidden = false;
    $('#congAddForm').reset();
    $('#congAddHint').textContent = '';
  });
  $('#congAddForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#caName').value.trim();
    if (!name) return;
    var body = {
      surname: name.split(' ')[0], full_name: name,
      phone: $('#caPhone').value.trim() || null,
      email: $('#caEmail').value.trim() || null,
      match_note: 'נוסף ידנית מהפאנל'
    };
    $('#congAddHint').style.color = '#5E5E5E';
    $('#congAddHint').textContent = 'שומר…';
    db('congregants', { method: 'POST', body: JSON.stringify(body), prefer: 'return=minimal' })
      .then(function (r) {
        if (!r.ok) {
          $('#congAddHint').style.color = '#9B1E1E';
          $('#congAddHint').textContent = 'שגיאה בשמירה — ' + r.status;
          return;
        }
        $('#congAddCancel').click();
        congregants();
      });
  });

  $('#congregants').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-cact]');
    if (!b) return;
    setCong(b.closest('.row').dataset.id, b.dataset.cact, b);
  });

  $('#congFilters').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    CONGF = b.dataset.cf;
    [].forEach.call(this.children, function (c) {
      var on = c === b;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    congregants();
  });

  var cqt = null;
  $('#congQ').addEventListener('input', function () {
    var v = this.value.trim();
    clearTimeout(cqt);
    cqt = setTimeout(function () { CONGQ = v; congregants(); }, 300);
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
