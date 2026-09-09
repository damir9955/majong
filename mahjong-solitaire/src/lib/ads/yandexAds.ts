/**
 * Реклама с вознаграждением (Рекламная сеть Яндекса).
 *
 * Блок: R-M-20010647-1 (приложение «Маджонг», ID 20010647),
 * валюта вознаграждения «Reward», сумма 1 — по данным из кабинета
 * рекламной сети (скриншот пользователя).
 *
 * ВЕБ-ОГОВОРКА: SDK Яндекс.РС для веба грузится скриптом
 * context.js и рендерит блок через Ya.Context.AdvManager.render.
 * Рендеруем блок в полноэкранный контейнер; если скрипт/блок
 * недоступны (блоки R-M- созданы под мобильные приложения),
 * показываем собственный демо-ролик с 5-секундным таймером —
 * механика «посмотри → получи бонус» работает всегда, а при
 * подключении валидного веб-блока подставится реальная реклама.
 */

/** ID блока «Реклама с вознаграждением» из кабинета Яндекса */
export const YANDEX_REWARDED_BLOCK_ID = 'R-M-20010647-1';
/** минимальное время просмотра до выдачи награды (сек) */
export const AD_WATCH_SEC = 5;

type YandexAds = {
  Context?: {
    AdvManager?: {
      render: (opts: {
        blockId: string;
        renderTo: string;
        type?: string;
        onClose?: () => void;
        onError?: () => void;
      }) => void;
    };
  };
};

declare global {
  interface Window {
    yaContextCb?: Array<() => void>;
    Ya?: YandexAds;
  }
}

let loadPromise: Promise<YandexAds | null> | null = null;

/** однократная загрузка веб-SDK Яндекс.РС (context.js) */
export function loadYandexAds(): Promise<YandexAds | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<YandexAds | null>((resolve) => {
    if (window.Ya?.Context?.AdvManager) {
      resolve(window.Ya);
      return;
    }
    const fail = setTimeout(() => resolve(null), 4000);
    window.yaContextCb = window.yaContextCb ?? [];
    window.yaContextCb.push(() => {
      clearTimeout(fail);
      resolve(window.Ya ?? null);
    });
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://yandex.ru/ads/system/context.js';
    s.onerror = () => {
      clearTimeout(fail);
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}

/** попробовать отрендерить реальный рекламный блок в контейнер */
export async function tryRenderYandexRewarded(containerId: string): Promise<boolean> {
  try {
    const ya = await loadYandexAds();
    const render = ya?.Context?.AdvManager?.render;
    if (typeof render !== 'function') return false;
    let settled = false;
    return await new Promise<boolean>((resolve) => {
      const done = (v: boolean) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const t = setTimeout(() => done(false), 5000);
      render({
        blockId: YANDEX_REWARDED_BLOCK_ID,
        renderTo: containerId,
        type: 'fullscreen',
        onClose: () => {
          clearTimeout(t);
          done(true);
        },
        onError: () => {
          clearTimeout(t);
          done(false);
        },
      });
      // рендер «прошёл», если за 5 с не упал onError — считаем показ
      setTimeout(() => {
        clearTimeout(t);
        done(true);
      }, 2600);
    });
  } catch {
    return false;
  }
}
