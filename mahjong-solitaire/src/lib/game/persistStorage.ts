/**
 * Дебаунс-хранилище для zustand persist (Task 49 — «вылет при долгой игре»).
 *
 * ПРОБЛЕМА: persist в zustand пишет localStorage на КАЖДЫЙ setState.
 * В бою tick() зовёт set() каждые 200 мс (таймер/комбо/челлендж), а в
 * онлайне добавляются пуши сервера на каждое действие соперника —
 * получалось 5–10 полных JSON.stringify сессии + синхронных записей
 * в СЕКУНДУ. За долгий матч — сотни МБ дискового I/O: мобильный
 * WebView/OS убивает вкладку (jetsam), а при переполнении квоты
 * localStorage.setItem бросал исключение СКВОЗЬ set() → error boundary
 * → для игрока это «вылет». У устройства послабее/заполненнее — раньше.
 *
 * РЕШЕНИЕ — три правила:
 *  1. «ВАЖНОЕ» изменение (ход, счёт, статус, уровень, банк, итог…) —
 *     записывается практически сразу (с мини-троттлом 250 мс, чтобы
 *     серия быстрых тапов слилась в одну запись).
 *     «Важность» определяется дешёвой сигнатурой-кортежем из ссылок и
 *     скаляров БЕЗ JSON.stringify — сравнение поэлементно по ===.
 *  2. «ШУМ» (осталось время, комбо-окно, lastTickAt, присутствие) —
 *     копится в pending и пишется не чаще одного раза в MAX_WAIT_MS
 *     (свежий таймер на диске после аварийного закрытия — приятно,
 *     но не критично; сервер онлайн-матча всё равно выравнивает таймер).
 *  3. JSON.stringify выполняется ТОЛЬКО в момент реальной записи, а
 *     сама запись обёрнута в try/catch — квота/приватный режим НИКОГДА
 *     не роняют игру (раньше исключение летело сквозь setState).
 *
 * ПЛЮС гарантии сохранности: при уходе со страницы/сворачивании
 * (visibilitychange → hidden, pagehide — надёжнее всего на iOS,
 * beforeunload — десктоп) отложенная запись сливается на диск
 * немедленно и синхронно — «resume» после закрытия работает как раньше.
 *
 * Формат на диске НЕ меняется: { state, version } тем же ключом —
 * миграции persist не затронуты.
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware';

/** важное пишем не чаще, чем раз в столько (серия тапов → одна запись) */
const LEAD_MIN_MS = 250;
/** шум копится не дольше — потом всё равно пишем */
const DEBOUNCE_MS = 1500;
/** при непрерывном потоке изменений — запись не реже, чем раз в … */
const MAX_WAIT_MS = 4000;

/**
 * Дешёвая «сигнатура важности»: кортеж ссылок и скаляров, которые
 * меняются только от ДЕЙСТВИЙ (ход, пары, счёт, статус, бонусы,
 * уровень, итог матча). Ссылки сравниваются по === — новый массив
 * tiles/tray после тапа отличается от старого даже с тем же содержимым.
 * Таймер (timeLeftMs), комбо-окно, botProgress, присутствие друга и
 * прочая «телеметрия» сюда НЕ входят — их потеря на диске незаметна:
 * при resume таймер продолжает с последнего снимка (≤4 c погрешность),
 * в онлайне его в любом случае выравнивает сервер.
 */
function importanceSignature<S>(v: StorageValue<S> | null): unknown[] {
  if (!v || typeof v !== 'object') return [null];
  const st = v.state as Record<string, unknown> | null | undefined;
  if (!st || typeof st !== 'object') return [null];
  const s = st.session as Record<string, unknown> | null | undefined;
  const b = (s && typeof s === 'object'
    ? (s.battle as Record<string, unknown> | null | undefined)
    : null) as Record<string, unknown> | null | undefined;
  const on = (b && typeof b === 'object'
    ? (b.online as Record<string, unknown> | null | undefined)
    : null) as Record<string, unknown> | null | undefined;
  return [
    st.level,
    st.lastMode,
    st.tutorialSeen,
    st.settings, // ref
    st.bank, // ref
    st.league instanceof Object ? (st.league as { points?: unknown }).points : st.league,
    st.stats, // ref
    s ? s.sid : null,
    s ? s.status : null,
    s ? s.mode : null,
    s ? s.tiles : null, // ref — тап/парта создают новый массив
    s ? s.tray : null, // ref
    s ? s.matchedSeq : null,
    s ? s.shuffleSeq : null,
    s ? s.faceDownIds : null, // ref
    s ? s.buriedIds : null, // ref
    s ? s.revealedIds : null, // ref
    s ? s.peekIds : null, // ref
    s ? s.hintsLeft : null,
    s ? s.shufflesLeft : null,
    s ? s.undosLeft : null,
    b ? b.started : null,
    b ? b.myScore : null,
    b ? b.myPairsDone : null,
    b ? b.result : null, // ref — итог матча (иначе двойное начисление трофеев)
    b ? b.challenge : null, // ref — спавн/истечение челленджа
    on ? on.code : null,
    on ? on.myWins : null,
    on ? on.friendWins : null,
  ];
}

const sameSnap = (a: unknown[], b: unknown[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

interface PendingEntry {
  name: string;
  value: StorageValue<unknown>;
  important: boolean;
}

/**
 * Фабрика хранилища для persist-опций:
 *   storage: createDebouncedLocalStorage<PersistedState>()
 */
export function createDebouncedLocalStorage<S>(): PersistStorage<S> {
  /** единственный ожидающий записи (магазин в игре один) */
  let pending: PendingEntry | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** начало текущего окна ожидания (для MAX_WAIT) */
  let windowStart = 0;
  /** когда была последняя реальная запись */
  let lastWriteAt = 0;
  /** сигнатура последнего НАБЛЮДЁННОГО состояния (не записанного) */
  let lastSeen: unknown[] | null = null;

  const safeWrite = (name: string, value: StorageValue<unknown>): void => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // квота / приватный режим / хранилище недоступно — игра
      // продолжается в памяти; следующая попытка будет позже
    }
  };

  const writeNow = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const p = pending;
    pending = null;
    windowStart = 0;
    lastWriteAt = Date.now();
    safeWrite(p.name, p.value);
  };

  const schedule = (): void => {
    if (typeof window === 'undefined') return;
    if (timer) clearTimeout(timer);
    let delay = DEBOUNCE_MS;
    if (windowStart > 0) {
      // окно уже открыто — не тянем дольше MAX_WAIT
      delay = Math.min(delay, Math.max(0, MAX_WAIT_MS - (Date.now() - windowStart)));
    }
    if (pending && pending.important) {
      // важное, но совсем недавно писали — дождёмся LEAD_MIN
      const since = Date.now() - lastWriteAt;
      delay = Math.min(delay, Math.max(0, LEAD_MIN_MS - since));
    }
    timer = setTimeout(writeNow, delay);
  };

  const onHidden = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      writeNow();
    }
  };

  // гарантия сохранности при уходе со страницы: отложенное
  // пишем немедленно и синхронно — «продолжить партию» работает
  if (typeof window !== 'undefined') {
    try {
      document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('pagehide', writeNow); // iOS/Safari — самый надёжный
      window.addEventListener('beforeunload', writeNow); // десктоп
    } catch {
      // нет DOM-апи — остаётся таймер
    }
    flushers.add(writeNow);
  }

  return {
    getItem: (name: string): StorageValue<S> | null => {
      try {
        const raw = localStorage.getItem(name);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StorageValue<S> | null;
        return parsed && typeof parsed === 'object' && 'state' in parsed
          ? parsed
          : null;
      } catch {
        return null; // битый сейв — persist начнёт с нуля (как раньше)
      }
    },
    setItem: (name: string, value: StorageValue<S>): void => {
      const snap = importanceSignature(value);
      const important = !lastSeen || !sameSnap(snap, lastSeen);
      lastSeen = snap;

      if (typeof window === 'undefined') {
        // SSR-пререндер: пишем сразу и без таймеров (по факту тут
        // хранилища нет — safeWrite молча проглотит)
        safeWrite(name, value as StorageValue<unknown>);
        return;
      }

      pending = { name, value: value as StorageValue<unknown>, important };
      if (windowStart === 0) windowStart = Date.now();

      const since = Date.now() - lastWriteAt;
      if (important && since >= LEAD_MIN_MS) {
        writeNow();
      } else {
        schedule();
      }
    },
    removeItem: (name: string): void => {
      // отменить отложенное, чтобы не воскресить удалённое
      if (pending && pending.name === name) {
        pending = null;
        windowStart = 0;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
      try {
        localStorage.removeItem(name);
      } catch {
        // ignore
      }
    },
  };
}

/** ручной слив отложенных записей (тесты/отладка: __mjDebug.flushSave) */
const flushers = new Set<() => void>();

/** немедленно записать всё отложенное на диск */
export function flushAllPersistedNow(): void {
  for (const fn of flushers) {
    try {
      fn();
    } catch {
      // ignore
    }
  }
}
