'use client';

/**
 * Экран игры: меню выбора режима (Классика / 1 на 1 / С другом),
 * настройки (язык и звук), таблица результатов, лоток, доска, кнопки,
 * итоги. «1 на 1» — выбор соперника: компьютер или реальный человек
 * (быстрый матч через интернет). При входе на уровень с прогрессом
 * спрашиваем «продолжить или начать заново».
 */

import { useEffect, useRef, useState } from 'react';
import { useGame, type GameMode } from '@/lib/game/store';
import { backColorsForLevel } from '@/lib/game/config';
import { useT, useLang, trNow } from '@/lib/i18n';
import { Board } from './Board';
import { HUD } from './HUD';
import { Tray } from './Tray';
import { VersusBar } from './VersusBar';
import { MatchIntro } from './MatchIntro';
import { BattleResult } from './BattleResult';
import { ChallengeBanner } from './ChallengeBanner';
import { RoomScreen } from './RoomScreen';
import { Matchmaker } from './Matchmaker';
import { Standings } from './Standings';
import { AdModal } from './AdModal';
import { setSoundEnabled, buzz } from '@/lib/sound';
import { confetti, showToast } from '@/lib/game/fx';
import { TileFace } from './TileFace';
import { IconHome } from './icons';
import {
  apiPollRoom,
  apiSyncRoom,
  clearCreds,
  getSavedCreds,
  type RoomSnapshot,
} from '@/lib/rooms/roomApi';
import { RoomError, type RoomView } from '@/lib/rooms/types';
import {
  Sparkles,
  Hand,
  Swords,
  Flower2,
  Lightbulb,
  Shuffle,
  Eye,
  Users,
  Trophy,
  Settings,
  Bot,
  Globe2,
  X,
} from 'lucide-react';

/* ---------- Модальные окна меню ---------- */

/** настройки: язык + звук */
function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const sound = useGame((s) => s.settings.sound);
  const setSound = useGame((s) => s.setSound);
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <div className="mj-overlay">
      <div className="mj-card relative w-full max-w-sm p-6">
        <button
          type="button"
          className="mj-close-x"
          onClick={onClose}
          aria-label={t('room.back')}
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-black text-sky-900">{t('home.settings')}</h2>

        <div className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
            {t('settings.language')}
          </p>
          <div className="mj-lang-switch" data-testid="mj-lang-switch">
            <button
              type="button"
              data-testid="mj-lang-ru"
              className={
                lang === 'ru' ? 'mj-lang-btn mj-lang-btn-active' : 'mj-lang-btn'
              }
              onClick={() => {
                buzz(12);
                setLang('ru');
              }}
            >
              Русский
            </button>
            <button
              type="button"
              data-testid="mj-lang-en"
              className={
                lang === 'en' ? 'mj-lang-btn mj-lang-btn-active' : 'mj-lang-btn'
              }
              onClick={() => {
                buzz(12);
                setLang('en');
              }}
            >
              English
            </button>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
            {t('settings.sound')}
          </p>
          <div className="mj-lang-switch">
            <button
              type="button"
              className={sound ? 'mj-lang-btn mj-lang-btn-active' : 'mj-lang-btn'}
              onClick={() => setSound(true)}
            >
              {t('settings.on')}
            </button>
            <button
              type="button"
              className={!sound ? 'mj-lang-btn mj-lang-btn-active' : 'mj-lang-btn'}
              onClick={() => setSound(false)}
            >
              {t('settings.off')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** выбор соперника для «1 на 1»: компьютер или человек */
function OpponentChoice({
  onPick,
  onClose,
}: {
  onPick: (kind: 'bot' | 'human') => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="mj-overlay">
      <div className="mj-card relative w-full max-w-sm p-6">
        <button
          type="button"
          className="mj-close-x"
          onClick={onClose}
          aria-label={t('room.back')}
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-black text-sky-900">{t('opp.title')}</h2>
        <div className="mt-4 flex flex-col gap-3">
          <button className="mj-mode-card" onClick={() => onPick('bot')}>
            <span
              className="mj-mode-ico"
              style={{
                background: 'linear-gradient(160deg, #f2b25c, #c07a2a)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
              }}
            >
              <Bot className="h-7 w-7 text-white sm:h-9 sm:w-9" />
            </span>
            <span>
              <b className="block text-lg font-black text-stone-800 sm:text-xl">
                {t('opp.computer')}
              </b>
              <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
                {t('opp.computerSub')}
              </span>
            </span>
          </button>
          <button className="mj-mode-card" onClick={() => onPick('human')}>
            <span
              className="mj-mode-ico"
              style={{
                background: 'linear-gradient(160deg, #7fd4c1, #1f8f7a)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
              }}
            >
              <Globe2 className="h-7 w-7 text-white sm:h-9 sm:w-9" />
            </span>
            <span>
              <b className="block text-lg font-black text-stone-800 sm:text-xl">
                {t('opp.human')}
              </b>
              <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
                {t('opp.humanSub')}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Экран выбора режима ---------- */

function HomeScreen({
  onOnline,
  onSettings,
  onStandings,
  onBattle,
}: {
  onOnline: () => void;
  onSettings: () => void;
  onStandings: () => void;
  onBattle: () => void;
}) {
  const startMode = useGame((s) => s.startMode);
  const session = useGame((s) => s.session);
  const level = useGame((s) => s.level);
  const credsOnline = !!getSavedCreds();
  const t = useT();

  const go = (mode: GameMode) => {
    buzz(15);
    startMode(mode);
  };

  // партия этого режима сохранена и ещё идёт — кнопка продолжает её
  const resumable = (mode: GameMode) =>
    !!session && session.mode === mode && session.status === 'play';

  return (
    <div className="mj-table relative flex h-dvh flex-col items-center justify-center gap-7 px-6 sm:gap-10">
      <div className="absolute left-3 top-[max(0.8rem,env(safe-area-inset-top))] flex gap-2 sm:left-5">
        <button
          type="button"
          className="mj-circle-btn"
          data-testid="mj-standings-btn"
          onClick={onStandings}
          aria-label={t('home.standings')}
          title={t('home.standings')}
        >
          <Trophy className="h-5 w-5 text-[#b8860b] sm:h-6 sm:w-6" />
        </button>
      </div>
      <div className="absolute right-3 top-[max(0.8rem,env(safe-area-inset-top))] flex gap-2 sm:right-5">
        <button
          type="button"
          className="mj-circle-btn"
          data-testid="mj-settings-btn"
          onClick={onSettings}
          aria-label={t('home.settings')}
          title={t('home.settings')}
        >
          <Settings className="h-5 w-5 text-sky-900 sm:h-6 sm:w-6" />
        </button>
      </div>
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
          {t('home.title')}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-md sm:gap-4 lg:max-w-lg">
        <button className="mj-mode-card" onClick={() => go('classic')}>
          <span
            className="mj-mode-ico"
            style={{
              background: 'linear-gradient(160deg, #7fc0ec, #2e6b9e)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
            }}
          >
            <Flower2 className="h-7 w-7 text-white sm:h-9 sm:w-9" />
          </span>
          <span>
            <b className="block text-lg font-black text-stone-800 sm:text-xl lg:text-2xl">
              {resumable('classic') ? t('home.continue') : t('home.classic')}
            </b>
            <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
              {resumable('classic')
                ? t('home.classicResume', { n: session?.level ?? 1 })
                : t('home.classicSub')}
            </span>
          </span>
        </button>

        <button
          className="mj-mode-card"
          data-testid="mj-battle-card"
          onClick={onBattle}
        >
          <span
            className="mj-mode-ico"
            style={{
              background: 'linear-gradient(160deg, #f2b25c, #c07a2a)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
            }}
          >
            <Swords className="h-7 w-7 text-white sm:h-9 sm:w-9" />
          </span>
          <span>
            <b className="block text-lg font-black text-stone-800 sm:text-xl lg:text-2xl">
              {resumable('battle') ? t('home.continueMatch') : t('home.battle')}
            </b>
            <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
              {resumable('battle')
                ? t('home.battleWaiting', { n: session?.level ?? 1 })
                : t('home.battleSub')}
            </span>
          </span>
        </button>

        <button className="mj-mode-card" onClick={onOnline}>
          <span
            className="mj-mode-ico"
            style={{
              background: 'linear-gradient(160deg, #6fd0b6, #1f8f7a)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
            }}
          >
            <Users className="h-7 w-7 text-white sm:h-9 sm:w-9" />
          </span>
          <span>
            <b className="block text-lg font-black text-stone-800 sm:text-xl lg:text-2xl">
              {resumable('online') && credsOnline
                ? t('home.continueMatch')
                : t('home.online')}
            </b>
            <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
              {resumable('online') && credsOnline
                ? t('home.onlineWaiting', { n: session?.level ?? 1 })
                : t('home.onlineSub')}
            </span>
          </span>
        </button>
      </div>

      {/* чип уровня: «Уровень N» — как в классических маджонгах */}
      <span className="mj-level-chip text-[13px] font-black sm:text-base lg:text-lg">
        {t('home.level', { n: level })}
      </span>
    </div>
  );
}

/* ---------- Верхняя панель: как на макете ---------- */

/**
 * [Домой] [лоток] [номер] — одна строка сверху: белая круглая
 * кнопка слева, компактный лоток в центре, номер уровня справа.
 * Кнопки управления — внизу (HUD). Выход в меню ПРОГРЕСС НЕ ТЕРЯЕТ:
 * партия сохраняется и продолжается по кнопке «Продолжить».
 */
function TopBar() {
  const session = useGame((s) => s.session);
  const exitToMenu = useGame((s) => s.exitToMenu);
  const t = useT();

  if (!session) return null;

  return (
    <header className="mj-topbar z-20 flex shrink-0 items-center gap-1.5 px-2 pb-1 pt-[max(0.35rem,env(safe-area-inset-top))] sm:gap-3 sm:px-3">
      <button
        type="button"
        className="mj-circle-btn mj-circle-btn-home shrink-0"
        onClick={exitToMenu}
        aria-label={t('hud.home')}
        title={t('hud.homeTitle')}
        data-testid="mj-home-btn"
      >
        <IconHome className="h-[26px] w-[26px] sm:h-[32px] sm:w-[32px] lg:h-[36px] lg:w-[36px]" />
      </button>
      <div className="flex min-w-0 flex-1 justify-center">
        <Tray />
      </div>
      <span className="mj-level-chip shrink-0 text-[13px] font-black tabular-nums sm:text-base lg:text-lg">
        {t('home.level', { n: session.level })}
      </span>
    </header>
  );
}

/* ---------- Итог классического уровня ---------- */

function BonusChip({ kind, delay }: { kind: 'hint' | 'shuffle'; delay: number }) {
  const isHint = kind === 'hint';
  const t = useT();
  return (
    <span className="mj-bonus-chip" style={{ animationDelay: `${delay}ms` }}>
      {isHint ? (
        <Lightbulb className="h-4 w-4 text-amber-600" />
      ) : (
        <Shuffle className="h-4 w-4 text-sky-600" />
      )}
      {t(isHint ? 'bonus.hint' : 'bonus.shuffle')}
    </span>
  );
}

function ClassicResult() {
  const session = useGame((s) => s.session);
  const nextLevel = useGame((s) => s.nextLevel);
  const restartLevel = useGame((s) => s.restartLevel);
  const exitToMenu = useGame((s) => s.exitToMenu);
  const t = useT();

  const status = session?.status;
  const won = status === 'won';
  // даём взрыву последней пары отыграть — баннер чуть позже
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!status || status === 'play') return;
    const show = won ? 1400 : 350;
    const tm = window.setTimeout(() => {
      setVisible(true);
      if (won) confetti();
    }, show);
    return () => window.clearTimeout(tm);
  }, [status, won]);

  // автопереход на следующий уровень после победы
  useEffect(() => {
    if (!visible || !won) return;
    const tm = window.setTimeout(() => nextLevel(), 3600);
    return () => window.clearTimeout(tm);
  }, [visible, won, nextLevel]);

  if (!session || status === 'play' || !visible) return null;

  if (won) {
    return (
      <div className="mj-overlay">
        <div className="mj-card">
          <h2 className="text-3xl font-black text-sky-700 sm:text-4xl">
            {t('res.levelDone')}
          </h2>
          <p className="mt-1 text-sm font-semibold text-stone-500 sm:text-base">
            {t('res.levelDoneSub')}
          </p>
          {session.bonusGrant.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {session.bonusGrant.map((b, i) => (
                <BonusChip key={`${b}-${i}`} kind={b} delay={i * 120} />
              ))}
            </div>
          )}
          <button className="mj-btn" onClick={() => nextLevel()}>
            {t('res.next')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mj-overlay">
      <div className="mj-card">
        <h2 className="text-3xl font-black text-rose-600 sm:text-4xl">
          {t('res.noSpace')}
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          <button className="mj-btn" onClick={() => restartLevel()}>
            {t('res.again')}
          </button>
          <button className="mj-btn mj-btn-ghost" onClick={() => exitToMenu()}>
            {t('res.menu')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Обучение ---------- */

function Tutorial({ mode, onGo }: { mode: GameMode; onGo: () => void }) {
  const t = useT();
  const rows: [typeof Sparkles, string, string][] = [
    [Sparkles, t('tut.pairs'), t('tut.pairsText')],
    [Eye, t('tut.flip'), t('tut.flipText')],
    [Hand, t('tut.under'), t('tut.underText')],
    mode === 'classic'
      ? [Flower2, t('tut.classic'), t('tut.classicText')]
      : mode === 'online'
        ? [Users, t('tut.raceFriend'), t('tut.raceFriendText')]
        : [Swords, t('tut.raceBot'), t('tut.raceText')],
  ];
  return (
    <div className="mj-overlay">
      <div className="mj-card">
        <h2 className="text-3xl font-black text-sky-900">
          {mode === 'online'
            ? t('tut.onlineTitle')
            : mode === 'battle'
              ? t('tut.battleTitle')
              : t('tut.classicTitle')}
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
          {t('tut.play')}
        </button>
      </div>
    </div>
  );
}

/* ---------- Вопрос при входе на уровень ---------- */

function LevelEntryDialog() {
  const ask = useGame((s) => s.askLevelEntry);
  const session = useGame((s) => s.session);
  const answer = useGame((s) => s.answerLevelEntry);
  const t = useT();
  if (!ask || !session || session.mode !== 'classic') return null;
  return (
    <div className="mj-overlay" data-testid="mj-level-entry">
      <div className="mj-card relative w-full max-w-sm p-6">
        <button
          type="button"
          className="mj-close-x"
          onClick={() => answer(false)}
          aria-label="×"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-black text-sky-900">
          {t('entry.title', { n: session.level })}
        </h2>
        <p className="mt-1 text-sm font-semibold text-stone-600">
          {t('entry.text')}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            className="mj-btn"
            data-testid="mj-entry-continue"
            onClick={() => answer(false)}
          >
            {t('entry.continue')}
          </button>
          <button
            className="mj-btn mj-btn-ghost"
            data-testid="mj-entry-restart"
            onClick={() => answer(true)}
          >
            {t('entry.restart')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Экран игры ---------- */

export function GameScreen() {
  const session = useGame((s) => s.session);
  const showMenu = useGame((s) => s.showMenu);
  const tutorialSeen = useGame((s) => s.tutorialSeen);
  const markTutorialSeen = useGame((s) => s.markTutorialSeen);

  // комната по коду: экран создания/входа открывается из меню и по
  // ссылке ?room=CODE (из «Поделиться» друга)
  const [initialCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('room') ?? '')
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, '')
      .slice(0, 5);
  });
  const [roomOpen, setRoomOpen] = useState(() => initialCode.length > 0);
  const [mmOpen, setMmOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  // чистим ?room= из адресной строки (в эффекте — НЕ в рендере:
  // Next патчит history, и replaceState в рендере ломает Router)
  useEffect(() => {
    if (initialCode) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [initialCode]);

  // тикер боя: таймер, соперник, челленджи (≈5 раз/сек).
  // В «Классике» tick ничего не делает.
  useEffect(() => {
    const iv = window.setInterval(() => useGame.getState().tick(), 200);
    return () => window.clearInterval(iv);
  }, []);

  /* ---------- поллинг онлайн-комнаты с самовосстановлением ----------
   * Живёт и в меню — присутствие игрока нужно другу, матч не
   * останавливается. 404 (запрос попал на другой инстанс) лечим
   * быстрым повтором и «sync»-пересозданием комнаты из снимка. */
  const isOnline = session?.mode === 'online';
  const sid = session?.sid;
  const missesRef = useRef(0);
  useEffect(() => {
    if (!isOnline) {
      missesRef.current = 0;
      return;
    }
    let alive = true;

    const snapshot = (): RoomSnapshot | null => {
      const creds = getSavedCreds();
      const s = useGame.getState().session;
      const on = s?.battle?.online;
      if (!creds || !s || !on || !s.battle || on.code !== creds.code) return null;
      const b = s.battle;
      const name = creds.name ?? b.opponent.name;
      return {
        code: on.code,
        playerId: on.playerId,
        name: name || 'Игрок',
        level: s.level,
        seed: on.seed,
        hostId: on.hostId ?? creds.playerId,
        status: 'playing',
        timeLeftMs: b.timeLeftMs,
        score: b.myScore,
        pairsDone: b.myPairsDone,
        players: [
          {
            id: on.playerId,
            name: name || 'Игрок',
            hue: 150,
            score: b.myScore,
            pairsDone: b.myPairsDone,
          },
          ...(on.friendId
            ? [
                {
                  id: on.friendId,
                  name: on.friendName ?? 'Друг',
                  hue: on.friendHue ?? 30,
                  score: b.botScore,
                  pairsDone: b.botPairsDone,
                },
              ]
            : []),
        ],
      };
    };

    const poll = async () => {
      const creds = getSavedCreds();
      const s = useGame.getState().session;
      if (!creds || !s?.battle?.online || s.battle.online.code !== creds.code)
        return;
      try {
        const view = await apiPollRoom(creds.code, creds.playerId, {
          score: s.battle.myScore,
          pairsDone: s.battle.myPairsDone,
        });
        if (!alive) return;
        missesRef.current = 0;
        useGame.getState().applyRoomView(view);
      } catch (e) {
        if (!alive) return;
        const code =
          e && typeof e === 'object' && 'code' in e
            ? String((e as { code?: unknown }).code)
            : '';
        if (code === 'ROOM_NOT_FOUND') {
          missesRef.current++;
          // 1) быстрый повтор — 404 бывает «чужим инстансом»
          if (missesRef.current < 6) {
            try {
              const view = await apiPollRoom(creds.code, creds.playerId);
              if (!alive) return;
              missesRef.current = 0;
              useGame.getState().applyRoomView(view);
              return;
            } catch {
              // fallthrough к sync
            }
          }
          // 2) пересоздать комнату из снимка (клиент знает картину)
          const snap = snapshot();
          if (snap) {
            try {
              const view = await apiSyncRoom(snap);
              if (!alive) return;
              missesRef.current = 0;
              useGame.getState().applyRoomView(view);
              return;
            } catch {
              // даже sync не прошёл — считаем ниже
            }
          }
          // 3) комната окончательно потеряна
          if (missesRef.current > 12) {
            missesRef.current = 0;
            showToast(trNow('room.closed'));
            useGame.getState().dropOnlineSession(creds.code);
          }
          return;
        }
        // сеть моргнула — просто ждём следующий тик
      }
    };
    void poll();
    const iv = window.setInterval(() => void poll(), 1100);
    const onVis = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isOnline, sid]);

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

  if (roomOpen) {
    return (
      <RoomScreen
        initialCode={initialCode}
        onClose={() => setRoomOpen(false)}
      />
    );
  }

  if (mmOpen) {
    return <Matchmaker onClose={() => setMmOpen(false)} />;
  }

  if (standingsOpen) {
    return <Standings onClose={() => setStandingsOpen(false)} />;
  }

  if (showMenu || !session) {
    return (
      <>
        <HomeScreen
          onOnline={() => setRoomOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onStandings={() => setStandingsOpen(true)}
          onBattle={() => setOppOpen(true)}
        />
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        {oppOpen && (
          <OpponentChoice
            onPick={(kind) => {
              setOppOpen(false);
              if (kind === 'bot') {
                buzz(15);
                useGame.getState().startMode('battle');
              } else {
                setMmOpen(true);
              }
            }}
            onClose={() => setOppOpen(false)}
          />
        )}
      </>
    );
  }

  const mode = session.mode;
  const b = session.battle;
  const finished = session.status !== 'play';
  const versus = mode === 'battle' || mode === 'online';
  const battleFinished = versus && !!b?.result;
  const showTut = !tutDismissed && !tutorialSeen && !finished;
  const showIntro = versus && !showTut && !!b && !b.started && !finished;

  // цвет рубашек этого уровня (меняется не часто — каждые 5 уровней):
  // CSS-переменные наследуются всем плиткам доски
  const [backA, backB] = backColorsForLevel(session.level);

  return (
    <div
      className="mj-table flex h-dvh flex-col"
      style={{ '--mj-back-a': backA, '--mj-back-b': backB } as React.CSSProperties}
    >
      {versus && <VersusBar />}
      <TopBar />
      {/* z-30: летящие в лоток плитки рисуются поверх верхней панели и лотка */}
      <main className="relative z-30 min-h-0 flex-1">
        <Board />
      </main>
      <HUD />

      {versus && <ChallengeBanner />}
      {showIntro && <MatchIntro />}
      {battleFinished && <BattleResult />}
      {mode === 'classic' && finished && <ClassicResult />}
      <LevelEntryDialog />
      <AdModal />
      {showTut && (
        <Tutorial
          mode={mode}
          onGo={() => {
            setTutDismissed(true);
            markTutorialSeen();
          }}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/* ---------- helpers ---------- */

export type { RoomView };
