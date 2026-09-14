/**
 * Общие типы комнаты «игра с другом по коду приглашения».
 * Используются и сервером (API-роуты), и клиентом.
 */

export type RoomStatus = 'waiting' | 'playing' | 'result';

/* ---------- друзья (Task 37) ---------- */

export interface FriendInfo {
  uid: string;
  name: string;
  online: boolean;
}
export interface FriendReqInfo {
  uid: string;
  name: string;
  at: number;
}
export interface FriendInviteInfo {
  from: string;
  fromName: string;
  code: string;
  at: number;
}
export interface FriendsStateView {
  code: string;
  friends: FriendInfo[];
  reqs: FriendReqInfo[];
  /** uid'ы, кому я уже отправил заявку */
  sent: string[];
  invites: FriendInviteInfo[];
  /** непрочитанные сообщения по uid друга */
  unread: Record<string, number>;
}

export interface FriendEvent {
  kind: 'req' | 'accept' | 'msg' | 'invite' | 'invite_declined' | 'removed';
  uid: string;
  name: string;
  /** для msg */
  text?: string;
  at?: number;
  /** для invite — код комнаты */
  code?: string;
}

export interface ChatMsgView {
  from: string;
  name: string;
  text: string;
  at: number;
}

/** причина завершения матча (версия сервера) */
export type RoomFinishReason =
  | 'cleared' // кто-то собрал доску первым
  | 'tray' // у кого-то переполнился лоток
  | 'timeout' // время вышло — победил прогресс
  | 'disconnect' // соперник долго не отвечал
  | 'left'; // соперник вышел из комнаты

export interface RoomPlayerView {
  id: string;
  name: string;
  /** цвет аватара (hue) */
  hue: number;
  score: number;
  pairsDone: number;
  /** «в сети» (свежий поллинг) */
  online: boolean;
  /** терминальное событие игрока, если было */
  finished: 'cleared' | 'tray' | null;
  /** счёт серии побед с этим соперником (Task 32) */
  wins: number;
  /** постоянный uid игрока (Task 37: «Добавить в друзья» из матча) */
  uid?: string;
}

export interface RoomResultView {
  winnerId: string;
  reason: RoomFinishReason;
}

/** публичное состояние комнаты — то, что видит клиент */
export interface RoomView {
  code: string;
  status: RoomStatus;
  level: number;
  /** сид доски: одинаковые доски у обоих игроков */
  seed: number;
  hostId: string;
  timeTotalMs: number;
  /** epoch-ms: когда стартует отсчёт времени (после интро) */
  startedAt: number;
  serverNow: number;
  players: RoomPlayerView[];
  result: RoomResultView | null;
  /** открытая игра видна в общем списке, закрытая — только по коду */
  visibility?: 'open' | 'closed';
  /** кто уже согласился на реванш/следующий уровень (Task 25:
   *  новый матч стартует ТОЛЬКО когда согласны ОБА) */
  advanceOffers?: { playerId: string; kind: 'rematch' | 'next' }[];
}

/** запись в списке открытых игр (лобби) */
export interface OpenRoomInfo {
  code: string;
  level: number;
  hostName: string;
  /** цвет аватара создателя (hue) */
  hue: number;
  /** давно создана? — раньше в списке (epoch-ms) */
  createdAt: number;
  /** сколько игроков уже внутри (1 — ждём соперника) */
  players: number;
}

/** игрок, ищущий быстрый матч (виден в меню других игроков) */
export interface SearchingInfo {
  name: string;
  level: number;
  hue: number;
  createdAt: number;
}

/** ошибка транспорта комнаты */
export type RoomErrorCode =
  | 'BAD_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_EMPTY'
  | 'NOT_YET'
  | 'NETWORK'
  | 'BAD_TARGET'
  | 'NO_REQ'
  | 'NOT_FRIENDS'
  | 'ALREADY_FRIENDS';

export class RoomError extends Error {
  code: RoomErrorCode;
  constructor(code: RoomErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
