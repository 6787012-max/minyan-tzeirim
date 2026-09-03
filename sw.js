/* network-first על ה-shell עם נפילה ל-cache. מעלים את V ביד בכל דיפלוי — וגם את ?v= בתגיות ה-script/link
   בשלושת קבצי ה-HTML, אחרת דפדפן שכבר ביקר יגיש JS ישן מה-cache שלו. */
var V = 'mt-v20';
var SHELL = [
  './', './index.html', './shas.html', './hok.html', './kibud.html', './news.html',
  './css/main.css', './css/shas.css', './css/hok.css', './css/kibud.css', './css/news.css',
  './js/app.js', './js/luach.js', './js/motion.js', './js/shas.js', './js/hok.js',
  './js/kibud.js', './js/forms.js', './js/news.js',
  './data/config.json', './data/shabbat.json', './data/shas.json',
  './data/hok.json', './data/kibud.json', './data/yamim_noraim.json', './data/site.json',
  './manifest.json', './favicon.ico',
  './img/mark@64.png', './img/logo-gate@680.png', './img/logo-h-white.svg',
  './fonts/frank-medium.woff2', './fonts/frank-black.woff2',
  './fonts/assistant-regular.woff2', './fonts/assistant-semibold.woff2',
  './fonts/drugulin-bold.woff2', './fonts/heebo-black.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V)
    .then(function (c) { return c.addAll(SHELL); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== V; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  /* רק המקור שלנו נכנס ל-cache. קודם נשמר כאן כל GET, וזה אומר
     שתשובות מאומתות של אזור הניהול ישבו ב-CacheStorage של המכשיר
     וימשיכו להיות זמינות גם אחרי יציאה. וגם: הגיליון החי של הרכזת
     נשמר ואז הוגש ישן, כלומר לוח שקרי. שניהם נסגרים בשורה אחת. */
  var u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  if (u.pathname.indexOf('/admin') === 0 || u.pathname.indexOf('/js/admin') === 0) return;
  e.respondWith(
    fetch(e.request).then(function (r) {
      var copy = r.clone();
      caches.open(V).then(function (c) { c.put(e.request, copy); });
      return r;
    }).catch(function () { return caches.match(e.request); })
  );
});
