/**
 * PWA の「挙動」を実際に動かして測る。
 *
 *   node tools/measure-pwa.mjs
 *
 * sw.js を読んでも分からないことばかりなので、まっさらな profile で開いて数える。
 *
 * ⚠️ 圏外を Playwright の context.setOffline で作ってはいけない。
 *    あれはページ側の通信にしか効かず、Service Worker の中の fetch() は
 *    そのまま外へ出ていく。実際、setOffline のまま測ると
 *    「本体キャッシュを消したのにアプリが出た」＝ offline.html が出ないという
 *    まぎらわしい結果になる（出ていないのではなく、そもそも圏外になっていない）。
 *    本当に止めるため、このツールは自分でサーバーを立てて自分で止める。
 *
 * ⚠️ サーバーを止めても、ブラウザ自身の HTTP キャッシュから返ることがある。
 *    Network.clearBrowserCache でそれも消してから測る。
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = process.cwd();
// 独自ドメイン（kake-master.giga-school.com）ではアプリはサイトの直下で配信される。
// manifest の scope（"./"）と同じ場所で測るため、ここも直下（プレフィックス無し）にする。
// 旧構成のサブディレクトリ（/KAKE_Master）で測ると、icon の src が本番で 404 になっていても気づけない。
const PREFIX = '';                       // manifest の scope と同じ場所で測る
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

let online = true;
let swBump = 0;   // >0 なら sw.js を「新しい版」として配る
const server = createServer(async (req, res) => {
  if (!online) { req.socket.destroy(); return; }          // ＝圏外
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(PREFIX)) { res.writeHead(404).end(); return; }
  p = p.slice(PREFIX.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  try {
    let buf = await readFile(file);
    // 版を上げた sw.js を配る。ブラウザはバイト列の違いで「新しい版」と判断するので、
    // 中身を1行足すだけで updatefound → waiting → 更新の帯 の道すじを本物で試せる。
    if (swBump && /sw\.js$/.test(file)) buf = Buffer.concat([buf, Buffer.from(`\n// bump ${swBump}\n`)]);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(buf);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}${PREFIX}`;

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name} — ${detail}`);
};
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// 「勝手にリロードしていないか」を framenavigated で数えてはいけない。
// このアプリは画面切替に history.pushState を使っており、それも framenavigated を飛ばす。
// 数えるべきは「文書が何回読み込み直されたか」。
const COUNTER = () => {
  const k = '__docLoads';
  sessionStorage.setItem(k, String(Number(sessionStorage.getItem(k) || 0) + 1));
};

{
  const browser = await launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(COUNTER);
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(4000);

  const loads = await page.evaluate(() => Number(sessionStorage.getItem('__docLoads') || 0));
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return r ? { scope: r.scope, active: !!r.active } : null;
  });
  ok('E9 Service Worker が登録されている', !!reg && reg.active, reg ? `scope=${reg.scope}` : '登録なし');
  ok('E8 初回訪問で勝手にリロードしない', loads === 1, `文書の読み込み ${loads} 回（1回なら正常）`);

  // --- manifest のアイコンが本当に取れるか ---
  // ⚠️ これを測っていなかったせいで、独自ドメインへ移したときに気づけなかった。
  //    icon の src だけ旧構成の絶対パス（/KAKE_Master/icons/…）が残って4枚とも 404 になり、
  //    Chrome がインストール可能と判断しなくなって、beforeinstallprompt が飛ばなくなった。
  //    ＝「インストール」ボタンが出ない。コンソールには何も出ないので、取得結果を数えるしかない。
  {
    const mfUrl = await page.evaluate(() => document.querySelector('link[rel=manifest]')?.href || null);
    const icons = await page.evaluate(async (u) => {
      const mf = await fetch(u).then((r) => r.json());
      return Promise.all((mf.icons || []).map(async (i) => {
        const abs = new URL(i.src, u).href;
        const status = await fetch(abs).then((r) => r.status).catch(() => 0);
        return { src: i.src, abs, status };
      }));
    }, mfUrl);
    const bad = icons.filter((i) => i.status !== 200);
    ok('E11 manifest のアイコンが全部取れる', icons.length > 0 && bad.length === 0,
       bad.length ? bad.map((i) => `${i.status} ${i.abs}`).join(' / ')
                  : `${icons.length}枚とも 200（${new URL(mfUrl).pathname} 基準）`);
  }

  // --- 圏外で起動するか（サーバーを本当に止める）---
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  online = false;
  const r1 = await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }).catch((e) => e);
  const bodyOk = r1 instanceof Error ? false : await page.evaluate(() => !!document.querySelector('#screen-home'));
  ok('E10a 圏外で起動する', bodyOk, bodyOk ? 'ホーム画面が出た' : '出なかった: ' + (r1.message || '').split('\n')[0]);

  // --- 本体キャッシュを消した圏外で offline.html が出るか ---
  online = true;
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const req of await c.keys()) if (/index\.html$|\/$/.test(new URL(req.url).pathname)) await c.delete(req);
    }
  });
  await cdp.send('Network.clearBrowserCache');
  online = false;
  const r2 = await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }).catch((e) => e);
  const offlineShown = r2 instanceof Error ? false
    : await page.evaluate(() => /つながっていません/.test(document.body.innerText));
  ok('E10b 本体が無いとき offline.html が出る', offlineShown,
     offlineShown ? 'オフライン用の画面が出た' : 'ブラウザの既定エラー画面になった');
  online = true;
  await browser.close();
}

{
  const browser = await launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  // 他アプリのキャッシュと、このアプリの古いキャッシュを置いてから版を上げる
  await page.evaluate(async () => {
    (await caches.open('other-app-static-v1')).put('/x', new Response('x'));
    (await caches.open('kuku-app-vOLD')).put('/y', new Response('y'));
  });

  // 「中身の違う sw」を登録し直して、3秒放置で waiting に留まるかを見る
  const waited = await page.evaluate(async () => {
    await navigator.serviceWorker.register('./sw.js?probe=' + Date.now());
    await new Promise((r) => setTimeout(r, 3000));
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.some((x) => !!x.waiting);
  });
  ok('E7 新版は押すまで待機する（3秒放置）', waited,
     waited ? '新版が waiting のまま留まった' : '待機せず切り替わった（install で skipWaiting している疑い）');

  // 「さいしんに する」を押したことにして切り替え、activate 後のキャッシュを見る
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) if (r.waiting) r.waiting.postMessage({ type: 'SKIP_WAITING' });
    await new Promise((r) => setTimeout(r, 2500));
  });
  const keys = await page.evaluate(() => caches.keys());
  ok('E5 他アプリのキャッシュが残っている', keys.includes('other-app-static-v1'), `caches=${JSON.stringify(keys)}`);
  ok('E5b 自アプリの古いキャッシュは消える', !keys.includes('kuku-app-vOLD'),
     keys.includes('kuku-app-vOLD') ? 'kuku-app-vOLD が残った' : 'kuku-app-vOLD は消えた');
  await browser.close();
}

// ---------- 更新の帯が出て、押すまで切り替わらないか（画面ごしに確かめる）----------
{
  const browser = await launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(COUNTER);
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  swBump = 1;                                    // ここから新しい版を配る
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page.waitForTimeout(3000);               // 3秒放置

  const barShown = await page.isVisible('#update-bar');
  const loadsBefore = await page.evaluate(() => Number(sessionStorage.getItem('__docLoads') || 0));
  ok('E7b 更新の帯が出る', barShown, barShown ? '「あたらしい ばんが あります」が出た' : '出なかった');
  ok('E7c 押すまで読み込み直さない', loadsBefore === 1,
     `帯が出てから3秒放置した時点の文書の読み込み ${loadsBefore} 回（1回なら正常）`);

  if (barShown) {
    await page.click('#btn-update');
    await page.waitForTimeout(3000);
    const loadsAfter = await page.evaluate(() => Number(sessionStorage.getItem('__docLoads') || 0));
    ok('E7d 押したら読み込み直す', loadsAfter > loadsBefore,
       `押したあとの文書の読み込み ${loadsAfter} 回`);
  }
  await browser.close();
}

server.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n合計: ${pass}/${results.length} 合格`);
process.exit(pass === results.length ? 0 : 1);
