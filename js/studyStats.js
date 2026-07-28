// ==========================================================
// 学習ログ(study.v1)の読み出し・集計
// ----------------------------------------------------------
// 仕様: 学習ログ共通スキーマ仕様書 study.v1 §5.5
//
// ・読み出し専用。'study.records.v1' への書き込み・削除は行わない
// ・自アプリ(kuku-card)のレコードだけを対象にする
// ・パースに失敗しても空配列を返し、アプリの表示を壊さない
// ==========================================================
import { APP_ID } from './studySession.js';

const STUDY_LOG_KEY = 'study.records.v1';

export function loadStudyRecords(appId = APP_ID) {
  try {
    const raw = localStorage.getItem(STUDY_LOG_KEY);
    if (!raw) return [];
    const log = JSON.parse(raw);
    if (!Array.isArray(log)) return [];
    return log
      .filter((r) => r && r.schema === 'study.v1' && r.appId === appId)
      .reverse();   // 新しい順
  } catch (e) {
    return [];
  }
}

const MODE_LABELS = {
  flashcard: 'カードでれんしゅう',
  'flashcard-reverse': 'カード(こたえ→しき)',
  quiz: 'こたえてクイズ',
  pair: 'ふたりでもんだい',
};

// 学力の指標として数えてよいレコードか。
// ふたりでもんだいは相手の判定に左右されるため、取り組み量としてのみ数える(§5.5)。
const isScorable = (r) => r.multiplayer !== true;

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

// 直近 days 日のまとめ
export function recentSummary(records, days = 7) {
  const from = Date.now() - days * 24 * 60 * 60 * 1000;
  const inRange = records.filter((r) => {
    const t = Date.parse(r.startedAt);
    return isFinite(t) && t >= from;
  });

  let cards = 0, activeMs = 0, attempted = 0, firstTryCorrect = 0;
  inRange.forEach((r) => {
    const s = r.summary || {};
    cards += num(s.attempted);
    activeMs += num(r.activeMs) || num(r.elapsedMs);
    if (isScorable(r)) {
      attempted += num(s.attempted);
      firstTryCorrect += num(s.firstTryCorrect);
    }
  });

  return {
    sessions: inRange.length,
    cards,
    activeMs,
    // 正答率は firstTryCorrect / attempted(§5.5)。対象がなければ null
    firstTryRate: attempted > 0 ? Math.round((firstTryCorrect / attempted) * 100) : null,
  };
}

// 1レコードを画面表示用にほぐす
export function describeRecord(r) {
  const s = r.summary || {};
  const attempted = num(s.attempted);
  const d = new Date(r.startedAt);
  const date = isFinite(d.getTime())
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : '';

  const ms = num(r.activeMs) || num(r.elapsedMs);
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);

  return {
    date,
    mode: MODE_LABELS[r.mode] || r.mode,
    unit: (r.unit && r.unit.title) || '',
    weak: r.source === 'weak',
    aborted: r.status === 'aborted',
    multiplayer: r.multiplayer === true,
    countText: `${attempted}まい`,
    // ふたりでもんだいは正答率を出さない
    scoreText: r.multiplayer === true || attempted === 0
      ? null
      : `${num(s.firstTryCorrect)}/${attempted}`,
    timeText: min > 0 ? `${min}分${String(sec).padStart(2, '0')}秒` : `${sec}秒`,
  };
}
