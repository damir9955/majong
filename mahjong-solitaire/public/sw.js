/**
 * МАДЖОНГ · Service Worker (Task 36).
 *
 * Стратегия: Cache First для всей статики (HTML, JS, CSS,
 * картинки, звуки) — игра работает ПОЛНОСТЬЮ без интернета и
 * стартует мгновенно из кеша.
 *
 * НЕ кешируем (всегда в сеть):
 *  — любые не-GET запросы;
 *  — чужие домены (WebSocket-сервер Deno и прочие бэкенды);
 *  — наш /api/* (версия, комнаты, health) — только живые данные.
 *
 * Обновления: найденное в кече отдаём мгновенно, а параллельно
 * ТИХО подтягиваем свежую копию в кеш — новая версия применяется
 * при СЛЕДУЮЩЕМ запуске, без выкидывания игрока из игры.
 */

const CACHE = 'mj-static';

self.addEventListener('install', () => {
  // новый SW берёт управление сразу (страниц не ждём)
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // подчистим чужие/старые кеши, наш mj-static не трогаем:
      // он единственный и управляется страницей (маркер версии)
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** тихая ревалидация: свежая копия подменяет кеш для следующего запуска.
 *  cache:'reload' — ОБЯЗАТЕЛЬНО мимо HTTP-кеша браузера: без него
 *  «свежая» копия может прийти с диска и версия никогда не сменится */
async function revalidate(request, cache) {
  try {
    const fresh = await fetch(request, { cache: 'reload' });
    if (fresh && fresh.ok && fresh.type === 'basic') {
      await cache.put(request, fresh.clone());
    }
  } catch {
    // сети нет — в кеше остаётся прежняя копия
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // чужие домены (мультиплеер-сервер, CDN) — только сеть
  if (url.origin !== self.location.origin) return;
  // наш API — всегда живые данные, без кеша
  if (url.pathname.startsWith('/api/')) return;
  // WebSocket-апгрейды сюда не попадают (SW их не видит) — на всякий
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // ?__mjfresh=1 — запрос ЗАГРУЗЧИКА/ОБНОВЛЕНИЯ мимо кеша (Task 38).
  // Раньше загрузчик качал файлы обычным fetch — SW перехватывал его
  // и отдавал СТАРУЮ копию из кеша: «обновление» перезаписывало старую
  // сборку под маркером новой версии, и игрок застревал на старых
  // файлах навсегда. Теперь такие запросы идут в СЕТЬ (мимо кеша и
  // мимо HTTP-кеша), а в кеш ложатся под ЧИСТЫМ адресом.
  if (url.searchParams.has('__mjfresh')) {
    const clean = new URL(url.toString());
    clean.searchParams.delete('__mjfresh');
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(clean.toString(), { cache: 'reload' });
          if (res && res.ok && res.type === 'basic') {
            await cache.put(clean.toString(), res.clone());
          }
          return res;
        } catch {
          // сети нет — отдаём имеющееся
          const hit = await cache.match(clean.toString(), {
            ignoreVary: true,
          });
          if (hit) return hit;
          return new Response('offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // ignoreSearch: открытие с query (?utm…, ?mjboot=1) тоже
      // попадает в закешированный документ «/»
      const hit = await cache.match(req, { ignoreVary: true, ignoreSearch: true });
      if (hit) {
        // обновим в фоне — применится при следующем запуске
        revalidate(req, cache);
        return hit;
      }
      // в кеше нет: идём в сеть (и кешируем на будущее)
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') {
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return new Response('offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});
