// ==========================================================
// 学習ログ(study.v1)- 九九カードのレコード組み立て
// ----------------------------------------------------------
// 仕様: 学習ログ共通スキーマ仕様書 study.v1 (1.5)
// このファイルは「アプリ固有の組み立て」層。
// 共通・不変の保存処理は studyLog.js、読み出しは studyStats.js。
//
// 保存先は localStorage の 'study.records.v1'(全アプリ共通)。
// 外部への送信は一切行わない。児童を識別する情報も持たない。
// ==========================================================
import { saveStudyRecord } from './studyLog.js';
import { STAGES } from './data.js';
import { calcStreak, masterCount, weakKeys } from './storage.js';

export const APP_ID = 'kuku-card';
export const APP_VERSION = '1.3.0';

const GRADE = 2;                       // 九九は小学校2年の学習内容
const ITEMS_MAX = 200;                 // §2.10。切り詰めは組み立て側で行う(§2.7)
const IDLE_ABORT_MS = 5 * 60 * 1000;   // 5分もどらなければ中断として締める(§5.4)

// ==========================================================
// 単元ID(§2.5)
// ----------------------------------------------------------
// 表示名(title)は言い回しの調整で変わりうるが、id は一度決めたら変えない。
// 段の番号は表示名ではなく学習内容そのものなので、番号を鍵に表を持つ。
// 表示名を変えるときは title だけを直し、id はそのままにすること。
// ==========================================================
const STAGE_UNITS = {
  1: { id: 'dan-1', title: '1のだん' },
  2: { id: 'dan-2', title: '2のだん' },
  3: { id: 'dan-3', title: '3のだん' },
  4: { id: 'dan-4', title: '4のだん' },
  5: { id: 'dan-5', title: '5のだん' },
  6: { id: 'dan-6', title: '6のだん' },
  7: { id: 'dan-7', title: '7のだん' },
  8: { id: 'dan-8', title: '8のだん' },
  9: { id: 'dan-9', title: '9のだん' },
};

const WEAK_UNIT = { id: 'weak-cards', title: 'にがてカード' };

// 選んだ段から単元を作る。複数の段は合成IDにし、全IDを ext.unitIds に残す(§2.5)。
function unitFor(stages, weak) {
  if (weak) {
    return { unit: { ...WEAK_UNIT, grade: GRADE, preset: true }, unitIds: null };
  }
  const list = [...new Set(stages)].filter((n) => STAGE_UNITS[n]).sort((a, b) => a - b);
  if (list.length === 0) list.push(2);

  const ids = list.map((n) => STAGE_UNITS[n].id).sort();
  if (ids.length === 1) {
    return {
      unit: { id: ids[0], title: STAGE_UNITS[list[0]].title, grade: GRADE, preset: true },
      unitIds: null,
    };
  }
  // 長くなりすぎる組み合わせは先頭3件＋残数に丸める。元の組み合わせは ext.unitIds に残る。
  const head = ids.length > 3 ? [...ids.slice(0, 3), `etc${ids.length - 3}`] : ids;
  const title = list.length === STAGES.length ? 'ぜんぶのだん' : `${list.join('・')}のだん`;
  return {
    unit: { id: `mix-${head.join('+')}`, title, grade: GRADE, preset: true },
    unitIds: ids,
  };
}

// 設問ID(§2.10)。式そのものが安定した識別子になる。'2-3' → '2x3'
export const factQ = (key) => String(key).replace('-', 'x');

// ==========================================================
// 操作していた時間(activeMs)の計測 — §2.8 の参照実装
// ==========================================================
let activeMs = 0;
let mark = Date.now();
let idle = false;
let trackerStarted = false;

const tick = () => {
  if (!idle && !document.hidden) activeMs += Date.now() - mark;
  mark = Date.now();
};
const wake = () => { tick(); idle = false; };

function startTracker() {
  if (trackerStarted) return;
  trackerStarted = true;
  mark = Date.now();
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach((ev) =>
    document.addEventListener(ev, wake));
  setInterval(() => { tick(); idle = true; }, 60000);   // 60秒無操作で停止
}

// ==========================================================
// セッション(1レコード)
// ==========================================================
let current = null;
let resumeHandler = null;

function createSession(spec) {
  startTracker();
  tick();

  const startedAt = new Date();
  const t0 = Date.now();
  const activeBase = activeMs;
  const keepItems = spec.keepItems !== false;
  const merge = spec.merge === true;

  const items = [];
  const byQ = new Map();
  let attempts = 0, firstOk = 0, finalOk = 0;   // items を持たないモード用
  let questionAt = Date.now();
  let closed = false;

  return {
    // 次の問題を出したタイミング(設問ごとの解答時間の起点)
    question() { questionAt = Date.now(); },

    answer({ q, ok, hint = false, wrong = null }) {
      if (closed) return;
      const now = Date.now();
      const ms = Math.max(0, now - questionAt);
      questionAt = now;

      if (!keepItems) {
        attempts++;
        if (ok) { firstOk++; finalOk++; }
        return;
      }

      const wrongList = wrong == null ? [] : (Array.isArray(wrong) ? wrong : [String(wrong)]);
      const prev = merge ? byQ.get(q) : null;
      if (prev) {
        // マージ方式: firstTry は初回の結果を保持し、ok は最終結果で上書きする(§2.7)
        prev.tries += 1;
        prev.ok = ok;
        prev.ms += ms;
        if (hint) prev.hint = true;
        if (wrongList.length) prev.wrong = [...(prev.wrong || []), ...wrongList];
        return;
      }
      const it = { q, ok, firstTry: ok, tries: 1, ms, hint: !!hint };
      if (wrongList.length) it.wrong = wrongList;
      items.push(it);
      if (merge) byQ.set(q, it);
    },

    // 解答が1件でもあるか(1問も解いていない中断は保存しない — §5.4)
    get hasAnswer() { return keepItems ? items.length > 0 : attempts > 0; },

    finish(status = 'completed', extra = {}, endAt = Date.now()) {
      if (closed) return null;
      closed = true;
      if (status !== 'completed' && !this.hasAnswer) return null;

      // 200件を超える分は組み立て側で切り詰め、summary は切り詰め後から算出する(§2.7)
      const kept = keepItems ? items.slice(0, ITEMS_MAX) : null;
      const truncated = keepItems && items.length > kept.length
        ? { attempted: items.length, firstTryCorrect: items.filter((it) => it.firstTry).length }
        : null;

      const attempted = keepItems ? kept.length : attempts;
      const firstTryCorrect = keepItems ? kept.filter((it) => it.firstTry).length : firstOk;
      const correct = keepItems ? kept.filter((it) => it.ok).length : finalOk;
      const count = Math.max(spec.count || 0, attempted);

      const elapsedMs = Math.max(0, endAt - t0);
      tick();
      // 別の時計による誤差で activeMs > elapsedMs にならないよう抑え込む(§2.8)
      const active = Math.min(Math.max(0, activeMs - activeBase), elapsedMs);

      return saveStudyRecord({
        appId: APP_ID,
        appVersion: APP_VERSION,
        kind: 'session',
        mode: spec.mode,
        unit: spec.unit,
        source: spec.source,
        multiplayer: !!spec.multiplayer,
        grading: spec.grading,
        startedAt: startedAt.toISOString(),
        endedAt: new Date(endAt).toISOString(),
        elapsedMs,
        activeMs: active,
        timeBasis: 'app',
        status,
        summary: { count, attempted, firstTryCorrect, correct },
        ...(kept ? { items: kept } : {}),
        ext: {
          ...baseExt(),
          ...(spec.unitIds ? { unitIds: spec.unitIds } : {}),
          ...extra,
          ...(truncated ? { itemsTruncated: truncated } : {}),
        },
      });
    },
  };
}

// アプリ共通の ext。児童の定着状況の目安であり、児童を識別する情報は含めない。
function baseExt() {
  return {
    mastered: masterCount(),         // マスター済みの九九(81中)
    weakCards: weakKeys().length,    // にがてカードの枚数
    streak: calcStreak(),            // 連続学習日数
  };
}

function begin(spec) {
  // 前のセッションが残っていれば中断として締めてから始める
  if (current) current.finish('aborted');
  current = createSession(spec);
  return current;
}

function close(status, extra, endAt) {
  if (!current) return null;
  const s = current;
  current = null;
  return s.finish(status, extra, endAt);
}

// ==========================================================
// 中断の検知(§5.4)
// ----------------------------------------------------------
// ・タブが非表示になって5分もどらなければ、離脱した時刻で締める
// ・タブが破棄される場合に備え pagehide でも必ず締める
// ・締めたあとに学習が続く場合は、残り分で新しいレコードを開始する
// ==========================================================
let hiddenAt = 0;
let abortTimer = 0;

function requestResume() {
  if (current || typeof resumeHandler !== 'function') return;
  resumeHandler();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (!current) return;
    hiddenAt = Date.now();
    clearTimeout(abortTimer);
    // 待っていた5分を学習時間に含めないよう、離脱した時刻で締める
    abortTimer = setTimeout(() => close('aborted', {}, hiddenAt), IDLE_ABORT_MS);
  } else {
    clearTimeout(abortTimer);
    abortTimer = 0;
    if (hiddenAt) requestResume();
    hiddenAt = 0;
  }
});

// Chromebook ではメモリ不足やスリープでタブが破棄されることがある。
// beforeunload は取りこぼすため pagehide を使う。
window.addEventListener('pagehide', () => {
  clearTimeout(abortTimer);
  abortTimer = 0;
  close('aborted');
});

// bfcache から戻って学習が続く場合は、残り分で新しいレコードを開始する
window.addEventListener('pageshow', (e) => {
  if (e.persisted) requestResume();
});

// ==========================================================
// アプリから使う入口
// ==========================================================
export const study = {
  // カードでれんしゅう。できた/もういちど は児童の自己評価なので grading は selfReport。
  // 「こたえ → しき」は難しさが変わるため別モードとして記録する(§0-4)。
  beginFlash(meta, count) {
    const { unit, unitIds } = unitFor(meta.stages, meta.weak);
    return begin({
      mode: meta.face === 'back' ? 'flashcard-reverse' : 'flashcard',
      unit,
      unitIds,
      source: meta.weak ? 'weak' : 'course',
      grading: 'selfReport',
      multiplayer: false,
      count,
      merge: true,   // 同じカードが山の下にもどって再出題されるため
    });
  },

  // こたえてクイズ。数字で答えるので客観採点。
  beginQuiz(meta, count) {
    const { unit, unitIds } = unitFor(meta.stages, meta.weak);
    return begin({
      mode: 'quiz',
      unit,
      unitIds,
      source: meta.weak ? 'weak' : 'course',
      grading: 'objective',
      multiplayer: false,
      count,
      merge: false,  // 1問1回きり。同じ式は出題されない
    });
  },

  // ふたりでもんだい。相手の児童が○×を押すため学力指標には使えない(§5.5)。
  // 誰の解答かを分けられないので設問層は持たせない。
  beginPair(meta, count) {
    const { unit, unitIds } = unitFor(meta.stages, meta.weak);
    return begin({
      mode: 'pair',
      unit,
      unitIds,
      source: 'course',
      grading: 'selfReport',
      multiplayer: true,
      count,
      keepItems: false,
    });
  },

  question() { if (current) current.question(); },
  answer(o) { if (current) current.answer(o); },
  finish(status = 'completed', extra = {}) { return close(status, extra); },
  abort() { return close('aborted'); },

  get active() { return !!current; },

  // 中断のあと学習が続いたときに、残り分で新しいレコードを始めるための処理
  onResume(fn) { resumeHandler = fn; },
};
