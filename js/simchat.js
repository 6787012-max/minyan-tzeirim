/* simchat.js — טופס סעודת שמחת תורה.
   16/09/2026: העלאת ספח ת״ז עוברת עכשיו ישירות ל-Supabase Storage
   (dלי 'id-scans' פרטי, תת-נתיב 'simchat/'), עד 30 מגה, בלי base64 ב-JSON.
   רק כתובת הקובץ עוברת דרך הפאנקציה — לא התוכן.
   שינוי נוסף: פרטים אישיים (שם/טלפון/מייל/ת״ז/כתובת/ספח) נשמרים בענן
   קטן מקומי גם אחרי שליחה, כדי שלא צריך למלא מחדש בטופס הבא. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var KEY_DRAFT    = 'mt-simchat-draft';      // מצב מלא של הטופס הנוכחי
  var KEY_IDENTITY = 'mt-form-identity';      // פרטים אישיים לשימוש חוזר בין טפסים

  var API_URL  = 'https://cmsusfmwjtpfewbydzpi.supabase.co';
  var API_ANON = ''; // מתמלא מ-data/site.json
  var STORAGE_BUCKET = 'id-scans';
  var STORAGE_FOLDER = 'simchat';
  var MAX_MB   = 30;
  var MAX_BYTES = MAX_MB * 1024 * 1024;

  /* ── שדות ────────────────────────────────────────────────────── */
  var fName  = $('#scName');
  var fPhone = $('#scPhone');
  var fYes   = $('#scYes');
  var fNo    = $('#scNo');
  var fAdults= $('#scAdults');
  var fKids  = $('#scKids');
  var fNote  = $('#scNote');
  var fEmail = $('#scEmail');
  var fId    = $('#scId');
  var fAddr  = $('#scAddr');
  var fUpd   = $('#scUpd');
  var fScan  = $('#scIdScan');
  var fCounts= $('#scCounts');
  var fSend  = $('#scSend');
  var fHint  = $('#scHint');
  var scCard = $('#scCard');
  var scThanks = $('#scThanks');

  /* ── מצב הטופס ─────────────────────────────────────────────── */
  var idScanUrl = '', idScanName = '', idScanMime = '', idScanSize = 0;

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  /* טוענים את מפתח anon פעם אחת. לא חוסמים את היצג עד שהוא מגיע. */
  fetch('data/site.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.api) {
        API_URL  = d.api.url  || API_URL;
        API_ANON = d.api.anon || '';
      }
    })
    .catch(function () { /* forms.js יראה שגיאה מסודרת */ });

  function saveDraft() {
    try {
      var d = {
        name: fName.value, phone: fPhone.value,
        attending: fYes.checked, adults: fAdults.value, kids: fKids.value,
        note: fNote.value, email: fEmail.value, id: fId.value,
        addr: fAddr.value, upd: fUpd.value,
        idScanUrl: idScanUrl, idScanName: idScanName, idScanMime: idScanMime, idScanSize: idScanSize
      };
      localStorage.setItem(KEY_DRAFT, JSON.stringify(d));
    } catch (e) { /* מצב פרטי או storage מלא — לא קריטי */ }
  }

  function saveIdentity() {
    try {
      var d = {
        name: fName.value, phone: fPhone.value,
        email: fEmail.value, id: fId.value, addr: fAddr.value,
        idScanUrl: idScanUrl, idScanName: idScanName, idScanMime: idScanMime, idScanSize: idScanSize
      };
      localStorage.setItem(KEY_IDENTITY, JSON.stringify(d));
    } catch (e) { /* לא קריטי */ }
  }

  function loadDraft() {
    var loaded = false;
    /* ראשית — טיוטה של הטופס הנוכחי (אם עוד לא שלח) */
    try {
      var raw = localStorage.getItem(KEY_DRAFT);
      if (raw) {
        var d = JSON.parse(raw);
        if (d.name)   fName.value  = d.name;
        if (d.phone)  fPhone.value = d.phone;
        if (d.attending === false) { fNo.checked = true; fYes.checked = false; }
        if (d.adults) fAdults.value = d.adults;
        if (d.kids)   fKids.value   = d.kids;
        if (d.note)   fNote.value   = d.note;
        if (d.email)  fEmail.value  = d.email;
        if (d.id)     fId.value     = d.id;
        if (d.addr)   fAddr.value   = d.addr;
        if (d.upd)    fUpd.value    = d.upd;
        if (d.idScanUrl) {
          idScanUrl = d.idScanUrl; idScanName = d.idScanName || '';
          idScanMime = d.idScanMime || ''; idScanSize = d.idScanSize || 0;
          renderScanLabel();
        }
        loaded = true;
      }
    } catch (e) { /* טיוטה מקולקלת */ }

    /* ואם אין טיוטה — מנסים את הזהות מטופס אחרון שהשתלח */
    if (!loaded) {
      try {
        var rawI = localStorage.getItem(KEY_IDENTITY);
        if (rawI) {
          var i = JSON.parse(rawI);
          if (i.name  && !fName.value)  fName.value  = i.name;
          if (i.phone && !fPhone.value) fPhone.value = i.phone;
          if (i.email && !fEmail.value) fEmail.value = i.email;
          if (i.id    && !fId.value)    fId.value    = i.id;
          if (i.addr  && !fAddr.value)  fAddr.value  = i.addr;
          if (i.idScanUrl) {
            idScanUrl = i.idScanUrl; idScanName = i.idScanName || '';
            idScanMime = i.idScanMime || ''; idScanSize = i.idScanSize || 0;
            renderScanLabel();
          }
        }
      } catch (e) { /* אין זהות שמורה */ }
    }
  }

  function renderScanLabel() {
    var lbl = $('#scIdScanName');
    if (!idScanUrl) { lbl.textContent = 'לא נבחר קובץ. עד ' + MAX_MB + ' מגה. הקובץ עולה לענן ולא נדחס.'; return; }
    var kb = Math.round(idScanSize / 1024);
    var sizeTxt = kb >= 1024 ? (Math.round(kb / 102.4) / 10) + 'MB' : kb + 'KB';
    lbl.textContent = 'נשמר בענן: ' + (idScanName || 'ספח') + ' (' + sizeTxt + ') · ניתן לבחור אחר להחלפה.';
  }

  /* ── כפתורי + / - למספרים ──────────────────────────────────── */
  function bindStepper(input, min, max) {
    var minus = document.querySelector('[data-step="-1"][data-for="' + input.id + '"]');
    var plus  = document.querySelector('[data-step="+1"][data-for="' + input.id + '"]');
    if (!minus || !plus) return;
    function update() {
      var v = parseInt(input.value, 10);
      if (!Number.isFinite(v)) v = min;
      if (v < min) v = min;
      if (v > max) v = max;
      input.value = v;
      minus.disabled = v <= min;
      plus.disabled = v >= max;
      saveDraft();
    }
    minus.addEventListener('click', function () {
      input.value = (parseInt(input.value, 10) || min) - 1;
      update();
    });
    plus.addEventListener('click', function () {
      input.value = (parseInt(input.value, 10) || min) + 1;
      update();
    });
    input.addEventListener('input', update);
    update();
  }

  /* ── התצוגה מתחלפת: מגיע ↔ לא מגיע ─────────────────────────── */
  function toggleCounts() {
    var yes = fYes.checked;
    fCounts.style.display = yes ? '' : 'none';
    saveDraft();
  }
  fYes.addEventListener('change', toggleCounts);
  fNo.addEventListener('change', toggleCounts);

  /* ── ספח ת״ז — העלאה ישירה ל-Supabase Storage ─────────────── */

  function extFromMime(mime, fallback) {
    var m = { 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp',
              'image/heic':'heic','image/heif':'heif','application/pdf':'pdf' };
    if (m[mime]) return m[mime];
    /* נופלים ל-extension של השם המקורי אם מוכר */
    var dot = String(fallback || '').lastIndexOf('.');
    if (dot >= 0) {
      var ext = fallback.slice(dot + 1).toLowerCase();
      if (['jpg','jpeg','png','webp','heic','heif','pdf'].indexOf(ext) >= 0) return ext;
    }
    return 'bin';
  }

  function randomKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    /* מכשירים ישנים */
    var r = ''; for (var i = 0; i < 32; i++) r += Math.floor(Math.random()*16).toString(16);
    return r.slice(0,8)+'-'+r.slice(8,12)+'-'+r.slice(12,16)+'-'+r.slice(16,20)+'-'+r.slice(20);
  }

  function uploadScan(file) {
    var lbl = $('#scIdScanName');
    if (!API_ANON) {
      lbl.textContent = 'ההגדרות עוד נטענות — נסה שוב בעוד רגע.';
      return Promise.resolve(false);
    }
    if (file.size > MAX_BYTES) {
      lbl.textContent = 'הקובץ גדול מ־' + MAX_MB + ' מגה. בחר קובץ קטן יותר.';
      return Promise.resolve(false);
    }
    var ext = extFromMime(file.type, file.name);
    var path = STORAGE_FOLDER + '/' + randomKey() + '.' + ext;
    var url  = API_URL + '/storage/v1/object/' + STORAGE_BUCKET + '/' + path;

    lbl.textContent = 'מעלה: ' + (file.name || 'ספח') + '…';

    /* משתמשים ב-XHR כדי לקבל אחוזי התקדמות ומגבלת זמן שאפשר לשלוט בה */
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + API_ANON);
      xhr.setRequestHeader('apikey', API_ANON);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      /* בכוונה בלי x-upsert: כל קובץ מקבל UUID אקראי, ו-upsert דורש policy
         של UPDATE נוסף שלא רוצים לחשוף ל-anon (יאפשר החלפת קבצים של אחרים). */
      xhr.timeout = 180000; // עד 3 דקות ל-30 מגה בחיבור איטי
      xhr.upload.onprogress = function (ev) {
        if (ev.lengthComputable) {
          var pct = Math.round(ev.loaded * 100 / ev.total);
          lbl.textContent = 'מעלה: ' + (file.name || 'ספח') + ' — ' + pct + '%';
        }
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          idScanUrl  = STORAGE_BUCKET + '/' + path;   /* שם הדלי + הנתיב, כדי שהשרת ידע לחתום */
          idScanName = file.name || 'ספח';
          idScanMime = file.type || '';
          idScanSize = file.size;
          renderScanLabel();
          saveDraft();
          resolve(true);
        } else {
          lbl.textContent = 'העלאה נכשלה (' + xhr.status + '). נסה שוב.';
          resolve(false);
        }
      };
      xhr.onerror = function () {
        lbl.textContent = 'העלאה נכשלה — בעיית רשת.';
        resolve(false);
      };
      xhr.ontimeout = function () {
        lbl.textContent = 'העלאה נכשלה — הזמן פג. נסה שוב.';
        resolve(false);
      };
      xhr.send(file);
    });
  }

  fScan.addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) { renderScanLabel(); return; }
    uploadScan(f);
  });

  /* ── שליחה ─────────────────────────────────────────────────── */
  fSend.addEventListener('click', function () {
    var name = fName.value.trim();
    var phone = fPhone.value.trim();
    var attending = fYes.checked;
    var adults = parseInt(fAdults.value, 10) || 0;
    var kids   = parseInt(fKids.value, 10) || 0;
    var note   = fNote.value.trim();

    fHint.className = 'sc-hint';

    if (name.length < 2) {
      fHint.className = 'sc-hint err';
      fHint.textContent = 'נא למלא שם מלא.';
      fName.focus(); return;
    }
    if (digits(phone).length < 9) {
      fHint.className = 'sc-hint err';
      fHint.textContent = 'מספר טלפון לא תקין.';
      fPhone.focus(); return;
    }
    if (attending && adults < 1) {
      fHint.className = 'sc-hint err';
      fHint.textContent = 'כמות המבוגרים חייבת להיות לפחות 1.';
      return;
    }

    fSend.disabled = true;
    fHint.textContent = 'שולח…';

    var meals = attending ? (adults + kids) : 0;
    var email = fEmail.value.trim();
    var idn   = fId.value.trim();
    var addr  = fAddr.value.trim();
    var upd   = fUpd.value.trim();

    var details = {
      attending: attending ? 'כן' : 'לא',
      adults: attending ? adults : 0,
      kids:   attending ? kids   : 0,
      note: note
    };
    if (idn)  details['ת״ז']       = idn;
    if (addr) details['כתובת']    = addr;
    if (upd)  details['עדכון פרטים'] = upd;
    if (idScanUrl) {
      details['ספח ת״ז']     = 'צורף · ' + idScanName + ' · ' +
                                (idScanSize ? (Math.round(idScanSize/1024) + 'KB') : idScanMime);
      details['id_scan_path'] = idScanUrl; /* לחתימת signed URL בשרת */
      details['id_scan_name'] = idScanName;
      details['id_scan_mime'] = idScanMime;
    }

    /* ref_key כולל את הטלפון: אינדקס יחודי (kind, ref_key) מונע
       מאותו משתמש להירשם פעמיים, אבל מאפשר לכל משפחה להירשם. */
    var payload = {
      kind: 'other',
      name: name,
      phone: phone,
      email: email || null,
      ref_key:   'seudah-simchat-torah-5787:' + digits(phone),
      ref_label: 'סעודת שמחת תורה תשפ״ז',
      qty: meals,
      details: details,
      source: 'simchat.html'
    };

    window.Forms.send(payload).then(function (res) {
      fSend.disabled = false;
      if (res.saved) {
        /* שמירת פרטי זהות לפעם הבאה, מחיקת הטיוטה הפעילה בלבד */
        saveIdentity();
        try { localStorage.removeItem(KEY_DRAFT); } catch (e) {}
        scCard.hidden = true;
        scThanks.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        fHint.className = 'sc-hint err';
        fHint.textContent = window.Forms.explain(res);
      }
    });
  });

  /* ── שמירה של טיוטה על כל שינוי ────────────────────────────── */
  [fName, fPhone, fNote, fEmail, fId, fAddr, fUpd].forEach(function (el) {
    el.addEventListener('input', saveDraft);
  });

  /* ── אתחול ─────────────────────────────────────────────────── */
  loadDraft();
  toggleCounts();
  bindStepper(fAdults, 1, 12);
  bindStepper(fKids,   0, 15);
  renderScanLabel();
})();
