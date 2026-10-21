(function () {
  'use strict';
  var AYALA_MAIL = 'a0533177636@gmail.com';
  var LETTER_DATE = '20/10/26';

  // נוסח המכתב — מקור אחד גם לתצוגה וגם ל-PDF
  var L = [
    ['bsd', 'בס"ד'],
    ['to', 'לכבוד: משרד החינוך ומועצת גוש עציון'],
    ['re', 'הנדון: דרישה דחופה לפיצול גן ניסנית ודגנית במעלה עמוס – מציאות חינוכית שאינה מאפשרת מענה ראוי לילדים'],
    ['p', 'שלום רב,'],
    ['p', 'אנו פונים אליכם מתוך דאגה עמוקה וכנה לשלומם, להתפתחותם ולרווחתם של ילדי גן ניסנית וגן דגנית במעלה עמוס, ומתוך תחושה שלא ניתן עוד להשלים עם המצב הקיים בגן.'],
    ['p', 'המציאות בגן מחייבת התערבות מיידית. לא מדובר בקושי נקודתי או בתקופת הסתגלות, אלא במצב מתמשך שבו המסגרת הקיימת אינה מאפשרת לתת לכל ילד את המענה החינוכי, הרגשי והאישי שהוא זקוק לו.'],
    ['p', 'כמות הילדים בגן גדולה מדי עבור גן דו־גילאי, והעומס שנוצר מקשה מאוד על הצוות להגיע לכל ילד, להעניק לו תשומת לב מספקת, לשמור על סדר יום תקין ולייצר אווירה רגועה ובטוחה.'],
    ['p', 'חשוב לנו להדגיש באופן חד־משמעי: אין כאן האשמה של צוות הגן. להפך, הבעיה היא מערכתית ונובעת מהתנאים שבהם הצוות נדרש לעבוד. גם צוות מסור, מקצועי ואכפתי אינו יכול להיות בכמה מקומות בו־זמנית, להשגיח על מספר גדול של ילדים, להתמודד עם אירועים מורכבים במקביל ולתת לכל ילד את היחס שהוא צריך, כאשר מספר הילדים והרכב הקבוצה אינם מאפשרים זאת.'],
    ['p', 'במציאות הנוכחית מספר ילדים דורשים תשומת לב והשגחה אינטנסיביות במיוחד, ולעיתים חלק ניכר מהמשאבים של הצוות מופנה להתמודדות עם הקשיים הללו. כתוצאה מכך, הילדים השקטים, הממושמעים והמתפקדים אינם מקבלים את היחס המינימלי שהם זקוקים לו. דווקא הילדים שאינם דורשים תשומת לב מיוחדת עלולים להישאר בצד, מבלי שמישהו יבחין די הצורך בצרכים שלהם, בקשיים שלהם ובהתקדמותם.'],
    ['p', 'הגן מתנהל כיום, לפי המצב המתואר, ללא סדר ויציבות מספקים, תוך קושי ממשי בהצבת גבולות ובשמירה על שליטה בקבוצה. מצב כזה פוגע ביכולת לקיים פעילות חינוכית רציפה, ליצור הרגלים, להקנות ערכים, לקדם למידה ולהעניק לילדים תחושת ביטחון ושייכות.'],
    ['p', 'חשוב להבין גם את אופייה של הקבוצה: מדובר בגן שבו לומדים בנים רבים, והתמודדות עם קבוצה זו, בהרכבה הנוכחי ובגודלה, מחייבת צוות בעל יכולת גבוהה להצבת גבולות, נוכחות חינוכית משמעותית ומספיק כוח אדם כדי לתת מענה בו־זמני לצורכי הילדים. אין בכך ביקורת על הצוות הקיים, אלא הכרה בכך שהמסגרת הנוכחית מציבה בפניו דרישות שאינן תואמות את המשאבים ואת התנאים העומדים לרשותו.'],
    ['p', 'הילדים הגדולים שבגנים זקוקים לפיצול הגן כדי לקבל תכנים ורמת לימודים המותאמים לגילם וליכולותיהם. שלא באשמת הצוות, שאינו יכול לתת מענה מותאם לכולם, במקביל הם משתעממים, מתנהגים שלא כראוי ומפסידים לימודים משמעותיים שיכולים לקדם אותם ולהכין אותם לשלב הבא.'],
    ['p', 'לא ייתכן שהילדים ישלמו את המחיר של מסגרת שאינה מותאמת לצרכים. בשטח, כל ילד זכאי להגיע לגן שבו רואים אותו, מקשיבים לו, שומרים עליו, מקנים לו הרגלים ומאפשרים לו להתפתח. הורים שולחים את ילדיהם לגן מתוך אמון שמערכת החינוך תספק להם סביבה בטוחה ומקדמת. במצב הנוכחי מתעורר חשש ממשי שהגן אינו מצליח למלא את ייעודו במידה הנדרשת.'],
    ['p', 'לאור כל האמור, אני דורשת כי משרד החינוך ומועצת גוש עציון יפעלו בדחיפות ובאחריות לביצוע הצעדים הבאים:'],
    ['li', '1. פיצול מיידי של גן ניסנית ודגנית במעלה עמוס – אין להמתין עד לשנת הלימודים הבאה או להסתפק בהבטחות לבחינה עתידית של הנושא.'],
    ['li', '2. בחינה מחודשת של חלוקת הילדים לקבוצות גיל מתאימות, תוך התייחסות למספר הילדים, להרכב הקבוצה ולצרכים ההתפתחותיים והחינוכיים שלהם.'],
    ['li', '3. מתן פתרון מיידי לתקופת הביניים, עד להשלמת הפיצול, לרבות בחינת תגבור כוח האדם והוספת תמיכה חינוכית מתאימה.'],
    ['li', '4. קביעת לוח זמנים ברור ומחייב לביצוע, ועדכון ההורים בכתב בדבר הצעדים שיינקטו והמועד שבו ייושמו.'],
    ['p', 'אני מבקשת להבהיר: פיצול הגן אינו מותרות ואינו בקשה לשיפור נוחות העבודה. זהו צורך חינוכי ממשי ודחוף שנועד להבטיח את טובת הילדים ואת האפשרות להעניק להם מסגרת ראויה.'],
    ['p', 'הפתרון אינו יכול להיות הטלת אחריות נוספת על הצוות הקיים, אשר נדרש ממילא להתמודד עם עומס חריג. האחריות מוטלת על הגורמים המנהלים והמתקצבים, שתפקידם לבחון את המציאות בשטח ולדאוג להתאמת המסגרת לצורכי הילדים.'],
    ['p', 'אנו מצפים שמשרד החינוך ומועצת גוש עציון ייקחו אחריות, יקיימו בדיקה דחופה בגן ויפעלו לפתרון מעשי ומיידי. אין מקום להמתנה ממושכת, לדחיית ההחלטה או להסתפקות במענה כללי שאינו משנה את המציאות בפועל.'],
    ['p', 'נבקש לקבל תשובה רשמית בכתב, הכוללת התייחסות לדרישה לפיצול הגן, לצעדים המיידיים המתוכננים וללוח הזמנים לביצועם.'],
    ['p', 'טובת הילדים חייבת לעמוד בראש סדר העדיפויות. האחריות לכך מוטלת על כולנו, ובפרט על הגורמים המוסמכים לקבל את ההחלטות הנדרשות.'],
    ['sign', 'בברכה, הורים לילדים בגן ניסנית ודגנית מעלה עמוס'],
    ['p', 'תאריך המכתב: ' + LETTER_DATE]
  ];

  var $ = function (id) { return document.getElementById(id); };

  // ---------- תצוגת המכתב ----------
  var letterEl = $('letter'), olOpen = false, html = '';
  L.forEach(function (b) {
    var t = b[1].replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (b[0] === 'li') { html += (olOpen ? '' : '<ol style="list-style:none;padding:0">') + '<li>' + t + '</li>'; olOpen = true; return; }
    if (olOpen) { html += '</ol>'; olOpen = false; }
    var cls = { bsd: 'bsd', to: 'to', re: 're', sign: 'sign-off' }[b[0]];
    html += '<' + (cls === 're' ? 'div' : 'p') + (cls ? ' class="' + cls + '"' : '') + '>' + t + '</' + (cls === 're' ? 'div' : 'p') + '>';
  });
  letterEl.innerHTML = html;

  // ---------- מצב ----------
  var read = false, signed = false;
  var f = { name: $('fName'), child: $('fChild'), gan: $('fGan'), phone: $('fPhone'), ok: $('fOk') };

  function checkRead() {
    if (read) return;
    if (letterEl.scrollTop + letterEl.clientHeight >= letterEl.scrollHeight - 24) {
      read = true; $('scrollHint').classList.add('hide'); $('st1').className = 'ok'; $('st2').className = 'on'; update();
    }
  }
  letterEl.addEventListener('scroll', checkRead);
  setTimeout(checkRead, 400);

  function update() {
    var okFields = f.name.value.trim().length > 1 && f.child.value.trim().length > 1 && f.gan.value && f.ok.checked;
    if (read && okFields) $('st2').className = 'ok';
    if (signed) $('st3').className = (read && okFields) ? 'ok' : 'on';
    var ready = read && okFields && signed;
    $('send').disabled = !ready;
    var why = [];
    if (!read) why.push('לגלול ולקרוא את המכתב עד סופו');
    if (!(f.name.value.trim().length > 1)) why.push('שם האם');
    if (!(f.child.value.trim().length > 1)) why.push('שם הילד/ה');
    if (!f.gan.value) why.push('בחירת גן');
    if (!f.ok.checked) why.push('תיבת האישור');
    if (!signed) why.push('חתימה');
    $('why').textContent = ready ? '' : 'חסר: ' + why.join(' · ');
  }
  ['input', 'change'].forEach(function (ev) {
    [f.name, f.child, f.gan, f.phone, f.ok].forEach(function (e) { e.addEventListener(ev, update); });
  });

  // ---------- חתימה בכתב יד ----------
  var cv = $('sig'), cx = cv.getContext('2d'), drawing = false, last = null, strokes = 0;
  function fit() {
    var r = cv.getBoundingClientRect();
    if (r.width < 60) return false;                       // לא לאתחל לפני שהפריסה הושלמה
    var d = Math.max(window.devicePixelRatio || 1, 1);
    var w = Math.round(r.width * d), h = Math.round(r.height * d);
    if (cv.width === w && cv.height === h) return true;
    if (strokes) return true;                             // לא למחוק חתימה קיימת
    cv.width = w; cv.height = h;
    cx.lineWidth = 3.2 * d; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#0B1F4A';
    return true;
  }
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
  cv.addEventListener('pointerdown', function (e) {
    if (!fit()) return;
    drawing = true; last = pos(e);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* מצב בדיקה */ }
    cx.beginPath(); cx.arc(last.x, last.y, cx.lineWidth / 2, 0, 6.3); cx.fillStyle = '#0B1F4A'; cx.fill();
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pos(e); cx.beginPath(); cx.moveTo(last.x, last.y); cx.lineTo(p.x, p.y); cx.stroke(); last = p; e.preventDefault();
  });
  function end() { if (!drawing) return; drawing = false; strokes++; signed = true; document.querySelector('.pad').classList.add('signed'); update(); }
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  $('sigClear').addEventListener('click', function () {
    strokes = 0; signed = false; cx.clearRect(0, 0, cv.width, cv.height);
    document.querySelector('.pad').classList.remove('signed'); update();
  });
  fit(); window.addEventListener('load', fit); window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  requestAnimationFrame(function () { requestAnimationFrame(fit); });

  // ---------- יצירת ה-PDF ----------
  var PW = 1240, PH = 1754, M = 120, FONT = '30px Asst, Arial, sans-serif', LH = 46;

  function wrap(ctx, text, maxW) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function newPage() {
    var c = document.createElement('canvas'); c.width = PW; c.height = PH;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, PW, PH);
    x.direction = 'rtl'; x.textAlign = 'right'; x.textBaseline = 'alphabetic'; x.fillStyle = '#12233F'; x.font = FONT;
    // מסגרת עדינה
    x.strokeStyle = '#D9BE7C'; x.lineWidth = 3; x.strokeRect(60, 60, PW - 120, PH - 120);
    return { c: c, x: x, y: M + 20 };
  }
  function buildPdf(data) {
    var pages = [], pg = newPage(); pages.push(pg);
    var maxW = PW - 2 * M;
    function need(h) { if (pg.y + h > PH - M - 30) { pg = newPage(); pages.push(pg); } }
    L.forEach(function (b) {
      var kind = b[0];
      if (kind === 'bsd') { pg.x.font = '26px Asst, Arial'; pg.x.textAlign = 'left'; pg.x.direction = 'ltr'; pg.x.fillText('בס"ד', M, pg.y); pg.x.direction = 'rtl'; pg.x.textAlign = 'right'; pg.x.font = FONT; pg.y += LH; return; }
      if (kind === 're') { pg.x.font = '600 32px Asst, Arial'; }
      else if (kind === 'to' || kind === 'sign') { pg.x.font = '600 30px Asst, Arial'; }
      else pg.x.font = FONT;
      var lines = wrap(pg.x, b[1], maxW);
      var fnt = (kind === 're') ? '600 32px Asst, Arial' : ((kind === 'to' || kind === 'sign') ? '600 30px Asst, Arial' : FONT);
      lines.forEach(function (ln) { need(LH); pg.x.font = fnt; pg.x.fillText(ln, PW - M, pg.y); pg.y += LH; });
      pg.y += (kind === 'li') ? 8 : 20;
    });
    // בלוק החתימה
    need(640);
    var x = pg.x, y = pg.y + 10;
    x.strokeStyle = '#B08D3E'; x.lineWidth = 2; x.beginPath(); x.moveTo(M, y); x.lineTo(PW - M, y); x.stroke(); y += 52;
    x.font = '600 32px Asst, Arial'; x.fillText('חתימת הורה', PW - M, y); y += 54;
    x.font = FONT;
    [['שם האם', data.name], ['שם הילד/ה', data.child], ['הגן', data.gan], ['טלפון', data.phone || '—'], ['תאריך החתימה', data.date]].forEach(function (r) {
      x.fillText(r[0] + ': ' + r[1], PW - M, y); y += 44;
    });
    var sw = 460, sh = Math.round(sw * cv.height / cv.width);
    x.fillText('חתימה:', PW - M, y + 6);
    x.strokeStyle = '#C9C2AE'; x.lineWidth = 2; x.strokeRect(PW - M - 130 - sw - 20, y - 28, sw + 20, sh + 20);
    x.drawImage(cv, PW - M - 130 - sw - 10, y - 18, sw, sh);
    var J = window.jspdf.jsPDF, doc = new J({ unit: 'mm', format: 'a4', orientation: 'p' });
    pages.forEach(function (p, i) {
      if (i) doc.addPage();
      doc.addImage(p.c.toDataURL('image/jpeg', 0.82), 'JPEG', 0, 0, 210, 297);
    });
    return doc.output('blob');
  }

  var pdfBlob = null, pdfName = '';
  $('signForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if ($('send').disabled) return;
    var d = new Date(), pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var data = {
      name: f.name.value.trim(), child: f.child.value.trim(), gan: f.gan.value, phone: f.phone.value.trim(),
      date: pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear()
    };
    var go = function () {
      pdfBlob = buildPdf(data);
      pdfName = 'חתימה_גן_' + data.name.replace(/[^֐-׿a-zA-Z0-9 ]/g, '').replace(/ +/g, '_') + '.pdf';
      $('signForm').hidden = true; $('done').hidden = false;
      $('mailTxt').textContent = AYALA_MAIL;
      $('btnMail').href = 'mailto:' + AYALA_MAIL + '?subject=' + encodeURIComponent('חתימה על מכתב פיצול הגן – ' + data.name) +
        '&body=' + encodeURIComponent('שלום אילה, מצורף הקובץ החתום (' + pdfName + ').');
      download();
      $('done').scrollIntoView({ behavior: 'smooth', block: 'start' });
      autoSend(data);
    };
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('30px Asst'), document.fonts.load('600 30px Asst')]).then(go, go);
    } else go();
  });

  function autoSend(data) {
    var st = $('sendStatus');
    var fail = function () {
      st.textContent = 'הקובץ נשמר במכשיר, אך השליחה האוטומטית לא הצליחה.';
      st.className = 'status bad'; $('manual').hidden = false;
    };
    var fr = new FileReader();
    fr.onload = function () {
      var b64 = String(fr.result).split(',')[1] || '';
      fetch('data/site.json').then(function (r) { return r.json(); }).then(function (d) {
        var api = d.api || {};
        return fetch(api.url + '/functions/v1/gan-sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': api.anon, 'Authorization': 'Bearer ' + api.anon },
          body: JSON.stringify({ name: data.name, child: data.child, gan: data.gan, phone: data.phone, pdf: b64 })
        });
      }).then(function (r) { return r.json().then(function (j) { return r.ok && j && j.ok; }); })
        .then(function (ok) {
          if (ok) { st.textContent = '✔ נשלח אוטומטית לאילה שניידר. אין צורך לשלוח או להעלות את הקובץ — התהליך הסתיים. תודה רבה!'; st.className = 'status good'; }
          else fail();
        }, fail);
    };
    fr.onerror = fail;
    fr.readAsDataURL(pdfBlob);
  }

  function download() {
    var a = document.createElement('a'); a.href = URL.createObjectURL(pdfBlob); a.download = pdfName;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  $('btnDl').addEventListener('click', download);
  $('btnShare').addEventListener('click', function () {
    var file = new File([pdfBlob], pdfName, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'חתימה על מכתב פיצול הגן' }).catch(function () {});
    } else { download(); alert('הקובץ נשמר במכשיר. אפשר לצרף אותו לוואטסאפ או למייל.'); }
  });

  update();
})();
