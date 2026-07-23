import React, { useState, useEffect, useMemo } from 'react';
import { 
  RotateCcw, 
  Shuffle, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Users, 
  Settings, 
  Sparkles, 
  Eye, 
  EyeOff, 
  BookOpen,
  Volume2
} from 'lucide-react';

// ==========================================
// 九九データ定義（九九の唱え方・ルビ付き）
// ==========================================
const KUKU_DATA = {
  1: [
    { num: 1, ans: 1, kana: 'いんいちが一' },
    { num: 2, ans: 2, kana: 'いんにが二' },
    { num: 3, ans: 3, kana: 'いんさんが三' },
    { num: 4, ans: 4, kana: 'いんしが四' },
    { num: 5, ans: 5, kana: 'いんごが五' },
    { num: 6, ans: 6, kana: 'いんろくが六' },
    { num: 7, ans: 7, kana: 'いんしちが七' },
    { num: 8, ans: 8, kana: 'いんはちが八' },
    { num: 9, ans: 9, kana: 'いんくが九' },
  ],
  2: [
    { num: 1, ans: 2, kana: 'にいちがいち…に' }, // 標準唱え方: にいちが2
    { num: 1, ans: 2, kana: 'にいんが二' },
    { num: 2, ans: 4, kana: 'ににが四' },
    { num: 3, ans: 6, kana: 'にさんが六' },
    { num: 4, ans: 8, kana: 'にしが八' },
    { num: 5, ans: 10, kana: 'にご十' },
    { num: 6, ans: 12, kana: 'にろく十二' },
    { num: 7, ans: 14, kana: 'にしち十四' },
    { num: 8, ans: 16, kana: 'にはち十六' },
    { num: 9, ans: 18, kana: 'にく十八' },
  ],
  3: [
    { num: 1, ans: 3, kana: 'さんいちが三' },
    { num: 2, ans: 6, kana: 'さんにが六' },
    { num: 3, ans: 9, kana: 'さざんが九' },
    { num: 4, ans: 12, kana: 'さんし十二' },
    { num: 5, ans: 15, kana: 'さんご十五' },
    { num: 6, ans: 18, kana: 'さぶろく十八' },
    { num: 7, ans: 21, kana: 'さんしち二十一' },
    { num: 8, ans: 24, kana: 'さんぱ二十四' },
    { num: 9, ans: 27, kana: 'さんく二十七' },
  ],
  4: [
    { num: 1, ans: 4, kana: 'しいちが四' },
    { num: 2, ans: 8, kana: 'しにが八' },
    { num: 3, ans: 12, kana: 'しさん十二' },
    { num: 4, ans: 16, kana: 'しし十六' },
    { num: 5, ans: 20, kana: 'しご二十' },
    { num: 6, ans: 24, kana: 'しろく二十四' },
    { num: 7, ans: 28, kana: 'しち二十八' },
    { num: 8, ans: 32, kana: 'しは三十二' },
    { num: 9, ans: 36, kana: 'しく三十六' },
  ],
  5: [
    { num: 1, ans: 5, kana: 'ごいちが五' },
    { num: 2, ans: 10, kana: 'ごに十' },
    { num: 3, ans: 15, kana: 'ごさん十五' },
    { num: 4, ans: 20, kana: 'ごし二十' },
    { num: 5, ans: 25, kana: 'ごご二十五' },
    { num: 6, ans: 30, kana: 'ごろく三十' },
    { num: 7, ans: 35, kana: 'ごしち三十五' },
    { num: 8, ans: 40, kana: 'ごは四十' },
    { num: 9, ans: 45, kana: 'ごく四十 promoter' },
  ],
  6: [
    { num: 1, ans: 6, kana: 'ろくいちが六' },
    { num: 2, ans: 12, kana: 'ろくに十二' },
    { num: 3, ans: 18, kana: 'ろくさん十八' },
    { num: 4, ans: 24, kana: 'ろくし二十四' },
    { num: 5, ans: 30, kana: 'ろくご三十' },
    { num: 6, ans: 36, kana: 'ろくろく三十六' },
    { num: 7, ans: 42, kana: 'ろくしち四十二' },
    { num: 8, ans: 48, kana: 'ろくは四十八' },
    { num: 9, ans: 54, kana: 'ろっく五十四' },
  ],
  7: [
    { num: 1, ans: 7, kana: 'しちいちが七' },
    { num: 2, ans: 14, kana: 'しちに十四' },
    { num: 3, ans: 21, kana: 'しちさん二十一' },
    { num: 4, ans: 28, kana: 'しちし二十八' },
    { num: 5, ans: 35, kana: 'しちご三十五' },
    { num: 6, ans: 42, kana: 'しちろく四十二' },
    { num: 7, ans: 49, kana: 'しちしち四十九' },
    { num: 8, ans: 56, kana: 'しちは五十六' },
    { num: 9, ans: 63, kana: 'しちく六十三' },
  ],
  8: [
    { num: 1, ans: 8, kana: 'はちいちが八' },
    { num: 2, ans: 16, kana: 'はちに十六' },
    { num: 3, ans: 24, kana: 'はちさん二十四' },
    { num: 4, ans: 32, kana: 'はちし三十二' },
    { num: 5, ans: 40, kana: 'はちご四十' },
    { num: 6, ans: 48, kana: 'はちろく四十八' },
    { num: 7, ans: 56, kana: 'はちしち五十六' },
    { num: 8, ans: 64, kana: 'はっぱ六十四' },
    { num: 9, ans: 72, kana: 'はっく七十二' },
  ],
  9: [
    { num: 1, ans: 9, kana: 'くいちが九' },
    { num: 2, ans: 18, kana: 'くに十八' },
    { num: 3, ans: 27, kana: 'くさん二十七' },
    { num: 4, ans: 36, kana: 'くし三十六' },
    { num: 5, ans: 45, kana: 'くご四十' },
    { num: 6, ans: 54, kana: 'くろく五十四' },
    { num: 7, ans: 63, kana: 'くしち六十三' },
    { num: 8, ans: 72, kana: 'くは七十二' },
    { num: 9, ans: 81, kana: 'くく八十一' },
  ]
};

// 修正用：2の段「にいんが二」を標準表記に整えたデータ（教科書準拠）
KUKU_DATA[2][0] = { num: 1, ans: 2, kana: 'にいんが二' };

// ==========================================
// カスタムフック: カードDeckの管理ロジック
// ==========================================
function useKukuDeck() {
  // LocalStorageから設定を読み込み
  const [selectedStages, setSelectedStages] = useState(() => {
    const saved = localStorage.getItem('kuku_selected_stages');
    return saved ? JSON.parse(saved) : [2]; // 初期値は2の段
  });

  const [orderMode, setOrderMode] = useState(() => {
    return localStorage.getItem('kuku_order_mode') || 'asc'; // asc, desc, random
  });

  const [pairMode, setPairMode] = useState(false); // ペア学習モード
  const [showKana, setShowKana] = useState(true);   // ルビ（読み方）表示

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // 設定保存
  useEffect(() => {
    localStorage.setItem('kuku_selected_stages', JSON.stringify(selectedStages));
  }, [selectedStages]);

  useEffect(() => {
    localStorage.setItem('kuku_order_mode', orderMode);
  }, [orderMode]);

  // デッキ（カード一覧）の生成
  const cards = useMemo(() => {
    let list = [];
    selectedStages.forEach((stage) => {
      if (KUKU_DATA[stage]) {
        KUKU_DATA[stage].forEach((item) => {
          list.push({
            stage,
            multiplier: item.num,
            ans: item.ans,
            kana: item.kana,
            id: `${stage}-${item.num}`
          });
        });
      }
    });

    if (orderMode === 'desc') {
      list.reverse();
    } else if (orderMode === 'random') {
      // シャッフル
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }

    return list;
  }, [selectedStages, orderMode]);

  // 段選択の切り替え
  const toggleStage = (stageNum) => {
    setSelectedStages((prev) => {
      if (prev.includes(stageNum)) {
        if (prev.length === 1) return prev; // 最低1つは選択維持
        return prev.filter((s) => s !== stageNum);
      } else {
        return [...prev, stageNum].sort((a, b) => a - b);
      }
    });
    resetDeck();
  };

  // 全選択・解除
  const selectAllStages = () => {
    setSelectedStages([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    resetDeck();
  };

  const resetDeck = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const nextCard = () => {
    if (currentIndex < cards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((prev) => prev + 1), 150);
    }
  };

  const prevCard = () => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((prev) => prev - 1), 150);
    }
  };

  const toggleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  return {
    selectedStages,
    toggleStage,
    selectAllStages,
    orderMode,
    setOrderMode: (mode) => { setOrderMode(mode); resetDeck(); },
    pairMode,
    setPairMode,
    showKana,
    setShowKana,
    cards,
    currentCard: cards[currentIndex] || null,
    currentIndex,
    totalCards: cards.length,
    isFlipped,
    toggleFlip,
    nextCard,
    prevCard,
    resetDeck
  };
}

// ==========================================
// メインアプリケーション
// ==========================================
export default function App() {
  const deck = useKukuDeck();

  // Zen Maru Gothic フォントの動的読み込み
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;700;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  return (
    <div 
      className="min-h-screen bg-amber-50/40 flex flex-col font-sans text-slate-800 antialiased"
      style={{ fontFamily: "'Zen Maru Gothic', sans-serif" }}
    >
      {/* 共通ヘッダー */}
      <Header />

      {/* メインコンテンツ */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        <MainBoard deck={deck} />
      </main>

      {/* 共通フッター */}
      <Footer />
    </div>
  );
}

// ==========================================
// ヘッダーコンポーネント
// ==========================================
function Header() {
  return (
    <nav className="bg-white border-b-4 border-amber-500 px-6 py-2.5 flex justify-between items-center shadow-sm z-10">
      <div className="flex items-center gap-3">
        <div className="bg-amber-500 text-white p-2 rounded-xl shadow-sm flex items-center justify-center">
          <BookOpen className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-wide flex items-center gap-2">
            九九けいさんカード
            <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-300">
              算数アプリ
            </span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-block text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          小学校2年生 算数対応
        </span>
      </div>
    </nav>
  );
}

// ==========================================
// メインボード（設定・カード・コントローラー）
// ==========================================
function MainBoard({ deck }) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      
      {/* 設定・モード切り替えエリア */}
      <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-amber-100 flex flex-col gap-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-base md:text-lg text-slate-700">れんしゅうの設定</h2>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="sm:hidden text-xs text-amber-600 bg-amber-50 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all active:scale-95"
          >
            <Settings className="w-4 h-4" />
            {showSettings ? '設定をかくす' : '設定をかえる'}
          </button>
        </div>

        {/* 設定詳細（画面幅に合わせて表示） */}
        <div className={`flex flex-col gap-4 ${showSettings ? 'block' : 'hidden sm:flex'}`}>
          {/* 段選択ボタン群 */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                練習する「だん」を選んでね（複数えらべます）
              </label>
              <button
                onClick={deck.selectAllStages}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 underline"
              >
                ぜんぶ選ぶ
              </button>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5 md:gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stageNum) => {
                const isSelected = deck.selectedStages.includes(stageNum);
                return (
                  <button
                    key={stageNum}
                    onClick={() => deck.toggleStage(stageNum)}
                    className={`py-2 rounded-xl text-sm font-black transition-all active:scale-95 border-2 ${
                      isSelected
                        ? 'bg-amber-500 border-amber-600 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {stageNum}の段
                  </button>
                );
              })}
            </div>
          </div>

          {/* 順番・モード設定 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {/* カードの順番 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">じゅんばん:</span>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => deck.setOrderMode('asc')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                    deck.orderMode === 'asc'
                      ? 'bg-white text-amber-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  上から (1→9)
                </button>
                <button
                  onClick={() => deck.setOrderMode('desc')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                    deck.orderMode === 'desc'
                      ? 'bg-white text-amber-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  下から (9→1)
                </button>
                <button
                  onClick={() => deck.setOrderMode('random')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1 ${
                    deck.orderMode === 'random'
                      ? 'bg-white text-amber-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Shuffle className="w-3 h-3" />
                  バラバラ
                </button>
              </div>
            </div>

            {/* トグル設定（ペアモード・ルビ表示） */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => deck.setShowKana(!deck.showKana)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                  deck.showKana
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                {deck.showKana ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                唱え方（ふりがな）
              </button>

              <button
                onClick={() => deck.setPairMode(!deck.pairMode)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                  deck.pairMode
                    ? 'bg-indigo-500 border-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                ペア学習モード
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ペア学習モード時のアドバイス表示 */}
      {deck.pairMode && (
        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 flex items-start gap-3 text-indigo-900 shadow-sm">
          <div className="bg-indigo-500 text-white p-1.5 rounded-lg mt-0.5">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-xs md:text-sm font-bold leading-relaxed">
            <p className="text-indigo-950 font-black text-sm mb-1">👫 お友達と問題を出し合おう！</p>
            <ol className="list-decimal list-inside space-y-0.5 text-indigo-800">
              <li>ひとりがカードの「しき」を見て大きな声で唱えます。</li>
              <li>もうひとりがカードをタップして「こたえ」をたしかめます。</li>
              <li>正解したら「つぎへ」を押して交代しましょう！</li>
            </ol>
          </div>
        </div>
      )}

      {/* カードメイン表示領域 */}
      {deck.totalCards > 0 ? (
        <div className="flex flex-col items-center gap-6">
          
          {/* 進捗バー */}
          <div className="w-full flex items-center gap-3 px-2">
            <span className="text-xs font-bold text-slate-500 min-w-[60px]">
              {deck.currentIndex + 1} / {deck.totalCards} まい
            </span>
            <div className="flex-1 bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-amber-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${((deck.currentIndex + 1) / deck.totalCards) * 100}%` }}
              />
            </div>
          </div>

          {/* 3Dカードフリップコンポーネント */}
          <div 
            onClick={deck.toggleFlip}
            className="w-full max-w-md h-72 md:h-80 cursor-pointer perspective-1000 select-none group"
          >
            <div className={`relative w-full h-full duration-500 transform-style-3d transition-transform ${deck.isFlipped ? 'rotate-y-180' : ''}`}>
              
              {/* 【おもて面】（式） */}
              <div className="absolute w-full h-full bg-white rounded-3xl border-4 border-amber-400 shadow-md p-6 flex flex-col justify-between items-center backface-hidden group-hover:border-amber-500 transition-colors">
                <div className="w-full flex justify-between items-center">
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full border border-amber-200">
                    {deck.currentCard.stage}の段
                  </span>
                  <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                    タップして答えをみる 👆
                  </span>
                </div>

                {/* 計算式 */}
                <div className="text-6xl md:text-7xl font-black text-slate-800 tracking-wider my-auto">
                  {deck.currentCard.stage} × {deck.currentCard.multiplier}
                </div>

                <div className="text-xs font-bold text-slate-400">
                  おもて
                </div>
              </div>

              {/* 【うら面】（答え・唱え方） */}
              <div className="absolute w-full h-full bg-amber-500 text-white rounded-3xl border-4 border-amber-600 shadow-md p-6 flex flex-col justify-between items-center backface-hidden rotate-y-180">
                <div className="w-full flex justify-between items-center">
                  <span className="bg-amber-600 text-white text-xs font-bold px-3 py-1 rounded-full border border-amber-400">
                    こたえ
                  </span>
                  <span className="text-xs text-amber-100 font-bold flex items-center gap-1">
                    タップして式にもどる 👆
                  </span>
                </div>

                {/* 答えとふりがな */}
                <div className="flex flex-col items-center justify-center my-auto gap-2">
                  <div className="text-7xl md:text-8xl font-black tracking-wider drop-shadow-sm">
                    {deck.currentCard.ans}
                  </div>
                  {deck.showKana && (
                    <div className="bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-2xl text-lg md:text-xl font-bold text-white tracking-widest border border-white/30 flex items-center gap-2">
                      <Volume2 className="w-5 h-5 text-amber-100" />
                      {deck.currentCard.kana}
                    </div>
                  )}
                </div>

                <div className="text-xs font-bold text-amber-100">
                  うら
                </div>
              </div>

            </div>
          </div>

          {/* コントローラーボタン群 */}
          <div className="flex items-center justify-between w-full max-w-md gap-3 pt-2">
            <button
              onClick={deck.prevCard}
              disabled={deck.currentIndex === 0}
              className={`flex-1 py-3.5 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 border-2 ${
                deck.currentIndex === 0
                  ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
              まえへ
            </button>

            <button
              onClick={deck.toggleFlip}
              className="py-3.5 px-6 rounded-2xl font-black text-amber-800 bg-amber-200 hover:bg-amber-300 b
