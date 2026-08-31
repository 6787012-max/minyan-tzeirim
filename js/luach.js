/* luach.js — לוח עברי וזמני חמה, בלי תלויות חיצוניות.
 *
 * מה כאן:
 *   Luach.hebrew(date)      → {y,m,d, str}  תאריך עברי באותיות
 *   Luach.sun(date, geo)    → {sunrise, sunset}  כ-Date מקומי
 *   Luach.nextShabbat(date) → {fri, sat}
 *
 * המרת התאריך העברי היא אריתמטיקה טהורה (אלגוריתם Calendrical Calculations)
 * ואומתה מול pyluach על 40 שנה יום-יום. שמות הפרשיות *אינם* מחושבים כאן —
 * הם מגיעים מטבלה סטטית ב-data/shabbat.json שנוצרה מ-pyluach. ראה README.
 */
(function (root) {
  'use strict';

  /* ── ימים מוחלטים (RD) ──────────────────────────────────────────── */

  function gregLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  // RD של 1 בינואר שנה y
  function gregYearStart(y) {
    var p = y - 1;
    return 365 * p + Math.floor(p / 4) - Math.floor(p / 100) + Math.floor(p / 400) + 1;
  }

  var MDAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  function rdFromGreg(y, m, d) {
    return gregYearStart(y) - 1 + MDAYS[m - 1] + (m > 2 && gregLeap(y) ? 1 : 0) + d;
  }

  var HEB_EPOCH = -1373427;   // RD של א׳ תשרי שנת 1

  function hebLeap(y) { return ((7 * y + 1) % 19) < 7; }
  function monthsInHebYear(y) { return hebLeap(y) ? 13 : 12; }

  function elapsedDays(year) {
    var monthsElapsed = Math.floor((235 * year - 234) / 19);
    var partsElapsed = 12084 + 13753 * monthsElapsed;
    var day = monthsElapsed * 29 + Math.floor(partsElapsed / 25920);
    if (((3 * (day + 1)) % 7) < 3) day += 1;
    return day;
  }

  function yearCorrection(year) {
    var last = elapsedDays(year - 1),
        now = elapsedDays(year),
        next = elapsedDays(year + 1);
    if (next - now === 356) return 2;
    if (now - last === 382) return 1;
    return 0;
  }

  function hebNewYear(year) {           // RD של א׳ תשרי
    return HEB_EPOCH + elapsedDays(year) + yearCorrection(year);
  }

  function daysInHebYear(y) { return hebNewYear(y + 1) - hebNewYear(y); }
  function longCheshvan(y) { return daysInHebYear(y) % 10 === 5; }
  function shortKislev(y) { return daysInHebYear(y) % 10 === 3; }

  // מספור חודשים: 1=ניסן … 7=תשרי … 12=אדר/אדר א׳, 13=אדר ב׳
  function daysInHebMonth(m, y) {
    if (m === 2 || m === 4 || m === 6 || m === 10 || m === 13) return 29;
    if (m === 12 && !hebLeap(y)) return 29;
    if (m === 8 && !longCheshvan(y)) return 29;
    if (m === 9 && shortKislev(y)) return 29;
    return 30;
  }

  function rdFromHeb(y, m, d) {
    var rd = hebNewYear(y) + d - 1, mm;
    if (m < 7) {
      for (mm = 7; mm <= monthsInHebYear(y); mm++) rd += daysInHebMonth(mm, y);
      for (mm = 1; mm < m; mm++) rd += daysInHebMonth(mm, y);
    } else {
      for (mm = 7; mm < m; mm++) rd += daysInHebMonth(mm, y);
    }
    return rd;
  }

  function hebFromRd(rd) {
    var y = Math.floor((rd - HEB_EPOCH) / 366);
    while (hebNewYear(y + 1) <= rd) y++;
    // החודש הראשון של *השנה האזרחית-עברית* הוא תשרי, אבל המספור מתחיל בניסן
    var m = (rd < rdFromHeb(y, 1, 1)) ? 7 : 1;
    while (rd > rdFromHeb(y, m, daysInHebMonth(m, y))) m++;
    var d = rd - rdFromHeb(y, m, 1) + 1;
    return { y: y, m: m, d: d };
  }

  /* ── מספרים באותיות עבריות ──────────────────────────────────────── */

  var ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  var TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  var HUNDS = ['', 'ק', 'ר', 'ש', 'ת'];

  function numToHeb(n, geresh) {
    var s = '', h;
    while (n >= 400) { s += 'ת'; n -= 400; }
    h = Math.floor(n / 100); if (h) { s += HUNDS[h]; n -= h * 100; }
    if (n === 15) { s += 'טו'; n = 0; }
    else if (n === 16) { s += 'טז'; n = 0; }
    else { s += TENS[Math.floor(n / 10)]; n %= 10; s += ONES[n]; }
    if (!geresh) return s;
    if (s.length === 1) return s + '׳';
    return s.slice(0, -1) + '״' + s.slice(-1);
  }

  var MONTH_NAMES = ['', 'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול',
                     'תשרי', 'חשוון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב׳'];

  function monthName(m, y) {
    if (m === 12 && hebLeap(y)) return 'אדר א׳';
    return MONTH_NAMES[m];
  }

  var DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  /* ── זמני חמה (NOAA) ────────────────────────────────────────────── */

  var RAD = Math.PI / 180;

  function julianDay(rd) { return rd + 1721424.5; }

  /* NOAA Solar Calculator — המימוש המלא (לא הקירוב).
     מחזיר דקות מחצות UTC, או null אם השמש לא חוצה את הזווית באותו יום.
     אומת מול מימוש עצמאי בפייתון: סטייה מרבית 0.00 דקות על 730 ימים. */
  function solarEvent(rd, lat, lon, zenith, rising) {
    var jd = julianDay(rd), t = 0.5, i;
    for (i = 0; i < 6; i++) {
      var jc = (jd + t - 2451545.0) / 36525.0;
      var gml = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
      var gma = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
      var ecc = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
      var seq = Math.sin(gma * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
              + Math.sin(2 * gma * RAD) * (0.019993 - 0.000101 * jc)
              + Math.sin(3 * gma * RAD) * 0.000289;
      var stl = gml + seq;
      var sal = stl - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * RAD);
      var oc = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
      var occ = oc + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * RAD);
      var decl = Math.asin(Math.sin(occ * RAD) * Math.sin(sal * RAD)) / RAD;
      var vy = Math.pow(Math.tan(occ / 2 * RAD), 2);
      var eq = 4 * (vy * Math.sin(2 * gml * RAD)
             - 2 * ecc * Math.sin(gma * RAD)
             + 4 * ecc * vy * Math.sin(gma * RAD) * Math.cos(2 * gml * RAD)
             - 0.5 * vy * vy * Math.sin(4 * gml * RAD)
             - 1.25 * ecc * ecc * Math.sin(2 * gma * RAD)) / RAD;
      var cosH = Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl * RAD))
               - Math.tan(lat * RAD) * Math.tan(decl * RAD);
      if (cosH > 1 || cosH < -1) return null;
      var ha = Math.acos(cosH) / RAD;
      var noon = (720 - 4 * lon - eq) / 1440;
      t = rising ? noon - ha * 4 / 1440 : noon + ha * 4 / 1440;
    }
    return t * 24;                                  // שעות UTC
  }

  // הפרש שעון ישראל מ-UTC לתאריך נתון (2 בחורף, 3 בקיץ)
  // שעון קיץ בישראל: מיום שישי לפני יום ראשון האחרון במרץ, עד יום ראשון אחרון באוקטובר.
  function ilOffset(y, m, d) {
    var rd = rdFromGreg(y, m, d);
    // rd % 7 == 0 הוא יום ראשון (RD 1 = 1.1.1 = יום שני)
    var mar = rdFromGreg(y, 3, 31);
    var lastSunMar = mar - (mar % 7);                     // יום ראשון האחרון במרץ
    var startDst = lastSunMar - 2;                        // יום שישי שלפניו, 02:00
    var oct = rdFromGreg(y, 10, 31);
    var endDst = oct - (oct % 7);                         // יום ראשון האחרון באוקטובר
    return (rd >= startDst && rd < endDst) ? 3 : 2;
  }

  // בונה Date שה-getHours שלו הוא שעון ישראל, בלי תלות באזור הזמן של המכשיר.
  function mkTime(y, m, d, utcHours, off) {
    var t = utcHours + off, day = d;
    while (t < 0) { t += 24; day -= 1; }
    while (t >= 24) { t -= 24; day += 1; }
    var sec = Math.round(t * 3600);
    return new Date(y, m - 1, day, Math.floor(sec / 3600),
                    Math.floor(sec / 60) % 60, sec % 60, 0);
  }

  /* ── תקופת הסליחות (נוסח אשכנז) ───────────────────────────────
     מיום ראשון שלפני ראש השנה — ואם נותרו פחות מארבעה ימים, שבוע קודם —
     ועד יום הכיפורים ועד בכלל. */
  function isSelichotRd(rd) {
    var h = hebFromRd(rd);
    if (h.m !== 6 && h.m !== 7) return false;      // רק אלול ותשרי
    if (h.m === 7 && h.d > 10) return false;       // אחרי יום הכיפורים
    // ראש השנה הרלוונטי: אם אנחנו באלול — של השנה הבאה; אם בתשרי — של השנה הנוכחית
    var rhYear = (h.m === 6) ? h.y + 1 : h.y;
    var rh = hebNewYear(rhYear);                   // RD של א׳ תשרי
    var start = rh - (rh % 7);                     // יום ראשון של אותו שבוע
    if (start >= rh) start -= 7;
    if (rh - start < 4) start -= 7;                // פחות מ-4 ימי סליחות → שבוע קודם
    return rd >= start && rd <= rh + 9;            // עד י׳ בתשרי ועד בכלל
  }



  /* ── זמני היום ההלכתיים ──────────────────────────────────────────
     כל הזמנים נגזרים משני עוגנים אסטרונומיים: הנץ והשקיעה בגובה פני הים.
     "שעה זמנית" = שתים־עשרה חלקים שווים בין הנץ לשקיעה (שיטת הגר"א).

     הזוויות שמתחת לאופק:
       עלות השחר  16.1°   ·  משיכיר 11.5°  ·  צאת הכוכבים 8.5°
     רבנו תם מחושב כ-72 דקות אחרי השקיעה.

     ⚠️ אלה חישובים אסטרונומיים לפי שיטות מקובלות, לא פסק הלכה.
     לוח מודפס של הרב המקומי גובר. */
  function zmanim(date, geo) {
    var y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    var rd = rdFromGreg(y, m, d), off = ilOffset(y, m, d);

    function at(zenith, rising) {
      var h = solarEvent(rd, geo.lat, geo.lon, zenith, rising);
      return h === null ? null : mkTime(y, m, d, h, off);
    }
    var sunrise = at(90.833, true), sunset = at(90.833, false);
    if (!sunrise || !sunset) return null;

    /* שעה זמנית של הגר"א, במילישניות */
    var hour = (sunset - sunrise) / 12;
    function fromSunrise(n) { return new Date(sunrise.getTime() + n * hour); }

    var alot = at(106.1, true);          /* 16.1° מתחת לאופק */
    var tzet = at(98.5, false);          /* 8.5°  מתחת לאופק */

    /* שעה זמנית של המגן אברהם — מעלות השחר עד צאת הכוכבים */
    var mgaHour = (alot && tzet) ? (tzet - alot) / 12 : null;

    return {
      alot:      alot,
      mishyakir: at(101.5, true),        /* 11.5° */
      sunrise:   sunrise,
      shemaMGA:  mgaHour ? new Date(alot.getTime() + 3 * mgaHour) : null,
      shemaGRA:  fromSunrise(3),
      tefilaMGA: mgaHour ? new Date(alot.getTime() + 4 * mgaHour) : null,
      tefilaGRA: fromSunrise(4),
      chatzot:   fromSunrise(6),
      minchaG:   fromSunrise(6.5),
      minchaK:   fromSunrise(9.5),
      plag:      fromSunrise(10.75),
      sunset:    sunset,
      tzet:      tzet,
      tzetRT:    new Date(sunset.getTime() + 72 * 60000),
      hour:      hour
    };
  }

  /* ── ה-API ──────────────────────────────────────────────────────── */

  var Luach = {
    rdFromGreg: rdFromGreg,
    numToHeb: numToHeb,

    /* האם התאריך נמצא בתקופת הסליחות (נוסח אשכנז) */
    isSelichot: function (date) {
      return isSelichotRd(rdFromGreg(date.getFullYear(), date.getMonth() + 1, date.getDate()));
    },

    hebrew: function (date) {
      var h = hebFromRd(rdFromGreg(date.getFullYear(), date.getMonth() + 1, date.getDate()));
      h.monthName = monthName(h.m, h.y);
      h.str = numToHeb(h.d, true) + ' ב' + h.monthName + ' ' + numToHeb(h.y % 1000, true);
      h.dayName = DAY_NAMES[date.getDay()];
      return h;
    },

    /* זמני היום ההלכתיים */
    zmanim: zmanim,

    /* geo = {lat, lon}. מחזיר Date בשעון מקומי של המחשב —
       מדויק רק כשהמחשב על שעון ישראל, ולכן החישוב עצמו נעשה בשעון ישראל. */
    sun: function (date, geo) {
      var y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
      var rd = rdFromGreg(y, m, d), off = ilOffset(y, m, d);
      var up = solarEvent(rd, geo.lat, geo.lon, 90.833, true);
      var dn = solarEvent(rd, geo.lat, geo.lon, 90.833, false);
      return {
        sunrise: up === null ? null : mkTime(y, m, d, up, off),
        sunset:  dn === null ? null : mkTime(y, m, d, dn, off)
      };
    },

    /* יום שישי והשבת הקרובים (אם היום שבת — השבת של היום) */
    nextShabbat: function (date) {
      var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      var add = (6 - d.getDay() + 7) % 7;
      var sat = new Date(d); sat.setDate(sat.getDate() + add);
      var fri = new Date(sat); fri.setDate(fri.getDate() - 1);
      return { fri: fri, sat: sat };
    },

    iso: function (d) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    },

    hhmm: function (d) {
      if (!d) return '--:--';
      return String(d.getHours()).padStart(2, '0') + ':' +
             String(d.getMinutes()).padStart(2, '0');
    },

    addMin: function (d, min) { return new Date(d.getTime() + min * 60000); }
  };

  root.Luach = Luach;
  if (typeof module !== 'undefined' && module.exports) module.exports = Luach;
})(typeof self !== 'undefined' ? self : this);
