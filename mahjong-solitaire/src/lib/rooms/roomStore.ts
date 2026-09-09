/**
 * Серверное хранилище комнат «игра с другом» (в памяти инстанса).
 *
 * Матч-модель — «параллельная гонка»: оба игрока собирают ОДНУ И ТУ ЖЕ
 * доску (одинаковый seed) каждый на своём устройстве. Клиент присылает
 * свой прогресс поллингом (GET), терминальные события — POST.
 *
 * ВАЖНО (Vercel): состояние живёт в памяти серверлесс-инстанса — при
 * низком трафике (двое друзей) запросы попадают в один тёплый инстанс
 * и комната живёт часами;Rooms старше TTL вычищаются лениво.
 */

import { getLayoutForLevel } from '@/lib/mahjong/layouts';
import type { RoomFinishReason, RoomView } from './types';

interface RoomPlayer {
  id: string;
  name: string;
  hue: number;
  score: number;
  pairsDone: number;
  lastSeen: number;
  finished: 'cleared' | 'tray' | null;
}

interface Room {
  code: string;
  level: number;
  seed: number;
  status: 'waiting' | 'playing' | 'result';
  hostId: string;
  players: RoomPlayer[];
  /** epoch-ms старта отсчёта времени (с запасом на интро) */
  startedAt: number;
  timeTotalMs: number;
  result: { winnerId: string; reason: RoomFinishReason; at: number } | null;
  createdAt: number;
}

/* ---------- константы (синхронизированы с режимом «1 на 1») ---------- */

/** запас на интро-карточку и отсчёт 3-2-1 у обоих игроков */
const INTRO_BUDGET_MS = 8000;
/** «в сети»: поллинг жив */
const PRESENCE_MS = 12000;
/** так долго нет ответа игрока → победа соперника по отключению */
const ONLINE_GRACE_MS = 90000;
/** время на пару — как в матче против бота */
const TIME_PER_PAIR_MS = 4500;
const TIME_MIN_MS = 90000;
const TIME_MAX_MS = 270000;
/** комнаты живут 6 часов, «ожидание друга» — час */
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const WAITING_TTL_MS = 60 * 60 * 1000;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без I O 0 1
const CODE_LEN = 5;

/* ---------- хранилище (переживает dev-перекомпиляцию) ---------- */

type RoomMap = Map<string, Room>;
const g = globalThis as { __mjRooms?: RoomMap };
const rooms: RoomMap = g.__mjRooms ?? new Map<string, Room>();
g.__mjRooms = rooms;

/* ---------- helpers ---------- */

const rndId = () =>
  Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');

const rndHue = () => Math.floor(Math.random() * 360);

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

const now = () => Date.now();

function timeForLevel(level: number): number {
  const pairs = getLayoutForLevel(level).positions.length / 2;
  return clamp(pairs * TIME_PER_PAIR_MS, TIME_MIN_MS, TIME_MAX_MS);
}

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  const cut = [...s].slice(0, 16).join('');
  return cut.length > 0 ? cut : 'Игрок';
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return c.length === CODE_LEN && [...c].every((ch) => CODE_CHARS.includes(ch))
    ? c
    : null;
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function view(room: Room): RoomView {
  const t = now();
  return {
    code: room.code,
    status: room.status,
    level: room.level,
    seed: room.seed,
    hostId: room.hostId,
    timeTotalMs: room.timeTotalMs,
    startedAt: room.startedAt,
    serverNow: t,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      hue: p.hue,
      score: Math.round(p.score),
      pairsDone: p.pairsDone,
      online: t - p.lastSeen < PRESENCE_MS,
      finished: p.finished,
    })),
    result: room.result
      ? { winnerId: room.result.winnerId, reason: room.result.reason }
      : null,
  };
}

function cleanup() {
  const t = now();
  for (const [code, r] of rooms) {
    if (t - r.createdAt > ROOM_TTL_MS) rooms.delete(code);
    else if (r.status === 'waiting' && t - r.createdAt > WAITING_TTL_MS)
      rooms.delete(code);
  }
}

function findPlayer(room: Room, playerId: string): RoomPlayer | undefined {
  return room.players.find((p) => p.id === playerId);
}

function finishRoom(room: Room, winnerId: string, reason: RoomFinishReason) {
  if (room.status !== 'playing') return;
  room.status = 'result';
  room.result = { winnerId, reason, at: now() };
}

/** авто-исходы: тайм-аут и длительное отключение */
function checkAutoFinish(room: Room) {
  if (room.status !== 'playing') return;
  const t = now();
  for (const p of room.players) {
    const other = room.players.find((x) => x.id !== p.id);
    if (other && t - p.lastSeen > ONLINE_GRACE_MS) {
      finishRoom(room, other.id, 'disconnect');
      return;
    }
  }
  if (t > room.startedAt + room.timeTotalMs) {
    const [a, b] = room.players;
    if (!a || !b) return;
    let winnerId: string;
    if (a.pairsDone !== b.pairsDone)
      winnerId = a.pairsDone > b.pairsDone ? a.id : b.id;
    else winnerId = a.score >= b.score ? a.id : b.id;
    finishRoom(room, winnerId, 'timeout');
  }
}

/* ---------- операции ---------- */

export function createRoom(
  nameRaw: unknown,
  levelRaw: unknown,
): { room: Room } {
  cleanup();
  const name = sanitizeName(nameRaw);
  const level = clamp(Math.floor(Number(levelRaw) || 1), 1, 999);
  let code = '';
  do {
    code = Array.from(
      { length: CODE_LEN },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join('');
  } while (rooms.has(code));
  const host: RoomPlayer = {
    id: rndId(),
    name,
    hue: rndHue(),
    score: 0,
    pairsDone: 0,
    lastSeen: now(),
    finished: null,
  };
  const room: Room = {
    code,
    level,
    seed: newSeed(),
    status: 'waiting',
    hostId: host.id,
    players: [host],
    startedAt: 0,
    timeTotalMs: timeForLevel(level),
    result: null,
    createdAt: now(),
  };
  rooms.set(code, room);
  return { room };
}

export function joinRoom(
  codeRaw: string,
  nameRaw: unknown,
): { room: Room } | { error: 'not_found' | 'full' } {
  cleanup();
  const room = rooms.get(codeRaw);
  if (!room) return { error: 'not_found' };
  if (room.status !== 'waiting' || room.players.length >= 2)
    return { error: 'full' };
  const p: RoomPlayer = {
    id: rndId(),
    name: sanitizeName(nameRaw),
    hue: rndHue(),
    score: 0,
    pairsDone: 0,
    lastSeen: now(),
    finished: null,
  };
  room.players.push(p);
  room.status = 'playing';
  room.startedAt = now() + INTRO_BUDGET_MS;
  return { room };
}

/** поллинг состояния: присутствие + прогресс + авто-исходы */
export function pollRoom(
  codeRaw: string,
  playerId: unknown,
  progress?: { score?: unknown; pairsDone?: unknown },
): RoomView | null {
  cleanup();
  const room = rooms.get(codeRaw);
  if (!room) return null;
  const p =
    typeof playerId === 'string' ? findPlayer(room, playerId) : undefined;
  if (p) {
    p.lastSeen = now();
    if (room.status === 'playing') {
      const score = Number(progress?.score);
      const pairs = Number(progress?.pairsDone);
      if (Number.isFinite(score)) p.score = clamp(score, 0, 10_000_000);
      if (Number.isFinite(pairs))
        p.pairsDone = clamp(Math.floor(pairs), 0, 1000);
    }
  }
  checkAutoFinish(room);
  return view(room);
}

/** терминальное событие игрока: собрал доску / переполнил лоток */
export function reportFinish(
  codeRaw: string,
  playerId: unknown,
  reason: unknown,
): RoomView | null {
  const room = rooms.get(codeRaw);
  if (!room) return null;
  const p = typeof playerId === 'string' ? findPlayer(room, playerId) : undefined;
  if (!p) return view(room);
  p.lastSeen = now();
  const why = reason === 'cleared' ? 'cleared' : 'tray';
  p.finished = why;
  if (room.status === 'playing') {
    if (why === 'cleared') finishRoom(room, p.id, 'cleared');
    else {
      const other = room.players.find((x) => x.id !== p.id);
      if (other) finishRoom(room, other.id, 'tray');
    }
  }
  return view(room);
}

/** следующий уровень («Дальше») или повтор того же («Реванш») */
export function advanceRoom(
  codeRaw: string,
  kind: 'next' | 'rematch',
): { room: Room } | { error: 'not_found' | 'not_now' | 'empty' } {
  const room = rooms.get(codeRaw);
  if (!room) return { error: 'not_found' };
  if (room.status !== 'result') return { error: 'not_now' };
  if (room.players.length < 2) return { error: 'empty' };
  if (kind === 'next') room.level = clamp(room.level + 1, 1, 999);
  room.seed = newSeed();
  room.result = null;
  room.startedAt = now() + INTRO_BUDGET_MS;
  room.timeTotalMs = timeForLevel(room.level);
  for (const p of room.players) {
    p.score = 0;
    p.pairsDone = 0;
    p.finished = null;
    p.lastSeen = now();
  }
  room.status = 'playing';
  return { room };
}

/** выход игрока: комната без игроков удаляется, оставшийся побеждает */
export function leaveRoom(
  codeRaw: string,
  playerId: unknown,
): { ok: true } | { error: 'not_found' } {
  const room = rooms.get(codeRaw);
  if (!room) return { error: 'not_found' };
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.players.length === 0) {
    rooms.delete(codeRaw);
    return { ok: true };
  }
  if (room.status === 'playing') finishRoom(room, room.players[0].id, 'left');
  else if (room.status === 'waiting') rooms.delete(room.code);
  return { ok: true };
}

export function roomView(room: Room): RoomView {
  return view(room);
}

export function hostIdOf(room: Room): string {
  return room.hostId;
}

/** тесты: прямой доступ */
export function __roomsForTest(): RoomMap {
  return rooms;
}
