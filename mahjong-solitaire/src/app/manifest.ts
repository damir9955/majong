import type { MetadataRoute } from 'next';

/**
 * PWA-манифест — база для публикации в Google Play как TWA
 * (Trusted Web Activity) через Bubblewrap/ PWABuilder.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Маджонг — классика и матчи 1 на 1',
    short_name: 'Маджонг',
    description:
      'Два режима: спокойная Классика без соперника и матчи 1 на 1 с трофеями и лигами от Бронзы до Легенды.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // ПОРТРЕТ ВСЕГДА (Фидбек Task 39): TWA/PWA не вертится на бок
    // при наклоне телефона — даже если системная блокировка ориентации
    // на устройстве включена, приложение держит портрет само
    orientation: 'portrait',
    background_color: '#0c2214',
    theme_color: '#0c2214',
    lang: 'ru',
    categories: ['games', 'puzzle'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
