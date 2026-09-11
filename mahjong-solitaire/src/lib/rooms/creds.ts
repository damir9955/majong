/**
 * Креды комнаты (код + playerId) и имя игрока — чистое хранилище
 * в localStorage. Отдельный модуль, чтобы и транспорт (net.ts),
 * и фасад (roomApi.ts) читали ОДНИ те же данные без циклов импортов.
 */

export interface RoomCreds {
  code: string;
  playerId: string;
  /** я создатель комнаты */
  host?: boolean;
  /** открытая игра — видна в лобби */
  visibility?: 'open' | 'closed';
  /** сид и уровень — подсказка для отображения */
  seed?: number;
  level?: number;
  /** имя игрока */
  name?: string;
}

const CREDS_KEY = 'mahjong-room';
const NAME_KEY = 'mahjong-name';

export function getSavedCreds(): RoomCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as {
      code?: unknown;
      playerId?: unknown;
      host?: unknown;
      visibility?: unknown;
      seed?: unknown;
      level?: unknown;
      name?: unknown;
    };
    if (
      typeof c.code === 'string' &&
      c.code.length === 5 &&
      typeof c.playerId === 'string' &&
      c.playerId.length > 0
    ) {
      return {
        code: c.code,
        playerId: c.playerId,
        host: c.host === true,
        visibility: c.visibility === 'open' ? 'open' : 'closed',
        seed: typeof c.seed === 'number' ? c.seed : undefined,
        level: typeof c.level === 'number' ? c.level : undefined,
        name: typeof c.name === 'string' ? c.name : undefined,
      };
    }
  } catch {
    // битый стор — считаем, что комнаты нет
  }
  return null;
}

export function saveCredsRaw(creds: RoomCreds) {
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  } catch {
    // приватный режим — игра без сохранения комнаты
  }
}

export function clearCredsRaw() {
  try {
    localStorage.removeItem(CREDS_KEY);
  } catch {
    // ignore
  }
}

/** имя игрока (запоминается после первого ввода) */
export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNameRaw(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}
