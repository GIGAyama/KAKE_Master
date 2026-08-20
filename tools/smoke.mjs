/**
 * 実際に操作して、壊れていないことを確かめる。
 *
 *   node tools/smoke.mjs [--base http://127.0.0.1:8001]
 *
 * CSP はビルドも静的解析も通る。動かさないと絶対に気づけないので、
 * 画面を歩いて、押して、結果が出るところまでを機械で1周させる。
 * 読み込みに失敗した宛先も全部並べる（フォントだけなのか、本体なのかを分けるため）。
 */
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
// 独自ドメイン（kake-master.giga-school.com）ではアプリはサイトの直下で配信される。
// 旧構成のサブディレクトリ（/KAKE_Master）の下で測ると、本番と違う配置を測ることになる。
const BASE = arg('--base', 'http://127.0.0.1:8001');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [], csp = [], failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
  if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
});
page.on('requestfailed', (r) => failed.push(`${r.url()} (${r.failure()?.errorText})`));

const steps = [];
const step = async (name, fn) => {
  try { await fn(); steps.push(`✅ ${name}`); }
  catch (e) { steps.push(`❌ ${name} — ${e.message}`); }
};

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForTimeout(800);

await step('ホームが出る', async () => {
  await page.waitForSelector('#screen-home.active', { timeout: 3000 });
});

await step('カードれんしゅう: めくる→しわけ→結果', async () => {
  await page.click('.mode-card[data-mode="flash"]');
  await page.click('#btn-clear-stages');          // 1つの段だけにして 9枚にする
  await page.click('#btn-start');
  await page.waitForSelector('#screen-flash.active', { timeout: 3000 });
  for (let i = 0; i < 9; i++) {
    await page.click('#btn-flip');
    await page.waitForTimeout(120);
    await page.click('#btn-good');
    await page.waitForTimeout(320);
  }
  await page.waitForSelector('#screen-result.active', { timeout: 5000 });
  const t = await page.textContent('#result-stats');
  if (!t || !t.trim()) throw new Error('結果の数字が空');
});

await step('クイズ: キーパッドで答える', async () => {
  await page.click('#btn-result-home');
  await page.waitForSelector('#screen-home.active', { timeout: 3000 });
  await page.click('.mode-card[data-mode="quiz"]');
  await page.click('#btn-start');
  await page.waitForSelector('#screen-quiz.active', { timeout: 3000 });
  const problem = await page.textContent('#quiz-problem');
  const m = problem.match(/(\d+)\s*×\s*(\d+)/);
  if (!m) throw new Error('問題が出ていない: ' + problem);
  const ans = String(Number(m[1]) * Number(m[2]));
  for (const ch of ans) await page.click(`.key[data-key="${ch}"]`);
  await page.click('.key[data-key="ok"]');
  await page.waitForTimeout(600);
  const fb = await page.textContent('#quiz-feedback');
  if (!/せいかい|できた|おしい|ざんねん|✓/.test(fb) && !fb.trim()) throw new Error('こたえあわせが出ない');
});

await step('ふたりで: 判定ボタンで点が入る', async () => {
  await page.click('.screen.active [data-quit]');
  await page.waitForSelector('#screen-home.active', { timeout: 3000 });
  await page.click('.mode-card[data-mode="pair"]');
  await page.click('#btn-start');
  await page.waitForSelector('#screen-pair.active', { timeout: 3000 });
  await page.click('#pair-card-stack .kcard.current');
  await page.waitForTimeout(500);
  await page.click('#btn-judge-ok');
  await page.waitForTimeout(400);
  const pts = await page.textContent('#pair-pts-1');
  if (Number(pts) < 1) throw new Error('点が入らない: ' + pts);
});

await step('きろく: カレンダー・ヒートマップ・メダルが描かれる', async () => {
  await page.click('.screen.active [data-quit]');
  await page.waitForSelector('#screen-home.active', { timeout: 3000 });
  await page.click('.mode-card[data-mode="records"]');
  await page.waitForSelector('#screen-records.active', { timeout: 3000 });
  const n = await page.evaluate(() => ({
    cal: document.querySelectorAll('#calendar .cal-day').length,
    heat: document.querySelectorAll('#heatmap .hm-cell').length,
    badge: document.querySelectorAll('#badges .badge').length,
  }));
  if (n.heat !== 81) throw new Error('ヒートマップが 81マスでない: ' + JSON.stringify(n));
  if (!n.cal || !n.badge) throw new Error('描かれていない: ' + JSON.stringify(n));
});

await step('学習ログが study.records.v1 に残る', async () => {
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('study.records.v1') || '[]'));
  if (!rec.length) throw new Error('記録が空');
  const bad = rec.filter((r) => JSON.stringify(r).match(/@|名前|出席番号/));
  if (bad.length) throw new Error('個人情報らしきものが入っている');
});

console.log(steps.join('\n'));
console.log('\n--- 読み込みに失敗した宛先 ---');
const uniq = [...new Set(failed)];
console.log(uniq.length ? uniq.join('\n') : 'なし');
const nonFont = uniq.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u));
console.log(`うち Google Fonts 以外: ${nonFont.length} 件` + (nonFont.length ? '\n' + nonFont.join('\n') : ''));
console.log('\n--- CSP 違反 ---'); console.log(csp.length ? [...new Set(csp)].join('\n') : '0 件');
console.log('--- JS エラー（フォントの読み込み失敗を除く）---');
const realErrors = [...new Set(errors)].filter((e) => !/Failed to load resource/.test(e));
console.log(realErrors.length ? realErrors.join('\n') : '0 件');

await browser.close();
const failedSteps = steps.filter((s) => s.startsWith('❌')).length;
process.exit(failedSteps || nonFont.length || csp.length || realErrors.length ? 1 : 0);
