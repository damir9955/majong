'use client';

/**
 * Минимальная панель: текущий уровень и кнопки —
 * подсказка (ограничена), перемешивание (ограничено),
 * отмена последней плитки, заново, звук.
 */

import { useGame } from '@/lib/game/store';
import { Button } from '@/components/ui/button';
import {
  Undo2,
  RotateCcw,
  Volume2,
  VolumeX,
  Lightbulb,
  Shuffle,
} from 'lucide-react';

function CountBadge({
  count,
  active,
  tone,
}: {
  count: number;
  active: boolean;
  tone: 'amber' | 'emerald';
}) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-400 text-amber-950'
      : 'bg-emerald-400 text-emerald-950';
  return (
    <span
      className={`pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-black tabular-nums shadow ${
        active ? cls : 'bg-stone-500/70 text-white'
      }`}
    >
      {count}
    </span>
  );
}

export function HUD() {
  const session = useGame((s) => s.session);
  const settings = useGame((s) => s.settings);
  const undo = useGame((s) => s.undo);
  const hint = useGame((s) => s.hint);
  const shuffle = useGame((s) => s.shuffle);
  const restart = useGame((s) => s.restartLevel);
  const setSound = useGame((s) => s.setSound);

  if (!session) return null;

  const playing = session.status === 'play';
  // отменить можно и в момент 4-й разной плитки — это спасает от проигрыша
  const canUndo = playing && session.tray.length > 0;
  const canHint = playing && !session.pendingLose && session.hintsLeft > 0;
  const canShuffle = playing && !session.pendingLose && session.shufflesLeft > 0;

  return (
    <header className="z-20 flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-[max(0.6rem,env(safe-area-inset-top))]">
      <span className="mj-level-chip text-lg font-black tracking-wide">
        Уровень&nbsp;<span className="tabular-nums">{session.level}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <span className="relative">
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={hint}
            disabled={!canHint}
            aria-label="Подсказка"
            title="Подсказка"
          >
            <Lightbulb className="h-4.5 w-4.5" />
          </Button>
          <CountBadge
            count={session.hintsLeft}
            active={session.hintsLeft > 0}
            tone="amber"
          />
        </span>
        <span className="relative">
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={shuffle}
            disabled={!canShuffle}
            aria-label="Перемешать"
            title="Перемешать плитки"
          >
            <Shuffle className="h-4.5 w-4.5" />
          </Button>
          <CountBadge
            count={session.shufflesLeft}
            active={session.shufflesLeft > 0}
            tone="emerald"
          />
        </span>
        <Button
          variant="secondary"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Вернуть плитку"
          title="Вернуть последнюю плитку из лотка"
        >
          <Undo2 className="h-4.5 w-4.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={restart}
          aria-label="Начать уровень заново"
          title="Начать уровень заново"
        >
          <RotateCcw className="h-4.5 w-4.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={() => setSound(!settings.sound)}
          aria-label={settings.sound ? 'Выключить звук' : 'Включить звук'}
          title="Звук"
        >
          {settings.sound ? (
            <Volume2 className="h-4.5 w-4.5" />
          ) : (
            <VolumeX className="h-4.5 w-4.5 text-amber-200/50" />
          )}
        </Button>
      </div>
    </header>
  );
}
