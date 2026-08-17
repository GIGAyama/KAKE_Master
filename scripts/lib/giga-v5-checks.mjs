/**
 * GIGA Standard v5 Part I（共通技術仕様）の静的検査。
 *
 * ここは「Part I 由来の検査」だけを置く。
 * リポジトリ横断で共有する検査の正本（scripts/lib/project-quality.mjs）とは
 * ファイルを分けてあるので、正本の更新を丸ごと差し替えで受けられる。
 *
 * ⚠️ 検査を足したら、必ず「わざと壊して落ちること」を確かめる。
 *    `node scripts/check-project.mjs --self-test` がそれをやる。
 *    「0件でした」だけでは、検査が動いているのか何も見ていないのか区別できない。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

/** 判定の前にコメントを落とす。
 *  「localStorage は操作しない」という注意書きに検査が反応してしまうため。 */
export const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** HTML と CSS のコメントを落とす。
 *  ⚠️ これが無いと、規則を説明しているコメント自身に検査が反応する。
 *     実際、この検査を書いた直後に4件そうなった:
 *       「script-src に 'unsafe-inline' は足さない」→ unsafe-inline があると誤判定
 *       「frame-ancestors はここに書いても無視される」→ frame-ancestors があると誤判定
 *       「インラインの <script> と onclick= は…」  → インライン script があると誤判定
 *       「100vh はみ出すので dvh を使う」          → 100vh の裸使いと誤判定
 *     ＝ 正しく直したリポジトリほど落ちる、といういちばん困る形になる。 */
export const stripHtmlComments = (src) => src.replace(/<!--[\s\S]*?-->/g, ' ');
export const stripCssComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * @param {object} cfg quality.config.json の中身
 * @returns {Array<{id:string, ok:boolean, msg:string}>}
 */
export function runGigaChecks(cfg, root = process.cwd()) {
  const out = [];
  const add = (id, ok, msg) => out.push({ id, ok, msg });
  const R = (p) => read(join(root, p));

  // ⚠️ 判定にはコメントを落としたものを使う（規則を説明したコメント自身に反応するため）
  const html = stripHtmlComments(R('index.html') || '');
  const css = stripCssComments(R('css/style.css') || '');
  const sw = R('sw.js') || '';
  const manifestRaw = R('manifest.webmanifest');
  const appJs = R('js/app.js') || '';

  // ---------- A. 法務・配布 ----------
  for (const f of ['LICENSE', '.gitignore', '.github/dependabot.yml', 'README.md', 'MANUAL.md', 'AUDIT.md']) {
    add(`A_FILE:${f}`, existsSync(join(root, f)), `${f} が無い`);
  }
  const ci = R('.github/workflows/ci.yml') || '';
  add('A_CI_PR', /^\s*pull_request:/m.test(ci),
      'CI が pull_request で動かない（PR の時点で落ちていることに気づけない）');

  // ---------- B. セキュリティ ----------
  add('B_CSP', /http-equiv=["']Content-Security-Policy["']/i.test(html), 'CSP が入っていない');
  add('B_CSP_NO_UNSAFE_INLINE_SCRIPT',
      !/script-src[^;]*'unsafe-inline'/.test(html),
      "script-src に 'unsafe-inline' がある（CSP を入れた意味がほとんど無くなる）");
  add('B_CSP_NO_FRAME_ANCESTORS',
      !/frame-ancestors/.test(html),
      'frame-ancestors は <meta> では無視される。書かずにコメントで残すこと');
  add('B_NO_INLINE_SCRIPT',
      !/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html),
      'インラインの <script> がある（CSP の script-src \'self\' で動かない）');
  add('B_NO_ONCLICK', !/\son[a-z]+\s*=\s*["']/i.test(html),
      'onclick= などのインラインハンドラがある（CSP で動かない）');
  add('B_NO_CDN_EXEC',
      !/(cdn\.jsdelivr\.net|unpkg\.com|cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|babel\/standalone)/.test(html),
      'CDN から実行コードを読んでいる（学校のフィルタリングで画面が真っ白になる）');
  add('B_NO_SECRETS',
      !/(AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(html + appJs),
      'APIキー・秘密鍵らしき直書きがある');

  // ---------- C. 堅牢性 ----------
  const jsDir = join(root, 'js');
  const allJs = existsSync(jsDir)
    ? readdirSync(jsDir).filter((f) => f.endsWith('.js')).map((f) => R(`js/${f}`)).join('\n')
    : '';
  add('C_NO_LS_CLEAR', !/localStorage\s*\.\s*clear\s*\(/.test(stripComments(allJs)),
      'localStorage.clear() を使っている（他アプリの学習ログまで消える）');
  add('C_PAGEHIDE', /addEventListener\(\s*['"]pagehide['"]/.test(allJs),
      'pagehide での確定保存が無い（Chromebook のタブ破棄で記録が消える）');

  // ---------- D. 表示 ----------
  add('D_VIEWPORT_FIT', /name=["']viewport["'][^>]*viewport-fit=cover/.test(html),
      'viewport に viewport-fit=cover が無い');
  add('D_NO_USER_SCALABLE',
      !/name=["']viewport["'][^>]*(user-scalable\s*=\s*no|maximum-scale)/.test(html),
      '拡大を禁止している（見えづらい子が拡大できない）');
  {
    // ⚠️ @supports not (height: 100dvh) { … 100vh } は正しい書き方なので誤検知しない。
    //    100vh の出現位置より前を見て、dvh のフォールバック文脈かを判定する。
    const bad = [];
    const re = /100vh/g;
    let m;
    while ((m = re.exec(css))) {
      const before = css.slice(Math.max(0, m.index - 400), m.index);
      if (/@supports\s+not\s*\([^)]*dvh[^)]*\)\s*\{[^{}]*\{?[^{}]*$/.test(before)) continue;
      bad.push(css.slice(0, m.index).split('\n').length);
    }
    add('D_NO_BARE_100VH', bad.length === 0,
        `100vh を @supports のフォールバック以外で使っている（行: ${bad.join(', ')}）`);
  }
  add('D_SAFE_AREA', (css.match(/safe-area-inset/g) || []).length >= 4,
      'safe-area-inset の適用が足りない（上下左右の4方向）');
  add('D_CLAMP', (css.match(/clamp\(/g) || []).length >= 4, 'clamp() による fluid type が足りない');
  {
    // Canvas を使うなら devicePixelRatio 補正が要る（上限2）
    const usesCanvas = /getContext\(\s*['"]2d['"]/.test(allJs);
    const hasDpr = /devicePixelRatio/.test(allJs) && /Math\.min\([^)]*devicePixelRatio[^)]*,\s*2\s*\)|Math\.min\(\s*window\.devicePixelRatio[^)]*,\s*2\s*\)/.test(allJs);
    add('D_CANVAS_DPR', !usesCanvas || hasDpr,
        'Canvas に devicePixelRatio 補正（上限2）が無い');
  }
  add('D_REDUCED_MOTION', /prefers-reduced-motion/.test(css), 'prefers-reduced-motion 対応が無い');
  add('D_REDUCED_MOTION_NOT_ZERO',
      !/prefers-reduced-motion[\s\S]{0,400}?animation-duration:\s*0s?\s*!/.test(css),
      'reduced-motion で 0 にしている（fill-mode: forwards が壊れ、要素が消える）');
  add('D_FORCED_COLORS', /forced-colors/.test(css), 'forced-colors 対応が無い');
  add('D_TAP44', /\.tap-44/.test(css) && /tap-44/.test(html),
      'タップ領域を広げる .tap-44 が使われていない');
  add('D_RT_COLOR_NOT_HARDCODED',
      !/(^|\})\s*rt\s*\{[^}]*color\s*:\s*#/.test(css),
      'rt（ふりがな）の色を決め打ちしている（色のついた面の上で読めなくなる）');

  // ---------- E. PWA ----------
  if (!manifestRaw) add('E_MANIFEST', false, 'manifest.webmanifest が無い');
  else {
    let mf = null;
    try { mf = JSON.parse(manifestRaw); } catch { /* 下で落とす */ }
    add('E_MANIFEST_JSON', !!mf, 'manifest.webmanifest が JSON として読めない');
    if (mf) {
      // 独自ドメインに移り、アプリは kake-master.giga-school.com の直下で配信される。
      // 旧構成のサブディレクトリ配信（…github.io/KAKE_Master/）とは正しい値が違うので、
      // 期待値は quality.config.json の repoPath に持たせてある（いまは "./"）。
      // リポジトリ名の絶対パスに戻すと scope がページの URL を含まなくなり、
      // manifest ごと無視されて PWA としてインストールできなくなる。
      const want = cfg.repoPath;   // 例: "./"（独自ドメイン）／"/KAKE_Master/"（旧構成）
      for (const k of ['id', 'start_url', 'scope']) {
        add(`E_MANIFEST_${k.toUpperCase()}`, mf[k] === want,
            `manifest の ${k} が「${want}」でない（実際: ${mf[k]}）。` +
            '配信場所と食いちがうと、インストールできなくなったり別アプリと取り違えられたりする');
      }
      const purposes = (mf.icons || []).map((i) => `${i.purpose}:${i.sizes}`);
      for (const need of ['any:192x192', 'any:512x512', 'maskable:192x192', 'maskable:512x512']) {
        add(`E_ICON_${need}`, purposes.includes(need), `manifest に ${need} のアイコンが無い`);
      }
    }
  }
  add('E_APPLE_TOUCH_ICON', /rel=["']apple-touch-icon["']/.test(html), 'apple-touch-icon が無い');
  add('E_INSTALL_HOOK_EXTERNAL',
      existsSync(join(root, 'install-hook.js')) && /<script src=["']\.\/install-hook\.js["']/.test(html),
      'beforeinstallprompt を <head> の外部ファイルで捕捉していない');
  {
    // install-hook.js は <head> の中で、他の js より先に読むこと
    const headEnd = html.indexOf('</head>');   // コメント除去後の位置で見る
    const hookAt = html.indexOf('install-hook.js');
    add('E_INSTALL_HOOK_FIRST', hookAt > -1 && headEnd > -1 && hookAt < headEnd,
        'install-hook.js が <head> の中にない（合図を取りこぼす）');
  }
  add('E_SW_EXISTS', !!sw, 'sw.js が無い');
  {
    const swCode = stripComments(sw);
    // ⚠️ 「消す式」を正規表現で追うと (k) => caches.delete(k) を見落とす。
    //    見るのは「startsWith で自アプリ分に絞っているか」。
    add('E_SW_NO_CACHE_WIPE', /startsWith\s*\(/.test(swCode),
        'sw.js が caches.keys() を絞らずに消している（他アプリがオフラインで起動しなくなる）');
    add('E_SW_NO_LOCALSTORAGE', !/localStorage/.test(swCode),
        'sw.js が localStorage をさわっている');
    add('E_SW_NO_SKIP_WAITING_IN_INSTALL',
        !/addEventListener\(\s*['"]install['"][\s\S]{0,800}?skipWaiting/.test(swCode),
        'install の中で skipWaiting している（操作中に画面が入れ替わり、入力が消える）');
    add('E_SW_SKIP_WAITING_MESSAGE', /SKIP_WAITING/.test(swCode),
        'SKIP_WAITING メッセージの受け口が無い（更新を押しても切り替わらない）');
    add('E_SW_OFFLINE_HTML', /offline\.html/.test(swCode) && existsSync(join(root, 'offline.html')),
        'offline.html が無い、または sw.js が参照していない');
    const v = swCode.match(/VERSION\s*=\s*['"]v?([\d.]+)['"]/);
    add('E_SW_VERSION', !!v && v[1] === cfg.appVersion,
        `sw.js の VERSION が quality.config.json の appVersion (${cfg.appVersion}) と一致しない（実際: ${v ? v[1] : 'なし'}）`);
  }
  {
    const appCode = stripComments(appJs);
    add('E_SW_REGISTER_READYSTATE', /readyState\s*===?\s*['"]complete['"]/.test(appCode),
        'Service Worker 登録に readyState の分岐が無い（load 済みだと二度と登録されない）');
    add('E_CONTROLLERCHANGE_GUARDED',
        !/controllerchange[\s\S]{0,300}?location\.reload/.test(appCode)
        || /userAskedUpdate|askedUpdate/.test(appCode),
        'controllerchange を素直に受けている（初回訪問が必ず1回リロードされる）');
  }
  {
    const iconDir = join(root, 'icons');
    const limits = { 'icon-512.png': 60, 'maskable-512.png': 60, 'icon-192.png': 30,
                     'maskable-192.png': 30, 'apple-touch-icon.png': 30 };
    for (const [f, kb] of Object.entries(limits)) {
      const p = join(iconDir, f);
      const size = existsSync(p) ? statSync(p).size / 1024 : Infinity;
      add(`E_ICON_SIZE:${f}`, size <= kb, `${f} が ${kb}KB を超えている（${size.toFixed(1)}KB）`);
    }
  }

  // ---------- F. 性能・保守性 ----------
  {
    const files = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|mjs|css|html)$/.test(e.name)) files.push(p);
      }
    };
    walk(root);
    const big = files.filter((p) => {
      const s = statSync(p);
      const lines = readFileSync(p, 'utf8').split('\n').length;
      return lines > 5000 || s.size > 400 * 1024;
    });
    add('F_FILE_SIZE', big.length === 0,
        `5,000行 / 400KB を超えるファイルがある: ${big.map((p) => p.replace(root + '/', '')).join(', ')}`);
  }

  return out;
}
