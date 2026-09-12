/**
 * Роут-стаб: мультиплеер «1 на 1» живёт на WebSocket-сервере
 * Deno Deploy (deno-server/main.ts, деплой Playground'ом).
 *
 * Этот файл оставлен на прежнем пути, чтобы при распаковке релиз-
 * архива поверх репозитория не оставалось «призрачных» старых
 * роутов (Vercel поднимал бы их и ломал маршрутизацию).
 *
 * Клиент ходит напрямую в WebSocket:
 * wss://mahjong-solitaire.damirkolmurzin.deno.net (корень; локально —
 * ws://localhost:8080). Никаких переменных окружения: адрес зашит
 * в src/lib/rooms/roomApi.ts одной константой.
 */

import { NextResponse } from 'next/server';

const WS_URL = 'wss://mahjong-solitaire.damirkolmurzin.deno.net';

function hint() {
  return NextResponse.json({
    ok: true,
    multiplayer: 'deno',
    ws: WS_URL,
    hint: 'Комнаты и дуэли работают по WebSocket: ' + WS_URL,
  });
}

export async function GET() {
  return hint();
}

export async function POST() {
  return hint();
}

export async function PUT() {
  return hint();
}

export async function DELETE() {
  return hint();
}
