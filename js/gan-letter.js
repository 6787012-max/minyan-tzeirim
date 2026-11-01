(function () {
  'use strict';
  // מכתבי ההורים למועצה (קמפיין פיצול הגנים).
  // כניסה: מייל/טלפון דרך הפונקציה gan-letter (מוכר → המכתב שלו; לא מוכר → שם+ילד+גן → מכתב פנוי),
  // או קישור אישי ?n=&p=. המכתבים ב-data/gan-letters.json — בלי שמות הורים.
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var LETTERS = null, DATA = null, person = null, api = null;
  var MARK = '✍️ ';

  function decodeP(p) {
    try {
      var b64 = p.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function callFn(body) {
    return fetch(api.url + '/functions/v1/gan-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api.anon, 'Authorization': 'Bearer ' + api.anon },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  Promise.all([
    fetch('data/gan-letters.json?v=3', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    fetch('data/site.json').then(function (r) { return r.json(); }).then(function (d) { api = d.api || {}; }).catch(function () {}),
    fetch('data/gan-contacts.json?v=1').then(function (r) { return r.json(); }).then(renderContacts).catch(function () {})
  ]).then(function (res) {
    LETTERS = res[0];
    var n = parseInt(qs.get('n'), 10);
    if (!isNaN(n)) { if (!openLetter(n, qs.get('p') ? decodeP(qs.get('p')) : null)) fail(); return; }
    var saved = load('ganLetter');
    if (saved && openLetter(saved.n, saved.person)) return;
    $('login').hidden = false;
  }).catch(fail);

  function fail() { $('login').hidden = true; $('main').hidden = true; $('err').hidden = false; }
  $('logout').onclick = function (e) { e.preventDefault(); store('ganLetter', null); location.href = 'gan-letter.html'; };

  // ---------- כניסה ----------
  var needDetails = false;
  $('lgo').onclick = function () {
    var key = $('key').value.trim();
    var okKey = /@/.test(key) ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key) : key.replace(/\D/g, '').length >= 9;
    if (!okKey) { $('lmsg').textContent = 'נא להקליד כתובת מייל או מספר טלפון מלא.'; return; }
    var body = { key: key };
    if (needDetails) {
      body.name = $('pname').value.trim(); body.kid = $('kname').value.trim(); body.gan = $('gan').value;
      if (body.name.length < 2 || body.kid.length < 2 || !body.gan) { $('lmsg').textContent = 'נא למלא שם הורה, שם ילד וגן.'; return; }
    }
    if (!api || !api.url) { $('lmsg').textContent = 'תקלה זמנית. נסו שוב בעוד רגע.'; return; }
    var btn = this; btn.disabled = true; $('lmsg').textContent = 'בודק…';
    callFn(body).then(function (d) {
      btn.disabled = false; $('lmsg').textContent = '';
      if (d.need === 'details') {
        needDetails = true; $('step2').hidden = false; $('key').readOnly = true; btn.textContent = 'המשך'; return;
      }
      if (!d.ok) { $('lmsg').textContent = 'לא הצלחנו להיכנס. בדקו את הפרטים ונסו שוב.'; return; }
      var p = { name: d.name, kids: d.kids, gans: d.gans };
      if (!openLetter(d.n, p)) { $('lmsg').textContent = 'תקלה בטעינת המכתב.'; return; }
      store('ganLetter', { n: d.n, person: p });
    }).catch(function () { btn.disabled = false; $('lmsg').textContent = 'אין חיבור כרגע. נסו שוב.'; });
  };
  $('key').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('lgo').click(); });

  // ---------- המכתב ----------
  function prefill(label) {
    if (!person) return '';
    if (label === 'שם מלא') return person.name || '';
    if (label === 'שם הילד') return (person.kids || []).join(' ו');
    if (label === 'הגן') return (person.gans || []).join(' ו');
    return '';
  }
  function openLetter(n, p) {
    var L = (LETTERS || []).filter(function (x) { return x.n === n; })[0];
    if (!L) return false;
    DATA = L; person = p;
    $('login').hidden = true; $('main').hidden = false;
    $('hello').textContent = person && person.name ? person.name + ' – המכתב שלכם למועצה' : 'המכתב שלכם למועצה';
    var chips = $('chips'); chips.innerHTML = '';
    [['when', 'לשלוח: ' + L.date + ' בשעה ' + L.time], ['', 'אל: ' + L.to_role]].forEach(function (c) {
      var s = document.createElement('span'); s.className = 'chip ' + c[0]; s.textContent = c[1]; chips.appendChild(s);
    });
    $('toLine').textContent = L.addr || 'את הכתובת תקבלו בנפרד';
    $('toLine').style.direction = L.addr ? 'ltr' : 'rtl';
    $('subj').value = L.subject;
    if (L.note) { $('note').hidden = false; $('note').textContent = L.note; }
    // המכתב: קטעי טקסט פתוחים לעריכה + משבצות אדומות (חובה למלא או "אין לי תוספת")
    var root = $('letter'); root.innerHTML = ''; segs = [];
    L.parts.forEach(function (pt) {
      if (pt.t !== undefined) {
        if (!pt.t.trim() && pt.t.indexOf('\n') < 0) { segs.push({ t: pt.t }); return; }
        var ta = document.createElement('textarea'); ta.className = 'seg'; ta.value = pt.t.replace(/^\n+|\n+$/g, '');
        ta.rows = 1; ta.oninput = function () { grow(ta); };
        root.appendChild(ta); segs.push({ ta: ta, lead: /^\n/.test(pt.t), trail: /\n$/.test(pt.t) });
        return;
      }
      var box = document.createElement('div'); box.className = 'fld';
      var lab = document.createElement('label'); lab.textContent = pt.f; box.appendChild(lab);
      var inp = document.createElement(pt.short ? 'input' : 'textarea');
      inp.value = pt.v || prefill(pt.f); inp.placeholder = pt.f; box.appendChild(inp);
      var f = { p: pt, box: box, inp: inp, none: false };
      if (!pt.req) {
        var sk = document.createElement('button'); sk.className = 'skip'; sk.type = 'button'; sk.textContent = 'אין לי תוספת';
        sk.onclick = function () { f.none = !f.none; inp.disabled = f.none; sk.textContent = f.none ? 'בכל זאת להוסיף' : 'אין לי תוספת'; paint(f); };
        box.appendChild(sk);
      }
      inp.oninput = function () { paint(f); };
      root.appendChild(box); segs.push({ f: f }); paint(f);
    });
    segs.forEach(function (s) { if (s.ta) grow(s.ta); });
    setTimeout(function () { segs.forEach(function (s) { if (s.ta) grow(s.ta); }); }, 50);
    $('after').style.display = 'none';
    return true;
  }
  var segs = [];
  function grow(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }
  function paint(f) { f.box.className = 'fld' + (f.none ? ' none' : (f.inp.value.trim() ? ' filled' : '')); }
  function buildText() {
    var miss = [], s = '';
    segs.forEach(function (x) {
      if (x.t !== undefined) { s += x.t; return; }
      if (x.ta) { s += (x.lead ? '\n' : '') + x.ta.value + (x.trail ? '\n' : ''); return; }
      var f = x.f, v = f.inp.value.trim();
      if (f.none) { s += '\u0000'; return; }
      if (!v) { miss.push(f.p.f); return; }
      s += v;
    });
    s = s.split('\n').filter(function (l) { return l.indexOf('\u0000') < 0 || l.replace(/\u0000/g, '').trim(); })
         .join('\n').replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return { text: s, miss: miss };
  }
  window.buildText = buildText;
  function letterText() { return buildText().text; }

  function copy(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {}); }
  var msg = $('msg');

  // ---------- חלון האזהרה לפני ג'ימייל ----------
  function timing() {
    var t = new Date(DATA.iso + ':00'), diff = (t - new Date()) / 60000;
    return diff > 15 ? 'future' : (diff > -360 ? 'now' : 'late');
  }
  $('bG').onclick = function () {
    var r = buildText(), text = r.text;
    if (r.miss.length) { msg.textContent = 'חסר למלא במשבצת האדומה: ' + r.miss.join(' · ') + ' (או ללחוץ "אין לי תוספת").'; return; }
    if (text.length < 40) { msg.textContent = 'המכתב קצר מדי.'; return; }
    msg.textContent = '';
    var when = DATA.date + ' בשעה ' + DATA.time, mode = timing(), body = $('mBody');
    $('ack').checked = false; $('mGo').disabled = true; body.innerHTML = '';
    if (mode === 'future') {
      $('mTitle').textContent = 'רגע! לא לוחצים "שליחה"'; $('mTitle').style.color = '';
      var p1 = document.createElement('div'); p1.textContent = 'המייל הזה צריך לצאת בדיוק ב:'; body.appendChild(p1);
      var big = document.createElement('div'); big.className = 'big'; big.textContent = when; body.appendChild(big);
      var ol = document.createElement('ol');
      ['בג\'ימייל, לוחצים על החץ הקטן ▾ שצמוד לכפתור "שליחה"', 'בוחרים "תזמון שליחה"', 'בוחרים "בחירת תאריך ושעה"', 'מזינים את התאריך והשעה שלמעלה', 'לוחצים "תזמון שליחה"']
        .forEach(function (s) { var li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });
      var li6 = document.createElement('li'); li6.style.fontWeight = 'bold'; li6.style.color = 'var(--green)';
      li6.textContent = 'חוזרים לדף הזה ולוחצים "✔ תזמנתי" – כך אנחנו יודעים שהמכתב בדרך';
      ol.appendChild(li6);
      body.appendChild(ol);
      $('ackText').textContent = 'קראתי: אני לא לוחץ/ת "שליחה", אלא מתזמן/ת ל' + when + '.';
    } else {
      $('mTitle').textContent = mode === 'now' ? 'הגיע הזמן – אפשר לשלוח עכשיו' : 'המועד עבר – שלחו עכשיו';
      $('mTitle').style.color = 'var(--green)';
      body.textContent = 'המועד שלכם הוא ' + when + '. אין צורך לתזמן: בג\'ימייל אפשר ללחוץ "שליחה" ישר.';
      $('ackText').textContent = 'הבנתי, אשלח עכשיו.';
    }
    $('modal').classList.add('on');
  };
  $('ack').onchange = function () { $('mGo').disabled = !this.checked; };
  $('mCancel').onclick = function () { $('modal').classList.remove('on'); };
  function mark(stage) {
    if (!api || !api.url) return;
    callFn({ action: 'mark', n: DATA.n, stage: stage, name: person && person.name || '' }).catch(function () {});
  }
  $('mGo').onclick = function () {
    if (!$('ack').checked) return;
    var text = letterText(), subj = $('subj').value.trim() || DATA.subject;
    var base = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(DATA.addr || '') + '&su=' + encodeURIComponent(subj);
    var url = base + '&body=' + encodeURIComponent(text), extra = '';
    copy(text);
    if (url.length > 7500) { url = base; extra = ' המכתב הועתק – בג\'ימייל לוחצים בגוף המייל ומדביקים (Ctrl+V).'; }
    if (!DATA.addr) extra += ' את כתובת הנמען תקבלו בנפרד – יש להוסיף אותה בשורת "אל".';
    $('modal').classList.remove('on');
    $('after').style.display = 'block';
    $('afterText').textContent = (timing() === 'future' ? 'זכרו: תזמון שליחה ל' + DATA.date + ' בשעה ' + DATA.time + ', לא "שליחה". אחרי שתזמנתם – לחצו כאן:' : 'אחרי שליחת המייל בג\'ימייל – לחצו כאן:') + extra;
    mark('opened');
    awaitingDone = true;
    window.open(url, '_blank');
  };
  var awaitingDone = false;
  function markDone() {
    mark('scheduled'); awaitingDone = false;
    var b = $('bDone'); b.disabled = true; b.textContent = '✔ תודה! נרשם שסיימתם';
    $('after').classList.add('done'); $('doneModal').classList.remove('on');
    store('ganDone_' + DATA.n, true);
  }
  $('bDone').onclick = markDone;
  $('dYes').onclick = markDone;
  $('dNo').onclick = function () { $('doneModal').classList.remove('on'); };
  // כשחוזרים לדף מג'ימייל — שואלים אם תזמנו
  function askDone() { if (awaitingDone && document.visibilityState === 'visible') setTimeout(function () { if (awaitingDone) $('doneModal').classList.add('on'); }, 700); }
  document.addEventListener('visibilitychange', askDone);
  window.addEventListener('focus', askDone);

  // ---------- אנשי קשר ----------
  function renderContacts(list) {
    var root = $('contacts'), g = '';
    list.forEach(function (c) {
      if (c.g !== g) { g = c.g; var h = document.createElement('div'); h.className = 'gh'; h.textContent = g; root.appendChild(h); }
      var row = document.createElement('div'); row.className = 'ct';
      var info = document.createElement('div');
      var nm = document.createElement('b'); nm.textContent = c.name; info.appendChild(nm);
      var sm = document.createElement('small'); sm.textContent = c.role; info.appendChild(sm);
      var m = document.createElement('div'); m.className = 'm'; m.textContent = c.mail; info.appendChild(m);
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'כתבו בג\'ימייל';
      b.onclick = function () { window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(c.mail), '_blank'); };
      row.appendChild(info); row.appendChild(b); root.appendChild(row);
    });
  }
})();
