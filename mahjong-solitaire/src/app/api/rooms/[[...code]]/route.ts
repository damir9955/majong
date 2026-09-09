/**
 * ЕДИНЫЙ роут комнат «С другом» + матчмейкинга.
 *
 * ВСЕ запросы (создание, вход, поллинг, финалы, sync и очередь
 * быстрого матча) идут через ЭТОТ файл — на serverless-хостинге
 * это одно function-окружение с общей памятью модуля. Раньше
 * создание и поллинг жили в разных роутах (разные функции,
 * раздельная память) — из-за этого создатель комнаты «зависал
 * в ожидании», хотя друг уже вошёл.
 *
 *  POST /api/rooms                { name, level } — создать комнату
 *  POST /api/rooms                { action: 'match', name, level, ticketId? } — в очередь
 *  POST /api/rooms                { action: 'match-leave', ticketId } — выйти из очереди
 *  GET  /api/rooms?match=<ticketId> — статус подбора (поллинг ~1/сек)
 *
 *  GET  /api/rooms/<code>?playerId=&score=&pairsDone= — поллинг комнаты
 *  POST /api/rooms/<code>  { action, playerId, ... }
 *       — join / finish / next / rematch / leave / sync
 *        sync: пересоздать комнату из снимка игрока (когда запрос
 *        попал на инстанс, где комнаты не оказалось).
 */

import { NextResponse } from 'next/server';
import {
  advanceRoom,
  createRoom,
  hostIdOf,
  joinRoom,
  leaveRoom,
  listOpenRooms,
  matchJoin,
  matchLeave,
  matchPoll,
  normalizeCode,
  pollRoom,
  reportFinish,
  roomView,
  syncRoom,
} from '@/lib/rooms/roomStore';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status, headers: NO_STORE });
}

function ok(data: Record<string, unknown>) {
  return NextResponse.json(data, { headers: NO_STORE });
}

type Ctx = { params: Promise<{ code?: string[] }> };

/* ---------- POST /api/rooms — создать игру / очередь матча ---------- */

async function handleRootPost(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // пустое тело — обработается как создание с дефолтами
  }
  const action = typeof body.action === 'string' ? body.action : '';

  if (action === 'match') {
    const res = matchJoin(body.name, body.level, body.ticketId);
    return ok(
      res.paired
        ? { ticketId: res.ticketId, status: 'paired', ...res.paired }
        : { ticketId: res.ticketId, status: 'search' },
    );
  }

  if (action === 'match-leave') {
    return ok(matchLeave(body.ticketId));
  }

  // создание игры (совместимо со старым форматом { name, level };
  //  visibility: 'open' — игра видна в списке открытых игр)
  const { room } = createRoom(body.name, body.level, body.visibility);
  return ok({ playerId: hostIdOf(room), view: roomView(room) });
}

/* ---------- GET /api/rooms ----------
 *  ?match=<ticketId> — статус подбора (поллинг ~1/сек)
 *  без параметров    — список открытых игр (лобби) */

async function handleRootGet(req: Request) {
  const url = new URL(req.url);
  const ticketId = url.searchParams.get('match');
  if (!ticketId) return ok({ rooms: listOpenRooms() });
  const res = matchPoll(ticketId);
  return ok(res as unknown as Record<string, unknown>);
}

/* ---------- /api/rooms/<code> ---------- */

async function handleCodeGet(req: Request, code: string) {
  const c = normalizeCode(code);
  if (!c) return err(400, 'BAD_CODE');
  const url = new URL(req.url);
  const view = pollRoom(c, url.searchParams.get('playerId'), {
    score: url.searchParams.get('score'),
    pairsDone: url.searchParams.get('pairsDone'),
  });
  if (!view) return err(404, 'ROOM_NOT_FOUND');
  return ok(view as unknown as Record<string, unknown>);
}

async function handleCodePost(req: Request, code: string) {
  const c = normalizeCode(code);
  if (!c) return err(400, 'BAD_CODE');

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // пустое/битое тело — обработается как неизвестное действие
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const playerId = body.playerId;

  if (action === 'join') {
    const res = joinRoom(c, body.name);
    if ('error' in res) {
      return res.error === 'not_found'
        ? err(404, 'ROOM_NOT_FOUND')
        : err(409, 'ROOM_FULL');
    }
    const { room } = res;
    const joined = room.players[room.players.length - 1];
    return ok({ playerId: joined.id, view: roomView(room) });
  }

  if (action === 'sync') {
    const { room } = syncRoom(c, body);
    return ok({ view: roomView(room) });
  }

  if (action === 'finish') {
    const view = reportFinish(c, playerId, body.reason);
    if (!view) return err(404, 'ROOM_NOT_FOUND');
    return ok({ view });
  }

  if (action === 'next' || action === 'rematch') {
    const res = advanceRoom(c, action);
    if ('error' in res) {
      if (res.error === 'not_found') return err(404, 'ROOM_NOT_FOUND');
      if (res.error === 'empty') return err(410, 'ROOM_EMPTY');
      return err(409, 'NOT_YET');
    }
    return ok({ view: roomView(res.room) });
  }

  if (action === 'leave') {
    const res = leaveRoom(c, playerId);
    if ('error' in res) return err(404, 'ROOM_NOT_FOUND');
    return ok({ ok: true });
  }

  return err(400, 'BAD_ACTION');
}

/* ---------- dispatcher: опциональный catch-all ---------- */

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const first = code?.[0];
  try {
    if (!first) return await handleRootPost(req);
    return await handleCodePost(req, first);
  } catch {
    return err(500, 'SERVER');
  }
}

export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const first = code?.[0];
  try {
    if (!first) return await handleRootGet(req);
    return await handleCodeGet(req, first);
  } catch {
    return err(500, 'SERVER');
  }
}
