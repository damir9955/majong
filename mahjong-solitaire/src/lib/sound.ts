/**
 * Синтезированные звуки через Web Audio API — без внешних файлов.
 * Контекст создаётся лениво при первом пользовательском жесте.
 *
 * Все звуки МЯГКИЕ и расслабляющие: только синусоиды и треугольные
 * волны, медленные атаки/спады, общий тёплый низкий фильтр (lowpass)
 * и пониженная громкость. Никаких резких «square/sawtooth».
 */

let ctx: AudioContext | null = null;
let enabled = true;

/** общая громкость — тише прежнего, звук фоновый, не давящий */
const VOL = 0.6;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

/** короткая мягкая вибрация (мобильные устройства) */
export function buzz(ms: number) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch {
    /* noop */
  }
}

/** тёплый мастер-канал: общий гейн + lowpass, гасящий резкие верха */
let master: GainNode | null = null;
function warmMaster(c: AudioContext): GainNode {
  if (!master) {
    master = c.createGain();
    master.gain.value = 1;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    lp.Q.value = 0.4;
    master.connect(lp).connect(c.destination);
  }
  return master;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
  /** мягкая атака, мс (по умолчанию 18 — «дыхание», не щелчок) */
  attack?: number;
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  const c = ac();
  if (!c || !enabled) return;
  const { type = 'sine', gain = 0.1, delay = 0, slideTo, attack = 0.018 } = opts;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  }
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * VOL, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(warmMaster(c));
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** мягкий «дыхательный» шум (lowpass, без резкой атаки) */
function softNoise(dur: number, from: number, to: number, gainVal: number) {
  const c = ac();
  if (!c || !enabled) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  // плавное нарастание и спад — «вздох», а не щелчок
  for (let i = 0; i < data.length; i++) {
    const ph = i / data.length;
    data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * ph);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
  const g = c.createGain();
  g.gain.value = gainVal * VOL;
  src.connect(filter).connect(g).connect(warmMaster(c));
  src.start();
}

/** тап — плитка отправлена в лоток: тёплый короткий «маримба» */
export function playSelect() {
  tone(523.25, 0.16, { type: 'sine', gain: 0.07 });
  tone(1046.5, 0.1, { type: 'sine', gain: 0.025, delay: 0.01 });
}

/** занятая плитка — мягкий глухой «деревянный» отклик, без резкости */
export function playError() {
  tone(196, 0.16, { type: 'sine', gain: 0.055, slideTo: 147, attack: 0.03 });
}

/** отмена — плитка вернулась на доску: нисходящий тёплый слайд */
export function playUndo() {
  tone(440, 0.14, { type: 'sine', gain: 0.045, slideTo: 349 });
}

/** поднятие плитки пальцем — лёгкое «дыхание» */
export function playPeek() {
  tone(392, 0.09, { type: 'sine', gain: 0.035 });
}

/** переворот рубашки — мягкий шорох + тёплая нота */
export function playReveal() {
  softNoise(0.22, 600, 1400, 0.035);
  tone(587.33, 0.2, { type: 'triangle', gain: 0.04, delay: 0.05 });
}

/** в лотке третья плитка — деликатный двойной звоночек */
export function playWarn() {
  tone(659.25, 0.18, { type: 'sine', gain: 0.045 });
  tone(523.25, 0.22, { type: 'sine', gain: 0.04, delay: 0.14 });
}

/** пара взорвалась в лотке — хрустальный тёплый перезвон */
export function playBoom() {
  softNoise(0.18, 700, 1800, 0.05);
  tone(783.99, 0.35, { type: 'sine', gain: 0.07, attack: 0.008 });
  tone(1046.5, 0.4, { type: 'sine', gain: 0.05, delay: 0.04, attack: 0.008 });
  tone(1568, 0.45, { type: 'sine', gain: 0.03, delay: 0.09 });
}

/** подсказка — мягкий переливчатый звон */
export function playHint() {
  tone(880, 0.16, { type: 'sine', gain: 0.05 });
  tone(1174.7, 0.18, { type: 'sine', gain: 0.045, delay: 0.1 });
  tone(1568, 0.22, { type: 'sine', gain: 0.03, delay: 0.2 });
}

/** перемешивание — шорох листвы + восходящая мягкая россыпь */
export function playShuffle() {
  softNoise(0.32, 400, 1200, 0.06);
  [392, 494, 587, 740].forEach((f, i) => {
    tone(f, 0.12, { type: 'triangle', gain: 0.035, delay: 0.06 + i * 0.07 });
  });
}

/** победа — восходящая светлая пентатоника */
export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => {
    tone(f, 0.3, { type: 'sine', gain: 0.065, delay: i * 0.12 });
  });
  tone(1567.98, 0.7, { type: 'sine', gain: 0.05, delay: notes.length * 0.12 });
}

/** проигрыш — спокойное мягкое нисхождение, без тревоги */
export function playLose() {
  tone(330, 0.4, { type: 'sine', gain: 0.05, slideTo: 220, attack: 0.03 });
  tone(220, 0.55, { type: 'sine', gain: 0.045, delay: 0.16, slideTo: 165 });
}

/** появление соперника (VS) — мягкий тёмный гонг */
export function playVersus() {
  tone(392, 0.24, { type: 'sine', gain: 0.05, attack: 0.02 });
  tone(523.25, 0.26, { type: 'sine', gain: 0.045, delay: 0.16, attack: 0.02 });
  tone(311, 0.5, { type: 'sine', gain: 0.05, delay: 0.32, slideTo: 207 });
}

/** отсчёт 3-2-1 (final — «старт») */
export function playCount(final = false) {
  if (final) {
    tone(880, 0.2, { type: 'triangle', gain: 0.05 });
    tone(1174.7, 0.36, { type: 'sine', gain: 0.05, delay: 0.1 });
  } else {
    tone(440, 0.15, { type: 'triangle', gain: 0.04 });
  }
}

/** начисление очков за пару — тон растёт с комбо */
export function playScore(combo: number) {
  tone(587.33 + Math.min(combo, 6) * 60, 0.14, { type: 'triangle', gain: 0.04 });
}

/** тик таймера (последние секунды) */
export function playTick() {
  tone(1046.5, 0.07, { type: 'sine', gain: 0.03 });
}

/** челлендж «Divine Move» начался */
export function playDivineStart() {
  tone(1046.5, 0.14, { type: 'sine', gain: 0.055 });
  tone(1318.5, 0.14, { type: 'sine', gain: 0.05, delay: 0.1 });
  tone(1568, 0.2, { type: 'sine', gain: 0.045, delay: 0.2 });
}

/** челлендж выполнен — божественный ход */
export function playDivineWin() {
  [784, 988, 1174.7, 1568, 1976].forEach((f, i) => {
    tone(f, 0.2, { type: 'sine', gain: 0.055, delay: i * 0.09 });
  });
}

/** челлендж упущен — мягкий «туманный» спад */
export function playDivineMiss() {
  tone(392, 0.3, { type: 'sine', gain: 0.04, slideTo: 294 });
}

/** трофеи — короткий тёплый звон монет */
export function playTrophy() {
  tone(1568, 0.12, { type: 'sine', gain: 0.05 });
  tone(2093, 0.18, { type: 'sine', gain: 0.04, delay: 0.08 });
}
