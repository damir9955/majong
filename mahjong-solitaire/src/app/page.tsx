'use client';

/**
 * Точка входа: сплеш до гидратации сохранения, затем сразу игра.
 * Никакого меню — уровни идут бесконечной лестницей.
 */

import { useEffect } from 'react';
import { useGame } from '@/lib/game/store';
import { setSoundEnabled } from '@/lib/sound';
import { GameScreen } from '@/components/game/GameScreen';
import { TileFace } from '@/components/game/TileFace';

function Splash() {
  return (
    <div className="mj-table flex h-dvh flex-col items-center justify-center gap-4">
      <div className="flex items-end gap-2">
        <div className="mj-logo-tile" style={{ transform: 'rotate(-8deg)' }}>
          <TileFace defId="drg-1" />
        </div>
        <div
          className="mj-logo-tile"
          style={{ transform: 'rotate(6deg) translateY(-6px)' }}
        >
          <TileFace defId="drg-2" />
        </div>
      </div>
      <p className="text-lg font-bold tracking-widest text-amber-200/80">МАДЖОНГ</p>
    </div>
  );
}

export default function Page() {
  const hydrated = useGame((s) => s.hydrated);

  useEffect(() => {
    setSoundEnabled(useGame.getState().settings.sound);
    if (useGame.persist.hasHydrated()) {
      useGame.getState().setHydrated(true);
    }
    const unsub = useGame.persist.onFinishHydration(() => {
      useGame.getState().setHydrated(true);
      setSoundEnabled(useGame.getState().settings.sound);
    });
    return unsub;
  }, []);

  if (!hydrated) return <Splash />;
  return <GameScreen />;
}
