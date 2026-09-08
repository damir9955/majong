'use client';

/**
 * Нижняя панель — три круглые кнопки В ДОКЕ (паттерн топовых
 * маджонгов из Google Play): тёмная мягкая капсула-подставка,
 * внутри [отмена] [перемешать] [помощь] с бейджами-счётчиками.
 *
 * Кнопка «Домой» — в верхней панели (TopBar), звук — на экране
 * выбора режима. Отмена ограничена (3 за уровень), подсказки и
 * перемешивания тоже считаются бейджами.
 */

import { useGame } from '@/lib/game/store';
import { Undo2, Shuffle } from 'lucide-react';
import { IconHelp } from './icons';

function CountBadge({
  count,
  active,
  tone,
}: {
  count: number;
  active: boolean;
  tone: 'amber' | 'emerald' | 'sky';
}) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-400 text-amber-950'
      : tone === 'sky'
        ? 'bg-sky-300 text-sky-950'
        : 'bg-emerald-400 text-emerald-950';
  return (
    <span
      className={`pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-black tabular-nums shadow sm:h-5 sm:min-w-5 sm:text-xs ${
        active ? cls : 'bg-stone-500/70 text-white'
      }`}
    >
      {count}
    </span>
  );
}

export function HUD() {
  const session = useGame((s) => s.session);
  const undo = useGame((s) => s.undo);
  const hint = useGame((s) => s.hint);
  const shuffle = useGame((s) => s.shuffle);

  if (!session) return null;

  // в «Классике» матч начинается сразу — без интро
  const playing =
    session.status === 'play' &&
    (session.mode === 'classic' || !!session.battle?.started);
  // отменить можно и в момент 4-й разной плитки — это спасает от
  // поражения, но возвраты ограничены: 3 за уровень
  const canUndo =
    playing && session.tray.length > 0 && session.undosLeft > 0;
  const canHint = playing && !session.pendingLose && session.hintsLeft > 0;
  const canShuffle = playing && !session.pendingLose && session.shufflesLeft > 0;

  return (
    <footer className="z-20 flex shrink-0 items-center justify-center px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1">
      <div className="mj-dock flex items-center gap-3.5 p-1.5 sm:gap-5 sm:p-2">
        <span className="relative">
          <button
            type="button"
            className="mj-circle-btn mj-circle-btn-sm mj-circle-btn-muted"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Вернуть плитку"
            title={`Вернуть последнюю плитку из лотка (осталось ${session.undosLeft})`}
          >
            <Undo2 className="h-5 w-5 text-sky-900 sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
          </button>
          <CountBadge
            count={session.undosLeft}
            active={session.undosLeft > 0}
            tone="sky"
          />
        </span>
        <span className="relative">
          <button
            type="button"
            className="mj-circle-btn mj-circle-btn-sm"
            onClick={shuffle}
            disabled={!canShuffle}
            aria-label="Перемешать"
            title="Перемешать плитки"
          >
            <Shuffle className="h-5 w-5 text-[#b3382c] sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
          </button>
          <CountBadge
            count={session.shufflesLeft}
            active={session.shufflesLeft > 0}
            tone="emerald"
          />
        </span>
        <span className="relative">
          <button
            type="button"
            className="mj-circle-btn mj-circle-btn-sm"
            onClick={hint}
            disabled={!canHint}
            aria-label="Подсказка"
            title="Подсказка"
          >
            <IconHelp className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
          </button>
          <CountBadge
            count={session.hintsLeft}
            active={session.hintsLeft > 0}
            tone="amber"
          />
        </span>
      </div>
    </footer>
  );
}
