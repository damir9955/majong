/**
 * Роут-стаб: мультиплеер «1 на 1» переехал на выделенный WebSocket
 * сервер (deno-server/main.ts, Deno Deploy + Deno KV).
 *
 * Этот файл оставлен на прежнем пути, чтобы при распаковке релиз-
 * архива поверх репозитория не оставалось «призрачных» старых
 * роутов (Vercel поднимал бы их и ломал маршрутизацию).
 *
 * Клиент ходит напрямую в WebSocket (адрес по умолчанию
 * wss://mahjong-solitaire.damirkolmurzin.deno.net/ws).
 *
 * Адрес сервера настраивается в Vercel переменной окружения
 * NEXT_PUBLIC_WS_URL (значение вида wss://имя-проекта.deno.dev —
 * путь /ws и схему клиент доправит сам). После смены переменной
 * нужен Redeploy.
 */

import { NextResponse } from 'next/server';

function normalizeWsUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return raw;
  if (u.startsWith('//')) u = 'wss:' + u;
  else if (/^https:\/\//i.test(u)) u = 'wss://' + u.slice(8);
  else if (/^http:\/\//i.test(u)) u = 'ws://' + u.slice(7);
  else if (!/^wss?:\/\//i.test(u)) u = 'wss://' + u;
  try {
    const p = new URL(u);
    if (!p.pathname || p.pathname === '/') p.pathname = '/ws';
    return p.toString();
  } catch {
    return /\/ws\/?$/i.test(u) ? u : u.replace(/\/+$/, '') + '/ws';
  }
}

const WS_URL = normalizeWsUrl(
  process.env.NEXT_PUBLIC_WS_URL ??
    process.env.NEXT_PUBLIC_MAHJONG_WS ??
    'wss://mahjong-solitaire.damirkolmurzin.deno.net/ws',
);

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
