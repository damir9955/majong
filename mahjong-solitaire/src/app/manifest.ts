import type { MetadataRoute } from 'next';

/**
 * PWA-манифест — база для публикации в Google Play как TWA
 * (Trusted Web Activity) через Bubblewrap/ PWABuilder.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Маджонг — расслабляющий пасьянс',
    short_name: 'Маджонг',
    description:
      'Маджонг-пасьянс с бесконечными уровнями: находи пары, отправляй их в лоток и убирай доску. Удерживай плитку пальцем, чтобы заглянуть под неё.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0d4030',
    theme_color: '#0d4030',
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
