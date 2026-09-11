/**
 * WebSocket-транспорт комнат (Deno Deploy сервер).
 *
 * ОДНО соединение на устройство, uid устройства постоянен
 * (localStorage) — поэтому:
 *  — обрыв связи ≠ выход из матча: авто-реконнект с нарастающим
 *    интервалом (0.5с → 8с), hello с тем же uid тихо возвращает
 *    в ту же комнату, матч продолжается;
 *  — фоновые вкладки онлайн: сервер сам шлёт мини-сердцебиения
 *    каждые 5с (браузер не рвёт живой сокет дросселем таймеров);
 *  — все исходящие копятся в очереди, пока связи нет, и уходят
 *    сразу после переподключения.
 *
 * Push-модель: сервер сам присылает {t:'room'} при любом изменении
 * комнаты (ход соперника, итог, присутствие) — никакого поллинга.
 */

import { SERVER_WS_URL } from './serverUrl';
import { RoomError, type OpenRoomInfo, type RoomView } from './types';
import { getSavedCreds, getSavedName } from './creds';

const UID_KEY = 'mahjong-uid';

/** событие соперника: собрал пару (релей сервера) */
export interface MateEvent {
  playerId: string;
  tile1Id: number;
  tile2Id: number;
  score: number;
  pairsDone: number;
}

export type NetStatus = 'idle' | 'connecting' | 'open' | 'retrying';

/** uid устройства: постоянный идентификатор для реконнекта */
export function deviceUid(): string {
  try {
    let v = localStorage.getItem(UID_KEY);
    if (!v || v.length < 8) {
      v =
        (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
        '-' + String(Date.now());
      localStorage.setItem(UID_KEY, v);
    }
    return v;
  } catch {
    // приватный режим — uid на сессию
    return 'tmp-' + Math.random().toString(36).slice(2);
  }
}

interface Pending {
  resolve: (m: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class RoomNet {
  private ws: WebSocket | null = null;
  private status: NetStatus = 'idle';
  private rid = 0;
  private pending = new Map<number, Pending>();
  /** исходящие, ждущие связи */
  private outbox: string[] = [];
  private retryNo = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private openStableTimer: ReturnType<typeof setTimeout> | null = null;
  /** комната для реконнекта (hello code+playerId) */
  private room: { code: string; playerId: string } | null = null;
  private myName = '';
  private lobbyWant = false;
  private everConnected = false;

  private viewSubs = new Set<(view: RoomView, playerId?: string) => void>();
  private lobbySubs = new Set<(rooms: OpenRoomInfo[]) => void>();
  private eventSubs = new Set<(ev: MateEvent) => void>();
  private errSubs = new Set<(code: string) => void>();
  private statusSubs = new Set<(s: NetStatus) => void>();

  /* ---------- публичное API ---------- */

  /** подключиться (лениво; повторно — безопасно) */
  connect() {
    if (typeof window === 'undefined') return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.setStatus('connecting');
    const ws = new WebSocket(SERVER_WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.everConnected = true;
      // сброс паузы после долгой стабильной связи
      if (this.openStableTimer) clearTimeout(this.openStableTimer);
      this.openStableTimer = setTimeout(() => {
        this.retryNo = 0;
      }, 15000);
      this.setStatus('open');
      this.hello();
      // всё накопленное — в бой
      for (const m of this.outbox.splice(0)) {
        try {
          ws.send(m);
        } catch {
          // ignore
        }
      }
      // подписки восстанавливаем (флаг комната уже в hello)
      if (this.lobbyWant) this.rawSend({ t: 'lobby', on: true });
    };
    ws.onmessage = (ev) => this.onMessage(ev);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failAllPending(new RoomError('NETWORK', 'Нет связи с сервером'));
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      if (this.ws === ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }

  /** отправить без ожидания ответа (копится до связи) */
  send(msg: Record<string, unknown>) {
    this.connect();
    this.rawSend(msg);
  }

  private rawSend(msg: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
        return;
      } catch {
        // падение сокета — ниже в очередь
      }
    }
    if (this.outbox.length < 60) this.outbox.push(JSON.stringify(msg));
  }

  /** запрос-ответ (rid). Если связи нет — сообщение копится,
   *  а ответа ждём в пределах timeout */
  request<T = Record<string, unknown>>(
    msg: Record<string, unknown>,
    timeoutMs = 8000,
  ): Promise<T> {
    this.connect();
    const rid = ++this.rid;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(new RoomError('NETWORK', 'Нет ответа сервера'));
      }, timeoutMs);
      this.pending.set(rid, {
        resolve: (m) => {
          clearTimeout(timer);
          if (m.t === 'err') {
            const code = typeof m.code === 'string' ? m.code : 'NETWORK';
            reject(new RoomError(code as never, 'Ошибка комнаты'));
          } else {
            resolve(m as T);
          }
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
        timer,
      });
      this.rawSend({ ...msg, rid });
    });
  }

  /** помнить комнату — реконнект вернёт в неё автоматически */
  setRoom(code: string, playerId: string) {
    this.room = { code, playerId };
    // если соединение уже живо и мы ещё не в комнате — переприветствуем
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.hello();
  }

  clearRoom() {
    this.room = null;
  }

  setName(name: string) {
    this.myName = name;
  }

  /** подписка на виды комнат: любое изменение (push сервера) */
  onView(cb: (view: RoomView, playerId?: string) => void): () => void {
    this.viewSubs.add(cb);
    this.connect();
    return () => this.viewSubs.delete(cb);
  }

  /** подписка на события соперника «пара собрана» */
  onEvent(cb: (ev: MateEvent) => void): () => void {
    this.eventSubs.add(cb);
    this.connect();
    return () => this.eventSubs.delete(cb);
  }

  /** подписка на лобби (рефкаунт: включается на первом, гаснет на последнем) */
  onLobby(cb: (rooms: OpenRoomInfo[]) => void): () => void {
    this.lobbySubs.add(cb);
    if (this.lobbySubs.size === 1) {
      this.lobbyWant = true;
      this.send({ t: 'lobby', on: true });
    }
    this.connect();
    return () => {
      this.lobbySubs.delete(cb);
      if (this.lobbySubs.size === 0) {
        this.lobbyWant = false;
        this.send({ t: 'lobby', on: false });
      }
    };
  }

  /** ошибки, пришедшие сами (не ответ на запрос) — комната исчезла и пр. */
  onErr(cb: (code: string) => void): () => void {
    this.errSubs.add(cb);
    return () => this.errSubs.delete(cb);
  }

  onStatus(cb: (s: NetStatus) => void): () => void {
    this.statusSubs.add(cb);
    return () => this.statusSubs.delete(cb);
  }

  getStatus(): NetStatus {
    return this.status;
  }

  /* ---------- внутреннее ---------- */

  private setStatus(s: NetStatus) {
    if (this.status === s) return;
    this.status = s;
    for (const cb of [...this.statusSubs]) cb(s);
  }

  private hello() {
    const msg: Record<string, unknown> = {
      t: 'hello',
      uid: deviceUid(),
      name: this.myName || getSavedName() || 'Игрок',
    };
    // комната для реконнекта: свежая из памяти либо из localStorage
    const room = this.room ??
      (() => {
        const c = getSavedCreds();
        return c ? { code: c.code, playerId: c.playerId } : null;
      })();
    if (room) {
      msg.code = room.code;
      msg.playerId = room.playerId;
    }
    this.rawSend(msg);
  }

  private scheduleReconnect() {
    if (this.retryTimer) return;
    // нарастающий интервал: 0.5с, 1с, 2с, 4с, 8с (потолок)
    const delay = Math.min(8000, 500 * 2 ** Math.min(this.retryNo, 4)) +
      Math.random() * 250;
    this.retryNo++;
    this.setStatus(this.everConnected ? 'retrying' : 'connecting');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private failAllPending(e: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }

  private onMessage(ev: MessageEvent) {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const t = m.t as string;
    if (t === 'hb' || t === 'pong') return;

    // ответ на запрос? (и если это вид — он ещё и пушится подписчикам)
    const rid = typeof m.rid === 'number' ? m.rid : null;
    if (rid != null && this.pending.has(rid)) {
      const p = this.pending.get(rid)!;
      this.pending.delete(rid);
      if (t === 'err') {
        const code = typeof m.code === 'string' ? m.code : 'NETWORK';
        // RoomError прокидывается в request()
        const err = new RoomError(code as never, 'Ошибка комнаты');
        p.reject(err);
        return;
      }
      p.resolve(m);
    }

    switch (t) {
      case 'room': {
        const view = m.view as RoomView | undefined;
        if (!view || typeof view.code !== 'string') return;
        const playerId =
          typeof m.playerId === 'string' ? m.playerId : undefined;
        for (const cb of [...this.viewSubs]) {
          try {
            cb(view, playerId);
          } catch {
            // подписчик упал — не рвём остальных
          }
        }
        return;
      }
      case 'lobby': {
        const rooms = Array.isArray(m.rooms) ? (m.rooms as OpenRoomInfo[]) : [];
        for (const cb of [...this.lobbySubs]) {
          try {
            cb(rooms);
          } catch {
            // ignore
          }
        }
        return;
      }
      case 'event': {
        if (m.kind !== 'match') return;
        const e: MateEvent = {
          playerId: String(m.playerId ?? ''),
          tile1Id: Number(m.tile1Id ?? 0),
          tile2Id: Number(m.tile2Id ?? 0),
          score: Number(m.score ?? 0),
          pairsDone: Number(m.pairsDone ?? 0),
        };
        for (const cb of [...this.eventSubs]) {
          try {
            cb(e);
          } catch {
            // ignore
          }
        }
        return;
      }
      case 'err': {
        const code = typeof m.code === 'string' ? m.code : 'NETWORK';
        for (const cb of [...this.errSubs]) {
          try {
            cb(code);
          } catch {
            // ignore
          }
        }
        return;
      }
      case 'hello':
      case 'mm':
      case 'ok':
        return;
    }
  }
}

/** синглтон на вкладку */
export const net = new RoomNet();
