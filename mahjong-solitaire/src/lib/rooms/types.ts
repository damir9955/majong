/**
 * Общие типы комнаты «игра с другом по коду приглашения».
 * Используются и сервером (API-роуты), и клиентом.
 */

export type RoomStatus = 'waiting' | 'playing' | 'result';

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
}

/** ошибка транспорта комнаты */
export type RoomErrorCode =
  | 'BAD_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_EMPTY'
  | 'NOT_YET'
  | 'NETWORK';

export class RoomError extends Error {
  code: RoomErrorCode;
  constructor(code: RoomErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
