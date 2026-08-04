/**
 * アイコンを軽くする。色数の少ない絵をフルカラーで持つ理由はない。
 *
 *   node tools/optimize-icons.mjs
 *
 * ⚠️ sharp を通して書き直すとパレットが落ちる。作ったバッファをそのまま書くこと。
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';

const kb = (p) => (statSync(p).size / 1024).toFixed(1);

/** 色数を落としながら、目標サイズに収まったいちばん色数の多い版を選ぶ */
async function palette(src, dest, size, limitKB) {
  const before = existsSync(dest) ? kb(dest) : '—';
  let best = null;
  for (const colours of [256, 192, 128, 96, 64, 48, 32]) {
    const buf = await sharp(src).resize(size, size)
      .png({ palette: true, colours, effort: 10, compressionLevel: 9 }).toBuffer();
    if (!best || buf.length < best.length) best = buf;
    if (buf.length / 1024 <= limitKB) { best = buf; break; }
  }
  writeFileSync(dest, best);
  console.log(`${dest.padEnd(30)} ${String(before).padStart(7)} KB → ${kb(dest).padStart(7)} KB  (上限 ${limitKB}KB)`);
}

await palette('icons/icon-512.png',     'icons/icon-512.png',     512, 60);
await palette('icons/icon-192.png',     'icons/icon-192.png',     192, 30);
await palette('icons/maskable-512.png', 'icons/maskable-512.png', 512, 60);
// maskable の 192 が無かったので 512 から作る（manifest は 192/512 の両方を要求する）
await palette('icons/maskable-512.png', 'icons/maskable-192.png', 192, 30);
await palette('icons/apple-touch-icon.png', 'icons/apple-touch-icon.png', 180, 30);
