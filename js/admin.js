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
    }).then(function (j) {
      saveSes(j);
      /* הסוקט של Realtime מחזיק את ה-JWT הישן — בלי לרענן אותו שם גם,
         עדכונים חיים היו מפסיקים בשקט שעה אחרי הכניסה, בלי שום שגיאה גלויה. */
      if (window.MTRealtime) window.MTRealtime.start(API, ANON, j.access_token);
      return j;
    });
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

  function familyCardHtml(x) {
    var fam = x.family_extracted;
    if (!fam || typeof fam !== 'object') return '';
    var head = '', kids = '', addr = '';
    if (fam.head_of_household && fam.head_of_household.name) {
      head += '<b>' + esc(fam.head_of_household.name) + '</b>';
      if (fam.head_of_household.id) head += ' · ת״ז ' + esc(fam.head_of_household.id);
    }
    if (fam.spouse && fam.spouse.name) {
      head += (head ? ' · ' : '') + esc(fam.spouse.name);
      if (fam.spouse.id) head += ' · ' + esc(fam.spouse.id);
    }
    if (fam.address || fam.city) {
      addr = '<div class="fc-addr">' + esc([fam.address, fam.city].filter(Boolean).join(', ')) + '</div>';
    }
    if (Array.isArray(fam.children) && fam.children.length) {
      var items = fam.children.map(function (c) {
        var parts = [];
        if (c.name) parts.push(esc(c.name));
        if (c.id) parts.push('ת״ז ' + esc(c.id));
        if (c.birth_date) parts.push('נולד/ה ' + esc(c.birth_date));
        return '<li>' + parts.join(' · ') + '</li>';
      }).join('');
      kids = '<div class="fc-kids-title">ילדים (' + fam.children.length + '):</div>' +
             '<ul class="fc-kids">' + items + '</ul>';
    }
    if (!head && !kids && !addr) return '';
    return '<div class="family-card">' +
             '<div class="fc-title">כרטיסיית משפחה · חולץ אוטומטית מהספח</div>' +
             (head ? '<div class="fc-head">' + head + '</div>' : '') +
             addr + kids +
           '</div>';
  }

  function rowHtml(x) {
    var d = x.details || {};
    var extra = Object.keys(d).map(function (k) {
      // מסתירים שדות פנימיים של הקובץ - הכרטיסייה כבר מציגה אותם
      if (k === 'id_scan_path' || k === 'id_scan_name' || k === 'id_scan_mime') return '';
      return d[k] ? '<span class="dt"><i>' + esc(k) + '</i> ' + esc(d[k]) + '</span>' : '';
    }).join('');

    var when = new Date(x.created_at);
    var ago = when.toLocaleDateString('he-IL') + ' · ' +
              when.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    var mail = x.mail_status === 'sent' ? ''
      : '<span class="warn" title="' + esc(x.mail_error || '') + '">המייל לא נשלח</span>';

    var extraction = '';
    if (x.extraction_status === 'failed') {
      extraction = '<span class="warn" title="' + esc(x.extraction_error || '') + '">חילוץ הספח נכשל</span>';
    } else if (x.extraction_status === 'extracted') {
      extraction = '<span class="ok-badge" title="נחתם אוטומטית מהספח">✔ ספח נקרא</span>';
    }

    return '<article class="row st-' + esc(x.status) + '" data-id="' + x.id + '">' +
      '<div class="main">' +
        '<div class="line1">' +
          '<span class="kind">' + esc(KIND[x.kind] || x.kind) + '</span>' +
          '<b>' + esc(x.name) + '</b>' +
          (x.phone ? '<a class="tel" href="tel:' + esc(x.phone) + '">' + esc(x.phone) + '</a>' : '') +
          '<span class="badge b-' + esc(x.status) + '">' + esc(STATUS[x.status] || x.status) + '</span>' +
          mail + extraction +
        '</div>' +
        '<div class="line2">' +
          (x.ref_label ? '<span class="ref">' + esc(x.ref_label) + '</span>' : '') +
          (x.qty ? '<span class="dt"><i>כמות</i> ' + x.qty + '</span>' : '') +
          (Number(x.amount) > 0 ? '<span class="dt"><i>סכום</i> ₪' + x.amount + '</span>' : '') +
          extra +
          '<span class="when">' + ago + '</span>' +
        '</div>' +
        familyCardHtml(x) +
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

  /* ── התאמת תורמים (נדרים פלוס) לכרטיסי אנשי-קשר ───────────────────
     אין טלפון משותף לשני הצדדים — ההצעה היא ניחוש לפי דמיון שם, לא
     שיוך אוטומטי. המנהל מאשר/בוחר ידנית לכל שם; אחרי אישור פעם אחת
     כל תרומה עתידית מאותו שם משתייכת לבד (טריגר ב-DB). */
  var DON_MATCH_ROWS = [];
  function openDonMatch() {
    $('#donMatchRows').innerHTML = '<tr><td colspan="4">טוען…</td></tr>';
    $('#donMatchModal').hidden = false;
    Promise.all([
      db('rpc/donation_match_suggestions', { method: 'POST', body: '{}' }).then(function (r) { return r.ok ? r.json() : []; }),
      CONTACTS.length ? Promise.resolve(CONTACTS) : loadContacts().then(function () { return CONTACTS; }),
    ]).then(function (res) {
      DON_MATCH_ROWS = res[0] || [];
      renderDonMatch();
    }).catch(function () { $('#donMatchRows').innerHTML = '<tr><td colspan="4">שגיאה בטעינה.</td></tr>'; });
  }
  function renderDonMatch() {
    if (!DON_MATCH_ROWS.length) {
      $('#donMatchRows').innerHTML = '<tr><td colspan="4">כל התרומות כבר משויכות.</td></tr>';
      return;
    }
    var options = '<option value="">— בלי שיוך —</option>' + CONTACTS.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.full_name || c.surname) + '</option>';
    }).join('');
    /* מציעים בחירה אוטומטית ב-dropdown רק כשהדמיון סביר — מתחת לזה
       ה-"הצעה" נשארת טקסט-מידע בלבד, כדי לא לפתות אישור-בעיניים-עצומות
       על שיוך שגוי (זה כסף, לא תגית). */
    $('#donMatchRows').innerHTML = DON_MATCH_ROWS.map(function (m) {
      var confident = m.congregant_id && m.score >= 0.4;
      var sel = confident ? options.replace('value="' + m.congregant_id + '"', 'value="' + m.congregant_id + '" selected') : options;
      var scoreTxt = m.congregant_id
        ? Math.round((m.score || 0) * 100) + '% דמיון ל־' + esc(m.congregant_name) + (confident ? '' : ' (נמוך — לבדוק ידנית)')
        : 'אין הצעה סבירה';
      return '<tr data-client="' + esc(m.client_name) + '">' +
        '<td>' + esc(m.client_name) + '</td>' +
        '<td>₪' + Number(m.total_amount).toLocaleString('he-IL') + ' · ' + m.tx_count + '</td>' +
        '<td><select class="don-match-sel" style="width:100%">' + sel + '</select>' +
          '<div class="hint" style="margin:2px 0 0">' + scoreTxt + '</div></td>' +
        '<td><button type="button" class="btn btn-g small" data-don-match="' + esc(m.client_name) + '">שיוך</button></td>' +
      '</tr>';
    }).join('');
  }
  function assignDonMatch(clientName, row) {
    var sel = row.querySelector('.don-match-sel');
    var cid = sel.value ? Number(sel.value) : null;
    row.querySelectorAll('button,select').forEach(function (el) { el.disabled = true; });
    db('rpc/assign_donation_match', { method: 'POST', body: JSON.stringify({ p_client_name: clientName, p_congregant_id: cid }) })
      .then(function (r) {
        if (!r.ok) { alert('השיוך נכשל.'); row.querySelectorAll('button,select').forEach(function (el) { el.disabled = false; }); return; }
        DON_MATCH_ROWS = DON_MATCH_ROWS.filter(function (m) { return m.client_name !== clientName; });
        renderDonMatch();
        loadContacts();
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
        '<button type="button" class="btn btn-s small" data-cact="edit" title="עריכה">✎</button>' +
        '<button type="button" class="btn btn-g small" data-cact="sent" title="סומן כנשלח">נשלח</button>' +
        '<button type="button" class="btn btn-s small" data-cact="responded" title="הגיב">הגיב</button>' +
        '<button type="button" class="btn btn-x small" data-cact="declined" title="סירב">סירב</button>' +
      '</td>' +
    '</tr>';
  }

  function congEditHtml(c) {
    return '<tr data-id="' + c.id + '" class="editing">' +
      '<td><input class="ce-name" value="' + esc(c.full_name || c.surname) + '"></td>' +
      '<td><input class="ce-phone" value="' + esc(c.phone || '') + '"></td>' +
      '<td><input class="ce-email" value="' + esc(c.email || '') + '"></td>' +
      '<td><input class="ce-note" value="' + esc(c.match_note || '') + '"></td>' +
      '<td colspan="2" class="acts">' +
        '<button type="button" class="btn btn-g small" data-cact="save">שמירה</button>' +
        '<button type="button" class="btn btn-s small" data-cact="cancel-edit">ביטול</button>' +
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

    if (window.MTRealtime) {
      window.MTRealtime.start(API, ANON, SES.access_token);
      window.MTRealtime.onChange(function (table) {
        /* מרעננים רק פאנל גלוי — לא מבזבזים בקשות על מה שממילא לא נראה,
           ולא דורסים מצב עריכה פתוח בפאנל אחר. */
        if ((table === 'congregants' || table === 'contact_docs' || table === 'congregant_relations')
            && !document.getElementById('contactsSec').hidden) loadContacts();
        if (table === 'signups' && !document.getElementById('seudahSec').hidden && SEUDAH_EDIT_ID == null) loadSeudah();
        if (table === 'signups' && !document.getElementById('rowsSec').hidden) load(true);
      });
    }

    var startPanel = 'statsSec';
    try {
      var saved = sessionStorage.getItem(PANEL_KEY);
      if (saved && document.getElementById(saved)) startPanel = saved;
    } catch (e) { /* מצב פרטי */ }
    showPanel(startPanel);
    /* sessionStorage שומר את הפאנל האחרון שהיה פתוח, אז אחרי רענון דף
       יכול להיפתח ישר על contactsSec/seudahSec/gemachimSec בלי שאף
       קליק על הסיידבר קרה — ובלי הקריאה הזו, הנתונים שלהם היו נשארים
       ריקים (מיזוג/עריכה מסתמכים על מצב שלא נטען, ונכשלים בשקט). */
    loadPanelData(startPanel);
  }

  /* ── מעבר בין פאנלים (סיידבר) ──────────────────────────────── */
  var PANEL_KEY = 'mt-admin-panel';

  function loadPanelData(id) {
    if (id === 'seudahSec') loadSeudah();
    if (id === 'contactsSec') loadContacts();
    if (id === 'gemachimSec') loadGemachim();
  }

  function showPanel(id) {
    [].forEach.call(document.querySelectorAll('section[data-panel]'), function (s) {
      s.hidden = s.id !== id;
    });
    [].forEach.call($('#sideNav').children, function (b) {
      var on = b.dataset.panel === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    try { sessionStorage.setItem(PANEL_KEY, id); } catch (e) { /* מצב פרטי */ }
    $('.shell-main').scrollTop = 0;
    window.scrollTo(0, 0);
  }

  $('#sideNav').addEventListener('click', function (e) {
    var b = e.target.closest('.side-link');
    if (!b) return;
    showPanel(b.dataset.panel);
    loadPanelData(b.dataset.panel);
  });

  /* ── אנשי קשר (הרחבה של congregants) ─────────────────────────── */
  var CONTACTS = [];
  var DOCS = [];   /* minyan.contact_docs — ספחים/מכתבים מקושרים */
  var RELS = [];   /* minyan.congregant_relations — קישורי משפחה בין בתי-אב */
  var DONS = [];   /* minyan.congregant_donations — סיכום תרומות משוייכות */

  function loadContacts() {
    return Promise.all([
      db('congregants?select=id,surname,full_name,phone,email,tier,tier_amount,tags,role,address,id_num,last_contact_at,campaign_status,match_note&order=surname')
        .then(function (r) { return r.ok ? r.json() : []; }),
      db('contact_docs?select=id,contact_id,kind,file_path,original_name,created_at')
        .then(function (r) { return r.ok ? r.json() : []; }),
      db('congregant_relations?select=id,a_id,b_id,kind')
        .then(function (r) { return r.ok ? r.json() : []; }),
      db('congregant_donations?select=congregant_id,total_amount,tx_count,last_at')
        .then(function (r) { return r.ok ? r.json() : []; }),
    ]).then(function (res) {
      CONTACTS = res[0] || []; DOCS = res[1] || []; RELS = res[2] || []; DONS = res[3] || [];
      renderContacts();
    }).catch(function () { $('#contactsHint').hidden = false; $('#contactsHint').textContent = 'שגיאה בטעינה.'; });
  }
  function donationsFor(id) { return DONS.filter(function (d) { return d.congregant_id === id; })[0] || null; }

  function contactNameOf(id) {
    var c = CONTACTS.filter(function (x) { return x.id === id; })[0];
    return c ? (c.full_name || c.surname || ('#' + id)) : ('#' + id);
  }
  function relRowsFor(id) {
    return RELS.filter(function (r) { return r.a_id === id || r.b_id === id; }).map(function (r) {
      var otherId = r.a_id === id ? r.b_id : r.a_id;
      return { relId: r.id, otherId: otherId, kind: r.kind, name: contactNameOf(otherId) };
    });
  }
  function docsCountFor(id) { return DOCS.filter(function (d) { return d.contact_id === id; }).length; }

  function renderContacts() {
    var qStr = ($('#contactsQ').value || '').trim();
    var filt = $('#contactsFilter').value;
    var view = CONTACTS.filter(function (c) {
      var s = ((c.surname||'') + ' ' + (c.full_name||'') + ' ' + (c.phone||'') +
              ' ' + (c.email||'') + ' ' + (c.address||'') + ' ' + (c.role||'') +
              ' ' + ((c.tags||[]).join(' ')));
      if (qStr && s.indexOf(qStr) < 0) return false;
      if (filt === 'hok') return c.tier === 'שותף' || c.tier === 'מחזיק' || c.tier === 'תורם' || (c.tags||[]).indexOf('הוראת קבע') >= 0;
      if (filt === 'no-hok') return !c.tier && (c.tags||[]).indexOf('הוראת קבע') < 0;
      if (filt === 'waad') return (c.tags||[]).indexOf('ועדה') >= 0 || c.role === 'ועדה';
      if (filt === 'incomplete') return !c.phone || !c.email;
      return true;
    });
    var total = CONTACTS.length;
    var hasHok = CONTACTS.filter(function (c) { return c.tier; }).length;
    var missing = CONTACTS.filter(function (c) { return !c.phone || !c.email; }).length;
    $('#contactsKpi').innerHTML =
      '<div class="card"><div class="k">סה״כ אנשי קשר</div><div class="v">' + total + '</div></div>' +
      '<div class="card"><div class="k">עם הוראת קבע</div><div class="v">' + hasHok + '</div></div>' +
      '<div class="card"><div class="k">חסרי פרטים</div><div class="v">' + missing + '</div></div>' +
      '<div class="card"><div class="k">מוצגים</div><div class="v">' + view.length + '</div></div>';
    var body = view.map(function (c) {
      var nm = esc(c.full_name || c.surname);
      var tags = (c.tags||[]).map(function (t) { return '<span class="kind" style="margin-inline-start:4px">' + esc(t) + '</span>'; }).join('');
      var fam = relRowsFor(c.id).map(function (r) { return esc(r.kind) + ' ' + esc(r.name); }).join(', ');
      var docN = docsCountFor(c.id);
      var don = donationsFor(c.id);
      var donCell = don ? '₪' + Number(don.total_amount).toLocaleString('he-IL') + ' · ' + don.tx_count : '—';
      return '<tr data-id="' + c.id + '">' +
        '<td><b>' + nm + '</b>' + (c.role ? '<div style="font-size:12.5px;color:#6b6257">' + esc(c.role) + '</div>' : '') + '</td>' +
        '<td>' + (c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '<span style="color:#c00">חסר</span>') + '</td>' +
        '<td>' + (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '<span style="color:#c00">חסר</span>') + '</td>' +
        '<td>' + tags + '</td>' +
        '<td style="white-space:normal;font-size:12.5px;color:#6b6257;max-width:160px">' + (fam || '—') + '</td>' +
        '<td>' + (docN ? docN + ' 📎' : '—') + '</td>' +
        '<td>' + donCell + '</td>' +
        '<td>' + esc(c.campaign_status || '') + '</td>' +
        '<td><button type="button" class="btn btn-s small" data-contact-edit="' + c.id + '">עריכה</button></td>' +
      '</tr>';
    }).join('');
    $('#contactsRows').innerHTML = body || '<tr><td colspan="9" style="padding:16px;color:#6b6257">אין תוצאות.</td></tr>';
  }
  var $cq = $('#contactsQ'); if ($cq) $cq.addEventListener('input', renderContacts);
  var $cf = $('#contactsFilter'); if ($cf) $cf.addEventListener('change', renderContacts);
  $('#contactsRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-contact-edit]');
    if (b) openContactEdit(Number(b.dataset.contactEdit));
  });

  /* ── עריכה/הוספה של כרטיס איש קשר ─────────────────────────────── */
  var CE_EDIT_ID = null; /* null = כרטיס חדש */
  var CE_REL_MAP = {};   /* שם→id, למימוש ה-datalist של בחירת קרוב */

  function renderCeRelPicker() {
    var dl = $('#ceRelOptions');
    CE_REL_MAP = {};
    dl.innerHTML = CONTACTS.filter(function (c) { return c.id !== CE_EDIT_ID; }).map(function (c) {
      var nm = c.full_name || c.surname || ('#' + c.id);
      CE_REL_MAP[nm] = c.id;
      return '<option value="' + esc(nm) + '">';
    }).join('');
  }
  function renderCeRelList() {
    var list = $('#ceRelList');
    if (!CE_EDIT_ID) { list.innerHTML = '<span class="hint" style="margin:0">שומרים את הכרטיס קודם, ואז אפשר לקשר.</span>'; return; }
    var rows = relRowsFor(CE_EDIT_ID);
    list.innerHTML = rows.length ? rows.map(function (r) {
      return '<span class="rel-tag">' + esc(r.kind) + ' · ' + esc(r.name) +
        '<button type="button" data-rel-del="' + r.relId + '" title="הסרת הקישור">✕</button></span>';
    }).join('') : '<span class="hint" style="margin:0">אין קישורים עדיין.</span>';
  }
  function renderCeDocs() {
    var wrap = $('#ceDocsList');
    if (!CE_EDIT_ID) { wrap.textContent = 'שומרים את הכרטיס קודם.'; return; }
    var rows = DOCS.filter(function (d) { return d.contact_id === CE_EDIT_ID; });
    if (!rows.length) { wrap.textContent = 'אין מסמכים.'; return; }
    wrap.innerHTML = rows.map(function (d) {
      var when = d.created_at ? new Date(d.created_at).toLocaleDateString('he-IL') : '';
      return '<div>📎 ' + esc(d.original_name || d.kind) + ' <span style="color:#9b9484">(' + esc(when) + ')</span></div>';
    }).join('');
  }

  function openContactEdit(id) {
    CE_EDIT_ID = id || null;
    var c = id ? CONTACTS.filter(function (x) { return x.id === id; })[0] : null;
    $('#ceTitle').textContent = id ? 'עריכת איש קשר' : 'איש קשר חדש';
    $('#ceSurname').value  = c ? (c.surname || '') : '';
    $('#ceFullName').value = c ? (c.full_name || '') : '';
    $('#cePhone').value    = c ? (c.phone || '') : '';
    $('#ceEmail').value    = c ? (c.email || '') : '';
    $('#ceIdNum').value    = c ? (c.id_num || '') : '';
    $('#ceAddress').value  = c ? (c.address || '') : '';
    $('#ceRole').value     = c ? (c.role || '') : '';
    $('#ceTags').value     = c ? (c.tags || []).join(', ') : '';
    $('#ceTier').value     = c ? (c.tier || '') : '';
    $('#ceCampaign').value = c ? (c.campaign_status || 'new') : 'new';
    $('#ceNote').value     = c ? (c.match_note || '') : '';
    $('#ceDelete').hidden  = !id;
    $('#ceHint').textContent = '';
    $('#ceRelPick').value = '';
    renderCeRelPicker();
    renderCeRelList();
    renderCeDocs();
    $('#contactEditModal').hidden = false;
    setTimeout(function () { $('#ceSurname').focus(); }, 50);
  }
  function closeContactEdit() { $('#contactEditModal').hidden = true; CE_EDIT_ID = null; }

  function saveContact() {
    var surname = $('#ceSurname').value.trim();
    if (!surname) { $('#ceHint').textContent = 'שם משפחה חובה.'; $('#ceSurname').focus(); return; }
    var body = {
      surname: surname,
      full_name: $('#ceFullName').value.trim() || null,
      phone: $('#cePhone').value.trim() || null,
      email: $('#ceEmail').value.trim() || null,
      id_num: $('#ceIdNum').value.trim() || null,
      address: $('#ceAddress').value.trim() || null,
      role: $('#ceRole').value.trim() || null,
      tags: $('#ceTags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      tier: $('#ceTier').value || null,
      campaign_status: $('#ceCampaign').value,
      match_note: $('#ceNote').value.trim() || null,
    };
    $('#ceHint').textContent = 'שומר…';
    $('#ceSave').disabled = true;
    var isNew = !CE_EDIT_ID;
    var p = isNew
      ? db('congregants', { method: 'POST', body: JSON.stringify(body), prefer: 'return=representation' })
      : db('congregants?id=eq.' + CE_EDIT_ID, { method: 'PATCH', body: JSON.stringify(body), prefer: 'return=representation' });
    p.then(function (r) { return r.text().then(function (t) { return { ok: r.ok, t: t }; }); })
     .then(function (res) {
       $('#ceSave').disabled = false;
       if (!res.ok) { $('#ceHint').textContent = 'שמירה נכשלה — ' + (res.t || '').slice(0, 120); return; }
       closeContactEdit();
       loadContacts();
     });
  }
  function deleteContact() {
    if (!CE_EDIT_ID) return;
    if (!confirm('למחוק את הכרטיס לצמיתות? אי אפשר לשחזר.')) return;
    db('congregants?id=eq.' + CE_EDIT_ID, { method: 'DELETE' }).then(function (r) {
      if (!r.ok) { $('#ceHint').textContent = 'מחיקה נכשלה.'; return; }
      closeContactEdit();
      loadContacts();
    });
  }

  $('#contactsAddOpen').addEventListener('click', function () { openContactEdit(null); });
  $('#ceCancel').addEventListener('click', closeContactEdit);
  $('#ceSave').addEventListener('click', saveContact);
  $('#ceDelete').addEventListener('click', deleteContact);
  $('#ceRelAdd').addEventListener('click', function () {
    if (!CE_EDIT_ID) { $('#ceHint').textContent = 'שומרים את הכרטיס קודם.'; return; }
    var name = $('#ceRelPick').value.trim();
    var otherId = CE_REL_MAP[name];
    if (!otherId) { $('#ceHint').textContent = 'בוחרים שם מהרשימה המוצעת.'; return; }
    var kind = $('#ceRelKind').value;
    db('congregant_relations', { method: 'POST', body: JSON.stringify({ a_id: CE_EDIT_ID, b_id: otherId, kind: kind }) })
      .then(function (r) {
        if (!r.ok) { $('#ceHint').textContent = 'הקישור נכשל (אולי כבר קיים).'; return; }
        $('#ceRelPick').value = '';
        return loadContacts().then(renderCeRelList);
      });
  });
  $('#ceRelList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rel-del]');
    if (!b) return;
    db('congregant_relations?id=eq.' + b.dataset.relDel, { method: 'DELETE' }).then(function (r) {
      if (r.ok) loadContacts().then(renderCeRelList);
    });
  });

  /* ── זיהוי כפילויות + מיזוג ─────────────────────────────────────── */
  var MERGE_A = null, MERGE_B = null;
  var MERGE_FIELDS = [
    ['surname', 'שם משפחה'], ['full_name', 'שם מלא'], ['phone', 'טלפון'], ['email', 'מייל'],
    ['address', 'כתובת'], ['id_num', 'ת״ז'], ['role', 'תפקיד'], ['match_note', 'הערה'],
  ];

  function openDupCheck() {
    $('#dupList').innerHTML = 'בודק…';
    $('#dupModal').hidden = false;
    db('rpc/dup_candidates', { method: 'POST', body: '{}' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!rows) { $('#dupList').innerHTML = '<p class="hint">שגיאה בבדיקה.</p>'; return; }
        if (!rows.length) { $('#dupList').innerHTML = '<p class="hint" style="margin:0">לא נמצאו כפילויות חשודות כרגע.</p>'; return; }
        $('#dupList').innerHTML = rows.map(function (d) {
          return '<div class="dup-item"><div style="flex:1">' +
            '<b>' + esc(d.a_name) + '</b> ↔ <b>' + esc(d.b_name) + '</b>' +
            '<div class="reason">' + esc(d.reason) + (d.score < 1 ? ' · דמיון ' + Math.round(d.score * 100) + '%' : '') + '</div></div>' +
            '<button type="button" class="btn btn-g small" data-merge-a="' + d.a_id + '" data-merge-b="' + d.b_id + '">בדיקה למיזוג</button></div>';
        }).join('');
      }).catch(function () { $('#dupList').innerHTML = '<p class="hint">שגיאה בבדיקה.</p>'; });
  }
  $('#contactsDupCheck').addEventListener('click', openDupCheck);
  $('#dupClose').addEventListener('click', function () { $('#dupModal').hidden = true; });
  $('#dupList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-merge-a]');
    if (b) openMerge(Number(b.dataset.mergeA), Number(b.dataset.mergeB));
  });

  function openMerge(aId, bId) {
    var a = CONTACTS.filter(function (x) { return x.id === aId; })[0];
    var b = CONTACTS.filter(function (x) { return x.id === bId; })[0];
    if (!a || !b) return;
    MERGE_A = aId; MERGE_B = bId;
    $('#dupModal').hidden = true;
    var rows = MERGE_FIELDS.map(function (f) {
      var key = f[0], label = f[1];
      var av = a[key] || '', bv = b[key] || '';
      return '<div class="merge-row">' +
        '<label><input type="radio" name="mf_' + key + '" value="a"' + (av ? ' checked' : '') + '>' + (esc(av) || '<span class="hint" style="margin:0">(ריק)</span>') + '</label>' +
        '<div class="lbl">' + esc(label) + '</div>' +
        '<label><input type="radio" name="mf_' + key + '" value="b"' + (!av && bv ? ' checked' : '') + '>' + (esc(bv) || '<span class="hint" style="margin:0">(ריק)</span>') + '</label>' +
      '</div>';
    }).join('');
    $('#mergeFields').innerHTML =
      '<div class="merge-row" style="font-weight:700"><span>' + esc(a.full_name || a.surname) + ' — יישאר</span><div class="lbl">שדה</div><span>' + esc(b.full_name || b.surname) + ' — יימחק</span></div>' +
      rows;
    $('#mergeModal').hidden = false;
  }
  $('#mergeCancel').addEventListener('click', function () { $('#mergeModal').hidden = true; });
  $('#mergeConfirm').addEventListener('click', function () {
    var a = CONTACTS.filter(function (x) { return x.id === MERGE_A; })[0];
    var b = CONTACTS.filter(function (x) { return x.id === MERGE_B; })[0];
    if (!a || !b) return;
    var fields = {};
    MERGE_FIELDS.forEach(function (f) {
      var key = f[0];
      var sel = document.querySelector('input[name="mf_' + key + '"]:checked');
      var v = (sel && sel.value === 'b') ? b[key] : a[key];
      if (v) fields[key] = v;
    });
    $('#mergeConfirm').disabled = true;
    db('rpc/merge_congregants', {
      method: 'POST', body: JSON.stringify({ keep_id: MERGE_A, drop_id: MERGE_B, fields: fields }),
    }).then(function (r) {
      $('#mergeConfirm').disabled = false;
      if (!r.ok) { alert('המיזוג נכשל.'); return; }
      $('#mergeModal').hidden = true;
      loadContacts();
    });
  });
  var $cex = $('#contactsExport'); if ($cex) $cex.addEventListener('click', function () {
    var lines = ['שם,טלפון,מייל,רמה,סכום,תגיות,קמפיין'];
    CONTACTS.forEach(function (c) {
      var csv = [c.full_name || c.surname, c.phone||'', c.email||'', c.tier||'',
                 c.tier_amount||'', (c.tags||[]).join('; '), c.campaign_status||''];
      lines.push(csv.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'contacts_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  });

  /* ── גמ״חים ──────────────────────────────────────────────────── */
  var GEMS = [];
  function loadGemachim() {
    db('gemachim?select=*&order=sort_order,name').then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { GEMS = rows || []; renderGems(); $('#gemHint').textContent = 'סה״כ ' + GEMS.length + ' גמ״חים.'; })
      .catch(function () { $('#gemHint').textContent = 'שגיאה בטעינה — ייתכן שהמיגרציה 08 עוד לא הורצה.'; });
  }
  function renderGems() {
    var qStr = ($('#gemQ').value || '').trim();
    var cat = $('#gemCat').value;
    var view = GEMS.filter(function (g) {
      if (cat !== 'all' && g.category !== cat) return false;
      if (qStr) {
        var s = (g.name||'') + ' ' + (g.description||'') + ' ' + (g.contact_name||'');
        if (s.indexOf(qStr) < 0) return false;
      }
      return true;
    });
    var body = view.map(function (g) {
      return '<tr>' +
        '<td><b>' + esc(g.name) + '</b><div style="font-size:12.5px;color:#6b6257">' + esc(g.description||'') + '</div></td>' +
        '<td>' + esc(g.category||'') + '</td>' +
        '<td>' + esc(g.contact_name||'') + '</td>' +
        '<td>' + (g.phone ? '<a href="tel:' + esc(g.phone) + '">' + esc(g.phone) + '</a>' : '') + '</td>' +
        '<td>' + esc(g.hours||'') + '</td>' +
        '<td>' + (g.is_public ? '✔' : '—') + '</td>' +
        '<td><button class="btn btn-s small">עריכה</button></td>' +
      '</tr>';
    }).join('');
    $('#gemRows').innerHTML = body || '<tr><td colspan="7" style="padding:16px;color:#6b6257">אין גמ״חים ברשימה. לחצו על "+ גמ״ח חדש" להוסיף.</td></tr>';
  }
  var $gq = $('#gemQ'); if ($gq) $gq.addEventListener('input', renderGems);
  var $gc = $('#gemCat'); if ($gc) $gc.addEventListener('change', renderGems);

  /* ── סעודת שמחת תורה תשפ״ז ───────────────────────────────────── */
  var SEUDAH_REF = 'seudah-simchat-torah-5787';
  var SEUDAH_ROWS = [];
  var SEUDAH_EDIT_ID = null;

  function loadSeudah() {
    /* ref_key כולל מ-16/09 גם סיומת טלפון (ref_key:digits) כדי לאפשר כמה
       משפחות להירשם — eq. המדויק הישן כבר לא תופס אף שורה. like. עם *
       בסוף תואם גם רשומות ישנות בלי סיומת וגם חדשות איתה. */
    var q = 'signups?select=id,name,phone,qty,details,mail_status,created_at,status,' +
            'family_extracted,extraction_status,extraction_error,congregant_id&ref_key=like.'
          + encodeURIComponent(SEUDAH_REF + '*') + '&order=created_at.desc';
    db(q).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { SEUDAH_ROWS = rows || []; renderSeudah(); })
      .catch(function () { $('#seudahNote').textContent = 'שגיאה בטעינה.'; });
  }

  /* כרטיס איש הקשר המקושר נוצר/מתעדכן אוטומטית ב-DB (טריגר seudah_sync,
     ראו db/10_seudah_congregant_sync.sql) בכל הרשמה חדשה או עריכה כאן —
     לפי טלפון מנורמל, בלי לדרוס שדות שכבר מולאו ידנית בכרטיס. */
  function seudahContactBadge(r) {
    if (!r.congregant_id) return '<span class="dt" style="color:#8A5A16">לא מקושר</span>';
    return '<button type="button" class="btn btn-s xsmall" data-goto-contact="' + r.congregant_id + '">👤 לכרטיס</button>';
  }

  function seudahEditHtml(r) {
    var d = r.details || {};
    var attending = d.attending !== 'לא';
    return '<tr class="seudah-row editing" data-id="' + r.id + '">' +
      '<td><input class="se-name inp mb0" style="width:100px" value="' + esc(r.name) + '"></td>' +
      '<td><input class="se-phone inp mb0" style="width:100px" value="' + esc(r.phone || '') + '"></td>' +
      '<td><select class="se-attending inp mb0">' +
        '<option value="כן"' + (attending ? ' selected' : '') + '>כן</option>' +
        '<option value="לא"' + (!attending ? ' selected' : '') + '>לא</option>' +
      '</select></td>' +
      '<td><input class="se-adults inp mb0" type="number" min="0" max="20" style="width:52px" value="' + esc(d.adults != null ? d.adults : 0) + '"></td>' +
      '<td><input class="se-kids inp mb0" type="number" min="0" max="20" style="width:52px" value="' + esc(d.kids != null ? d.kids : 0) + '"></td>' +
      '<td>—</td>' +
      '<td><input class="se-note inp mb0" style="width:110px" value="' + esc(d.note || '') + '"></td>' +
      '<td colspan="4" class="acts">' +
        '<button type="button" class="btn btn-g small" data-seudah-save="' + r.id + '">שמירה</button> ' +
        '<button type="button" class="btn btn-s small" data-seudah-cancel="' + r.id + '">ביטול</button>' +
      '</td>' +
    '</tr>';
  }

  function saveSeudahRow(id) {
    var row = document.querySelector('.seudah-row.editing[data-id="' + id + '"]');
    var r = SEUDAH_ROWS.filter(function (x) { return x.id === id; })[0];
    if (!row || !r) return;

    var name = row.querySelector('.se-name').value.trim();
    var phone = row.querySelector('.se-phone').value.trim();
    var attending = row.querySelector('.se-attending').value === 'כן';
    var adults = Math.max(0, parseInt(row.querySelector('.se-adults').value, 10) || 0);
    var kids = Math.max(0, parseInt(row.querySelector('.se-kids').value, 10) || 0);
    var note = row.querySelector('.se-note').value.trim();
    if (name.length < 2 || phone.replace(/\D/g, '').length < 9) {
      alert('שם או טלפון לא תקינים.'); return;
    }

    var details = Object.assign({}, r.details || {}, {
      attending: attending ? 'כן' : 'לא',
      adults: attending ? adults : 0,
      kids: attending ? kids : 0,
      note: note
    });
    var patch = { name: name, phone: phone, qty: attending ? (adults + kids) : 0, details: details };

    row.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    db('signups?id=eq.' + id, {
      method: 'PATCH', body: JSON.stringify(patch), prefer: 'return=representation'
    }).then(function (resp) {
      return resp.text().then(function (t) { return { ok: resp.ok, t: t }; });
    }).then(function (res) {
      if (!res.ok) {
        alert('שמירה נכשלה.');
        row.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
        return;
      }
      var x = null;
      try { x = JSON.parse(res.t)[0]; } catch (e) { /* ריק */ }
      if (x) {
        var idx = SEUDAH_ROWS.findIndex(function (y) { return y.id === x.id; });
        if (idx >= 0) SEUDAH_ROWS[idx] = x;
      }
      SEUDAH_EDIT_ID = null;
      renderSeudah();
    });
  }

  function renderSeudah() {
    var qStr = ($('#seudahQ').value || '').trim();
    var view = qStr
      ? SEUDAH_ROWS.filter(function (r) {
          return (r.name || '').indexOf(qStr) >= 0 || (r.phone || '').indexOf(qStr) >= 0;
        })
      : SEUDAH_ROWS;

    var kpi = {
      families: 0, comes: 0, adults: 0, kids: 0, meals: 0
    };
    view.forEach(function (r) {
      kpi.families++;
      var d = r.details || {};
      if (d.attending === 'כן') {
        kpi.comes++;
        kpi.adults += Number(d.adults) || 0;
        kpi.kids += Number(d.kids) || 0;
        kpi.meals += Number(r.qty) || 0;
      }
    });

    $('#seudahKpi').innerHTML =
      '<div class="card"><div class="k">משפחות נרשמו</div><div class="v">' + kpi.families + '</div></div>' +
      '<div class="card"><div class="k">מגיעים</div><div class="v">' + kpi.comes + '</div></div>' +
      '<div class="card"><div class="k">מבוגרים</div><div class="v">' + kpi.adults + '</div></div>' +
      '<div class="card"><div class="k">ילדים</div><div class="v">' + kpi.kids + '</div></div>' +
      '<div class="card"><div class="k">סה״כ מנות</div><div class="v">' + kpi.meals + '</div></div>';

    var body = view.map(function (r) {
      if (r.id === SEUDAH_EDIT_ID) return seudahEditHtml(r);

      var d = r.details || {};
      var dt = new Date(r.created_at);
      var when = isNaN(dt) ? '' : (dt.getDate() + '/' + (dt.getMonth() + 1) + ' ' +
        String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0'));

      var famToggle = '';
      var famRow = '';
      if (r.family_extracted && typeof r.family_extracted === 'object') {
        var kidsCount = Array.isArray(r.family_extracted.children) ? r.family_extracted.children.length : 0;
        famToggle = '<button type="button" class="btn btn-s xsmall" data-fam="' + r.id + '" ' +
                     'title="הצג/הסתר כרטיסיית משפחה שחולצה מהספח">' +
                     '👨‍👩‍👧 ' + kidsCount + ' ילדים' +
                    '</button>';
        var famHtml = familyCardHtml({ family_extracted: r.family_extracted });
        famRow = '<tr class="seudah-fam" id="fam-' + r.id + '" hidden>' +
                   '<td colspan="11" style="padding:0 8px 12px">' + famHtml + '</td>' +
                 '</tr>';
      } else if (r.extraction_status === 'failed') {
        famToggle = '<span class="warn" title="' + esc(r.extraction_error || '') + '">חילוץ נכשל</span>';
      } else if (r.extraction_status === 'pending') {
        famToggle = '<span class="dt">בעיבוד…</span>';
      }

      return '<tr class="seudah-row" data-id="' + r.id + '">' +
        '<td>' + esc(r.name) + '</td>' +
        '<td><a href="tel:' + esc(r.phone) + '">' + esc(r.phone || '') + '</a></td>' +
        '<td>' + esc(d.attending || '') + '</td>' +
        '<td>' + esc(d.adults != null ? d.adults : '') + '</td>' +
        '<td>' + esc(d.kids != null ? d.kids : '') + '</td>' +
        '<td><b>' + (r.qty || 0) + '</b></td>' +
        '<td>' + esc(d.note || '') + '</td>' +
        '<td>' + famToggle + '</td>' +
        '<td>' + seudahContactBadge(r) + '</td>' +
        '<td style="white-space:nowrap;color:#6b6257;font-size:12.5px">' + esc(when) + '</td>' +
        '<td><button type="button" class="btn btn-s xsmall" data-seudah-edit="' + r.id + '">עריכה</button></td>' +
      '</tr>' + famRow;
    }).join('');
    $('#seudahRows').innerHTML = body || '<tr><td colspan="11" style="padding:16px;color:#6b6257">אין רישומים עדיין.</td></tr>';
    $('#seudahNote').textContent = 'סה״כ ' + view.length + ' רישומים.';
  }

  /* מאזין אחד קבוע — בלי re-bind בכל render — לכל הפעולות בטבלת הסעודה:
     חשיפת כרטיסיית משפחה, מעבר לכרטיס איש קשר, עריכה/שמירה/ביטול. */
  $('#seudahRows').addEventListener('click', function (e) {
    var famBtn = e.target.closest('[data-fam]');
    if (famBtn) {
      var t = document.getElementById('fam-' + famBtn.getAttribute('data-fam'));
      if (t) t.hidden = !t.hidden;
      return;
    }
    var gotoBtn = e.target.closest('[data-goto-contact]');
    if (gotoBtn) {
      var cid = Number(gotoBtn.dataset.gotoContact);
      showPanel('contactsSec');
      loadContacts().then(function () {
        var c = CONTACTS.filter(function (x) { return x.id === cid; })[0];
        var input = $('#contactsQ');
        if (input) { input.value = c ? (c.full_name || c.surname || '') : ''; renderContacts(); }
      });
      return;
    }
    var editBtn = e.target.closest('[data-seudah-edit]');
    if (editBtn) { SEUDAH_EDIT_ID = Number(editBtn.dataset.seudahEdit); renderSeudah(); return; }
    var cancelBtn = e.target.closest('[data-seudah-cancel]');
    if (cancelBtn) { SEUDAH_EDIT_ID = null; renderSeudah(); return; }
    var saveBtn = e.target.closest('[data-seudah-save]');
    if (saveBtn) { saveSeudahRow(Number(saveBtn.dataset.seudahSave)); return; }
  });

  $('#seudahQ') && $('#seudahQ').addEventListener('input', renderSeudah);
  $('#seudahExport') && $('#seudahExport').addEventListener('click', function () {
    var lines = ['שם,טלפון,מגיע,מבוגרים,ילדים,מנות,הערה,ראש המשפחה,בן/בת זוג,כתובת,שמות הילדים (מהספח),נרשם'];
    SEUDAH_ROWS.forEach(function (r) {
      var d = r.details || {};
      var f = r.family_extracted || {};
      var head = f.head_of_household ? (f.head_of_household.name || '') : '';
      var spouse = f.spouse ? (f.spouse.name || '') : '';
      var addr = [f.address, f.city].filter(Boolean).join(', ');
      var kids = Array.isArray(f.children)
        ? f.children.map(function (c) {
            var s = c.name || '';
            if (c.birth_date) s += ' (' + c.birth_date + ')';
            return s;
          }).join(' | ')
        : '';
      var csv = [r.name, r.phone, d.attending || '', d.adults || '', d.kids || '',
                 r.qty || 0, (d.note || '').replace(/\n/g, ' '),
                 head, spouse, addr, kids, r.created_at || ''];
      lines.push(csv.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'seudah_simchat_torah.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  });

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
    if (window.MTRealtime) window.MTRealtime.stop();
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

  $('#donMatchOpen').addEventListener('click', openDonMatch);
  $('#donMatchClose').addEventListener('click', function () { $('#donMatchModal').hidden = true; });
  $('#donMatchRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-don-match]');
    if (!b) return;
    assignDonMatch(b.dataset.donMatch, b.closest('tr'));
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
    var row = b.closest('tr');
    var id = row.dataset.id;
    var act = b.dataset.cact;

    if (act === 'edit') {
      var c = CONG_CACHE.filter(function (x) { return String(x.id) === id; })[0];
      if (c) row.outerHTML = congEditHtml(c);
      return;
    }
    if (act === 'cancel-edit') {
      var orig = CONG_CACHE.filter(function (x) { return String(x.id) === id; })[0];
      if (orig) row.outerHTML = congHtml(orig);
      return;
    }
    if (act === 'save') {
      var patch = {
        full_name: row.querySelector('.ce-name').value.trim(),
        phone: row.querySelector('.ce-phone').value.trim() || null,
        email: row.querySelector('.ce-email').value.trim() || null,
        match_note: row.querySelector('.ce-note').value.trim() || null
      };
      row.style.opacity = '.5';
      db('congregants?id=eq.' + id, {
        method: 'PATCH', body: JSON.stringify(patch), prefer: 'return=representation'
      }).then(function (r) {
        return r.text().then(function (t) {
          row.style.opacity = '';
          if (!r.ok) {
            alert('שמירה נכשלה (' + r.status + '). השינויים לא נשמרו.');
            var orig = CONG_CACHE.filter(function (x) { return x.id === +id; })[0];
            if (orig) row.outerHTML = congHtml(orig);
            return;
          }
          var x = null;
          try { x = JSON.parse(t)[0]; } catch (er) { /* ריק */ }
          if (x) {
            var idx = CONG_CACHE.findIndex(function (y) { return y.id === x.id; });
            if (idx >= 0) CONG_CACHE[idx] = x;
            row.outerHTML = congHtml(x);
          }
        });
      });
      return;
    }
    setCong(id, act, b);
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

  // חשיפה מינימלית ל-admin-ads.js (עורך המודעות): אותה עטיפת fetch+session+
  // רענון-טוקן, כדי לא לשכפל לוגיקת אימות בקובץ נפרד. שום דבר אחר כאן לא נחשף.
  window.MTDb = db;

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
