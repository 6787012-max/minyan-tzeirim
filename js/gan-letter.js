(function () {
  'use strict';
  // דף מכתב אישי להורה: המכתבים ב-data/gan-letters.json (בלי שמות).
  // שם ההורה, הילד והגן מגיעים בקישור עצמו: ?n=<מספר מכתב>&p=<base64url של JSON>
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var n = parseInt(qs.get('n'), 10);
  var person = null;
  try {
    var p = qs.get('p');
    if (p) {
      var b64 = p.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      person = JSON.parse(new TextDecoder().decode(bytes));
    }
  } catch (e) { person = null; }

  function fail() { $('main').style.display = 'none'; $('err').style.display = 'block'; }
  if (isNaN(n)) { fail(); return; }

  fetch('data/gan-letters.json?v=1', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (all) {
    var L = all.filter(function (x) { return x.n === n; })[0];
    if (!L) { fail(); return; }
    render(L);
  }).catch(fail);

  var fields = [], DATA = null;
  function prefill(label) {
    if (!person) return '';
    if (label === 'שם מלא') return person.name || '';
    if (label === 'שם הילד') return (person.kids || []).join(' ו');
    if (label === 'הגן') return (person.gans || []).join(' ו');
    return '';
  }
  function render(L) {
    DATA = L;
    $('hello').textContent = person && person.name ? person.name + ' שלום,' : 'שלום,';
    $('num').textContent = L.n;
    $('when').textContent = L.when;
    $('to').textContent = L.to_role;
    if (L.note) $('note').textContent = L.note;
    $('addr').textContent = L.addr || 'את הכתובת תקבלו בנפרד';
    $('addr').style.direction = L.addr ? 'ltr' : 'rtl';
    $('subj').textContent = L.subject;
    var root = $('letter');
    L.parts.forEach(function (p) {
      if (p.t !== undefined) { root.appendChild(document.createTextNode(p.t)); return; }
      var box = document.createElement('span'); box.className = 'fld';
      var lab = document.createElement('label'); lab.textContent = p.f; box.appendChild(lab);
      var inp = document.createElement(p.short ? 'input' : 'textarea');
      inp.value = p.v || prefill(p.f); inp.placeholder = p.f; box.appendChild(inp);
      var f = { p: p, box: box, inp: inp, none: false };
      if (!p.req) {
        var sk = document.createElement('button'); sk.className = 'skip'; sk.type = 'button'; sk.textContent = 'אין לי תוספת';
        sk.onclick = function () { f.none = !f.none; inp.disabled = f.none; sk.textContent = f.none ? 'בכל זאת להוסיף' : 'אין לי תוספת'; paint(f); };
        box.appendChild(sk);
      }
      inp.oninput = function () { paint(f); };
      fields.push(f); root.appendChild(box); paint(f);
    });
  }
  function paint(f) { f.box.className = 'fld' + (f.none ? ' none' : (f.inp.value.trim() ? ' filled' : '')); }

  function buildText() {
    var miss = [], s = '';
    fields.forEach(function () {});
    DATA.parts.forEach(function (p) {
      if (p.t !== undefined) { s += p.t; return; }
      var f = fields.filter(function (x) { return x.p === p; })[0];
      var v = f.inp.value.trim();
      if (f.none) { s += '\u0000'; return; }
      if (!v) { miss.push(p.f); return; }
      s += v;
    });
    s = s.split('\n').filter(function (l) { return l.indexOf('\u0000') < 0 || l.replace(/\u0000/g, '').trim(); })
         .join('\n').replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return { text: s, miss: miss };
  }
  window.buildText = buildText;

  function copy(t, btn) {
    var done = function () { if (btn) { btn.classList.add('done'); if (!/✓$/.test(btn.textContent)) btn.textContent += ' ✓'; } };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { fb(t); done(); });
    else { fb(t); done(); }
  }
  function fb(t) { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }
  var msg = $('msg');
  function needAll() {
    var r = buildText();
    if (r.miss.length) { msg.textContent = 'חסר למלא: ' + r.miss.join(' · ') + ' (או ללחוץ "אין לי תוספת").'; return null; }
    msg.textContent = ''; return r;
  }
  $('bA').onclick = function () {
    if (!DATA.addr) { msg.textContent = 'את הכתובת תקבלו בנפרד.'; return; }
    msg.textContent = ''; copy(DATA.addr, this);
  };
  $('bS').onclick = function () { msg.textContent = ''; copy(DATA.subject, this); };
  $('bL').onclick = function () { var r = needAll(); if (r) copy(r.text, this); };
  $('bG').onclick = function () {
    var r = needAll(); if (!r) return;
    var base = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(DATA.addr || '') + '&su=' + encodeURIComponent(DATA.subject);
    var url = base + '&body=' + encodeURIComponent(r.text);
    copy(r.text, null);
    if (url.length > 7500) {
      url = base;
      msg.textContent = 'המכתב ארוך, ולכן הוא הועתק. בג\'ימייל לוחצים בתוך גוף המייל ומדביקים (Ctrl+V).';
    } else {
      msg.textContent = 'נפתח מייל חדש בג\'ימייל. עכשיו: חץ ליד "שליחה" ← "תזמון שליחה".';
    }
    if (!DATA.addr) msg.textContent += ' שימו לב: את כתובת הנמען תקבלו בנפרד, ויש להוסיף אותה בשורת "אל".';
    window.open(url, '_blank');
  };
})();
