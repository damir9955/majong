/**
 * Лиги, соперники и параметры бота — как в Vita Mahjong:
 * каждый матч 1v1 против «игрока» (бота) с именем, аватаром
 * и лигой; сила растёт вместе с лигой игрока.
 */

export interface League {
  name: string;
  /** порог очков (трофеев) для входа в лигу */
  min: number;
  color: string;
}

export const LEAGUES: League[] = [
  { name: 'Бронза', min: 0, color: '#b08d57' },
  { name: 'Серебро', min: 100, color: '#c3c9d4' },
  { name: 'Золото', min: 250, color: '#e6b84a' },
  { name: 'Платина', min: 500, color: '#7fd4c1' },
  { name: 'Алмаз', min: 900, color: '#7cb8ff' },
  { name: 'Мастер', min: 1500, color: '#c77dff' },
  { name: 'Легенда', min: 2500, color: '#ff8a5c' },
];

export function leagueIndexForPoints(points: number): number {
  let idx = 0;
  for (let i = 0; i < LEAGUES.length; i++) {
    if (points >= LEAGUES[i].min) idx = i;
  }
  return idx;
}

/** прогресс к следующей лиге: 0..1 (в последней лиге — 1) */
export function leagueProgress(points: number): number {
  const idx = leagueIndexForPoints(points);
  if (idx >= LEAGUES.length - 1) return 1;
  const cur = LEAGUES[idx].min;
  const next = LEAGUES[idx + 1].min;
  return Math.min(1, Math.max(0, (points - cur) / (next - cur)));
}

export interface Opponent {
  /** имя «игрока» */
  name: string;
  /** цвет аватара (hue) */
  hue: number;
  /** лига соперника (индекс) */
  leagueIndex: number;
  /** во сколько раз бот медленнее лимита времени (1.15 — заметно медленнее) */
  speedFactor: number;
  /** 0..1 — как часто бот «разгоняется» комбо-сериями */
  skill: number;
}

const NAMES = [
  'Мария', 'Ханс', 'Ли Вэй', 'Ахмед', 'Ольга', 'Джованни', 'Анна', 'Кэндзи',
  'Ингрид', 'Пабло', 'София', 'Дмитрий', 'Мэй', 'Юсуф', 'Эмма', 'Радж',
  'Клара', 'Хуго', 'Нина', 'Виктор', 'Тереза', 'Омар', 'Грета', 'Лукас',
  'Хлоя', 'Арина', 'Мартин', 'Юки', 'Даниэль', 'Ева',
];
const INITIALS = ['', '', '', ' К.', ' В.', ' М.', ' Л.', ' П.'];

/** сила бота по лиге: скорость (доля лимита времени) и сноровка */
const STRENGTH = [
  { speedFactor: 1.18, skill: 0.3 }, // Бронза
  { speedFactor: 1.06, skill: 0.4 }, // Серебро
  { speedFactor: 0.97, skill: 0.5 }, // Золото
  { speedFactor: 0.9, skill: 0.6 }, // Платина
  { speedFactor: 0.83, skill: 0.7 }, // Алмаз
  { speedFactor: 0.76, skill: 0.8 }, // Мастер
  { speedFactor: 0.68, skill: 0.9 }, // Легенда
];

/** Соперник из соседней лиги (±1) — как матчмейкинг в Vita */
export function makeOpponent(playerLeagueIndex: number): Opponent {
  const drift = Math.random() < 0.55 ? 0 : Math.random() < 0.5 ? -1 : 1;
  const leagueIndex = Math.min(
    LEAGUES.length - 1,
    Math.max(0, playerLeagueIndex + drift),
  );
  const st = STRENGTH[leagueIndex];
  const name =
    NAMES[Math.floor(Math.random() * NAMES.length)] +
    INITIALS[Math.floor(Math.random() * INITIALS.length)];
  return {
    name,
    hue: Math.floor(Math.random() * 360),
    leagueIndex,
    speedFactor: st.speedFactor * (0.97 + Math.random() * 0.06),
    skill: st.skill,
  };
}
