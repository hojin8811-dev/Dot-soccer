/*! 도트싸커 v10 — 원형 초상화 토큰 · 서비스워커 (오프라인 캐시, 네트워크 우선) */
var CACHE = 'dot-soccer-v10f-20261126';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll([
        './', './index.html', './manifest.webmanifest',
        './css/style.css?v=10&b=34', './js/data.js?v=10&b=34', './js/match.js?v=10&b=34', './js/game.js?v=10&b=34',
        './assets/hero-banner.jpg', './assets/stadium-pitch.png'
      ]).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 온라인이면 항상 최신 파일, 오프라인이면 캐시 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) { return; }
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
