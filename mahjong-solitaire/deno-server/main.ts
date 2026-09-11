/**
 * ============================================================================
 *  МАДЖОНГ-ДУЭЛИ — сервер на Deno Deploy (WebSocket)
 * ============================================================================
 *
 *  ЗАЧЕМ: Vercel serverless убивает процесс без активности — поллинг
 *  обрывался, матч «зависал». Deno Deploy держит WebSocket сколько
 *  нужно, а состояние живёт в Deno KV (переживает рестарты изолятов).
 *
 *  АРХИТЕКТУРА (событийная модель + авторитарный сервер):
 *   — КЛИЕНТЫ играют каждый свою доску, сгенерированную по СИДУ
 *     (seed) — сид выдаёт сервер при старте матча → раскладки
 *     идентичны у обоих (движок клиентов детерминирован).
 *   — СОБЫТИЯ: клиент при сборе пары шлёт короткое событие
 *     { t:'event', tile1Id, tile2Id, score, pairsDone } — сервер
 *     заносит прогресс в KV и пересылает событие сопернику (его
 *     прогресс-бар прыгает мгновенно, без поллинга).
 *   — ВРЕМЯ АВТОРИТАРНО: сервер сам пишет startedAt по своим часам;
 *     на «я прошёл» (finish) сам считает разницу → finalTimeMs
 *     уходит обоим. Накрутить таймер на телефоне нельзя.
 *   — РЕКОННЕКТ: обрыв связи ≠ выход. Сокет закрылся — игрок
 *     числится «не в сети» (банер сопернику), но место в комнате
 *     держится 30 секунд. Клиент молча переподключается и делает
 *     hello с тем же uid → комната та же, матч продолжается.
 *
 *  КРОСС-ИЗОЛЯТНОСТЬ (Deno Deploy крутит несколько изолятов):
 *   — Комнаты и тикеты матчмейкинга лежат в Deno KV — единственный
 *     источник правды; изменения идут через atomic CAS (без гонок).
 *   — kv.watch() — веерная рассылка: изолят следит за комнатами,
 *     в которых есть ЕГО сокеты; любое изменение комнаты (хоть с
 *     другого изолята) прилетает watcher'у → вид летит клиентам.
 *   — Присутствие (кто онлайн) — BroadcastChannel: каждый изолят
 *     раз в 2с объявляет список своих uid; все складывают в общую
 *     карту. Онлайн = uid есть в свежих объявлениях.
 *   — Личные адресные сообщения (матчмейкинг «нашли пару») —
 *     BroadcastChannel 'mj-notify' по uid + локальная доставка
 *     (свой контекст BroadcastChannel НЕ получает свои сообщения).
 *
 *  БЕЗ KV-БАЗЫ: в новом дашборде Deno Deploy базу надо создавать
 *  и привязывать к проекту вручную. Если её нет — сервер НЕ
 *  падает, а работает в памяти процесса (MemoryKv ниже): играть
 *  можно, но комнаты не переживут рестарт изолята.
 *
 *  ЗАПУСК ЛОКАЛЬНО:  deno task dev   (порт 8080, KV в ./deno-kv)
 *  ДЕПЛОЙ:          deno deployctl deploy (см. README.md)
 */

/* ============================ константы ============================ */

/** запас на интро-карточку и отсчёт 3-2-1 у обоих игроков */
const INTRO_BUDGET_MS = 8000;
/** uid считается «в сети», пока его объявляли не позже этого */
const PRESENCE_FRESH_MS = 7000;
/** так долго нет игрока (сокет закрыт и не вернулся) → победа
 *  соперника по отключению. Короткие обрывы НЕ рвут матч */
const ONLINE_GRACE_MS = 30000;
/** время на пару — как в матче против бота */
const TIME_PER_PAIR_MS = 4500;
const TIME_MIN_MS = 90000;
const TIME_MAX_MS = 270000;
/** комнаты живут 6 часов, «ожидание друга» — час */
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const WAITING_TTL_MS = 60 * 60 * 1000;
/** создатель «ждущей» комнаты пропал — убираем игру из лобби */
const WAITING_HOST_STALE_MS = 45 * 1000;
/** максимум записей в списке открытых игр */
const OPEN_LIST_MAX = 30;
/** тикет матчмейкинга: носителя нет в сети дольше этого → выброс */
const TICKET_STALE_MS = 25 * 1000;
/** период объявления присутствия (мс) */
const PRESENCE_TICK_MS = 2000;
/** период обновления лобби (мс) */
const LOBBY_TICK_MS = 2000;
/** период серверного sweeper'а (мс) */
const SWEEP_TICK_MS = 1000;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без I O 0 1
const CODE_LEN = 5;

/* ============================ раскладки ============================ */

/** (id, сложность, число плиток) — зеркала src/lib/mahjong/layouts.ts;
 *  серверу нужен только размер доски (для времени на матч) */
const LAYOUTS: { id: string; difficulty: number; tiles: number }[] = [
  { id: 'spire', difficulty: 1, tiles: 28 },
  { id: 'stele', difficulty: 1, tiles: 36 },
  { id: 'gate', difficulty: 2, tiles: 40 },
  { id: 'stairs', difficulty: 2, tiles: 42 },
  { id: 'cross', difficulty: 3, tiles: 44 },
  { id: 'pyramid', difficulty: 3, tiles: 52 },
  { id: 'bastion', difficulty: 4, tiles: 64 },
  { id: 'palace', difficulty: 4, tiles: 64 },
  { id: 'crown', difficulty: 5, tiles: 72 },
  { id: 'fortress', difficulty: 5, tiles: 80 },
];

/** сколько плиток у уровня (детерминированно, как у клиентов) */
function tilesForLevel(level: number): number {
  const d = Math.min(5, Math.max(1, ((level - 1) % 5) + 1));
  const bucket = LAYOUTS.filter((l) => l.difficulty === d);
  if (bucket.length === 0) return LAYOUTS[0].tiles;
  const cycle = Math.floor((level - 1) / 5);
  return bucket[cycle % bucket.length].tiles;
}

function timeForLevel(level: number): number {
  const pairs = tilesForLevel(level) / 2;
  return Math.min(TIME_MAX_MS, Math.max(TIME_MIN_MS, pairs * TIME_PER_PAIR_MS));
}

/* ============================ типы ============================ */

type RoomStatus = 'waiting' | 'playing' | 'result';
type FinishReason = 'cleared' | 'tray' | 'timeout' | 'disconnect' | 'left';

interface RoomPlayer {
  id: string;
  /** устройство игрока (привязка места в комнате — реконнект) */
  uid: string;
  name: string;
  hue: number;
  score: number;
  pairsDone: number;
  finished: 'cleared' | 'tray' | null;
}

interface RoomResult {
  winnerId: string;
  reason: FinishReason;
  /** АВТОРИТАРНОЕ время победителя (мс от старта отсчёта) */
  finalTimeMs: number | null;
  at: number;
}

interface RoomDoc {
  /** версия для CAS (растёт при каждом изменении) */
  v: number;
  code: string;
  level: number;
  seed: number;
  status: RoomStatus;
  hostId: string;
  visibility: 'open' | 'closed';
  /** epoch-ms старта отсчёта (с запасом на интро) — ПО ЧАСАМ СЕРВЕРА */
  startedAt: number;
  timeTotalMs: number;
  createdAt: number;
  result: RoomResult | null;
  players: RoomPlayer[];
  /** СЧЁТ СЕРИИ: сколько матчей в этой комнате выиграл каждый
   *  игрок (playerId → победы). НЕ сбрасывается на реванше/
   *  следующем уровне — серия живёт, пока оба играют друг с
   *  другом; выход игрока убивает комнату */
  winsBy: Record<string, number>;
  /** согласия на реванш/следующий уровень: playerId → kind */
  advanceBy: Record<string, 'rematch' | 'next'>;
  /** последнее событие «пара собрана» (для мгновенного релея) */
  lastEvent: {
    seq: number;
    playerId: string;
    tile1Id: number;
    tile2Id: number;
    score: number;
    pairsDone: number;
  } | null;
}

interface TicketDoc {
  uid: string;
  name: string;
  hue: number;
  level: number;
  createdAt: number;
  lastSeen: number;
  paired: { code: string; playerId: string } | null;
}

/* публичный вид комнаты — то же самое, что видит клиент */
interface RoomView {
  code: string;
  status: RoomStatus;
  level: number;
  seed: number;
  hostId: string;
  timeTotalMs: number;
  startedAt: number;
  serverNow: number;
  players: {
    id: string;
    name: string;
    hue: number;
    score: number;
    pairsDone: number;
    online: boolean;
    finished: 'cleared' | 'tray' | null;
    /** побед в СЕРИИ этой комнаты (сколько матчей выиграл) */
    wins: number;
  }[];
  result: { winnerId: string; reason: FinishReason; finalTimeMs: number | null } | null;
  visibility: 'open' | 'closed';
  advanceOffers: { playerId: string; kind: 'rematch' | 'next' }[];
}

interface OpenRoomInfo {
  code: string;
  level: number;
  hostName: string;
  hue: number;
  createdAt: number;
  players: number;
}

/* ============================ KV / каналы ============================ */

/* -- ФОЛБЭК НА ПАМЯТЬ -------------------------------------------------
 * В новом дашборде Deno Deploy KV-база НЕ создаётся автоматически:
 * пока она не привязана к приложению, Deno.openKv() бросает
 * TypeError ("no KV Database is attached to this app") и деплой
 * умирает на старте. Мы ловим ошибку и продолжаем работать поверх
 * обычной Map — с теми же семантиками, что использует этот сервер
 * (get / set / delete / list / atomic CAS).
 *
 * Ограничения режима памяти: состояние НЕ переживает рестарт
 * изолята, изоляты не видят комнаты друг друга. Правильный режим —
 * привязать KV-базу: dash.deno.com → проект → Settings → Databases
 * → Create/Attach → Redeploy (подробно в README.md). Принудительно
 * включить память для отладки — переменная окружения MJ_KV=memory. */

interface KvEntryLike<T> {
  key: readonly unknown[];
  value: T | null;
  versionstamp: string | null;
}

interface KvCheck {
  key: readonly unknown[];
  versionstamp: string | null;
}

interface KvAtomic {
  check(...items: KvCheck[]): KvAtomic;
  set(key: readonly unknown[], value: unknown): KvAtomic;
  delete(key: readonly unknown[]): KvAtomic;
  commit(): Promise<{ ok: boolean }>;
}

/** минимальное подмножество KV-API, нужное этому серверу */
interface KvLike {
  get<T>(key: readonly unknown[]): Promise<KvEntryLike<T>>;
  set(key: readonly unknown[], value: unknown): Promise<{ ok: boolean }>;
  delete(key: readonly unknown[]): Promise<void>;
  list<T>(selector: { prefix: readonly unknown[] }): AsyncIterable<{
    key: readonly unknown[];
    value: T;
    versionstamp: string;
  }>;
  atomic(): KvAtomic;
}

/** KV поверх Map: те же семантики для одного процесса */
class MemoryKv implements KvLike {
  #store = new Map<string, { key: readonly unknown[]; value: unknown; vs: string }>();
  #n = 0;

  #ks(key: readonly unknown[]): string {
    // «string:room|string:CODE» — типовой префикс, чтобы
    // prefix ['room'] не зацепил случайно ключ ['rooms']
    return key.map((p) => `${typeof p}:${String(p)}`).join('|');
  }

  #bump(): string {
    return `m${++this.#n}`;
  }

  async get<T>(key: readonly unknown[]): Promise<KvEntryLike<T>> {
    const e = this.#store.get(this.#ks(key));
    return e
      ? { key: e.key, value: e.value as T, versionstamp: e.vs }
      : { key, value: null, versionstamp: null };
  }

  async set(key: readonly unknown[], value: unknown): Promise<{ ok: boolean }> {
    const ks = this.#ks(key);
    const e = this.#store.get(ks);
    if (e) {
      e.value = value;
      e.vs = this.#bump();
    } else {
      this.#store.set(ks, { key, value, vs: this.#bump() });
    }
    return { ok: true };
  }

  async delete(key: readonly unknown[]): Promise<void> {
    this.#store.delete(this.#ks(key));
  }

  async *list<T>(
    selector: { prefix: readonly unknown[] },
  ): AsyncGenerator<{ key: readonly unknown[]; value: T; versionstamp: string }> {
    const p = this.#ks(selector.prefix);
    for (
      const ks of [...this.#store.keys()]
        .filter((k) => k === p || k.startsWith(p + '|'))
        .sort()
    ) {
      const e = this.#store.get(ks)!;
      yield { key: e.key, value: e.value as T, versionstamp: e.vs };
    }
  }

  atomic(): KvAtomic {
    const ksOf = (k: readonly unknown[]) => this.#ks(k);
    const store = this.#store;
    const bump = () => this.#bump();
    const checks: KvCheck[] = [];
    const ops: (() => void)[] = [];
    return {
      check(...items) {
        checks.push(...items);
        return this;
      },
      set(key, value) {
        ops.push(() => {
          const ks = ksOf(key);
          const e = store.get(ks);
          if (e) {
            e.value = value;
            e.vs = bump();
          } else {
            store.set(ks, { key, value, vs: bump() });
          }
        });
        return this;
      },
      delete(key) {
        ops.push(() => store.delete(ksOf(key)));
        return this;
      },
      async commit() {
        // проверки и применение без await между ними — атомарно
        // в пределах одного процесса (JS однопотен)
        for (const c of checks) {
          const e = store.get(ksOf(c.key));
          if ((e ? e.vs : null) !== c.versionstamp) return { ok: false };
        }
        for (const op of ops) op();
        return { ok: true };
      },
    };
  }
}

/** чем храним состояние — видно в /health */
let kvMode: 'deno' | 'memory' = 'deno';

/** открыть KV; если к приложению не привязана база (типичная
 *  ситуация в новом дашборде Deno Deploy) — не умирать, а
 *  перейти на память процесса */
async function openKvSafe(): Promise<KvLike> {
  if (Deno.env.get('MJ_KV') === 'memory') {
    console.warn('[kv] MJ_KV=memory — принудительный режим памяти');
    kvMode = 'memory';
    return new MemoryKv();
  }
  try {
    return await Deno.openKv() as unknown as KvLike;
  } catch (err) {
    console.warn(
      '[kv] Deno.openKv() не смог открыться: ' +
        (err instanceof Error ? err.message : String(err)),
    );
    console.warn(
      '[kv] Работаем в РЕЖИМЕ ПАМЯТИ: сервер жив и игры работают, ' +
        'но комнаты сбросятся при рестарте изолята.',
    );
    console.warn(
      '[kv] Починка: dash.deno.com → проект → Settings → Databases → ' +
        'создать и привязать KV-базу → Redeploy (подробно: README.md).',
    );
    kvMode = 'memory';
    return new MemoryKv();
  }
}

const kv = await openKvSafe();

const ISOLATE = crypto.randomUUID();

/** объявления присутствия: каждый изолят перечисляет свои uid'ы */
const presenceChan = new BroadcastChannel('mj-presence');
/** адресные сообщения конкретному uid (матчмейкинг) */
const notifyChan = new BroadcastChannel('mj-notify');

/** uid → когда его последний раз объявлял «свой» изолят */
const presence = new Map<string, number>();

/* ============================ соединения ============================ */

interface Conn {
  socket: WebSocket;
  uid: string;
  name: string;
  roomCode: string | null;
  playerId: string | null;
  /** клиент хочет обновления лобби */
  lobby: boolean;
}

const conns = new Map<WebSocket, Conn>();
const connsByUid = new Map<string, Conn>();

function send(conn: Conn, msg: Record<string, unknown>) {
  try {
    if (conn.socket.readyState === WebSocket.OPEN) {
      conn.socket.send(JSON.stringify(msg));
    }
  } catch {
    // сокет уже мёртв — почистится в onclose
  }
}

function detachConn(conn: Conn) {
  if (conn.roomCode) {
    const w = roomWatchers.get(conn.roomCode);
    if (w) {
      w.refs.delete(conn.socket);
      if (w.refs.size === 0) stopWatcher(conn.roomCode);
    }
  }
  conn.roomCode = null;
  conn.playerId = null;
}

/** прикрепить соединение к комнате (+следить за её изменениями) */
function attachConn(conn: Conn, code: string, playerId: string) {
  detachConn(conn);
  conn.roomCode = code;
  conn.playerId = playerId;
  ensureWatcher(code).refs.add(conn.socket);
}

/* ============================ watchers (веер KV) ============================ */

/** период опроса документа комнаты (мс): изменения с ЛЮБОГО
 *  изолята доходят клиентам максимум за это время. Мутации этого
 *  изолята доставляются сразу — deliverDoc ниже */
const WATCH_POLL_MS = 500;

interface Watcher {
  refs: Set<WebSocket>;
  stopped: boolean;
  lastVersionstamp: string | null;
  lastEventSeq: number;
  /** последний известный документ (для просмотров присутствия) */
  lastDoc: RoomDoc | null;
  /** сигнатура онлайн-флагов последнего отправленного вида */
  lastOnlineSig: string;
}

const roomWatchers = new Map<string, Watcher>();

function ensureWatcher(code: string): Watcher {
  let w = roomWatchers.get(code);
  if (w) return w;
  w = {
    refs: new Set(),
    stopped: false,
    lastVersionstamp: null,
    lastEventSeq: 0,
    lastDoc: null,
    lastOnlineSig: '',
  };
  roomWatchers.set(code, w);
  runWatcher(code, w);
  return w;
}

function stopWatcher(code: string) {
  const w = roomWatchers.get(code);
  if (!w) return;
  w.stopped = true;
  roomWatchers.delete(code);
}

/** сигнатура «кто онлайн» — меняется при обрыве/возврате игроков */
function onlineSig(doc: RoomDoc): string {
  return doc.players.map((p) => (isOnline(p.uid) ? '1' : '0')).join('');
}

/** доставить свежий документ комнаты локальным сокетам:
 *  новый вид + событие «пара собрана». Обновляет счётчик событий,
 *  чтобы одно и то же не уходило дважды */
function deliverDoc(code: string, w: Watcher, doc: RoomDoc | null) {
  if (roomWatchers.get(code) !== w) return;
  if (!doc) {
    // комнату удалили (вышли все / TTL) — локальным скажем честно
    for (const s of [...w.refs]) {
      const c = conns.get(s);
      if (c && c.roomCode === code) {
        send(c, { t: 'err', code: 'ROOM_NOT_FOUND' });
        detachConn(c);
      }
    }
    if (w.refs.size === 0) stopWatcher(code);
    return;
  }
  w.lastDoc = doc;
  w.lastOnlineSig = onlineSig(doc);
  const view = viewOf(doc);
  for (const s of w.refs) {
    const c = conns.get(s);
    if (c && c.roomCode === code) send(c, { t: 'room', view });
  }
  // событие «пара собрана» — релей обоим (клиент фильтрует своё)
  if (doc.lastEvent && doc.lastEvent.seq > w.lastEventSeq) {
    w.lastEventSeq = doc.lastEvent.seq;
    const ev = {
      t: 'event',
      kind: 'match',
      playerId: doc.lastEvent.playerId,
      tile1Id: doc.lastEvent.tile1Id,
      tile2Id: doc.lastEvent.tile2Id,
      score: doc.lastEvent.score,
      pairsDone: doc.lastEvent.pairsDone,
    };
    for (const s of w.refs) {
      const c = conns.get(s);
      if (c && c.roomCode === code) send(c, ev);
    }
  }
}

/** сразу показать локальным клиентам результат мутации этого
 *  изолята — без ожидания поллинга (0 мс вместо ≤500 мс) */
function deliverLocal(code: string, doc: RoomDoc | null) {
  const w = roomWatchers.get(code);
  if (!w) return;
  if (doc) w.lastVersionstamp = `local-${doc.v}`;
  deliverDoc(code, w, doc);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** следим за документом комнаты: опрашиваем версию в KV — любое
 *  изменение (хоть с другого изолята) → новый вид всем ЛОКАЛЬНЫМ
 *  сокетам этой комнаты */
async function runWatcher(code: string, w: Watcher) {
  while (!w.stopped) {
    try {
      const entry = await kv.get<RoomDoc>(['room', code]);
      const vs = entry.versionstamp;
      // «local-N» ставится deliverLocal — первая реальная версия
      // из KV всё равно отличается → одно лишнее отправление вида
      // (безвредно: applyRoomView у клиента идемпотентен)
      if (vs !== w.lastVersionstamp) {
        w.lastVersionstamp = vs;
        deliverDoc(code, w, entry.value ?? null);
      }
    } catch {
      // временный сбой KV — следующий тик
    }
    await sleep(WATCH_POLL_MS);
  }
}

/* ============================ присутствие ============================ */

function localUids(): string[] {
  return [...connsByUid.keys()];
}

/** присутствие изменилось → перепушить виды комнат, где поменялись
 *  онлайн-флаги (банер «соперник потерял связь» появляется вовремя,
 *  а возврат игрока — сразу виден) */
function refreshPresenceViews() {
  for (const [code, w] of [...roomWatchers]) {
    if (!w.lastDoc || w.refs.size === 0) continue;
    const sig = onlineSig(w.lastDoc);
    if (sig !== w.lastOnlineSig) {
      deliverDoc(code, w, w.lastDoc);
    }
  }
}

function announcePresence() {
  presenceChan.postMessage({ i: ISOLATE, uids: localUids() });
  const now = Date.now();
  for (const uid of localUids()) presence.set(uid, now);
}

presenceChan.onmessage = (ev) => {
  const data = ev.data as { i?: string; uids?: string[] };
  if (!data || data.i === ISOLATE || !Array.isArray(data.uids)) return;
  const now = Date.now();
  for (const uid of data.uids) presence.set(uid, now);
};

/** онлайн = uid объявлялся недавно (свой или чужой изолят) */
function isOnline(uid: string): boolean {
  const at = presence.get(uid);
  return at != null && Date.now() - at < PRESENCE_FRESH_MS;
}

/** давно пропал? (для отключений и чистки лобби/тикетов) */
function goneMs(uid: string): number {
  const at = presence.get(uid);
  return at == null ? Infinity : Date.now() - at;
}

/* ============================ адресные уведомления ============================ */

/** доставить сообщение устройству uid: локально + во все изоляты */
function notifyUid(uid: string, msg: Record<string, unknown>) {
  const c = connsByUid.get(uid);
  if (c) send(c, msg);
  notifyChan.postMessage({ uid, msg });
}

notifyChan.onmessage = (ev) => {
  const data = ev.data as { uid?: string; msg?: Record<string, unknown> };
  if (!data?.uid || !data.msg) return;
  const c = connsByUid.get(data.uid);
  if (c) send(c, data.msg);
};

/* ============================ helpers ============================ */

const now = () => Date.now();
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const rndId = () =>
  Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36)).join('');

const rndHue = () => Math.floor(Math.random() * 360);

const newSeed = () => Math.floor(Math.random() * 0x7fffffff);

function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  const cut = [...s].slice(0, 16).join('');
  return cut.length > 0 ? cut : 'Игрок';
}

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return c.length === CODE_LEN && [...c].every((ch) => CODE_CHARS.includes(ch)) ? c : null;
}

function viewOf(doc: RoomDoc): RoomView {
  return {
    code: doc.code,
    status: doc.status,
    level: doc.level,
    seed: doc.seed,
    hostId: doc.hostId,
    timeTotalMs: doc.timeTotalMs,
    startedAt: doc.startedAt,
    serverNow: now(),
    players: doc.players.map((p) => ({
      id: p.id,
      name: p.name,
      hue: p.hue,
      score: Math.round(p.score),
      pairsDone: p.pairsDone,
      online: isOnline(p.uid),
      finished: p.finished,
      wins: doc.winsBy?.[p.id] ?? 0,
    })),
    result: doc.result
      ? {
        winnerId: doc.result.winnerId,
        reason: doc.result.reason,
        finalTimeMs: doc.result.finalTimeMs,
      }
      : null,
    visibility: doc.visibility,
    advanceOffers: Object.entries(doc.advanceBy).map(([playerId, kind]) => ({
      playerId,
      kind,
    })),
  };
}

/* ============================ мутации комнат (CAS) ============================ */

const NO_CHANGE = Symbol('no-change');

/**
 * Атомарно изменить документ комнаты: читаем → применяем fn →
 * CAS-коммит. Гонки между изолятами невозможны — проигравший
 * перечитывает и пробует снова. fn возвращает NO_CHANGE, если
 * менять ничего не нужно.
 */
async function mutateRoom<T = unknown>(
  code: string,
  fn: (doc: RoomDoc) => T,
): Promise<{ doc: RoomDoc; out: T } | null> {
  for (let attempt = 0; attempt < 7; attempt++) {
    const entry = await kv.get<RoomDoc>(['room', code]);
    if (!entry.value) return null;
    const draft = structuredClone(entry.value);
    const out = fn(draft);
    if (out === NO_CHANGE) return { doc: entry.value, out: out as never };
    draft.v = (draft.v ?? 0) + 1;
    const commit = await kv.atomic()
      .check({ key: ['room', code], versionstamp: entry.versionstamp })
      .set(['room', code], draft)
      .commit();
    if (commit.ok) return { doc: draft, out };
    // конфликт: кто-то изменил раньше — перечитываем
  }
  return null;
}

async function getRoom(code: string): Promise<RoomDoc | null> {
  const e = await kv.get<RoomDoc>(['room', code]);
  return e.value ?? null;
}

/* ============================ лобби ============================ */

async function buildLobby(): Promise<OpenRoomInfo[]> {
  const out: OpenRoomInfo[] = [];
  const t = now();
  for await (const entry of kv.list<RoomDoc>({ prefix: ['room'] })) {
    const r = entry.value;
    if (r.status !== 'waiting' || r.visibility !== 'open') continue;
    const host = r.players[0];
    if (!host || r.players.length >= 2) continue;
    if (t - r.createdAt > WAITING_TTL_MS) continue;
    if (goneMs(host.uid) > WAITING_HOST_STALE_MS) continue;
    out.push({
      code: r.code,
      level: r.level,
      hostName: host.name,
      hue: host.hue,
      createdAt: r.createdAt,
      players: r.players.length,
    });
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out.slice(0, OPEN_LIST_MAX);
}

async function pushLobby() {
  const wantLobby = [...conns.values()].some((c) => c.lobby);
  if (!wantLobby) return;
  const rooms = await buildLobby();
  for (const c of conns.values()) {
    if (c.lobby) send(c, { t: 'lobby', rooms });
  }
}

/* ============================ матчмейкинг ============================ */

/** матчмейкинг СЕРИАЛИЗОВАН: два одновременных «найти игру» не
 *  должны проверить очередь до того, как оба тикета записаны */
let matchmakingChain: Promise<void> = Promise.resolve();

function scheduleMatchfinding(conn: Conn, rid?: number | string): Promise<void> {
  matchmakingChain = matchmakingChain
    .then(async () => {
      await tryMatchAll();
      // ответ просившему: нашли сразу или пока ищем
      const fresh = await kv.get<TicketDoc>(['ticket', conn.uid]);
      if (conn.roomCode) {
        // подобрали! (push {t:'room'} уже ушёл через notifyUid) —
        // подтвердим и ответом на запрос
        const doc = await getRoom(conn.roomCode);
        if (doc) send(conn, { t: 'room', view: viewOf(doc), playerId: conn.playerId, rid });
        return;
      }
      if (!fresh.value?.paired) send(conn, { t: 'mm', status: 'search', rid });
    })
    .catch(() => {});
  return matchmakingChain;
}

async function tryMatchAll(): Promise<void> {
  const t = now();
  const tickets: TicketDoc[] = [];
  for await (const entry of kv.list<TicketDoc>({ prefix: ['ticket'] })) {
    const tk = entry.value;
    if (!tk.paired && t - tk.lastSeen < TICKET_STALE_MS) tickets.push(tk);
  }
  tickets.sort((a, b) => a.createdAt - b.createdAt);
  // соединяем по двое: уровень — того, кто раньше встал в очередь
  for (let i = 0; i + 1 < tickets.length; i += 2) {
    const ok = await pairTickets(tickets[i], tickets[i + 1]);
    if (!ok) return; // конфликт — попробуем при следующем вызове
  }
  // остался один — может, есть открытая комната?
  if (tickets.length % 2 === 1) {
    const tk = tickets[tickets.length - 1];
    if (tk && !tk.paired) await joinFirstOpenRoom(tk);
  }
}

/** создать комнату на двоих (мультиключевая транзакция:
 *  комната + оба тикета — либо всё, либо ничего) */
async function pairTickets(a: TicketDoc, b: TicketDoc): Promise<boolean> {
  const level = clamp(a.level, 1, 999);
  const va = (await kv.get<TicketDoc>(['ticket', a.uid])).versionstamp;
  const vb = (await kv.get<TicketDoc>(['ticket', b.uid])).versionstamp;
  if (va === null || vb === null) return false; // тикет исчез — гонка
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = genCode();
    const host: RoomPlayer = {
      id: rndId(),
      uid: a.uid,
      name: a.name,
      hue: a.hue,
      score: 0,
      pairsDone: 0,
      finished: null,
    };
    const joiner: RoomPlayer = {
      id: rndId(),
      uid: b.uid,
      name: b.name,
      hue: b.hue,
      score: 0,
      pairsDone: 0,
      finished: null,
    };
    const room: RoomDoc = {
      v: 1,
      code,
      level,
      seed: newSeed(),
      status: 'playing',
      hostId: host.id,
      visibility: 'closed',
      startedAt: now() + INTRO_BUDGET_MS,
      timeTotalMs: timeForLevel(level),
      createdAt: now(),
      result: null,
      players: [host, joiner],
      winsBy: {},
      advanceBy: {},
      lastEvent: null,
    };
    const commit = await kv.atomic()
      .check({ key: ['room', code], versionstamp: null }) // код свободен
      .check({ key: ['ticket', a.uid], versionstamp: va })
      .check({ key: ['ticket', b.uid], versionstamp: vb })
      .set(['room', code], room)
      .set(['ticket', a.uid], { ...a, paired: { code, playerId: host.id } })
      .set(['ticket', b.uid], { ...b, paired: { code, playerId: joiner.id } })
      .commit();
    if (commit.ok) {
      const view = viewOf(room);
      notifyUid(a.uid, { t: 'room', view, playerId: host.id });
      notifyUid(b.uid, { t: 'room', view, playerId: joiner.id });
      // локальные подключения сразу прикрепляем к комнате
      const pairs: [string, string][] = [[a.uid, host.id], [b.uid, joiner.id]];
      for (const [uid, pid] of pairs) {
        const c = connsByUid.get(uid);
        if (c) attachConn(c, code, pid);
      }
      return true;
    }
    // конфликт (код занят/тикет изменился) — новая попытка
  }
  return false;
}

/** одиночный тикет подсоединяем к первой открытой ждущей комнате */
async function joinFirstOpenRoom(tk: TicketDoc): Promise<boolean> {
  const rooms: RoomDoc[] = [];
  for await (const entry of kv.list<RoomDoc>({ prefix: ['room'] })) {
    const r = entry.value;
    if (r.status === 'waiting' && r.visibility === 'open' && r.players.length === 1) {
      rooms.push(r);
    }
  }
  rooms.sort((a, b) => a.createdAt - b.createdAt);
  for (const r of rooms) {
    const res = await mutateRoom(r.code, (doc) => {
      if (doc.status !== 'waiting' || doc.players.length >= 2) return NO_CHANGE;
      doc.players.push({
        id: rndId(),
        uid: tk.uid,
        name: tk.name,
        hue: tk.hue,
        score: 0,
        pairsDone: 0,
        finished: null,
      });
      doc.status = 'playing';
      doc.startedAt = now() + INTRO_BUDGET_MS;
      return doc.players[doc.players.length - 1].id;
    });
    if (res) {
      const view = viewOf(res.doc);
      notifyUid(tk.uid, { t: 'room', view, playerId: res.out as string });
      const c = connsByUid.get(tk.uid);
      if (c) attachConn(c, r.code, res.out as string);
      return true;
    }
  }
  return false;
}

/* ============================ исходы ============================ */

function finishRoom(doc: RoomDoc, winnerId: string, reason: FinishReason, finalTimeMs: number | null) {
  if (doc.status !== 'playing' || doc.result) return false;
  doc.status = 'result';
  doc.result = { winnerId, reason, finalTimeMs, at: now() };
  // СЕРИЯ: победа победителю матча (счёт живёт до выхода из комнаты)
  doc.winsBy = doc.winsBy ?? {};
  doc.winsBy[winnerId] = (doc.winsBy[winnerId] ?? 0) + 1;
  return true;
}

/** авто-исходы: тайм-аут и долгое отсутствие игрока */
async function autoFinish(code: string) {
  const doc = await getRoom(code);
  if (!doc || doc.status !== 'playing') return;
  const t = now();
  // отсчёт ещё не начался (интро) — отключения не засчитываем
  if (t < doc.startedAt) return;
  for (const p of doc.players) {
    const other = doc.players.find((x) => x.id !== p.id);
    if (other && goneMs(p.uid) > ONLINE_GRACE_MS) {
      await mutateRoom(code, (d) =>
        finishRoom(d, other.id, 'disconnect', null) ? true : NO_CHANGE
      );
      return;
    }
  }
  if (t > doc.startedAt + doc.timeTotalMs) {
    const [a, b] = doc.players;
    if (!a || !b) return;
    const winnerId = a.pairsDone !== b.pairsDone
      ? (a.pairsDone > b.pairsDone ? a.id : b.id)
      : (a.score >= b.score ? a.id : b.id);
    await mutateRoom(code, (d) =>
      finishRoom(d, winnerId, 'timeout', null) ? true : NO_CHANGE
    );
  }
}

/* ============================ sweeper ============================ */

async function sweep() {
  const t = now();
  // локально наблюдаемые комнаты: авто-исходы
  for (const code of [...roomWatchers.keys()]) {
    await autoFinish(code);
  }
  // глобальная уборка (в т.ч. комнаты, на которые никто не смотрит)
  for await (const entry of kv.list<RoomDoc>({ prefix: ['room'] })) {
    const r = entry.value;
    const code = r.code;
    if (t - r.createdAt > ROOM_TTL_MS) {
      await kv.delete(['room', code]);
      continue;
    }
    if (r.status === 'waiting') {
      let dead = t - r.createdAt > WAITING_TTL_MS;
      const host = r.players[0];
      if (!dead && host && goneMs(host.uid) > WAITING_HOST_STALE_MS) dead = true;
      if (dead) {
        await kv.delete(['room', code]);
      }
    }
  }
  // тикеты: носителя давно нет в сети — выбрасываем
  for await (const entry of kv.list<TicketDoc>({ prefix: ['ticket'] })) {
    const tk = entry.value;
    if (tk.paired || t - tk.lastSeen > TICKET_STALE_MS) {
      await kv.delete(['ticket', tk.uid]);
    }
  }
}

/* ============================ HTTP / WS ============================ */

function genCode(): string {
  return Array.from(
    { length: CODE_LEN },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join('');
}

async function handleWs(socket: WebSocket) {
  const conn: Conn = {
    socket,
    uid: '',
    name: 'Игрок',
    roomCode: null,
    playerId: null,
    lobby: false,
  };
  conns.set(socket, conn);

  socket.onclose = () => {
    conns.delete(socket);
    if (conn.uid && connsByUid.get(conn.uid) === conn) {
      connsByUid.delete(conn.uid);
      announcePresence();
      // соперник должен увидеть «не в сети» сразу, а не тиком лобби
      refreshPresenceViews();
    }
    detachConn(conn);
  };

  socket.onerror = () => {
    try {
      socket.close();
    } catch {
      // ignore
    }
  };

  socket.onmessage = async (ev) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    try {
      await handleMessage(conn, msg);
    } catch (err) {
      console.error('handler error:', err);
      send(conn, { t: 'err', code: 'NETWORK' });
    }
  };
}

async function handleMessage(conn: Conn, msg: Record<string, unknown>) {
  const t = msg.t as string;
  const rid = typeof msg.rid === 'number' || typeof msg.rid === 'string' ? msg.rid : undefined;

  switch (t) {
    /* ---------- приветствие (+реконнект) ---------- */
    case 'hello': {
      const uid = typeof msg.uid === 'string' && msg.uid.length >= 8 && msg.uid.length <= 64
        ? msg.uid
        : rndId();
      const name = sanitizeName(msg.name);
      // тот же uid уже сидит в этом изоляте — заменяем (старый сокет мёртв)
      const prev = connsByUid.get(uid);
      if (prev && prev !== conn) {
        try {
          prev.socket.close(4000, 'replaced');
        } catch {
          // ignore
        }
        conns.delete(prev.socket);
        detachConn(prev);
      }
      conn.uid = uid;
      conn.name = name;
      connsByUid.set(uid, conn);
      send(conn, { t: 'hello', ok: true, uid, rid });
      announcePresence();
      // реконнект: устройство помнит комнату — возвращаем в неё
      const code = normalizeCode(msg.code);
      const playerId = typeof msg.playerId === 'string' ? msg.playerId : '';
      if (code && playerId) {
        const doc = await getRoom(code);
        const me = doc?.players.find((p) => p.id === playerId);
        if (doc && me && me.uid === uid) {
          attachConn(conn, code, playerId);
          send(conn, { t: 'room', view: viewOf(doc) });
        } else {
          send(conn, { t: 'err', code: 'ROOM_NOT_FOUND' });
        }
      }
      return;
    }

    /* ---------- создать игру (хост) ---------- */
    case 'create': {
      if (!conn.uid) return;
      const name = sanitizeName(msg.name);
      const level = clamp(Math.floor(Number(msg.level) || 1), 1, 999);
      const visibility = msg.visibility === 'open' ? 'open' : 'closed';
      const host: RoomPlayer = {
        id: rndId(),
        uid: conn.uid,
        name,
        hue: rndHue(),
        score: 0,
        pairsDone: 0,
        finished: null,
      };
      let created: RoomDoc | null = null;
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const code = genCode();
        const room: RoomDoc = {
          v: 1,
          code,
          level,
          seed: newSeed(),
          status: 'waiting',
          hostId: host.id,
          visibility,
          startedAt: 0,
          timeTotalMs: timeForLevel(level),
          createdAt: now(),
          result: null,
          players: [host],
          winsBy: {},
          advanceBy: {},
          lastEvent: null,
        };
        const commit = await kv.atomic()
          .check({ key: ['room', code], versionstamp: null })
          .set(['room', code], room)
          .commit();
        if (commit.ok) created = room;
      }
      if (!created) {
        send(conn, { t: 'err', code: 'NETWORK', rid });
        return;
      }
      attachConn(conn, created.code, host.id);
      await pushLobby();
      send(conn, { t: 'room', view: viewOf(created), playerId: host.id, rid });
      return;
    }

    /* ---------- войти по коду / из лобби ---------- */
    case 'join': {
      if (!conn.uid) return;
      const code = normalizeCode(msg.code);
      if (!code) {
        send(conn, { t: 'err', code: 'BAD_CODE', rid });
        return;
      }
      const name = sanitizeName(msg.name);
      const res = await mutateRoom(code, (doc) => {
        if (doc.status !== 'waiting' || doc.players.length >= 2) return NO_CHANGE;
        doc.players.push({
          id: rndId(),
          uid: conn.uid,
          name,
          hue: rndHue(),
          score: 0,
          pairsDone: 0,
          finished: null,
        });
        doc.status = 'playing';
        doc.startedAt = now() + INTRO_BUDGET_MS;
        return doc.players[doc.players.length - 1].id;
      });
      if (!res || res.out === NO_CHANGE) {
        const doc = await getRoom(code);
        const err = doc
          ? (doc.status !== 'waiting' || doc.players.length >= 2 ? 'ROOM_FULL' : 'NETWORK')
          : 'ROOM_NOT_FOUND';
        send(conn, { t: 'err', code: err, rid });
        return;
      }
      const playerId = res.out as string;
      attachConn(conn, code, playerId);
      deliverLocal(code, res.doc); // хосту в этом изоляте — мгновенно
      await pushLobby();
      send(conn, { t: 'room', view: viewOf(res.doc), playerId, rid });
      return;
    }

    /* ---------- состояние комнаты (+попутный прогресс) ---------- */
    case 'view': {
      const code = conn.roomCode;
      if (!code) {
        send(conn, { t: 'err', code: 'ROOM_NOT_FOUND', rid });
        return;
      }
      const score = Number(msg.score);
      const pairs = Number(msg.pairsDone);
      const hasProgress = Number.isFinite(score) && Number.isFinite(pairs);
      let doc: RoomDoc | null = null;
      if (hasProgress && conn.playerId) {
        const res = await mutateRoom(code, (d) => {
          if (d.status !== 'playing') return NO_CHANGE;
          const p = d.players.find((x) => x.id === conn.playerId);
          if (!p) return NO_CHANGE;
          p.score = clamp(score, 0, 10_000_000);
          p.pairsDone = clamp(Math.floor(pairs), 0, 1000);
          return true;
        });
        doc = res?.doc ?? null;
      }
      if (!doc) doc = await getRoom(code);
      if (!doc) {
        send(conn, { t: 'err', code: 'ROOM_NOT_FOUND', rid });
        return;
      }
      send(conn, { t: 'room', view: viewOf(doc), rid });
      return;
    }

    /* ---------- событие: пара собрана ---------- */
    case 'event': {
      const code = conn.roomCode;
      if (!code || !conn.playerId || msg.kind !== 'match') return;
      const tile1Id = Math.floor(Number(msg.tile1Id) || 0);
      const tile2Id = Math.floor(Number(msg.tile2Id) || 0);
      const score = clamp(Number(msg.score) || 0, 0, 10_000_000);
      const pairsDone = clamp(Math.floor(Number(msg.pairsDone) || 0), 0, 1000);
      const res = await mutateRoom(code, (doc) => {
        if (doc.status !== 'playing') return NO_CHANGE;
        const p = doc.players.find((x) => x.id === conn.playerId);
        if (!p) return NO_CHANGE;
        p.score = Math.max(p.score, score);
        p.pairsDone = Math.max(p.pairsDone, pairsDone);
        doc.lastEvent = {
          seq: (doc.lastEvent?.seq ?? 0) + 1,
          playerId: p.id,
          tile1Id,
          tile2Id,
          score: p.score,
          pairsDone: p.pairsDone,
        };
        return true;
      });
      if (res) deliverLocal(code, res.doc);
      return;
    }

    /* ---------- финиш: собрал доску / переполнил лоток ----------
     * ВРЕМЯ СЧИТАЕТ СЕРВЕР: now - startedAt → finalTimeMs */
    case 'finish': {
      const code = conn.roomCode;
      if (!code || !conn.playerId) return;
      const reason = msg.reason === 'cleared' ? 'cleared' : msg.reason === 'tray' ? 'tray' : null;
      if (!reason) return;
      const score = clamp(Number(msg.score) || 0, 0, 10_000_000);
      const pairsDone = clamp(Math.floor(Number(msg.pairsDone) || 0), 0, 1000);
      const res = await mutateRoom(code, (doc) => {
        const p = doc.players.find((x) => x.id === conn.playerId);
        if (!p) return NO_CHANGE;
        p.score = Math.max(p.score, score);
        p.pairsDone = Math.max(p.pairsDone, pairsDone);
        p.finished = reason;
        if (doc.status !== 'playing' || doc.result) return NO_CHANGE;
        if (reason === 'cleared') {
          // АВТОРИТАРНОЕ ВРЕМЯ: только часы сервера
          const elapsed = clamp(now() - doc.startedAt, 0, doc.timeTotalMs + 5000);
          finishRoom(doc, p.id, 'cleared', elapsed);
        } else {
          const other = doc.players.find((x) => x.id !== p.id);
          if (other) finishRoom(doc, other.id, 'tray', null);
        }
        return true;
      });
      if (res) {
        send(conn, { t: 'room', view: viewOf(res.doc), rid });
        deliverLocal(code, res.doc);
      }
      return;
    }

    /* ---------- согласие на реванш / следующий уровень ---------- */
    case 'advance': {
      const code = conn.roomCode;
      if (!code || !conn.playerId) return;
      const kind = msg.kind === 'next' ? 'next' : msg.kind === 'rematch' ? 'rematch' : null;
      if (!kind) return;
      const res = await mutateRoom(code, (doc) => {
        if (doc.status !== 'result') return NO_CHANGE;
        if (doc.players.length < 2) return NO_CHANGE;
        const prev = doc.advanceBy[conn.playerId!];
        doc.advanceBy[conn.playerId!] = kind;
        const [a, b] = doc.players;
        const ka = doc.advanceBy[a.id];
        const kb = doc.advanceBy[b.id];
        if (!(ka && kb && ka === kb)) {
          // голос записан, матч пока не стартует (соперник увидит
          // предложение) — само по себе это изменение документа
          return prev === kind ? NO_CHANGE : true;
        }
        // оба согласны одинаково → старт нового матча.
        // СЧЁТ СЕРИИ (winsBy) НЕ сбрасываем: играем подряд с тем
        // же человеком — счёт «кто сколько раз выиграл» копится
        doc.advanceBy = {};
        if (kind === 'next') doc.level = clamp(doc.level + 1, 1, 999);
        doc.seed = newSeed();
        doc.result = null;
        doc.startedAt = now() + INTRO_BUDGET_MS;
        doc.timeTotalMs = timeForLevel(doc.level);
        doc.lastEvent = null;
        for (const p of doc.players) {
          p.score = 0;
          p.pairsDone = 0;
          p.finished = null;
        }
        doc.status = 'playing';
        return true;
      });
      if (res) {
        send(conn, { t: 'room', view: viewOf(res.doc), rid });
        deliverLocal(code, res.doc);
      }
      return;
    }

    /* ---------- выход (сознательный) ---------- */
    case 'leave': {
      const code = conn.roomCode;
      if (!code) {
        send(conn, { t: 'ok', rid });
        return;
      }
      const meId = conn.playerId;
      detachConn(conn);
      if (!meId) {
        send(conn, { t: 'ok', rid });
        return;
      }
      const res = await mutateRoom(code, (doc) => {
        const wasPlaying = doc.status === 'playing';
        doc.players = doc.players.filter((p) => p.id !== meId);
        delete doc.advanceBy[meId];
        if (doc.players.length === 0) return 'delete';
        if (wasPlaying) {
          finishRoom(doc, doc.players[0].id, 'left', null);
        }
        return true;
      });
      if (res === null || res.out === 'delete') {
        await kv.delete(['room', code]);
        deliverLocal(code, null);
      } else if (res) {
        deliverLocal(code, res.doc);
      }
      await pushLobby();
      send(conn, { t: 'ok', rid });
      return;
    }

    /* ---------- быстрый матч: встать в очередь ---------- */
    case 'match': {
      if (!conn.uid) return;
      const name = sanitizeName(msg.name);
      const level = clamp(Math.floor(Number(msg.level) || 1), 1, 999);
      const cur = await kv.get<TicketDoc>(['ticket', conn.uid]);
      const ticket: TicketDoc = {
        uid: conn.uid,
        name,
        hue: cur.value?.hue ?? rndHue(),
        level,
        createdAt: cur.value?.createdAt ?? now(),
        lastSeen: now(),
        paired: null,
      };
      await kv.set(['ticket', conn.uid], ticket);
      await scheduleMatchfinding(conn, rid as number | string | undefined);
      return;
    }

    /* ---------- выйти из очереди ---------- */
    case 'match-leave': {
      if (!conn.uid) return;
      await kv.delete(['ticket', conn.uid]);
      send(conn, { t: 'ok', rid });
      return;
    }

    /* ---------- подписка на лобби ---------- */
    case 'lobby': {
      conn.lobby = msg.on === true;
      if (conn.lobby) {
        const rooms = await buildLobby();
        send(conn, { t: 'lobby', rooms, rid });
      }
      return;
    }

    case 'ping': {
      send(conn, { t: 'pong', rid });
      return;
    }
  }
}

/* ============================ serve ============================ */

const PORT = Number(Deno.env.get('PORT') ?? 8080);

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/health') {
    return Response.json({ ok: true, isolate: ISOLATE, kv: kvMode });
  }
  if (url.pathname === '/ws') {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 400 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);
    handleWs(socket);
    return response;
  }
  return new Response('not found', { status: 404 });
});

/* ============================ фоновые циклы ============================ */

// присутствие: объявляем себя каждые 2с и перепушиваем виды комнат,
// у которых изменились онлайн-флаги (обрыв/возврат игрока)
setInterval(() => {
  announcePresence();
  refreshPresenceViews();
}, PRESENCE_TICK_MS);

// серверные «сердцебиения»: крошечный JSON каждые 5с держит TCP/
// NAT живым — фоновые вкладки не «умирают» и присутствие честно
setInterval(() => {
  for (const c of conns.values()) {
    send(c, { t: 'hb' });
  }
}, 5000);

// sweeper: авто-исходы, TTL
setInterval(() => {
  void sweep().catch(() => {});
}, SWEEP_TICK_MS);

// лобби: свежий список всем подписчикам
setInterval(() => {
  void pushLobby().catch(() => {});
}, LOBBY_TICK_MS);

// тикеты «оживляем» от присутствия их носителей
setInterval(() => {
  void (async () => {
    for await (const entry of kv.list<TicketDoc>({ prefix: ['ticket'] })) {
      const tk = entry.value;
      if (!tk.paired && isOnline(tk.uid) && now() - tk.lastSeen > 5000) {
        await kv.set(['ticket', tk.uid], { ...tk, lastSeen: now() });
      }
    }
  })().catch(() => {});
}, PRESENCE_TICK_MS);
