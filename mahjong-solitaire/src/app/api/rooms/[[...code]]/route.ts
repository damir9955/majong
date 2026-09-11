/**
 * Мультиплеер переехал на Deno Deploy (Task 29): комнаты, матчмейкинг
 * и дуэли живут на WebSocket-сервере (см. deno-server/), состояние —
 * в Deno KV. Этот роут больше не участвует в игре и оставлен как
 * информационный стаб (адрес сервера — src/lib/rooms/serverUrl.ts).
 */

import { NextResponse } from 'next/server';
import { SERVER_WS_URL } from '@/lib/rooms/serverUrl';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    multiplayer: 'deno',
    ws: SERVER_WS_URL,
    hint: 'Комнаты и дуэли работают по WebSocket: ' + SERVER_WS_URL,
  });
}

export async function POST() {
  return NextResponse.json(
    { error: 'MOVED_TO_DENO', ws: SERVER_WS_URL },
    { status: 410 },
  );
}
