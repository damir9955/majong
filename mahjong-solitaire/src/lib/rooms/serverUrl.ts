/**
 * АДРЕС ДЕНО-СЕРВЕРА ДЛЯ МУЛЬТИПЛЕЕРА — ЕДИНСТВЕННОЕ место,
 * которое нужно поменять после деплоя (см. deno-server/README.md).
 *
 * 1) Проще всего: замени wss://…deno.net/ws на адрес своего
 *    приложения на Deno Deploy и закоммить.
 * 2) Либо задай переменную окружения NEXT_PUBLIC_MAHJONG_WS
 *    в настройках проекта на Vercel (тогда правка файла не нужна).
 *
 * Локальная разработка (localhost:3000) автоматически ходит
 * на локальный Deno-сервер (deno task dev в deno-server/, порт 8080).
 */

export const SERVER_WS_URL =
  process.env.NEXT_PUBLIC_MAHJONG_WS ??
  (typeof window !== 'undefined' &&
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
    ? 'ws://localhost:8080/ws'
    : 'wss://mahjong-solitaire.damirkolmurzin.deno.net/ws');
