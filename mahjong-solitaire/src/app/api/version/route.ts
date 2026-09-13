import { NextResponse } from 'next/server';
import { GAME_VERSION } from '@/lib/pwa/version';

/**
 * Версия текущей сборки (Task 36): клиент сравнивает её с маркером
 * «игра полностью скачана» и при расхождении тихо перекачивает
 * файлы в фоне — обновление применяется при следующем запуске.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { v: GAME_VERSION },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
