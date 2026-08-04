# ロールアウト記録 — KAKE_Master（九九カード）

GIGA Standard v5 の改修モード（`/rollout`）を1本通した記録。
**他のリポジトリにも効く知見**を最後にまとめてある。

## このリポジトリでやったこと

| フェーズ | 内容 |
|---|---|
| Phase 0 | 静的検査 → 実ブラウザで実測（3幅 × 6画面）→ `AUDIT.md` |
| P0 | `LICENSE` / `.gitignore` / `.github/dependabot.yml` / `.github/workflows/ci.yml` を新規作成 |
| P0.5 | **該当なし。** `@babel/standalone`・Tailwind CDN・CDN の React はいずれも無く、CDN から取る実行コードは元から 0 バイト |
| P1 | 拡大禁止の解除／`100vh` の整理／safe-area 左右／Canvas の DPR 補正／タップ44px／reduced-motion・forced-colors／**コントラスト 137→0 件**／PWA 一式／CSP |
| P2 | アイコンをパレット PNG 化（222.0 KB → 75.3 KB）、`maskable-192` を新規追加 |
| P3 | `MANUAL.md` / `AUDIT.md` / `ROLLOUT.md` 新規、README 追記 |
| P4 | 品質ゲート（`scripts/`）+ テスト（`tests/`）+ 実測ツール（`tools/`）。**わざと壊して落ちることを 25/25 で確認** |

主な数字は [`AUDIT.md`](AUDIT.md) 参照。

## 停止条件に触れたもの

| 項目 | 判断 |
|---|---|
| `manifest` の `id` 変更 | **停止しない。** `/KAKE_Master/manifest.webmanifest` にある `"./"` の解決結果は `/KAKE_Master/` と同じで、同一性は変わらない。`id` は元から省略されており、省略時の既定値も `start_url`（＝同じ値）。根拠は AUDIT.md E1 |
| 提示モードの追加 | **止めて人間に聞く。** 新機能の追加であり P1 の手順に含まれない。プレイ画面が余白ぎりぎりの作りで、`font-size: 150%` を当てるとレイアウトの作り直しが要る |
| 配色の変更 | **仕様として実施。** コントラストが基準未満なのは直すのが仕様（v5）。色相は変えず、面か文字を1〜2段濃くした。変更前後の比は AUDIT.md D8 に全パターン記載 |

---

# 他のリポジトリにも効く知見

## 1. v5 §7-2 のコントラスト測定コードに、アルファの割り戻しの誤りがある

標準に載っている `parse()` は最後にこう書いてある。

```javascript
return a === 0 ? [0,0,0,0] : [d[0]/a, d[1]/a, d[2]/a, a];   // ❌
```

**`getImageData` が返す RGB は「アルファを掛ける前」の値**なので、割り戻してはいけない。
実測すると `rgba(255,255,255,.25)` は `[255, 255, 255, 64]` で返る。
割り戻すと `rgb(1016, 1016, 1016)` になり、**半透明の帯の上の白文字が
実際よりずっと明るく判定されて見逃される。**

```javascript
return a === 0 ? [0,0,0,0] : [d[0], d[1], d[2], a];         // ✅
```

このリポジトリでは、これを直したことで `.ktag`（比 2.10 と誤報 → 実際は **1.48**）と
`.kyomi`（2.16 → 実際は **1.50**）が正しく検出された。
**半透明のバッジやピルを使っているリポジトリはすべて影響を受ける。**

確かめ方（1回走らせれば分かる）：

```javascript
cx.fillStyle = 'rgba(255,255,255,.25)'; cx.fillRect(0,0,1,1);
[...cx.getImageData(0,0,1,1).data]   // → [255, 255, 255, 64]
```

## 2. 背景の合成で「下地は白」と決め打つと、比 1.0 の誤報が出る

グラデーションの上に白文字を置いた要素で、「白の上の白（比 1.0）」という
ありえない値が出る。下地の候補に**最終的な白**が混じるため。

外側から内側へ、各要素の取りうる色（`backgroundColor` ＋ グラデーションの各ストップ）を
順に重ね、**いちばん不利な組み合わせ**を採る。実装は `tools/measure-ui.mjs` の `effectiveBg()`。

## 3.「勝手にリロードしていないか」を `framenavigated` で数えてはいけない

v5 §3-3 は「画面遷移の回数を数える。1回なら正常」としているが、
**`history.pushState` でも `framenavigated` は飛ぶ。**
画面切替に History API を使っているアプリ（このリポジトリの `js/nav.js` がそう）は、
何も悪いことをしていなくても **3回** と出る。

数えるべきは「文書が何回読み込み直されたか」。`addInitScript` で
`sessionStorage` のカウンタを増やすのが確実。

```javascript
await ctx.addInitScript(() => {
  const k = '__docLoads';
  sessionStorage.setItem(k, String(Number(sessionStorage.getItem(k) || 0) + 1));
});
```

**この誤りは「直っているのに落ちる」方向**なので、直す作業を無駄に増やす。

## 4. 圏外を `context.setOffline` で作ってはいけない

Playwright の `setOffline` は**ページ側の通信にしか効かない。
Service Worker の中の `fetch()` はそのまま外へ出ていく。**

そのため「本体キャッシュを消して圏外にしたのに、アプリが普通に出る」＝
`offline.html` が出ない、という結果になる。**出ていないのではなく、圏外になっていない。**
このリポジトリでは、これに気づくまで `offline.html` の実装を疑って時間を使った。

正しい測り方は2つ重ねる：

1. **サーバーを本当に止める**（測定ツール自身がサーバーを持ち、`socket.destroy()` する）
2. **`Network.clearBrowserCache`（CDP）でブラウザの HTTP キャッシュも消す**
   — 止めただけだとディスクキャッシュから返ってしまう

実装は `tools/measure-pwa.mjs`。**そのまま他リポジトリへ持っていける。**

## 5. 静的検査は、規則を説明したコメント自身に反応する

v5 §P4 は `SW_LOCALSTORAGE` の誤検知（「localStorage は操作しない」という注意書きに反応）を
挙げているが、**同じことが HTML と CSS でも起きる。** 実際にこのリポジトリで4件出た。

| 検査 | 反応してしまった文 |
|---|---|
| `script-src` に `'unsafe-inline'` が無いか | 「script-src に `'unsafe-inline'` は足さない」 |
| `frame-ancestors` を書いていないか | 「frame-ancestors はここに書いても無視される」 |
| インラインの `<script>` が無いか | 「インラインの `<script>` と onclick= は…」 |
| 裸の `100vh` が無いか | 「100vh ははみ出すので dvh を使う」 |

**正しく直して、その理由をコメントに書いたリポジトリほど落ちる**という、いちばん困る形になる。
判定の前に `<!-- -->` と `/* */` を落とすこと。

```javascript
const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ');
const stripCssComments  = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
```

## 6. `::after` でタップ領域を広げる手は、密なグリッドには使えない

v5 §2-9 の `.tap-44::after` は、詰まったツールバーには効くが、
**マスが 44px 未満で敷き詰められたグリッドには使えない。**
当たり判定が隣と重なり、**別のマスを押してしまう**（このリポジトリの 81マスの
ヒートマップは 320px 幅で1マス 22px しかなく、44px にすると 2倍重なる）。

逃がし方：マスを `minmax(44px, 1fr)` にして、**その枠の中だけ横スクロール**させる。

```css
.heatmap-scroll { overflow-x: auto; overscroll-behavior-x: contain; }
.heatmap { grid-template-columns: auto repeat(9, minmax(44px, 1fr)); min-width: max-content; }
```

ページ全体の横スクロールは出ないので、320px の下限要件は満たしたまま。

## 7. 実測ツールは「何件あったか」だけでなく「何個見たか」を出す

サーバーが落ちている・画面が出ていない状態で測ると、**すべて 0 件**になり、
「全部きれい」と読めてしまう。実際、測定中にサーバーの状態を疑う場面があった。

走査した要素数を必ず持ち帰り、少なすぎたら 0 件と報告せずに落とす。

```
=== 走査した数 === 文字要素 2835 個 / ボタン 1245 個（18 画面ぶん）
=== コントラスト基準未満 === 0 件
```

これは §P4 の「わざと壊して通ることを確認する」を、**検査だけでなく実測にも当てる**という話。

---

# 横断で確かめたほうがよいこと

このリポジトリで見つかった形が、他に何本あるかを数えるコマンド。

```bash
# 1. install の中で skipWaiting していないか（操作中に画面が入れ替わる）
grep -l "skipWaiting" $(git ls-files '*sw.js') | xargs grep -l "addEventListener('install'"

# 2. 拡大を禁止していないか
grep -rn "user-scalable=no\|maximum-scale" $(git ls-files '*.html' '*.gs')

# 3. beforeinstallprompt を module の中で待っていないか（合図を取りこぼす）
grep -rn "beforeinstallprompt" $(git ls-files 'js/*.js' 'src/*.js*')

# 4. Canvas に DPR 補正があるか
grep -rln "getContext('2d')" $(git ls-files '*.js') | xargs grep -L "devicePixelRatio"

# 5. manifest の id が省略されていないか
git ls-files '*manifest*' | xargs grep -L '"id"'

# 6. offline.html があるか
git ls-files | grep -c offline.html

# 7. reduced-motion を 0 にしていないか（要素が消える）
grep -rn -A5 "prefers-reduced-motion" $(git ls-files '*.css') | grep "duration: 0"
```

**1本を深く終えたら、そこで見つかった不具合を「その1本の問題」で終わらせない。**
とくに上の 1・2・3 は、このリポジトリで実際に見つかった（3件とも該当していた）。

## 次にやること

- `tools/` の3本（`measure-ui` / `measure-pwa` / `measure-icons`）と
  `scripts/lib/giga-v5-checks.mjs` は、**そのまま他リポジトリへ持っていける形**にしてある。
  横断共有の正本（`scripts/lib/project-quality.mjs`）が手に入ったら合成する。
- 上の「1. アルファの割り戻し」は、**すでに実測を終えたリポジトリの数字を疑わせる。**
  半透明の面（`rgba(255,255,255,.2)` 前後のバッジ・ピル・オーバーレイ）を使っている
  リポジトリは、測り直したほうがよい。
