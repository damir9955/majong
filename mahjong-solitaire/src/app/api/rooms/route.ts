/**
 * POST /api/rooms — создать комнату по коду приглашения.
 * Ответ: { playerId, view } — playerId надо сохранить и присылать
 * во всех дальнейших запросах (это «личность» игрока в комнате).
 */

import { NextResponse } from 'next/server';
import { createRoom, hostIdOf, roomView } from '@/lib/rooms/roomStore';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      level?: unknown;
    };
    const { room } = createRoom(body.name, body.level);
    return NextResponse.json(
      { playerId: hostIdOf(room), view: roomView(room) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'SERVER' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    );
  }
}
