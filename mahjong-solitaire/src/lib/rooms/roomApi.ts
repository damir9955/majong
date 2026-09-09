/**
 * Клиентский транспорт комнат «игра с другом» и матчмейкинга.
 * Креды комнаты (код + playerId + снимок для восстановления) хранятся
 * в localStorage — перезагрузка страницы не выкидывает игрока из матча,
 * а «sync» может пересоздать комнату на сервере из снимка.
 */

import { RoomError, type RoomView } from './types';

const CREDS_KEY = 'mahjong-room';
const NAME_KEY = 'mahjong-name';
const TICKET_KEY = 'mahjong-match-ticket';

export interface RoomCreds {
  code: string;
  playerId: string;
  /** я создатель комнаты (может пересоздать её через sync) */
  host?: boolean;
  /** сид и уровень — снимок для восстановления комнаты */
  seed?: number;
  level?: number;
  /** имя игрока (для sync-восстановления) */
  name?: string;
}

/** полный снимок комнаты для sync: у клиента есть вся картина */
export interface RoomSnapshot {
  code: string;
  playerId: string;
  name: string;
  level: number;
  seed: number;
  hostId: string;
  status: 'waiting' | 'playing' | 'result';
  timeLeftMs: number;
  score?: number;
  pairsDone?: number;
  players: { id: string; name: string; hue: number; score: number; pairsDone: number }[];
}

export function getSavedCreds(): RoomCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as {
      code?: unknown;
      playerId?: unknown;
      host?: unknown;
      seed?: unknown;
      level?: unknown;
      name?: unknown;
    };
    if (
      typeof c.code === 'string' &&
      c.code.length === 5 &&
      typeof c.playerId === 'string' &&
      c.playerId.length > 0
    ) {
      return {
        code: c.code,
        playerId: c.playerId,
        host: c.host === true,
        seed: typeof c.seed === 'number' ? c.seed : undefined,
        level: typeof c.level === 'number' ? c.level : undefined,
        name: typeof c.name === 'string' ? c.name : undefined,
      };
    }
  } catch {
    // битый стор — считаем, что комнаты нет
  }
  return null;
}

export function saveCreds(creds: RoomCreds) {
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  } catch {
    // приватный режим — игра без сохранения комнаты
  }
}

export function clearCreds() {
  try {
    localStorage.removeItem(CREDS_KEY);
  } catch {
    // ignore
  }
}

/** имя игрока (запоминается после первого ввода) */
export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

/** тикет матчмейкинга живёт между перезагрузками (пока ждём соперника) */
export function getSavedTicket(): string {
  try {
    return localStorage.getItem(TICKET_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveTicket(id: string) {
  try {
    localStorage.setItem(TICKET_KEY, id);
  } catch {
    // ignore
  }
}

export function clearTicket() {
  try {
    localStorage.removeItem(TICKET_KEY);
  } catch {
    // ignore
  }
}

/* ---------- транспорт ---------- */

async function request(
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new RoomError('NETWORK', 'Нет связи с сервером');
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // пустой ответ упадёт ниже как NETWORK
  }
  if (!res.ok) {
    const e = typeof data.error === 'string' ? data.error : '';
    if (e === 'ROOM_NOT_FOUND')
      throw new RoomError('ROOM_NOT_FOUND', 'Комната не найдена');
    if (e === 'ROOM_FULL')
      throw new RoomError('ROOM_FULL', 'Комната уже занята');
    if (e === 'ROOM_EMPTY')
      throw new RoomError('ROOM_EMPTY', 'Друг вышел из комнаты');
    if (e === 'NOT_YET') throw new RoomError('NOT_YET', 'Ещё не началось');
    if (e === 'BAD_CODE') throw new RoomError('BAD_CODE', 'Неверный код');
    throw new RoomError('NETWORK', 'Сервер недоступен');
  }
  return data;
}

function toView(data: Record<string, unknown>): RoomView {
  const view = data.view ?? data;
  if (
    !view ||
    typeof (view as Record<string, unknown>).code !== 'string'
  ) {
    throw new RoomError('NETWORK', 'Некорректный ответ сервера');
  }
  return view as unknown as RoomView;
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/** создать комнату (хост) */
export async function apiCreateRoom(
  name: string,
  level: number,
): Promise<{ playerId: string; view: RoomView }> {
  const data = await request('/api/rooms', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, level }),
  });
  const playerId = typeof data.playerId === 'string' ? data.playerId : '';
  if (!playerId) throw new RoomError('NETWORK', 'Некорректный ответ сервера');
  return { playerId, view: toView(data) };
}

/** войти в комнату по коду (друг) */
export async function apiJoinRoom(
  code: string,
  name: string,
): Promise<{ playerId: string; view: RoomView }> {
  const data = await request(`/api/rooms/${code}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'join', name }),
  });
  const playerId = typeof data.playerId === 'string' ? data.playerId : '';
  if (!playerId) throw new RoomError('NETWORK', 'Некорректный ответ сервера');
  return { playerId, view: toView(data) };
}

/** поллинг состояния + «попутный» отчёт своего прогресса */
export async function apiPollRoom(
  code: string,
  playerId: string,
  progress?: { score?: number; pairsDone?: number },
): Promise<RoomView> {
  const q = new URLSearchParams({ playerId });
  if (progress?.score != null) q.set('score', String(Math.round(progress.score)));
  if (progress?.pairsDone != null)
    q.set('pairsDone', String(Math.round(progress.pairsDone)));
  const data = await request(`/api/rooms/${code}?${q.toString()}`, {
    cache: 'no-store',
  });
  return toView(data);
}

/** пересоздать/оживить комнату из снимка (самовосстановление) */
export async function apiSyncRoom(snap: RoomSnapshot): Promise<RoomView> {
  const data = await request(`/api/rooms/${snap.code}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      action: 'sync',
      playerId: snap.playerId,
      name: snap.name,
      level: snap.level,
      seed: snap.seed,
      hostId: snap.hostId,
      status: snap.status,
      timeLeftMs: Math.round(snap.timeLeftMs),
      score: snap.score,
      pairsDone: snap.pairsDone,
      players: snap.players,
    }),
  });
  return toView(data);
}

/** терминальное событие: собрал доску / переполнил лоток */
export async function apiReportFinish(
  code: string,
  playerId: string,
  reason: 'cleared' | 'tray',
  score: number,
  pairsDone: number,
): Promise<RoomView | null> {
  const data = await request(`/api/rooms/${code}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      action: 'finish',
      playerId,
      reason,
      score: Math.round(score),
      pairsDone: Math.round(pairsDone),
    }),
  });
  return data.view ? toView(data) : null;
}

/** следующий уровень («Дальше») или повтор («Реванш») */
export async function apiAdvance(
  code: string,
  playerId: string,
  kind: 'next' | 'rematch',
): Promise<RoomView | null> {
  const data = await request(`/api/rooms/${code}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: kind, playerId }),
  });
  return data.view ? toView(data) : null;
}

/** выйти из комнаты */
export async function apiLeave(code: string, playerId: string) {
  await request(`/api/rooms/${code}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'leave', playerId }),
  });
}

/* ---------- матчмейкинг «быстрый матч» ---------- */

export interface MatchStatus {
  status: 'search' | 'paired';
  ticketId?: string;
  code?: string;
  playerId?: string;
  view?: RoomView;
}

/** встать в очередь быстрого матча (идемпотентно по ticketId) */
export async function apiMatchJoin(
  name: string,
  level: number,
  ticketId?: string,
): Promise<MatchStatus> {
  const data = await request('/api/rooms', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'match', name, level, ticketId }),
  });
  return data as unknown as MatchStatus;
}

/** статус подбора (поллинг ~1/сек) */
export async function apiMatchPoll(ticketId: string): Promise<MatchStatus> {
  const data = await request(`/api/rooms?match=${encodeURIComponent(ticketId)}`, {
    cache: 'no-store',
  });
  return data as unknown as MatchStatus;
}

/** выйти из очереди */
export async function apiMatchLeave(ticketId: string) {
  await request('/api/rooms', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'match-leave', ticketId }),
  });
}
