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
    orientation: 'any',
    background_color: '#0e3255',
    theme_color: '#0e3255',
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
