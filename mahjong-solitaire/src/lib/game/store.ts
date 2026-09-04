'use client';

/**
 * Хранилище игры: бесконечные уровни, механика лотка.
 *
 * Правила:
 *  — тап по свободной плитке отправляет её в лоток сверху (4 места);
 *  — если в лотке уже лежит парная — обе взрываются и исчезают;
 *  — если в лотке оказались ЧЕТЫРЕ РАЗНЫЕ плитки — проигрыш;
 *  — удержание плитки пальцем — можно отодвинуть и заглянуть под неё;
 *  — «Отмена» возвращает последнюю плитку из лотка (и спасает от
 *    неминуемого проигрыша, если нажать сразу).
 *
 * Уровни бесконечны и идут друг за другом без меню выбора.
 * За победу начисляется 1–2 бонуса (подсказка/перемешивание) —
 * они переходят на следующий уровень.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  generateBoard,
  buildOccupancy,
  isFree,
  findAvailableMoves,
  freeTiles,
  reshuffleRemaining,
  type TileInstance,
} from '@/lib/mahjong/engine';
import { getLayoutForLevel } from '@/lib/mahjong/layouts';
import { getTileDef } from '@/lib/mahjong/tiles';
import { showToast } from './fx';
import {
  playSelect,
  playError,
  playUndo,
  playWin,
  playWarn,
  playLose,
  playHint,
  playShuffle,
} from '@/lib/sound';

/** бонусы за пройденный уровень */
export type BonusItem = 'hint' | 'shuffle';

export interface Session {
  /** id партии — защита отложенных таймеров и ключ React */
  sid: number;
  level: number;
  tiles: TileInstance[];
  /** id плиток, лежащих в лотке (в порядке добавления) */
  tray: number[];
  /** последняя взорвавшаяся пара [жилец лотка, прилетевшая] */
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
}

interface GameState {
  hydrated: boolean;
  /** текущий бесконечный уровень */
  level: number;
  settings: { sound: boolean };
  tutorialSeen: boolean;
  session: Session | null;
  /** начисленные, но ещё не потраченные бонусы */
  bank: { hints: number; shuffles: number };

  setHydrated: (v: boolean) => void;
  start: () => void;
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
const LOSE_DELAY_MS = 900;
const HINT_SHOW_MS = 2600;

let sidCounter = 1;
const nextSid = () => sidCounter++;

/** 1–2 бонуса за пройденный уровень */
function rollBonuses(): BonusItem[] {
  if (Math.random() < 0.45) return ['hint', 'shuffle'];
  return Math.random() < 0.5 ? ['hint'] : ['shuffle'];
}

function createSession(
  level: number,
  bonus = { hints: 0, shuffles: 0 },
): Session {
  const layout = getLayoutForLevel(level);
  return {
    sid: nextSid(),
    level,
    tiles: generateBoard(layout.positions),
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
    bonusGrant: [],
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

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      level: 1,
      settings: { sound: true },
      tutorialSeen: false,
      session: null,
      bank: { hints: 0, shuffles: 0 },

      setHydrated: (v) => set({ hydrated: v }),

      start: () => {
        const st = get();
        if (st.session) return;
        const bank = st.bank;
        if (bank.hints > 0 || bank.shuffles > 0) {
          set({
            session: createSession(st.level, bank),
            bank: { hints: 0, shuffles: 0 },
          });
        } else {
          set({ session: createSession(st.level) });
        }
      },

      tapTile: (id) => {
        const s = get().session;
        if (!s || s.status !== 'play' || s.pendingLose) return;
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
        const matchIdx = s.tray.findIndex(
          (tid) => getTileDef(byId(s, tid)!.defId).matchKey === matchKey,
        );

        if (matchIdx >= 0) {
          // ПАРА: прилетевшая плитка встаёт РЯДОМ с парной в лотке,
          // затем анимация соединяет их и взрывает
          const residentId = s.tray[matchIdx];
          const tray = s.tray.filter((_, i) => i !== matchIdx);
          const tiles = s.tiles.map((t) =>
            t.id === id || t.id === residentId ? { ...t, removed: true } : t,
          );
          // победа — только когда не осталось ни плиток на доске,
          // ни плиток в лотке
          const won =
            tray.length === 0 && tiles.every((t) => t.removed);
          const seq = s.matchedSeq + 1;
          playSelect();
          if (won) {
            // бонусы за пройденный уровень — 1–2 штуки
            const grant = rollBonuses();
            const bank = get().bank;
            set({
              bank: {
                hints: bank.hints + grant.filter((g) => g === 'hint').length,
                shuffles:
                  bank.shuffles + grant.filter((g) => g === 'shuffle').length,
              },
              session: {
                ...s,
                tiles,
                tray,
                matchedPair: [residentId, id],
                matchedSeq: seq,
                invalidId: null,
                hintPair: null,
                bonusGrant: grant,
                status: 'won',
              },
            });
            later(1250, () => playWin());
          } else {
            set({
              session: {
                ...s,
                tiles,
                tray,
                matchedPair: [residentId, id],
                matchedSeq: seq,
                invalidId: null,
                hintPair: null,
              },
            });
          }
          later(1600, () => {
            const cur = useGame.getState().session;
            if (cur && cur.matchedSeq === seq) {
              set({ session: { ...cur, matchedPair: null } });
            }
          });
          return;
        }

        // новая плитка в лотке
        const tray = [...s.tray, id];
        const tiles = s.tiles.map((t) =>
          t.id === id ? { ...t, removed: true } : t,
        );
        playSelect();

        if (tray.length >= TRAY_SIZE) {
          // четыре разные — проигрыш (можно успеть отменить)
          set({
            session: {
              ...s,
              tiles,
              tray,
              invalidId: null,
              hintPair: null,
              pendingLose: true,
            },
          });
          later(LOSE_DELAY_MS, () => {
            const cur = useGame.getState().session;
            if (cur?.pendingLose) {
              playLose();
              set({ session: { ...cur, status: 'lost', pendingLose: false } });
            }
          });
          return;
        }

        // страховка: доска пуста, а в лотке остались разные плитки —
        // пар для них больше нет, это проигрыш, а не победа
        if (tiles.every((t) => t.removed) && tray.length > 0) {
          playLose();
          set({
            session: {
              ...s,
              tiles,
              tray,
              invalidId: null,
              hintPair: null,
              status: 'lost',
            },
          });
          return;
        }

        if (tray.length === TRAY_SIZE - 1) playWarn();
        set({ session: { ...s, tiles, tray, invalidId: null, hintPair: null } });
      },

      undo: () => {
        const s = get().session;
        if (!s || s.status !== 'play' || s.tray.length === 0) return;
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
            pendingLose: false,
            invalidId: null,
            hintPair: null,
          },
        });
      },

      hint: () => {
        const s = get().session;
        if (!s || s.status !== 'play' || s.pendingLose) return;
        if (s.hintsLeft <= 0) return;

        const free = freeTiles(s.tiles);
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
        set({
          session: {
            ...s,
            tiles,
            shufflesLeft: s.shufflesLeft - 1,
            shuffleSeq: s.shuffleSeq + 1,
            hintPair: null,
            invalidId: null,
          },
        });
      },

      restartLevel: () => {
        set({ session: createSession(get().level) });
      },

      nextLevel: () => {
        const st = get();
        const level = st.level + 1;
        const bank = st.bank;
        if (bank.hints > 0 || bank.shuffles > 0) {
          set({
            level,
            session: createSession(level, bank),
            bank: { hints: 0, shuffles: 0 },
          });
        } else {
          set({ level, session: createSession(level) });
        }
      },

      setSound: (v) => {
        set({ settings: { ...get().settings, sound: v } });
      },

      markTutorialSeen: () => set({ tutorialSeen: true }),
    }),
    {
      name: 'mahjong-relax-save',
      version: 3,
      partialize: (state) => ({
        level: state.level,
        settings: state.settings,
        tutorialSeen: state.tutorialSeen,
        bank: state.bank,
      }),
      migrate: (persisted, version) => {
        const p = persisted as
          | {
              level?: number;
              settings?: { sound?: boolean };
              tutorialSeen?: boolean;
              bank?: { hints?: number; shuffles?: number };
              progress?: { unlockedLevel?: number };
            }
          | undefined;
        if (version < 3) {
          return {
            level: p?.level ?? p?.progress?.unlockedLevel ?? 1,
            settings: { sound: p?.settings?.sound ?? true },
            tutorialSeen: p?.tutorialSeen ?? false,
            bank: {
              hints: p?.bank?.hints ?? 0,
              shuffles: p?.bank?.shuffles ?? 0,
            },
          };
        }
        return p as {
          level: number;
          settings: { sound: boolean };
          tutorialSeen: boolean;
          bank: { hints: number; shuffles: number };
        };
      },
    },
  ),
);

/** Отладочный доступ для e2e-тестов (только в dev-сборке) */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as Record<string, unknown>).__mjDebug = {
    getState: () => useGame.getState(),
    findMoves: () => {
      const s = useGame.getState().session;
      if (!s) return [];
      const moves = findAvailableMoves(s.tiles).map((m) => [m[0].id, m[1].id]);
      // житель лотка + парная свободная плитка на доске
      const free = freeTiles(s.tiles);
      for (const tid of s.tray) {
        const k = getTileDef(byId(s, tid)!.defId).matchKey;
        const cand = free.find((f) => getTileDef(f.defId).matchKey === k);
        if (cand) moves.push([tid, cand.id]);
      }
      return moves;
    },
    tap: (id: number) => useGame.getState().tapTile(id),
    hint: () => useGame.getState().hint(),
    shuffle: () => useGame.getState().shuffle(),
  };
}
