(function () {
  'use strict';
  // דף מכתב אישי להורה (קמפיין פיצול הגנים).
  // כניסה: קישור אישי (?n=&p=) או זיהוי לפי טלפון / שם+ילד דרך הפונקציה gan-letter.
  // המכתבים ב-data/gan-letters.json — בלי שמות הורים.
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var LETTERS = null, DATA = null, person = null, fields = [], api = null;

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

  Promise.all([
    fetch('data/gan-letters.json?v=2', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    fetch('data/site.json').then(function (r) { return r.json(); }).then(function (d) { api = d.api || {}; }).catch(function () {})
  ]).then(function (res) {
    LETTERS = res[0];
    var n = parseInt(qs.get('n'), 10);
    if (!isNaN(n)) {
      var p = qs.get('p') ? decodeP(qs.get('p')) : null;
      if (!open(n, p)) fail();
      return;
    }
    var saved = load('ganLetter');
    if (saved && open(saved.n, saved.person)) return;
    $('login').hidden = false;
  }).catch(fail);

  function fail() { $('login').hidden = true; $('main').hidden = true; $('err').hidden = false; }

  // ---------- כניסה ----------
  var byName = false;
  $('swap').onclick = function () {
    byName = !byName; $('byName').hidden = !byName; $('byPhone').hidden = byName;
    this.textContent = byName ? 'כניסה לפי מספר טלפון' : 'לא רשמתם טלפון? כניסה לפי שם ההורה ושם הילד';
    $('lmsg').textContent = '';
  };
  $('lgo').onclick = function () {
    var body = byName ? { name: $('pname').value.trim(), kid: $('kname').value.trim() } : { phone: $('phone').value.trim() };
    if (byName ? (body.name.length < 2 || body.kid.length < 2) : body.phone.replace(/\D/g, '').length < 9) {
      $('lmsg').textContent = byName ? 'נא למלא שם הורה ושם ילד.' : 'נא להקליד מספר טלפון מלא.'; return;
    }
    if (!api || !api.url) { $('lmsg').textContent = 'תקלה זמנית. נסו שוב בעוד רגע.'; return; }
    var btn = this; btn.disabled = true; $('lmsg').textContent = 'בודק…';
    fetch(api.url + '/functions/v1/gan-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api.anon, 'Authorization': 'Bearer ' + api.anon },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      btn.disabled = false;
      if (!d.ok) {
        $('lmsg').textContent = byName ? 'לא מצאנו את השם ברשימת החותמים. נסו כפי שכתבתם בדף החתימות.'
                                       : 'המספר לא נמצא ברשימת החותמים. נסו כניסה לפי שם, או פנו ליוסף שניידר.';
        return;
      }
      var p = { name: d.name, kids: d.kids, gans: d.gans };
      if (!open(d.n, p)) { $('lmsg').textContent = 'תקלה בטעינת המכתב.'; return; }
      store('ganLetter', { n: d.n, person: p });
    }).catch(function () { btn.disabled = false; $('lmsg').textContent = 'אין חיבור כרגע. נסו שוב.'; });
  };

  // ---------- המכתב ----------
  function prefill(label) {
    if (!person) return '';
    if (label === 'שם מלא') return person.name || '';
    if (label === 'שם הילד') return (person.kids || []).join(' ו');
    if (label === 'הגן') return (person.gans || []).join(' ו');
    return '';
  }
  function open(n, p) {
    var L = (LETTERS || []).filter(function (x) { return x.n === n; })[0];
    if (!L) return false;
    DATA = L; person = p;
    $('login').hidden = true; $('main').hidden = false;
    $('hello').textContent = person && person.name ? person.name + ', זה המכתב שלכם' : 'המכתב שלכם למועצה';
    var chips = $('chips'); chips.innerHTML = '';
    [['when', 'לשלוח: ' + L.date + ' בשעה ' + L.time], ['', 'אל: ' + L.to_role], ['', 'מכתב מס\' ' + L.n]].forEach(function (c) {
      var s = document.createElement('span'); s.className = 'chip ' + c[0]; s.textContent = c[1]; chips.appendChild(s);
    });
    $('toLine').textContent = L.addr || 'את הכתובת תקבלו בנפרד';
    $('toLine').style.direction = L.addr ? 'ltr' : 'rtl';
    $('subj').textContent = L.subject;
    if (L.note) { $('note').hidden = false; $('note').textContent = L.note; }
    var root = $('letter'); root.innerHTML = ''; fields = [];
    L.parts.forEach(function (pt) {
      if (pt.t !== undefined) { root.appendChild(document.createTextNode(pt.t)); return; }
      var box = document.createElement('span'); box.className = 'fld';
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
      fields.push(f); root.appendChild(box); paint(f);
    });
    return true;
  }
  function paint(f) { f.box.className = 'fld' + (f.none ? ' none' : (f.inp.value.trim() ? ' filled' : '')); }

  function buildText() {
    var miss = [], s = '';
    DATA.parts.forEach(function (pt) {
      if (pt.t !== undefined) { s += pt.t; return; }
      var f = fields.filter(function (x) { return x.p === pt; })[0];
      var v = f.inp.value.trim();
      if (f.none) { s += '\u0000'; return; }
      if (!v) { miss.push(pt.f); return; }
      s += v;
    });
    s = s.split('\n').filter(function (l) { return l.indexOf('\u0000') < 0 || l.replace(/\u0000/g, '').trim(); })
         .join('\n').replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return { text: s, miss: miss };
  }
  window.buildText = buildText;

  function copy(t, btn) {
    var done = function () { if (btn && !/✓$/.test(btn.textContent)) btn.textContent += ' ✓'; };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { fb(t); done(); });
    else { fb(t); done(); }
  }
  function fb(t) { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }
  var msg = $('msg');
  function needAll() {
    var r = buildText();
    if (r.miss.length) { msg.textContent = 'חסר למלא במכתב: ' + r.miss.join(' · ') + ' (או ללחוץ "אין לי תוספת").'; return null; }
    msg.textContent = ''; return r;
  }

  // ---------- חלון האזהרה לפני ג'ימייל ----------
  var pending = null;
  function timing() {
    var t = new Date(DATA.iso + ':00'), now = new Date(), diff = (t - now) / 60000;
    if (diff > 15) return 'future';
    if (diff > -360) return 'now';
    return 'late';
  }
  $('bG').onclick = function () {
    var r = needAll(); if (!r) return;
    pending = r;
    var when = DATA.date + ' בשעה ' + DATA.time, mode = timing(), body = $('mBody');
    $('ack').checked = false; $('mGo').disabled = true;
    if (mode === 'future') {
      $('mTitle').textContent = 'רגע! לא לוחצים "שליחה"';
      body.innerHTML = '';
      var p1 = document.createElement('div'); p1.textContent = 'המייל הזה צריך לצאת בדיוק ב:'; body.appendChild(p1);
      var big = document.createElement('div'); big.className = 'big'; big.textContent = when; body.appendChild(big);
      var ol = document.createElement('ol');
      ['בג\'ימייל, לוחצים על החץ הקטן ▾ שצמוד לכפתור "שליחה"', 'בוחרים "תזמון שליחה"', 'בוחרים "בחירת תאריך ושעה"', 'מזינים את התאריך והשעה שלמעלה', 'לוחצים "תזמון שליחה"']
        .forEach(function (s) { var li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });
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
  $('mGo').onclick = function () {
    if (!$('ack').checked || !pending) return;
    var base = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(DATA.addr || '') + '&su=' + encodeURIComponent(DATA.subject);
    var url = base + '&body=' + encodeURIComponent(pending.text);
    copy(pending.text, null);
    var extra = '';
    if (url.length > 7500) { url = base; extra = ' המכתב הועתק – בג\'ימייל לוחצים בגוף המייל ומדביקים (Ctrl+V).'; }
    if (!DATA.addr) extra += ' את כתובת הנמען תקבלו בנפרד – יש להוסיף אותה בשורת "אל".';
    $('modal').classList.remove('on');
    var a = $('after'); a.style.display = 'block';
    a.textContent = (timing() === 'future' ? 'זכרו: תזמון שליחה ל' + DATA.date + ' בשעה ' + DATA.time + ', לא "שליחה".' : 'אפשר ללחוץ "שליחה" בג\'ימייל.') + extra;
    window.open(url, '_blank');
  };

  // ---------- העתקה ידנית ----------
  $('bA').onclick = function () { if (!DATA.addr) { msg.textContent = 'את הכתובת תקבלו בנפרד.'; return; } copy(DATA.addr, this); };
  $('bS').onclick = function () { copy(DATA.subject, this); };
  $('bL').onclick = function () { var r = needAll(); if (r) copy(r.text, this); };
})();
