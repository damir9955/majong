/**
 * Классический набор плиток маджонга + метаданные для отрисовки.
 *
 * ЗНАКИ: снизу больше НЕТ красного «萬» (знак мешал различать кости) —
 * на грани только сама цифра. Плитки-«полоски» 一二三 возвращены:
 * одна/две/три горизонтальные черты различаются мгновенно.
 * Четвёрка 四 не возвращалась: её легко перепутать с ветром 西.
 * Всего 41 вид → 82 пары одинаковых картинок (доске нужно ≤ 40).
 */

export type Suit =
  | 'bamboo'
  | 'dots'
  | 'chars'
  | 'wind'
  | 'dragon'
  | 'flower'
  | 'season';

export interface TileDef {
  /** Уникальный идентификатор вида плитки, напр. "bam-5" */
  id: string;
  /** Ключ сопоставления: плитки совпадают, если совпадает ключ.
   *  Цветы (flower) и сезоны (season) совпадают внутри своей группы. */
  matchKey: string;
  suit: Suit;
  /** Номинал 1..9 (масти), 1..4 (ветры/цветы/сезоны), 1..3 (драконы) */
  value: number;
  /** Русское название для доступности */
  name: string;
}

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const RU_NUM = ['один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
/** знаки: только сильно отличающиеся иероглифы (см. шапку файла) */
const CHAR_VALUES = [1, 2, 3, 5, 6, 7, 8, 9];

const WINDS: { char: string; value: number; name: string }[] = [
  { char: '东', value: 1, name: 'Восточный ветер' },
  { char: '南', value: 2, name: 'Южный ветер' },
  { char: '西', value: 3, name: 'Западный ветер' },
  { char: '北', value: 4, name: 'Северный ветер' },
];

const DRAGONS: { char: string | null; value: number; name: string; color: string }[] = [
  { char: '中', value: 1, name: 'Красный дракон', color: '#b3382c' },
  { char: '发', value: 2, name: 'Зелёный дракон', color: '#2f7d4f' },
  { char: null, value: 3, name: 'Белый дракон', color: '#2f5d8a' },
];

const FLOWERS: { char: string; value: number; name: string; color: string }[] = [
  { char: '梅', value: 1, name: 'Цветок: слива', color: '#c2486b' },
  { char: '蘭', value: 2, name: 'Цветок: орхидея', color: '#2f7d4f' },
  { char: '菊', value: 3, name: 'Цветок: хризантема', color: '#c07f2a' },
  { char: '竹', value: 4, name: 'Цветок: бамбук', color: '#3a8f5f' },
];

const SEASONS: { char: string; value: number; name: string; color: string }[] = [
  { char: '春', value: 1, name: 'Сезон: весна', color: '#4c9a2f' },
  { char: '夏', value: 2, name: 'Сезон: лето', color: '#c05a2a' },
  { char: '秋', value: 3, name: 'Сезон: осень', color: '#b8860b' },
  { char: '冬', value: 4, name: 'Сезон: зима', color: '#4a6f9a' },
];

function buildDefs(): TileDef[] {
  const defs: TileDef[] = [];
  for (let v = 1; v <= 9; v++) {
    defs.push({
      id: `bam-${v}`,
      matchKey: `bam-${v}`,
      suit: 'bamboo',
      value: v,
      name: `Бамбук ${RU_NUM[v - 1]}`,
    });
  }
  for (let v = 1; v <= 9; v++) {
    defs.push({
      id: `dot-${v}`,
      matchKey: `dot-${v}`,
      suit: 'dots',
      value: v,
      name: `Кружки ${RU_NUM[v - 1]}`,
    });
  }
  for (const v of CHAR_VALUES) {
    defs.push({
      id: `chr-${v}`,
      matchKey: `chr-${v}`,
      suit: 'chars',
      value: v,
      name: `Знаки ${RU_NUM[v - 1]}`,
    });
  }
  for (const w of WINDS) {
    defs.push({
      id: `wind-${w.value}`,
      matchKey: `wind-${w.value}`,
      suit: 'wind',
      value: w.value,
      name: w.name,
    });
  }
  for (const d of DRAGONS) {
    defs.push({
      id: `drg-${d.value}`,
      matchKey: `drg-${d.value}`,
      suit: 'dragon',
      value: d.value,
      name: d.name,
    });
  }
  for (const f of FLOWERS) {
    defs.push({
      id: `flower-${f.value}`,
      // как в популярных играх: совпадают только ОДИНАКОВЫЕ картинки
      matchKey: `flower-${f.value}`,
      suit: 'flower',
      value: f.value,
      name: f.name,
    });
  }
  for (const s of SEASONS) {
    defs.push({
      id: `season-${s.value}`,
      matchKey: `season-${s.value}`,
      suit: 'season',
      value: s.value,
      name: s.name,
    });
  }
  return defs;
}

/** Все 41 вид плиток */
export const TILE_DEFS: TileDef[] = buildDefs();

export const TILE_DEF_MAP: Record<string, TileDef> = Object.fromEntries(
  TILE_DEFS.map((d) => [d.id, d]),
);

export function getTileDef(defId: string): TileDef {
  return TILE_DEF_MAP[defId];
}

/** Пара плиток для генерации колоды (обе плитки совпадают по matchKey).
 *  defIds может содержать и одну плитку — «одиночку», чья пара
 *  лежит в лотке (используется при перемешивании). */
export interface PairUnit {
  matchKey: string;
  defIds: string[];
}

/**
 * Полная колода как 82 «пары»: каждый из 41 вида плиток имеет
 * 4 физические копии → 2 пары одинаковых картинок (82 пары = 164 места,
 * доска максимум 80 плиток — пар всегда с запасом). Совпадают только
 * ОДИНАКОВЫЕ картинки — как в популярных играх из Play Market.
 */
export function buildPairUnits(): PairUnit[] {
  const units: PairUnit[] = [];
  const byKey: Record<string, TileDef[]> = {};
  for (const d of TILE_DEFS) {
    (byKey[d.matchKey] ??= []).push(d);
  }
  for (const defs of Object.values(byKey)) {
    if (defs.length === 1) {
      // Обычный вид: 4 физические копии одной и той же плитки → 2 пары
      const id = defs[0].id;
      units.push({ matchKey: defs[0].matchKey, defIds: [id, id] });
      units.push({ matchKey: defs[0].matchKey, defIds: [id, id] });
    } else {
      // Цветы/сезоны: 4 разных вида в одной группе сопоставления
      for (let i = 0; i + 1 < defs.length; i += 2) {
        units.push({
          matchKey: defs[i].matchKey,
          defIds: [defs[i].id, defs[i + 1].id],
        });
      }
    }
  }
  return units;
}

export const CN_CHARS = {
  num: CN_NUM,
  winds: WINDS,
  dragons: DRAGONS,
  flowers: FLOWERS,
  seasons: SEASONS,
};
