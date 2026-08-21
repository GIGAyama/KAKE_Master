#!/usr/bin/env node
/**
 * 品質ゲート。CI と同じものを手元でも回せる。
 *
 *   npm run check              … 検査する
 *   npm run check -- --self-test … 検査そのものが動いているかを確かめる
 *
 * 構成:
 *   scripts/lib/project-quality.mjs … リポジトリ横断で共有する検査の「正本」。
 *                                     置かれていればそのまま合成する（丸ごと差し替えで更新できる）。
 *   scripts/lib/giga-v5-checks.mjs  … GIGA Standard v5 Part I の検査。この2つを分けておく。
 *
 * ⚠️ 「0件でした」だけでは、検査が動いているのか何も見ていないのか区別できない。
 *    --self-test は、各検査が見ているファイルをわざと壊して
 *    「ちゃんと落ちること」を確かめる。実際、この確認をしたことで
 *    検査そのものの不具合が見つかっている。
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runGigaChecks } from './lib/giga-v5-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'quality.config.json'), 'utf8'));
const SELF_TEST = process.argv.includes('--self-test');

/** 共有の正本があれば合成する（無くても Part I の検査だけで動く） */
async function runAll(root) {
  let results = runGigaChecks(cfg, root);
  const shared = join(ROOT, 'scripts/lib/project-quality.mjs');
  if (existsSync(shared)) {
    const mod = await import(pathToFileURL(shared).href);
    if (typeof mod.runSharedChecks === 'function') {
      results = results.concat(await mod.runSharedChecks(cfg, root));
    }
  }
  return results;
}

// ---------------------------------------------------------
// 通常の検査
// ---------------------------------------------------------
if (!SELF_TEST) {
  const results = await runAll(ROOT);
  const failed = results.filter((r) => !r.ok);
  for (const r of failed) console.error(`❌ ${r.id}: ${r.msg}`);
  console.log(`\n品質ゲート: ${results.length - failed.length}/${results.length} 合格`);
  if (!existsSync(join(ROOT, 'scripts/lib/project-quality.mjs'))) {
    console.log('（注）横断共有の正本 scripts/lib/project-quality.mjs は未取得。Part I の検査のみ実行した。');
  }
  process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------
// --self-test : わざと壊して、検査が落ちることを確かめる
// ---------------------------------------------------------
const BREAKS = [
  { id: 'D_NO_USER_SCALABLE', file: 'index.html',
    edit: (s) => s.replace('viewport-fit=cover"', 'viewport-fit=cover, user-scalable=no"') },
  { id: 'D_NO_BARE_100VH', file: 'css/style.css',
    edit: (s) => s + '\n.broken { height: 100vh; }\n' },
  { id: 'D_REDUCED_MOTION', file: 'css/style.css',
    edit: (s) => s.replace(/prefers-reduced-motion/g, 'prefers-XXX-motion') },
  { id: 'D_FORCED_COLORS', file: 'css/style.css',
    edit: (s) => s.replace(/forced-colors/g, 'forced-XXX') },
  { id: 'D_RT_COLOR_NOT_HARDCODED', file: 'css/style.css',
    edit: (s) => s + '\nrt { color: #666; }\n' },
  { id: 'D_CANVAS_DPR', file: 'js/app.js',
    edit: (s) => s.replace(/Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/, '1') },
  { id: 'B_CSP', file: 'index.html',
    edit: (s) => s.replace('http-equiv="Content-Security-Policy"', 'http-equiv="X-Disabled"') },
  { id: 'B_CSP_NO_UNSAFE_INLINE_SCRIPT', file: 'index.html',
    edit: (s) => s.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';") },
  { id: 'B_CSP_NO_FRAME_ANCESTORS', file: 'index.html',
    edit: (s) => s.replace("base-uri 'self';", "base-uri 'self'; frame-ancestors 'none';") },
  { id: 'B_NO_INLINE_SCRIPT', file: 'index.html',
    edit: (s) => s.replace('</head>', '<script>window.x=1</script></head>') },
  { id: 'B_NO_ONCLICK', file: 'index.html',
    edit: (s) => s.replace('<button class="btn-start" id="btn-start">', '<button class="btn-start" id="btn-start" onclick="go()">') },
  { id: 'B_NO_CDN_EXEC', file: 'index.html',
    edit: (s) => s.replace('</head>', '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script></head>') },
  { id: 'C_NO_LS_CLEAR', file: 'js/storage.js',
    edit: (s) => s + '\nexport const wipe = () => localStorage.clear();\n' },
  { id: 'C_PAGEHIDE', file: 'js/studySession.js',
    edit: (s) => s.replace(/addEventListener\('pagehide'/g, "addEventListener('XXX'") },
  { id: 'E_SW_NO_SKIP_WAITING_IN_INSTALL', file: 'sw.js',
    edit: (s) => s.replace("self.addEventListener('install', (e) => {", "self.addEventListener('install', (e) => {\n  self.skipWaiting();") },
  { id: 'E_SW_NO_CACHE_WIPE', file: 'sw.js',
    // 「消す式」ではなく「startsWith で絞る式があるか」を見ているかの確認。
    // 削除の書き方を変えただけでは見落とさないこと。
    edit: (s) => s.replace(/\.filter\(\(k\) =>[\s\S]*?\)\)\n/, '\n').replace(/startsWith/g, 'XXX') },
  { id: 'E_SW_NO_LOCALSTORAGE', file: 'sw.js',
    edit: (s) => s + '\nlocalStorage.setItem("x", "1");\n' },
  { id: 'E_SW_OFFLINE_HTML', file: 'sw.js',
    edit: (s) => s.replace(/offline\.html/g, 'nowhere.html') },
  { id: 'E_SW_SKIP_WAITING_MESSAGE', file: 'sw.js',
    edit: (s) => s.replace(/SKIP_WAITING/g, 'XXX') },
  { id: 'E_SW_VERSION', file: 'sw.js',
    // 自動生成の目印を外す＝手書き運用に戻す、が今の壊れ方
    edit: (s) => s.replace(" /* __APP_VERSION__ */", "") },
  { id: 'E_SW_REGISTER_READYSTATE', file: 'js/app.js',
    edit: (s) => s.replace(/document\.readyState === 'complete'/, 'false') },
  // "./" は独自ドメインでの正しい値なので、もう壊れた形ではない。
  // いまの壊れ方は、サブドメイン直下で配信するのにリポジトリ名の絶対パスが残っていること。
  { id: 'E_MANIFEST_ID', file: 'manifest.webmanifest',
    edit: (s) => s.replace('"id": "./"', '"id": "/KAKE_Master/"') },
  // 独自ドメインへ移したとき、実際にこの形（icon の src だけ旧構成の絶対パスのまま）で
  // 4枚とも 404 になり、インストールボタンが出なくなった。purpose と sizes は揃っていたので
  // 旧来の E_ICON_* は素通りしている。
  { id: 'E_ICON_SRC', file: 'manifest.webmanifest',
    edit: (s) => s.replace(/"src": "\.\/icons\//g, '"src": "/KAKE_Master/icons/') },
  { id: 'E_INSTALL_HOOK_EXTERNAL', file: 'index.html',
    edit: (s) => s.replace('<script src="./install-hook.js"></script>', '') },
  { id: 'D_TAP44', file: 'css/style.css',
    edit: (s) => s.replace(/\.tap-44/g, '.tap-XX') },
  { id: 'D_SAFE_AREA', file: 'css/style.css',
    edit: (s) => s.replace(/safe-area-inset/g, 'XXX-inset') },
];

const tmp = mkdtempSync(join(tmpdir(), 'giga-selftest-'));
let pass = 0, fail = 0;
for (const b of BREAKS) {
  const dir = join(tmp, b.id);
  cpSync(ROOT, dir, { recursive: true, filter: (s) => !/node_modules|\.git(\/|$)/.test(s) });
  const target = join(dir, b.file);
  const before = readFileSync(target, 'utf8');
  const after = b.edit(before);
  if (after === before) {
    console.error(`⚠️  ${b.id}: 壊し方がファイルに当たっていない（${b.file}）。検査を確かめられていない`);
    fail++; continue;
  }
  writeFileSync(target, after);
  const res = await runAll(dir);
  const hit = res.find((r) => r.id === b.id);
  if (!hit) { console.error(`⚠️  ${b.id}: そんな検査は無い`); fail++; }
  else if (hit.ok) { console.error(`❌ ${b.id}: わざと壊したのに通ってしまった（検査が何も見ていない）`); fail++; }
  else { console.log(`✅ ${b.id}: 壊したらちゃんと落ちた`); pass++; }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\n検査の自己確認: ${pass}/${pass + fail} 合格`);
process.exit(fail ? 1 : 0);
