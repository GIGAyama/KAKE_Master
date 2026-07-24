// ==========================================================
// 九九カード - メインアプリケーション
// ==========================================================
import { STAGES, YOMI, makeCard, buildDeck, shuffle } from './data.js';
import {
  store, todayKey, recordFact, factLevel, addActivity,
  calcStreak, masterCount, weakKeys,
} from './storage.js';
import { sfx, speak, setSoundEnabled, isSoundEnabled } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// SVGスプライトのアイコンを生成
const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

store.load();
setSoundEnabled(store.data.settings.sound);

// ==========================================================
// 画面遷移
// ==========================================================
let activeScreen = 'home';

function show(name) {
  activeScreen = name;
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#screen-${name}`).classList.add('active');
  document.body.classList.toggle('playing', ['flash', 'quiz', 'pair'].includes(name));
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'records') renderRecords();
}

// ==========================================================
// トースト
// ==========================================================
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ==========================================================
// ホーム画面
// ==========================================================
function renderHome() {
  const h = new Date().getHours();
  $('#home-greet').textContent =
    h < 10 ? 'おはよう! きょうも 九九を れんしゅうしよう!' :
    h < 17 ? 'こんにちは! 九九カードで あそぼう!' :
    'こんばんは! ねるまえに ひとふくしゅう!';

  const today = store.data.days[todayKey()] || 0;
  $('#home-today').innerHTML = today > 0
    ? `きょうは <b>${today}</b> まい がんばったよ! すごい!`
    : 'きょうは まだ れんしゅうしていないよ。1まいから はじめよう!';

  const streak = calcStreak();
  $('#chip-streak').hidden = streak === 0;
  $('#streak-num').textContent = streak;

  const weak = weakKeys();
  $('#btn-weak').hidden = weak.length === 0;
  $('#weak-count').textContent = weak.length;
}

// ==========================================================
// 設定画面(モード共通)
// ==========================================================
let currentMode = 'flash'; // flash | quiz | pair

const MODE_TITLES = {
  flash: 'カードでれんしゅう',
  quiz: 'こたえてクイズ',
  pair: 'ふたりでもんだい',
};

function openSetup(mode) {
  currentMode = mode;
  $('#setup-title').textContent = MODE_TITLES[mode];
  $('#panel-face').hidden = mode !== 'flash';
  $('#panel-kana').hidden = mode !== 'flash';
  $('#panel-count').hidden = mode === 'flash';
  $('#pair-hint').hidden = mode !== 'pair';
  renderSetup();
  show('setup');
}

function renderSetup() {
  const s = store.data.settings;

  // 段ボタン
  const grid = $('#stage-grid');
  grid.innerHTML = '';
  STAGES.forEach((n) => {
    const btn = document.createElement('button');
    btn.className = 'stage-btn' + (s.stages.includes(n) ? ' on' : '');
    btn.innerHTML = `${n}<small>のだん</small>`;
    btn.addEventListener('click', () => {
      sfx.tap();
      if (s.stages.includes(n)) {
        if (s.stages.length === 1) { toast('さいてい 1つは えらんでね'); return; }
        s.stages = s.stages.filter((x) => x !== n);
      } else {
        s.stages = [...s.stages, n].sort((a, b) => a - b);
      }
      store.save();
      renderSetup();
    });
    grid.appendChild(btn);
  });

  // 順番
  $$('#order-segment .seg-btn').forEach((b) => {
    b.classList.toggle('on', b.dataset.order === s.order);
  });
  // カードのむき
  $$('#face-segment .seg-btn').forEach((b) => {
    b.classList.toggle('on', b.dataset.face === s.face);
  });
  // 問題数
  $$('#count-segment .seg-btn').forEach((b) => {
    b.classList.toggle('on', b.dataset.count === s.quizCount);
  });
  // ふりがな
  const t = $('#toggle-kana');
  t.classList.toggle('on', s.kana);
  t.setAttribute('aria-checked', String(s.kana));

  // 開始ボタンのカード枚数表示
  const total = s.stages.length * 9;
  const n = currentMode === 'flash' ? total
    : s.quizCount === 'all' ? total : Math.min(Number(s.quizCount), total);
  $('#start-count').textContent = `(${n}まいの カード)`;
}

$('#btn-all-stages').addEventListener('click', () => {
  store.data.settings.stages = [...STAGES];
  store.save(); sfx.tap(); renderSetup();
});
$('#btn-clear-stages').addEventListener('click', () => {
  store.data.settings.stages = [store.data.settings.stages[0]];
  store.save(); sfx.tap(); renderSetup();
});
$('#order-segment').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  store.data.settings.order = b.dataset.order;
  store.save(); sfx.tap(); renderSetup();
});
$('#face-segment').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  store.data.settings.face = b.dataset.face;
  store.save(); sfx.tap(); renderSetup();
});
$('#count-segment').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  store.data.settings.quizCount = b.dataset.count;
  store.save(); sfx.tap(); renderSetup();
});
$('#toggle-kana').addEventListener('click', () => {
  store.data.settings.kana = !store.data.settings.kana;
  store.save(); sfx.tap(); renderSetup();
});

$('#btn-start').addEventListener('click', () => {
  const s = store.data.settings;
  const deck = buildDeck(s.stages, s.order);
  if (currentMode === 'flash') startFlash(deck, { face: s.face, kana: s.kana });
  if (currentMode === 'quiz') {
    const n = s.quizCount === 'all' ? deck.length : Math.min(Number(s.quizCount), deck.length);
    startQuiz(deck.slice(0, n));
  }
  if (currentMode === 'pair') {
    const n = s.quizCount === 'all' ? deck.length : Math.min(Number(s.quizCount), deck.length);
    startPair(deck.slice(0, n));
  }
});

// ==========================================================
// カード要素の生成
// ==========================================================
function cardEl(card, { face = 'front', kana = true } = {}) {
  const el = document.createElement('div');
  el.className = 'kcard';

  const formula = `${card.a} × ${card.b}`;
  const frontIsAnswer = face === 'back';

  const frontMain = frontIsAnswer
    ? `<div class="kanswer" style="color:var(--amber-600);text-shadow:none">${card.ans}</div>
       <div style="font-size:13px;font-weight:900;color:var(--slate-400)">こたえが ${card.ans} になる しきは?</div>`
    : `<div class="kformula">${formula}</div>`;

  const backMain = frontIsAnswer
    ? `<div class="kformula">${formula}</div>
       ${kana ? `<div class="kyomi">${card.yomi}</div>` : ''}`
    : `<div class="kanswer">${card.ans}</div>
       ${kana ? `<div class="kyomi">${card.yomi}</div>` : ''}`;

  el.innerHTML = `
    <div class="kcard-inner">
      <div class="kface kface-front">
        <div class="kface-top">
          <span class="ktag">${card.a}のだん</span>
          <span class="khint">タップで こたえ</span>
        </div>
        <div class="kmain">${frontMain}</div>
        <div class="kfoot">おもて</div>
      </div>
      <div class="kface kface-back">
        <div class="kface-top">
          <span class="ktag">こたえ</span>
          <button class="kspeak" aria-label="よみあげ">${icon('sound')}</button>
        </div>
        <div class="kmain">${backMain}</div>
        <div class="kfoot">うら</div>
      </div>
    </div>`;

  el.querySelector('.kspeak').addEventListener('click', (e) => {
    e.stopPropagation();
    speak(card.yomi.replace(' ', '、'));
  });
  return el;
}

// ==========================================================
// カードれんしゅう(フラッシュカード)
// ==========================================================
let flash = null;

function startFlash(deck, opts, meta = {}) {
  flash = {
    queue: [...deck],
    total: deck.length,
    done: 0,
    missed: new Set(),
    t0: performance.now(),
    opts,
    meta, // { weakPractice: bool }
  };
  show('flash');
  renderFlashStack(true);
  updateFlashProgress();
}

function updateFlashProgress() {
  $('#flash-progress-text').textContent =
    `できた ${flash.done} まい ・ のこり ${flash.queue.length} まい`;
  const pct = flash.total === 0 ? 0 : (flash.done / flash.total) * 100;
  $('#flash-progress-fill').style.width = `${pct}%`;
}

function renderFlashStack(deal = false) {
  const stack = $('#card-stack');
  stack.innerHTML = '';
  const [c0, c1, c2] = flash.queue;
  if (c2) { const e = cardEl(c2, flash.opts); e.classList.add('behind2'); stack.appendChild(e); }
  if (c1) { const e = cardEl(c1, flash.opts); e.classList.add('behind1'); stack.appendChild(e); }
  if (c0) {
    const e = cardEl(c0, flash.opts);
    e.classList.add('current');
    if (deal) e.classList.add('deal-in');
    attachSwipe(e);
    stack.appendChild(e);
  }
}

function flashCurrentEl() { return $('#card-stack .kcard.current'); }

function flipCurrent() {
  const el = flashCurrentEl();
  if (!el) return;
  el.classList.toggle('flipped');
  sfx.flip();
}

// できた(right) / もういちど(left)
function commitFlash(good, animatedEl = null) {
  if (!flash || flash.queue.length === 0) return;
  const card = flash.queue.shift();
  recordFact(card.key, good);
  addActivity(1);
  store.data.totals.cards++;
  store.save();

  if (good) {
    flash.done++;
    sfx.good();
  } else {
    flash.missed.add(card.key);
    flash.queue.push(card); // カードを山の下にもどす
    sfx.again();
  }

  updateFlashProgress();

  if (flash.done >= flash.total || flash.queue.length === 0) {
    finishFlash();
    return;
  }
  renderFlashStack(true);
}

function flyOut(dir) {
  const el = flashCurrentEl();
  if (!el || el.dataset.flying) return;
  el.dataset.flying = '1';
  el.classList.add('fly-out');
  el.style.transform = `translate(${dir * 120}vw, -6vh) rotate(${dir * 28}deg)`;
  setTimeout(() => commitFlash(dir > 0), 260);
}

function finishFlash() {
  const sec = Math.round((performance.now() - flash.t0) / 1000);
  const missed = [...flash.missed];
  showResult({
    icon: missed.length === 0 ? 'trophy' : 'star',
    tone: missed.length === 0 ? '' : 'tone-green',
    title: missed.length === 0 ? 'ぜんぶ できた! すごい!' : 'さいごまで がんばったね!',
    stats: [
      { num: flash.total, label: 'できたカード' },
      { num: fmtTime(sec), label: 'かかったじかん' },
      { num: missed.length, label: 'もういちどにした' },
    ],
    wrongKeys: missed,
    celebrate: true,
    retry: () => {
      const s = store.data.settings;
      startFlash(buildDeck(s.stages, s.order), { face: s.face, kana: s.kana });
    },
  });
  flash = null;
}

// --- スワイプ操作 ---
function attachSwipe(el) {
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, t0 = 0;

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.kspeak')) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    dx = 0; dy = 0;
    t0 = performance.now();
    el.setPointerCapture(e.pointerId);
    el.classList.remove('snap-back');
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    el.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx * 0.055}deg)`;
    $('#label-again').classList.toggle('show', dx < -40);
    $('#label-good').classList.toggle('show', dx > 40);
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    $('#label-again').classList.remove('show');
    $('#label-good').classList.remove('show');

    const dist = Math.hypot(dx, dy);
    const dt = performance.now() - t0;

    if (dist < 10 && dt < 500) {
      // タップ → めくる
      el.style.transform = '';
      flipCurrent();
      return;
    }
    if (dx > 90) { flyOut(1); return; }
    if (dx < -90) { flyOut(-1); return; }
    // もとにもどす
    el.classList.add('snap-back');
    el.style.transform = '';
  };

  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}

$('#btn-flip').addEventListener('click', flipCurrent);
$('#btn-good').addEventListener('click', () => flyOut(1));
$('#btn-again').addEventListener('click', () => flyOut(-1));
$('#btn-sound-flash').addEventListener('click', () => {
  const on = !isSoundEnabled();
  setSoundEnabled(on);
  store.data.settings.sound = on;
  store.save();
  $('#btn-sound-flash').innerHTML = icon(on ? 'sound' : 'sound-off');
  toast(on ? 'おとを オンにしたよ' : 'おとを オフにしたよ');
});

// ==========================================================
// クイズ
// ==========================================================
let quiz = null;

function startQuiz(questions, meta = {}) {
  quiz = {
    qs: questions,
    i: 0,
    input: '',
    correct: 0,
    wrong: [],
    t0: performance.now(),
    waiting: false,
    meta,
  };
  show('quiz');
  $('#btn-next-q').hidden = true;
  $('#keypad').style.visibility = 'visible';
  quiz.timer = setInterval(() => {
    if (!quiz) return;
    $('#quiz-timer').textContent = fmtTime(Math.floor((performance.now() - quiz.t0) / 1000));
  }, 250);
  renderQuiz();
}

function stopQuizTimer() {
  if (quiz?.timer) clearInterval(quiz.timer);
}

function renderQuiz() {
  const q = quiz.qs[quiz.i];
  $('#quiz-progress-text').textContent = `もんだい ${quiz.i + 1} / ${quiz.qs.length}`;
  $('#quiz-progress-fill').style.width = `${(quiz.i / quiz.qs.length) * 100}%`;
  $('#quiz-problem').textContent = `${q.a} × ${q.b} = ?`;
  const box = $('#quiz-answer-box');
  box.textContent = quiz.input || ' ';
  box.className = 'quiz-answer-box';
  $('#quiz-feedback').innerHTML = '';
}

function quizKey(k) {
  if (!quiz || quiz.waiting) return;
  if (k === 'del') {
    quiz.input = quiz.input.slice(0, -1);
  } else if (k === 'ok') {
    checkQuizAnswer();
    return;
  } else if (quiz.input.length < 2) {
    quiz.input += k;
    sfx.tap();
  }
  const box = $('#quiz-answer-box');
  box.textContent = quiz.input || ' ';
}

function checkQuizAnswer() {
  if (!quiz.input) return;
  const q = quiz.qs[quiz.i];
  const ok = Number(quiz.input) === q.ans;
  recordFact(q.key, ok);
  addActivity(1);
  store.data.totals.quiz++;
  store.save();

  const box = $('#quiz-answer-box');
  quiz.waiting = true;

  if (ok) {
    quiz.correct++;
    box.classList.add('correct');
    $('#quiz-feedback').innerHTML = `<span class="fb-ok">${icon('circle')} せいかい!</span>`;
    sfx.correct();
    setTimeout(nextQuizQuestion, 700);
  } else {
    quiz.wrong.push(q.key);
    box.classList.add('wrong');
    $('#quiz-feedback').innerHTML =
      `<span class="fb-ng">こたえは <b>${q.ans}</b> 「${q.yomi}」</span>`;
    sfx.wrong();
    speak(q.yomi.replace(' ', '、'));
    $('#keypad').style.visibility = 'hidden';
    $('#btn-next-q').hidden = false;
  }
}

function nextQuizQuestion() {
  if (!quiz) return;
  quiz.i++;
  quiz.input = '';
  quiz.waiting = false;
  $('#btn-next-q').hidden = true;
  $('#keypad').style.visibility = 'visible';
  if (quiz.i >= quiz.qs.length) {
    finishQuiz();
    return;
  }
  renderQuiz();
}

function finishQuiz() {
  stopQuizTimer();
  const sec = Math.round((performance.now() - quiz.t0) / 1000);
  const total = quiz.qs.length;
  const perfect = quiz.correct === total;

  // ベスト記録の更新
  const s = store.data.settings;
  const bestKey = `quiz:${s.stages.join(',')}:${total}`;
  const prev = store.data.best[bestKey];
  let newRecord = false;
  if (perfect && (!prev || sec < prev.time)) {
    store.data.best[bestKey] = { time: sec };
    newRecord = !!prev;
  }
  if (perfect) store.data.totals.perfect++;
  store.save();

  const wrongKeys = [...new Set(quiz.wrong)];
  const qs = quiz.qs;
  showResult({
    icon: perfect ? 'trophy' : quiz.correct >= total * 0.7 ? 'star' : 'target',
    tone: perfect ? '' : quiz.correct >= total * 0.7 ? 'tone-green' : 'tone-sky',
    title: perfect
      ? (newRecord ? 'パーフェクト! しんきろく!' : 'パーフェクト! すごい!')
      : quiz.correct >= total * 0.7 ? 'よくできました!' : 'つぎは もっとできるよ!',
    stats: [
      { num: `${quiz.correct}/${total}`, label: 'せいかい' },
      { num: fmtTime(sec), label: 'かかったじかん' },
      ...(store.data.best[bestKey] ? [{ num: fmtTime(store.data.best[bestKey].time), label: 'ベストタイム' }] : []),
    ],
    wrongKeys,
    celebrate: quiz.correct >= total * 0.7,
    retry: () => startQuiz(shuffle([...qs])),
  });
  quiz = null;
}

$('#keypad').addEventListener('click', (e) => {
  const key = e.target.closest('.key');
  if (key) quizKey(key.dataset.key);
});
$('#btn-next-q').addEventListener('click', nextQuizQuestion);

// ==========================================================
// ふたりでもんだい(交代で答える対戦モード)
// ==========================================================
let pair = null;

function startPair(deck) {
  pair = {
    deck,
    i: 0,
    scores: [0, 0],
    turn: 0, // 0 = プレイヤー1, 1 = プレイヤー2
    flipped: false,
  };
  show('pair');
  renderPair();
}

function renderPair() {
  const card = pair.deck[pair.i];
  const remain = pair.deck.length - pair.i;
  $('#pair-pts-1').textContent = pair.scores[0];
  $('#pair-pts-2').textContent = pair.scores[1];
  $('#pair-score-1').classList.toggle('turn', pair.turn === 0);
  $('#pair-score-2').classList.toggle('turn', pair.turn === 1);
  $('#pair-turn').innerHTML =
    `<span class="pp-dot pp-dot-${pair.turn + 1}"></span> プレイヤー${pair.turn + 1}の ばん! (のこり${remain}まい)`;
  $('#pair-hint-text').textContent = 'こえに だして こたえてから、カードをタップ!';
  $('#pair-judge').hidden = true;
  pair.flipped = false;

  const stack = $('#pair-card-stack');
  stack.innerHTML = '';
  const el = cardEl(card, { face: 'front', kana: true });
  el.classList.add('current', 'deal-in');
  el.addEventListener('click', (e) => {
    if (e.target.closest('.kspeak')) return;
    if (pair.flipped) return;
    pair.flipped = true;
    el.classList.add('flipped');
    sfx.flip();
    $('#pair-judge').hidden = false;
    $('#pair-hint-text').textContent = 'こたえは あっていたかな?';
  });
  stack.appendChild(el);
}

function judgePair(ok) {
  if (!pair || !pair.flipped) return;
  if (ok) {
    pair.scores[pair.turn]++;
    sfx.correct();
  } else {
    sfx.wrong();
  }
  addActivity(1);
  store.data.totals.pair++;
  store.save();

  pair.i++;
  pair.turn = 1 - pair.turn;
  if (pair.i >= pair.deck.length) {
    finishPair();
    return;
  }
  renderPair();
}

function finishPair() {
  const [p1, p2] = pair.scores;
  const winner = p1 === p2 ? null : p1 > p2 ? 'プレイヤー1' : 'プレイヤー2';
  const deck = pair.deck;
  showResult({
    icon: winner ? 'crown' : 'users',
    tone: winner ? '' : 'tone-sky',
    title: winner ? `${winner}の かち!` : 'ひきわけ! いいしょうぶ!',
    stats: [
      { num: p1, label: 'プレイヤー1' },
      { num: p2, label: 'プレイヤー2' },
    ],
    wrongKeys: [],
    celebrate: true,
    retry: () => startPair(shuffle([...deck])),
  });
  pair = null;
}

$('#btn-judge-ok').addEventListener('click', () => judgePair(true));
$('#btn-judge-ng').addEventListener('click', () => judgePair(false));

// ==========================================================
// 結果画面
// ==========================================================
let lastRetry = null;

function showResult({ icon: iconName, tone = '', title, stats, wrongKeys, celebrate, retry }) {
  const iconBox = $('#result-icon');
  iconBox.className = `result-icon ${tone}`;
  iconBox.innerHTML = icon(iconName);
  $('#result-title').textContent = title;
  $('#result-stats').innerHTML = stats.map((s) =>
    `<div class="rs-item"><span class="rs-num">${s.num}</span><span class="rs-label">${s.label}</span></div>`
  ).join('');

  const wrongBox = $('#result-wrong');
  if (wrongKeys.length > 0) {
    wrongBox.hidden = false;
    $('#rw-list').innerHTML = wrongKeys.map((k) => {
      const [a, b] = k.split('-').map(Number);
      return `<span class="rw-item">${a}×${b}=${a * b} <small>${YOMI[a][b - 1]}</small></span>`;
    }).join('');
  } else {
    wrongBox.hidden = true;
  }

  $('#btn-weak-practice').hidden = weakKeys().length === 0;
  lastRetry = retry;
  show('result');
  if (celebrate) {
    sfx.fanfare();
    launchConfetti();
  }
}

$('#btn-retry').addEventListener('click', () => { if (lastRetry) lastRetry(); });
$('#btn-result-home').addEventListener('click', () => show('home'));
$('#btn-weak-practice').addEventListener('click', startWeakPractice);

function startWeakPractice() {
  const keys = weakKeys();
  if (keys.length === 0) { toast('にがてカードは ないよ! すごい!'); return; }
  const deck = shuffle(keys.map((k) => {
    const [a, b] = k.split('-').map(Number);
    return makeCard(a, b);
  }));
  startFlash(deck, { face: 'front', kana: true }, { weakPractice: true });
}

// ==========================================================
// きろく画面
// ==========================================================
function renderRecords() {
  $('#rec-streak').textContent = calcStreak();
  $('#rec-total').textContent = store.data.totals.cards + store.data.totals.quiz + store.data.totals.pair;
  $('#rec-master').innerHTML = `${masterCount()}<small>/81</small>`;

  renderCalendar();
  renderHeatmap();
  renderBadges();

  const weak = weakKeys();
  $('#btn-weak2').hidden = weak.length === 0;
}

function renderCalendar() {
  const cal = $('#calendar');
  cal.innerHTML = '';
  // 直近4週間(今週の土曜まで)を表示
  const now = new Date();
  const endOffset = 6 - now.getDay(); // 今週の土曜日まで
  for (let i = 27 - endOffset; i >= -endOffset; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const p = (n) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const cell = document.createElement('div');
    const isFuture = i < 0;
    const stamped = !isFuture && store.data.days[key];
    cell.className = 'cal-day' + (stamped ? ' stamped' : '') + (i === 0 ? ' today' : '') + (isFuture ? ' empty' : '');
    cell.innerHTML = `<span class="cal-num">${d.getDate()}</span>${stamped ? icon('star', 'icon-fill') : ''}`;
    cal.appendChild(cell);
  }
}

function renderHeatmap() {
  let html = '<div></div>' + STAGES.map((b) => `<div class="hm-head">×${b}</div>`).join('');
  STAGES.forEach((a) => {
    html += `<div class="hm-side">${a}の<br>だん</div>`;
    STAGES.forEach((b) => {
      const lv = factLevel(`${a}-${b}`);
      html += `<button class="hm-cell hm-${lv}" data-fact="${a}-${b}">${lv === 3 ? icon('star', 'icon-fill') : a * b}</button>`;
    });
  });
  $('#heatmap').innerHTML = html;
}

$('#heatmap').addEventListener('click', (e) => {
  const cell = e.target.closest('.hm-cell');
  if (!cell) return;
  const [a, b] = cell.dataset.fact.split('-').map(Number);
  const f = store.data.facts[`${a}-${b}`];
  const stat = f ? `せいかい${f.c}回・まちがい${f.w}回` : 'まだ れんしゅうしていないよ';
  $('#heat-detail').textContent = `${a}×${b}=${a * b} 「${YOMI[a][b - 1]}」 ${stat}`;
  speak(YOMI[a][b - 1].replace(' ', '、'));
});

const BADGES = [
  { id: 'first', icon: 'leaf', name: 'はじめのいっぽ', test: (t) => t.cards + t.quiz + t.pair > 0 },
  { id: 'streak3', icon: 'flame', name: '3日れんぞく', test: () => calcStreak() >= 3 },
  { id: 'streak7', icon: 'flame', name: '7日れんぞく', test: () => calcStreak() >= 7 },
  { id: 'streak14', icon: 'medal', name: '14日れんぞく', test: () => calcStreak() >= 14 },
  { id: 'streak30', icon: 'crown', name: '30日れんぞく', test: () => calcStreak() >= 30 },
  { id: 'cards100', icon: 'cards', name: 'カード100まい', test: (t) => t.cards >= 100 },
  { id: 'cards500', icon: 'cards', name: 'カード500まい', test: (t) => t.cards >= 500 },
  { id: 'quiz100', icon: 'pencil', name: 'クイズ100もん', test: (t) => t.quiz >= 100 },
  { id: 'perfect', icon: 'circle', name: 'パーフェクト', test: (t) => t.perfect > 0 },
  { id: 'master1', icon: 'star', name: 'はじめてマスター', test: () => masterCount() >= 1 },
  {
    id: 'stagemaster', icon: 'trophy', name: 'だんマスター',
    test: () => STAGES.some((a) => STAGES.every((b) => factLevel(`${a}-${b}`) === 3)),
  },
  { id: 'master81', icon: 'crown', name: '九九マスター', test: () => masterCount() === 81 },
];

function renderBadges() {
  const t = store.data.totals;
  $('#badges').innerHTML = BADGES.map((b) => {
    const got = b.test(t);
    return `<div class="badge${got ? '' : ' locked'}">
      <span class="badge-icon">${icon(b.icon)}</span>
      <span class="badge-name">${b.name}</span>
    </div>`;
  }).join('');
}

$('#btn-weak2').addEventListener('click', startWeakPractice);

$('#btn-reset-data').addEventListener('click', () => {
  if (confirm('きろくを ぜんぶ けしますか?(もとに もどせません)')) {
    store.reset();
    setSoundEnabled(store.data.settings.sound);
    renderRecords();
    toast('きろくを リセットしたよ');
  }
});

// ==========================================================
// 紙ふぶき(お祝い演出)
// ==========================================================
function launchConfetti() {
  const canvas = $('#confetti');
  const ctx2d = canvas.getContext('2d');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const colors = ['#f59e0b', '#22c55e', '#0ea5e9', '#f43f5e', '#a855f7', '#fbbf24'];
  const parts = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    w: 7 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    vy: 2.2 + Math.random() * 3,
    vx: -1.2 + Math.random() * 2.4,
    rot: Math.random() * Math.PI,
    vr: -0.12 + Math.random() * 0.24,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx2d.save();
      ctx2d.translate(p.x, p.y);
      ctx2d.rotate(p.rot);
      ctx2d.fillStyle = p.color;
      ctx2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx2d.restore();
    });
    if (t - t0 < 3000) requestAnimationFrame(frame);
    else ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  })(t0);
}

// ==========================================================
// ナビゲーション・キーボード操作
// ==========================================================
$$('.mode-card').forEach((b) => {
  b.addEventListener('click', () => {
    sfx.tap();
    const mode = b.dataset.mode;
    if (mode === 'records') show('records');
    else openSetup(mode);
  });
});

$$('.btn-back').forEach((b) => b.addEventListener('click', () => show(b.dataset.back)));
$('#btn-brand').addEventListener('click', () => quitToHome());
$('#btn-weak').addEventListener('click', startWeakPractice);

$$('[data-quit]').forEach((b) => b.addEventListener('click', quitToHome));

function quitToHome() {
  stopQuizTimer();
  flash = null; quiz = null; pair = null;
  show('home');
}

document.addEventListener('keydown', (e) => {
  if (activeScreen === 'flash' && flash) {
    if (e.key === 'ArrowRight') flyOut(1);
    if (e.key === 'ArrowLeft') flyOut(-1);
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') { e.preventDefault(); flipCurrent(); }
  }
  if (activeScreen === 'quiz' && quiz) {
    if (/^[0-9]$/.test(e.key)) quizKey(e.key);
    if (e.key === 'Backspace') quizKey('del');
    if (e.key === 'Enter') {
      if (!$('#btn-next-q').hidden) nextQuizQuestion();
      else quizKey('ok');
    }
  }
});

// ==========================================================
// PWA: Service Worker 登録 & インストール導線
// ==========================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* オフライン非対応環境 */ });
  });
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  $('#btn-install').hidden = false;
});
$('#btn-install').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  $('#btn-install').hidden = true;
});
window.addEventListener('appinstalled', () => {
  $('#btn-install').hidden = true;
  toast('インストールできたよ! ホームがめんから ひらけるよ');
});

// ==========================================================
// ユーティリティ・初期化
// ==========================================================
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

$('#btn-sound-flash').innerHTML = icon(isSoundEnabled() ? 'sound' : 'sound-off');
renderHome();
