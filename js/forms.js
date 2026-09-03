/* forms.js — שליחת רישומים מכל דפי האתר.
 *
 * עד היום כל טופס באתר רק פתח טאב של המייל. מי שסגר את הטאב —
 * הרישום שלו פשוט לא קרה, ואיש לא ידע שהוא בכלל ניסה. כאן הרישום
 * נשמר בשרת לפני שנשלח משהו, והמייל יוצא מהשרת ולא מהמכשיר.
 *
 * הדפדפן לא נוגע במסד ישירות: הוא מדבר רק עם פונקציית forms,
 * שמחזיקה את מפתח השרת אצלה. מה שגלוי כאן הוא מפתח anon שאין לו
 * הרשאה לקרוא או לכתוב שום דבר בסכימה הזו.
 *
 * window.Forms.send(payload) → Promise<{saved, mailed, error}>
 * לעולם לא נדחה. כישלון מוחזר כערך, כדי שדף לא ייתקע על catch חסר.
 */
(function () {
  'use strict';

  var CFG = {
    url: 'https://cmsusfmwjtpfewbydzpi.supabase.co',
    anon: '',            /* מתמלא מ-data/site.json */
    ready: null
  };

  function conf() {
    if (CFG.ready) return CFG.ready;
    CFG.ready = fetch('data/site.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        CFG.url = (d.api && d.api.url) || CFG.url;
        CFG.anon = (d.api && d.api.anon) || '';
        return CFG;
      })
      .catch(function () { return CFG; });
    return CFG.ready;
  }

  /** timeout אמיתי — fetch תלוי לנצח משאיר את המשתמשת מול כפתור מת */
  function withTimeout(p, ms) {
    return new Promise(function (res) {
      var done = false;
      var t = setTimeout(function () {
        if (!done) { done = true; res({ saved: false, mailed: false, error: 'timeout' }); }
      }, ms);
      p.then(function (v) {
        if (!done) { done = true; clearTimeout(t); res(v); }
      }, function () {
        if (!done) { done = true; clearTimeout(t); res({ saved: false, mailed: false, error: 'network' }); }
      });
    });
  }

  function send(payload) {
    return withTimeout(conf().then(function (c) {
      if (!c.anon) return { saved: false, mailed: false, error: 'not-configured' };
      var body = {};
      for (var k in payload) if (payload[k] !== undefined) body[k] = payload[k];
      body.source = body.source || location.pathname.replace(/^\//, '') || 'index.html';

      return fetch(c.url + '/functions/v1/forms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': c.anon,
          'Authorization': 'Bearer ' + c.anon
        },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().then(function (j) {
          if (r.ok && j && j.ok) {
            return { saved: true, mailed: !!j.mailed, id: j.id, error: '' };
          }
          /* 409 = מישהו הקדים. זה לא כשל רשת אלא מצב אמיתי. */
          return { saved: false, mailed: false, error: (j && j.error) || ('http' + r.status) };
        }, function () {
          return { saved: false, mailed: false, error: 'bad-response' };
        });
      });
    }), 20000);
  }

  /** נוסח שגיאה בעברית — הדפים לא צריכים להכיר את קודי השגיאה */
  function explain(res) {
    if (res.saved && res.mailed) return 'הרישום נשמר ונשלחה הודעה לגבאי.';
    if (res.saved) return 'הרישום נשמר. ההודעה לגבאי תישלח בהמשך.';
    if (res.error === 'taken') return 'מישהו הקדים אותך לפריט הזה.';
    if (res.error === 'timeout' || res.error === 'network')
      return 'אין כרגע חיבור לשרת — הרישום לא נשמר.';
    return 'הרישום לא נשמר בגלל תקלה.';
  }

  window.Forms = { send: send, explain: explain };
})();
