'use client';

/**
 * Хранилище игры: два режима.
 *
 *  — «Классика» — спокойная игра без соперника, таймера и очков:
 *    бесконечные уровни, лоток на 4 места, парные взрываются,
 *    4 разные — «Нет места» (поражение).
 *  — «1 на 1» — матчи как в Vita Mahjong: соперник-бот, очки с комбо,
 *    челлендж «Божественный ход», таймер, трофеи и лиги.
 *
 * Лоток и доска общие: тап отправляет плитку в лоток (4 места),
 * парная соединяется и взрывается, 4 разные — поражение.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  generateBoard,
  buildOccupancy,
  isFree,
  freeTiles,
  reshuffleRemaining,
  pickShirts,
  type TileInstance,
} from '@/lib/mahjong/engine';
import { getLayoutForLevel } from '@/lib/mahjong/layouts';
import { getTileDef } from '@/lib/mahjong/tiles';
import { showToast, floatScore } from './fx';
import { makeOpponent, leagueIndexForPoints, type Opponent } from './league';
import {
  playSelect,
  playError,
  playUndo,
  playWin,
  playWarn,
  playLose,
  playHint,
  playReveal,
  playShuffle,
  playScore,
  playDivineStart,
  playDivineWin,
  playDivineMiss,
  playTick,
} from '@/lib/sound';

/** бонусы за пройденный уровень */
export type BonusItem = 'hint' | 'shuffle';

/** режим игры */
export type GameMode = 'classic' | 'battle';

export type MatchReason = 'cleared' | 'opponent' | 'timeout' | 'tray';

export interface MatchResult {
  outcome: 'win' | 'lose';
  reason: MatchReason;
  myScore: number;
  botScore: number;
  myPairs: number;
  botPairs: number;
  trophiesDelta: number;
  timeLeftMs: number;
}

export interface Challenge {
  endsAt: number;
  totalMs: number;
}

export interface Battle {
  opponent: Opponent;
  started: boolean;
  timeLeftMs: number;
  timeTotalMs: number;
  totalPairs: number;
  myScore: number;
  myCombo: number;
  myComboUntil: number;
  myPairsDone: number;
  botScore: number;
  botPairsDone: number;
  /** дробный прогресс бота к следующей паре 0..1 */
  botProgress: number;
  /** текущая скорость бота, пар/сек */
  botRate: number;
  /** базовая скорость бота, пар/сек */
  botBaseRate: number;
  botPhaseUntil: number;
  botCombo: number;
  /** челлендж «Божественный ход» */
  challenge: Challenge | null;
  lastChallengeAt: number;
  /** timestamp последнего тика */
  lastTickAt: number;
  result: MatchResult | null;
}

export interface Session {
  /** id партии — защита отложенных таймеров и ключ React */
  sid: number;
  level: number;
  tiles: TileInstance[];
  /** id плиток, лежащих в лотке (в порядке добавления) */
  tray: number[];
  /** последняя взорвавшаяся пара [житель лотка, прилетевшая] */
  matchedPair: [number, number] | null;
  /** счётчик пар — для детекта новых событий анимации */
  matchedSeq: number;
  /** плитка, по которой тапнули по ошибке (анимация «занято») */
  invalidId: number | null;
  status: 'play' | 'won' | 'lost';
  /** в лоток легла 4-я разная плитка — проигрыш через мгновение */
  pendingLose: boolean;
  /** оставшиеся подсказки (ограничены) */
  hintsLeft: number;
  /** подсвеченная пара-подсказка [плитка №1, плитка №2] */
  hintPair: [number, number] | null;
  /** оставшиеся перемешивания (ограничены) */
  shufflesLeft: number;
  /** счётчик перемешиваний — триггер волны-анимации */
  shuffleSeq: number;
  /** бонусы, начисленные за эту победу (для баннера) */
  bonusGrant: BonusItem[];
  /** режим партии */
  mode: GameMode;
  /** состояние матча 1v1 (в «Классике» — null) */
  battle: Battle | null;
  /** id плиток, лежащих рубашкой вверх (до переворота) */
  faceDownIds: number[];
  /** id рубашек, спрятанных ПОД другими костями */
  buriedIds: number[];
  /** id рубашек, которые уже перевернулись (лицом вверх, на доске) */
  revealedIds: number[];
  /** единственная открытая «подглядка» — возвращается рубашкой вверх */
  peekId: number | null;
  /** оставшиеся возвраты плитки из лотка (ограничены) */
  undosLeft: number;
}

interface GameState {
  hydrated: boolean;
  /** текущий бесконечный уровень */
  level: number;
  settings: { sound: boolean };
  tutorialSeen: boolean;
  session: Session | null;
  /** меню открыто, но партия СОХРАНЕНА — продолжится по кнопке */
  showMenu: boolean;
  /** начисленные, но ещё не потраченные бонусы */
  bank: { hints: number; shuffles: number };
  /** лига: трофеи и статистика */
  league: { points: number; wins: number; losses: number; streak: number };

  setHydrated: (v: boolean) => void;
  /** режим, в который играли в последний раз (для «Дальше») */
  lastMode: GameMode;
  startMode: (mode: GameMode) => void;
  exitToMenu: () => void;
  /** подготовить сохранённую партию к продолжению после загрузки */
  resumeAfterHydration: () => void;
  beginBattle: () => void;
  tick: () => void;
  tapTile: (id: number) => void;
  undo: () => void;
  hint: () => void;
  shuffle: () => void;
  restartLevel: () => void;
  nextLevel: () => void;
  setSound: (v: boolean) => void;
  markTutorialSeen: () => void;
}

export const TRAY_SIZE = 4;
export const HINTS_PER_LEVEL = 3;
export const SHUFFLES_PER_LEVEL = 2;
export const UNDOS_PER_LEVEL = 3;
const LOSE_DELAY_MS = 900;
const HINT_SHOW_MS = 2600;

/** очки */
const PAIR_BASE = 100;
const COMBO_STEP = 25;
const COMBO_CAP = 5;
const COMBO_WINDOW_MS = 7000;
/** челлендж «Божественный ход» */
const DIVINE_BONUS = 150;
const DIVINE_WINDOW_MS = 6000;
const DIVINE_COOLDOWN_MIN = 30000;
const DIVINE_COOLDOWN_SPREAD = 25000;
/** когда можно запускать следующий челлендж */
const divineNextAt = () =>
  performance.now() + DIVINE_COOLDOWN_MIN + Math.random() * DIVINE_COOLDOWN_SPREAD;
/** трофеи */
const TROPHY_WIN = 30;
const TROPHY_SPEED_MAX = 20;
const TROPHY_LOSE = 15;

const TIME_PER_PAIR_MS = 4500;
const TIME_MIN_MS = 90000;
const TIME_MAX_MS = 270000;

let sidCounter = 1;
const nextSid = () => sidCounter++;

/** 1–2 бонуса за пройденный уровень */
function rollBonuses(): BonusItem[] {
  if (Math.random() < 0.45) return ['hint', 'shuffle'];
  return Math.random() < 0.5 ? ['hint'] : ['shuffle'];
}

/** ориентация экрана в момент старта партии — под неё подбирается раскладка */
function isLandscape(): boolean {
  return typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
}

/** подготовка партии к продолжению: «время» партии привязано
 *  к странице (performance.now), после перезагрузки окна комбо и
 *  челленджи сбрасываем, тику бота ставим «сейчас» */
function normalizeForResume(s: Session): Session {
  if (!s.battle) return s;
  const now = performance.now();
  return {
    ...s,
    battle: {
      ...s.battle,
      lastTickAt: now,
      botPhaseUntil: now,
      myComboUntil: 0,
      lastChallengeAt: 0,
      challenge: null,
    },
  };
}

function createSession(
  level: number,
  leaguePoints: number,
  bonus = { hints: 0, shuffles: 0 },
  mode: GameMode = 'battle',
): Session {
  const layout = getLayoutForLevel(level, isLandscape());
  const tiles = generateBoard(layout.positions);
  const shirts = pickShirts(tiles);
  const totalPairs = layout.positions.length / 2;
  const battle: Battle | null =
    mode === 'battle' ? buildBattle(totalPairs, leaguePoints) : null;
  return {
    sid: nextSid(),
    level,
    tiles,
    faceDownIds: shirts.freeIds,
    buriedIds: shirts.buriedIds,
    revealedIds: [],
    peekId: null,
    tray: [],
    matchedPair: null,
    matchedSeq: 0,
    invalidId: null,
    status: 'play',
    pendingLose: false,
    hintsLeft: HINTS_PER_LEVEL + bonus.hints,
    hintPair: null,
    shufflesLeft: SHUFFLES_PER_LEVEL + bonus.shuffles,
    shuffleSeq: 0,
    undosLeft: UNDOS_PER_LEVEL,
    bonusGrant: [],
    mode,
    battle,
  };
}

/** панель боя для режима «1 на 1» */
function buildBattle(totalPairs: number, leaguePoints: number): Battle {
  const timeTotalMs = Math.min(
    TIME_MAX_MS,
    Math.max(TIME_MIN_MS, totalPairs * TIME_PER_PAIR_MS),
  );
  const opponent = makeOpponent(leagueIndexForPoints(leaguePoints));
  const now = performance.now();
  const botBaseRate =
    totalPairs / ((timeTotalMs / 1000) * opponent.speedFactor);
  return {
    opponent,
    started: false,
    timeLeftMs: timeTotalMs,
    timeTotalMs,
    totalPairs,
    myScore: 0,
    myCombo: 0,
    myComboUntil: 0,
    myPairsDone: 0,
    botScore: 0,
    botPairsDone: 0,
    botProgress: 0,
    botRate: 0,
    botBaseRate,
    // первые ~2.5 с соперник «присматривается» к доске
    botPhaseUntil: now + 2000 + Math.random() * 1200,
    botCombo: 0,
    challenge: null,
    lastChallengeAt: now + 12000 + Math.random() * 15000,
    lastTickAt: now,
    result: null,
  };
}

/** отложенное действие, привязанное к текущей партии */
function later(ms: number, fn: (sid: number) => void) {
  const sid = useGame.getState().session?.sid;
  window.setTimeout(() => {
    const s = useGame.getState().session;
    if (s && s.sid === sid) fn(sid);
  }, ms);
}

const byId = (s: Session, id: number) => s.tiles.find((t) => t.id === id);

/** плитка лежит рубашкой вверх и ещё не открыта
 *  (летящая в лоток кость ОТКРЫТА — она попадает в revealedIds) */
const isConcealed = (s: Session, id: number) =>
  (s.faceDownIds.includes(id) &&
    s.peekId !== id &&
    !s.revealedIds.includes(id)) ||
  (s.buriedIds.includes(id) && !s.revealedIds.includes(id));

/** найти перевёрнутую рубашку с той же гранью (кроме excludeId) */
function findRevealedTwin(
  s: Session,
  matchKey: string,
  excludeId: number | null,
): number | null {
  const candidates = [...s.revealedIds];
  if (s.peekId !== null && s.peekId !== excludeId) candidates.push(s.peekId);
  for (const id of candidates) {
    if (id === excludeId) continue;
    const t = byId(s, id);
    if (!t || t.removed) continue;
    if (getTileDef(t.defId).matchKey === matchKey) return id;
  }
  return null;
}

/**
 * Авто-открытие: рубашки, спрятанные ПОД костями, переворачиваются
 * сами, как только верхняя кость снята — на (x, y, z+1) больше
 * никого. Считается по НОВОМУ состоянию плиток (после снятия).
 */
function autoRevealFrom(tiles: TileInstance[], s: Session): number[] {
  if (s.buriedIds.length === 0) return [];
  const occupied = buildOccupancy(tiles);
  const out: number[] = [];
  for (const id of s.buriedIds) {
    if (s.revealedIds.includes(id)) continue;
    const t = tiles.find((x) => x.id === id);
    if (!t || t.removed) continue;
    if (!occupied.has(`${t.x},${t.y},${t.z + 1}`)) out.push(id);
  }
  return out;
}

/**
 * Есть ли хоть один ход: пара среди свободных плиток ИЛИ житель
 * лотка, парный свободной плитке. Рубашки тоже считаются — их
 * можно тапнуть (тап подряд открывает и составляет пару).
 */
function hasAnyMove(s: Session): boolean {
  const free = freeTiles(s.tiles);
  const byKey = new Map<string, number>();
  for (const t of free) {
    const k = getTileDef(t.defId).matchKey;
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  for (const n of byKey.values()) if (n >= 2) return true;
  for (const tid of s.tray) {
    const t = byId(s, tid);
    if (t && byKey.get(getTileDef(t.defId).matchKey)) return true;
  }
  return false;
}

/**
 * Ходов нет — тихо перемешать оставшиеся плитки БЕСПЛАТНО
 * (как в топовых маджонгах: игра не даёт застрять насухо).
 * Возвращает новую сессию или null, если перемешивание не нужно.
 */
function unstuckSession(s: Session): Session | null {
  if (s.status !== 'play' || s.pendingLose) return null;
  if (s.tray.length >= TRAY_SIZE) return null;
  if (hasAnyMove(s)) return null;
  let tiles = s.tiles;
  for (let i = 0; i < 3; i++) {
    const next = reshuffleRemaining(tiles);
    if (next === tiles) break; // перемешать не удалось
    tiles = next;
    if (hasAnyMove({ ...s, tiles })) break;
  }
  if (tiles === s.tiles) return null;
  showToast('Ходов больше нет — перемешали');
  return {
    ...s,
    tiles,
    shuffleSeq: s.shuffleSeq + 1,
    hintPair: null,
    peekId: null,
  };
}

/**
 * Убрать пару: обе плитки покидают доску и улетают в лоток,
 * где соединяются и взрываются. Жителем может быть как плитка
 * лотка, так и перевёрнутая рубашка на доске (peek-пара).
 *
 * Летящая пара ВСЕГДА летит лицом вверх: закрытые кости
 * переворачиваются ДО полёта (костяшка разворачивается —
 * и только потом улетает и взрывается, а не рубашкой).
 */
function removePair(
  set: (p: Partial<GameState>) => void,
  s: Session,
  residentId: number,
  arrivingId: number,
) {
  // страховка от гонки быстрых тапов: прилетевшая уже удалена или
  // «житель» уже взорвался — пару не собираем (иначе кость улетала
  // бы одна и взрывалась в одиночку)
  const resTile = byId(s, residentId);
  const arrTile = byId(s, arrivingId);
  if (!resTile || !arrTile || arrTile.removed) return;
  if (resTile.removed && !s.tray.includes(residentId)) return;

  const tray = s.tray.filter((tid) => tid !== residentId);
  const tiles = s.tiles.map((t) =>
    t.id === arrivingId || t.id === residentId ? { ...t, removed: true } : t,
  );

  // — очки с комбо: только в матче 1 на 1 —
  const b = s.battle;
  let battle = b;
  if (b) {
    const now = performance.now();
    const combo =
      now < b.myComboUntil ? Math.min(b.myCombo + 1, COMBO_CAP) : 1;
    const divine = b.challenge !== null;
    const pts =
      PAIR_BASE + (combo - 1) * COMBO_STEP + (divine ? DIVINE_BONUS : 0);
    battle = {
      ...b,
      myScore: b.myScore + pts,
      myCombo: combo,
      myComboUntil: now + COMBO_WINDOW_MS,
      myPairsDone: b.myPairsDone + 1,
      challenge: divine ? null : b.challenge,
      // после успешного челленджа — новый не раньше кулдауна
      lastChallengeAt: divine ? divineNextAt() : b.lastChallengeAt,
    };
    playScore(combo);
    floatScore(`+${pts}`, divine ? 'gold' : 'normal');
    if (divine) {
      playDivineWin();
      showToast(`Божественный ход! +${pts}`);
    }
  }

  // победа — только когда не осталось ни плиток на доске,
  // ни плиток в лотке
  const boardEmpty = tiles.every((t) => t.removed);
  const won = tray.length === 0 && boardEmpty;
  const seq = s.matchedSeq + 1;
  // снятие костей могло открыть рубашки ПОД ними — переворачиваем
  const newlyRevealed = autoRevealFrom(tiles, s);
  // ЛЕТЯЩАЯ ПАРА — ЛИЦОМ ВВЕРХ: переворачиваем закрытые кости
  // (счастливое открытие: тап по «слепой» рубашке, совпавшей парой)
  const flyReveal = [residentId, arrivingId].filter(
    (id) =>
      (s.faceDownIds.includes(id) || s.buriedIds.includes(id)) &&
      !s.revealedIds.includes(id),
  );
  const revealedIds = [
    ...s.revealedIds,
    ...newlyRevealed,
    ...flyReveal,
  ].filter((id, i, arr) => arr.indexOf(id) === i);
  if (flyReveal.length > 0 || newlyRevealed.length > 0) playReveal();
  playSelect();
  set({
    session: {
      ...s,
      tiles,
      tray,
      matchedPair: [residentId, arrivingId],
      matchedSeq: seq,
      invalidId: null,
      hintPair: null,
      // пара ушла — подглядка возвращается рубашкой вверх;
      // авто-открытые рубашки остаются лицом вверх
      peekId: null,
      revealedIds,
      battle,
    },
  });
  if (won) finish(set, 'cleared');
  // страховка: доска пуста, а в лотке остался житель без пары —
  // (после фикса «пары с самим собой» недостижимо, но на всякий случай)
  else if (boardEmpty && tray.length > 0) finish(set, 'tray');
  else {
    // пар не осталось — тихо перемешать (как в топовых играх)
    const cur = useGame.getState().session;
    const unstuck = cur ? unstuckSession(cur) : null;
    if (unstuck) set({ session: unstuck });
  }
  later(1600, () => {
    const cur = useGame.getState().session;
    if (cur && cur.matchedSeq === seq) {
      set({ session: { ...cur, matchedPair: null } });
    }
  });
}

/** финал партии — маршрутизация по режиму */
function finish(
  set: (p: Partial<GameState>) => void,
  reason: MatchReason,
) {
  const s = useGame.getState().session;
  if (!s) return;
  if (s.mode === 'classic') finishClassic(set, reason);
  else finishMatch(set, reason);
}

/** финал классического уровня: победа — бонусы, поражение — просто финал */
function finishClassic(
  set: (p: Partial<GameState>) => void,
  reason: MatchReason,
) {
  const st = useGame.getState();
  const s = st.session;
  if (!s || s.status !== 'play') return;
  const won = reason === 'cleared';
  const bonusGrant = won ? rollBonuses() : [];
  const bank = st.bank;
  set({
    bank: won
      ? {
          hints: bank.hints + bonusGrant.filter((g) => g === 'hint').length,
          shuffles:
            bank.shuffles + bonusGrant.filter((g) => g === 'shuffle').length,
        }
      : bank,
    session: {
      ...s,
      status: won ? 'won' : 'lost',
      pendingLose: false,
      bonusGrant,
    },
  });
  if (won) later(1250, () => playWin());
  else playLose();
}

/** завершение матча 1v1: исход, трофеи, лига */
function finishMatch(
  set: (p: Partial<GameState>) => void,
  reason: MatchReason,
) {
  const st = useGame.getState();
  const s = st.session;
  if (!s || s.status !== 'play' || !s.battle || s.battle.result) return;
  const b = s.battle;

  let outcome: 'win' | 'lose';
  if (reason === 'cleared') outcome = 'win';
  else if (reason === 'opponent' || reason === 'tray') outcome = 'lose';
  else {
    // тайм-аут: у кого больше собрано
    if (b.myPairsDone !== b.botPairsDone) outcome = b.myPairsDone > b.botPairsDone ? 'win' : 'lose';
    else outcome = b.myScore >= b.botScore ? 'win' : 'lose';
  }

  let delta: number;
  if (outcome === 'win') {
    const speedFrac = Math.max(0, b.timeLeftMs / b.timeTotalMs);
    delta =
      TROPHY_WIN +
      (reason === 'cleared' ? Math.round(TROPHY_SPEED_MAX * speedFrac) : 0);
  } else {
    delta = -TROPHY_LOSE;
  }

  const league = st.league;
  const points = Math.max(0, league.points + delta);
  const result: MatchResult = {
    outcome,
    reason,
    myScore: b.myScore,
    botScore: b.botScore,
    myPairs: b.myPairsDone,
    botPairs: b.botPairsDone,
    trophiesDelta: delta,
    timeLeftMs: Math.max(0, b.timeLeftMs),
  };

  const bonusGrant = outcome === 'win' ? rollBonuses() : [];
  const bank = st.bank;
  set({
    league: {
      points,
      wins: league.wins + (outcome === 'win' ? 1 : 0),
      losses: league.losses + (outcome === 'lose' ? 1 : 0),
      streak:
        outcome === 'win'
          ? league.streak >= 0
            ? league.streak + 1
            : 1
          : league.streak <= 0
            ? league.streak - 1
            : -1,
    },
    bank: outcome === 'win'
      ? {
          hints: bank.hints + bonusGrant.filter((g) => g === 'hint').length,
          shuffles:
            bank.shuffles + bonusGrant.filter((g) => g === 'shuffle').length,
        }
      : bank,
    session: {
      ...s,
      status: outcome === 'win' ? 'won' : 'lost',
      pendingLose: false,
      bonusGrant,
      battle: { ...b, result, challenge: null },
    },
  });
  if (outcome === 'win') later(1250, () => playWin());
  else playLose();
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      level: 1,
      settings: { sound: true },
      tutorialSeen: false,
      session: null,
      showMenu: false,
      lastMode: 'classic',
      bank: { hints: 0, shuffles: 0 },
      league: { points: 0, wins: 0, losses: 0, streak: 0 },

      setHydrated: (v) => set({ hydrated: v }),

      /** начать — или ПРОДОЛЖИТЬ — партию в выбранном режиме.
       *  Выход в меню партию не сбрасывает: та же игра и тот же
       *  уровень продолжаются с места остановки */
      startMode: (mode) => {
        const st = get();
        const cur = st.session;
        if (cur && cur.mode === mode && cur.status === 'play') {
          // продолжение сохранённой партии
          set({
            showMenu: false,
            lastMode: mode,
            session: normalizeForResume(cur),
          });
          return;
        }
        // новая партия (прежняя завершена или выбран другой режим)
        const bank = st.bank;
        if (bank.hints > 0 || bank.shuffles > 0) {
          set({
            session: createSession(st.level, st.league.points, bank, mode),
            bank: { hints: 0, shuffles: 0 },
            lastMode: mode,
            showMenu: false,
          });
        } else {
          set({
            session: createSession(st.level, st.league.points, undefined, mode),
            lastMode: mode,
            showMenu: false,
          });
        }
      },

      /** вернуться в меню — партия СОХРАНЯЕТСЯ (продолжится
       *  по кнопке); победный уровень сразу поднимает лестницу */
      exitToMenu: () => {
        const s = get().session;
        if (s && s.status === 'won') {
          get().nextLevel();
          set({ showMenu: true });
          return;
        }
        set({ showMenu: true });
      },

      /** возобновление сохранённой партии после загрузки страницы:
       *  нормализуем время боя, гасим признак летящей пары и
       *  перезапускаем защитный таймер «четырёх разных» */
      resumeAfterHydration: () => {
        const s = get().session;
        if (!s) return;
        // счётчик партий должен жить выше восстановленного sid —
        // иначе новая партия получит тот же sid и контроллер доски
        // не заметит смену расклада
        if (s.sid >= sidCounter) sidCounter = s.sid + 1;
        let session = normalizeForResume(s);
        if (session.matchedPair) session = { ...session, matchedPair: null };
        set({ session });
        if (session.pendingLose) {
          later(LOSE_DELAY_MS, () => {
            const cur = useGame.getState().session;
            if (cur?.pendingLose) finish(set, 'tray');
          });
        }
      },

      /** матчмейкинг завершён — старт отсчёта времени и бота */
      beginBattle: () => {
        const s = get().session;
        if (!s || !s.battle || s.battle.started || s.status !== 'play') return;
        const now = performance.now();
        set({
          session: {
            ...s,
            battle: { ...s.battle, started: true, lastTickAt: now },
          },
        });
      },

      /** тик боя (≈5 раз/сек): таймер, соперник, челленджи. В «Классике» — ничего. */
      tick: () => {
        // в меню матч на паузе: бот и таймер не тикают
        if (get().showMenu) return;
        const s = get().session;
        if (!s || s.status !== 'play' || !s.battle || !s.battle.started) return;
        const b = s.battle;
        const now = performance.now();
        const dt = Math.min(1000, Math.max(0, now - b.lastTickAt));

        let timeLeftMs = b.timeLeftMs - dt;

        // — соперник: фазы темпа (разгон / пауза / ровный ход) —
        let botRate = b.botRate;
        let botPhaseUntil = b.botPhaseUntil;
        if (now >= botPhaseUntil) {
          const r = Math.random();
          const skill = b.opponent.skill;
          if (r < 0.16 + 0.18 * skill) {
            botRate = b.botBaseRate * (1.7 + Math.random() * 0.8);
            botPhaseUntil = now + 1500 + Math.random() * 2200;
          } else if (r < 0.34 - 0.1 * skill) {
            botRate = b.botBaseRate * 0.12;
            botPhaseUntil = now + 800 + Math.random() * 1800;
          } else {
            botRate = b.botBaseRate * (0.8 + Math.random() * 0.4);
            botPhaseUntil = now + 2200 + Math.random() * 3800;
          }
        }

        // — прогресс бота к парам —
        let botProgress = b.botProgress + (botRate * dt) / 1000;
        let botPairsDone = b.botPairsDone;
        let botScore = b.botScore;
        let botCombo = b.botCombo;
        while (botProgress >= 1 && botPairsDone < b.totalPairs) {
          botProgress -= 1;
          botPairsDone++;
          botCombo =
            Math.random() < 0.55 ? Math.min(botCombo + 1, 4) : 1;
          botScore += PAIR_BASE + (botCombo - 1) * COMBO_STEP;
        }

        // соперник собрал доску первым — поражение
        if (botPairsDone >= b.totalPairs) {
          set({
            session: {
              ...s,
              battle: {
                ...b,
                timeLeftMs: Math.max(0, timeLeftMs),
                botRate,
                botPhaseUntil,
                botProgress,
                botPairsDone,
                botScore,
                botCombo,
                lastTickAt: now,
              },
            },
          });
          finishMatch(set, 'opponent');
          return;
        }

        // — комбо игрока остыло —
        const myCombo = now > b.myComboUntil ? 0 : b.myCombo;

        // — челлендж «Божественный ход» —
        let challenge = b.challenge;
        let lastChallengeAt = b.lastChallengeAt;
        const remaining = b.totalPairs - b.myPairsDone;
        if (challenge && now > challenge.endsAt) {
          // упущен
          challenge = null;
          lastChallengeAt = divineNextAt();
          playDivineMiss();
          showToast('Челлендж упущен');
        } else if (
          !challenge &&
          now > lastChallengeAt &&
          remaining > 4 &&
          s.tray.length < TRAY_SIZE
        ) {
          challenge = {
            endsAt: now + DIVINE_WINDOW_MS,
            totalMs: DIVINE_WINDOW_MS,
          };
          playDivineStart();
        }

        // — время вышло: подводим итоги по прогрессу —
        if (timeLeftMs <= 0) {
          set({
            session: {
              ...s,
              battle: {
                ...b,
                timeLeftMs: 0,
                botRate,
                botPhaseUntil,
                botProgress,
                botPairsDone,
                botScore,
                botCombo,
                myCombo,
                challenge,
                lastChallengeAt,
                lastTickAt: now,
              },
            },
          });
          finishMatch(set, 'timeout');
          return;
        }

        // звуковые тики на последних секундах
        const secPrev = Math.ceil(b.timeLeftMs / 1000);
        const secNow = Math.ceil(timeLeftMs / 1000);
        if (secNow !== secPrev && secNow <= 10 && secNow > 0) playTick();

        set({
          session: {
            ...s,
            battle: {
              ...b,
              timeLeftMs,
              botRate,
              botPhaseUntil,
              botProgress,
              botPairsDone,
              botScore,
              botCombo,
              myCombo,
              challenge,
              lastChallengeAt,
              lastTickAt: now,
            },
          },
        });
      },

      tapTile: (id) => {
        const s = get().session;
        if (!s || s.status !== 'play' || s.pendingLose) return;
        if (s.battle && !s.battle.started) return;
        const tile = byId(s, id);
        if (!tile || tile.removed) return;

        // плитка должна быть свободной (сверху пусто, открыт край)
        if (!isFree(tile, buildOccupancy(s.tiles))) {
          playError();
          set({ session: { ...s, invalidId: id } });
          later(420, () => {
            const cur = useGame.getState().session;
            if (cur) set({ session: { ...cur, invalidId: null } });
          });
          return;
        }

        const matchKey = getTileDef(tile.defId).matchKey;
        const concealed = isConcealed(s, id);

        // 1) совпадение с жителем лотка — пара (для закрытой плитки
        //    это «счастливое открытие»: рубашка переворачивается в полёте)
        const matchIdx = s.tray.findIndex(
          (tid) => getTileDef(byId(s, tid)!.defId).matchKey === matchKey,
        );
        if (matchIdx >= 0) {
          removePair(set, s, s.tray[matchIdx], id);
          return;
        }

        // 2) закрытая плитка: если среди открытых рубашек есть
        //    точно такая же — обе сразу уходят в лоток парой
        if (concealed) {
          const twin = findRevealedTwin(s, matchKey, id);
          if (twin !== null) {
            removePair(set, s, twin, id);
            return;
          }
          // иначе — переворот-подглядка (плитка остаётся на доске
          // лицом вверх). Прежняя подглядка переворачивается ОБРАТНО:
          // взгляд игрока — только на одну карточку за раз
          playReveal();
          set({
            session: {
              ...s,
              peekId: id,
              invalidId: null,
              hintPair: null,
            },
          });
          return;
        }

        // 3) открытая плитка: перевёрнутая рубашка с той же гранью —
        //    обе немедленно летят в лоток и взрываются парой
        // (исключаем САМУ тапнутую плитку: если её уже переворачивали,
        //  она не может стать парой сама с собой)
        const peekTwin = findRevealedTwin(s, matchKey, id);
        if (peekTwin !== null) {
          removePair(set, s, peekTwin, id);
          return;
        }

        // 4) новая плитка в лотке
        const tray = [...s.tray, id];
        const tiles = s.tiles.map((t) =>
          t.id === id ? { ...t, removed: true } : t,
        );
        playSelect();
        // тап по другой плитке — подглядка возвращается рубашкой вверх;
        // снятие кости могло открыть рубашку ПОД ней — переворачиваем
        const newlyRevealed = autoRevealFrom(tiles, s);
        // подгляданная рубашка, улетающая в лоток, остаётся ЛИЦОМ
        // ВВЕРХ (не переворачивается обратно в полёте)
        const flyReveal =
          s.faceDownIds.includes(id) && !s.revealedIds.includes(id)
            ? [id]
            : [];
        const revealedIds = [
          ...s.revealedIds,
          ...newlyRevealed,
          ...flyReveal,
        ].filter((x, i, arr) => arr.indexOf(x) === i);
        if (newlyRevealed.length > 0 || flyReveal.length > 0) playReveal();
        const peekId: number | null = null;

        if (tray.length >= TRAY_SIZE) {
          // четыре разные — поражение (можно успеть отменить)
          set({
            session: {
              ...s,
              tiles,
              tray,
              revealedIds,
              peekId,
              invalidId: null,
              hintPair: null,
              pendingLose: true,
            },
          });
          later(LOSE_DELAY_MS, () => {
            const cur = useGame.getState().session;
            if (cur?.pendingLose) {
              finish(set, 'tray');
            }
          });
          return;
        }

        // страховка: доска пуста, а в лотке остались разные плитки —
        // пар для них больше нет, это поражение
        if (tiles.every((t) => t.removed) && tray.length > 0) {
          set({
            session: {
              ...s,
              tiles,
              tray,
              revealedIds,
              peekId,
              invalidId: null,
              hintPair: null,
            },
          });
          finish(set, 'tray');
          return;
        }

        if (tray.length === TRAY_SIZE - 1) playWarn();
        set({ session: { ...s, tiles, tray, revealedIds, peekId, invalidId: null, hintPair: null } });
        // пар больше нет — тихо перемешать (бесплатно, как в топовых)
        const cur = useGame.getState().session;
        const unstuck = cur ? unstuckSession(cur) : null;
        if (unstuck) set({ session: unstuck });
      },

      undo: () => {
        const s = get().session;
        if (!s || s.status !== 'play' || s.tray.length === 0) return;
        if (s.undosLeft <= 0) {
          playError();
          showToast('Возвраты закончились');
          return;
        }
        const lastId = s.tray[s.tray.length - 1];
        const tray = s.tray.slice(0, -1);
        const tiles = s.tiles.map((t) =>
          t.id === lastId ? { ...t, removed: false } : t,
        );
        playUndo();
        set({
          session: {
            ...s,
            tiles,
            tray,
            undosLeft: s.undosLeft - 1,
            pendingLose: false,
            invalidId: null,
            hintPair: null,
          },
        });
      },

      hint: () => {
        const s = get().session;
        if (!s || s.status !== 'play' || s.pendingLose) return;
        if (s.battle && !s.battle.started) return;
        if (s.hintsLeft <= 0) return;

        const free = freeTiles(s.tiles).filter((t) => !isConcealed(s, t.id));
        const freeByKey = new Map<string, TileInstance[]>();
        for (const t of free) {
          const k = getTileDef(t.defId).matchKey;
          const arr = freeByKey.get(k);
          if (arr) arr.push(t);
          else freeByKey.set(k, [t]);
        }

        // 1) свободная плитка, парная жителю лотка (освобождает лоток)
        let pair: [number, number] | null = null;
        for (const tid of s.tray) {
          const k = getTileDef(byId(s, tid)!.defId).matchKey;
          const cand = freeByKey.get(k)?.[0];
          if (cand) {
            pair = [tid, cand.id];
            break;
          }
        }
        // 2) две одинаковые свободные плитки на доске
        if (!pair) {
          for (const arr of freeByKey.values()) {
            if (arr.length >= 2) {
              pair = [arr[0].id, arr[1].id];
              break;
            }
          }
        }

        // пар нет — подсказку не списываем
        if (!pair) {
          showToast('Нет пар');
          playError();
          return;
        }

        playHint();
        set({
          session: {
            ...s,
            hintsLeft: s.hintsLeft - 1,
            hintPair: pair,
            invalidId: null,
          },
        });
        later(HINT_SHOW_MS, () => {
          const cur = useGame.getState().session;
          if (cur && cur.hintPair === pair) {
            set({ session: { ...cur, hintPair: null } });
          }
        });
      },

      /** перемешать оставшиеся плитки (ограничено, решаемость сохраняется) */
      shuffle: () => {
        const s = get().session;
        if (!s || s.status !== 'play' || s.pendingLose) return;
        if (s.battle && !s.battle.started) return;
        if (s.shufflesLeft <= 0) return;
        const remaining = s.tiles.filter((t) => !t.removed);
        if (remaining.length < 4) {
          showToast('Нечего мешать');
          return;
        }
        const tiles = reshuffleRemaining(s.tiles);
        if (tiles === s.tiles) {
          playError();
          return;
        }
        playShuffle();
        // перемешивание перетасовало грани — подглядка закрывается;
        // авто-открытые рубашки остаются открытыми (костей над ними нет)
        set({
          session: {
            ...s,
            tiles,
            peekId: null,
            shufflesLeft: s.shufflesLeft - 1,
            shuffleSeq: s.shuffleSeq + 1,
            hintPair: null,
            invalidId: null,
          },
        });
      },

      restartLevel: () => {
        const st = get();
        const mode = st.session?.mode ?? st.lastMode;
        set({
          session: createSession(st.level, st.league.points, undefined, mode),
        });
      },

      nextLevel: () => {
        const st = get();
        const level = st.level + 1;
        const mode = st.session?.mode ?? st.lastMode;
        const bank = st.bank;
        if (bank.hints > 0 || bank.shuffles > 0) {
          set({
            level,
            session: createSession(level, st.league.points, bank, mode),
            bank: { hints: 0, shuffles: 0 },
          });
        } else {
          set({
            level,
            session: createSession(level, st.league.points, undefined, mode),
          });
        }
      },

      setSound: (v) => {
        set({ settings: { ...get().settings, sound: v } });
      },

      markTutorialSeen: () => set({ tutorialSeen: true }),
    }),
    {
      name: 'mahjong-relax-save',
      version: 5,
      partialize: (state) => ({
        level: state.level,
        settings: state.settings,
        tutorialSeen: state.tutorialSeen,
        bank: state.bank,
        league: state.league,
        lastMode: state.lastMode,
        // ПАРТИЯ СОХРАНЯЕТСЯ: выход/закрытие — прогресс не теряется
        session: state.session,
      }),
      migrate: (persisted, version) => {
        const p = persisted as
          | {
              level?: number;
              settings?: { sound?: boolean };
              tutorialSeen?: boolean;
              bank?: { hints?: number; shuffles?: number };
              league?: {
                points?: number;
                wins?: number;
                losses?: number;
                streak?: number;
              };
              lastMode?: GameMode;
              session?: Session | null;
              progress?: { unlockedLevel?: number };
            }
          | undefined;
        const base = {
          level: p?.level ?? p?.progress?.unlockedLevel ?? 1,
          settings: { sound: p?.settings?.sound ?? true },
          tutorialSeen: p?.tutorialSeen ?? false,
          bank: {
            hints: p?.bank?.hints ?? 0,
            shuffles: p?.bank?.shuffles ?? 0,
          },
          league: {
            points: p?.league?.points ?? 0,
            wins: p?.league?.wins ?? 0,
            losses: p?.league?.losses ?? 0,
            streak: p?.league?.streak ?? 0,
          },
        };
        if (version < 4) {
          return base;
        }
        if (version < 5) {
          // раньше партия не сохранялась — начинаем с чистого листа
          return { ...base, lastMode: 'classic', session: null };
        }
        return {
          ...base,
          lastMode: p?.lastMode ?? 'classic',
          session: p?.session ?? null,
        };
      },
    },
  ),
);

/** Отладочный доступ для e2e-тестов (только в dev-сборке) */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as Record<string, unknown>).__mjDebug = {
    getState: () => useGame.getState(),
    menu: () => useGame.setState({ session: null }),
    /** тесты: сразу партия классики на заданном уровне */
    setLevel: (n: number) => {
      useGame.setState({ level: n, session: null, showMenu: false });
      useGame.getState().startMode('classic');
    },
    startClassic: () => {
      useGame.setState({ session: null });
      useGame.getState().startMode('classic');
    },
    startBattle: () => {
      useGame.setState({ session: null });
      useGame.getState().startMode('battle');
    },
    findMoves: () => {
      const s = useGame.getState().session;
      if (!s) return [];
      // занятость считаем по ВСЕМ живым плиткам (включая рубашки),
      // а уже потом прячем рубашки из кандидатов
      const visible = freeTiles(s.tiles).filter((t) => !isConcealed(s, t.id));
      const byKey = new Map<string, TileInstance[]>();
      for (const t of visible) {
        const k = getTileDef(t.defId).matchKey;
        const arr = byKey.get(k);
        if (arr) arr.push(t);
        else byKey.set(k, [t]);
      }
      const moves: [number, number][] = [];
      for (const arr of byKey.values()) {
        for (let i = 0; i + 1 < arr.length; i += 2) {
          moves.push([arr[i].id, arr[i + 1].id]);
        }
      }
      // житель лотка + парная свободная плитка на доске
      for (const tid of s.tray) {
        const k = getTileDef(byId(s, tid)!.defId).matchKey;
        const cand = visible.find((f) => getTileDef(f.defId).matchKey === k);
        if (cand) moves.push([tid, cand.id]);
      }
      return moves;
    },
    tap: (id: number) => useGame.getState().tapTile(id),
    undo: () => useGame.getState().undo(),
    hint: () => useGame.getState().hint(),
    shuffle: () => useGame.getState().shuffle(),
    begin: () => useGame.getState().beginBattle(),
    tick: () => useGame.getState().tick(),
    /** заморозить бота (для тестов победы) */
    freezeBot: () => {
      const s = useGame.getState().session;
      if (!s?.battle) return;
      useGame.setState({
        session: {
          ...s,
          battle: { ...s.battle, botBaseRate: 0, botRate: 0 },
        },
      });
    },
    /** соперник мгновенно собирает доску (тест поражения) */
    botWin: () => {
      const s = useGame.getState().session;
      if (!s?.battle) return;
      useGame.setState({
        session: {
          ...s,
          battle: {
            ...s.battle,
            botPairsDone: s.battle.totalPairs,
            botScore: Math.max(s.battle.botScore, 1),
          },
        },
      });
      useGame.getState().tick();
    },
    /** время почти вышло (тест тайм-аута) */
    timeOut: () => {
      const s = useGame.getState().session;
      if (!s?.battle) return;
      useGame.setState({
        session: { ...s, battle: { ...s.battle, timeLeftMs: 5 } },
      });
    },
    /** запустить челлендж «Божественный ход» немедленно (тест) */
    divine: () => {
      const s = useGame.getState().session;
      if (!s?.battle || s.status !== 'play') return;
      const now = performance.now();
      useGame.setState({
        session: {
          ...s,
          battle: {
            ...s.battle,
            challenge: { endsAt: now + 6000, totalMs: 6000 },
          },
        },
      });
    },
  };
}
