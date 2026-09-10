'use client';

/**
 * «С другом»: ОТКРЫТЫЕ и ЗАКРЫТЫЕ игры + вход по коду.
 *
 *  — «Создать игру»: открытая (видна всем в списке «Открытые игры»,
 *    заходят без кода) или закрытая (только по коду приглашения).
 *  — «Открытые игры»: живой список ждущих соперника игр — кнопка
 *    «Войти» у каждой строки. Список обновляется сам (~2.5 сек).
 *  — «Войти по коду»: 5 символов — для закрытых игр (и открытых тоже).
 *  — Вход ТОЛЬКО по коду: никаких ссылок-приглашений.
 *  — Пока соперник не вошёл — экран ожидания с кодом и радаром.
 *  — Перезагрузка страницы не выкидывает из игры: креды
 *    (код + id игрока) сохранены в localStorage.
 *
 * Подтверждение «закрыть живую партию» спрашивается ДО создания
 * игры — раньше вопрос всплывал ПОСЛЕ того, как друг вошёл,
 * и создатель «зависал в ожидании», хотя матч уже начался.
 * 404 при поллинге лечится быстрым повтором и sync-пересозданием.
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
  apiListOpenRooms,
  apiPollRoom,
  apiSyncRoom,
  clearCreds,
  getSavedCreds,
  getSavedName,
  saveCreds,
  saveName,
  type RoomCreds,
} from '@/lib/rooms/roomApi';
import { RoomError, type OpenRoomInfo, type RoomView } from '@/lib/rooms/types';
import { TileFace } from './TileFace';
import { Users, Copy, ArrowLeft, Globe2, Lock, LogIn } from 'lucide-react';

function errText(e: unknown, t: ReturnType<typeof useT>): string {
  if (e instanceof RoomError) {
    if (e.code === 'ROOM_NOT_FOUND') return t('room.notFound');
    if (e.code === 'ROOM_FULL') return t('room.full');
    if (e.code === 'NETWORK') return t('room.network');
    return e.message;
  }
  return t('room.network');
}

type Phase = 'choose' | 'waiting';
type Vis = 'open' | 'closed';

/** действие, ожидающее подтверждения «закрыть живую партию» */
type Pending =
  | { kind: 'create'; vis: Vis }
  | { kind: 'join'; code: string };

export function RoomScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('choose');
  const [name, setName] = useState(() => getSavedName());
  const [code, setCode] = useState('');
  const [view, setView] = useState<RoomView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** тип создаваемой игры: открытая (лобби) или закрытая (по коду) */
  const [vis, setVis] = useState<Vis>('open');
  /** список открытых игр (null — ещё грузится) */
  const [openRooms, setOpenRooms] = useState<OpenRoomInfo[] | null>(null);
  /** код строки, в которую входим (кнопка «…») */
  const [joiningCode, setJoiningCode] = useState('');
  /** живая партия другого режима будет закрыта — спросить заранее */
  const [replaceWarn, setReplaceWarn] = useState(false);
  /** действие, которое продолжится после подтверждения */
  const pendingRef = useRef<Pending | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /** вход в матч (партия другого режима уже закрыта заранее) */
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

  /** убрать устаревшую онлайн-партию, если её комната исчезла */
  const dropStaleOnline = (code?: string) => {
    const s = useGame.getState().session;
    if (s && s.mode === 'online' && (!code || s.battle?.online?.code === code)) {
      useGame.setState({ session: null });
    }
  };

  /** проверка «игра жива?» + авто-возврат в неё */
  const checkAlive = async (): Promise<boolean> => {
    const creds = getSavedCreds();
    if (!creds) return false;
    try {
      const v = await apiPollRoom(creds.code, creds.playerId);
      if (v.status === 'waiting' && v.players[0]?.id === creds.playerId) {
        setView(v);
        setPhase('waiting');
        return true;
      }
      if (v.status === 'playing' || v.status === 'result') {
        // игра идёт: если мешает живая партия другого режима —
        // это решалось при входе; здесь просто возвращаемся
        const s = useGame.getState().session;
        if (s && s.mode !== 'online' && s.status === 'play') {
          useGame.setState({ session: null });
        }
        enter(v);
        return true;
      }
      // игра есть, но мы в ней не ждём — чистим
      clearCreds();
      dropStaleOnline(creds.code);
      return false;
    } catch {
      // 404/сеть: игра мертва — не «предлагаем вернуться» в неё
      clearCreds();
      dropStaleOnline(creds.code);
      return false;
    }
  };

  // авто-возврат: сохранённая игра ещё жива? (тихо, без тостов)
  useEffect(() => {
    void checkAlive();
  }, []);

  /* ---------- лобби: живой список открытых игр ---------- */
  useEffect(() => {
    if (phase !== 'choose') return;
    let alive = true;
    const load = async () => {
      try {
        const rooms = await apiListOpenRooms();
        if (alive) setOpenRooms(rooms);
      } catch {
        // сеть моргнула — оставляем прошлый список
      }
    };
    void load();
    const iv = window.setInterval(() => void load(), 2500);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [phase]);

  /** ждём-фаза: снимок для sync-восстановления ожидания */
  const waitingSnapshot = (creds: RoomCreds) => ({
    code: creds.code,
    playerId: creds.playerId,
    name: creds.name ?? name ?? 'Игрок',
    level: creds.level ?? useGame.getState().level,
    seed: creds.seed ?? 1,
    hostId: creds.playerId,
    status: 'waiting' as const,
    visibility: creds.visibility,
    timeLeftMs: 120000,
    players: [],
  });

  /* ---------- ожидание соперника: поллинг с самолечением ---------- */
  useEffect(() => {
    if (phase !== 'waiting') return;
    const creds = getSavedCreds();
    if (!creds) {
      setPhase('choose');
      return;
    }
    let alive = true;
    let misses = 0;
    const iv = window.setInterval(async () => {
      try {
        const v = await apiPollRoom(creds.code, creds.playerId);
        if (!alive) return;
        misses = 0;
        if (v.status === 'waiting') {
          setView(v);
          return;
        }
        // соперник вошёл — в бой (интро покажет GameScreen)
        window.clearInterval(iv);
        if (!alive) return;
        const s = useGame.getState().session;
        if (s && s.mode !== 'online' && s.status === 'play') {
          useGame.setState({ session: null });
        }
        useGame.getState().applyRoomView(v);
        onCloseRef.current();
      } catch (e) {
        if (!alive) return;
        if (e instanceof RoomError && e.code === 'ROOM_NOT_FOUND') {
          misses++;
          // 404 бывает «чужим инстансом»: быстрый повтор
          if (misses < 6) {
            try {
              const v = await apiPollRoom(creds.code, creds.playerId);
              if (!alive) return;
              misses = 0;
              if (v.status === 'waiting') {
                setView(v);
                return;
              }
              window.clearInterval(iv);
              useGame.getState().applyRoomView(v);
              onCloseRef.current();
              return;
            } catch {
              // попробуем sync
            }
          }
          // игра пропала на этом инстансе — пересоздать по снимку
          if (misses >= 6) {
            try {
              const v = await apiSyncRoom(waitingSnapshot(creds));
              if (!alive) return;
              misses = 0;
              setView(v);
              return;
            } catch {
              // совсем плохо — ниже финальная очистка
            }
          }
          if (misses > 14) {
            window.clearInterval(iv);
            clearCreds();
            setErr(t('room.lost'));
            setPhase('choose');
            setView(null);
          }
          return;
        }
        // сеть моргнула — попробуем в следующий тик
      }
    }, 1100);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [phase]);

  /* ---------- создание игры ---------- */

  const createGame = async (visibility: Vis) => {
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setErr('');
    try {
      saveName(nm);
      const { playerId, view: v } = await apiCreateRoom(
        nm,
        useGame.getState().level,
        visibility,
      );
      saveCreds({
        code: v.code,
        playerId,
        host: true,
        visibility,
        seed: v.seed,
        level: v.level,
        name: nm,
      });
      buzz(15);
      setView(v);
      setPhase('waiting');
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const onCreate = () => {
    if (guardLive({ kind: 'create', vis })) return;
    void createGame(vis);
  };

  /* ---------- вход: по коду или из списка открытых игр ---------- */

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
      enter(v);
    } catch (e) {
      setErr(errText(e, t));
      // игру могли занять прямо из-под носа — обновляем список
      try {
        setOpenRooms(await apiListOpenRooms());
      } catch {
        // сеть моргнула — список обновит поллинг
      }
    } finally {
      setBusy(false);
      setJoiningCode('');
    }
  };

  const onJoinCode = () => {
    if (guardLive({ kind: 'join', code })) return;
    void joinGame(code);
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
    setView(null);
    setPhase('choose');
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

  const confirmReplace = () => {
    setReplaceWarn(false);
    useGame.setState({ session: null });
    buzz(12);
    // продолжаем действие, ради которого спросили
    const act = pendingRef.current;
    pendingRef.current = null;
    if (!act) return;
    if (act.kind === 'create') void createGame(act.vis);
    else void joinGame(act.code);
  };

  const onName = (v: string) => setName([...v].slice(0, 16).join(''));
  const onCode = (v: string) =>
    setCode(
      v
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/[IO01]/g, (ch) => (ch === '0' ? 'O' : ch === '1' ? 'I' : ch))
        .slice(0, 5),
    );

  const timeText = (ms: number) =>
    ms >= 60000
      ? `${Math.round(ms / 60000)} ${t('room.min')}`
      : `${Math.round(ms / 1000)} ${t('room.sec')}`;

  /* ---------- экран ожидания (создатель) ---------- */
  if (phase === 'waiting' && view) {
    return (
      <div className="mj-table flex h-dvh flex-col items-center justify-center gap-4 px-5">
        <div className="mj-card w-full max-w-sm p-6">
          <div className="flex flex-col items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-stone-500">
              {t('room.codeTitle')}
            </p>
            {/* КОД: крупно, жирно, в «косточках» — видно сразу */}
            <div className="mj-code-display" data-testid="mj-code">
              {view.code.split('').map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </div>
            <p className="text-sm font-semibold text-stone-600">
              {t('room.time', {
                n: view.level,
                t: timeText(view.timeTotalMs),
              })}
            </p>
          </div>

          <button
            className="mj-btn-secondary mt-4 w-full gap-1.5"
            onClick={() => copy(view.code, t('room.copyCode'))}
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
            <p className="text-sm font-bold text-stone-700">
              {t('room.waiting')}
            </p>
            <p className="mj-room-hint text-center">
              {view.visibility === 'open'
                ? t('room.openWaitingHint')
                : t('room.waitingHint')}
            </p>
          </div>

          <button className="mj-btn mj-btn-ghost mt-4" onClick={cancelWaiting}>
            {t('room.cancel')}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- выбор: создать / открытые игры / по коду ---------- */
  return (
    <div className="mj-table relative flex h-dvh flex-col overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-10 flex shrink-0 px-3 pt-[max(0.8rem,env(safe-area-inset-top))] sm:px-5">
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
            {t('room.title')}
          </p>
          <p className="mj-room-hint text-center">{t('room.subtitle')}</p>
        </div>

        {/* ---- создать игру: имя + тип (открытая/закрытая) ---- */}
        <div className="mj-card w-full p-5 sm:p-6">
          <label
            className="mb-1 block text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500"
            htmlFor="mj-room-name"
          >
            {t('room.name')}
          </label>
          <input
            id="mj-room-name"
            className="mj-input"
            value={name}
            onChange={(e) => onName(e.target.value)}
            maxLength={16}
            placeholder={t('room.player')}
            autoComplete="off"
          />

          <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
            {t('room.visTitle')}
          </p>
          <div
            className="mj-lang-switch"
            data-testid="mj-vis-switch"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={vis === 'open'}
              data-testid="mj-vis-open"
              className={
                vis === 'open' ? 'mj-lang-btn mj-lang-btn-active' : 'mj-lang-btn'
              }
              onClick={() => {
                buzz(10);
                setVis('open');
              }}
            >
              <Globe2 className="mr-1 inline h-4 w-4" />
              {t('room.visOpen')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vis === 'closed'}
              data-testid="mj-vis-closed"
              className={
                vis === 'closed'
                  ? 'mj-lang-btn mj-lang-btn-active'
                  : 'mj-lang-btn'
              }
              onClick={() => {
                buzz(10);
                setVis('closed');
              }}
            >
              <Lock className="mr-1 inline h-4 w-4" />
              {t('room.visClosed')}
            </button>
          </div>
          <p className="mt-2 text-xs font-semibold text-stone-600">
            {vis === 'open' ? t('room.visOpenHint') : t('room.visClosedHint')}
          </p>

          <button
            className="mj-btn mt-4 w-full"
            data-testid="mj-create-room"
            disabled={busy}
            onClick={onCreate}
          >
            {busy ? '…' : t('room.create')}
          </button>
        </div>

        {/* ---- открытые игры: живой список ---- */}
        <div className="mj-card w-full p-5 sm:p-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
            {t('room.openList')}
          </p>
          <div className="mj-open-list" data-testid="mj-open-list">
            {openRooms === null && (
              <p className="mj-st-empty">{t('room.openLoading')}</p>
            )}
            {openRooms !== null && openRooms.length === 0 && (
              <p className="mj-st-empty">{t('room.openEmpty')}</p>
            )}
            {openRooms?.map((r) => (
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

        {/* ---- вход по коду (закрытые игры) ---- */}
        <div className="mj-card w-full p-5 sm:p-6">
          <label
            className="mb-1 block text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500"
            htmlFor="mj-room-code"
          >
            {t('room.inviteCode')}
          </label>
          <input
            id="mj-room-code"
            className="mj-input mj-code-input"
            value={code}
            onChange={(e) => onCode(e.target.value)}
            placeholder="•••••"
            maxLength={5}
            autoComplete="off"
            autoCapitalize="characters"
            inputMode="text"
            data-testid="mj-code-input"
          />
          <button
            className="mj-btn-secondary mt-3 w-full"
            disabled={busy || code.trim().length !== 5}
            data-testid="mj-join-code"
            onClick={onJoinCode}
          >
            {busy && joiningCode === code ? '…' : t('room.enter')}
          </button>
        </div>

        {err && <p className="mj-err text-center">{err}</p>}
      </div>

      {/* живая партия другого режима: закрыть её? (спрашиваем ДО
          создания игры — раньше вопрос зависал ПОСЛЕ входа друга) */}
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
