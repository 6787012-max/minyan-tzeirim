/* ocr-scan.js — זיהוי ספח ת״ז לגמרי בדפדפן, בלי שום API בתשלום.
 * מועתק ומותאם מ-anshei-kesher/js/app.js (שם זה כבר נבדק חי מול ספחים
 * אמיתיים) — הליבה הטכנית (Tesseract, PDF.js, גישת "עוגן זכר/נקבה",
 * ולידציית ת"ז) זהה; ההתאמה היא בפלט: שם/ת"ז לכל שורה מתמזגים כאן
 * ל"כרטיס משפחה" אחד (head_of_household/spouse/children) — כמו
 * שהתצוגה הקיימת בפאנל (familyCardHtml) כבר יודעת להציג — כי כאן כל
 * congregant הוא בית-אב שלם, לא אדם בודד כמו שם.
 *
 * דיוק: זה OCR חינמי על מסמך עברי מורכב, לא זיהוי-תמונה של מודל AI
 * בתשלום — יותר רועש, בפרט על ספח עם הרבה ילדים (פריסה דו-טורית).
 * לכן זו תמיד "הצעה" לאישור/תיקון, לא מילוי אוטומטי-סופי.
 */
(function () {
  'use strict';

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdfjs/pdf.worker.min.js';
  }

  /* ── PDF: שכבת טקסט אמיתית קודם, OCR רק אם אין (סריקה) ─────────── */
  async function extractFromPdf(file, onProgress) {
    onProgress && onProgress('קורא PDF…');
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var fullText = '';
    var pagesToScan = Math.min(pdf.numPages, 3);
    for (var i = 1; i <= pagesToScan; i++) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      fullText += content.items.map(function (it) { return it.str; }).join(' ') + '\n';
    }
    if (fullText.trim().length > 20) return { text: fullText, viaOcr: false, imageSource: null };

    onProgress && onProgress('ה-PDF נראה סרוק (בלי שכבת טקסט) — ממיר לתמונה ומזהה…');
    var page1 = await pdf.getPage(1);
    var viewport = page1.getViewport({ scale: 2 });
    var canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    var renderPromise = page1.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
    var renderTimeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('הצגת ה-PDF כתמונה נתקעה (מעל 20 שניות) — נסה לצלם את הדף או לצרף תמונה רגילה')); }, 20000);
    });
    await Promise.race([renderPromise, renderTimeout]);
    var text = await runTesseractOn(canvas, onProgress);
    return { text: text, viaOcr: true, imageSource: canvas };
  }

  /* ── מנוע ה-OCR עצמו ──────────────────────────────────────────── */
  async function createOcrWorker(onProgress, label) {
    return Tesseract.createWorker('heb', 1, {
      workerPath: 'js/vendor/tesseract/worker.min.js',
      corePath: 'js/vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
      langPath: 'js/vendor/tesseract/',
      gzip: true,
      logger: function (m) {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress('מזהה טקסט' + (label ? ' (' + label + ')' : '') + '… ' + Math.round(m.progress * 100) + '%');
        }
      },
    });
  }
  async function runTesseractOn(imageSource, onProgress) {
    var worker = await createOcrWorker(onProgress);
    var res = await worker.recognize(imageSource);
    await worker.terminate();
    return res.data.text;
  }

  /* ספח עם כמה ילדים הוא פריסה דו-טורית — OCR על התמונה השלמה ממזג
     שני הטורים. חיתוך התמונה לשני חצאים חופפים *לפני* ה-OCR (לא אחריו
     לפי בבוקס) נבדק חי כמדויק משמעותית יותר. */
  function cropBitmapHorizontal(bitmap, xRatioStart, xRatioEnd) {
    var x0 = Math.round(bitmap.width * xRatioStart);
    var x1 = Math.round(bitmap.width * xRatioEnd);
    var canvas = document.createElement('canvas');
    canvas.width = x1 - x0; canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, x0, 0, x1 - x0, bitmap.height, 0, 0, x1 - x0, bitmap.height);
    return canvas;
  }
  async function runTesseractDualColumn(imageSource, onProgress) {
    var bitmap = await createImageBitmap(imageSource);
    var rightCanvas = cropBitmapHorizontal(bitmap, 0, 0.58);
    var leftCanvas = cropBitmapHorizontal(bitmap, 0.42, 1);
    var worker = await createOcrWorker(onProgress, 'טור 1/2');
    var rightRes = await worker.recognize(rightCanvas);
    onProgress && onProgress('מזהה טקסט (טור 2/2)…');
    var leftRes = await worker.recognize(leftCanvas);
    await worker.terminate();
    return { rightText: rightRes.data.text, leftText: leftRes.data.text };
  }

  /* ── ולידציה + פירוק לטוקנים ──────────────────────────────────── */
  function isValidIsraeliId(id) {
    if (!/^\d{1,9}$/.test(id)) return false;
    id = id.padStart(9, '0');
    var sum = 0;
    for (var i = 0; i < 9; i++) {
      var d = Number(id[i]) * ((i % 2) + 1);
      if (d > 9) d -= 9;
      sum += d;
    }
    return sum % 10 === 0;
  }
  function editDistance(a, b) {
    var dp = [];
    for (var i = 0; i <= a.length; i++) { dp.push([i]); }
    for (var j = 1; j <= b.length; j++) dp[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }

  var FAMILY_ROLE_WORDS = {
    'בעל': { role: 'אב', gender: 'male' }, 'בעלה': { role: 'אב', gender: 'male' },
    'אישה': { role: 'אם', gender: 'female' }, 'אשתו': { role: 'אם', gender: 'female' },
    'בן': { role: 'ילד', gender: 'male' }, 'בת': { role: 'ילד', gender: 'female' },
  };
  var OCR_HEADER_WORDS_LIST = ['מדינת', 'ישראל', 'תעודת', 'זהות', 'משרד', 'הפגים', 'הפנים', 'רשות',
    'אוכלוסין', 'ספח', 'מספר', 'סידורי', 'קרבה', 'מין', 'זכר', 'נקבה', 'זבר', 'בכסלו', 'בטבת', 'בתמוז',
    'באב', 'בחשון', 'בתשרי', 'תשרי', 'המעמד', 'אזרחות', 'ישראלית', 'כתובת', 'תאריך'];
  var isHeaderWord = function (t) { return OCR_HEADER_WORDS_LIST.some(function (h) { return t === h || (t.length <= h.length + 2 && t.endsWith(h)); }); };
  var isHebWord = function (t) { return /^[֑-׿]{2,}$/.test(t); };
  var isNameWord = function (t) { return isHebWord(t) && !isHeaderWord(t) && t.indexOf('ילד') < 0; };

  /* גישה עיקרית: עוגן = טוקן זכר/נקבה (שדה "מין" בספח — אמין יותר
     מ-"בעל/אישה/בן/בת" שלא תמיד מופיע). */
  function extractByGenderAnchors(allTokens, sharedSurname) {
    var isSurnameLike = function (t) {
      return sharedSurname && isHebWord(t) &&
        (t === sharedSurname || (Math.abs(t.length - sharedSurname.length) <= 2 && editDistance(t, sharedSurname) <= 2));
    };
    var anchors = [];
    allTokens.forEach(function (t, i) {
      if (t === 'זכר' || t === 'זבר') anchors.push({ i: i, gender: 'male' });
      else if (t === 'נקבה') anchors.push({ i: i, gender: 'female' });
    });
    return anchors.map(function (a, idx) {
      var prevEnd = idx > 0 ? anchors[idx - 1].i + 1 : 0;
      var before = allTokens.slice(Math.max(prevEnd, a.i - 12), a.i);
      var nextStart = idx < anchors.length - 1 ? anchors[idx + 1].i : allTokens.length;
      var after = allTokens.slice(a.i + 1, Math.min(nextStart, a.i + 6));
      var isChild = allTokens.slice(Math.max(0, a.i - 20), a.i).some(function (t) { return t.indexOf('ילד') >= 0; });
      var nameWords = before.filter(function (t) { return isNameWord(t) && !isSurnameLike(t); });
      var idRaw = before.concat(after).map(function (t) { var m = t.match(/\d{7,10}/); return m ? m[0] : null; }).filter(Boolean);
      var id_number = '';
      for (var k = 0; k < idRaw.length; k++) {
        var cand = idRaw[k];
        var opts = [cand, cand.slice(0, 9), cand.slice(-9), cand.slice(1, 9)];
        var valid = opts.find(function (v) { return v.length >= 7 && isValidIsraeliId(v); });
        if (valid) { id_number = valid.padStart(9, '0'); break; }
      }
      var joined = before.concat(after).join(' ');
      var dateM = joined.match(/(\d{1,2})[.,](\d{1,2})[.,](\d{4})/);
      var birth_date = '';
      if (dateM) birth_date = dateM[3] + '-' + dateM[2].padStart(2, '0') + '-' + dateM[1].padStart(2, '0');
      return {
        role: isChild ? 'ילד' : (a.gender === 'male' ? 'אב' : 'אם'), gender: a.gender,
        first_name: nameWords.join(' ') || '', last_name: sharedSurname || '', id_number: id_number, birth_date: birth_date,
      };
    });
  }
  /* גיבוי — רק אם הגישה הראשית לא מצאה כלום: מסמכים שכן כותבים
     בעל/אישה/בן/בת ליד השם, בשורה אחת. */
  function extractByRoleWordsPerLine(text, sharedSurname) {
    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var rows = [];
    lines.forEach(function (line) {
      var tokens = line.split(/\s+/);
      var match = null;
      if (tokens.indexOf('ראש') >= 0 && tokens.indexOf('משפחה') >= 0) match = { role: 'אב', gender: 'male' };
      else { var rt = tokens.find(function (t) { return FAMILY_ROLE_WORDS[t]; }); if (rt) match = FAMILY_ROLE_WORDS[rt]; }
      if (!match) return;
      var idCands = tokens.map(function (t) { var m = t.match(/^\d{7,10}$/); return m ? m[0] : null; }).filter(Boolean);
      var idM = idCands.find(isValidIsraeliId);
      var dateM = line.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
      var birth_date = '';
      if (dateM) birth_date = dateM[3] + '-' + dateM[2].padStart(2, '0') + '-' + dateM[1].padStart(2, '0');
      var nameWords = tokens.filter(function (t) { return isNameWord(t) && !FAMILY_ROLE_WORDS[t] && t !== sharedSurname && t !== 'ראש' && t !== 'משפחה'; });
      if (!nameWords.length) return;
      rows.push({ role: match.role, gender: match.gender, first_name: nameWords.join(' '), last_name: sharedSurname || '',
        id_number: idM ? idM.padStart(9, '0') : '', birth_date: birth_date });
    });
    return rows;
  }
  function extractFamilyFromOcrText(text, knownSurname) {
    var allTokens = text.split(/\s+/).filter(Boolean);
    var sharedSurname = knownSurname || null;
    if (!sharedSurname) {
      var wordCounts = {};
      allTokens.forEach(function (t) { if (isNameWord(t)) wordCounts[t] = (wordCounts[t] || 0) + 1; });
      var maxCount = 0;
      Object.keys(wordCounts).forEach(function (w) { if (wordCounts[w] > maxCount) { maxCount = wordCounts[w]; sharedSurname = w; } });
    }
    var results = extractByGenderAnchors(allTokens, sharedSurname);
    if (!results.length) results = extractByRoleWordsPerLine(text, sharedSurname);
    return results;
  }

  /* שורות שטוחות (אב/אם/ילדים) → כרטיס משפחה, באותה צורה שה-Gemini
     flow הישן כבר הפיק (head_of_household/spouse/children) — כדי
     שאותה תצוגה (familyCardHtml) ואותו "מילוי אוטומטי" ימשיכו לעבוד. */
  function rowsToFamilyCard(rows) {
    var father = rows.find(function (r) { return r.role === 'אב'; });
    var mother = rows.find(function (r) { return r.role === 'אם'; });
    var kids = rows.filter(function (r) { return r.role === 'ילד'; });
    var nameOf = function (p) { return (p.first_name + ' ' + p.last_name).trim(); };
    var card = { children: kids.map(function (k) { return { name: nameOf(k), id: k.id_number, birth_date: k.birth_date, gender: k.gender }; }) };
    if (father) card.head_of_household = { name: nameOf(father), id: father.id_number };
    else if (mother) card.head_of_household = { name: nameOf(mother), id: mother.id_number };
    if (father && mother) card.spouse = { name: nameOf(mother), id: mother.id_number };
    return card;
  }

  /* ── נקודת הכניסה: קובץ (File) → {family, rawText, viaOcr} ──────── */
  async function scanFile(file, onProgress) {
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    onProgress && onProgress(isPdf ? 'קורא PDF…' : 'טוען מנוע זיהוי טקסט…');

    var text, imageSourceForRetry = null, viaOcr = true;
    if (isPdf) {
      var r = await extractFromPdf(file, onProgress);
      text = r.text; viaOcr = r.viaOcr; imageSourceForRetry = r.imageSource;
    } else {
      text = await runTesseractOn(file, onProgress);
      imageSourceForRetry = file;
    }

    var rows = extractFamilyFromOcrText(text);
    if (rows.length > 1 && imageSourceForRetry) {
      try {
        onProgress && onProgress('זוהו כמה אנשים — מנסה זיהוי מדויק יותר לפי טורים…');
        var dual = await runTesseractDualColumn(imageSourceForRetry, onProgress);
        var known = rows.find(function (p) { return p.last_name; });
        var dualRows = extractFamilyFromOcrText(dual.rightText, known && known.last_name)
          .concat(extractFamilyFromOcrText(dual.leftText, known && known.last_name));
        if (dualRows.length) rows = rows.concat(dualRows);
      } catch (e) { /* הזיהוי הדו-טורי נכשל — נשארים עם התוצאה הרגילה */ }
    }

    return { family: rowsToFamilyCard(rows), rawRows: rows, rawText: text, viaOcr: viaOcr };
  }

  window.MTOcr = { scanFile: scanFile };
})();
