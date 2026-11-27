/*! 꼬마일레븐 FC v28 — 현대 전술 축구 구단 경영 RPG 서비스워커 (오프라인 캐시, 네트워크 우선) */
var CACHE = 'dot-soccer-v28-20261127a';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll([
        './', './index.html', './manifest.webmanifest',
        './css/style.css?v=28&b=24', './js/data.js?v=28&b=24', './js/pvp.js?v=28&b=24', './js/match.js?v=28&b=24', './js/bgm.js?v=28&b=24', './js/game.js?v=28&b=24',
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
