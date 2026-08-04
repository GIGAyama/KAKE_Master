/**
 * 実ブラウザで「見え方」を測る。
 *
 * 読むだけでは分からないことが多すぎるので、実際に Chromium で開いて
 * コントラスト比・タップ領域・横スクロール・JS エラー・CSP 違反を数える。
 *
 *   node tools/measure-ui.mjs [--base http://127.0.0.1:8000] [--json out.json]
 *
 * ⚠️ 色の読み取りは 1px 実際に塗って getImageData で行う。
 *    oklch() などの新しい色表記を文字列から数値で拾うと、まったく違う色として
 *    判定され、どの要素も「ほぼ真っ黒」になってしまうため。
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const BASE = arg('--base', 'http://127.0.0.1:8000');
const JSON_OUT = arg('--json', null);

// 測る画面。ホームから順に開いていく（アプリ内は URL が変わらないので DOM 操作で遷移する）
const SCREENS = [
  { id: 'home',    label: 'ホーム',        open: null },
  { id: 'setup',   label: 'せってい',      open: () => document.querySelector('.mode-card[data-mode="flash"]').click() },
  { id: 'flash',   label: 'カードれんしゅう', open: () => { document.querySelector('.mode-card[data-mode="flash"]').click(); document.querySelector('#btn-start').click(); } },
  { id: 'quiz',    label: 'クイズ',        open: () => { document.querySelector('.mode-card[data-mode="quiz"]').click(); document.querySelector('#btn-start').click(); } },
  { id: 'pair',    label: 'ふたりで',      open: () => { document.querySelector('.mode-card[data-mode="pair"]').click(); document.querySelector('#btn-start').click(); } },
  { id: 'records', label: 'きろく',        open: () => document.querySelector('.mode-card[data-mode="records"]').click() },
];

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x667', width: 375, height: 667 },
  { name: '1366x768', width: 1366, height: 768 },
];

const SCAN = () => {
  // ---- 色の読み取り（1px 塗って読む）----
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const parse = (s) => {
    if (!s) return [0, 0, 0, 0];
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = s;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    // ⚠️ getImageData が返す RGB は「アルファを掛ける前」の値である。
    //    ここでアルファで割り戻すと rgba(255,255,255,.25) が rgb(1016,…) になり、
    //    半透明の面の上の文字が実際よりずっと明るく判定される（＝見逃す）。
    return a === 0 ? [0, 0, 0, 0] : [d[0], d[1], d[2], a];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (fg, bg) => {
    const a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const over = (fg, bg) => {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };

  // グラデーション背景は backgroundColor が透明になる。
  // backgroundImage の中の色を全部取り出し、いちばん不利（比が低い）な組み合わせで判定する。
  const gradColors = (bgImage) => {
    if (!bgImage || bgImage === 'none') return [];
    const out = [];
    const re = /(rgba?\([^)]*\)|#[0-9a-f]{3,8}|oklch\([^)]*\)|hsla?\([^)]*\)|color\([^)]*\))/gi;
    let m;
    while ((m = re.exec(bgImage))) out.push(parse(m[1]));
    return out.filter((c) => c[3] > 0);
  };

  // 実際にその文字の裏に来る色を求める。
  // グラデーションは1色に決まらないので「取りうる色ぜんぶ」を候補として返し、
  // 呼び出し側でいちばん不利な組み合わせを採る。
  // （下地を単純に白と決めつけると「白の上の白 = 比 1.0」という誤報になる）
  const effectiveBg = (el) => {
    const chain = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      const grads = gradColors(cs.backgroundImage);
      const bc = parse(cs.backgroundColor);
      const colors = [];
      if (bc[3] > 0) colors.push(bc);
      colors.push(...grads);
      chain.push(colors);
      // 不透明な背景に当たったら、それより下は見えないので打ち切る
      if (colors.some((c) => c[3] >= 0.999)) break;
      node = node.parentElement;
    }
    chain.reverse();                       // 外側 → 内側 の順に重ねる
    let bases = [[255, 255, 255, 1]];      // 何も無ければ最終的な下地は白
    for (const colors of chain) {
      if (!colors.length) continue;
      const next = [];
      for (const b of bases) for (const c of colors) next.push(over(c, b));
      bases = next.slice(0, 12);           // 組み合わせ爆発を防ぐ
    }
    return bases;
  };

  const EMOJI = /\p{Extended_Pictographic}/u;
  const results = [];
  const seen = new Set();

  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    // 直接の子テキストだけを見る（親に文字が無いのに測ってしまうのを防ぐ）
    let text = '';
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.nodeValue;
    text = text.trim();
    if (!text) return;
    if (EMOJI.test(text)) return;                       // 絵文字はフォント自身の色で描かれる
    if (el.closest('[disabled],[aria-disabled="true"]')) return;  // 使用不可は WCAG の対象外
    if (cs.cursor === 'not-allowed') return;

    const fs = parseFloat(cs.fontSize);
    const fw = parseInt(cs.fontWeight, 10) || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;

    const fg0 = parse(cs.color);
    let worst = 99, worstBg = null;
    for (const bg of effectiveBg(el)) {
      const fg = fg0[3] < 1 ? over(fg0, bg) : fg0;
      const r = ratio(fg, bg);
      if (r < worst) { worst = r; worstBg = bg; }
    }
    if (worst >= need) return;

    const sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    const key = sel + '|' + text.slice(0, 20);
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      sel, text: text.slice(0, 28), color: cs.color,
      bg: worstBg ? `rgb(${worstBg.slice(0, 3).map(Math.round).join(',')})` : '?',
      fs, fw, need, ratio: Math.round(worst * 100) / 100,
    });
  });

  // ---- タップ領域（::after で広げた当たり判定も含めて測る）----
  const taps = [];
  const tapSeen = new Set();
  document.querySelectorAll('button, a[href], input, select, [role="switch"], [role="button"]').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    let w = r.width, h = r.height;
    for (const pe of ['::before', '::after']) {
      const p = getComputedStyle(el, pe);
      if (p.content === 'none' || p.position !== 'absolute') continue;
      w = Math.max(w, parseFloat(p.width) || 0, parseFloat(p.minWidth) || 0);
      h = Math.max(h, parseFloat(p.height) || 0, parseFloat(p.minHeight) || 0);
    }
    if (w >= 44 && h >= 44) return;
    const sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    if (tapSeen.has(sel)) return;
    tapSeen.add(sel);
    taps.push({ sel, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20),
      w: Math.round(w), h: Math.round(h) });
  });

  return {
    // ⚠️ 「0件」が「問題なし」なのか「そもそも何も測れていない」のかを
    //    区別できるように、走査した数を必ず持ち帰る。
    scanned: {
      texts: [...document.querySelectorAll('*')].filter((el) => {
        for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
        return false;
      }).length,
      buttons: document.querySelectorAll('button, a[href], input, [role="switch"]').length,
      screenActive: !!document.querySelector('.screen.active'),
    },
    contrast: results,
    taps,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
};

// 環境に用意済みの Chromium を使う（CHROMIUM_PATH が無ければ Playwright の既定を使う）
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const report = { base: BASE, screens: [], errors: [], csp: [] };

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => report.errors.push(`[${vp.name}] ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') report.errors.push(`[${vp.name}] console: ${t}`);
    if (/Content Security Policy/i.test(t)) report.csp.push(`[${vp.name}] ${t}`);
  });

  for (const sc of SCREENS) {
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    if (sc.open) {
      await page.evaluate(sc.open);
      await page.waitForTimeout(500);
    }
    const r = await page.evaluate(SCAN);
        report.screens.push({ viewport: vp.name, screen: sc.id, label: sc.label, ...r });
  }
  await ctx.close();
}
await browser.close();

// ---- 集計 ----
const allContrast = new Map();
const allTaps = new Map();
let hScroll = [];
for (const s of report.screens) {
  for (const c of s.contrast) {
    const k = c.sel + '|' + c.text;
    if (!allContrast.has(k) || allContrast.get(k).ratio > c.ratio) allContrast.set(k, { ...c, where: `${s.label}/${s.viewport}` });
  }
  for (const t of s.taps) if (!allTaps.has(t.sel)) allTaps.set(t.sel, { ...t, where: `${s.label}/${s.viewport}` });
  if (s.hScroll) hScroll.push(`${s.label}/${s.viewport} (${s.scrollW}>${s.clientW})`);
}

const contrast = [...allContrast.values()].sort((a, b) => a.ratio - b.ratio);
const taps = [...allTaps.values()].sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));

// 何も測れていないのに「0件」と報告しないための歯止め。
// サーバーが落ちている・画面が出ていない状態で測ると、全部 0 件に見えてしまう。
const thin = report.screens.filter((s) => !s.scanned.screenActive || s.scanned.texts < 5);
if (thin.length) {
  console.error('⚠️ 測れていない画面がある（サーバーは動いているか／画面は出ているか）:');
  for (const t of thin) console.error(`   ${t.label}/${t.viewport} — 文字要素 ${t.scanned.texts} 個, 画面表示 ${t.scanned.screenActive}`);
  process.exit(2);
}
const totalTexts = report.screens.reduce((a, s) => a + s.scanned.texts, 0);
const totalBtns = report.screens.reduce((a, s) => a + s.scanned.buttons, 0);
console.log(`=== 走査した数 === 文字要素 ${totalTexts} 個 / ボタン ${totalBtns} 個（${report.screens.length} 画面ぶん）`);
console.log('=== コントラスト基準未満 ===', contrast.length, '件');
for (const c of contrast) console.log(`  ${String(c.ratio).padStart(5)}  (要 ${c.need})  ${c.sel}  「${c.text}」  ${c.color} on ${c.bg}  ${c.fs}px/${c.fw}  @${c.where}`);
console.log('=== タップ44px未満 ===', taps.length, '件');
for (const t of taps) console.log(`  ${t.w}x${t.h}  ${t.sel}  「${t.text}」  @${t.where}`);
console.log('=== 横スクロール ===', hScroll.length ? hScroll.join(', ') : 'なし');
console.log('=== JS エラー ===', report.errors.length, '件');
for (const e of [...new Set(report.errors)]) console.log('  ' + e);
console.log('=== CSP 違反 ===', report.csp.length, '件');
for (const e of [...new Set(report.csp)]) console.log('  ' + e);

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ contrast, taps, hScroll, errors: [...new Set(report.errors)], csp: [...new Set(report.csp)] }, null, 2));
