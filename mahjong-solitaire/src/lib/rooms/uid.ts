/**
 * Постоянный uid игрока — «паспорт» аккаунта: друзья, переписка и
 * короткий код («Мой ID») привязаны к нему на сервере.
 *
 * На устройстве хранится сразу в ТРЁХ местах (молча, без единой
 * строки в интерфейсе — пользователь ничего не должен видеть):
 *   1. localStorage — основное хранилище (как раньше);
 *   2. cookie (400 дней) — переживает чистки/эвикции localStorage
 *      («Освободить место», некоторые режимы браузеров);
 *   3. IndexedDB — третья резервная копия.
 *
 * При инициализации восстановление идёт по цепочке
 * localStorage → cookie → IndexedDB; найденное значение тут же
 * продублируется во все три хранилища. Сервер хранит друзей в
 * внешней базе — устройство отвечает только за «кто я».
 */

const LS_KEY = 'mahjong-uid';
const COOKIE = 'mj-uid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 дней (потолок Chrome)
const IDB_NAME = 'mj-auth';
const IDB_STORE = 'uid';
const IDB_KEY = 'uid';
const UID_MIN = 8;

let current: string | null = null;
let pending: Promise<string> | null = null;

/* ---------------- localStorage ---------------- */

function fromLS(): string | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v && v.length >= UID_MIN ? v : null;
  } catch {
    return null; // приватный режим / блокировка хранилищ
  }
}

function toLS(uid: string): void {
  try {
    localStorage.setItem(LS_KEY, uid);
  } catch {
    // приватный режим — cookie/IDB остаются страховкой
  }
}

/* ---------------- cookie ---------------- */

function fromCookie(): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
    const v = m ? decodeURIComponent(m[1]) : '';
    return v && v.length >= UID_MIN ? v : null;
  } catch {
    return null;
  }
}

function toCookie(uid: string): void {
  try {
    document.cookie =
      COOKIE + '=' + encodeURIComponent(uid) +
      '; max-age=' + COOKIE_MAX_AGE +
      '; path=/; SameSite=Lax';
  } catch {
    // ignore
  }
}

/* ---------------- IndexedDB ---------------- */

function openIDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function fromIDB(): Promise<string | null> {
  const db = await openIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const v = req.result;
        resolve(typeof v === 'string' && v.length >= UID_MIN ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function toIDB(uid: string): Promise<void> {
  const db = await openIDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(uid, IDB_KEY);
  } catch {
    // ignore
  }
}

/* ---------------- генерация и каскад ---------------- */

/** Новый uid в прежнем формате (uuid + '-' + время) —
 *  существующие идентификаторы не меняются. */
export function generateUid(): string {
  const uuid =
    crypto.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return uuid + '-' + Date.now();
}

/** Молча принять uid как текущий и продублировать во все
 *  хранилища устройства (вызывается, если кто-то сгенерировал
 *  uid раньше каскада — редкий путь). */
export function adoptUid(uid: string): void {
  if (!uid || uid.length < UID_MIN) return;
  if (current && current !== uid && pending) return; // уже есть легитимный
  current = uid;
  pending = Promise.resolve(uid);
  toLS(uid);
  toCookie(uid);
  void toIDB(uid);
}

/** Восстановить или создать uid. Вызывается до первого соединения
 *  с сервером — hello уходит уже с постоянным идентификатором. */
export function ensureUid(): Promise<string> {
  if (current) return Promise.resolve(current);
  if (!pending) {
    pending = (async () => {
      let uid = fromLS() ?? fromCookie();
      if (!uid) uid = await fromIDB();
      if (!uid) uid = generateUid();
      // молча продублировать во все хранилища устройства
      toLS(uid);
      toCookie(uid);
      void toIDB(uid);
      current = uid;
      return uid;
    })();
  }
  return pending;
}

/** Текущий uid синхронно. До ensureUid может вернуть '' —
 *  безопасно для UI (идентификация нужна только для сети). */
export function getUidSync(): string {
  return current ?? fromLS() ?? fromCookie() ?? '';
}
