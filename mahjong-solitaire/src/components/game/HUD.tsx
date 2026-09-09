'use client';

/**
 * Нижняя панель — три круглые кнопки В ДОКЕ (паттерн топовых
 * маджонгов из Google Play): тёмная мягкая капсула-подставка,
 * внутри [отмена] [перемешать] [помощь] с бейджами-счётчиками.
 *
 * Кнопка «Домой» — в верхней панели (TopBar), звук и язык — в
 * настройках на экране меню. Если бонус КОНЧИЛСЯ — тап по кнопке
 * предлагает получить 1 бонус за просмотр рекламы.
 */

import { useGame, UNDOS_MAX, HINTS_MAX, SHUFFLES_MAX } from '@/lib/game/store';
import { useT } from '@/lib/i18n';
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
        ? 'bg-emerald-300 text-emerald-950'
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
  const setAdOffer = useGame((s) => s.setAdOffer);
  const t = useT();

  if (!session) return null;

  // в «Классике» матч начинается сразу — без интро
  const playing =
    session.status === 'play' &&
    (session.mode === 'classic' || !!session.battle?.started);

  /** тап по бонусу: если он закончился — предложение рекламы */
  const onUndo = () => {
    if (session.tray.length === 0) return; // возвращать нечего
    if (session.undosLeft <= 0) {
      if (playing && session.undosLeft < UNDOS_MAX) setAdOffer('undo');
      return;
    }
    undo();
  };
  const onShuffle = () => {
    if (session.shufflesLeft <= 0) {
      if (playing && session.shufflesLeft < SHUFFLES_MAX) setAdOffer('shuffle');
      return;
    }
    if (session.pendingLose) return;
    shuffle();
  };
  const onHint = () => {
    if (session.hintsLeft <= 0) {
      if (playing && session.hintsLeft < HINTS_MAX) setAdOffer('hint');
      return;
    }
    if (session.pendingLose) return;
    hint();
  };

  const canUndo = playing && session.tray.length > 0;
  const canShuffle = playing && !session.pendingLose;
  const canHint = playing && !session.pendingLose;

  return (
    <footer className="z-20 flex shrink-0 items-center justify-center px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1">
      <div className="mj-dock flex items-center gap-3.5 p-1.5 sm:gap-5 sm:p-2">
        <span className="relative">
          <button
            type="button"
            className="mj-circle-btn mj-circle-btn-sm mj-circle-btn-muted"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t('hud.undo')}
            title={t('hud.undoLeft', { n: session.undosLeft })}
          >
            <Undo2 className="h-5 w-5 text-[#22432e] sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
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
            onClick={onShuffle}
            disabled={!canShuffle}
            aria-label={t('hud.shuffle')}
            title={t('hud.shuffle')}
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
            onClick={onHint}
            disabled={!canHint}
            aria-label={t('hud.hint')}
            title={t('hud.hint')}
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
