/* simchat.js — טופס סעודת שמחת תורה.
   הועבר מ-inline ל-external ב-15/09/2026: ה-CSP חוסם inline scripts,
   ולכן לחיצה על "שליחה" לא הפעילה כלום. עכשיו הכפתור עובד.
   שיפורים: כפתורי + / - במקום input מספר, אישור ברור לפני שליחה,
   הסתרה מלאה של שדות מיותרים כשמסמנים "לא מגיע", ושמירת טיוטה
   מקומית שלא תאבד אם המשתמש התחיל למלא וברח לרגע. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var KEY = 'mt-simchat-draft';

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
  var idScanB64 = '', idScanName = '', idScanMime = '';

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  function saveDraft() {
    try {
      var d = {
        name: fName.value, phone: fPhone.value,
        attending: fYes.checked, adults: fAdults.value, kids: fKids.value,
        note: fNote.value, email: fEmail.value, id: fId.value,
        addr: fAddr.value, upd: fUpd.value
      };
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) { /* מצב פרטי או storage מלא — לא קריטי */ }
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
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
    } catch (e) { /* טיוטה מקולקלת — פשוט מתעלמים */ }
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

  /* ── ספח ת״ז (העלאת קובץ) ──────────────────────────────────── */
  fScan.addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    var lbl = $('#scIdScanName');
    idScanB64 = ''; idScanName = ''; idScanMime = '';
    if (!f) { lbl.textContent = 'לא נבחר קובץ. עד 3 מגה.'; return; }
    if (f.size > 3 * 1024 * 1024) {
      lbl.textContent = 'הקובץ גדול מ־3 מגה. בחר קובץ קטן יותר או צלם באיכות בינונית.';
      e.target.value = ''; return;
    }
    var rd = new FileReader();
    rd.onload = function (ev) {
      idScanB64 = String(ev.target.result || '');
      idScanName = f.name || 'id-scan';
      idScanMime = f.type || '';
      lbl.textContent = 'נבחר: ' + idScanName + ' (' + Math.round(f.size / 1024) + 'KB)';
    };
    rd.readAsDataURL(f);
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
    if (idScanB64) {
      details['ספח ת״ז']       = 'צורף · ' + idScanName + ' · ' + idScanMime;
      details['id_scan_data'] = idScanB64;
    }

    var payload = {
      kind: 'other',
      name: name,
      phone: phone,
      email: email || null,
      ref_key:   'seudah-simchat-torah-5787',
      ref_label: 'סעודת שמחת תורה תשפ״ז',
      qty: meals,
      details: details,
      source: 'simchat.html'
    };

    window.Forms.send(payload).then(function (res) {
      fSend.disabled = false;
      if (res.saved) {
        try { localStorage.removeItem(KEY); } catch (e) {}
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
})();
