/**
 * Клиентский транспорт комнат «1 на 1» и матчмейкинга — WebSocket.
 *
 * DENO DEPLOY (deno-server/main.ts, протокол v2):
 *  — адрес один и жёсткий: wss://mahjong-solitaire.damirkolmurzin.deno.net
 *    (WebSocket принимается в КОРНЕ — никаких /ws и переменных
 *    окружения; старые подключения к Vercel API и VPS удалены);
 *    локальная разработка (localhost) ходит на ws://localhost:8080;
 *  — ЭКОНОМИЯ ЛИМИТОВ DENO DEPLOY (критично): в игре клиент шлёт
 *    серверу ТОЛЬКО короткое событие в момент клика по собранной
 *    паре — {t:'event', kind:'match', tile1Id, tile2Id} (+ счёт) —
 *    и терминальный {t:'finish'}. Никакого поллинга состояния и
 *    «движений мыши»: всё актуальное сервер пушит сам (watch);
 *  — SEED: раскладку оба игрока строят из одного числа view.seed
 *    (доски одинаковые); таймер матча — серверный (startedAt /
 *    serverNow), накрутить время на телефоне нельзя;
 *  — РЕКОННЕКТ: при обрыве клиент яростно пытается вернуться в
 *    течение 15 секунд (~7 попыток с нарастающей паузой), дальше —
 *    раз в 5 c неограниченно долго. Текущая игра НЕ перезапускается:
 *    «hello» с сохранёнными кредами (code + playerId) возвращает
 *    игрока в комнату с того же места (сервер держит её 30 c).
 *
 * Сигнатуры api-функций совпадают с прежними, поэтому стор и
 * экраны не меняются:
 *   subscribeRoom(cb)   — вьюха комнаты (старт/итог/прогресс)
 *   subscribeEvent(cb)  — «соперник собрал пару» (мгновенно)
 *   subscribeLobby(cb)  — список открытых игр (раз в ~2 c)
 *   subscribeErr(cb)    — коды ошибок сервера
 *   subscribeStatus(cb) — 'connecting' | 'open' | 'retrying' | 'idle'
 */

import { RoomError, type OpenRoomInfo, type RoomView } from './types';

const CREDS_KEY = 'mahjong-room';
const NAME_KEY = 'mahjong-name';
const UID_KEY = 'mahjong-uid';

export interface RoomCreds {
  code: string;
  playerId: string;
  /** я создатель комнаты (может пересоздать её через sync) */
  host?: boolean;
  /** открытая игра — пересоздаётся такой же при self-heal */
  visibility?: 'open' | 'closed';
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
  visibility?: 'open' | 'closed';
  timeLeftMs: number;
  score?: number;
  pairsDone?: number;
  players: { id: string; name: string; hue: number; score: number; pairsDone: number }[];
}

export interface OpponentMatchEvent {
  playerId: string;
  tile1Id: number;
  tile2Id: number;
  score: number;
  pairsDone: number;
}

export type WsStatus = 'idle' | 'connecting' | 'open' | 'retrying';

/* ============================== адрес ============================== */

/**
 * Адрес мультиплеер-сервера (Deno Deploy, Playground одним файлом).
 *
 * В проде — строго wss://mahjong-solitaire.damirkolmurzin.deno.net
 * (корень: сервер принимает WebSocket на любом пути). Локальная
 * разработка и e2e (localhost) — ws://localhost:8080. Чтобы сменить
 * домен, правьте одну константу ниже.
 */
const PROD_WS_URL = 'wss://mahjong-solitaire.damirkolmurzin.deno.net';
const DEV_WS_URL = 'ws://localhost:8080';

function wsUrl(): string {
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') {
      return DEV_WS_URL;
    }
  }
  return PROD_WS_URL;
}

/* ============ воркер-сердцебиение (свёрнутая вкладка) ============
 * Браузер душит таймеры СВЁРНУТОЙ вкладки до ~1/мин. Воркер не
 * дросселируется: тикает каждые 5 c и просит главный поток послать
 * {t:'ping'} — сервер считает это присутствием, и матч не умирает
 * по ложному «дисконнекту», пока игрок вернётся. */
let presenceWorker: Worker | null = null;

function ensurePresenceWorker(): void {
  if (presenceWorker || typeof Worker === 'undefined') return;
  try {
    const src =
      "let iv=null;onmessage=e=>{if(e.data==='start'&&iv===null)" +
      'iv=setInterval(()=>postMessage(1),5000);' +
      "if(e.data==='stop'&&iv!==null){clearInterval(iv);iv=null}}";
    presenceWorker = new Worker(
      URL.createObjectURL(new Blob([src], { type: 'text/javascript' })),
    );
    presenceWorker.onmessage = () => {
      // в видимой вкладке ответы на серверный hb уже идут — не дублируем
      if (typeof document !== 'undefined' && document.hidden) {
        wsClient.ping();
      }
    };
    presenceWorker.postMessage('start');
  } catch {
    // воркер недоступен (старый браузер/политика) — останется hb→ping
    presenceWorker = null;
  }
}

/* ============================ сокет-клиент ============================ */

class WsClient {
  private ws: WebSocket | null = null;
  private status: WsStatus = 'idle';
  private rid = 0;
  private pending = new Map<
    number,
    { resolve: (m: Record<string, unknown>) => void; reject: (e: Error) => void }
  >();
  /** исходящие сообщения, накопленные во время обрыва */
  private outbox: string[] = [];
  private retryNo = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private room: { code: string; playerId: string } | null = null;
  private myName = '';
  private lobbyWant = false;
  private everConnected = false;
  /** троттлинг view-запросов: не чаще раза в 2.5 c (пуши и так всё доносят) */
  private lastViewReqAt = 0;
  private lastViewCache: { code: string; view: RoomView } | null = null;
  /** пачки подписчиков */
  private viewSubs = new Set<(v: RoomView, playerId?: string) => void>();
  private lobbySubs = new Set<(rooms: OpenRoomInfo[]) => void>();
  private eventSubs = new Set<(e: OpponentMatchEvent) => void>();
  private errSubs = new Set<(code: string) => void>();
  private statusSubs = new Set<(s: WsStatus) => void>();

  connect(): void {
    ensurePresenceWorker();
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
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.everConnected = true;
      this.retryNo = 0;
      this.setStatus('open');
      // сначала представляемся (hello вернёт в живую комнату),
      // затем доливаем накопленное во время обрыва
      this.hello();
      for (const raw of this.outbox.splice(0)) {
        try {
          ws.send(raw);
        } catch {
          // ignore
        }
      }
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

  /** присутствие: свёрнутая вкладка / страховка (сервер обновляет
   *  lastSeen по ping — матч не умирает без поллинга) */
  ping(): void {
    this.rawSend({ t: 'ping' });
  }

  private send(m: Record<string, unknown>): void {
    this.connect();
    this.rawSend(m);
  }

  private rawSend(m: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(m));
        return;
      } catch {
        // ниже — в очередь
      }
    }
    if (this.outbox.length < 60) this.outbox.push(JSON.stringify(m));
  }

  /** отправить без ожидания ответа (событие «собрал пару»):
   *  уходит сразу при живом сокете, иначе — ждёт в очереди и
   *  уходит первым же делом после переподключения */
  fire(m: Record<string, unknown>): void {
    this.connect();
    this.rawSend(m);
  }

  /** запрос-ответ по rid (8 c на ответ) */
  request(m: Record<string, unknown>, timeout = 8000): Promise<Record<string, unknown>> {
    this.connect();
    const rid = ++this.rid;
    return new Promise((resolve, reject) => {
      const tm = setTimeout(() => {
        this.pending.delete(rid);
        reject(new RoomError('NETWORK', 'Нет ответа сервера'));
      }, timeout);
      this.pending.set(rid, {
        resolve: (resp) => {
          clearTimeout(tm);
          resolve(resp);
        },
        reject: (e) => {
          clearTimeout(tm);
          reject(e);
        },
      });
      this.rawSend({ ...m, rid });
    });
  }

  setRoom(code: string, playerId: string): void {
    this.room = { code, playerId };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.hello();
  }

  clearRoom(): void {
    this.room = null;
  }

  setName(name: string): void {
    this.myName = name;
  }

  /* ---------- подписки ---------- */

  onView(cb: (v: RoomView, playerId?: string) => void): () => void {
    this.viewSubs.add(cb);
    this.connect();
    return () => this.viewSubs.delete(cb);
  }

  onEvent(cb: (e: OpponentMatchEvent) => void): () => void {
    this.eventSubs.add(cb);
    this.connect();
    return () => this.eventSubs.delete(cb);
  }

  onLobby(cb: (rooms: OpenRoomInfo[]) => void): () => void {
    const first = this.lobbySubs.size === 0;
    this.lobbySubs.add(cb);
    if (first) {
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

  onErr(cb: (code: string) => void): () => void {
    this.errSubs.add(cb);
    return () => this.errSubs.delete(cb);
  }

  onStatus(cb: (s: WsStatus) => void): () => void {
    this.statusSubs.add(cb);
    return () => this.statusSubs.delete(cb);
  }

  getStatus(): WsStatus {
    return this.status;
  }

  /** view-запросы троттлятся: сервер и так пушит все изменения,
   *  запрос остался страховкой (жива ли комната) */
  requestView(
    code: string,
    progress?: { score?: number; pairsDone?: number },
  ): Promise<Record<string, unknown>> {
    const now = Date.now();
    if (
      now - this.lastViewReqAt < 2500 &&
      this.lastViewCache &&
      this.lastViewCache.code === code
    ) {
      return Promise.resolve({ t: 'room', view: this.lastViewCache.view });
    }
    this.lastViewReqAt = now;
    return this.request({
      t: 'view',
      score: progress?.score,
      pairsDone: progress?.pairsDone,
    });
  }

  rememberView(view: RoomView): void {
    this.lastViewCache = { code: view.code, view };
  }

  /* ---------- внутреннее ---------- */

  private setStatus(s: WsStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const cb of [...this.statusSubs]) {
      try {
        cb(s);
      } catch {
        // ignore
      }
    }
  }

  private hello(): void {
    const m: Record<string, unknown> = {
      t: 'hello',
      uid: getUid(),
      name: this.myName || getSavedName() || 'Игрок',
    };
    const saved = this.room ?? savedRoomHint();
    if (saved) {
      m.code = saved.code;
      m.playerId = saved.playerId;
    }
    this.rawSend(m);
  }

  /** РЕКОННЕКТ 15 СЕКУНД (фидбек «на телефонах связь часто
   *  рвётся»): в первые 15 c — ~7 попыток с нарастающей паузой
   *  (0.4 → 0.8 → 1.2 → 2 → 3 → 4 c), дальше — раз в 5 c без
   *  ограничения по времени. Игрока НЕ выкидывает в меню: игра
   *  не перезапускается, hello возвращает в комнату с того же
   *  места (сервер держит её 30 c, на Redis/KV ничего не теряется). */
  private scheduleReconnect(): void {
    if (this.retryTimer) return;
    // окно 15 c: пока попытки в нём — пауза растёт медленно,
    // после окна — ровно 5 c между попытками
    const in15s = this.retryNo < 7;
    const delay = in15s
      ? Math.min(4000, 400 + 600 * this.retryNo) + 200 * Math.random()
      : 5000 + 500 * Math.random();
    this.retryNo++;
    this.setStatus(this.everConnected ? 'retrying' : 'connecting');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private failAllPending(e: Error): void {
    for (const [, p] of this.pending) p.reject(e);
    this.pending.clear();
  }

  private onMessage(ev: MessageEvent): void {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(ev.data));
      if (!m || typeof m !== 'object') return;
    } catch {
      return;
    }
    const t = typeof m.t === 'string' ? m.t : '';

    // ответ на наш ping / серверное pong — тихо
    if (t === 'pong') return;

    // сервер постучался (hb) — вкладка жива: отвечаем ping
    // (lastSeen обновится, свёрнутый матч не умрёт по «дисконнекту»)
    if (t === 'hb') {
      try {
        this.ws?.send(JSON.stringify({ t: 'ping' }));
      } catch {
        // ignore
      }
      return;
    }

    // ответ на запрос по rid
    const rid = typeof m.rid === 'number' ? m.rid : null;
    if (rid !== null && this.pending.has(rid)) {
      const p = this.pending.get(rid)!;
      this.pending.delete(rid);
      if (t === 'err') {
        p.reject(
          new RoomError(
            typeof m.code === 'string' ? (m.code as RoomError['code']) : 'NETWORK',
            'Ошибка комнаты',
          ),
        );
        return;
      }
      p.resolve(m);
      return;
    }

    // чистые пуши
    switch (t) {
      case 'room': {
        const v = m.view as RoomView | undefined;
        if (!v || typeof v.code !== 'string') return;
        this.rememberView(v);
        const pid = typeof m.playerId === 'string' ? m.playerId : undefined;
        for (const cb of [...this.viewSubs]) {
          try {
            cb(v, pid);
          } catch {
            // ignore
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
        const e: OpponentMatchEvent = {
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
      default:
        return;
    }
  }
}

const wsClient = new WsClient();

/* ============================ креды/имя ============================ */

function savedRoomHint(): { code: string; playerId: string } | null {
  const c = getSavedCreds();
  return c ? { code: c.code, playerId: c.playerId } : null;
}

function getUid(): string {
  try {
    let uid = localStorage.getItem(UID_KEY);
    if (!uid || uid.length < 8) {
      uid =
        (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
        '-' +
        String(Date.now());
      localStorage.setItem(UID_KEY, uid);
    }
    return uid;
  } catch {
    return 'tmp-' + Math.random().toString(36).slice(2);
  }
}

export function getSavedCreds(): RoomCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as {
      code?: unknown;
      playerId?: unknown;
      host?: unknown;
      visibility?: unknown;
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
        visibility: c.visibility === 'open' ? 'open' : 'closed',
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
  wsClient.setRoom(creds.code, creds.playerId);
}

export function clearCreds() {
  try {
    localStorage.removeItem(CREDS_KEY);
  } catch {
    // ignore
  }
  wsClient.clearRoom();
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
  wsClient.setName(name);
}

/* ============================ api-функции ============================ */

function toView(data: Record<string, unknown>): RoomView {
  const view = (data.view ?? data) as Record<string, unknown> | undefined;
  if (
    !view ||
    typeof view.code !== 'string' ||
    !Array.isArray(view.players)
  ) {
    throw new RoomError('NETWORK', 'Некорректный ответ сервера');
  }
  return view as unknown as RoomView;
}

/** создать игру (хост): visibility 'open' — видна в лобби */
export async function apiCreateRoom(
  name: string,
  level: number,
  visibility: 'open' | 'closed' = 'closed',
): Promise<{ playerId: string; view: RoomView }> {
  const data = await wsClient.request({
    t: 'create',
    name,
    level,
    visibility,
  });
  const playerId = typeof data.playerId === 'string' ? data.playerId : '';
  if (playerId === '' || data.t !== 'room') {
    throw new RoomError('NETWORK', 'Некорректный ответ сервера');
  }
  return { playerId, view: toView(data) };
}

/** список открытых игр (лобби): можно зайти без кода */
export async function apiListOpenRooms(): Promise<OpenRoomInfo[]> {
  const data = await wsClient.request({ t: 'lobby', on: true }, 5000);
  return Array.isArray(data.rooms) ? (data.rooms as OpenRoomInfo[]) : [];
}

/** войти в комнату по коду (друг). Свежая комната может
 *  «проявляться» на другом изоляте (репликация KV) — один ретрай */
export async function apiJoinRoom(
  code: string,
  name: string,
): Promise<{ playerId: string; view: RoomView }> {
  const attempt = async () => {
    const data = await wsClient.request({ t: 'join', code, name });
    const playerId = typeof data.playerId === 'string' ? data.playerId : '';
    if (playerId === '' || data.t !== 'room') {
      throw new RoomError('NETWORK', 'Некорректный ответ сервера');
    }
    return { playerId, view: toView(data) };
  };
  try {
    return await attempt();
  } catch (e) {
    if (e instanceof RoomError && e.code === 'ROOM_NOT_FOUND') {
      await new Promise((r) => setTimeout(r, 600));
      return attempt();
    }
    throw e;
  }
}

/** состояние комнаты + «попутный» отчёт своего прогресса.
 *  Троттлится изнутри (не чаще 1 раза в 2.5 c): актуальное
 *  состояние сервер пушит сам — запрос остался страховкой. */
export async function apiPollRoom(
  code: string,
  playerId: string,
  progress?: { score?: number; pairsDone?: number },
): Promise<RoomView> {
  void playerId;
  const data = await wsClient.requestView(code, progress);
  if (data.t !== 'room') throw new RoomError('NETWORK', 'Комната недоступна');
  return toView(data);
}

/** собрал пару: КОРОТКОЕ событие в момент клика —
 *  {t:'event', kind:'match', tile1Id, tile2Id} + счёт/прогресс.
 *  Доставляется гарантированно: при обрыве ждёт в исходящей очереди
 *  и уходит сразу после переподключения (лимиты Deno не горят —
 *  ровно одно сообщение на каждую собранную пару). */
export function sendMatchEvent(
  tile1Id: number,
  tile2Id: number,
  score: number,
  pairsDone: number,
): void {
  wsClient.fire({
    t: 'event',
    kind: 'match',
    tile1Id,
    tile2Id,
    score: Math.round(score),
    pairsDone: Math.round(pairsDone),
  });
}

/** терминальное событие: собрал доску / переполнил лоток.
 *  Итог сервер фиксирует сам (по своим часам) и шлёт обоим. */
export async function apiReportFinish(
  code: string,
  playerId: string,
  reason: 'cleared' | 'tray',
  score: number,
  pairsDone: number,
): Promise<RoomView | null> {
  void code;
  void playerId;
  const data = await wsClient.request({
    t: 'finish',
    reason,
    score: Math.round(score),
    pairsDone: Math.round(pairsDone),
  });
  return data.t === 'room' ? toView(data) : null;
}

/** следующий уровень («Дальше») или повтор («Реванш») — оба согласны */
export async function apiAdvance(
  code: string,
  playerId: string,
  kind: 'next' | 'rematch',
): Promise<RoomView | null> {
  void code;
  void playerId;
  const data = await wsClient.request({ t: 'advance', kind });
  return data.t === 'room' ? toView(data) : null;
}

/** выйти из комнаты */
export async function apiLeave(code: string, playerId: string) {
  void code;
  void playerId;
  await wsClient.request({ t: 'leave' });
}

/* ---------- быстрый матч ---------- */

export interface MatchStatus {
  status: 'search' | 'paired';
  code?: string;
  playerId?: string;
  view?: RoomView;
}

/** встать в очередь быстрого матча (уровень не важен) */
export async function apiMatchJoin(
  name: string,
  level: number,
): Promise<MatchStatus> {
  const data = await wsClient.request({ t: 'match', name, level });
  if (data.t === 'room' && data.view) {
    return {
      status: 'paired',
      code: (data.view as RoomView).code,
      playerId: typeof data.playerId === 'string' ? data.playerId : undefined,
      view: toView(data),
    };
  }
  return { status: 'search' };
}

/** держим тикет живым; заодно сервер досматривает очередь.
 *  Если сокет пережил обрыв и тикет потерялся — сервер пересоздаст
 *  его с актуальным уровнем; если мы уже в комнате — вернёт её. */
export async function apiMatchHeart(level?: number): Promise<MatchStatus> {
  const data = await wsClient.request(
    { t: 'match-heart', level: level ?? 1 },
    5000,
  );
  if (data.t === 'room' && data.view) {
    return {
      status: 'paired',
      code: (data.view as RoomView).code,
      playerId: typeof data.playerId === 'string' ? data.playerId : undefined,
      view: toView(data),
    };
  }
  return { status: 'search' };
}

/** выйти из очереди */
export async function apiMatchLeave() {
  await wsClient.request({ t: 'match-leave' });
}

/* ---------- подписки на пуши ---------- */

export function subscribeRoom(cb: (v: RoomView, playerId?: string) => void) {
  return wsClient.onView(cb);
}
export function subscribeEvent(cb: (e: OpponentMatchEvent) => void) {
  return wsClient.onEvent(cb);
}
export function subscribeLobby(cb: (rooms: OpenRoomInfo[]) => void) {
  return wsClient.onLobby(cb);
}
export function subscribeErr(cb: (code: string) => void) {
  return wsClient.onErr(cb);
}
export function subscribeStatus(cb: (s: WsStatus) => void) {
  return wsClient.onStatus(cb);
}

/** прогреть соединение заранее (например, при входе в меню) */
export function warmupConnection(): void {
  wsClient.connect();
}
