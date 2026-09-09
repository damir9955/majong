/**
 * Портретные раскладки для вертикального экрана телефона:
 * выше, чем шире — плитки получаются крупнее. Сетка: плитка 2×2 юнита,
 * позиции на чётных координатах, z — уровень высоты.
 * Все раскладки симметричны и имеют чётное число плиток.
 *
 * КОМПАКТНАЯ СЕТКА: не шире ШЕСТИ и не выше ВОСЬМИ плиток — на
 * телефоне кости остаются крупными даже на больших уровнях.
 * Сложность растёт до 80 плиток максимум: «много-много костей»
 * (100–144) больше не появляется — уровни остаются обозримыми.
 *
 * В каждом уровне сложности по ДВЕ разных схемы — от уровня к уровню
 * чередуются, чтобы доски не повторялись.
 */

export interface Pos {
  x: number;
  y: number;
  z: number;
}

export interface BoardLayout {
  id: string;
  name: string;
  /** Порядок сложности 1..5 */
  difficulty: number;
  positions: Pos[];
}

/** лимиты сетки (в плитках) — для тестов и авто-масштаба */
export const GRID_MAX_W = 6;
export const GRID_MAX_H = 8;
/** максимальное число плиток на доске */
export const MAX_TILES = 80;

/** Прямоугольник из плиток: x0,y0 — чётные, w,h — число плиток */
function rect(x0: number, y0: number, w: number, h: number, z: number): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      out.push({ x: x0 + i * 2, y: y0 + j * 2, z });
    }
  }
  return out;
}

function dedupe(positions: Pos[]): Pos[] {
  const seen = new Set<string>();
  const out: Pos[] = [];
  for (const p of positions) {
    const key = `${p.x},${p.y},${p.z}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function makeLayout(
  id: string,
  name: string,
  difficulty: number,
  parts: Pos[][],
): BoardLayout {
  const positions = dedupe(parts.flat());
  if (positions.length % 2 !== 0) {
    throw new Error(`Layout ${id} has odd tile count ${positions.length}`);
  }
  if (positions.length > MAX_TILES) {
    throw new Error(`Layout ${id} has too many tiles ${positions.length}`);
  }
  for (const p of positions) {
    if (p.x % 2 !== 0 || p.y % 2 !== 0) {
      throw new Error(`Layout ${id} has off-grid position`);
    }
  }
  const b = layoutBounds(positions);
  if ((b.maxX - b.minX) / 2 > GRID_MAX_W) {
    throw new Error(`Layout ${id} wider than ${GRID_MAX_W}`);
  }
  if ((b.maxY - b.minY) / 2 > GRID_MAX_H) {
    throw new Error(`Layout ${id} taller than ${GRID_MAX_H}`);
  }
  return { id, name, difficulty, positions };
}

/* ============ Уровень 1 (лёгкие, 28–36 плиток) ============ */

/** 1. Шпиль — 28: узкая башня 4×6 с макушкой (кости крупные) */
const spire = makeLayout('spire', 'Шпиль', 1, [
  rect(-4, -6, 4, 6, 0),
  rect(-2, -2, 2, 2, 1),
]);

/** 2. Стела — 36: плита 4×8 с табличкой сверху */
const stele = makeLayout('stele', 'Стела', 1, [
  rect(-4, -8, 4, 8, 0),
  rect(-2, -4, 2, 2, 1),
]);

/* ============ Уровень 2 (40–42 плитки) ============ */

/** 3. Ворота — 40: два столба и перекладина сверху */
const gate = makeLayout('gate', 'Ворота', 2, [
  rect(-6, -8, 2, 8, 0),
  rect(2, -8, 2, 8, 0),
  rect(-4, -8, 4, 2, 1),
]);

/** 4. Ступени — 42: плита 5×6 со вторым ярусом-лесенкой */
const stairs = makeLayout('stairs', 'Ступени', 2, [
  rect(-4, -6, 5, 6, 0),
  rect(-2, -4, 3, 4, 1),
]);

/* ============ Уровень 3 (44–52 плитки) ============ */

/** 5. Крест — 44: перекладины и ядро в центре */
const cross = makeLayout('cross', 'Крест', 3, [
  rect(-2, -8, 2, 8, 0),
  rect(-6, -4, 6, 4, 0),
  rect(-2, -4, 2, 4, 1),
  rect(-2, -2, 2, 2, 2),
]);

/** 6. Пирамида — 52: свадебный торт 6×6 с ярусом */
const pyramid = makeLayout('pyramid', 'Пирамида', 3, [
  rect(-6, -6, 6, 6, 0),
  rect(-4, -4, 4, 4, 1),
]);

/* ============ Уровень 4 (60–64 плитки) ============ */

/** 7. Бастион — 64: плита 6×8, вал сверху и донжон в центре */
const bastion = makeLayout('bastion', 'Бастион', 4, [
  rect(-6, -8, 6, 8, 0),
  rect(-6, -8, 6, 2, 1),
  rect(-2, -2, 2, 2, 1),
]);

/** 8. Дворец — 64: плита 6×8 с внутренним блоком */
const palace = makeLayout('palace', 'Дворец', 4, [
  rect(-6, -8, 6, 8, 0),
  rect(-4, -6, 4, 4, 1),
]);

/* ============ Уровень 5 (максимум, 72–80 плиток) ============ */

/** 9. Корона — 72: плита 6×8 и высокий второй ярус */
const crown = makeLayout('crown', 'Корона', 5, [
  rect(-6, -8, 6, 8, 0),
  rect(-4, -6, 4, 6, 1),
]);

/** 10. Крепость — 80: стена 6×8, донжон и башенка — потолок сложности */
const fortress = makeLayout('fortress', 'Крепость', 5, [
  rect(-6, -8, 6, 8, 0),
  rect(-4, -6, 4, 6, 1),
  rect(-2, -4, 2, 4, 2),
]);

export const LAYOUTS: BoardLayout[] = [
  spire,
  stele,
  gate,
  stairs,
  cross,
  pyramid,
  bastion,
  palace,
  crown,
  fortress,
];

/** Ландшафтная версия расклада: координаты x↔y — фигура «ложится на бок».
 *  Чётность и симметрия сохраняются, число плиток то же. */
function rotateForLandscape(l: BoardLayout): BoardLayout {
  return {
    id: `${l.id}-ls`,
    name: l.name,
    difficulty: l.difficulty,
    positions: l.positions.map((p) => ({ x: p.y, y: p.x, z: p.z })),
  };
}

/** ландшафтные варианты (по одному на каждую схему) */
const LAYOUTS_LANDSCAPE: BoardLayout[] = LAYOUTS.map(rotateForLandscape);

/**
 * Детерминированный выбор схемы для уровня: внутри пятёрок уровней
 * идут пять разных сложностей, а следующая пятёрка берёт вторые
 * схемы тех же сложностей — 10 уровней подряд без повторов.
 * Уровни БЕСКОНЕЧНЫ, но сложность зациклена на 1..5 и никогда
 * не растёт дальше — как и число плиток (максимум 144).
 * Перезапуск уровня даёт ту же доску.
 *
 * landscape: true — повёрнутая версия той же схемы (для планшета
 * в альбомной ориентации, чтобы плитки оставались крупными).
 */
export function getLayoutForLevel(level: number, landscape = false): BoardLayout {
  const d = Math.min(5, Math.max(1, ((level - 1) % 5) + 1));
  const pool = landscape ? LAYOUTS_LANDSCAPE : LAYOUTS;
  const bucket = pool.filter((l) => l.difficulty === d);
  if (bucket.length === 0) return pool[0];
  const cycle = Math.floor((level - 1) / 5);
  return bucket[cycle % bucket.length];
}

export function layoutBounds(positions: Pos[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    maxZ = 0;
  for (const p of positions) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + 2);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y + 2);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minY, maxY, maxZ };
}
