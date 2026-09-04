/**
 * Синтезированные звуки через Web Audio API — без внешних файлов.
 * Контекст создаётся лениво при первом пользовательском жесте.
 */

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

/** короткая вибрация (мобильные устройства) */
export function buzz(ms: number) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch {
    /* noop */
  }
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

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {},
) {
  const c = ac();
  if (!c || !enabled) return;
  const { type = 'sine', gain = 0.12, delay = 0, slideTo } = opts;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  }
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(dur: number, from: number, to: number, gainVal: number) {
  const c = ac();
  if (!c || !enabled) return;
  const buffer = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
  const g = c.createGain();
  g.gain.value = gainVal;
  src.connect(filter).connect(g).connect(c.destination);
  src.start();
}

/** тап — плитка отправлена в лоток */
export function playSelect() {
  tone(660, 0.08, { type: 'triangle', gain: 0.1 });
}

/** занятая плитка — глухой стук */
export function playError() {
  tone(150, 0.12, { type: 'square', gain: 0.05, slideTo: 90 });
}

/** отмена — плитка вернулась на доску */
export function playUndo() {
  tone(440, 0.1, { type: 'triangle', gain: 0.08, slideTo: 330 });
}

/** поднятие плитки пальцем */
export function playPeek() {
  tone(500, 0.06, { type: 'sine', gain: 0.06 });
}

/** в лотке третья плитка — мягкое предупреждение */
export function playWarn() {
  tone(330, 0.09, { type: 'square', gain: 0.045 });
  tone(330, 0.09, { type: 'square', gain: 0.045, delay: 0.13 });
}

/** пара взорвалась в лотке — перкуссия + хрустальный перезвон */
export function playBoom() {
  noiseBurst(0.16, 900, 2600, 0.28);
  tone(1046.5, 0.16, { type: 'sine', gain: 0.13 });
  tone(1568, 0.2, { type: 'sine', gain: 0.09, delay: 0.05 });
}

/** подсказка — мягкий переливчатый звон */
export function playHint() {
  tone(880, 0.12, { type: 'sine', gain: 0.08 });
  tone(1174.7, 0.14, { type: 'sine', gain: 0.08, delay: 0.09 });
  tone(1568, 0.18, { type: 'sine', gain: 0.06, delay: 0.18 });
}

/** перемешивание — шорох + восходящая россыпь */
export function playShuffle() {
  noiseBurst(0.3, 500, 1600, 0.12);
  [392, 494, 587, 740].forEach((f, i) => {
    tone(f, 0.09, { type: 'triangle', gain: 0.055, delay: 0.05 + i * 0.06 });
  });
}

/** победа — восходящая фанфара */
export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => {
    tone(f, 0.22, { type: 'sine', gain: 0.12, delay: i * 0.11 });
  });
  tone(1567.98, 0.5, { type: 'sine', gain: 0.1, delay: notes.length * 0.11 });
}

/** проигрыш — нисходящий низкий аккорд */
export function playLose() {
  tone(240, 0.3, { type: 'sawtooth', gain: 0.09, slideTo: 120 });
  tone(160, 0.42, { type: 'triangle', gain: 0.1, delay: 0.12, slideTo: 80 });
}
