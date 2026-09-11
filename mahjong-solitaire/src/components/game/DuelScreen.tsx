'use client';

/**
 * ЭКРАН «1 НА 1» — один экран вместо трёх (Task 32).
 *
 * Просьба игрока: «сразу играть, почти не выбирая» и «открытые
 * комнаты показывай сразу». Поэтому:
 *  — ОГРОМНАЯ кнопка «ИГРАТЬ» — быстрый матч (автопоиск любого
 *    соперника; нет очереди — сервер подсадит в первую открытую
 *    комнату). Имя берётся сохранённое, правится карандашиком.
 *  — СПИСОК ОТКРЫТЫХ ИГР прямо под кнопкой — живой (WebSocket),
 *    вход одним тапом.
 *  — «По коду» и «С компьютером» — вторичные кнопки.
 *
 * Состояния: main (меню) · search (ищем соперника) · waiting
 * (своя комната ждёт — код крупно). Переход в матч происходит
 * через applyRoomView — GameScreen показывает интро и доску.
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { useT } from '@/lib/i18n';
import { showToast } from '@/lib/game/fx';
import { buzz } from '@/lib/sound';
import {
  apiCreateRoom,
  apiJoinRoom,
  apiLeave,
  apiMatchHeart,
  apiMatchJoin,
  apiMatchLeave,
  apiPollRoom,
  clearCreds,
  getSavedCreds,
  getSavedName,
  saveCreds,
  saveName,
  subscribeLobby,
  subscribeRoom,
  type RoomCreds,
} from '@/lib/rooms/roomApi';
import { RoomError, type OpenRoomInfo, type RoomView } from '@/lib/rooms/types';
import { TileFace } from './TileFace';
import {
  ArrowLeft,
  Bot,
  Copy,
  Globe2,
  KeyRound,
  LogIn,
  Pencil,
  Play,
  Search,
  Users,
  X,
} from 'lucide-react';

function errText(e: unknown, t: ReturnType<typeof useT>): string {
  if (e instanceof RoomError) {
    if (e.code === 'ROOM_NOT_FOUND') return t('room.notFound');
    if (e.code === 'ROOM_FULL') return t('room.full');
    if (e.code === 'NETWORK') return t('room.network');
    return e.message;
  }
  return t('room.network');
}

type Phase = 'main' | 'search' | 'waiting';
/** действие, ожидающее подтверждения «закрыть живую партию» */
type Pending =
  | { kind: 'quick' }
  | { kind: 'create' }
  | { kind: 'join'; code: string };

export function DuelScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('main');
  const [name, setName] = useState(() => getSavedName());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);
  /** живой список открытых игр */
  const [rooms, setRooms] = useState<OpenRoomInfo[] | null>(null);
  /** своя ждущая комната */
  const [waitView, setWaitView] = useState<RoomView | null>(null);
  /** код строки, в которую входим */
  const [joiningCode, setJoiningCode] = useState('');
  /** диалог входа по коду */
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  /** правка имени */
  const [nameOpen, setNameOpen] = useState(false);
  /** живая партия другого режима будет закрыта — спросить заранее */
  const [replaceWarn, setReplaceWarn] = useState(false);
  const pendingRef = useRef<Pending | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const onName = (v: string) => setName([...v].slice(0, 16).join(''));
  const onCode = (v: string) =>
    setCode(
      v
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/[IO01]/g, (ch) => (ch === '0' ? 'O' : ch === '1' ? 'I' : ch))
        .slice(0, 5),
    );

  /* ---------- вход в матч (партия другого режима уже закрыта) ---------- */
  const enter = (v: RoomView) => {
    useGame.getState().applyRoomView(v);
    onCloseRef.current();
  };

  /** мешает ли живая партия другого режима? спрашиваем ДО действия */
  const hasLiveOther = () => {
    const s = useGame.getState().session;
    return !!s && s.mode !== 'online' && s.status === 'play';
  };

  const guardLive = (p: Pending): boolean => {
    if (!hasLiveOther()) return false;
    pendingRef.current = p;
    setReplaceWarn(true);
    return true;
  };

  /* ---------- вьюхи комнаты: старт матча, ожидание ---------- */
  useEffect(() => {
    const off = subscribeRoom((view) => {
      const creds = getSavedCreds();
      if (!creds || creds.code !== view.code) return;
      if (!view.players.some((p) => p.id === creds.playerId)) return;
      if (view.status === 'waiting') {
        if (view.players[0]?.id === creds.playerId) setWaitView(view);
        return;
      }
      // игра пошла (или итог) — в бой
      const s = useGame.getState().session;
      if (s && s.mode !== 'online' && s.status === 'play') {
        useGame.setState({ session: null });
      }
      buzz(20);
      enter(view);
    });
    return off;
  }, []);

  /* ---------- лобби открытых игр: живой список ---------- */
  useEffect(() => {
    const off = subscribeLobby((list) => setRooms(list));
    return off;
  }, []);

  /* ---------- таймер «сколько ищем» ---------- */
  useEffect(() => {
    if (phase !== 'search') return;
    const iv = window.setInterval(() => setWaited((v) => v + 1), 1000);
    return () => window.clearInterval(iv);
  }, [phase]);

  /* ---------- авто-возврат: сохранённая комната ещё жива? ---------- */
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const creds = getSavedCreds();
      if (!creds) return;
      try {
        const v = await apiPollRoom(creds.code, creds.playerId);
        if (!alive) return;
        if (!v.players.some((p) => p.id === creds.playerId)) {
          clearCreds();
          return;
        }
        if (v.status === 'playing' || v.status === 'result') {
          const s = useGame.getState().session;
          if (s && s.mode !== 'online' && s.status === 'play') {
            useGame.setState({ session: null });
          }
          enter(v);
          return;
        }
        // своя ждущая комната — показываем ожидание
        if (v.status === 'waiting' && v.players[0]?.id === creds.playerId) {
          setWaitView(v);
          setPhase('waiting');
        }
      } catch (e) {
        if (e instanceof RoomError && e.code === 'ROOM_NOT_FOUND') {
          clearCreds();
        }
        // сеть моргнула — не трогаем
      }
    };
    void check();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- быстрый матч ---------- */

  const startQuick = async () => {
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setErr('');
    try {
      saveName(nm);
      const st = await apiMatchJoin(nm, useGame.getState().level);
      if (st.status === 'paired' && st.view && st.code && st.playerId) {
        saveCreds({
          code: st.code,
          playerId: st.playerId,
          host: st.view.hostId === st.playerId,
          visibility: 'closed',
          seed: st.view.seed,
          level: st.view.level,
          name: nm,
        });
        buzz(20);
        const s = useGame.getState().session;
        if (s && s.mode !== 'online' && s.status === 'play') {
          useGame.setState({ session: null });
        }
        useGame.getState().applyRoomView(st.view);
        onCloseRef.current();
        return;
      }
      buzz(12);
      setWaited(0);
      setPhase('search');
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  /** пока ищем: держим тикет живым (сервер заодно досматривает очередь) */
  useEffect(() => {
    if (phase !== 'search') return;
    let alive = true;
    const heart = async () => {
      try {
        const st = await apiMatchHeart();
        if (!alive) return;
        if (st.status === 'paired' && st.view && st.code && st.playerId) {
          saveCreds({
            code: st.code,
            playerId: st.playerId,
            host: st.view.hostId === st.playerId,
            visibility: 'closed',
            seed: st.view.seed,
            level: st.view.level,
            name: name || 'Игрок',
          });
          const s = useGame.getState().session;
          if (s && s.mode !== 'online' && s.status === 'play') {
            useGame.setState({ session: null });
          }
          useGame.getState().applyRoomView(st.view);
          onCloseRef.current();
        }
      } catch {
        // сеть моргнула — следующий тик
      }
    };
    const iv = window.setInterval(() => void heart(), 4000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [phase, name]);

  const cancelSearch = async () => {
    void apiMatchLeave().catch(() => {});
    setPhase('main');
  };

  /* ---------- своя комната ---------- */

  const createGame = async () => {
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setErr('');
    try {
      saveName(nm);
      const { playerId, view: v } = await apiCreateRoom(nm, useGame.getState().level, 'open');
      saveCreds({
        code: v.code,
        playerId,
        host: true,
        visibility: 'open',
        seed: v.seed,
        level: v.level,
        name: nm,
      });
      buzz(15);
      setWaitView(v);
      setPhase('waiting');
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const cancelWaiting = async () => {
    const creds = getSavedCreds();
    if (creds) {
      try {
        await apiLeave(creds.code, creds.playerId);
      } catch {
        // игра уже исчезла — не страшно
      }
      clearCreds();
    }
    setWaitView(null);
    setPhase('main');
  };

  /* ---------- вход: по коду или из списка открытых ---------- */

  const joinGame = async (roomCode: string) => {
    const c = roomCode.trim().toUpperCase();
    if (c.length !== 5) {
      setErr(t('room.codeLen'));
      return;
    }
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setJoiningCode(c);
    setErr('');
    try {
      saveName(nm);
      const { playerId, view: v } = await apiJoinRoom(c, nm);
      saveCreds({
        code: c,
        playerId,
        host: playerId === v.hostId,
        visibility: v.visibility ?? 'closed',
        seed: v.seed,
        level: v.level,
        name: nm,
      });
      buzz(15);
      setCodeOpen(false);
      enter(v);
    } catch (e) {
      setErr(errText(e, t));
      // игру могли занять прямо из-под носа — список обновится сам
    } finally {
      setBusy(false);
      setJoiningCode('');
    }
  };

  /* ---------- служебное ---------- */

  const confirmReplace = () => {
    setReplaceWarn(false);
    useGame.setState({ session: null });
    buzz(12);
    const act = pendingRef.current;
    pendingRef.current = null;
    if (!act) return;
    if (act.kind === 'quick') void startQuick();
    else if (act.kind === 'create') void createGame();
    else void joinGame(act.code);
  };

  const copy = async (text: string, what: string) => {
    buzz(10);
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('room.copied', { what }));
    } catch {
      showToast(t('room.copyManual', { text }));
    }
  };

  const timeText = (ms: number) =>
    ms >= 60000
      ? `${Math.round(ms / 60000)} ${t('room.min')}`
      : `${Math.round(ms / 1000)} ${t('room.sec')}`;

  /* ================= ПОИСК СОПЕРНИКА ================= */
  if (phase === 'search') {
    return (
      <div className="mj-table flex h-dvh flex-col items-center justify-center gap-4 px-5">
        <div className="mj-card w-full max-w-sm p-6">
          <div className="flex flex-col items-center gap-2">
            <div className="mj-radar" data-testid="mj-mm-radar">
              <span />
              <span />
              <span />
              <Search className="h-6 w-6" />
            </div>
            <p className="text-base font-black text-stone-800">{t('mm.searching')}</p>
            <p className="text-sm font-semibold text-stone-600">{t('mm.anyLevel')}</p>
            <p className="mj-room-hint text-center">
              {waited >= 25 ? t('mm.waited') : t('mm.hint')}
            </p>
          </div>
          <button className="mj-btn mj-btn-ghost mt-5" onClick={cancelSearch}>
            {t('mm.cancel')}
          </button>
        </div>
      </div>
    );
  }

  /* ================= ЖДЁМ СОПЕРНИКА (своя комната) ================= */
  if (phase === 'waiting' && waitView) {
    return (
      <div className="mj-table flex h-dvh flex-col items-center justify-center gap-4 px-5">
        <div className="mj-card w-full max-w-sm p-6">
          <div className="flex flex-col items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-stone-500">
              {t('room.codeTitle')}
            </p>
            {/* КОД: крупно, жирно, в «косточках» */}
            <div className="mj-code-display" data-testid="mj-code">
              {waitView.code.split('').map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </div>
            <p className="text-sm font-semibold text-stone-600">
              {t('room.time', {
                n: waitView.level,
                t: timeText(waitView.timeTotalMs),
              })}
            </p>
          </div>

          <button
            className="mj-btn-secondary mt-4 w-full gap-1.5"
            onClick={() => copy(waitView.code, t('room.copyCode'))}
          >
            <Copy className="h-4 w-4" /> {t('room.copyCode')}
          </button>

          <div className="mt-5 flex flex-col items-center gap-2">
            <div className="mj-radar">
              <span />
              <span />
              <span />
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-stone-700">{t('room.waiting')}</p>
            <p className="mj-room-hint text-center">{t('room.openWaitingHint')}</p>
          </div>

          <button className="mj-btn mj-btn-ghost mt-4" onClick={cancelWaiting}>
            {t('room.cancel')}
          </button>
        </div>
      </div>
    );
  }

  /* ================= ГЛАВНЫЙ ЭКРАН ================= */
  const openCount = rooms?.length ?? 0;
  return (
    <div className="mj-table relative flex h-dvh flex-col overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 px-3 pt-[max(0.8rem,env(safe-area-inset-top))] sm:px-5">
        <button
          type="button"
          className="mj-circle-btn"
          onClick={onClose}
          aria-label={t('room.back')}
          title={t('room.back')}
        >
          <ArrowLeft className="h-5 w-5 text-[#22432e] sm:h-6 sm:w-6" />
        </button>
      </div>

      <div className="m-auto flex w-full max-w-sm flex-col gap-4 px-5 pb-8 pt-4">
        {/* заголовок + имя-карандашик */}
        <div className="flex flex-col items-center gap-2">
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
          <p className="text-lg font-bold tracking-[0.3em] mj-screen-title sm:text-2xl">
            {t('home.battle')}
          </p>
          <button
            type="button"
            className="mj-name-chip"
            data-testid="mj-duel-name"
            onClick={() => {
              buzz(8);
              setNameOpen(true);
            }}
          >
            <span className="mj-name-chip-av">
              {(name.trim() || 'И')[0].toUpperCase()}
            </span>
            <span className="max-w-[9.5rem] truncate">{name.trim() || t('room.player')}</span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-stone-500" />
          </button>
        </div>

        {/* ГЛАВНАЯ КНОПКА: играть сразу */}
        <button
          className="mj-play-big"
          data-testid="mj-quick-play"
          disabled={busy}
          onClick={() => {
            if (guardLive({ kind: 'quick' })) return;
            void startQuick();
          }}
        >
          <span className="mj-play-big-ico">
            <Play className="h-7 w-7" fill="currentColor" />
          </span>
          <span className="flex flex-col items-start">
            <b className="text-xl font-black tracking-wide sm:text-2xl">
              {t('duel.play')}
            </b>
            <span className="text-[13px] font-semibold opacity-80">
              {t('duel.playSub')}
            </span>
          </span>
        </button>

        {/* открытые игры: живой список — видно сразу */}
        <div className="mj-card w-full p-4 sm:p-5">
          <p className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
              {t('room.openList')}
            </span>
            {rooms !== null && openCount > 0 && (
              <span className="mj-live-badge" data-testid="mj-open-count">
                <i />
                {openCount}
              </span>
            )}
          </p>
          <div className="mj-open-list" data-testid="mj-open-list">
            {rooms === null && (
              <p className="mj-st-empty">{t('room.openLoading')}</p>
            )}
            {rooms !== null && openCount === 0 && (
              <p className="mj-st-empty">{t('duel.openEmptyHint')}</p>
            )}
            {rooms?.map((r) => (
              <button
                key={r.code}
                type="button"
                className="mj-open-row"
                data-testid="mj-open-row"
                disabled={busy}
                onClick={() => {
                  if (guardLive({ kind: 'join', code: r.code })) return;
                  void joinGame(r.code);
                }}
              >
                <span
                  className="mj-open-av"
                  style={{ background: `hsl(${r.hue} 52% 42%)` }}
                >
                  {(r.hostName[0] ?? 'И').toUpperCase()}
                </span>
                <span className="mj-open-info">
                  <b>{r.hostName}</b>
                  <span>{t('home.level', { n: r.level })}</span>
                </span>
                <span className="mj-open-join">
                  <LogIn className="h-4 w-4" />
                  {joiningCode === r.code ? '…' : t('room.join')}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* вторичные способы */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="mj-mode-card mj-mode-card-sm"
            data-testid="mj-one-code"
            onClick={() => {
              buzz(10);
              setCodeOpen(true);
            }}
          >
            <span
              className="mj-mode-ico mj-mode-ico-sm"
              style={{
                background: 'linear-gradient(160deg, #f2b25c, #c07a2a)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
              }}
            >
              <KeyRound className="h-4.5 w-4.5 text-white sm:h-5 sm:w-5" />
            </span>
            <span className="min-w-0">
              <b className="block text-[15px] font-black leading-tight text-stone-800">
                {t('one.code')}
              </b>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-stone-600">
                {t('duel.codeSub')}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="mj-mode-card mj-mode-card-sm"
            data-testid="mj-one-bot"
            onClick={() => {
              buzz(10);
              onCloseRef.current();
              useGame.getState().startMode('battle');
            }}
          >
            <span
              className="mj-mode-ico mj-mode-ico-sm"
              style={{
                background: 'linear-gradient(160deg, #b8c3d0, #7a8aa0)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(0,0,0,.3)',
              }}
            >
              <Bot className="h-4.5 w-4.5 text-white sm:h-5 sm:w-5" />
            </span>
            <span className="min-w-0">
              <b className="block text-[15px] font-black leading-tight text-stone-800">
                {t('one.bot')}
              </b>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-stone-600">
                {t('one.botSub')}
              </span>
            </span>
          </button>
        </div>

        {err && <p className="mj-err text-center">{err}</p>}
      </div>

      {/* ---- диалог «по коду» ---- */}
      {codeOpen && (
        <div className="mj-overlay" data-testid="mj-code-dialog">
          <div className="mj-card relative w-full max-w-sm p-6">
            <button
              type="button"
              className="mj-close-x"
              onClick={() => setCodeOpen(false)}
              aria-label="×"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="flex items-center gap-2 text-xl font-black text-[#22432e]">
              <Globe2 className="h-5 w-5" /> {t('duel.codeTitle')}
            </h2>
            <p className="mt-1 text-sm font-semibold text-stone-600">
              {t('duel.codeText')}
            </p>
            <input
              className="mj-input mj-code-input mt-4"
              value={code}
              onChange={(e) => onCode(e.target.value)}
              placeholder="•••••"
              maxLength={5}
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              data-testid="mj-code-input"
              autoFocus
            />
            <button
              className="mj-btn mt-3 w-full"
              disabled={busy || code.trim().length !== 5}
              data-testid="mj-join-code"
              onClick={() => {
                if (guardLive({ kind: 'join', code })) return;
                void joinGame(code);
              }}
            >
              {busy && joiningCode === code ? '…' : t('room.enter')}
            </button>
            <button
              className="mj-btn-secondary mt-2 w-full"
              disabled={busy}
              data-testid="mj-create-room"
              onClick={() => {
                if (guardLive({ kind: 'create' })) return;
                void createGame();
              }}
            >
              {busy ? '…' : t('duel.createOpen')}
            </button>
          </div>
        </div>
      )}

      {/* ---- правка имени ---- */}
      {nameOpen && (
        <div className="mj-overlay">
          <div className="mj-card relative w-full max-w-sm p-6">
            <button
              type="button"
              className="mj-close-x"
              onClick={() => setNameOpen(false)}
              aria-label="×"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-black text-[#22432e]">{t('mm.name')}</h2>
            <input
              className="mj-input mt-4"
              value={name}
              onChange={(e) => onName(e.target.value)}
              maxLength={16}
              placeholder={t('room.player')}
              autoComplete="off"
              autoFocus
            />
            <button
              className="mj-btn mt-4 w-full"
              onClick={() => {
                saveName(name.trim() || 'Игрок');
                setNameOpen(false);
                buzz(10);
              }}
            >
              {t('duel.saveName')}
            </button>
          </div>
        </div>
      )}

      {/* живая партия другого режима: закрыть её? */}
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
              <button className="mj-btn" onClick={confirmReplace}>
                {t('room.replaceYes')}
              </button>
              <button
                className="mj-btn mj-btn-ghost"
                onClick={() => {
                  pendingRef.current = null;
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
