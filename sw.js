// ==========================================================
// Service Worker - オフライン対応 & キャッシュ管理
// ==========================================================
/*
 * 【重要】activate では自アプリ以外のキャッシュを削除しない。
 *   いまは kake-master.giga-school.com を単独で使っているが、
 *   同一オリジンに他のアプリが並ぶ配置（旧 gigayama.github.io など）へ
 *   戻したときに他アプリを巻き込むので、CACHE_PREFIX で始まるキャッシュだけを掃除する。
 *   caches.keys() を全消しすると、他のアプリがオフラインで起動しなくなる。
 *
 * この Service Worker は localStorage を一切さわらない。
 */
// VERSION は tools/build-sw.mjs が先読み対象の中身から自動生成する。手で書き換えない。
const VERSION = 'vb626f933'; /* __APP_VERSION__ */
const CACHE_PREFIX = 'kuku-';
const APP_CACHE = `${CACHE_PREFIX}app-${VERSION}`;
const FONT_CACHE = `${CACHE_PREFIX}fonts-v1`;

const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './install-hook.js',
  './css/style.css',
  './js/app.js',
  './js/nav.js',
  './js/data.js',
  './js/storage.js',
  './js/audio.js',
  './js/studyLog.js',
  './js/studySession.js',
  './js/studyStats.js',
  './records-export.html',
  './js/records-export.js',
  './js/records-hub-client.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // 1本でも失敗すると addAll は全体が落ちる（＝オフラインが丸ごと効かなくなる）ので、
    // 1つずつ入れて、取れなかったものだけを飛ばす。
    await Promise.all(APP_SHELL.map((u) =>
      cache.add(new Request(u, { cache: 'reload' }))
        .catch((err) => console.warn('[sw] precache skipped', u, err))));
    // ここでは skipWaiting しない。
    // 児童が操作している最中に画面が入れ替わると、打ちかけの答えや
    // めくりかけのカードが消える。画面側で「さいしんに する」を押してもらってから切り替える。
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      // 消すのは自アプリ(kuku-)の古いキャッシュだけ。
      // 同じオリジンには他の学習アプリも置かれるため、それらのキャッシュには触れない。
      .filter((k) => k.startsWith(CACHE_PREFIX) && k !== APP_CACHE && k !== FONT_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Googleフォント: stale-while-revalidate（オフラインでも字が崩れないように）
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // 画面遷移は network-first。更新をすぐ届け、
  // 圏外ならキャッシュの index.html、それも無ければ offline.html を出す。
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        // ⚠️ どの画面遷移でも ./index.html として保存してはいけない。
        //    このサイトには index.html のほかに privacy.html / terms.html /
        //    offline.html / records-export.html がある。
        //    それらを開いたときの応答を ./index.html に入れてしまうと、
        //    次に圏外でアプリを開いたとき、アプリのかわりに
        //    プライバシーポリシーや受け渡し口が出る。
        //    保存するのは「アプリの入口そのもの」を開いたときだけにする。
        const path = new URL(req.url).pathname;
        const isAppRoot = path === '/' || path.endsWith('/index.html');
        // 中身のない応答（404・リダイレクト）を入れると、
        // 圏外のときにその中身がアプリとして出てしまう。
        if (isAppRoot && res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put('./index.html', copy));
        }
        return res;
      } catch {
        // 圏外。まず「開こうとした画面そのもの」を探す。
        // これを飛ばして index.html から返すと、圏外では
        // 利用規約を開いてもアプリが出る、という妙な動きになる。
        return (await caches.match(req))
            || (await caches.match('./index.html'))
            || (await caches.match('./offline.html'))
            || Response.error();
      }
    })());
    return;
  }

  // 静的ファイルは cache-first（校内Wi-Fiが混んでいても即表示）
  e.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// 画面側で「さいしんに する」が押されたときだけ切り替える
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
