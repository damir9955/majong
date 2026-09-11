/**
 * Клиентский API комнат «1 на 1» — тонкий фасад над WebSocket-
 * транспортом (net.ts → Deno Deploy сервер).
 *
 * ЧТО ИЗМЕНИЛОСЬ (было: HTTP-поллинг /api/rooms на Vercel):
 *  — один WebSocket на устройство: сервер сам ПУШИТ изменения
 *    (ход соперника, итог, присутствие) — поллинга больше нет;
 *  — события матча: собрал пару → короткое {tile1Id, tile2Id}
 *    на сервер, он пересылает сопернику;
 *  — ВРЕМЯ АВТОРИТАРНОЕ: финальное время считает сервер;
 *  — реконнект: обрыв связи не рвёт матч (uid устройства).
 *
 * Креды (код + playerId) по-прежнему в localStorage — перезагрузка
 * страницы и возврат в матч работают как раньше.
 */

import { net, type MateEvent } from './net';
import { RoomError, type OpenRoomInfo, type RoomView } from './types';
import {
  clearCredsRaw,
  getSavedCreds as getCreds,
  getSavedName as getName,
  saveCredsRaw,
  saveNameRaw,
  type RoomCreds,
} from './creds';

export type { RoomCreds, MateEvent };
export { net };

/* ---------- креды и имя (синхронизируются с транспортом) ---------- */

export function getSavedCreds(): RoomCreds | null {
  return getCreds();
}

export function saveCreds(creds: RoomCreds) {
  saveCredsRaw(creds);
  // транспорт помнит комнату — реконнект вернёт в неё
  net.setRoom(creds.code, creds.playerId);
}

export function clearCreds() {
  clearCredsRaw();
  net.clearRoom();
}

/** имя игрока (запоминается после первого ввода) */
export function getSavedName(): string {
  return getName();
}

export function saveName(name: string) {
  saveNameRaw(name);
  net.setName(name);
}

/* ---------- игры «с другом» ---------- */

/** создать игру (хост): visibility 'open' — видна в лобби */
export async function apiCreateRoom(
  name: string,
  level: number,
  visibility: 'open' | 'closed' = 'closed',
): Promise<{ playerId: string; view: RoomView }> {
  const m = await net.request<{ t: string; playerId?: string; view?: RoomView }>({
    t: 'create',
    name,
    level,
    visibility,
  });
  if (m.t !== 'room' || !m.view || !m.playerId) {
    throw new RoomError('NETWORK', 'Некорректный ответ сервера');
  }
  net.setName(name);
  net.setRoom(m.view.code, m.playerId);
  return { playerId: m.playerId, view: m.view };
}

/** войти в комнату по коду (друг) */
export async function apiJoinRoom(
  code: string,
  name: string,
): Promise<{ playerId: string; view: RoomView }> {
  const m = await net.request<{ t: string; playerId?: string; view?: RoomView }>({
    t: 'join',
    code,
    name,
  });
  if (m.t !== 'room' || !m.view || !m.playerId) {
    throw new RoomError('NETWORK', 'Некорректный ответ сервера');
  }
  net.setName(name);
  net.setRoom(m.view.code, m.playerId);
  return { playerId: m.playerId, view: m.view };
}

/** свежее состояние комнаты (+попутный отчёт своего прогресса).
 *  Основной поток изменений идёт ПУШАМИ (net.onView) — этот вызов
 *  нужен для стартовой проверки и как страховка раз в несколько
 *  секунд (например, после свёрнутой вкладки) */
export async function apiPollRoom(
  code: string,
  playerId: string,
  progress?: { score?: number; pairsDone?: number },
): Promise<RoomView> {
  const m = await net.request<{ t: string; view?: RoomView }>({
    t: 'view',
    score: progress?.score,
    pairsDone: progress?.pairsDone,
  });
  if (m.t !== 'room' || !m.view) {
    throw new RoomError('NETWORK', 'Некорректный ответ сервера');
  }
  return m.view;
}

/** терминальное событие: собрал доску / переполнил лоток.
 *  Время победителя посчитает СЕРВЕР и пришлёт в view.result */
export async function apiReportFinish(
  _code: string,
  _playerId: string,
  reason: 'cleared' | 'tray',
  score: number,
  pairsDone: number,
): Promise<RoomView | null> {
  const m = await net.request<{ t: string; view?: RoomView }>({
    t: 'finish',
    reason,
    score: Math.round(score),
    pairsDone: Math.round(pairsDone),
  });
  return m.t === 'room' && m.view ? m.view : null;
}

/** следующий уровень («Дальше») или повтор («Реванш»):
 *  матч стартует, когда согласятся ОБА */
export async function apiAdvance(
  code: string,
  playerId: string,
  kind: 'next' | 'rematch',
): Promise<RoomView | null> {
  const m = await net.request<{ t: string; view?: RoomView }>({
    t: 'advance',
    kind,
  });
  if (m.t !== 'room' || !m.view) return null;
  // друга уже нет в комнате — прежний UI показывал тост «вышел»
  if (m.view.players.length < 2) {
    throw new RoomError('ROOM_EMPTY', 'Друг вышел из комнаты');
  }
  return m.view;
}

/** выйти из комнаты (сопернику — победа «вышел») */
export async function apiLeave(code: string, playerId: string) {
  net.clearRoom();
  await net.request({ t: 'leave' });
}

/* ---------- события матча ---------- */

/** собрал пару: короткое событие серверу — он переслёт сопернику
 *  (его прогресс-бар прыгнет мгновенно) и запомнит прогресс */
export function sendMatchEvent(
  tile1Id: number,
  tile2Id: number,
  score: number,
  pairsDone: number,
) {
  net.send({
    t: 'event',
    kind: 'match',
    tile1Id,
    tile2Id,
    score: Math.round(score),
    pairsDone,
  });
}

/** подписка на события соперника «пара собрана» */
export function onMatchEvent(cb: (ev: MateEvent) => void): () => void {
  return net.onEvent(cb);
}

/** подписка на все изменения комнат (пуши сервера) */
export function onRoomView(
  cb: (view: RoomView, playerId?: string) => void,
): () => void {
  return net.onView(cb);
}

/** подписка на список открытых игр (лобби) */
export function onLobby(cb: (rooms: OpenRoomInfo[]) => void): () => void {
  return net.onLobby(cb);
}

/** разовые ошибки транспорта (комната исчезла и т.п.) */
export function onNetError(cb: (code: string) => void): () => void {
  return net.onErr(cb);
}

/* ---------- быстрый матч «найти игру» ---------- */

export interface MatchStartResult {
  status: 'search' | 'paired';
  code?: string;
  playerId?: string;
  view?: RoomView;
}

/** встать в очередь (уровень больше не важен). Если пару нашли
 *  мгновенно — ответ уже с комнатой; иначе сервер ПУШНЕТ {t:'room'}
 *  через net.onView, как только соперник найдётся */
export async function apiMatchStart(
  name: string,
  level: number,
): Promise<MatchStartResult> {
  const m = await net.request<{
    t: string;
    status?: string;
    playerId?: string;
    view?: RoomView;
  }>({ t: 'match', name, level });
  net.setName(name);
  if (m.t === 'room' && m.view && m.playerId) {
    net.setRoom(m.view.code, m.playerId);
    return { status: 'paired', code: m.view.code, playerId: m.playerId, view: m.view };
  }
  return { status: 'search' };
}

/** выйти из очереди */
export async function apiMatchLeave() {
  await net.request({ t: 'match-leave' });
}
