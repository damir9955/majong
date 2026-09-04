'use client';

/**
 * Экран партии: HUD, лоток, доска и лёгкие оверлеи
 * (победа с бонусами и автопереходом, проигрыш, короткое
 * обучение при первом запуске). Уровни бесконечны.
 */

import { useEffect, useState } from 'react';
import { useGame, type BonusItem } from '@/lib/game/store';
import { Board } from './Board';
import { HUD } from './HUD';
import { Tray } from './Tray';
import { setSoundEnabled, buzz } from '@/lib/sound';
import { confetti } from '@/lib/game/fx';
import { Sparkles, Hand, Lightbulb, Shuffle } from 'lucide-react';

function BonusChip({ kind, delay }: { kind: BonusItem; delay: number }) {
  const isHint = kind === 'hint';
  return (
    <span className="mj-bonus-chip" style={{ animationDelay: `${delay}ms` }}>
      {isHint ? (
        <Lightbulb className="h-4 w-4 text-amber-600" />
      ) : (
        <Shuffle className="h-4 w-4 text-emerald-600" />
      )}
      {isHint ? 'Подсказка +1' : 'Перемешать +1'}
    </span>
  );
}

function WinBanner({
  level,
  bonuses,
  onNext,
}: {
  level: number;
  bonuses: BonusItem[];
  onNext: () => void;
}) {
  useEffect(() => {
    confetti();
  }, []);
  return (
    <div className="mj-overlay mj-win" onClick={onNext} role="button" aria-label="Дальше">
      <div className="mj-card mj-win-card" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-700/70">
          уровень {level}
        </p>
        <h2 className="mt-1 text-4xl font-black text-emerald-900">Пройден!</h2>
        {bonuses.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {bonuses.map((b, i) => (
              <BonusChip key={`${b}-${i}`} kind={b} delay={350 + i * 170} />
            ))}
          </div>
        )}
        <button className="mj-btn" onClick={onNext}>
          Дальше
        </button>
      </div>
    </div>
  );
}

function LoseOverlay({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mj-overlay">
      <div className="mj-card">
        <h2 className="text-3xl font-black text-stone-800">Нет места</h2>
        <button className="mj-btn" onClick={onRetry}>
          Ещё раз
        </button>
      </div>
    </div>
  );
}

function Tutorial({ onGo }: { onGo: () => void }) {
  const rows: [typeof Sparkles, string, string][] = [
    [Sparkles, 'Собирай пары', 'Одинаковые плитки взрываются.'],
    [Hand, 'Удерживай плитку', 'Отодвинь пальцем — увидишь, что под ней.'],
  ];
  return (
    <div className="mj-overlay">
      <div className="mj-card">
        <h2 className="text-3xl font-black text-emerald-900">Маджонг</h2>
        <div className="mt-2 flex flex-col gap-3">
          {rows.map(([Icon, title, text]) => (
            <div key={title} className="mj-tut-row">
              <span className="mj-tut-ico">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <b className="block text-[15px] font-bold text-stone-800">{title}</b>
                <span className="mt-0.5 block text-[13px] leading-snug text-stone-600">
                  {text}
                </span>
              </span>
            </div>
          ))}
        </div>
        <button
          className="mj-btn"
          onClick={() => {
            buzz(15);
            onGo();
          }}
        >
          Играть
        </button>
      </div>
    </div>
  );
}

export function GameScreen() {
  const session = useGame((s) => s.session);
  const hydrated = useGame((s) => s.hydrated);
  const tutorialSeen = useGame((s) => s.tutorialSeen);
  const markTutorialSeen = useGame((s) => s.markTutorialSeen);
  const nextLevel = useGame((s) => s.nextLevel);
  const restartLevel = useGame((s) => s.restartLevel);

  // создать партию после гидратации сохранения
  useEffect(() => {
    if (hydrated) useGame.getState().start();
  }, [hydrated]);

  // обучение — один раз при первом запуске (производное состояние,
  // без setState в эффекте)
  const [tutDismissed, setTutDismissed] = useState(false);

  // победа: показать баннер и автоматически перейти дальше
  // (3.8 с — успевает отыграть взрыв последней пары)
  const won = session?.status === 'won';
  useEffect(() => {
    if (!won) return;
    const t = window.setTimeout(() => useGame.getState().nextLevel(), 4200);
    return () => window.clearTimeout(t);
  }, [won]);

  // горячие клавиши (десктоп)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'u' || k === 'z') useGame.getState().undo();
      if (k === 'r') useGame.getState().restartLevel();
      if (k === 'h') useGame.getState().hint();
      if (k === 's') useGame.getState().shuffle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setSoundEnabled(useGame.getState().settings.sound);
  }, [session?.sid]);

  if (!session) return null;

  const lost = session.status === 'lost';
  const showTut = !tutDismissed && !tutorialSeen && !won && !lost;

  return (
    <div className="mj-table flex h-dvh flex-col">
      <HUD />
      <Tray />
      {/* z-30: летящие в лоток плитки рисуются поверх панели и лотка */}
      <main className="relative z-30 flex-1">
        <Board />
      </main>

      {won && (
        <WinBanner
          level={session.level}
          bonuses={session.bonusGrant}
          onNext={nextLevel}
        />
      )}
      {lost && !won && <LoseOverlay onRetry={restartLevel} />}
      {showTut && (
        <Tutorial
          onGo={() => {
            setTutDismissed(true);
            markTutorialSeen();
          }}
        />
      )}
    </div>
  );
}
