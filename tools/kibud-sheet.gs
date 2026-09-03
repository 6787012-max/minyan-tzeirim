/**
 * kibud-sheet.gs — הכתיבה חזרה לגיליון הכיבוד של הרכזת.
 *
 * מה זה עושה: האתר minyan.mokad.co.il/kibud.html שולח POST לכאן,
 * והסקריפט מסמן את השם בתא הנכון בגיליון — או מנקה אותו בביטול.
 * הקריאה (מה מוצג באתר) לא עוברת דרך כאן בכלל, אלא ישירות מה-CSV
 * של הגיליון. לכן גם אם הסקריפט הזה מת, האתר ממשיך להציג נכון.
 *
 * ── מה חשוב להבין לפני שפורסים ──────────────────────────────────
 * דף ציבורי לא יכול להחזיק סוד. ה-token שיושב ב-data/kibud.json גלוי
 * לכל מי שפותח את קוד המקור של הדף. הוא מסנן בוטים, לא בני אדם.
 * ההגנה האמיתית היא בכללים עצמם:
 *   · לעולם לא דורסים שם קיים. תא תפוס נשאר תפוס, ומוחזר conflict.
 *   · ביטול מנקה רק אם השם שנשלח תואם לשם שרשום בתא.
 *   · כל פעולה נרשמת בגיליון «לוג» עם חותמת זמן — אפשר לשחזר הכל.
 * כלומר הנזק הגרוע ביותר הוא רישום בשם בדוי בתאריך פנוי, בדיוק כמו
 * בכל גיליון פתוח לקהילה. זה לא מצב חדש שנוצר כאן.
 *
 * ── פריסה ────────────────────────────────────────────────────────
 * 1. בגיליון: תוספים ← Apps Script.
 * 2. להדביק את הקובץ הזה, לשמור.
 * 3. פריסה ← פריסה חדשה ← סוג: אפליקציית אינטרנט.
 *      הפעל בתור:  אני
 *      למי יש גישה: לכל אחד
 * 4. להעתיק את כתובת האפליקציה ל-data/kibud.json בשדה sheet.apiUrl,
 *    ולמלא את אותו TOKEN בשדה sheet.token.
 */

var TOKEN = 'CHANGE-ME';        /* חייב להיות זהה ל-sheet.token באתר */
var TAB   = '';                 /* שם הלשונית. ריק = הלשונית הראשונה */
var LOG   = 'לוג';

/* ── עזר ─────────────────────────────────────────────────────────── */

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return TAB ? ss.getSheetByName(TAB) : ss.getSheets()[0];
}

/** תאריך מכל צורה סבירה → 'YYYY-MM-DD'. מחזיר '' אם זה לא תאריך. */
function iso_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + p2_(m[2]) + '-' + p2_(m[3]);
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
  if (!m) return '';
  var y = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (y < 100) y += 2000;
  /* בגיליון של הרכזת הפורמט הוא יום/חודש, כמו בכל לוח שנה ישראלי */
  return y + '-' + p2_(m[2]) + '-' + p2_(m[1]);
}
function p2_(n) { return String(n).length < 2 ? '0' + n : String(n); }

/**
 * מאתר את עמודת התאריך ואת עמודת השם לפי התוכן, לא לפי הכותרת —
 * בגיליון הזה שלוש כותרות מכילות «תאריך» או «יום», וזיהוי לפי
 * כותרת בוחר את העמודה הלא נכונה.
 */
function cols_(vals) {
  var width = 0, r, c;
  for (r = 0; r < vals.length; r++) if (vals[r].length > width) width = vals[r].length;

  var dow = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  var best = -1, bestN = 0, prof = [];

  for (c = 0; c < width; c++) {
    var dates = 0, txt = 0, len = 0, dows = 0;
    for (r = 1; r < vals.length; r++) {
      var v = vals[r][c];
      if (v === '' || v == null) continue;
      if (iso_(v)) { dates++; continue; }
      var t = String(v).trim().replace(/^יום\s*/, '');
      if (dow.indexOf(t) >= 0) { dows++; continue; }
      txt++; len += t.length;
    }
    prof.push({ c: c, txt: txt, avg: txt ? len / txt : 0, dows: dows });
    if (dates > bestN) { bestN = dates; best = c; }
  }
  if (best < 0) return null;

  /* עמודת השם = הטקסט החופשי הארוך ביותר שאינו ימי שבוע */
  var nameCol = -1, bestAvg = 0;
  for (c = 0; c < prof.length; c++) {
    var p = prof[c];
    if (p.c === best || p.txt === 0 || p.avg < 3 || p.dows > p.txt) continue;
    if (p.avg > bestAvg) { bestAvg = p.avg; nameCol = p.c; }
  }
  if (nameCol < 0) return null;
  return { date: best, name: nameCol };
}

function log_(action, iso, name, result) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(LOG) || ss.insertSheet(LOG);
    if (sh.getLastRow() === 0) {
      sh.appendRow(['מתי', 'פעולה', 'תאריך', 'שם', 'תוצאה']);
    }
    sh.appendRow([new Date(), action, iso, name, result]);
  } catch (e) { /* לוג שנכשל לא מפיל רישום אמיתי */ }
}

/* ── הנקודה שהאתר פונה אליה ──────────────────────────────────────── */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    /* נעילה — שתי נשים שנרשמות באותה שנייה לאותו ערב */
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }

  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents); } catch (err) {}

    if (TOKEN && body.token !== TOKEN) return json_({ ok: false, error: 'token' });

    var iso = iso_(body.date);
    var name = String(body.name || '').trim();
    var action = body.action === 'cancel' ? 'cancel' : 'add';
    if (!iso || !name) return json_({ ok: false, error: 'input' });

    var sh = sheet_();
    var rng = sh.getDataRange();
    var vals = rng.getValues();
    var cm = cols_(vals);
    if (!cm) { log_(action, iso, name, 'no-columns'); return json_({ ok: false, error: 'columns' }); }

    var row = -1;
    for (var r = 1; r < vals.length; r++) {
      if (iso_(vals[r][cm.date]) === iso) { row = r; break; }
    }
    if (row < 0) { log_(action, iso, name, 'no-row'); return json_({ ok: false, error: 'date' }); }

    var cur = String(vals[row][cm.name] || '').trim();
    var cell = sh.getRange(row + 1, cm.name + 1);

    if (action === 'add') {
      /* לא דורסים אף פעם. שינוי פרטים של אותה אישה — מותר. */
      if (cur && cur !== name) {
        log_(action, iso, name, 'conflict:' + cur);
        return json_({ ok: false, error: 'taken', by: cur });
      }
      cell.setValue(name);
      log_(action, iso, name, 'ok');
      return json_({ ok: true });
    }

    /* ביטול — רק מי שרשומה שם יכולה לשחרר את התאריך */
    if (!cur) { log_(action, iso, name, 'already-free'); return json_({ ok: true }); }
    if (cur !== name) {
      log_(action, iso, name, 'refused:' + cur);
      return json_({ ok: false, error: 'mismatch' });
    }
    cell.clearContent();
    log_(action, iso, name, 'ok');
    return json_({ ok: true });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** בדיקת חיים — פתיחת הכתובת בדפדפן צריכה להחזיר ok:true */
function doGet() {
  var sh = sheet_();
  var vals = sh.getDataRange().getValues();
  var cm = cols_(vals);
  return json_({
    ok: true,
    rows: vals.length - 1,
    columnsDetected: cm ? true : false
  });
}
