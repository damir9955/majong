/**
 * Полное скачивание игры в кеш (Task 36).
 *
 * Просьба юзера: «при первой установке скачивались абсолютно все
 * файлы — иначе потом картинки не прогружаются». Загрузчик качает:
 *  — все публичные ассеты (42 кости, 6 текстур стола, иконки, лого,
 *    манифест);
 *  — сам HTML приложения и ВСЕ его скрипты/стили (парсим страницу
 *    и забираем каждый <script src> / <link href>);
 * и складывает это в Cache API (то же хранилище, из которого
 * Service Worker раздаёт игру офлайн).
 *
 * Прогресс — счётчик файлов (каждый файл весит по-разному, но
 * полоса всё равно живая и честная до «скачано N из M»).
 */

import { SW_CACHE, GAME_VERSION, readMarker, writeMarker } from './version';

/* ---------- список публичных ассетов ---------- */

const TILE_KINDS = ['bam', 'chr', 'dot'] as const;
const TILE_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const TILE_4 = [1, 2, 3, 4] as const;

/** 42 кости набора */
const TILES: string[] = [
  ...TILE_KINDS.flatMap((k) => TILE_9.map((n) => `/tiles/${k}-${n}.webp`)),
  ...[1, 2, 3].map((n) => `/tiles/drg-${n}.webp`),
  ...TILE_4.map((n) => `/tiles/flower-${n}.webp`),
  ...TILE_4.map((n) => `/tiles/season-${n}.webp`),
  ...TILE_4.map((n) => `/tiles/wind-${n}.webp`),
];

/** текстуры столов + иконки + лого + манифест */
export const PUBLIC_ASSETS: string[] = [
  '/tex/emerald-felt.webp',
  '/tex/fabric.webp',
  '/tex/felt.webp',
  '/tex/light-wood.webp',
  '/tex/walnut-wood.webp',
  '/tex/wood.webp',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/logo.svg',
  '/manifest.webmanifest',
];

/* ---------- сбор адресов приложения (HTML → скрипты/стили) ---------- */

function sameOriginFile(u: string): boolean {
  try {
    const p = new URL(u, location.origin);
    if (p.origin !== location.origin) return false;
    if (p.pathname.startsWith('/api/')) return false;
    return true;
  } catch {
    return false;
  }
}

/** свежий HTML + все адреса, которые он тянет (JS/CSS/прелоды) */
async function collectShellUrls(): Promise<{
  html: Response;
  urls: string[];
}> {
  const res = await fetch(freshUrl('/'), { cache: 'no-store' });
  if (!res.ok) throw new Error('html ' + res.status);
  const clone = res.clone();
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const set = new Set<string>();
  doc
    .querySelectorAll('script[src], link[href], img[src]')
    .forEach((el) => {
      const v =
        (el as HTMLScriptElement).src ??
        (el as HTMLLinkElement).href ??
        (el as HTMLImageElement).src ??
        '';
      if (v && sameOriginFile(v)) set.add(new URL(v, location.origin).toString());
    });
  return { html: clone, urls: [...set] };
}

/* ---------- скачивание с прогрессом ---------- */

/** маркер «мимо кеша» — SW видит его и идёт в СЕТЬ (Task 38):
 *  без него загрузчик получал от SW СТАРУЮ копию из кеша и
 *  «обновление» навсегда оставляло игрока на старых файлах */
function freshUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}__mjfresh=1`;
}

export interface DownloadResult {
  ok: boolean;
  count: number;
  failed: string[];
}

/**
 * Скачать ВСЁ в кеш. Прогресс — колбэком (done, total).
 * Одиночные сбои переспрашиваются один раз; если сеть совсем
 * пропала — вернём ok=false и покажем «подключитесь к интернету».
 */
export async function downloadAllAssets(
  onProgress: (done: number, total: number) => void,
): Promise<DownloadResult> {
  if (typeof caches === 'undefined') {
    // Cache API нет (старый браузер/приватный режим): играем онлайн
    return { ok: true, count: 0, failed: [] };
  }

  const shell = await collectShellUrls().catch(() => null);
  const urls: string[] = [...PUBLIC_ASSETS, ...TILES];
  if (shell) urls.push(...shell.urls);

  const cache = await caches.open(SW_CACHE);
  const total = urls.length + (shell ? 1 : 0);
  let done = 0;
  const failed: string[] = [];

  const report = () => onProgress(Math.min(done, total), total);

  // сам документ — в кеш
  if (shell) {
    try {
      await cache.put('/', shell.html);
    } catch {
      // документ не положился — ассеты всё равно качаем
    }
    done++;
    report();
  }

  const fetchOne = async (url: string) => {
    try {
      // freshUrl — СВЕЖАЯ копия из сети; в кеш кладём под ЧИСТЫМ url
      const res = await fetch(freshUrl(url), { cache: 'reload' });
      if (res.ok) {
        await cache.put(url, res.clone());
      } else {
        throw new Error(String(res.status));
      }
    } catch {
      // один повтор — сеть моргнула
      try {
        const retry = await fetch(freshUrl(url), { cache: 'reload' });
        if (retry.ok) await cache.put(url, retry.clone());
        else throw new Error(String(retry.status));
      } catch {
        failed.push(url);
      }
    }
    done++;
    report();
  };

  // 6 параллельных потоков: и быстро, и полоса живая
  const queue = [...urls];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      await fetchOne(url);
    }
  });
  await Promise.all(workers);

  // терпим единичные сбои (SW докачает на ходу), но не больше 10%
  const ok = failed.length <= Math.ceil(total * 0.1);
  return { ok, count: total - failed.length, failed };
}

/* ---------- проверка новой версии на сервере ---------- */

/**
 * Спросить у прод-сборки её версию (роут /api/version инлайнится
 * при деплое). Отличается от нашей → в фоне перекачать всё и
 * обновить маркер: обновление применится при СЛЕДУЮЩЕМ запуске.
 */
export async function fetchServerVersion(): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { v?: unknown };
    return typeof j.v === 'string' ? j.v : null;
  } catch {
    return null;
  }
}

/**
 * Тихое фоновое обновление: скачать новую версию целиком и
 * записать маркер. Пользователь НЕ замечает — игра уже идёт
 * из старого кеша, свежие файлы подменятся при СЛЕДУЮЩЕМ запуске.
 */
export async function backgroundUpdate(): Promise<void> {
  try {
    const serverV = await fetchServerVersion();
    if (!serverV) return; // сети нет — попробуем в другой раз
    const m = readMarker();
    if (m && m.v === serverV) return; // уже всё скачано
    if (serverV === GAME_VERSION) {
      // наша страница УЖЕ новая, маркер просто отстал —
      // докачиваем недостающее и фиксируем маркер
      const res = await downloadAllAssets(() => {});
      if (res.ok) writeMarker(res.count);
      return;
    }
    // на сервере более новая сборка, чем наша страница: качаем ЕЁ
    // целиком в кеш (HTML + все скрипты) — при следующем запуске
    // браузер возьмёт из кеша уже новую версию, без ожидания сети
    const res = await downloadAllAssets(() => {});
    if (res.ok) writeMarkerFor(serverV, res.count);
  } catch {
    // не вышло — попробуем при следующем запуске
  }
}

function writeMarkerFor(v: string, files: number): void {
  try {
    localStorage.setItem(
      'mahjong-installed',
      JSON.stringify({ v, at: Date.now(), files }),
    );
  } catch {
    // ignore
  }
}
