/**
 * Игровой движок маджонг-пасьянса.
 *
 * Ключевая идея генерации: доска строится «обратным решением» —
 * симулируем разбор полного расклада парами, назначая парам плитки
 * одинакового вида. Записанная последовательность разборов является
 * доказательством решаемости: игрок всегда может победить.
 */

import type { Pos } from './layouts';
import { buildPairUnits, getTileDef, type PairUnit } from './tiles';

/** собрать плитки из результата симуляции */
function materialize(assignment: Map<Pos, string>): TileInstance[] {
  let id = 0;
  return [...assignment.entries()].map(([pos, defId]) => ({
    id: id++,
    defId,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    removed: false,
  }));
}

export interface TileInstance {
  /** id экземпляра (стабильный ключ React) */
  id: number;
  /** вид плитки, напр. "bam-5" */
  defId: string;
  x: number;
  y: number;
  z: number;
  removed: boolean;
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Плитка свободна: сверху нет плитки и открыт левый ИЛИ правый край */
export function isFree(t: TileInstance, occupied: Set<string>): boolean {
  if (occupied.has(key(t.x, t.y, t.z + 1))) return false;
  const leftBlocked = occupied.has(key(t.x - 2, t.y, t.z));
  const rightBlocked = occupied.has(key(t.x + 2, t.y, t.z));
  return !(leftBlocked && rightBlocked);
}

/** Множество занятых позиций живых плиток */
export function buildOccupancy(tiles: TileInstance[]): Set<string> {
  const set = new Set<string>();
  for (const t of tiles) {
    if (!t.removed) set.add(key(t.x, t.y, t.z));
  }
  return set;
}

export function freeTiles(tiles: TileInstance[]): TileInstance[] {
  const occupied = buildOccupancy(tiles);
  return tiles.filter((t) => !t.removed && isFree(t, occupied));
}

/** Доступные ходы: пары свободных плиток одного вида */
export function findAvailableMoves(
  tiles: TileInstance[],
): [TileInstance, TileInstance][] {
  const free = freeTiles(tiles);
  const byKey = new Map<string, TileInstance[]>();
  for (const t of free) {
    const k = getTileDef(t.defId).matchKey;
    const arr = byKey.get(k);
    if (arr) arr.push(t);
    else byKey.set(k, [t]);
  }
  const moves: [TileInstance, TileInstance][] = [];
  for (const arr of byKey.values()) {
    for (let i = 0; i + 1 < arr.length; i += 2) {
      moves.push([arr[i], arr[i + 1]]);
    }
  }
  return moves;
}

export type RNG = () => number;

/** Детерминированный ГПСЧ (mulberry32): один и тот же seed
 *  даёт одну и ту же доску — нужно для онлайн-комнаты, где
 *  оба игрока собирают ОДИНАКОВУЮ доску по коду приглашения. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** перемешивание: без rng — обычный Math.random (одиночная игра) */
function shuffle<T>(arr: T[], rng: RNG = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface SimResult {
  ok: boolean;
  assignment: Map<Pos, string>; // позиция -> defId
}

/**
 * Симуляция обратного решения: назначает пары плиток позициям,
 * каждый раз выбирая две СВОБОДНЫЕ позиции — так записанный
 * порядок разборов становится валидным решением.
 *
 * Юнит-«одиночка» (defIds.length === 1) занимает одну позицию:
 * его пара в этот момент лежит в лотке игрока, поэтому одиночку
 * можно снять, как только его позиция освободится.
 */
function simulate(
  positions: Pos[],
  pairPool: PairUnit[],
  rng: RNG = Math.random,
): SimResult {
  const live = new Set(positions.map((p) => key(p.x, p.y, p.z)));
  const posByKey = new Map<string, Pos>();
  for (const p of positions) posByKey.set(key(p.x, p.y, p.z), p);

  const assignment = new Map<Pos, string>();
  const units = [...pairPool];

  while (live.size > 0) {
    const free: Pos[] = [];
    for (const k of live) {
      const [x, y, z] = k.split(',').map(Number);
      if (
        !live.has(key(x, y, z + 1)) &&
        !(live.has(key(x - 2, y, z)) && live.has(key(x + 2, y, z)))
      ) {
        free.push(posByKey.get(k)!);
      }
    }
    const unit = units.pop();
    if (!unit) return { ok: false, assignment };
    const shuffledFree = shuffle(free, rng);
    if (unit.defIds.length >= 2) {
      if (free.length < 2) return { ok: false, assignment };
      const p1 = shuffledFree[0];
      const p2 = shuffledFree[1];
      assignment.set(p1, unit.defIds[0]);
      assignment.set(p2, unit.defIds[1]);
      live.delete(key(p1.x, p1.y, p1.z));
      live.delete(key(p2.x, p2.y, p2.z));
    } else {
      if (free.length < 1) return { ok: false, assignment };
      const p1 = shuffledFree[0];
      assignment.set(p1, unit.defIds[0]);
      live.delete(key(p1.x, p1.y, p1.z));
    }
  }
  return { ok: true, assignment };
}

/**
 * Генерация решаемой доски для расклада.
 * positions.length должно быть чётным и ≤ 144.
 *
 * Сложность: из нескольких решаемых вариантов выбирается тот, где
 * на старте меньше всего готовых пар — пары чаще спрятаны под другими
 * плитками, и лоток приходится использовать по назначению.
 *
 * rng: детерминированный ГПСЧ (mulberry32(seed)) для онлайн-комнат —
 * одинаковая доска у обоих игроков; без rng — Math.random.
 */
export function generateBoard(positions: Pos[], rng: RNG = Math.random): TileInstance[] {
  const neededPairs = positions.length / 2;
  let best: TileInstance[] | null = null;
  let bestMoves = Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {
    const units = shuffle(buildPairUnits(), rng).slice(0, neededPairs);
    const res = simulate(positions, units, rng);
    if (!res.ok) continue;
    const tiles = materialize(res.assignment);
    const moves = findAvailableMoves(tiles).length;
    if (moves < bestMoves) {
      bestMoves = moves;
      best = tiles;
      if (moves <= 1) break; // интереснее уже не бывает
    }
  }
  if (best) return best;
  // Практически недостижимо для наших раскладов — страховочный вариант
  throw new Error('Не удалось сгенерировать решаемую доску');
}

/**
 * Сколько плиток лежат рубашкой вверх (СВОБОДНЫХ, тапабельных):
 * 2 на маленькой доске, до 8 на большой. Сложность цикла
 * ограничена (1..5), поэтому число рубашек не растёт бесконечно.
 */
export function faceDownCountFor(tileCount: number): number {
  if (tileCount <= 40) return 2;
  if (tileCount <= 64) return 3;
  if (tileCount <= 96) return 4;
  if (tileCount <= 120) return 6;
  return 8;
}

/**
 * Сколько рубашек спрятано ПОД другими костями: они лежат лицом
 * вниз, пока верхняя кость не снята — как только сверху пусто,
 * рубашка сама переворачивается. Примерно половина от свободных.
 */
export function buriedFaceDownCountFor(tileCount: number): number {
  return Math.ceil(faceDownCountFor(tileCount) / 2);
}

/** равномерный шаг по списку — детерминирован самой доской */
function stridePick<T>(arr: T[], count: number): T[] {
  if (arr.length <= count) return [...arr];
  const picked: T[] = [];
  const stride = arr.length / count;
  for (let i = 0; i < count; i++) {
    // (i + 0.5): берём середины равных отрезков — ровнее распределение
    picked.push(arr[Math.floor(i * stride + stride / 2)]);
  }
  return picked;
}

/**
 * Выбрать плитки-рубашки. ДВЕ группы:
 *  — free: СВОБОДНЫЕ стартовые (тап — переворот-подглядывание);
 *  — buried: ЗАКРЫТЫЕ сверху другими костями — лежат лицом вниз,
 *    пока верхняя кость не снята; как только сверху пусто,
 *    рубашка сама переворачивается (авто-открытие).
 * Выбор детерминирован доской: равномерный шаг по отсортированным
 * спискам, чтобы рубашки не сгруживались в один угол. Решаемость
 * не меняется: под рубашкой лежит обычная плитка, порядок
 * разборов остаётся валидным.
 */
export function pickShirts(
  tiles: TileInstance[],
): { freeIds: number[]; buriedIds: number[] } {
  const free = freeTiles(tiles);
  const occupied = buildOccupancy(tiles);
  // закрытые сверху: на позиции (x, y, z+1) стоит живая кость.
  // Отсортированы по id — детерминизм от самой доски.
  const covered = tiles
    .filter((t) => occupied.has(`${t.x},${t.y},${t.z + 1}`))
    .sort((a, b) => a.id - b.id);

  const freeCount = Math.min(faceDownCountFor(tiles.length), free.length);
  const coveredCount = Math.min(
    buriedFaceDownCountFor(tiles.length),
    covered.length,
  );

  const freeIds = stridePick(
    [...free].sort((a, b) => a.id - b.id),
    freeCount,
  ).map((t) => t.id);
  const buriedIds = stridePick(covered, coveredCount).map((t) => t.id);

  return { freeIds, buriedIds };
}

/** прежнее имя (совместимость): все рубашки одним списком */
export function pickFaceDownTiles(tiles: TileInstance[]): number[] {
  const { freeIds, buriedIds } = pickShirts(tiles);
  return [...freeIds, ...buriedIds].sort((a, b) => a - b);
}

/**
 * Перемешивание оставшихся плиток: переставляем виды плиток
 * по оставшимся позициям так, что доска остаётся решаемой
 * (та же симуляция, но с уже имеющимся набором плиток).
 */
export function reshuffleRemaining(tiles: TileInstance[]): TileInstance[] {
  const remaining = tiles.filter((t) => !t.removed);
  if (remaining.length === 0) return tiles;

  // Группируем оставшиеся виды по matchKey, составляем пулы пар
  const byMatch = new Map<string, string[]>();
  for (const t of remaining) {
    const k = getTileDef(t.defId).matchKey;
    const arr = byMatch.get(k);
    if (arr) arr.push(t.defId);
    else byMatch.set(k, [t.defId]);
  }
  const pairPool: PairUnit[] = [];
  for (const [matchKey, defIds] of byMatch) {
    for (let i = 0; i + 1 < defIds.length; i += 2) {
      pairPool.push({ matchKey, defIds: [defIds[i], defIds[i + 1]] });
    }
    // нечётный остаток — «одиночка»: его пара лежит в лотке,
    // снимем его, как только позиция освободится
    if (defIds.length % 2 === 1) {
      pairPool.push({ matchKey, defIds: [defIds[defIds.length - 1]] });
    }
  }

  const positions: Pos[] = remaining.map((t) => ({ x: t.x, y: t.y, z: t.z }));

  for (let attempt = 0; attempt < 300; attempt++) {
    const units = shuffle(pairPool);
    const res = simulate(positions, units);
    if (res.ok) {
      const posToId = new Map<string, number>();
      for (const t of remaining) posToId.set(key(t.x, t.y, t.z), t.id);
      const newTiles = tiles.map((t) => ({ ...t }));
      for (const [pos, defId] of res.assignment.entries()) {
        const id = posToId.get(key(pos.x, pos.y, pos.z))!;
        newTiles.find((t) => t.id === id)!.defId = defId;
      }
      return newTiles;
    }
  }
  return tiles; // не смогли — оставляем как есть
}
