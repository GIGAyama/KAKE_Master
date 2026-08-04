/**
 * アイコンを画素で測る。
 *
 *   node tools/measure-icons.mjs
 *
 * - apple-touch-icon に透明が含まれていないか（iOS は透明部分を黒で埋める）
 * - maskable の「セーフゾーン外にどれだけ中身がはみ出しているか」
 *   ⚠️ アイコン自身の下地は切り抜かれてよいので、中身と区別して数える。
 *     一緒に数えると実態よりずっと深刻に見える。
 */
import sharp from 'sharp';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'icons';

const alphaStats = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  return { w: info.width, h: info.height, transparentPct: (transparent / (info.width * info.height)) * 100 };
};

/** 中央 80% の円（マスク領域）の外側に「下地でない中身」が何％あるか */
const maskableStats = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const cx = W / 2, cy = H / 2, r = W * 0.4;   // 中央80%の円 = 半径40%

  const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };

  // 「下地」を四隅の4点だけで決めない。
  // 下地はたいてい左上が明るく右下が暗いグラデーションなので、4点だと取りこぼし、
  // 縮小やパレット化でわずかに色がずれた下地まで「中身」に数えてしまう。
  // 外周を1周ぐるりと標本にして、そのどれかに近ければ下地とみなす。
  const ring = [];
  const step = Math.max(1, Math.floor(W / 64));
  for (let x = 0; x < W; x += step) { ring.push(at(x, 1)); ring.push(at(x, H - 2)); }
  for (let y = 0; y < H; y += step) { ring.push(at(1, y)); ring.push(at(W - 2, y)); }
  const isBase = (p) => ring.some((c) =>
    Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 90);

  let outsideContent = 0, outsideAll = 0, total = W * H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) continue;   // セーフゾーンの中
      outsideAll++;
      const p = at(x, y);
      if (p[3] < 20) continue;              // 透明は中身ではない
      if (isBase(p)) continue;              // 下地は切り抜かれてよい
      outsideContent++;
    }
  }
  return {
    W, H,
    outsideContentPct: (outsideContent / total) * 100,
    outsideAllPct: (outsideAll / total) * 100,
  };
};

console.log('| ファイル | 寸法 | 容量 | 透明画素 | 判定 |');
console.log('|---|---|---:|---:|---|');
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()) {
  const p = join(DIR, f);
  const kb = statSync(p).size / 1024;
  const a = await alphaStats(p);
  let verdict = '';
  if (/apple-touch/.test(f)) {
    verdict = a.transparentPct > 0.01 ? `❌ 透明あり（iOS で四隅が黒くなる）` : '✅ 透明なし';
  } else if (/^favicon/.test(f)) {
    verdict = kb <= 30 ? '✅' : `❌ 30KB 超`;
  } else if (/512/.test(f)) {
    verdict = kb <= 60 ? '✅' : `❌ 60KB 超`;
  } else {
    verdict = '—';
  }
  console.log(`| ${f} | ${a.w}×${a.h} | ${kb.toFixed(1)} KB | ${a.transparentPct.toFixed(2)}% | ${verdict} |`);
}

console.log('\n### maskable のセーフゾーン（目標: 中身 0.2% 以下）');
console.log('| ファイル | 円の外の中身 | 円の外ぜんぶ | 判定 |');
console.log('|---|---:|---:|---|');
for (const f of readdirSync(DIR).filter((f) => /maskable/.test(f)).sort()) {
  const m = await maskableStats(join(DIR, f));
  console.log(`| ${f} | ${m.outsideContentPct.toFixed(2)}% | ${m.outsideAllPct.toFixed(2)}% | ${m.outsideContentPct <= 0.2 ? '✅' : '❌'} |`);
}
