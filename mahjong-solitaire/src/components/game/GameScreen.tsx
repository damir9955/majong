'use client';

/**
 * Экран игры: меню выбора режима (Классика / 1 на 1 / С другом),
 * настройки (язык и звук), таблица результатов, лоток, доска, кнопки,
 * итоги. «1 на 1» — выбор соперника: компьютер или реальный человек
 * (быстрый матч через интернет). При входе на уровень с прогрессом
 * спрашиваем «продолжить или начать заново».
 */

import { useEffect, useRef, useState } from 'react';
import { useGame, type GameMode, type TableTheme, TABLE_THEMES } from '@/lib/game/store';
import { backColorsForLevel } from '@/lib/game/config';
import { useT, useLang, trNow } from '@/lib/i18n';
import { Board } from './Board';
import { HUD } from './HUD';
import { Tray } from './Tray';
import { VersusBar } from './VersusBar';
import { MatchIntro } from './MatchIntro';
import { BattleResult } from './BattleResult';
import { ChallengeBanner } from './ChallengeBanner';
import { DuelScreen } from './DuelScreen';
import { Standings } from './Standings';
import { AdModal } from './AdModal';
import { setSoundEnabled, buzz } from '@/lib/sound';
import { confetti, showToast } from '@/lib/game/fx';
import { TileFace } from './TileFace';
import { IconGear, IconHome, IconTrophy } from './icons';
import {
  apiJoinRoom,
  apiLeave,
  apiPollRoom,
  clearCreds,
  getSavedCreds,
  getSavedName,
  saveCreds,
  subscribeEvent,
  subscribeLobby,
  subscribeRoom,
  warmupConnection,
} from '@/lib/rooms/roomApi';
import { RoomError, type OpenRoomInfo, type RoomView } from '@/lib/rooms/types';
import {
  Sparkles,
  Hand,
  Swords,
  Flower2,
  Lightbulb,
  Shuffle,
  Eye,
  Users,
  Bot,
  Globe2,
  KeyRound,
  LogIn,
  X,
} from 'lucide-react';

/* ---------- Модальные окна меню ---------- */

/** мини-превью темы (тот же фон, что и на столе) */
const THEME_PREVIEW: Record<TableTheme, string> = {
  emerald:
    "url('/tex/emerald-felt.webp') center / cover, linear-gradient(180deg, #1e4a35, #122e1f)",
  wood: "url('/tex/light-wood.webp') center / cover, linear-gradient(180deg, #d8b98c, #b3905f)",
  walnut:
    "url('/tex/walnut-wood.webp') center / cover, linear-gradient(180deg, #4c352a, #2a1c14)",
  night: 'linear-gradient(180deg, #232830, #161a20)',
  paper: 'linear-gradient(180deg, #f5eeda, #e9dfc4)',
  mint: 'linear-gradient(180deg, #dcede3, #bfddca)',
};

/** настройки: тема стола + язык + звук */
function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const sound = useGame((s) => s.settings.sound);
  const setSound = useGame((s) => s.setSound);
  const theme = useGame((s) => s.settings.theme);
  const setTheme = useGame((s) => s.setTheme);
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
        <h2 className="text-2xl font-black text-[#22432e]">{t('home.settings')}</h2>

        <div className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
            {t('settings.theme')}
          </p>
          <div
            className="grid grid-cols-3 gap-2.5"
            data-testid="mj-themes"
          >
            {TABLE_THEMES.map((id) => (
              <button
                key={id}
                type="button"
                data-testid={`mj-theme-${id}`}
                className={`mj-theme-sw${theme === id ? ' mj-theme-sw-on' : ''}`}
                onClick={() => {
                  buzz(10);
                  setTheme(id);
                }}
                aria-label={t(`theme.${id}`)}
                title={t(`theme.${id}`)}
              >
                <span
                  className="mj-theme-sw-bg"
                  style={{ background: THEME_PREVIEW[id] }}
                />
                <span className="mj-theme-sw-name">{t(`theme.${id}`)}</span>
              </button>
            ))}
          </div>
        </div>

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

/* ---------- Экран выбора режима ---------- */

/** Ждущие игроки внизу главного меню (Task 28): живая полоска
 *  открытых комнат — видно, кто прямо сейчас ждёт соперника,
 *  и можно зайти к нему одним тапом, не открывая «1 на 1».
 *  Task 35 (фидбек «открытая игра должна отображаться на главном
 *  меню, на первом экране»): САМАЯ ПЕРВАЯ строка плашки — своя
 *  открытая игра. Пока комната жива, хозяин видит её в меню
 *  ВСЕГДА (даже после перезагрузки): код и кнопка «открыть».
 *  Поллинг заодно держит комнату тёплой — другие игроки видят
 *  её в своём списке, а янитор сервера не убивает по «пропал» */
function WaitingPlayers({
  hidden,
  onOpenOwn,
}: {
  hidden: boolean;
  onOpenOwn: () => void;
}) {
  const t = useT();
  const [rooms, setRooms] = useState<OpenRoomInfo[] | null>(null);
  /** своя ждущая комната (код) — видна в меню, пока жива */
  const [own, setOwn] = useState<{ code: string } | null>(null);
  /** код комнаты, в которую входим (кнопка «…») */
  const [joining, setJoining] = useState('');
  /** живая партия другого режима будет закрыта — спросить */
  const [replaceWarn, setReplaceWarn] = useState(false);
  /** Фидбек: тап по ждущему игроку сначала спрашивает «точно
   * присоединиться?» — случайный тап не кидает в чужую игру */
  const [confirmRoom, setConfirmRoom] = useState<OpenRoomInfo | null>(null);
  const pendingRef = useRef('');

  // лобби открытых игр — живая подписка (WebSocket, ~2 c)
  useEffect(() => {
    const off = subscribeLobby((list) => setRooms(list));
    return off;
  }, []);

  // СВОЯ комната: жива ли, ждём ли ещё (и держим её тёплой)
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const creds = getSavedCreds();
      if (!creds) {
        setOwn(null);
        return;
      }
      try {
        const v = await apiPollRoom(creds.code, creds.playerId);
        if (!alive) return;
        if (v.status === 'waiting' && v.players[0]?.id === creds.playerId) {
          setOwn({ code: creds.code });
          return;
        }
        // матч уже идёт — карточка «1 на 1» сама ведёт обратно,
        // строка не нужна (не дублируем)
        setOwn(null);
      } catch {
        // сеть моргнула или комната умерла — на следующем тике
        if (!alive) return;
        setOwn(null);
      }
    };
    void check();
    const iv = window.setInterval(() => void check(), 4000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);

  const doJoin = async (roomCode: string) => {
    if (joining) return;
    setJoining(roomCode);
    try {
      const nm = getSavedName().trim() || 'Игрок';
      const { playerId, view } = await apiJoinRoom(roomCode, nm);
      saveCreds({
        code: roomCode,
        playerId,
        host: playerId === view.hostId,
        visibility: view.visibility ?? 'closed',
        seed: view.seed,
        level: view.level,
        name: nm,
      });
      buzz(15);
      // игрок сам выбрал «против человека» — другая партия не мешает
      const s = useGame.getState().session;
      if (s && s.mode !== 'online' && s.status === 'play') {
        useGame.setState({ session: null });
      }
      useGame.getState().applyRoomView(view);
    } catch (e) {
      showToast(
        e instanceof RoomError && e.code === 'ROOM_FULL'
          ? t('room.full')
          : t('room.network'),
      );
      // список открытых игр обновится сам (подписка на лобби)
    } finally {
      setJoining('');
    }
  };

  const join = (roomCode: string) => {
    const s = useGame.getState().session;
    if (s && s.mode !== 'online' && s.status === 'play') {
      pendingRef.current = roomCode;
      setReplaceWarn(true);
      return;
    }
    void doJoin(roomCode);
  };

  /** «точно присоединиться?» → да → обычный join (со своими
   * проверками: замена живой партии и т.д.) */
  const joinConfirmed = () => {
    const r = confirmRoom;
    setConfirmRoom(null);
    if (r) join(r.code);
  };

  if (hidden) return null;
  const creds = getSavedCreds();
  // свою комнату не предлагаем самому себе
  const list = (rooms ?? []).filter((r) => r.code !== creds?.code);
  if (!own && list.length === 0) return null;

  return (
    <div
      className="mj-waiting-bar w-full max-w-sm sm:max-w-md"
      data-testid="mj-waiting-bar"
    >
      <div className="mj-waiting-head">
        <span className="mj-waiting-dot" />
        <p>{t('wait.title')}</p>
      </div>

      {/* своя открытая игра — всегда первой строкой на первом
          экране: видно код и то, что комната ждёт соперника */}
      {own && (
        <button
          type="button"
          className="mj-waiting-own"
          data-testid="mj-waiting-own"
          onClick={() => {
            buzz(12);
            onOpenOwn();
          }}
        >
          <span className="mj-waiting-own-av">Я</span>
          <span className="mj-waiting-info">
            <b>{t('wait.ownTitle')}</b>
            <span>{t('wait.ownSub', { code: own.code })}</span>
          </span>
          <span className="mj-waiting-join">
            <LogIn className="h-4 w-4" />
            {t('wait.ownOpen')}
          </span>
        </button>
      )}

      {list.length > 0 && (
        <div className="mj-waiting-rows">
          {list.slice(0, 3).map((r) => (
            <button
              key={r.code}
              type="button"
              className="mj-waiting-row"
              data-testid="mj-waiting-row"
              disabled={!!joining}
              onClick={() => {
                buzz(8);
                setConfirmRoom(r);
              }}
            >
              <span
                className="mj-open-av"
                style={{ background: `hsl(${r.hue} 52% 42%)` }}
              >
                {(r.hostName[0] ?? 'И').toUpperCase()}
              </span>
              <span className="mj-waiting-info">
                <b>{r.hostName}</b>
                <span>{t('home.level', { n: r.level })}</span>
              </span>
              <span className="mj-waiting-join">
                <LogIn className="h-4 w-4" />
                {joining === r.code ? '…' : t('wait.join')}
              </span>
            </button>
          ))}
          {list.length > 3 && (
            <span className="mj-waiting-more">
              {t('wait.more', { n: list.length - 3 })}
            </span>
          )}
        </div>
      )}

      {confirmRoom && (
        <div className="mj-overlay" data-testid="mj-join-confirm">
          <div className="mj-card">
            <h2 className="text-2xl font-black text-[#22432e]">
              {t('wait.confirmTitle')}
            </h2>
            <p className="mt-2 text-sm font-semibold text-stone-600">
              {t('wait.confirmText', {
                name: confirmRoom.hostName,
                n: confirmRoom.level,
              })}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                className="mj-btn"
                data-testid="mj-join-confirm-yes"
                onClick={joinConfirmed}
              >
                {t('wait.confirmYes')}
              </button>
              <button
                className="mj-btn mj-btn-ghost"
                onClick={() => setConfirmRoom(null)}
              >
                {t('wait.confirmNo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {replaceWarn && (
        <div className="mj-overlay">
          <div className="mj-card">
            <h2 className="text-2xl font-black text-[#22432e]">
              {t('room.replaceTitle')}
            </h2>
            <p className="mt-2 text-sm font-semibold text-stone-600">
              {t('room.replaceText')}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                className="mj-btn"
                onClick={() => {
                  setReplaceWarn(false);
                  useGame.setState({ session: null });
                  void doJoin(pendingRef.current);
                }}
              >
                {t('room.replaceYes')}
              </button>
              <button
                className="mj-btn mj-btn-ghost"
                onClick={() => {
                  pendingRef.current = '';
                  setReplaceWarn(false);
                }}
              >
                {t('room.replaceNo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Возврат в незаконченный онлайн-матч (Task 28): устройство
 *  ПОМНИТ комнату (креды в localStorage). Пока игрок в меню,
 *  тихо проверяем комнату раз в 3 секунды — присутствие не
 *  рвётся и матч не «умирает» — и предлагаем:
 *   — «Вернуться в матч», если игра ещё идёт (или ждём соперника);
 *   — «Начать новую»: сопернику приходит «игрок покинул игру»
 *     (его победа), у нас комната закрывается.
 *  Диалог возникает при КАЖДОМ входе в меню, пока не решён. */
function ReturnPrompt({
  onOpenRooms,
  onOpenOne,
}: {
  onOpenRooms: () => void;
  onOpenOne: () => void;
}) {
  const t = useT();
  const [view, setView] = useState<RoomView | null>(null);
  const [kind, setKind] = useState<'playing' | 'waiting' | null>(null);
  const [busy, setBusy] = useState(false);
  /** пользователь закрыл диалог «не сейчас» — больше не спрашиваем
   *  в этом заходе меню (креды остаются: предложим в следующий раз) */
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (stopped) return;
    let alive = true;
    let askedKey = '';
    const check = async () => {
      const creds = getSavedCreds();
      if (!creds) return;
      const s = useGame.getState().session;
      // живая онлайн-партия: кнопка «Продолжить матч» уже в меню
      if (s && s.mode === 'online' && s.status === 'play') return;
      try {
        const v = await apiPollRoom(creds.code, creds.playerId);
        if (!alive) return;
        if (!v.players.some((p) => p.id === creds.playerId)) {
          // нас уже нет в комнате — память устарела
          clearCreds();
          return;
        }
        if (v.status === 'playing') {
          const key = `${v.code}:playing`;
          if (askedKey !== key) {
            askedKey = key;
            setView(v);
            setKind('playing');
          }
          return;
        }
        // ждущая комната — НЕ спрашиваем модалкой (Task 35): своя
        // игра постоянно видна строкой в плашке главного меню,
        // двойное напоминание не нужно
        if (v.status === 'waiting' && v.players[0]?.id === creds.playerId) {
          return;
        }
        if (v.status === 'result') {
          // матч закончился без нас — показываем честный итог
          useGame.getState().applyRoomView(v);
        }
      } catch (e) {
        // комната исчезла (404) — память больше не нужна.
        // Сеть просто моргнула — креды НЕ трогаем, повторим позже.
        if (e instanceof RoomError && e.code === 'ROOM_NOT_FOUND') {
          clearCreds();
          const s = useGame.getState().session;
          if (s && s.mode === 'online' && s.battle?.online?.code === creds.code) {
            useGame.setState({ session: null });
          }
        }
      }
    };
    void check();
    const iv = window.setInterval(() => void check(), 3000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [stopped]);

  if (!view || !kind) return null;

  const creds = getSavedCreds();
  const friend =
    view.players.find((p) => p.id !== creds?.playerId) ?? null;
  const liveOther = (() => {
    const s = useGame.getState().session;
    return !!s && s.mode !== 'online' && s.status === 'play';
  })();

  /** вернуться в живую игру (или к ожиданию соперника) */
  const rejoin = async () => {
    if (!creds) return;
    setBusy(true);
    try {
      if (kind === 'playing') {
        const v = await apiPollRoom(creds.code, creds.playerId);
        if (!v.players.some((p) => p.id === creds.playerId)) {
          throw new RoomError('ROOM_NOT_FOUND', 'gone');
        }
        const s = useGame.getState().session;
        if (s && s.mode !== 'online' && s.status === 'play') {
          useGame.setState({ session: null });
        }
        buzz(15);
        useGame.getState().applyRoomView(v);
        return;
      }
      // ожидание: экран комнаты сам восстановит «ждём соперника»
      buzz(15);
      onOpenRooms();
    } catch {
      clearCreds();
      showToast(t('room.lost'));
    } finally {
      setBusy(false);
      setStopped(true);
      setView(null);
      setKind(null);
    }
  };

  /** начать новую: комната закрывается, соперник получает
   *  «игрок покинул игру» (его победа), мы — к выбору соперника */
  const startNew = async () => {
    if (creds) {
      setBusy(true);
      try {
        await apiLeave(creds.code, creds.playerId);
      } catch {
        // комната уже исчезла — не страшно
      }
      clearCreds();
    }
    useGame.setState({ session: null });
    setStopped(true);
    setView(null);
    setKind(null);
    buzz(12);
    onOpenOne();
  };

  const closeRoom = async () => {
    if (creds) {
      setBusy(true);
      try {
        await apiLeave(creds.code, creds.playerId);
      } catch {
        // уже исчезла
      }
      clearCreds();
    }
    setStopped(true);
    setView(null);
    setKind(null);
  };

  const dismiss = () => {
    setStopped(true);
    setView(null);
    setKind(null);
  };

  return (
    <div className="mj-overlay" data-testid="mj-return-prompt">
      <div className="mj-card relative w-full max-w-sm p-6">
        <button
          type="button"
          className="mj-close-x"
          onClick={dismiss}
          aria-label="×"
        >
          <X className="h-5 w-5" />
        </button>
        {kind === 'playing' ? (
          <>
            <h2 className="text-2xl font-black text-[#22432e]">
              {t('return.title')}
            </h2>
            <p className="mt-2 text-sm font-semibold text-stone-600">
              {t('return.text', {
                name: friend?.name ?? '???',
                n: view.level,
              })}
              {liveOther ? ` ${t('room.replaceText')}` : ''}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                className="mj-btn"
                data-testid="mj-return-rejoin"
                disabled={busy}
                onClick={() => void rejoin()}
              >
                {busy ? '…' : t('return.rejoin')}
              </button>
              <button
                className="mj-btn mj-btn-ghost"
                data-testid="mj-return-new"
                disabled={busy}
                onClick={() => void startNew()}
              >
                {t('return.new')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-black text-[#22432e]">
              {t('return.waitTitle')}
            </h2>
            <p className="mt-2 text-sm font-semibold text-stone-600">
              {t('return.waitText', { code: view.code })}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                className="mj-btn"
                data-testid="mj-return-wait"
                disabled={busy}
                onClick={() => void rejoin()}
              >
                {t('return.waitBack')}
              </button>
              <button
                className="mj-btn mj-btn-ghost"
                data-testid="mj-return-close-room"
                disabled={busy}
                onClick={() => void closeRoom()}
              >
                {t('return.waitClose')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HomeScreen({
  onOneOnOne,
  onSettings,
  onStandings,
}: {
  onOneOnOne: () => void;
  onSettings: () => void;
  onStandings: () => void;
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

  // Task 28: живой онлайн-матч — карточка «1 на 1» ВОЗВРАЩАЕТ
  // в него одним тапом (раньше открывала выбор соперника —
  // «случайно вышел и не могу зайти»)
  const onlineResumable = credsOnline && resumable('online');

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
          <IconTrophy className="h-5 w-5 sm:h-6 sm:w-6" />
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
          <IconGear className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>
      <div className="flex flex-col items-center gap-3">
        {/* Фидбек «на кости поставь красивые»: три лучшие грани
            набора — птица (1 бамбук), хризантема и красный дракон;
            свободный веер с лёгкими наклонами, как разложенные
            настоящие кости */}
        <div className="flex items-end gap-1.5 sm:gap-2.5">
          <div
            className="mj-logo-tile"
            style={{ transform: 'rotate(-9deg) translateY(2px)' }}
          >
            <TileFace defId="bam-1" />
          </div>
          <div
            className="mj-logo-tile"
            style={{ transform: 'translateY(-5px) rotate(-2deg)' }}
          >
            <TileFace defId="flower-3" />
          </div>
          <div
            className="mj-logo-tile"
            style={{ transform: 'rotate(7deg) translateY(2px)' }}
          >
            <TileFace defId="drg-1" />
          </div>
        </div>
        <p className="mj-screen-title text-lg font-bold tracking-[0.3em] sm:text-2xl lg:text-3xl">
          {t('home.title')}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-md sm:gap-4 lg:max-w-lg">
        <button className="mj-mode-card" onClick={() => go('classic')}>
          <span
            className="mj-mode-ico"
            style={{
              background: 'linear-gradient(160deg, #6fd0b6, #1f8f7a)',
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

        {/* «1 на 1» — ВСЁ в одном месте (Task 25): автопоиск,
            игра по коду, компьютер. Живой онлайн-матч — карточка
            сразу ВОЗВРАЩАЕТ в него (Task 28) */}
        <button
          className="mj-mode-card"
          data-testid="mj-battle-card"
          onClick={() => (onlineResumable ? go('online') : onOneOnOne())}
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
              {resumable('battle') || (resumable('online') && credsOnline)
                ? t('home.continueMatch')
                : t('home.battle')}
            </b>
            <span className="mt-0.5 block text-[13px] leading-snug text-stone-600 sm:text-[15px]">
              {(resumable('battle') || (resumable('online') && credsOnline))
                ? t('home.battleWaiting', { n: session?.level ?? 1 })
                : t('home.battleSub')}
            </span>
          </span>
        </button>
      </div>

      {/* чип уровня: «Уровень N» — как в классических маджонгах */}
      <span className="mj-level-chip text-[13px] font-black sm:text-base lg:text-lg">
        {t('home.level', { n: level })}
      </span>

      {/* снизу: кто прямо сейчас ждёт соперника (Task 28);
          первой строкой плашки — СВОЯ открытая игра (Task 35) */}
      <WaitingPlayers hidden={onlineResumable} onOpenOwn={onOneOnOne} />
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
function TopBar({ onHome }: { onHome: () => void }) {
  const session = useGame((s) => s.session);
  const t = useT();

  if (!session) return null;

  return (
    <header className="mj-topbar z-20 flex shrink-0 items-center gap-1.5 px-2 pb-1 pt-[max(0.35rem,env(safe-area-inset-top))] sm:gap-3 sm:px-3">
      <button
        type="button"
        className="mj-circle-btn mj-circle-btn-home shrink-0"
        onClick={onHome}
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

/** подтверждение выхода из онлайн-матча (Task 25): случайный
 *  тап по «домой» больше не обрывает матч — выходим только
 *  осознанно, и это поражение */
function ExitConfirm({ onCancel }: { onCancel: () => void }) {
  const t = useT();
  const forfeit = useGame((s) => s.forfeitOnline);
  return (
    <div className="mj-overlay" data-testid="mj-exit-confirm">
      <div className="mj-card">
        <h2 className="text-2xl font-black text-[#22432e]">{t('exit.title')}</h2>
        <p className="mt-2 text-sm font-semibold text-stone-600">
          {t('exit.text')}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            className="mj-btn mj-btn-danger"
            data-testid="mj-exit-yes"
            onClick={() => {
              buzz(20);
              forfeit();
            }}
          >
            {t('exit.yes')}
          </button>
          <button
            className="mj-btn mj-btn-ghost"
            data-testid="mj-exit-no"
            onClick={onCancel}
          >
            {t('exit.no')}
          </button>
        </div>
      </div>
    </div>
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
        <Shuffle className="h-4 w-4 text-[#2e6b52]" />
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
          <h2 className="text-3xl font-black text-emerald-800 sm:text-4xl">
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
        <h2 className="text-3xl font-black text-[#22432e]">
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
        <h2 className="text-2xl font-black text-[#22432e]">
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

/* «Сердцебиение» из Web Worker (Task 28): у СКРЫТОЙ вкладки
   браузер душит таймеры страницы (до ~1 раза в минуту) — соперник
   решил бы, что мы пропали, и получил бы ложную победу. Таймеры
   воркера не дросселируются: присутствие живо, пока вкладка
   открыта. Воркер шлёт «пустой» поллинг (без прогресса —
   сервер обновляет только lastSeen). */
export function GameScreen() {
  const session = useGame((s) => s.session);
  const showMenu = useGame((s) => s.showMenu);
  const tutorialSeen = useGame((s) => s.tutorialSeen);
  const markTutorialSeen = useGame((s) => s.markTutorialSeen);
  const theme = useGame((s) => s.settings.theme);
  const exitToMenu = useGame((s) => s.exitToMenu);
  const t = useT();

  // «1 на 1» (Task 25): всё в одном месте — автопоиск, игра по
  //  коду, компьютер; «С другом» больше НЕ отдельная кнопка меню.
  //  Вход в закрытую игру — ТОЛЬКО по коду приглашения (без ссылок)
  const [oneOpen, setOneOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  // подтверждение выхода из онлайн-матча (не сразу — а с вопросом)
  const [exitAsk, setExitAsk] = useState(false);

  // тема стола — на body (CSS-переменные наследуются всем экранам)
  useEffect(() => {
    document.body.dataset.mjTheme = theme;
  }, [theme]);

  // тикер боя: таймер, соперник, челленджи (≈5 раз/сек).
  // В «Классике» tick ничего не делает.
  useEffect(() => {
    const iv = window.setInterval(() => useGame.getState().tick(), 200);
    return () => window.clearInterval(iv);
  }, []);

  /* ---------- онлайн-комната: пуши + лёгкий поллинг ----------
   * Сервер (Deno KV) сам пушит вьюхи на каждое изменение комнаты
   * и событие «соперник собрал пару». Клиент лишь: применяет пуши,
   * раз в 4 c шлёт свой прогресс (заодно присутствие), а в свёрнутой
   * вкладке отвечает на серверный hb — матч не умирает по
   * ложному «дисконнекту» (Task 32: воркер больше не нужен). */
  const isOnline = session?.mode === 'online';
  const sid = session?.sid;
  const missesRef = useRef(0);
  useEffect(() => {
    if (!isOnline) {
      missesRef.current = 0;
      return;
    }
    let alive = true;

    // пуши вьюх: старт, итог, прогресс соперника, присутствие
    const offView = subscribeRoom((view) => {
      const creds = getSavedCreds();
      if (!creds || creds.code !== view.code) return;
      if (!view.players.some((p) => p.id === creds.playerId)) return;
      missesRef.current = 0;
      useGame.getState().applyRoomView(view);
    });

    // «соперник собрал пару» — мгновенно, не дожидаясь вьюхи
    const offEvent = subscribeEvent((e) => {
      const s = useGame.getState().session;
      const b = s?.battle;
      if (!s || !b || s.mode !== 'online' || !b.online) return;
      if (b.online.friendId !== e.playerId) return;
      if (e.score <= b.botScore && e.pairsDone <= b.botPairsDone) return;
      useGame.setState({
        session: {
          ...s,
          battle: {
            ...b,
            botScore: Math.max(b.botScore, e.score),
            botPairsDone: Math.max(b.botPairsDone, e.pairsDone),
          },
        },
      });
    });

    // лёгкий поллинг: прогресс + присутствие (сервер пишет lastSeen)
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
          // комната в KV не теряется при смене изолята, но на всякий
          // случай даём 3 попытки прежде чем прощаться
          if (missesRef.current >= 3) {
            missesRef.current = 0;
            showToast(trNow('room.closed'));
            useGame.getState().dropOnlineSession(creds.code);
          }
        }
        // сеть моргнула — ждём следующий тик
      }
    };
    void poll();
    const iv = window.setInterval(() => void poll(), 4000);

    const onVis = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    const onNet = () => void poll();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onNet);
    return () => {
      alive = false;
      offView();
      offEvent();
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onNet);
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

  if (standingsOpen) {
    return <Standings onClose={() => setStandingsOpen(false)} />;
  }

  if (oneOpen) {
    return <DuelScreen onClose={() => setOneOpen(false)} />;
  }

  if (showMenu || !session) {
    return (
      <>
        <HomeScreen
          onOneOnOne={() => setOneOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onStandings={() => setStandingsOpen(true)}
        />
        {/* устройство помнит живую комнату — предлагаем вернуться
            в незаконченный матч или начать новую (Task 28) */}
        <ReturnPrompt
          onOpenRooms={() => setOneOpen(true)}
          onOpenOne={() => setOneOpen(true)}
        />
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
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
  // онлайн-матч идёт, а друга давно не видно — спокойный баннер
  // (Task 25: вместо мгновенного «проигрыша» ждём до 30 секунд)
  const friendOffline =
    mode === 'online' &&
    !!b?.online &&
    !b.online.friendOnline &&
    !finished &&
    b.started;

  // выход из онлайн-матча — только с подтверждения (Task 25)
  const onHome = () => {
    const s = useGame.getState().session;
    if (
      s &&
      s.mode === 'online' &&
      s.status === 'play' &&
      !s.battle?.result
    ) {
      buzz(12);
      setExitAsk(true);
      return;
    }
    exitToMenu();
  };

  // цвет рубашек этого уровня (меняется не часто — каждые 5 уровней):
  // CSS-переменные наследуются всем плиткам доски
  const [backA, backB] = backColorsForLevel(session.level);

  return (
    <div
      className="mj-table flex h-dvh flex-col"
      style={{ '--mj-back-a': backA, '--mj-back-b': backB } as React.CSSProperties}
    >
      {versus && <VersusBar />}
      {friendOffline && (
        <div className="mj-offline-note" data-testid="mj-friend-offline">
          {t('vs.offline')}
        </div>
      )}
      <TopBar onHome={onHome} />
      {/* Фидбек «Собери пару появляется прямо на костях»:
          челлендж живёт в СВОЕЙ зарезервированной полосе над доской
          (высота постоянна весь матч — доска не прыгает), а не
          плавает поверх плиток */}
      {versus && (
        <div className="mj-challenge-slot">
          <ChallengeBanner />
        </div>
      )}
      {/* z-30: летящие в лоток плитки рисуются поверх верхней панели и лотка */}
      <main className="relative z-30 min-h-0 flex-1">
        <Board />
      </main>
      <HUD />

      {showIntro && <MatchIntro />}
      {battleFinished && <BattleResult />}
      {mode === 'classic' && finished && <ClassicResult />}
      <LevelEntryDialog />
      <AdModal />
      {exitAsk && <ExitConfirm onCancel={() => setExitAsk(false)} />}
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
