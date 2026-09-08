'use client';

/**
 * Экран игры: выбор режима (Классика / 1 на 1), лоток, доска,
 * кнопки, итоги. «Классика» — без соперника и таймера: просто
 * бесконечные уровни с лотком. «1 на 1» — матч против соперника.
 */

import { useEffect, useState } from 'react';
import { useGame, type GameMode } from '@/lib/game/store';
import { backColorsForLevel } from '@/lib/game/config';
import { Board } from './Board';
import { HUD } from './HUD';
import { Tray } from './Tray';
import { VersusBar } from './VersusBar';
import { MatchIntro } from './MatchIntro';
import { BattleResult } from './BattleResult';
import { ChallengeBanner } from './ChallengeBanner';
import { setSoundEnabled, buzz } from '@/lib/sound';
import { confetti } from '@/lib/game/fx';
import { TileFace } from './TileFace';
import { IconHome } from './icons';
import {
  Sparkles,
  Hand,
  Swords,
  Flower2,
  Lightbulb,
  Shuffle,
  Eye,
  Volume2,
  VolumeX,
} from 'lucide-react';

/* ---------- Экран выбора режима ---------- */

function HomeScreen() {
  const startMode = useGame((s) => s.startMode);
  const level = useGame((s) => s.level);
  const sound = useGame((s) => s.settings.sound);
  const setSound = useGame((s) => s.setSound);

  const go = (mode: GameMode) => {
    buzz(15);
    startMode(mode);
  };

  return (
    <div className="mj-table relative flex h-dvh flex-col items-center justify-center gap-7 px-6 sm:gap-10">
      <button
        type="button"
        className="mj-circle-btn absolute right-3 top-[max(0.8rem,env(safe-area-inset-top))] sm:right-5"
        onClick={() => setSound(!sound)}
        aria-label={sound ? 'Выключить звук' : 'Включить звук'}
        title="Звук"
      >
        {sound ? (
          <Volume2 className="h-5 w-5 text-sky-900 sm:h-6 sm:w-6" />
        ) : (
          <VolumeX className="h-5 w-5 text-stone-400 sm:h-6 sm:w-6" />
        )}
      </button>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-end gap-2 sm:gap-3">
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
        <p className="text-lg font-bold tracking-[0.3em] text-amber-200/85 sm:text-2xl lg:text-3xl">
          МАДЖОНГ
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-md sm:gap-4 lg:max-w-lg">
        <button className="mj-mode-card" onClick={() => go('classic')}>
          <span
            className="mj-mode-ico"
            style={{
              background: 'linear-gradient(160deg, #7fc0ec, #2e6b9e)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
            }}
          >
            <Flower2 className="h-7 w-7 text-white sm:h-9 sm:w-9" />
          </span>
          <span>
            <b className="block text-lg font-black text-stone-800 sm:text-xl lg:text-2xl">
              Классика
            </b>
            <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
              Спокойная игра без соперника
            </span>
          </span>
        </button>

        <button className="mj-mode-card" onClick={() => go('battle')}>
          <span
            className="mj-mode-ico"
            style={{
              background: 'linear-gradient(160deg, #f2b25c, #c07a2a)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
            }}
          >
            <Swords className="h-7 w-7 text-white sm:h-9 sm:w-9" />
          </span>
          <span>
            <b className="block text-lg font-black text-stone-800 sm:text-xl lg:text-2xl">
              1 на 1
            </b>
            <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
              Матч против соперника · трофеи
            </span>
          </span>
        </button>
      </div>

      {/* чип уровня: «Уровень N» — как в классических маджонгах */}
      <span className="mj-level-chip text-[13px] font-black sm:text-base lg:text-lg">
        Уровень {level}
      </span>
    </div>
  );
}

/* ---------- Верхняя панель: как на макете ---------- */

/** идёт ли партия — стоит ли беречь прогресс при выходе */
function hasProgress(): boolean {
  const s = useGame.getState().session;
  if (!s || s.status !== 'play') return false;
  return s.tray.length > 0 || s.tiles.some((t) => t.removed);
}

/**
 * [Домой] [лоток] [номер] — одна строка сверху: белая круглая
 * кнопка слева, компактный лоток в центре (он не главная часть
 * игры и занимает мало места), номер уровня справа. Кнопки
 * управления — внизу (HUD).
 */
function TopBar() {
  const session = useGame((s) => s.session);
  const exitToMenu = useGame((s) => s.exitToMenu);
  const [confirmExit, setConfirmExit] = useState(false);

  if (!session) return null;

  const onHomeClick = () => {
    // случайный тап по кнопке не должен сносить партию — спрашиваем
    if (hasProgress()) setConfirmExit(true);
    else exitToMenu();
  };

  return (
    <>
      <header className="mj-topbar z-20 flex shrink-0 items-center gap-1.5 px-2 pb-1 pt-[max(0.35rem,env(safe-area-inset-top))] sm:gap-3 sm:px-3">
        <button
          type="button"
          className="mj-circle-btn mj-circle-btn-sm shrink-0"
          onClick={onHomeClick}
          aria-label="Домой"
          title="Выйти в меню"
        >
          <IconHome className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
        </button>
        <div className="flex min-w-0 flex-1 justify-center">
          <Tray />
        </div>
        <span className="mj-level-chip shrink-0 text-[13px] font-black tabular-nums sm:text-base lg:text-lg">
          Уровень {session.level}
        </span>
      </header>
      {confirmExit && (
        <div className="mj-overlay z-50" role="dialog" aria-modal="true">
          <div className="mj-card">
            <h2 className="text-2xl font-black text-sky-900 sm:text-3xl">
              Выйти в меню?
            </h2>
            <p className="mt-1 text-sm font-semibold text-stone-500 sm:text-base">
              Прогресс этой партии будет потерян.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button className="mj-btn" onClick={() => exitToMenu()}>
                <IconHome className="mr-1.5 inline h-4 w-4" />
                Да, выйти
              </button>
              <button
                className="mj-btn mj-btn-ghost"
                onClick={() => setConfirmExit(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Итог классического уровня ---------- */

function BonusChip({ kind, delay }: { kind: 'hint' | 'shuffle'; delay: number }) {
  const isHint = kind === 'hint';
  return (
    <span className="mj-bonus-chip" style={{ animationDelay: `${delay}ms` }}>
      {isHint ? (
        <Lightbulb className="h-4 w-4 text-amber-600" />
      ) : (
        <Shuffle className="h-4 w-4 text-sky-600" />
      )}
      {isHint ? 'Подсказка +1' : 'Перемешать +1'}
    </span>
  );
}

function ClassicResult() {
  const session = useGame((s) => s.session);
  const nextLevel = useGame((s) => s.nextLevel);
  const restartLevel = useGame((s) => s.restartLevel);
  const exitToMenu = useGame((s) => s.exitToMenu);

  const status = session?.status;
  const won = status === 'won';
  // даём взрыву последней пары отыграть — баннер чуть позже
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!status || status === 'play') return;
    const show = won ? 1400 : 350;
    const t = window.setTimeout(() => {
      setVisible(true);
      if (won) confetti();
    }, show);
    return () => window.clearTimeout(t);
  }, [status, won]);

  // автопереход на следующий уровень после победы
  useEffect(() => {
    if (!visible || !won) return;
    const t = window.setTimeout(() => nextLevel(), 3600);
    return () => window.clearTimeout(t);
  }, [visible, won, nextLevel]);

  if (!session || status === 'play' || !visible) return null;

  if (won) {
    return (
      <div className="mj-overlay">
        <div className="mj-card">
          <h2 className="text-3xl font-black text-sky-700 sm:text-4xl">
            Уровень пройден!
          </h2>
          <p className="mt-1 text-sm font-semibold text-stone-500 sm:text-base">
            Доска собрана — дальше новая
          </p>
          {session.bonusGrant.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {session.bonusGrant.map((b, i) => (
                <BonusChip key={`${b}-${i}`} kind={b} delay={i * 120} />
              ))}
            </div>
          )}
          <button className="mj-btn" onClick={() => nextLevel()}>
            Дальше
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mj-overlay">
      <div className="mj-card">
        <h2 className="text-3xl font-black text-rose-600 sm:text-4xl">Нет места</h2>
        <div className="mt-4 flex flex-col gap-2">
          <button className="mj-btn" onClick={() => restartLevel()}>
            Ещё раз
          </button>
          <button className="mj-btn mj-btn-ghost" onClick={() => exitToMenu()}>
            Меню
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Обучение ---------- */

function Tutorial({ mode, onGo }: { mode: GameMode; onGo: () => void }) {
  const rows: [typeof Sparkles, string, string][] = [
    [Sparkles, 'Собирай пары', 'Одинаковые плитки взрываются.'],
    [Eye, 'Переворачивай рубашки', 'Тапни закрытую — а её близнеца ищи рядом.'],
    [Hand, 'Смотри под кости', 'Рубашки прячутся и ПОД костями: снимешь верхнюю — нижняя откроется сама.'],
    mode === 'battle'
      ? [Swords, 'Обгони соперника', 'Собери доску быстрее и получи трофеи.']
      : [Flower2, 'Спокойный режим', 'Без таймера и соперника — в своё удовольствие.'],
  ];
  return (
    <div className="mj-overlay">
      <div className="mj-card">
        <h2 className="text-3xl font-black text-sky-900">
          {mode === 'battle' ? 'Маджонг 1 на 1' : 'Маджонг'}
        </h2>
        <div className="mt-2 flex flex-col gap-3">
          {rows.map(([Icon, title, text]) => (
            <div key={title} className="mj-tut-row">
              <span className="mj-tut-ico">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <span>
                <b className="block text-[15px] font-bold text-stone-800 sm:text-lg">
                  {title}
                </b>
                <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
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

/* ---------- Экран игры ---------- */

export function GameScreen() {
  const session = useGame((s) => s.session);
  const hydrated = useGame((s) => s.hydrated);
  const tutorialSeen = useGame((s) => s.tutorialSeen);
  const markTutorialSeen = useGame((s) => s.markTutorialSeen);

  // тикер боя: таймер, соперник, челленджи (≈5 раз/сек).
  // В «Классике» tick ничего не делает.
  useEffect(() => {
    const iv = window.setInterval(() => useGame.getState().tick(), 200);
    return () => window.clearInterval(iv);
  }, []);

  // обучение — один раз при первом запуске
  const [tutDismissed, setTutDismissed] = useState(false);

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

  if (!hydrated || !session) return <HomeScreen />;

  const mode = session.mode;
  const b = session.battle;
  const finished = session.status !== 'play';
  const battleFinished = mode === 'battle' && !!b?.result;
  const showTut = !tutDismissed && !tutorialSeen && !finished;
  const showIntro = mode === 'battle' && !showTut && !!b && !b.started && !finished;

  // цвет рубашек этого уровня (меняется не часто — каждые 5 уровней):
  // CSS-переменные наследуются всем плиткам доски
  const [backA, backB] = backColorsForLevel(session.level);

  return (
    <div
      className="mj-table flex h-dvh flex-col"
      style={{ '--mj-back-a': backA, '--mj-back-b': backB } as React.CSSProperties}
    >
      {mode === 'battle' && <VersusBar />}
      <TopBar />
      {/* z-30: летящие в лоток плитки рисуются поверх верхней панели и лотка */}
      <main className="relative z-30 flex-1">
        <Board />
      </main>
      <HUD />

      {mode === 'battle' && <ChallengeBanner />}
      {showIntro && <MatchIntro />}
      {battleFinished && <BattleResult />}
      {mode === 'classic' && finished && <ClassicResult />}
      {showTut && (
        <Tutorial
          mode={mode}
          onGo={() => {
            setTutDismissed(true);
            markTutorialSeen();
          }}
        />
      )}
    </div>
  );
}
