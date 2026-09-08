'use client';

/**
 * Лоток сверху: ОДНА широкая прямоугольная зона вместо четырёх
 * отдельных ячеек. Плитки прилетают с доски и встают в ряд;
 * парные соединяются, поднимаются и взрываются, а оставшиеся
 * мягко соскальзывают на освободившееся место. Три плитки —
 * мягкое золотое свечение зоны, четыре — красная тревога.
 */

import { registerTrayZone } from '@/lib/game/traySlots';
import { useGame } from '@/lib/game/store';

export function Tray() {
  const session = useGame((s) => s.session);
  const count = session?.tray.length ?? 0;
  const full = !!session?.pendingLose || session?.status === 'lost';
  const warn = count === 3 && !full;

  return (
    <div
      className={`mj-tray z-20 shrink-0${full ? ' full' : warn ? ' warn' : ''}`}
      aria-label="Лоток для плиток"
    >
      <div className="mj-tray-zone" ref={registerTrayZone} />
    </div>
  );
}
