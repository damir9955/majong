/**
 * Портретные раскладки для вертикального экрана телефона:
 * выше, чем шире — плитки получаются крупнее. Сетка: плитка 2×2 юнита,
 * позиции на чётных координатах, z — уровень высоты.
 * Все раскладки симметричны и имеют чётное число плиток.
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
  for (const p of positions) {
    if (p.x % 2 !== 0 || p.y % 2 !== 0) {
      throw new Error(`Layout ${id} has off-grid position`);
    }
  }
  return { id, name, difficulty, positions };
}

/* ============ Уровень 1 (лёгкие, 36–40 плиток) ============ */

/** 1. Шпиль — 36: узкая башня 4×6 с макушкой */
const spire = makeLayout('spire', 'Шпиль', 1, [
  rect(-4, -6, 4, 6, 0),
  rect(-2, -4, 2, 4, 1),
  rect(-2, -2, 2, 2, 2),
]);

/** 2. Стела — 40: плита 4×8 с табличкой сверху */
const stele = makeLayout('stele', 'Стела', 1, [
  rect(-4, -8, 4, 8, 0),
  rect(-2, -4, 2, 4, 1),
]);

/* ============ Уровень 2 (62–64 плитки) ============ */

/** 3. Бабочка — 64: тело-колонна и четыре крыла */
const butterfly = makeLayout('butterfly', 'Бабочка', 2, [
  // тело
  rect(-2, -8, 2, 8, 0),
  // верхние и нижние крылья
  rect(-6, -8, 2, 3, 0),
  rect(4, -8, 2, 3, 0),
  rect(-6, 2, 2, 3, 0),
  rect(4, 2, 2, 3, 0),
  // второй ярус
  rect(-2, -6, 2, 6, 1),
  rect(-6, -6, 2, 2, 1),
  rect(4, -6, 2, 2, 1),
  // корона
  rect(-2, -4, 2, 2, 2),
]);

/** 4. Сердце — 64: ступенчатое сердце с внутренней вставкой */
const heart = makeLayout('heart', 'Сердце', 2, [
  // доли
  rect(-6, -12, 2, 1, 0),
  rect(2, -12, 2, 1, 0),
  rect(-6, -10, 2, 1, 0),
  rect(2, -10, 2, 1, 0),
  // расширение
  rect(-6, -8, 6, 1, 0),
  rect(-8, -6, 8, 1, 0),
  rect(-8, -4, 8, 1, 0),
  rect(-8, -2, 8, 1, 0),
  // сужение к острию
  rect(-6, 0, 6, 1, 0),
  rect(-6, 2, 6, 1, 0),
  rect(-4, 4, 4, 1, 0),
  rect(-2, 6, 2, 1, 0),
  // внутреннее сердце
  rect(-4, -4, 4, 2, 1),
]);

/* ============ Уровень 3 (84–96 плиток) ============ */

/** 5. Башня — 96: портретная башня с плечами и шпилем */
const tower = makeLayout('tower', 'Башня', 3, [
  rect(-6, -8, 6, 8, 0),
  rect(-4, -6, 4, 6, 1),
  rect(-6, -2, 1, 2, 1),
  rect(4, -2, 1, 2, 1),
  rect(-2, -6, 2, 6, 2),
  rect(-2, -4, 2, 4, 3),
]);

/** 6. Ромб — 84: ступенчатый алмаз с ядром */
const diamond = makeLayout('diamond', 'Ромб', 3, [
  rect(-2, -10, 2, 1, 0),
  rect(-4, -8, 4, 1, 0),
  rect(-6, -6, 6, 1, 0),
  rect(-8, -4, 8, 1, 0),
  rect(-8, -2, 8, 1, 0),
  rect(-8, 0, 8, 1, 0),
  rect(-6, 2, 6, 1, 0),
  rect(-4, 4, 4, 1, 0),
  rect(-2, 6, 2, 1, 0),
  // ядро
  rect(-4, -6, 4, 6, 1),
  rect(-2, -4, 2, 4, 2),
  rect(-2, -2, 2, 2, 3),
]);

/* ============ Уровень 4 (100–120 плиток) ============ */

/** 7. Замок — 120: зиккурат с бастионами */
const castle = makeLayout('castle', 'Замок', 4, [
  rect(-8, -8, 8, 8, 0),
  rect(-6, -6, 6, 4, 1),
  rect(-8, 2, 2, 3, 1),
  rect(4, 2, 2, 3, 1),
  rect(-4, -6, 4, 4, 2),
  rect(-2, -4, 2, 2, 3),
]);

/** 8. Пагода — 100: ярусы с крышами, сужается к вершине */
const pagoda = makeLayout('pagoda', 'Пагода', 4, [
  // ярусы (снизу вверх)
  rect(-8, 10, 8, 3, 0),
  rect(-6, 6, 6, 2, 0),
  rect(-6, 2, 6, 2, 0),
  rect(-4, -2, 4, 2, 0),
  rect(-4, -6, 4, 2, 0),
  rect(-2, -10, 2, 2, 0),
  // крыши
  rect(-6, 8, 6, 1, 1),
  rect(-6, 4, 6, 1, 1),
  rect(-4, 0, 4, 1, 1),
  rect(-4, -4, 4, 1, 1),
  rect(-2, -8, 2, 1, 1),
  // шпиль и маковки
  rect(-4, 2, 4, 1, 2),
  rect(-2, -6, 2, 2, 2),
  rect(-2, -4, 2, 1, 3),
]);

/* ============ Уровень 5 (классика, 144 плитки) ============ */

/** 9. Черепаха — 144: классическая плита 8×12 */
const turtle = makeLayout('turtle', 'Черепаха', 5, [
  rect(-8, -12, 8, 12, 0),
  rect(-6, -6, 6, 6, 1),
  rect(-4, -2, 4, 3, 2),
]);

/** 10. Крепость — 144: стена 8×10, донжон и угловые башни */
const fortress = makeLayout('fortress', 'Крепость', 5, [
  rect(-8, -10, 8, 10, 0),
  rect(-6, -8, 6, 6, 1),
  rect(-8, -12, 2, 2, 1),
  rect(4, -12, 2, 2, 1),
  rect(-4, -6, 4, 4, 2),
  rect(-2, -4, 2, 2, 3),
]);

export const LAYOUTS: BoardLayout[] = [
  spire,
  stele,
  butterfly,
  heart,
  tower,
  diamond,
  castle,
  pagoda,
  turtle,
  fortress,
];

/**
 * Детерминированный выбор схемы для уровня: внутри пятёрок уровней
 * идут пять разных сложностей, а следующая пятёрка берёт вторые
 * схемы тех же сложностей — 10 уровней подряд без повторов.
 * Перезапуск уровня даёт ту же доску.
 */
export function getLayoutForLevel(level: number): BoardLayout {
  const d = Math.min(5, Math.max(1, ((level - 1) % 5) + 1));
  const bucket = LAYOUTS.filter((l) => l.difficulty === d);
  if (bucket.length === 0) return LAYOUTS[0];
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
