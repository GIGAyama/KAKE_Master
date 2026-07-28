// ==========================================================
// Service Worker - オフライン対応 & キャッシュ管理
// ==========================================================
// VERSION は js/studySession.js の APP_VERSION と合わせる
const VERSION = 'v1.2.0';
const CACHE_PREFIX = 'kuku-';
const APP_CACHE = `${CACHE_PREFIX}app-${VERSION}`;
const FONT_CACHE = `${CACHE_PREFIX}fonts-v1`;

const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/nav.js',
  './js/data.js',
  './js/storage.js',
  './js/audio.js',
  './js/studyLog.js',
  './js/studySession.js',
  './js/studyStats.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // 消すのは自アプリ(kuku-)の古いキャッシュだけ。
        // 同じオリジンには他の学習アプリも置かれるため、それらのキャッシュには触れない。
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== APP_CACHE && k !== FONT_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Googleフォント: stale-while-revalidate(オフラインでも表示できるように)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        const network = fetch(e.request)
          .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // ページ遷移: ネットワーク優先、失敗時はキャッシュのindex.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静的アセット: キャッシュ優先、裏で更新
  e.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const network = fetch(e.request)
        .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
