import { spawn } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

/**
 * Task 47: «оживитель» локального mультиплеер-сервера (Deno :8080).
 *
 * Проблема: песочница превью убивает фоновые процессы между
 * инструментальными вызовами — Deno-сервер, запущенный вручную,
 * умирает, и вся сетевая часть (комнаты, друзья, поиск по коду)
 * перестаёт работать «сама по себе». Единственные выживающие
 * процессы — цепочка `next dev` и ЕЁ потомки (пример: postcss-
 * воркер). Поэтому Deno-сервер поднимается как потомок next-server
 * прямо из этого роута.
 *
 * Хранилище: ЛОКАЛЬНЫЙ Deno KV-файл (deno-server/local.kv) —
 * переживает рестарты песочницы (друзья больше не пропадают).
 * Прод-базу (filess.io) НЕ делим с продом: старый сервер прода
 * держит 4 из 5 соединений роли — локальному ничего не остаётся
 * («too many connections»), плюс RTT ~225 мс делал бы превью
 * медленным. Превью живёт в своей базе; прод — в своей.
 *
 * Как работает:
 *  - клиент (roomApi.ts) перед подключением к ws://localhost:8080
 *    дёргает GET /api/ws-ensure (только когда цель — localhost);
 *  - роут проверяет /health на :8080; если жив — отвечает сразу;
 *  - если мёртв — запускает `deno run main.ts` (detached, stdio в
 *    лог-файл) и ждёт поднятия (до ~20 с);
 *  - результат: сокет-клиент подключается к гарантированно живому
 *    серверу; если Deno упал ПОСЛЕ старта — следующий реконнект
 *    клиента снова вызовет этот роут и поднимет его (self-healing).
 *
 * Прод (Vercel): роут ничего не поднимает — бинаря Deno там нет,
 * а клиент вызывает его только на localhost.
 */

export const dynamic = 'force-dynamic';

const DENO_BIN = '/home/z/.deno/bin/deno';
const DENO_DIR = '/home/z/my-project/deno-server';
const LOG_FILE = path.join(DENO_DIR, 'logs', 'server.log');
const KV_FILE = path.join(DENO_DIR, 'local.kv');
const HEALTH_URL = 'http://127.0.0.1:8080/health';

/** один процесс на все одновременные запросы */
let booting: Promise<boolean> | null = null;

async function isUp(): Promise<boolean> {
  try {
    const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1200) });
    return r.ok;
  } catch {
    return false;
  }
}

function spawnDeno(): boolean {
  if (!existsSync(DENO_BIN) || !existsSync(path.join(DENO_DIR, 'main.ts'))) {
    return false;
  }
  try {
    // логи — добавлением, чтобы историю было видно
    const out = openSync(LOG_FILE, 'a');
    const err = openSync(LOG_FILE, 'a');
    // ВАЖНО: выкидываем DATABASE_URL из окружения next-процесса
    // (скриплет ставит file:...custom.db для Prisma — Deno принял бы
    // её за Postgres и вяз в бесконечных ретраях вместо локального KV)
    const { DATABASE_URL: _drop, ...parentEnv } = process.env;
    const child = spawn(
      DENO_BIN,
      [
        'run',
        '--unstable-kv',
        '--allow-net',
        '--allow-env',
        // KV-файл: openKv(path) требует прав чтения/записи каталога
        `--allow-read=${DENO_DIR}`,
        `--allow-write=${DENO_DIR}`,
        'main.ts',
      ],
      {
        cwd: DENO_DIR,
        env: {
          ...parentEnv,
          // персистентный локальный KV: друзья/комнаты превью
          // переживают рестарты сервера и песочницы (Task 47)
          MJ_KV_PATH: KV_FILE,
          PORT: '8080',
        },
        detached: true,
        stdio: ['ignore', out, err],
      },
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function ensureBooted(): Promise<boolean> {
  if (await isUp()) return true;
  if (!spawnDeno()) return false;
  // ждать поднятия: SQL-подключение к filess.io занимает 1-4 с
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    if (await isUp()) return true;
  }
  return await isUp();
}

export async function GET() {
  if (booting) {
    const ok = await booting;
    return NextResponse.json(
      { ok, already: ok },
      { status: ok ? 200 : 503 },
    );
  }
  booting = ensureBooted().finally(() => {
    booting = null;
  });
  const ok = await booting;
  if (ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { ok: false, hint: 'deno-server не поднялся — смотри deno-server/logs/server.log' },
    { status: 503 },
  );
}
