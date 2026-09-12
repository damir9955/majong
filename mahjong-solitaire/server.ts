/**
 * МАДЖОНГ · сервер дуэлей «1 на 1» — VPS-версия (чистый WebSocket на Deno).
 *
 * АРХИТЕКТУРА (собственный VPS, один процесс — без Deno KV):
 *  - порт 8081 (переменная PORT для тестов);
 *  - комнаты живут в памяти процесса: create/join по коду, быстрый
 *    матч (очередь + подсадка в открытую комнату), лобби открытых игр;
 *  - SEED: сервер генерирует случайное число при создании комнаты и
 *    при каждом новом раунде (реванш/следующий уровень) — оба клиента
 *    строят по нему ОДИНАКОВУЮ раскладку (mulberry32 на клиенте);
 *  - АВТОРИТАРНОЕ ВРЕМЯ: сервер фиксирует startedAt по своим часам;
 *    когда клиент присылает «я прошёл уровень» ({action:'finish'}),
 *    сервер сам считает elapsed = финиш − старт и кладёт его в
 *    result.timeMs — итог уходит ОБОИМ игрокам, таймер на телефоне
 *    накрутить нельзя;
 *  - РЕКОННЕКТ: при обрыве комната держится 15 секунд; «hello» со
 *    старыми кредами (code + playerId) возвращает игрока в матч
 *    с того же места; молча, без ошибок (мёртвая комната ≠ err);
 *  - живость: каждые 3 c сервер шлёт {t:'hb'}, клиент отвечает
 *    {action:'ping'} (в т.ч. из воркера свёрнутой вкладки);
 *  - событийная модель: клиент в игре шлёт только короткие события
 *    {action:'match', tile1Id, tile2Id} (плюс опциональные счёт/прогресс)
 *    и терминальный {action:'finish'} — никаких «движений мыши».
 *
 * ЗАПУСК НА VPS:
 *    deno run --allow-net server.ts
 *    (порт 8081; перед ним reverse-proxy wss: 443 → 127.0.0.1:8081)
 *
 * ПРОТОКОЛ (JSON поверх WS):
 *  ← {action:'hello', uid, name, code?, playerId?}   представиться/вернуться
 *  → {t:'hello', ok}                                  (+ rid если был)
 *  ← {action:'create', name, level, visibility}       создать игру → код
 *  ← {action:'join', code, name}                      войти по коду
 *  ← {action:'quick', name, level}                    быстрый матч
 *  ← {action:'quick-heart', level}                    держать тикет живым
 *  ← {action:'quick-leave'}                           выйти из очереди
 *  ← {action:'view', score?, pairsDone?}              запрос вьюхи (+синк)
 *  ← {action:'match', tile1Id, tile2Id, score?, pairsDone?}  собрал пару
 *  ← {action:'finish', reason, score?, pairsDone?}    прошёл уровень
 *  ← {action:'advance', kind:'rematch'|'next'}        реванш/следующий
 *  ← {action:'leave'}                                 выйти из комнаты
 *  ← {action:'lobby', on}                             подписка на открытые
 *  ← {action:'ping'}                                  жив (ответ на hb)
 *  → {t:'room', view, playerId}                       вьюха комнаты (rid/пуш)
 *  → {t:'search'}                                     тикет в очереди
 *  → {t:'lobby', rooms}                               список открытых игр
 *  → {t:'event', kind:'match', playerId, tile1Id, tile2Id, score, pairsDone}
 *  → {t:'hb'}                                         каждые 3 c
 *  → {t:'pong'}                                       ответ на ping
 *  → {t:'err', code, rid?}                            ошибка
 *  (legacy: ключ t вместо action тоже принимается)
 */

/* ============================== КОНСТАНТЫ ============================== */

function envPort(): number {
  try {
    const p = Number(Deno.env.get('PORT'));
    if (Number.isFinite(p) && p > 0 && p < 65536) return p;
  } catch {
    // без --allow-env — просто дефолт
  }
  return 8081;
}

/** целое из env с дефолтом (для тестов/экспериментов) */
function envInt(name: string, dflt: number): number {
  try {
    const v = Number(Deno.env.get(name));
    if (Number.isFinite(v) && v >= 0) return Math.round(v);
  } catch {
    // без --allow-env — просто дефолт
  }
  return dflt;
}

const PORT = envPort();

/** окно реконнекта: комната держится 15 c после обрыва */
const RECONNECT_WINDOW_MS = envInt('RECONNECT_MS', 15_000);
/** тишина по сокету дольше этого — игрок «не в сети» (hb каждые 3 c) */
const PRESENCE_MS = 10_000;
/** сервер стучится к клиенту раз в 3 c (прокси не рвут соединение) */
const HB_INTERVAL_MS = 3_000;
/** цикл авт-исходов (тайм-ауты, отключения, гигиена) */
const SWEEP_INTERVAL_MS = 1_500;
/** пуш лобби подписчикам не чаще */
const LOBBY_PUSH_MS = 2_000;
/** запас на интро-карточку и отсчёт 3-2-1 у обоих игроков */
const INTRO_BUDGET_MS = envInt('INTRO_MS', 8_000);
/** время на пару — как в матче против бота */
const TIME_PER_PAIR_MS = 4_500;
const TIME_MIN_MS = 90_000;
const TIME_MAX_MS = 270_000;
/** комнаты живут 6 часов, «ожидание друга» — час */
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const WAITING_TTL_MS = 60 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без I O 0 1
const CODE_LEN = 5;

/** пары по уровню (цикл 10 уровней — 10 схем, см. layouts.ts) */
const PAIRS_BY_LEVEL = [14, 20, 22, 32, 36, 18, 21, 26, 32, 40];

/* ================================ ТИПЫ ================================ */

type RoomFinishReason =
  | 'cleared' // кто-то первым собрал доску
  | 'tray' // у кого-то переполнился лоток
  | 'timeout' // время вышло — победил прогресс
  | 'disconnect' // соперник не вернулся за 15 c
  | 'left'; // соперник вышел из комнаты

interface Seat {
  playerId: string;
  name: string;
  hue: number;
  socket: WebSocket | null;
  score: number;
  pairsDone: number;
  finished: 'cleared' | 'tray' | null;
  /** последнее сообщение от игрока (любое) */
  lastSeen: number;
  /** сокет закрылся в этот момент (null — на связи) */
  disconnectedAt: number | null;
}

interface Room {
  code: string;
  level: number;
  visibility: 'open' | 'closed';
  status: 'waiting' | 'playing' | 'result';
  seed: number;
  hostId: string;
  timeTotalMs: number;
  /** epoch-ms старта отсчёта (после интро) — авторитарное время */
  startedAt: number;
  seats: Seat[];
  result: { winnerId: string; reason: RoomFinishReason; timeMs: number } | null;
  /** серия побед в этой комнате (не сбрасывается реваншем) */
  wins: Map<string, number>;
  /** согласия на реванш/следующий уровень */
  advanceBy: Map<string, 'rematch' | 'next'>;
  createdAt: number;
  /** прошлый снапшот присутствия — чтобы пушить только изменения */
  presenceSnap: Map<string, boolean>;
}

interface Ticket {
  sock: WebSocket;
  name: string;
  level: number;
  at: number;
}

/** контекст сокета */
interface SockCtx {
  name: string;
  uid: string;
  code: string | null;
  playerId: string | null;
  lobby: boolean;
  lastSeen: number;
}

/* ============================== СОСТОЯНИЕ ============================== */

const rooms = new Map<string, Room>();
const tickets: Ticket[] = [];
const sockCtx = new Map<WebSocket, SockCtx>();
/** кэш последнего лобби — сравнение перед пушем */
let lobbyCache = '';

/* ============================ УТИЛИТЫ ============================ */

const now = (): number => Date.now();

function log(what: string, extra = ''): void {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[mj ${t}] ${what}${extra ? ' ' + extra : ''}`);
}

function send(sock: WebSocket | null, m: Record<string, unknown>): void {
  if (!sock || sock.readyState !== WebSocket.OPEN) return;
  try {
    sock.send(JSON.stringify(m));
  } catch {
    // сокет умер между проверкой и отправкой — не страшно
  }
}

/** ответ на запрос: echo rid, если он был */
function reply(sock: WebSocket, m: Record<string, unknown>, req: Record<string, unknown>): void {
  if (typeof req.rid === 'number') m.rid = req.rid;
  send(sock, m);
}

function errOf(sock: WebSocket, req: Record<string, unknown>, code: string): void {
  reply(sock, { t: 'err', code }, req);
}

function rndId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

function rndHue(): number {
  return Math.floor(Math.random() * 360);
}

function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().slice(0, 16) : '';
  return s || 'Игрок';
}

function num(raw: unknown, dflt: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : dflt;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < CODE_LEN; i++) {
      c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!rooms.has(c)) return c;
  }
}

/** случайный seed раскладки (одинаков у обоих игроков) */
function newSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return (b[0] >>> 0) || 1;
}

function timeForLevel(level: number): number {
  const pairs = PAIRS_BY_LEVEL[(clamp(level, 1, 999) - 1) % PAIRS_BY_LEVEL.length];
  return clamp(pairs * TIME_PER_PAIR_MS, TIME_MIN_MS, TIME_MAX_MS);
}

function isOnline(s: Seat, t: number): boolean {
  return !!s.socket && s.socket.readyState === WebSocket.OPEN && t - s.lastSeen < PRESENCE_MS;
}

/* ============================== ВЬЮХИ ============================== */

function viewOf(r: Room): Record<string, unknown> {
  const t = now();
  return {
    code: r.code,
    status: r.status,
    level: r.level,
    seed: r.seed,
    hostId: r.hostId,
    timeTotalMs: r.timeTotalMs,
    startedAt: r.startedAt,
    serverNow: t,
    players: r.seats.map((s) => ({
      id: s.playerId,
      name: s.name,
      hue: s.hue,
      score: s.score,
      pairsDone: s.pairsDone,
      online: isOnline(s, t),
      finished: s.finished,
      wins: r.wins.get(s.playerId) ?? 0,
    })),
    result: r.result
      ? { winnerId: r.result.winnerId, reason: r.result.reason, timeMs: r.result.timeMs }
      : null,
    visibility: r.visibility,
    advanceOffers: [...r.advanceBy].map(([playerId, kind]) => ({ playerId, kind })),
  };
}

/** вьюха всем живым сокетам комнаты (у каждого — свой playerId) */
function pushView(r: Room): void {
  for (const s of r.seats) {
    send(s.socket, { t: 'room', view: viewOf(r), playerId: s.playerId });
  }
}

/* ============================ ФИНАЛЫ ============================ */

/** зафиксировать исход; timeMs — авторитарное время (финиш − старт) */
function finishRoom(
  r: Room,
  winnerId: string,
  reason: RoomFinishReason,
  t: number,
): void {
  if (r.result) return;
  const startedAt = r.startedAt > 0 ? r.startedAt : r.createdAt;
  r.result = { winnerId, reason, timeMs: Math.max(0, t - startedAt) };
  r.status = 'result';
  r.advanceBy.clear();
  r.wins.set(winnerId, (r.wins.get(winnerId) ?? 0) + 1);
  log(`finish ${r.code} winner=${winnerId.slice(0, 6)} reason=${reason} time=${Math.round(r.result.timeMs / 100) / 10}s`);
}

/** «я прошёл уровень»: cleared — победа отправителя, tray — поражение */
function applyFinish(r: Room, seat: Seat, reason: 'cleared' | 'tray', t: number): void {
  seat.finished = reason;
  if (r.result) return;
  const other = r.seats.find((x) => x.playerId !== seat.playerId);
  if (reason === 'cleared') {
    finishRoom(r, seat.playerId, 'cleared', t);
  } else if (other) {
    finishRoom(r, other.playerId, 'tray', t);
  } else {
    finishRoom(r, seat.playerId, 'tray', t);
  }
}

/* ====================== ОЧЕРЕДЬ БЫСТРОГО МАТЧА ====================== */

function dropTicket(sock: WebSocket): void {
  const i = tickets.findIndex((tk) => tk.sock === sock);
  if (i >= 0) tickets.splice(i, 1);
}

/** если в очереди двое — создать им комнату (хост — первый тикет) */
function tryPairQueue(): void {
  const t = now();
  for (let i = 0; i + 1 < tickets.length; ) {
    const a = tickets[i];
    const b = tickets[i + 1];
    if (a.sock.readyState !== WebSocket.OPEN) {
      tickets.splice(i, 1);
      continue;
    }
    if (b.sock.readyState !== WebSocket.OPEN) {
      tickets.splice(i + 1, 1);
      continue;
    }
    if (a.sock === b.sock) {
      tickets.splice(i + 1, 1);
      continue;
    }
    tickets.splice(i, 2);
    const r = createRoom(a.sock, a.name, a.level, 'closed');
    joinRoomSeat(r, b.sock, b.name);
    startRound(r, t);
    // обоим вьюхи старта (rid нет — это пуш)
    pushView(r);
    log(`quick ${r.code} lvl=${r.level}`);
    return; // за один тик — одна пара (следующие — в следующих тиках)
  }
  void t;
}

/* ======================= ЖИЗНЬ КОМНАТЫ ======================= */

function bindSock(sock: WebSocket, ctx: SockCtx, code: string, playerId: string): void {
  ctx.code = code;
  ctx.playerId = playerId;
}

function createRoom(
  sock: WebSocket,
  name: string,
  level: number,
  visibility: 'open' | 'closed',
): Room {
  const ctx = sockCtx.get(sock)!;
  leaveCurrentRoom(sock);
  const playerId = rndId();
  const room: Room = {
    code: newCode(),
    level: clamp(Math.round(level) || 1, 1, 999),
    visibility,
    status: 'waiting',
    seed: newSeed(),
    hostId: playerId,
    timeTotalMs: timeForLevel(level),
    startedAt: 0,
    seats: [
      {
        playerId,
        name: sanitizeName(name),
        hue: rndHue(),
        socket: sock,
        score: 0,
        pairsDone: 0,
        finished: null,
        lastSeen: now(),
        disconnectedAt: null,
      },
    ],
    result: null,
    wins: new Map([[playerId, 0]]),
    advanceBy: new Map(),
    createdAt: now(),
    presenceSnap: new Map(),
  };
  rooms.set(room.code, room);
  bindSock(sock, ctx, room.code, playerId);
  log(`create ${room.code} lvl=${room.level} ${visibility}`);
  return room;
}

function joinRoomSeat(r: Room, sock: WebSocket, name: string): Seat {
  const ctx = sockCtx.get(sock)!;
  leaveCurrentRoom(sock);
  const playerId = rndId();
  const seat: Seat = {
    playerId,
    name: sanitizeName(name),
    hue: rndHue(),
    socket: sock,
    score: 0,
    pairsDone: 0,
    finished: null,
    lastSeen: now(),
    disconnectedAt: null,
  };
  r.seats.push(seat);
  if (!r.wins.has(playerId)) r.wins.set(playerId, 0);
  bindSock(sock, ctx, r.code, playerId);
  return seat;
}

/** старт раунда: startedAt — авторитарный; freshSeed = новый сид
 *  (реванш/следующий уровень; при входе соперника сид комнаты
 *  сохраняется — «создал комнату → сервер выдал seed» остаётся) */
function startRound(r: Room, t: number, freshSeed = true): void {
  if (freshSeed || !r.seed) r.seed = newSeed();
  r.result = null;
  r.startedAt = t + INTRO_BUDGET_MS;
  r.timeTotalMs = timeForLevel(r.level);
  r.status = 'playing';
  r.advanceBy.clear();
  for (const s of r.seats) {
    s.score = 0;
    s.pairsDone = 0;
    s.finished = null;
    s.lastSeen = t;
  }
}

/** тихо выйти сокетом из его комнаты (перед create/join/quick) */
function leaveCurrentRoom(sock: WebSocket): void {
  const ctx = sockCtx.get(sock);
  if (!ctx?.code) return;
  const r = rooms.get(ctx.code);
  const seat = r?.seats.find((x) => x.playerId === ctx.playerId);
  if (r && seat) {
    if (r.status === 'playing' && !r.result) {
      const other = r.seats.find((x) => x.playerId !== seat.playerId);
      if (other) {
        finishRoom(r, other.playerId, 'left', now());
        send(other.socket, { t: 'room', view: viewOf(r), playerId: other.playerId });
      }
    }
    if (seat.socket === sock) seat.socket = null;
    if (r.seats.every((x) => !x.socket || x.socket.readyState !== WebSocket.OPEN)) {
      rooms.delete(r.code);
    }
  }
  ctx.code = null;
  ctx.playerId = null;
}

/* ======================= АВТ-ИСХОДЫ / ГИГИЕНА ======================= */

/** авт-исходы комнаты; true — комнату удалить */
function autoRules(r: Room, t: number): boolean {
  if (t - r.createdAt > ROOM_TTL_MS) return true;

  if (r.status === 'waiting') {
    if (t - r.createdAt > WAITING_TTL_MS) return true;
    const host = r.seats[0];
    if (!host) return true;
    const gone = host.disconnectedAt !== null
      ? t - host.disconnectedAt > RECONNECT_WINDOW_MS
      : t - host.lastSeen > RECONNECT_WINDOW_MS;
    if (gone) return true; // хост не вернулся за 15 c — игра снята
    return false;
  }

  if (r.status === 'playing' && t >= r.startedAt) {
    for (const s of r.seats) {
      const other = r.seats.find((x) => x.playerId !== s.playerId);
      if (!other) continue;
      const gone = s.disconnectedAt !== null
        ? t - s.disconnectedAt > RECONNECT_WINDOW_MS
        : t - s.lastSeen > RECONNECT_WINDOW_MS;
      if (gone) {
        // соперник не переподключился за 15 c — победа остающегося
        finishRoom(r, other.playerId, 'disconnect', t);
        pushView(r);
        return false;
      }
    }
    if (t > r.startedAt + r.timeTotalMs) {
      const [a, b] = r.seats;
      if (a && b) {
        const winnerId = a.pairsDone !== b.pairsDone
          ? (a.pairsDone > b.pairsDone ? a.playerId : b.playerId)
          : (a.score >= b.score ? a.playerId : b.playerId);
        finishRoom(r, winnerId, 'timeout', t);
        pushView(r);
      }
      return false;
    }
  }

  if (r.status === 'result') {
    // все ушли — комнату можно убрать (итог уже доставлен)
    const allGone = r.seats.every((s) =>
      s.disconnectedAt !== null
        ? t - s.disconnectedAt > RECONNECT_WINDOW_MS
        : !s.socket || s.socket.readyState !== WebSocket.OPEN
    );
    if (allGone) return true;
  }
  return false;
}

/** пушить вьюху только когда присутствие игрока сменилось */
function presenceChanges(r: Room): boolean {
  const t = now();
  let changed = false;
  for (const s of r.seats) {
    const on = isOnline(s, t);
    const was = r.presenceSnap.get(s.playerId);
    if (was !== on) {
      r.presenceSnap.set(s.playerId, on);
      changed = true;
    }
  }
  return changed;
}

/* ============================== ЛОББИ ============================== */

function lobbyRooms(): unknown[] {
  const t = now();
  const list: unknown[] = [];
  for (const r of rooms.values()) {
    if (r.visibility !== 'open' || r.status !== 'waiting') continue;
    if (r.seats.length !== 1) continue;
    const host = r.seats[0];
    if (!isOnline(host, t)) continue;
    list.push({
      code: r.code,
      level: r.level,
      hostName: host.name,
      hue: host.hue,
      createdAt: r.createdAt,
      players: r.seats.length,
    });
    if (list.length >= 30) break;
  }
  return list;
}

function lobbyJson(): string {
  return JSON.stringify({ t: 'lobby', rooms: lobbyRooms() });
}

function pushLobby(): void {
  for (const [sock, ctx] of sockCtx) {
    if (!ctx.lobby || sock.readyState !== WebSocket.OPEN) continue;
    try {
      sock.send(lobbyJson());
    } catch {
      // ignore
    }
  }
}

function lobbyMaybeChanged(): void {
  const json = lobbyJson();
  if (json !== lobbyCache) {
    lobbyCache = json;
    pushLobby();
  }
}

/* ============================ ОБРАБОТЧИКИ ============================ */

interface Parsed {
  action: string;
  m: Record<string, unknown>;
}

function parseAction(raw: string): Parsed | null {
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m !== 'object') return null;
    const action = typeof m.action === 'string'
      ? m.action
      : typeof m.t === 'string'
        ? m.t
        : '';
    if (!action) return null;
    return { action, m };
  } catch {
    return null;
  }
}

function handleSocket(sock: WebSocket): void {
  const ctx: SockCtx = {
    name: 'Игрок',
    uid: '',
    code: null,
    playerId: null,
    lobby: false,
    lastSeen: now(),
  };
  sockCtx.set(sock, ctx);

  sock.onmessage = (ev) => {
    ctx.lastSeen = now();
    // присутствие игрока: любое сообщение обновляет lastSeen и его
    // места в комнате (свипер решает «в сети/ушёл» именно по нему)
    if (ctx.code) {
      const r = rooms.get(ctx.code);
      const seat = r?.seats.find((x) => x.playerId === ctx.playerId);
      if (seat) seat.lastSeen = ctx.lastSeen;
    }
    const p = parseAction(String(ev.data));
    if (!p) return;
    const { action, m } = p;

    /* ---------- представиться / вернуться в комнату ---------- */
    if (action === 'hello') {
      ctx.name = sanitizeName(m.name) || ctx.name;
      ctx.uid = typeof m.uid === 'string' ? m.uid.slice(0, 64) : '';
      reply(sock, { t: 'hello', ok: true }, m);
      // возврат в живую комнату (code+playerId, иначе — поиск по playerId)
      let room: Room | null = null;
      let seat: Seat | null = null;
      const code = normalizeCode(m.code);
      if (code) {
        const r = rooms.get(code);
        const s = r?.seats.find((x) => x.playerId === m.playerId) ?? null;
        if (r && s) {
          room = r;
          seat = s;
        }
      }
      if (!room && typeof m.playerId === 'string') {
        for (const r of rooms.values()) {
          const s = r.seats.find((x) => x.playerId === m.playerId);
          if (s) {
            room = r;
            seat = s;
            break;
          }
        }
      }
      if (room && seat) {
        // повторное подключение: прежний сокет (если жив) — заменить
        if (seat.socket && seat.socket !== sock && seat.socket.readyState === WebSocket.OPEN) {
          try {
            seat.socket.close(4001, 'takeover');
          } catch {
            // ignore
          }
          sockCtx.delete(seat.socket);
        }
        seat.socket = sock;
        seat.disconnectedAt = null;
        seat.lastSeen = now();
        seat.name = sanitizeName(m.name) || seat.name;
        bindSock(sock, ctx, room.code, seat.playerId);
        send(sock, { t: 'room', view: viewOf(room), playerId: seat.playerId });
        const other = room.seats.find((x) => x.playerId !== seat.playerId);
        if (other) send(other.socket, { t: 'room', view: viewOf(room), playerId: other.playerId });
        log(`reconnect ${room.code} seat=${seat.playerId.slice(0, 6)}`);
      }
      return;
    }

    /* ---------- создать игру ---------- */
    if (action === 'create') {
      dropTicket(sock);
      const name = sanitizeName(m.name);
      const level = clamp(Math.round(num(m.level, 1)), 1, 999);
      const visibility = m.visibility === 'open' ? 'open' : 'closed';
      const r = createRoom(sock, name, level, visibility);
      reply(
        sock,
        { t: 'room', view: viewOf(r), playerId: ctx.playerId },
        m,
      );
      lobbyMaybeChanged();
      return;
    }

    /* ---------- войти по коду ---------- */
    if (action === 'join') {
      dropTicket(sock);
      const code = normalizeCode(m.code);
      if (code.length !== CODE_LEN) {
        errOf(sock, m, 'BAD_CODE');
        return;
      }
      const r = rooms.get(code);
      if (!r) {
        errOf(sock, m, 'ROOM_NOT_FOUND');
        return;
      }
      if (r.status !== 'waiting' || r.seats.length >= 2) {
        errOf(sock, m, 'ROOM_FULL');
        return;
      }
      const seat = joinRoomSeat(r, sock, sanitizeName(m.name));
      startRound(r, now(), false); // сид — тот, что выдан при создании
      reply(sock, { t: 'room', view: viewOf(r), playerId: seat.playerId }, m);
      pushView(r);
      log(`join ${r.code} — старт (seed=${r.seed})`);
      lobbyMaybeChanged();
      return;
    }

    /* ---------- быстрый матч ---------- */
    if (action === 'quick') {
      dropTicket(sock);
      leaveCurrentRoom(sock); // своя ждущая комната больше не нужна
      const name = sanitizeName(m.name);
      const level = clamp(Math.round(num(m.level, 1)), 1, 999);
      // 1) есть ли ещё ждущий в очереди
      const other = tickets.find(
        (tk) => tk.sock !== sock && tk.sock.readyState === WebSocket.OPEN,
      );
      if (other) {
        tickets.splice(tickets.indexOf(other), 1);
        const r = createRoom(other.sock, other.name, other.level, 'closed');
        joinRoomSeat(r, sock, name);
        startRound(r, now());
        reply(sock, { t: 'room', view: viewOf(r), playerId: ctx.playerId }, m);
        // сопернику — пуш старта
        const host = r.seats[0];
        send(host.socket, { t: 'room', view: viewOf(r), playerId: host.playerId });
        log(`quick ${r.code} lvl=${r.level}`);
        return;
      }
      // 2) подсадка в открытую ждущую комнату с живым хостом
      const open = [...rooms.values()].find(
        (r) =>
          r.visibility === 'open' &&
          r.status === 'waiting' &&
          r.seats.length === 1 &&
          isOnline(r.seats[0], now()),
      );
      if (open) {
        const seat = joinRoomSeat(open, sock, name);
        startRound(open, now());
        reply(sock, { t: 'room', view: viewOf(open), playerId: seat.playerId }, m);
        pushView(open);
        log(`quick→open ${open.code}`);
        lobbyMaybeChanged();
        return;
      }
      // 3) в очередь — спарим, когда придёт второй
      tickets.push({ sock, name, level, at: now() });
      reply(sock, { t: 'search' }, m);
      return;
    }

    /** поддержка тикета (сердцебиение поиска) */
    if (action === 'quick-heart' || action === 'match-heart') {
      const level = clamp(Math.round(num(m.level, 1)), 1, 999);
      if (ctx.code && rooms.get(ctx.code)) {
        const r = rooms.get(ctx.code)!;
        reply(sock, { t: 'room', view: viewOf(r), playerId: ctx.playerId ?? undefined }, m);
        return;
      }
      let tk = tickets.find((x) => x.sock === sock);
      if (!tk) {
        tk = { sock, name: ctx.name || 'Игрок', level, at: now() };
        tickets.push(tk); // потерянный тикет — пересоздаём
      } else {
        tk.at = now();
        tk.level = level;
      }
      reply(sock, { t: 'search' }, m);
      tryPairQueue();
      return;
    }

    if (action === 'quick-leave' || action === 'match-leave') {
      dropTicket(sock);
      reply(sock, { t: 'ok' }, m);
      return;
    }

    /* ---------- состояние комнаты (присутствие + синк прогресса) ---------- */
    if (action === 'view') {
      const r = ctx.code ? rooms.get(ctx.code) : null;
      const seat = r?.seats.find((x) => x.playerId === ctx.playerId) ?? null;
      if (!r || !seat) {
        errOf(sock, m, 'ROOM_NOT_FOUND');
        return;
      }
      if (Number.isFinite(Number(m.score))) {
        seat.score = Math.max(seat.score, Math.round(Number(m.score)));
      }
      if (Number.isFinite(Number(m.pairsDone))) {
        seat.pairsDone = Math.max(seat.pairsDone, Math.round(Number(m.pairsDone)));
      }
      reply(sock, { t: 'room', view: viewOf(r), playerId: seat.playerId }, m);
      return;
    }

    /* ---------- собрал пару: короткое событие, релея сопернику ---------- */
    if (action === 'match' || action === 'event') {
      const r = ctx.code ? rooms.get(ctx.code) : null;
      const seat = r?.seats.find((x) => x.playerId === ctx.playerId) ?? null;
      if (!r || !seat || r.status !== 'playing') return; // молча: событие неактуально
      const tile1Id = Math.round(num(m.tile1Id, 0));
      const tile2Id = Math.round(num(m.tile2Id, 0));
      seat.pairsDone = Math.max(seat.pairsDone + 1, Math.round(num(m.pairsDone, 0)));
      if (Number.isFinite(Number(m.score))) {
        seat.score = Math.max(seat.score, Math.round(Number(m.score)));
      }
      const other = r.seats.find((x) => x.playerId !== seat.playerId);
      if (other) {
        send(other.socket, {
          t: 'event',
          kind: 'match',
          playerId: seat.playerId,
          tile1Id,
          tile2Id,
          score: seat.score,
          pairsDone: seat.pairsDone,
        });
      }
      return; // rid-ответа нет: событие «выстрелил и забыл»
    }

    /* ---------- «я прошёл уровень» — авторитарное время ---------- */
    if (action === 'finish') {
      const r = ctx.code ? rooms.get(ctx.code) : null;
      const seat = r?.seats.find((x) => x.playerId === ctx.playerId) ?? null;
      if (!r || !seat) {
        errOf(sock, m, 'ROOM_NOT_FOUND');
        return;
      }
      if (Number.isFinite(Number(m.score))) {
        seat.score = Math.max(seat.score, Math.round(Number(m.score)));
      }
      if (Number.isFinite(Number(m.pairsDone))) {
        seat.pairsDone = Math.max(seat.pairsDone, Math.round(Number(m.pairsDone)));
      }
      const reason = m.reason === 'tray' ? 'tray' : 'cleared';
      let fresh = false;
      if (r.status === 'playing') {
        applyFinish(r, seat, reason, now());
        fresh = true;
      }
      reply(sock, { t: 'room', view: viewOf(r), playerId: seat.playerId }, m);
      if (fresh) pushView(r); // обоим — итог с серверным временем result.timeMs
      return;
    }

    /* ---------- реванш / следующий уровень (оба согласны) ---------- */
    if (action === 'advance') {
      const r = ctx.code ? rooms.get(ctx.code) : null;
      const seat = r?.seats.find((x) => x.playerId === ctx.playerId) ?? null;
      if (!r || !seat) {
        errOf(sock, m, 'ROOM_NOT_FOUND');
        return;
      }
      if (r.status === 'result' && r.seats.length === 2) {
        const kind: 'rematch' | 'next' = m.kind === 'next' ? 'next' : 'rematch';
        r.advanceBy.set(seat.playerId, kind);
        const [a, b] = r.seats;
        const ka = a ? r.advanceBy.get(a.playerId) : undefined;
        const kb = b ? r.advanceBy.get(b.playerId) : undefined;
        if (ka && kb && ka === kb) {
          // оба согласны — новый матч (серия НЕ сбрасывается)
          r.advanceBy.clear();
          if (kind === 'next') r.level = clamp(r.level + 1, 1, 999);
          startRound(r, now());
          log(`advance ${r.code} ${kind} lvl=${r.level} seed=${r.seed}`);
        }
        reply(sock, { t: 'room', view: viewOf(r), playerId: seat.playerId }, m);
        pushView(r); // и голос, и старт нового раунда — обоим
      } else {
        reply(sock, { t: 'room', view: viewOf(r), playerId: seat.playerId }, m);
      }
      return;
    }

    /* ---------- выйти из комнаты ---------- */
    if (action === 'leave') {
      const r = ctx.code ? rooms.get(ctx.code) : null;
      const seat = r?.seats.find((x) => x.playerId === ctx.playerId) ?? null;
      if (r && seat) {
        if (seat.socket === sock) seat.socket = null;
        seat.disconnectedAt = now();
        if (r.status === 'playing' && !r.result) {
          const other = r.seats.find((x) => x.playerId !== seat.playerId);
          if (other) {
            finishRoom(r, other.playerId, 'left', now());
            send(other.socket, { t: 'room', view: viewOf(r), playerId: other.playerId });
          }
        }
        if (r.status === 'waiting') {
          rooms.delete(r.code);
          lobbyMaybeChanged();
        }
        // «result» не удаляем: соперник ещё смотрит итог и может
        // выйти сам — свипер уберёт комнату, когда уйдут оба
        log(`leave ${r.code} seat=${seat.playerId.slice(0, 6)}`);
      }
      ctx.code = null;
      ctx.playerId = null;
      reply(sock, { t: 'ok' }, m);
      return;
    }

    /* ---------- лобби открытых игр ---------- */
    if (action === 'lobby') {
      ctx.lobby = m.on !== false;
      reply(sock, { t: 'lobby', rooms: lobbyRooms() }, m);
      if (ctx.lobby) {
        lobbyCache = ''; // форсируем следующий пуш с изменениями
      }
      return;
    }

    /* ---------- жив (ответ на hb / воркер свёрнутой вкладки) ---------- */
    if (action === 'ping') {
      send(sock, { t: 'pong' });
      return;
    }
  };

  sock.onclose = () => {
    sockCtx.delete(sock);
    dropTicket(sock);
    const r = ctx.code ? rooms.get(ctx.code) : null;
    const seat = r?.seats.find((x) => x.playerId === ctx.playerId) ?? null;
    if (r && seat) {
      if (seat.socket === sock) {
        seat.socket = null;
        seat.disconnectedAt = now(); // окно реконнекта — 15 c
        // сопернику сразу вьюху: «игрок потерял связь»
        const other = r.seats.find((x) => x.playerId !== seat.playerId);
        if (other) send(other.socket, { t: 'room', view: viewOf(r), playerId: other.playerId });
      }
    }
  };

  sock.onerror = () => {
    // закрытие обработает onclose
  };
}

/* ============================ ТИКИ СЕРВЕРА ============================ */

/** сердцебиение: каждые 3 c всем открытым сокетам */
setInterval(() => {
  const hb = JSON.stringify({ t: 'hb' });
  for (const sock of sockCtx.keys()) {
    if (sock.readyState !== WebSocket.OPEN) continue;
    try {
      sock.send(hb);
    } catch {
      // ignore
    }
  }
}, HB_INTERVAL_MS);

/** авт-исходы и гигиена */
setInterval(() => {
  const t = now();
  for (const [code, r] of rooms) {
    if (autoRules(r, t)) {
      rooms.delete(code);
      lobbyMaybeChanged();
      continue;
    }
    if (presenceChanges(r)) {
      pushView(r); // «соперник в сети/потерял связь» — вовремя
    }
  }
  // очередь: мёртвые тикеты вон, двое ждущих — пара
  for (let i = tickets.length - 1; i >= 0; i--) {
    const tk = tickets[i];
    if (tk.sock.readyState !== WebSocket.OPEN || t - tk.at > 30_000) {
      tickets.splice(i, 1);
    }
  }
  tryPairQueue();
  lobbyMaybeChanged();
}, SWEEP_INTERVAL_MS);

/** лобби подписчикам — не чаще раза в 2 c (живость списка) */
setInterval(() => {
  let subscribed = false;
  for (const [, ctx] of sockCtx) {
    if (ctx.lobby) {
      subscribed = true;
      break;
    }
  }
  if (subscribed) pushLobby();
}, LOBBY_PUSH_MS);

/* ============================== HTTP/WS ============================== */

Deno.serve({ port: PORT }, (req) => {
  const upgrade = req.headers.get('upgrade') ?? '';
  if (upgrade.toLowerCase() !== 'websocket') {
    // лёгкий health-check: curl http://vps:8081/
    return new Response(
      JSON.stringify({ ok: true, multiplayer: 'mahjong-duel', port: PORT, rooms: rooms.size }),
      { headers: { 'content-type': 'application/json' } },
    );
  }
  try {
    const { socket, response } = Deno.upgradeWebSocket(req);
    handleSocket(socket);
    return response;
  } catch {
    return new Response('upgrade failed', { status: 400 });
  }
});

log(`сервер слушает :${PORT} · VPS-режим (память, без KV) · окно реконнекта ${RECONNECT_WINDOW_MS / 1000} c`);
