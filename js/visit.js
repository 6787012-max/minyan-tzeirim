/* visit.js — רישום כניסה לאתר. שקט: בלי הודעות, בלי שגיאות, בלי עיכוב הדף.
   מזהה מכשיר אקראי נשמר ב-localStorage. לא נשמרים IP או User-Agent.
   אם המכשיר סימן את עצמו בכספת (kf-token), הטוקן נשלח כדי לקשר את הכניסה לשם. */
(function () {
  'use strict';
  try {
    if (navigator.webdriver) return;
    if (document.prerendering || document.visibilityState === 'prerender') return;

    var page = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '') || 'index';
    page = page.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60) || 'index';

    function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* פרטי גלישה */ } }

    var vid = get('mt-vid');
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(vid)) {
      var a = new Uint8Array(12);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
      else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
      vid = 'v' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      set('mt-vid', vid);
    }

    var w = Math.min(screen.width || 0, window.innerWidth || screen.width || 0) || window.innerWidth || 1024;
    var device = w < 600 ? 'mobile' : (w < 1024 ? 'tablet' : 'desktop');

    var ref = '';
    try {
      if (document.referrer) {
        var h = new URL(document.referrer).hostname;
        if (h && h !== location.hostname) ref = h;
      }
    } catch (e) { ref = ''; }

    var tok = get('kf-token');

    function send() {
      fetch('data/site.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
        var a = d.api;
        return fetch(a.url + '/rest/v1/rpc/log_visit', {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', 'apikey': a.anon, 'Authorization': 'Bearer ' + a.anon,
                     'Accept-Profile': 'minyan', 'Content-Profile': 'minyan' },
          body: JSON.stringify({ p_visitor: vid, p_page: page, p_ref: ref, p_device: device, p_token: tok.length === 64 ? tok : null })
        });
      }).catch(function () { /* בשקט */ });
    }

    /* אחרי שהדף נטען, כדי לא להתחרות בו */
    if (document.readyState === 'complete') setTimeout(send, 300);
    else window.addEventListener('load', function () { setTimeout(send, 300); });
  } catch (e) { /* בשקט */ }
})();
