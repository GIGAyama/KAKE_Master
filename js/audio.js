// ==========================================================
// サウンド(WebAudio効果音 + 音声合成による読み上げ)
// ==========================================================
let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = on; }
export function isSoundEnabled() { return enabled; }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = 'sine', vol = 0.18) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  flip()    { if (enabled) tone(880, 0, 0.08, 'triangle', 0.1); },
  good()    { if (!enabled) return; tone(660, 0, 0.12, 'sine'); tone(880, 0.09, 0.18, 'sine'); },
  again()   { if (enabled) tone(330, 0, 0.15, 'sine', 0.12); },
  correct() { if (!enabled) return; tone(659, 0, 0.1); tone(784, 0.08, 0.1); tone(1047, 0.16, 0.25); },
  wrong()   { if (!enabled) return; tone(220, 0, 0.2, 'square', 0.08); tone(196, 0.15, 0.3, 'square', 0.08); },
  fanfare() {
    if (!enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3, 'triangle', 0.15));
    tone(1319, 0.55, 0.5, 'triangle', 0.15);
  },
  tap() { if (enabled) tone(520, 0, 0.05, 'triangle', 0.08); },
};

// 九九の読み上げ(日本語音声合成)
let jaVoice;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  if (jaVoice) return jaVoice;
  jaVoice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ja')) || null;
  return jaVoice;
}
if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => { jaVoice = null; pickVoice(); });
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.85;
    u.pitch = 1.1;
    const v = pickVoice();
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* 非対応端末では無視 */ }
}
