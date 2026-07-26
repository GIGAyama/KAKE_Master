// ==========================================================
// 「もどる」操作(履歴スタック)の管理
// ==========================================================
// スマホ・タブレットの「戻る」操作(画面下部のナビゲーションバーのタップ、
// 画面の左右の端から中央に向かうエッジスワイプ)を、アプリ内の
// 「1つ前の階層にもどる」操作として扱うためのしくみ。
//
//  ・画面をひらくたびに history エントリを1つ積む
//    → 「戻る」1回でアプリ内を1階層だけもどり、
//      ブラウザが前のページへ移動してしまうことがない
//  ・ホームより手前に「ガード」エントリを1つ置く
//    → ホームで「戻る」しても すぐにアプリが終了せず、
//      2回続けたときだけ終了(前のページへ移動)を許可する

const MARK = 'kukuNav';        // アプリの画面エントリを見分ける印
const GUARD = 'kukuNavGuard';  // ホームの手前に置く番人エントリの印
const EXIT_WINDOW = 2500;      // 「もういちど」を待つ時間(ms)
const BACK_LOCK = 400;         // 「もどる」の連打で2階層すすむのを防ぐ(ms)

/**
 * 画面遷移と履歴を同期させるナビゲーションを作る。
 *
 * @param {object}   o
 * @param {string}   o.root       いちばん下の階層(ホーム)の画面名
 * @param {Function} o.onShow     画面を描画する (name) => void
 * @param {Function} o.onLeave    画面から出たときの片づけ (name) => void
 * @param {Function} o.canShow    その画面をいま表示できるか (name) => boolean
 * @param {Function} o.onExitHint ホームで「戻る」した1回目に呼ばれる
 */
export function createNav({
  root = 'home',
  onShow,
  onLeave = () => {},
  canShow = () => true,
  onExitHint = () => {},
}) {
  let stack = [root];
  let exitArmedAt = 0;
  let backLockedAt = 0;
  let historyOk = true; // 履歴APIが使えない環境ではボタン操作だけで動かす

  const current = () => stack[stack.length - 1];
  const stateFor = (s) => ({ [MARK]: true, stack: [...s] });

  // URLは変えずに状態だけを記録する(公開場所のパスに依存しないため)
  function write(method, state) {
    if (!historyOk) return;
    try { history[method](state, ''); } catch { historyOk = false; }
  }

  function display(name, from) {
    if (from && from !== name) onLeave(from);
    onShow(name);
  }

  // 1つ深い階層をひらく(「戻る」で from にもどってくる)
  function push(name) {
    const from = current();
    if (name === from) { onShow(name); return; }
    stack = [...stack, name];
    write('pushState', stateFor(stack));
    display(name, from);
  }

  // いまの階層を置きかえる(結果画面など、「戻る」でもどりたくない遷移)
  function replace(name) {
    const from = current();
    stack = [...stack.slice(0, -1), name];
    write('replaceState', stateFor(stack));
    display(name, from);
  }

  // ホームまで一気にもどる(積んだエントリもまとめて片づける)
  function toRoot() {
    const from = current();
    const depth = stack.length - 1;
    stack = [root];
    if (depth > 0 && historyOk) {
      // まとめて戻すと popstate は1回だけ発生する。
      // そのときスタックはすでにホームなので、同期処理は何もしない。
      try { history.go(-depth); } catch { historyOk = false; }
    } else {
      write('replaceState', stateFor(stack));
    }
    display(root, from);
  }

  // アプリ内の「もどる」ボタン。端末の「戻る」と同じ経路を通す
  function back() {
    if (stack.length <= 1) return;
    const now = Date.now();
    if (now - backLockedAt < BACK_LOCK) return;
    backLockedAt = now;
    if (historyOk) {
      history.back();
    } else {
      const from = current();
      stack = stack.slice(0, -1);
      display(current(), from);
    }
  }

  // 履歴に記録されたスタックを、いま表示できる状態に整える
  function normalize(raw) {
    let s = Array.isArray(raw) ? raw.filter((n) => typeof n === 'string') : [];
    if (s.length === 0 || s[0] !== root) s = [root];
    // 「進む」操作などで、もう再開できない画面(終了した練習など)に
    // 来てしまった場合は、再開できる手前の階層までもどす
    const before = s.length;
    while (s.length > 1 && !canShow(s[s.length - 1])) s.pop();
    if (s.length !== before || s.length !== raw?.length) {
      write('replaceState', stateFor(s));
    }
    return s;
  }

  function onPopState(e) {
    const st = e.state;
    const from = current();

    // ホームより手前(ガード)まで戻ってきた
    if (!st || !st[MARK]) {
      const atHome = stack.length <= 1;
      if (atHome && exitArmedAt && Date.now() - exitArmedAt < EXIT_WINDOW) {
        exitArmedAt = 0;
        // 2回続けての「戻る」→ ここではじめてアプリの終了を許可する
        try { history.back(); } catch { /* 戻れなければそのまま */ }
        return;
      }
      // 履歴をホームの状態に積み直して、アプリの外に出ないようにする
      stack = [root];
      write('pushState', stateFor(stack));
      if (atHome) {
        exitArmedAt = Date.now();
        onExitHint();
      } else {
        display(root, from);
      }
      return;
    }

    exitArmedAt = 0;
    const next = normalize(st.stack);
    const target = next[next.length - 1];
    const settled = next.length === stack.length && target === from;
    stack = next;
    if (!settled) display(target, from);
  }

  function start() {
    window.addEventListener('popstate', onPopState);
    // ホームの手前に「ガード」エントリを1つ用意しておく
    write('replaceState', { [GUARD]: true });
    write('pushState', stateFor(stack));
    onShow(root);
  }

  return {
    start, push, replace, toRoot, back,
    get current() { return current(); },
    get depth() { return stack.length - 1; },
  };
}
