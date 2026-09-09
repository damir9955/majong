/**
 * Комната «игра с другом» по коду приглашения.
 *
 *  GET  /api/rooms/[code]?playerId=&score=&pairsDone=
 *       — поллинг состояния (~1 раз/сек): присутствие игрока,
 *         «попутный» отчёт своего прогресса, авто-исходы (тайм-аут,
 *         отключение). Ответ — публичное состояние комнаты.
 *  POST /api/rooms/[code]  { playerId, action, ... }
 *       — join (войти по коду), finish (собрал доску / лоток полон),
 *         next / rematch (Дальше / Реванш), leave (выйти).
 */

import { NextResponse } from 'next/server';
import {
  advanceRoom,
  joinRoom,
  leaveRoom,
  normalizeCode,
  pollRoom,
  reportFinish,
  roomView,
} from '@/lib/rooms/roomStore';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

type Params = { params: Promise<{ code: string }> };

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status, headers: NO_STORE });
}

export async function GET(req: Request, ctx: Params) {
  const { code: raw } = await ctx.params;
  const code = normalizeCode(raw);
  if (!code) return err(400, 'BAD_CODE');
  const url = new URL(req.url);
  const view = pollRoom(
    code,
    url.searchParams.get('playerId'),
    {
      score: url.searchParams.get('score'),
      pairsDone: url.searchParams.get('pairsDone'),
    },
  );
  if (!view) return err(404, 'ROOM_NOT_FOUND');
  return NextResponse.json(view, { headers: NO_STORE });
}

export async function POST(req: Request, ctx: Params) {
  const { code: raw } = await ctx.params;
  const code = normalizeCode(raw);
  if (!code) return err(400, 'BAD_CODE');

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // пустое/битое тело — обработается как неизвестное действие
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const playerId = body.playerId;

  if (action === 'join') {
    const res = joinRoom(code, body.name);
    if ('error' in res) {
      return res.error === 'not_found'
        ? err(404, 'ROOM_NOT_FOUND')
        : err(409, 'ROOM_FULL');
    }
    const { room } = res;
    const joined = room.players[room.players.length - 1];
    return NextResponse.json(
      { playerId: joined.id, view: roomView(room) },
      { headers: NO_STORE },
    );
  }

  if (action === 'finish') {
    const view = reportFinish(code, playerId, body.reason);
    if (!view) return err(404, 'ROOM_NOT_FOUND');
    return NextResponse.json({ view }, { headers: NO_STORE });
  }

  if (action === 'next' || action === 'rematch') {
    const res = advanceRoom(code, action);
    if ('error' in res) {
      if (res.error === 'not_found') return err(404, 'ROOM_NOT_FOUND');
      if (res.error === 'empty') return err(410, 'ROOM_EMPTY');
      return err(409, 'NOT_YET');
    }
    return NextResponse.json(
      { view: roomView(res.room) },
      { headers: NO_STORE },
    );
  }

  if (action === 'leave') {
    const res = leaveRoom(code, playerId);
    if ('error' in res) return err(404, 'ROOM_NOT_FOUND');
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  return err(400, 'BAD_ACTION');
}
