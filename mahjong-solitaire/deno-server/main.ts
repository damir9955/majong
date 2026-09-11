/**
 * МАДЖОНГ · мультиплеер-сервер v2 (Deno Deploy: WebSocket + Deno KV).
 *
 * ЗАЧЕМ v2: прошлая версия хранила комнаты только в KV и падала
 * в двух местах: (1) приветствие с устаревшими кредами получало
 * push err ROOM_NOT_FOUND и клиент показывал «игра больше не
 * существует» ещё до всякой игры; (2) свежесозданная комната
 * иногда была невидима из другого изолята (репликация KV) —
 * вход по коду падал с «не найдено». Теперь: join с ретраями,
 * hello БЕЗ страшных ошибок, счёт серии побед (wins), гигиена
 * очереди матчмейкинга.
 *
 * АРХИТЕКТУРА (несколько изолятов Deno Deploy):
 *  - состояние комнат и тикетов — ТОЛЬКО в KV (ключи ['room',code],
 *    ['mm',id]); изменение — через atomic CAS (конфликты ретраим);
 *  - каждый изолят держит свои сокеты и для каждой комнаты с
 *    локальным сокетом подписан kv.watch → мгновенный кросс-изолятный
 *    push вьюхи сопернику (и событие «соперник собрал пару»);
 *  - лобби открытых игр — лёгкий поллинг KV (2 c) только если
 *    есть подписчики;
 *  - «сердцебиение» игрока = любые сообщения (view/event) пишут
 *    lastSeen в комнату; свипер изолята раз в 1.5 c досматривает
 *    авт-исходы (тайм-аут, дисконнект 30 c) и чистит мёртвое;
 *  - janitor (раз в ~5 мин) удаляет протухшие комнаты из KV.
 *
 * ПРОТОКОЛ (JSON поверх WS; rid — идемпотентность запрос-ответ):
 *  ← {t:'hello', uid, name, code?, playerId?}   представиться/вернуться
 *  → {t:'hello', ok}  (+ {t:'room'} если комната жива; если мертва —
 *     НИКАКИХ ошибок: клиент сам спросит view и молча почистит креды)
 *  ← {t:'lobby', on}                подписка на список открытых игр
 *  → {t:'lobby', rooms:[...]}       (каждые ~2 c и сразу по подписке)
 *  ← {t:'create', name, level, visibility}   создать игру
 *  → {t:'room', view, playerId}
 *  ← {t:'join', code, name}        вход по коду (с ретраями свежей комнаты)
 *  → {t:'room', view, playerId} | {t:'err', code}
 *  ← {t:'view', score?, pairsDone?}           прогресс + присутствие
 *  → {t:'room', view}
 *  ← {t:'event', kind:'match', tile1Id, tile2Id, score, pairsDone}
 *  → {t:'event', kind:'match', playerId, ...} сопернику (мгновенно)
 *  ← {t:'finish', reason:'cleared'|'tray', score, pairsDone}
 *  → {t:'room', view}                        (итог + счёт серии wins)
 *  ← {t:'advance', kind:'rematch'|'next'}    реванш/след. уровень (оба!)
 *  → {t:'room', view} | {t:'err', code:'ROOM_EMPTY'}
 *  ← {t:'leave'}                             выйти (сопернику — победа)
 *  ← {t:'match', name, level}                быстрый матч: в очередь
 *  → {t:'mm', status:'search'} | {t:'room', view, playerId}
 *  ← {t:'match-heart'} / {t:'match-leave'}   держать/убрать тикет
 *  ← {t:'ping'} → {t:'pong'}                 живость соединения
 *  сервер шлёт {t:'hb'} каждые 25 c (клиент молча игнорирует)
 *
 * СЧЁТ СЕРИИ (wins): у каждого игрока в комнате есть счётчик побед;
 * растёт при любом исходе в его пользу (cleared/tray/timeout/
 * disconnect/left), НЕ сбрасывается при реванше и «дальше» —
 * серия живёт, пока в комнате одни и те же два игрока.
 *
 * ЗАПУСК: локально  deno run --unstable-kv --allow-net --allow-env main.ts
 *          на Deploy без флагов (KV там стабилен). MJ_KV=memory —
 *          аварийный режим без KV (один изолят, только для отладки).
 */

/* ============================== КОНСТАНТЫ ============================== */

const ISOLATE = crypto.randomUUID().slice(0, 8);
const PORT = Number(Deno.env.get('PORT') ?? 8080);

/** запас на интро-карточку и отсчёт 3-2-1 у обоих игроков */
const INTRO_BUDGET_MS = 8000;
/** «в сети»: игрок давал о себе знать не позже этого */
const PRESENCE_MS = 8000;
/** так долго нет вестей → победа соперника по отключению
 *  (30 c: перезагрузка страницы НЕ должна рвать матч ложно) */
const ONLINE_GRACE_MS = 30000;
/** время на пару — как в матче против бота */
const TIME_PER_PAIR_MS = 4500;
const TIME_MIN_MS = 90_000;
const TIME_MAX_MS = 270_000;
/** комнаты живут 6 часов, «ожидание друга» — час */
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const WAITING_TTL_MS = 60 * 60 * 1000;
/** создатель ждущей комнаты пропал — убираем игру из лобби */
const WAITING_HOST_STALE_MS = 45_000;
/** максимум записей в списке открытых игр */
const OPEN_LIST_MAX = 30;
/** тикет матчмейкинга без признаков жизни столько — выпадает */
const TICKET_TTL_MS = 15_000;
/** ретраи чтения свежей комнаты (репликация KV между изолятами) */
const FRESH_ROOM_RETRIES = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без I O 0 1
const CODE_LEN = 5;

/** пары по уровню (цикл 10 уровней — 10 схем, см. layouts.ts) */
const PAIRS_BY_LEVEL = [14, 20, 22, 32, 36, 18, 21, 26, 32, 40];

/* =============================== ТИПЫ =============================== */

type RoomFinishReason =
  | 'cleared'
  | 'tray'
  | 'timeout'
  | 'disconnect'
  | 'left';

interface PlayerState {
  id: string;
  name: string;
  hue: number;
  score: number;
  pairsDone: number;
  lastSeen: number;
  finished: 'cleared' | 'tray' | null;
  /** счёт серии побед с этим соперником */
  wins: number;
}

interface RoomEventInfo {
  playerId: string;
  tile1Id: number;
  tile2Id: number;
  score: number;
  pairsDone: number;
  at: number;
}

interface RoomState {
  code: string;
  level: number;
  seed: number;
  status: 'waiting' | 'playing' | 'result';
  hostId: string;
  visibility: 'open' | 'closed';
  startedAt: number;
  timeTotalMs: number;
  createdAt: number;
  players: PlayerState[];
  result: { winnerId: string; reason: RoomFinishReason } | null;
  /** playerId → 'rematch' | 'next' (согласия на продолжение) */
  advanceBy: Record<string, 'rematch' | 'next'>;
  /** последнее событие «собрал пару» — доехать до соперника */
  lastEvent: RoomEventInfo | null;
}

interface TicketState {
  id: string;
  name: string;
  hue: number;
  level: number;
  createdAt: number;
  lastSeen: number;
  /** подобрали: комната готова */
  paired: {
    code: string;
    playerId: string;
  } | null;
}

/** публичное состояние комнаты — то, что видит клиент */
interface RoomView {
  code: string;
  status: 'waiting' | 'playing' | 'result';
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
    wins: number;
  }[];
  result: { winnerId: string; reason: RoomFinishReason } | null;
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

/* ====================== KV-АБСТРАКЦИЯ (с фолбэком) ====================== */

type KvKey = unknown[];
interface KvEntry<T> {
  key: KvKey;
  value: T | null;
  versionstamp: string;
}
interface KvListSelector {
  prefix: KvKey;
}
interface KvCommitResult {
  ok: boolean;
}
interface KvAtomic {
  check(entry: KvEntry<unknown>): KvAtomic;
  set(key: KvKey, value: unknown): KvAtomic;
  delete(key: KvKey): KvAtomic;
  commit(): Promise<KvCommitResult>;
}
interface Kv {
  get<T>(key: KvKey): Promise<KvEntry<T> | null>;
  set(key: KvKey, value: unknown): Promise<KvCommitResult>;
  delete(key: KvKey): Promise<KvCommitResult>;
  list<T>(selector: KvListSelector, opts?: { limit?: number }): AsyncIterable<KvEntry<T>>;
  atomic(): KvAtomic;
  /** подписка на массив ключей: снапшот + каждое изменение */
  watch(keys: KvKey[]): ReadableStream<KvEntry<unknown>[]>;
}

let kvMode: 'deno' | 'memory' = 'deno';

/** KV поверх Map — аварийный режим (нет базы у приложения) и локальные
 *  тесты. Семантики те же: versionstamp монотонный, CAS честный. */
class MemoryKv implements Kv {
  #data = new Map<string, { value: unknown; vs: string }>();
  #vs = 0;
  #watchers = new Map<string, Set<() => void>>();
  #ks(key: KvKey): string {
    return key.map((p) => `${typeof p}:${String(p)}`).join('|');
  }
  #bump(): string {
    this.#vs += 2;
    return String(this.#vs).padStart(16, '0') + '0000';
  }
  async #fire(keys: KvKey[]): Promise<void> {
    // уведомляем всех, кто смотрит ЛЮБОЙ из изменённых ключей
    const cbs = new Set<() => void>();
    for (const k of keys) {
      for (const cb of this.#watchers.get(this.#ks(k)) ?? []) cbs.add(cb);
    }
    for (const cb of cbs) cb();
  }
  async get<T>(key: KvKey): Promise<KvEntry<T> | null> {
    const hit = this.#data.get(this.#ks(key));
    if (!hit) return null;
    return { key, value: hit.value as T, versionstamp: hit.vs };
  }
  async set(key: KvKey, value: unknown): Promise<KvCommitResult> {
    const ks = this.#ks(key);
    const vs = this.#bump();
    this.#data.set(ks, { value, vs });
    await this.#fire([key]);
    return { ok: true };
  }
  async delete(key: KvKey): Promise<KvCommitResult> {
    const ks = this.#ks(key);
    const had = this.#data.delete(ks);
    if (had) await this.#fire([key]);
    return { ok: true };
  }
  async *list<T>(
    selector: KvListSelector,
    opts?: { limit?: number },
  ): AsyncIterable<KvEntry<T>> {
    const prefix = this.#ks(selector.prefix) + '|';
    let n = 0;
    for (const [ks, hit] of [...this.#data.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (!ks.startsWith(prefix)) continue;
      if (opts?.limit && n >= opts.limit) return;
      n++;
      const key = ks.split('|').map((p) => {
        const [type, ...rest] = p.split(':');
        const raw = rest.join(':');
        return type === 'number' ? Number(raw) : raw;
      });
      yield { key, value: hit.value as T, versionstamp: hit.vs };
    }
  }
  atomic(): KvAtomic {
    const ops: {
      kind: 'check' | 'set' | 'delete';
      entry?: KvEntry<unknown>;
      key?: KvKey;
      value?: unknown;
    }[] = [];
    const self = this;
    return {
      check(entry: KvEntry<unknown>) {
        ops.push({ kind: 'check', entry });
        return this;
      },
      set(key: KvKey, value: unknown) {
        ops.push({ kind: 'set', key, value });
        return this;
      },
      delete(key: KvKey) {
        ops.push({ kind: 'delete', key });
        return this;
      },
      async commit(): Promise<KvCommitResult> {
        for (const op of ops) {
          if (op.kind !== 'check' || !op.entry || !op.entry.key) continue;
          const cur = self.#data.get(self.#ks(op.entry.key));
          const curVs = cur ? cur.vs : null;
          if (curVs !== (op.entry.versionstamp ?? null)) return { ok: false };
        }
        const touched: KvKey[] = [];
        for (const op of ops) {
          if (op.kind === 'set' && op.key) {
            const vs = self.#bump();
            self.#data.set(self.#ks(op.key), { value: op.value, vs });
            touched.push(op.key);
          } else if (op.kind === 'delete' && op.key) {
            if (self.#data.delete(self.#ks(op.key))) touched.push(op.key);
          }
        }
        await self.#fire(touched);
        return { ok: true };
      },
    };
  }
  watch(keys: KvKey[]): ReadableStream<KvEntry<unknown>[]> {
    const snapshot = () =>
      keys.map((k) => {
        const hit = this.#data.get(this.#ks(k));
        return {
          key: k,
          value: hit ? hit.value : null,
          versionstamp: hit ? hit.vs : '00000000000000000000',
        };
      });
    let fire: (() => void) | null = null;
    return new ReadableStream({
      start: (ctrl) => {
        ctrl.enqueue(snapshot());
        fire = () => ctrl.enqueue(snapshot());
        for (const k of keys) {
          const set = this.#watchers.get(this.#ks(k)) ?? new Set();
          set.add(fire);
          this.#watchers.set(this.#ks(k), set);
        }
      },
      cancel: () => {
        if (!fire) return;
        for (const k of keys) {
          const set = this.#watchers.get(this.#ks(k));
          if (set) {
            set.delete(fire);
            if (set.size === 0) this.#watchers.delete(this.#ks(k));
          }
        }
      },
    });
  }
}

/** открыть KV, не уронив сервер: без базы работаем в памяти */
async function openKvSafe(): Promise<Kv> {
  if (Deno.env.get('MJ_KV') === 'memory') {
    kvMode = 'memory';
    console.warn('[kv] MJ_KV=memory — режим памяти (один изолят, для отладки)');
    return new MemoryKv();
  }
  try {
    const real = await Deno.openKv();
    const wrap = real as unknown as Kv;
    // sanity: все методы на месте?
    if (
      typeof wrap.get !== 'function' ||
      typeof wrap.atomic !== 'function' ||
      typeof wrap.watch !== 'function'
    ) {
      throw new Error('kv api mismatch');
    }
    return wrap;
  } catch (err) {
    console.warn(
      '[kv] Deno.openKv() не смог открыться: ' +
        (err instanceof Error ? err.message : String(err)),
    );
    console.warn(
      '[kv] Работаем в РЕЖИМЕ ПАМЯТИ — комнаты сбросятся при рестарте изолята.',
    );
    kvMode = 'memory';
    return new MemoryKv();
  }
}

const kv = await openKvSafe();

/* ============================ УТИЛИТЫ ============================ */

const now = () => Date.now();
const rndId = () =>
  Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36))
    .join('');
const rndHue = () => Math.floor(Math.random() * 360);
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

function timeForLevel(level: number): number {
  const pairs = PAIRS_BY_LEVEL[(clamp(level, 1, 999) - 1) % PAIRS_BY_LEVEL.length];
  return clamp(pairs * TIME_PER_PAIR_MS, TIME_MIN_MS, TIME_MAX_MS);
}

function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  const cut = [...s].slice(0, 16).join('');
  return cut.length > 0 ? cut : 'Игрок';
}

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return c.length === CODE_LEN && [...c].every((ch) => CODE_CHARS.includes(ch))
    ? c
    : null;
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function newCode(): string {
  return Array.from(
    { length: CODE_LEN },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join('');
}

/** глубокая копия (KV-значения — плоский JSON, но advanceBy меняется) */
function clone<T>(v: T): T {
  return structuredClone(v);
}

/** публичная вьюха комнаты для клиента */
function view(r: RoomState): RoomView {
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
    players: r.players.map((p) => ({
      id: p.id,
      name: p.name,
      hue: p.hue,
      score: Math.round(p.score),
      pairsDone: p.pairsDone,
      online: t - p.lastSeen < PRESENCE_MS,
      finished: p.finished,
      wins: p.wins,
    })),
    result: r.result ? { ...r.result } : null,
    visibility: r.visibility,
    advanceOffers: Object.entries(r.advanceBy).map(([playerId, kind]) => ({
      playerId,
      kind,
    })),
  };
}

/* ==================== СОКЕТЫ ИЗОЛЯТА + ПОДПИСКИ ==================== */

interface Sock {
  ws: WebSocket;
  uid: string;
  name: string;
  /** привязанная комната (code) и игрок */
  roomCode: string | null;
  playerId: string | null;
  /** монотонный счётчик смены привязки: поздний hello
   *  не затирает свежую привязку от create/join (гонка) */
  bindEpoch: number;
  /** подписан на лобби открытых игр */
  lobby: boolean;
  /** активный тикет матчмейкинга */
  mmTicket: string | null;
  alive: boolean;
}

const sockets = new Set<Sock>();

/** атомарная смена привязки сокета к комнате (последний выигрывает) */
function bindSock(s: Sock, code: string | null, pid: string | null): void {
  s.bindEpoch++;
  s.roomCode = code;
  s.playerId = pid;
}

/** комната → {lastPushedVs, lastEventAt, watch} — подписка изолята */
interface RoomWatch {
  vs: string;
  lastEventAt: number;
  reader?: ReadableStreamDefaultReader<KvEntry<unknown>[]>;
  refs: number;
}
const roomWatches = new Map<string, RoomWatch>();

/** тикет матчмейкинга → подписка (когда «подобрали» из другого изолята) */
const ticketWatches = new Map<
  string,
  ReadableStreamDefaultReader<KvEntry<unknown>[]>
>();

function send(s: Sock, m: Record<string, unknown>): void {
  if (!s.alive) return;
  try {
    s.ws.send(JSON.stringify(m));
  } catch {
    // сокет уже мёртв — приберём на close
  }
}

/** кому из локальных сокетов нужна эта комната */
function localRoomSocks(code: string): Sock[] {
  return [...sockets].filter((s) => s.roomCode === code);
}

/** подписаться на изменения комнаты (kv.watch) и разослать вьюхи */
function ensureRoomWatch(code: string): void {
  let w = roomWatches.get(code);
  if (!w) {
    w = { vs: '', lastEventAt: 0, refs: 0 };
    roomWatches.set(code, w);
  }
  w.refs++;
  if (w.reader) return;
  try {
    const stream = kv.watch([['room', code]]);
    w.reader = stream.getReader();
    const pump = async () => {
      const rw = roomWatches.get(code);
      const reader = rw?.reader;
      if (!reader) return;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          const entry = value?.[0];
          if (!entry) continue;
          const vs = entry.versionstamp;
          const room = entry.value as RoomState | null;
          const cur = roomWatches.get(code);
          if (!cur) return;
          if (vs === cur.vs) continue; // уже разослали это изменение
          cur.vs = vs;
          if (!room) continue; // комнату удалили — клиент узнает сам
          const v = view(room);
          const targets = localRoomSocks(code);
          for (const s of targets) {
            send(s, { t: 'room', view: v });
            // событие «соперник собрал пару» — с дедупом по времени
            if (
              room.lastEvent &&
              room.lastEvent.at > cur.lastEventAt &&
              room.lastEvent.playerId !== s.playerId
            ) {
              send(s, {
                t: 'event',
                kind: 'match',
                playerId: room.lastEvent.playerId,
                tile1Id: room.lastEvent.tile1Id,
                tile2Id: room.lastEvent.tile2Id,
                score: room.lastEvent.score,
                pairsDone: room.lastEvent.pairsDone,
              });
            }
          }
          if (room.lastEvent && room.lastEvent.at > cur.lastEventAt) {
            cur.lastEventAt = room.lastEvent.at;
          }
        }
      } catch {
        // watch умер (KV недоступен) — свипер продолжит раз в 1.5 c
        const c = roomWatches.get(code);
        if (c) c.reader = undefined;
      }
    };
    void pump();
  } catch {
    // watch не поддерживается — свипер полингом раз в 1.5 c
  }
}

function releaseRoomWatch(code: string): void {
  const w = roomWatches.get(code);
  if (!w) return;
  w.refs = Math.max(0, w.refs - 1);
  if (w.refs > 0) return;
  roomWatches.delete(code);
  try {
    w.reader?.cancel();
  } catch {
    // ignore
  }
}

/* ==================== ЧТЕНИЕ/ЗАПИСЬ КОМНАТ (CAS) ==================== */

async function getRoom(code: string): Promise<RoomState | null> {
  const e = await kv.get<RoomState>(['room', code]);
  return e?.value ?? null;
}

/** чтение СВЕЖЕЙ комнаты: сразу после create KV на другом изоляте
 *  может ещё не видеть ключ — короткие ретраи с паузами */
async function getFreshRoom(code: string): Promise<RoomState | null> {
  for (let i = 0; i < FRESH_ROOM_RETRIES; i++) {
    const r = await getRoom(code);
    if (r) return r;
    if (i === FRESH_ROOM_RETRIES - 1) return null;
    await new Promise((res) => setTimeout(res, 250 * (i + 1)));
  }
  return null;
}

/** изменить комнату через CAS; fn возвращает новое состояние,
 *  'abort' — без изменений (успех без записи), 'delete' — удалить */
async function mutateRoom(
  code: string,
  fn: (r: RoomState) => RoomState | 'abort' | 'delete',
): Promise<{ ok: boolean; room: RoomState | null; changed?: boolean; deleted?: boolean }> {
  for (let i = 0; i < 6; i++) {
    const entry = await kv.get<RoomState>(['room', code]);
    const cur = entry?.value ?? null;
    if (!cur) return { ok: false, room: null };
    const next = fn(clone(cur));
    if (next === 'abort') return { ok: true, room: cur, changed: false };
    if (next === 'delete') {
      await kv.delete(['room', code]);
      return { ok: true, room: null, deleted: true, changed: true };
    }
    const res = await kv.atomic()
      .check(entry as KvEntry<unknown>)
      .set(['room', code], next)
      .commit();
    if (res.ok) return { ok: true, room: next, changed: true };
    // конфликт — перечитываем и пробуем снова
  }
  return { ok: false, room: null };
}

/** разослать вьюху локальным сокетам комнаты (свой вклад изолята) */
function pushLocal(code: string, room: RoomState): void {
  const w = roomWatches.get(code);
  const v = view(room);
  for (const s of localRoomSocks(code)) {
    send(s, { t: 'room', view: v });
    if (
      room.lastEvent &&
      (!w || room.lastEvent.at > w.lastEventAt) &&
      room.lastEvent.playerId !== s.playerId
    ) {
      send(s, {
        t: 'event',
        kind: 'match',
        playerId: room.lastEvent.playerId,
        tile1Id: room.lastEvent.tile1Id,
        tile2Id: room.lastEvent.tile2Id,
        score: room.lastEvent.score,
        pairsDone: room.lastEvent.pairsDone,
      });
    }
  }
  if (w && room.lastEvent && room.lastEvent.at > w.lastEventAt) {
    w.lastEventAt = room.lastEvent.at;
  }
}

/* ==================== АВТО-ИСХОДЫ И ЧИСТКА ==================== */

/** применить к комнате авт-исходы; null — без изменений,
 *  'delete' — комнату пора убрать */
function autoRules(r: RoomState, t: number): RoomState | null | 'delete' {
  if (t - r.createdAt > ROOM_TTL_MS) return 'delete';
  if (r.status === 'waiting') {
    if (t - r.createdAt > WAITING_TTL_MS) return 'delete';
    const host = r.players[0];
    if (host && t - host.lastSeen > WAITING_HOST_STALE_MS) return 'delete';
    return null;
  }
  if (r.status !== 'playing') return null;
  // отсчёт ещё не начался (интро) — отключения не засчитываем
  if (t < r.startedAt) return null;
  for (const p of r.players) {
    const other = r.players.find((x) => x.id !== p.id);
    if (other && t - p.lastSeen > ONLINE_GRACE_MS) {
      return finishRoom(r, other.id, 'disconnect', t);
    }
  }
  if (t > r.startedAt + r.timeTotalMs) {
    const [a, b] = r.players;
    if (!a || !b) return null;
    const winnerId = a.pairsDone !== b.pairsDone
      ? (a.pairsDone > b.pairsDone ? a.id : b.id)
      : (a.score >= b.score ? a.id : b.id);
    return finishRoom(r, winnerId, 'timeout', t);
  }
  return null;
}

function finishRoom(
  r: RoomState,
  winnerId: string,
  reason: RoomFinishReason,
  t: number,
): RoomState {
  if (r.status !== 'playing') return r;
  const w = r.players.find((p) => p.id === winnerId);
  if (w) w.wins += 1; // счёт серии побед
  r.status = 'result';
  r.result = { winnerId, reason };
  r.lastEvent = null;
  void t;
  return r;
}

/** свипер: досматривает авт-исходы комнат с локальными сокетами.
 *  Пушим локально ТОЛЬКО если watch недоступен (фолбэк). */
async function sweep(): Promise<void> {
  const t = now();
  for (const code of [...roomWatches.keys()]) {
    const res = await mutateRoom(code, (r) => autoRules(r, t) ?? 'abort');
    if (!res.ok && res.room === null) {
      // комнаты нет — уведомлять некого, убираем подписку если сокеты ушли
      if (localRoomSocks(code).length === 0) releaseRoomWatch(code);
      continue;
    }
    if (res.changed && res.room && !roomWatches.get(code)?.reader) {
      pushLocal(code, res.room);
    }
  }
  // тикеты: мёртвые — вон
  try {
    for await (const e of kv.list<TicketState>({ prefix: ['mm'] })) {
      const tk = e.value;
      if (tk && t - tk.lastSeen > TICKET_TTL_MS) await kv.delete(e.key);
    }
  } catch {
    // KV моргнул — в следующий тик
  }
}

/** janitor: протухшие комнаты ВСЕ (даже без локальных сокетов) */
async function janitor(): Promise<void> {
  const t = now();
  try {
    for await (const e of kv.list<RoomState>({ prefix: ['room'] })) {
      const r = e.value;
      if (!r) continue;
      const next = autoRules(r, t);
      if (next === 'delete') await kv.delete(e.key);
      else if (next !== r) {
        await kv.atomic().check(e as KvEntry<unknown>).set(e.key, next).commit();
      }
    }
  } catch {
    // KV моргнул — в следующий заход
  }
}

/* ==================== ЛОББИ ОТКРЫТЫХ ИГР ==================== */

async function listOpenRooms(): Promise<OpenRoomInfo[]> {
  const t = now();
  const out: OpenRoomInfo[] = [];
  try {
    for await (const e of kv.list<RoomState>({ prefix: ['room'] })) {
      const r = e.value;
      if (!r || r.status !== 'waiting' || r.visibility !== 'open') continue;
      const host = r.players[0];
      if (!host || r.players.length >= 2) continue;
      if (t - host.lastSeen > WAITING_HOST_STALE_MS) continue;
      out.push({
        code: r.code,
        level: r.level,
        hostName: host.name,
        hue: host.hue,
        createdAt: r.createdAt,
        players: r.players.length,
      });
    }
  } catch {
    // KV моргнул — покажем прошлый список
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out.slice(0, OPEN_LIST_MAX);
}

let lobbyTimer: number | null = null;
function ensureLobbyLoop(): void {
  const need = [...sockets].some((s) => s.lobby);
  if (!need) {
    if (lobbyTimer !== null) {
      clearInterval(lobbyTimer);
      lobbyTimer = null;
    }
    return;
  }
  if (lobbyTimer !== null) return;
  const tick = async () => {
    if (![...sockets].some((s) => s.lobby)) return;
    const rooms = await listOpenRooms();
    for (const s of sockets) {
      if (s.lobby) send(s, { t: 'lobby', rooms });
    }
  };
  void tick();
  lobbyTimer = setInterval(() => void tick(), 2000);
}

/* ==================== МАТЧМЕЙКИНГ ==================== */

/** подпишись на свой тикет: когда другой изолят его «подберёт» —
 *  пришлём сокету готовую комнату */
function ensureTicketWatch(sock: Sock, ticketId: string): void {
  if (ticketWatches.has(ticketId)) return;
  try {
    const reader = kv.watch([['mm', ticketId]]).getReader();
    ticketWatches.set(ticketId, reader);
    const pump = async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        const tk = value?.[0]?.value as TicketState | null;
        if (!tk || !tk.paired || !sock.alive) continue;
        // подобрали! втаскиваем сокет в комнату
        sock.mmTicket = null;
        releaseTicketWatch(ticketId);
        const room = await getFreshRoom(tk.paired.code);
        if (!room) continue;
        sock.roomCode = room.code;
        sock.playerId = tk.paired.playerId;
        ensureRoomWatch(room.code);
        send(sock, { t: 'room', view: view(room), playerId: tk.paired.playerId });
        return;
      }
    };
    void pump();
  } catch {
    // без watch — клиент узнает по match-heart ответу
  }
}

function releaseTicketWatch(ticketId: string): void {
  const r = ticketWatches.get(ticketId);
  if (!r) return;
  ticketWatches.delete(ticketId);
  try {
    r.cancel();
  } catch {
    // ignore
  }
}

async function dropTicket(sock: Sock): Promise<void> {
  const id = sock.mmTicket;
  sock.mmTicket = null;
  if (id) {
    releaseTicketWatch(id);
    await kv.delete(['mm', id]).catch(() => {});
  }
}

/** обновить lastSeen тикета (сокет жив — тикет жив) */
async function touchTicket(sock: Sock): Promise<void> {
  if (!sock.mmTicket) return;
  const e = await kv.get<TicketState>(['mm', sock.mmTicket]);
  if (!e?.value) {
    // тикет протух и вычищен — пересоздадим из сокета
    await createTicketFor(sock);
    return;
  }
  await kv.atomic()
    .check(e as KvEntry<unknown>)
    .set(['mm', sock.mmTicket], { ...e.value, lastSeen: now() })
    .commit()
    .catch(() => {});
}

async function createTicketFor(sock: Sock): Promise<void> {
  const id = rndId();
  const tk: TicketState = {
    id,
    name: sock.name || 'Игрок',
    hue: rndHue(),
    level: 1,
    createdAt: now(),
    lastSeen: now(),
    paired: null,
  };
  await kv.set(['mm', id], tk);
  sock.mmTicket = id;
  ensureTicketWatch(sock, id);
}

/** попробовать подобрать пары и подсадить одиночек в открытые игры */
async function tryMatchAll(): Promise<void> {
  const t = now();
  const fresh: TicketState[] = [];
  try {
    for await (const e of kv.list<TicketState>({ prefix: ['mm'] })) {
      const tk = e.value;
      if (!tk || tk.paired) continue;
      if (t - tk.lastSeen > TICKET_TTL_MS) {
        await kv.delete(e.key);
        continue;
      }
      fresh.push(tk);
    }
  } catch {
    return;
  }
  fresh.sort((a, b) => a.createdAt - b.createdAt);
  // пары из очереди
  for (let i = 0; i + 1 < fresh.length; i += 2) {
    const ok = await pairTickets(fresh[i], fresh[i + 1]);
    if (ok) {
      fresh.splice(i, 2);
      i -= 2;
    }
  }
  // одиночка — в первую открытую комнату
  if (fresh.length > 0) await joinFirstOpenRoom(fresh[0]);
}

async function pairTickets(a: TicketState, b: TicketState): Promise<boolean> {
  const code = newCode();
  const room: RoomState = {
    code,
    level: clamp(a.level, 1, 999),
    seed: newSeed(),
    status: 'playing',
    hostId: rndId(),
    visibility: 'closed',
    startedAt: now() + INTRO_BUDGET_MS,
    timeTotalMs: timeForLevel(a.level),
    createdAt: now(),
    players: [],
    result: null,
    advanceBy: {},
    lastEvent: null,
  };
  const hostId = room.hostId;
  const guestId = rndId();
  room.players = [
    {
      id: hostId,
      name: a.name,
      hue: a.hue,
      score: 0,
      pairsDone: 0,
      lastSeen: now(),
      finished: null,
      wins: 0,
    },
    {
      id: guestId,
      name: b.name,
      hue: b.hue,
      score: 0,
      pairsDone: 0,
      lastSeen: now(),
      finished: null,
      wins: 0,
    },
  ];
  const ea = await kv.get<TicketState>(['mm', a.id]);
  const eb = await kv.get<TicketState>(['mm', b.id]);
  if (!ea?.value || !eb?.value || ea.value.paired || eb.value.paired) {
    return false;
  }
  const res = await kv.atomic()
    .check(ea as KvEntry<unknown>)
    .check(eb as KvEntry<unknown>)
    .set(['mm', a.id], { ...ea.value, paired: { code, playerId: hostId } })
    .set(['mm', b.id], { ...eb.value, paired: { code, playerId: guestId } })
    .set(['room', code], room)
    .commit();
  return res.ok;
}

async function joinFirstOpenRoom(tk: TicketState): Promise<boolean> {
  const t = now();
  let target: { code: string; at: number } | null = null;
  try {
    const cands: { code: string; at: number }[] = [];
    for await (const e of kv.list<RoomState>({ prefix: ['room'] })) {
      const r = e.value;
      if (!r || r.status !== 'waiting' || r.visibility !== 'open') continue;
      if (r.players.length >= 2) continue;
      const host = r.players[0];
      if (!host || t - host.lastSeen > WAITING_HOST_STALE_MS) continue;
      cands.push({ code: r.code, at: r.createdAt });
    }
    cands.sort((x, y) => x.at - y.at);
    target = cands[0] ?? null;
  } catch {
    return false;
  }
  if (!target) return false;
  const guestId = rndId();
  const res = await mutateRoom(target.code, (r) => {
    if (r.status !== 'waiting' || r.players.length >= 2) return 'abort';
    r.players.push({
      id: guestId,
      name: tk.name,
      hue: tk.hue,
      score: 0,
      pairsDone: 0,
      lastSeen: now(),
      finished: null,
      wins: 0,
    });
    r.status = 'playing';
    r.startedAt = now() + INTRO_BUDGET_MS;
    return r;
  });
  if (!res.ok || !res.room) return false;
  const et = await kv.get<TicketState>(['mm', tk.id]);
  if (!et?.value || et.value.paired) return false;
  await kv.atomic()
    .check(et as KvEntry<unknown>)
    .set(['mm', tk.id], { ...et.value, paired: { code: target.code, playerId: guestId } })
    .commit();
  return true;
}

/* ==================== ОБРАБОТКА СООБЩЕНИЙ ==================== */

function errOf(s: Sock, m: Record<string, unknown>, code: string): void {
  send(s, { t: 'err', code, rid: m.rid });
}

async function onMessage(s: Sock, raw: string): Promise<void> {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
    if (!m || typeof m !== 'object') return;
  } catch {
    return;
  }
  const t = typeof m.t === 'string' ? m.t : '';
  switch (t) {
    /* ---------- представиться/вернуться в комнату ---------- */
    case 'hello': {
      if (typeof m.uid === 'string' && m.uid.length > 0) s.uid = m.uid;
      if (typeof m.name === 'string' && m.name.trim()) {
        s.name = sanitizeName(m.name);
      }
      send(s, { t: 'hello', ok: true, uid: s.uid });
      const code = normalizeCode(m.code);
      const pid = typeof m.playerId === 'string' ? m.playerId : null;
      if (code && pid) {
        // заявляем права на смену привязки: если за время чтения KV
        // сокет успел создать/войти в другую комнату — не трогаем её
        const myEpoch = ++s.bindEpoch;
        // комната жива? да — привязываемся и шлём вьюху;
        // НЕТ — молчим: никаких страшных ошибок при приветствии
        const room = await getFreshRoom(code);
        if (s.bindEpoch !== myEpoch) return; // нас обогнали
        if (room && room.players.some((p) => p.id === pid)) {
          bindSock(s, room.code, pid);
          ensureRoomWatch(room.code);
          // прогреваем присутствие — перезагрузка не должна рвать матч
          await mutateRoom(room.code, (r) => {
            const p = r.players.find((x) => x.id === pid);
            if (p) p.lastSeen = now();
            return autoRules(r, now()) ?? 'abort';
          }).catch(() => {});
          send(s, { t: 'room', view: view(room) });
        } else {
          bindSock(s, null, null);
        }
      }
      return;
    }

    /* ---------- лобби открытых игр ---------- */
    case 'lobby': {
      s.lobby = m.on === true;
      if (s.lobby) {
        const rooms = await listOpenRooms();
        send(s, { t: 'lobby', rooms, rid: m.rid });
      }
      ensureLobbyLoop();
      return;
    }

    /* ---------- создать игру ---------- */
    case 'create': {
      await dropTicket(s);
      const name = sanitizeName(m.name);
      const level = clamp(Math.floor(Number(m.level) || 1), 1, 999);
      const visibility = m.visibility === 'open' ? 'open' : 'closed';
      let code = '';
      for (let i = 0; i < 5; i++) {
        code = newCode();
        const taken = await kv.get(['room', code]);
        if (!taken?.value) break;
        code = '';
      }
      if (!code) {
        errOf(s, m, 'NETWORK');
        return;
      }
      const hostId = rndId();
      const room: RoomState = {
        code,
        level,
        seed: newSeed(),
        status: 'waiting',
        hostId,
        visibility,
        startedAt: 0,
        timeTotalMs: timeForLevel(level),
        createdAt: now(),
        players: [
          {
            id: hostId,
            name,
            hue: rndHue(),
            score: 0,
            pairsDone: 0,
            lastSeen: now(),
            finished: null,
            wins: 0,
          },
        ],
        result: null,
        advanceBy: {},
        lastEvent: null,
      };
      const res = await kv.atomic()
        .check({
          key: ['room', code],
          value: null,
          versionstamp: null as unknown as string,
        })
        .set(['room', code], room)
        .commit();
      if (!res.ok) {
        errOf(s, m, 'NETWORK');
        return;
      }
      s.name = name;
      bindSock(s, code, hostId);
      ensureRoomWatch(code);
      send(s, { t: 'room', view: view(room), playerId: hostId, rid: m.rid });
      return;
    }

    /* ---------- вход по коду (с ретраями свежей комнаты) ---------- */
    case 'join': {
      await dropTicket(s);
      const code = normalizeCode(m.code);
      if (!code) {
        errOf(s, m, 'BAD_CODE');
        return;
      }
      const name = sanitizeName(m.name);
      const joinerId = rndId();
      const joiner = () => ({
        id: joinerId,
        name,
        hue: rndHue(),
        score: 0,
        pairsDone: 0,
        lastSeen: now(),
        finished: null,
        wins: 0,
      });
      const res = await mutateRoom(code, (r) => {
        if (r.status !== 'waiting' || r.players.length >= 2) return 'abort';
        r.players.push(joiner());
        r.status = 'playing';
        r.startedAt = now() + INTRO_BUDGET_MS;
        return r;
      });
      // «abort» = не вошли (занято/идёт игра); успешный вход виден по игроку
      if (!res.ok || !res.room || !res.room.players.some((p) => p.id === joinerId)) {
        // мог не найтись из-за репликации KV — ретраи
        const fresh = await getFreshRoom(code);
        if (!fresh) {
          errOf(s, m, 'ROOM_NOT_FOUND');
          return;
        }
        if (fresh.status !== 'waiting' || fresh.players.length >= 2) {
          errOf(s, m, 'ROOM_FULL');
          return;
        }
        // редкий случай: комната «проявилась» между попытками — ещё раз
        const retry = await mutateRoom(code, (r) => {
          if (r.status !== 'waiting' || r.players.length >= 2) return 'abort';
          r.players.push(joiner());
          r.status = 'playing';
          r.startedAt = now() + INTRO_BUDGET_MS;
          return r;
        });
        if (
          !retry.ok || !retry.room ||
          !retry.room.players.some((p) => p.id === joinerId)
        ) {
          errOf(s, m, 'ROOM_FULL');
          return;
        }
        res.room = retry.room;
        res.ok = true;
      }
      const room = res.room!;
      s.name = name;
      bindSock(s, room.code, joinerId);
      ensureRoomWatch(room.code);
      // обоим локальным: вьюха старта (соперник узнает и через watch)
      pushLocal(room.code, room);
      send(s, { t: 'room', view: view(room), playerId: joinerId, rid: m.rid });
      return;
    }

    /* ---------- прогресс + присутствие ---------- */
    case 'view': {
      const code = s.roomCode;
      if (!code || !s.playerId) {
        errOf(s, m, 'ROOM_NOT_FOUND');
        return;
      }
      const score = Number(m.score);
      const pairs = Number(m.pairsDone);
      const res = await mutateRoom(code, (r) => {
        const p = r.players.find((x) => x.id === s.playerId);
        if (!p) return r; // нас нет (вышли?) — просто вернём что есть
        p.lastSeen = now();
        if (r.status === 'playing') {
          if (Number.isFinite(score)) p.score = clamp(score, 0, 10_000_000);
          if (Number.isFinite(pairs)) {
            p.pairsDone = clamp(Math.floor(pairs), 0, 1000);
          }
        }
        return autoRules(r, now()) ?? 'abort';
      });
      if (!res.ok && res.room === null) {
        errOf(s, m, 'ROOM_NOT_FOUND');
        return;
      }
      if (res.room) send(s, { t: 'room', view: view(res.room), rid: m.rid });
      return;
    }

    /* ---------- собрал пару: релея сопернику ---------- */
    case 'event': {
      if (m.kind !== 'match') return;
      const code = s.roomCode;
      const myPid = s.playerId;
      if (!code || !myPid) return;
      const score = Number(m.score);
      const pairs = Number(m.pairsDone);
      const res = await mutateRoom(code, (r) => {
        const p = r.players.find((x) => x.id === myPid);
        if (!p) return r;
        p.lastSeen = now();
        if (r.status === 'playing') {
          if (Number.isFinite(score)) p.score = clamp(score, 0, 10_000_000);
          if (Number.isFinite(pairs)) {
            p.pairsDone = clamp(Math.floor(pairs), 0, 1000);
          }
          r.lastEvent = {
            playerId: myPid,
            tile1Id: clamp(Math.floor(Number(m.tile1Id) || 0), 0, 999),
            tile2Id: clamp(Math.floor(Number(m.tile2Id) || 0), 0, 999),
            score: Number.isFinite(score) ? Math.round(score) : 0,
            pairsDone: Number.isFinite(pairs) ? Math.floor(pairs) : 0,
            at: now(),
          };
        }
        return r;
      });
      if (res.room) pushLocal(code, res.room); // локальному сопернику сразу
      return; // соперник на другом изоляте получит через watch
    }

    /* ---------- терминальное событие ---------- */
    case 'finish': {
      const code = s.roomCode;
      if (!code || !s.playerId) {
        errOf(s, m, 'ROOM_NOT_FOUND');
        return;
      }
      const why: 'cleared' | 'tray' = m.reason === 'cleared' ? 'cleared' : 'tray';
      const score = Number(m.score);
      const pairs = Number(m.pairsDone);
      const res = await mutateRoom(code, (r) => {
        const p = r.players.find((x) => x.id === s.playerId);
        if (!p) return r;
        p.lastSeen = now();
        p.finished = why;
        if (Number.isFinite(score)) p.score = clamp(score, 0, 10_000_000);
        if (Number.isFinite(pairs)) {
          p.pairsDone = clamp(Math.floor(pairs), 0, 1000);
        }
        if (r.status === 'playing') {
          if (why === 'cleared') {
            return finishRoom(r, p.id, 'cleared', now());
          }
          const other = r.players.find((x) => x.id !== p.id);
          if (other) return finishRoom(r, other.id, 'tray', now());
        }
        return r;
      });
      if (!res.ok && res.room === null) {
        errOf(s, m, 'ROOM_NOT_FOUND');
        return;
      }
      if (res.room) {
        pushLocal(code, res.room);
        send(s, { t: 'room', view: view(res.room), rid: m.rid });
      }
      return;
    }

    /* ---------- реванш / следующий уровень (оба согласны) ---------- */
    case 'advance': {
      const code = s.roomCode;
      if (!code || !s.playerId) {
        errOf(s, m, 'ROOM_NOT_FOUND');
        return;
      }
      const kind: 'rematch' | 'next' = m.kind === 'next' ? 'next' : 'rematch';
      const advPid = s.playerId;
      const res = await mutateRoom(code, (r) => {
        if (r.status !== 'result') return 'abort';
        if (r.players.length < 2) return 'abort';
        const p = r.players.find((x) => x.id === advPid);
        if (p) {
          p.lastSeen = now();
          r.advanceBy[advPid] = kind;
        }
        const [a, b] = r.players;
        const ka = a ? r.advanceBy[a.id] : undefined;
        const kb = b ? r.advanceBy[b.id] : undefined;
        if (!(ka && kb && ka === kb)) {
          // голос СОХРАНЯЕМ: второй игрок увидит предложение
          return r;
        }
        // оба согласны — старт нового матча (счёт серии НЕ сбрасываем)
        r.advanceBy = {};
        if (kind === 'next') r.level = clamp(r.level + 1, 1, 999);
        r.seed = newSeed();
        r.result = null;
        r.lastEvent = null;
        r.startedAt = now() + INTRO_BUDGET_MS;
        r.timeTotalMs = timeForLevel(r.level);
        for (const p2 of r.players) {
          p2.score = 0;
          p2.pairsDone = 0;
          p2.finished = null;
          p2.lastSeen = now();
        }
        r.status = 'playing';
        return r;
      });
      if (!res.ok || !res.room) {
        errOf(s, m, 'ROOM_EMPTY');
        return;
      }
      pushLocal(code, res.room);
      send(s, { t: 'room', view: view(res.room), rid: m.rid });
      return;
    }

    /* ---------- выйти (сопернику — победа) ---------- */
    case 'leave': {
      const code = s.roomCode;
      const pid = s.playerId;
      bindSock(s, null, null);
      if (!code || !pid) {
        send(s, { t: 'ok', rid: m.rid });
        return;
      }
      const res = await mutateRoom(code, (r) => {
        r.players = r.players.filter((x) => x.id !== pid);
        delete r.advanceBy[pid];
        if (r.players.length === 0) return 'delete'; // комнату удалим в mutateRoom
        if (r.status === 'playing') {
          return finishRoom(r, r.players[0].id, 'left', now());
        }
        return r;
      });
      if (res.room) pushLocal(code, res.room);
      send(s, { t: 'ok', rid: m.rid });
      return;
    }

    /* ---------- быстрый матч ---------- */
    case 'match': {
      if (typeof m.name === 'string' && m.name.trim()) {
        s.name = sanitizeName(m.name);
      }
      const level = clamp(Math.floor(Number(m.level) || 1), 1, 999);
      if (!s.mmTicket) await createTicketFor(s);
      if (s.mmTicket) {
        const e = await kv.get<TicketState>(['mm', s.mmTicket]);
        if (e?.value && !e.value.paired) {
          await kv.atomic()
            .check(e as KvEntry<unknown>)
            .set(['mm', s.mmTicket], {
              ...e.value,
              name: s.name || 'Игрок',
              level,
              lastSeen: now(),
            })
            .commit()
            .catch(() => {});
        }
      }
      await tryMatchAll();
      // сразу могли подобрать: watch мог уже втащить нас в комнату
      // (и обнулить mmTicket) — проверяем и то, и другое
      const myTicket = s.mmTicket;
      if (myTicket) {
        const e = await kv.get<TicketState>(['mm', myTicket]);
        if (e?.value?.paired) {
          await enterPairedRoom(s, e.value.paired.code, e.value.paired.playerId);
          const room = await getRoom(e.value.paired.code);
          if (room) {
            send(s, {
              t: 'room',
              view: view(room),
              playerId: e.value.paired.playerId,
              rid: m.rid,
            });
            return;
          }
        }
      } else if (s.roomCode && s.playerId) {
        // watch уже втащил — отвечаем готовой комнатой
        const room = await getRoom(s.roomCode);
        if (room) {
          send(s, { t: 'room', view: view(room), playerId: s.playerId, rid: m.rid });
          return;
        }
      }
      send(s, { t: 'mm', status: 'search', rid: m.rid });
      return;
    }

    /** держим тикет живым (клиент раз в ~4 c, пока ищет) */
    case 'match-heart': {
      if (!s.mmTicket) {
        // watch мог уже втащить в комнату — молча ок
        send(s, { t: 'mm', status: s.roomCode ? 'paired' : 'search', rid: m.rid });
        return;
      }
      await touchTicket(s);
      await tryMatchAll();
      const ht = s.mmTicket;
      const e = ht ? await kv.get<TicketState>(['mm', ht]) : null;
      if (e?.value?.paired) {
        await enterPairedRoom(s, e.value.paired.code, e.value.paired.playerId);
        const room = await getRoom(e.value.paired.code);
        if (room) {
          send(s, {
            t: 'room',
            view: view(room),
            playerId: e.value.paired.playerId,
            rid: m.rid,
          });
        }
        return;
      }
      send(s, { t: 'mm', status: 'search', rid: m.rid });
      return;
    }

    case 'match-leave': {
      await dropTicket(s);
      send(s, { t: 'ok', rid: m.rid });
      return;
    }

    case 'ping': {
      // фоновая вкладка: таймеры зажаты браузером, но сокет жив и
      // отвечает на hb — считаем это присутствием (lastSeen)
      const code = s.roomCode;
      const pid = s.playerId;
      if (code && pid) {
        await mutateRoom(code, (r) => {
          const p = r.players.find((x) => x.id === pid);
          // не дублируем свежий поллинг игрока
          if (p && now() - p.lastSeen > 4000) {
            p.lastSeen = now();
            return r;
          }
          return 'abort';
        }).catch(() => {});
      }
      send(s, { t: 'pong', rid: m.rid });
      return;
    }
    default:
      return;
  }
}

/** втянуть сокет в подобранную комнату матчмейкинга */
async function enterPairedRoom(
  s: Sock,
  code: string,
  playerId: string,
): Promise<void> {
  const room = await getFreshRoom(code);
  if (!room || !room.players.some((p) => p.id === playerId)) return;
  s.mmTicket = null;
  bindSock(s, room.code, playerId);
  ensureRoomWatch(room.code);
  // прогреваем lastSeen — игрок только пришёл
  await mutateRoom(room.code, (r) => {
    const p = r.players.find((x) => x.id === playerId);
    if (p) p.lastSeen = now();
    return r;
  }).catch(() => {});
}

/* ==================== HTTP / WS СЕРВЕР ==================== */

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/health') {
    let rooms = 0;
    try {
      for await (const _e of kv.list<RoomState>({ prefix: ['room'] })) rooms++;
    } catch {
      rooms = -1;
    }
    return Response.json({
      ok: true,
      isolate: ISOLATE,
      kv: kvMode,
      sockets: sockets.size,
      rooms,
      v: 2,
    });
  }
  if (url.pathname === '/ws') {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const sock: Sock = {
      ws: socket,
      uid: 'anon',
      name: 'Игрок',
      roomCode: null,
      playerId: null,
      bindEpoch: 0,
      lobby: false,
      mmTicket: null,
      alive: true,
    };
    socket.onopen = () => {
      sockets.add(sock);
    };
    socket.onmessage = (ev) => {
      void onMessage(sock, String(ev.data)).catch((err) => {
        console.warn('[ws] handler:', err instanceof Error ? err.message : err);
      });
    };
    socket.onclose = () => {
      sock.alive = false;
      sockets.delete(sock);
      void dropTicket(sock);
      if (sock.roomCode) {
        // даём клиенту шанс вернуться (grace 30 c на серверных таймерах);
        // здесь только убираем локальную подписку, если больше некому
        const others = localRoomSocks(sock.roomCode);
        if (others.length === 0) releaseRoomWatch(sock.roomCode);
      }
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
    };
    return response;
  }
  if (url.pathname === '/') {
    return Response.json({
      ok: true,
      multiplayer: 'deno',
      ws: `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}/ws`,
      v: 2,
    });
  }
  return new Response('Not Found', { status: 404 });
}

/* фоновые циклы изолята */
setInterval(() => void sweep().catch(() => {}), 1500);
// janitor со случайным смещением — чтобы изоляты не ходили строем
const janitorDelay = 60_000 + Math.floor(Math.random() * 240_000);
setInterval(() => void janitor().catch(() => {}), 300_000 + janitorDelay % 60_000);
setTimeout(() => void janitor().catch(() => {}), janitorDelay);

// hb: живость соединений (браузерные WS сами не пингуют)
setInterval(() => {
  for (const s of sockets) send(s, { t: 'hb' });
}, 25_000);

Deno.serve({ port: PORT }, handle);
console.log(
  `[mj-server] изолят ${ISOLATE} слушает :${PORT} · kv=${kvMode} · v2`,
);
