/**
 * Версия игры и «маркер установки» (Task 36).
 *
 * GAME_VERSION bumped на каждый релиз (вместе с номером zip).
 * Маркер в localStorage подтверждает: игра ПОЛНОСТЬЮ скачана
 * в кеш (Cache API 'mj-static') именно этой версии.
 *
 * Повторный запуск:
 *  — маркер есть и версия совпадает → мгновенный старт из кеша;
 *  — маркера нет → загрузочное окно с полосой прогресса;
 *  — маркер есть, но версия новее → старт мгновенный, новая
 *    версия скачивается в фоне и применится при СЛЕДУЮЩЕМ запуске.
 */

export const GAME_VERSION = 'v43';

/** имя кеша — то же, что в public/sw.js (менять только в обоих местах) */
export const SW_CACHE = 'mj-static';

const MARKER_KEY = 'mahjong-installed';

export interface InstalledMark {
  v: string;
  at: number;
  files: number;
}

export function readMarker(): InstalledMark | null {
  try {
    const raw = localStorage.getItem(MARKER_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as { v?: unknown; at?: unknown; files?: unknown };
    if (typeof m.v !== 'string') return null;
    return {
      v: m.v,
      at: typeof m.at === 'number' ? m.at : 0,
      files: typeof m.files === 'number' ? m.files : 0,
    };
  } catch {
    return null;
  }
}

export function writeMarker(files: number): void {
  try {
    localStorage.setItem(
      MARKER_KEY,
      JSON.stringify({ v: GAME_VERSION, at: Date.now(), files }),
    );
  } catch {
    // приватный режим — игра будет перекачивать при каждом запуске
  }
}

/** регистрация Service Worker (безопасна при любом отказе) */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // нет HTTPS / приватный режим — игра живёт без оффлайна
    });
  } catch {
    // ignore
  }
}
