/* realtime.js — עדכונים חיים בין מסכי ניהול פתוחים, מעל Supabase Realtime.
 * נטען אחרי admin.js ונרשם ל-window.MTRealtime בלבד — לא נוגע בלוגיקה
 * הקיימת, כדי שאם Realtime לא זמין (רשת/נטפרי) הפאנל ימשיך לעבוד
 * בדיוק כמו קודם, רק בלי הרענון האוטומטי.
 *
 * RLS על Realtime: postgres_changes מכבד את אותו RLS כמו REST, אבל רק
 * אם ה-socket מזוהה עם ה-JWT של המשתמש המחובר (לא ה-anon key) —
 * client.realtime.setAuth(accessToken), לא createClient options.
 */
(function () {
  'use strict';
  var listeners = [];
  var client = null;
  var channel = null;
  var dotEl = null;

  function pulse() {
    if (!dotEl) dotEl = document.getElementById('rtDot');
    if (!dotEl) return;
    dotEl.hidden = false;
    dotEl.classList.remove('pulse');
    void dotEl.offsetWidth; /* מכריח reflow כדי שהאנימציה תרוץ גם בהפעלה חוזרת מהירה */
    dotEl.classList.add('pulse');
  }

  var TABLES = ['congregants', 'contact_docs', 'signups', 'congregant_relations'];

  function start(url, anonKey, accessToken) {
    if (!window.supabase || !window.supabase.createClient) return;
    if (client) { client.realtime.setAuth(accessToken); return; } /* כבר מחובר — רק מרעננים טוקן */
    try {
      client = window.supabase.createClient(url, anonKey, { auth: { persistSession: false } });
      client.realtime.setAuth(accessToken);
      /* בדיקה חיה גילתה ש-4 בינדינגים נפרדים (אחד לכל טבלה, table: X)
         על אותו channel לא קלטו שום אירוע בפועל — למרות ש-subscribe
         חוזר SUBSCRIBED בלי שגיאה, ואותו client עם בינדינג יחיד (בלי
         table, ברמת schema) כן קלט. בינדינג יחיד + סינון table בקוד. */
      channel = client.channel('minyan-admin-live');
      channel.on('postgres_changes', { event: '*', schema: 'minyan' }, function (payload) {
        var table = payload.table;
        if (TABLES.indexOf(table) < 0) return;
        pulse();
        listeners.forEach(function (fn) {
          try { fn(table, payload); } catch (e) { /* מאזין בודד לא מפיל את השאר */ }
        });
      });
      channel.subscribe(function (status, err) {
        console.log('[MTRealtime] subscribe status:', status, err || '');
      });
    } catch (e) { console.log('[MTRealtime] start() threw:', e); }
  }

  function onChange(fn) { listeners.push(fn); }
  function debugState() { return { hasClient: !!client, hasChannel: !!channel, channelState: channel && channel.state, listenerCount: listeners.length }; }

  function stop() {
    try { if (client) client.removeAllChannels(); } catch (e) { /* לא קריטי */ }
    client = null; channel = null;
    if (!dotEl) dotEl = document.getElementById('rtDot');
    if (dotEl) dotEl.hidden = true;
  }

  window.MTRealtime = { start: start, onChange: onChange, stop: stop, debugState: debugState };
})();
