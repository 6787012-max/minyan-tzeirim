/* network-first על ה-shell עם נפילה ל-cache. מעלים את V ביד בכל דיפלוי. */
var V = 'mt-v2';
var SHELL = [
  './', './index.html', './shas.html', './hok.html',
  './css/main.css', './css/shas.css', './css/hok.css',
  './js/app.js', './js/luach.js', './js/shas.js', './js/hok.js',
  './data/config.json', './data/shabbat.json', './data/shas.json',
  './data/hok.json', './manifest.json',
  './img/mark.svg', './img/logo-gate.svg', './img/logo-h-white.svg',
  './fonts/frank-medium.woff2', './fonts/frank-black.woff2',
  './fonts/assistant-regular.woff2', './fonts/assistant-semibold.woff2',
  './fonts/drugulin-bold.woff2'
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
  if (e.request.url.indexOf('matara.pro') >= 0) return;   // מגבית חיה — לא לשמור
  e.respondWith(
    fetch(e.request).then(function (r) {
      var copy = r.clone();
      caches.open(V).then(function (c) { c.put(e.request, copy); });
      return r;
    }).catch(function () { return caches.match(e.request); })
  );
});
