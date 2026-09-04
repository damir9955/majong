'use client';

/**
 * Лоток сверху: 4 места для плиток. Парные плитки взрываются,
 * четыре разные — проигрыш. Плитки прилетают сюда с доски.
 */

import { slotEls } from '@/lib/game/traySlots';
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
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="mj-slot"
          ref={(el) => {
            slotEls[i] = el;
          }}
        />
      ))}
    </div>
  );
}
