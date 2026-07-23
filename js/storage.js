// ==========================================================
// 永続化(localStorage)- 学習記録・設定の保存
// ==========================================================
const KEY = 'kuku-card-v1';

const DEFAULTS = {
  settings: {
    stages: [2],          // 選択中の段
    order: 'asc',         // asc | desc | random
    face: 'front',        // front(式→答え) | back(答え→式)
    kana: true,           // ふりがな表示
    sound: true,          // 効果音
    quizCount: '10',      // クイズの問題数
  },
  // facts['a-b'] = { c: 正解数, w: 誤答数, s: 連続正解 }
  facts: {},
  // days['YYYY-MM-DD'] = その日にめくった/答えた枚数
  days: {},
  totals: { cards: 0, quiz: 0, pair: 0, perfect: 0 },
  best: {}, // best['quiz:2,3:10'] = { time, acc }
};

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

export const store = {
  data: null,

  load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { /* プライベートモード等 */ }
    const saved = raw ? safeParse(raw) : null;
    this.data = {
      ...structuredClone(DEFAULTS),
      ...saved,
      settings: { ...DEFAULTS.settings, ...(saved?.settings || {}) },
      totals: { ...DEFAULTS.totals, ...(saved?.totals || {}) },
    };
    return this.data;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* 保存不可でも続行 */ }
  },

  reset() {
    this.data = structuredClone(DEFAULTS);
    this.save();
  },
};

// 今日の日付キー(端末ローカル時刻・YYYY-MM-DD)
export function todayKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 1問の結果を記録
export function recordFact(key, correct) {
  const f = store.data.facts[key] || { c: 0, w: 0, s: 0 };
  if (correct) { f.c++; f.s++; } else { f.w++; f.s = 0; }
  store.data.facts[key] = f;
}

// 定着レベル(0=未学習, 1=れんしゅうちゅう, 2=もうすこし, 3=マスター)
export function factLevel(key) {
  const f = store.data.facts[key];
  if (!f || (f.c === 0 && f.w === 0)) return 0;
  if (f.s >= 3) return 3;
  if (f.s >= 1 && f.c >= 2) return 2;
  return 1;
}

// 「にがて」判定:間違いが多い or 連続正解が途切れている
export function isWeak(key) {
  const f = store.data.facts[key];
  if (!f) return false;
  return f.w >= 1 && f.s < 3;
}

// 今日の活動を加算(枚数)
export function addActivity(count) {
  const k = todayKey();
  store.data.days[k] = (store.data.days[k] || 0) + count;
}

// 連続学習日数(今日または昨日から遡る)
export function calcStreak() {
  const days = store.data.days;
  let streak = 0;
  let offset = days[todayKey()] ? 0 : -1;
  while (days[todayKey(offset)]) { streak++; offset--; }
  return streak;
}

// マスター済みの九九の数(81個中)
export function masterCount() {
  let n = 0;
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
    if (factLevel(`${a}-${b}`) === 3) n++;
  }
  return n;
}

// にがてカードのキー一覧
export function weakKeys() {
  const keys = [];
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
    if (isWeak(`${a}-${b}`)) keys.push(`${a}-${b}`);
  }
  return keys;
}
