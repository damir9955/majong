/**
 * МАДЖОНГ — Service Worker (PWA: оффлайн и мгновенный запуск).
 *
 * СТРАТЕГИЯ «Cache First» для ВСЕЙ статики своего домена:
 * HTML, CSS, JS-чанки, картинки (кости, текстуры, иконки),
 * звуки и шрифты — отдаются из кеша МГНОВЕННО; навигационный
 * HTML после отдачи тихо обновляется в фоне, поэтому новая
 * версия применяется при следующем запуске игры.
 *
 * ИСКЛЮЧЕНИЯ (всегда напрямую в сеть, НИКОГДА из кеша):
 *  — /api/* — запросы к собственному бэкенду;
 *  — ЛЮБОЙ чужой домен — в том числе онлайн-сервер мультиплеера
 *    wss://mahjong-solitaire.damirkolmurzin.deno.net
 *    (WebSocket-соединения fetch-хендлером не перехватываются,
 *     но чужие fetch-запросы к нему тоже идут мимо кеша);
 *  — любые не-GET запросы и схемы ws/wss.
 *
 * ВЕРСИОНИРОВАНИЕ: имя кеша содержит версию. При выпуске
 * обновления версия меняется → новый SW скачивает свежий
 * прекеш в фоне, ждёт (skipWaiting НЕ вызывается) и
 * активируется, когда игрок полностью закроет игру. При
 * активации СТАРЫЕ кеши удаляются — мусора не остаётся.
 * Обновление применяется при следующем перезапуске игры.
 */

const VERSION = 'v38';
const CACHE = 'mj-static-' + VERSION;

/** ядро: ставится в кеш сразу при установке (остальное — по ходу) */
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

/** всегда в сеть: API, бэкенды и онлайн-сервер мультиплеера */
function isNetworkOnly(url) {
  if (url.origin !== self.location.origin) return true; // чужой домен
  if (url.pathname.startsWith('/api/')) return true; // бэкенд
  if (url.pathname.startsWith('/_next/webpack-hmr')) return true; // dev HMR
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // allSettled: один сбой не валит установку целиком
      await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
      // НЕ вызываем skipWaiting(): новая версия должна скачаться
      // в фоне и примениться при СЛЕДУЮЩЕМ перезапуске игры
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // ВЕРСИОНИРОВАНИЕ: все чужие (старые) кеши удаляем
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** ручное ускорение обновления (если понадобится кнопкой) */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // только статика: не-GET (POST/PUT) и WebSocket-рукопожатия — мимо
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  // API, бэкенд и онлайн-сервер — всегда напрямую в сеть
  if (isNetworkOnly(url)) return;
  // Deno Deploy (мультиплеер) — ни одного байта в кеш
  if (url.hostname.endsWith('.deno.net')) return;

  const isNavigate = req.mode === 'navigate';

  // CACHE FIRST: мгновенный ответ из кеша; для HTML — тихое
  // обновление в фоне, чтобы новая версия применилась со
  // следующего запуска ( hashed-чанки приезжают по новым URL )
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, {
        ignoreSearch: isNavigate,
      });
      if (cached) {
        if (isNavigate) {
          // фоновая догрузка свежего HTML (не блокируем ответ)
          event.waitUntil(
            (async () => {
              try {
                const fresh = await fetch(req);
                if (fresh && fresh.ok) await cache.put(req, fresh.clone());
              } catch {
                // сети нет — в следующий раз
              }
            })(),
          );
        }
        return cached;
      }
      // в кеше нет — идём в сеть и складываем в кеш
      try {
        const resp = await fetch(req);
        if (resp && resp.ok && resp.type === 'basic') {
          await cache.put(req, resp.clone());
        }
        return resp;
      } catch (err) {
        // сети нет и кеша нет: офлайн-запуск спасёт главная
        if (isNavigate) {
          const shell = await cache.match('/');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
