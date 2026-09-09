'use client';

/**
 * Комната «игра с другом» по коду приглашения.
 *
 *  — «Создать комнату»: сервер выдаёт код из 5 символов; код или ссылку
 *    отправляем другу любым мессенджером.
 *  — «Войти по коду»: ввод кода → сразу в матч.
 *  — Пока друг не вошёл — экран ожидания с кодом и радаром.
 *  — Перезагрузка страницы не выкидывает из комнаты: креды
 *    (код + id игрока) сохранены в localStorage.
 *
 * Подтверждение «закрыть живую партию» спрашивается ДО создания
 * комнаты — раньше вопрос всплывал ПОСЛЕ того, как друг вошёл,
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
  apiPollRoom,
  apiSyncRoom,
  clearCreds,
  getSavedCreds,
  getSavedName,
  saveCreds,
  saveName,
} from '@/lib/rooms/roomApi';
import { RoomError, type RoomView } from '@/lib/rooms/types';
import { TileFace } from './TileFace';
import { Users, Copy, Link2, ArrowLeft } from 'lucide-react';

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

export function RoomScreen({
  initialCode,
  onClose,
}: {
  /** код из ссылки ?room=CODE — подставляется в поле ввода */
  initialCode: string;
  onClose: () => void;
}) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('choose');
  const [name, setName] = useState(() => getSavedName());
  const [code, setCode] = useState(initialCode);
  const [view, setView] = useState<RoomView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** живая партия другого режима будет закрыта — спросить заранее */
  const [replaceWarn, setReplaceWarn] = useState(false);
  /** действие, которое продолжится после подтверждения */
  const pendingActionRef = useRef<null | 'create' | 'join'>(null);

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

  /** проверка «комната жива?» + авто-возврат в неё */
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
        // комната играет: если мешает живая партия другого режима —
        // это решалось при входе; здесь просто возвращаемся
        const s = useGame.getState().session;
        if (s && s.mode !== 'online' && s.status === 'play') {
          useGame.setState({ session: null });
        }
        enter(v);
        return true;
      }
      // комната есть, но мы в ней не ждём — чистим
      clearCreds();
      dropStaleOnline(creds.code);
      return false;
    } catch (e) {
      // 404/сеть: комната мертва — не «предлагаем вернуться» в неё
      clearCreds();
      dropStaleOnline(creds.code);
      return false;
    }
  };

  /** убрать устаревшую онлайн-партию, если её комната исчезла */
  const dropStaleOnline = (code?: string) => {
    const s = useGame.getState().session;
    if (s && s.mode === 'online' && (!code || s.battle?.online?.code === code)) {
      useGame.setState({ session: null });
    }
  };

  // авто-возврат: сохранённая комната ещё жива? (тихо, без тостов)
  useEffect(() => {
    void checkAlive();
  }, []);

  /* ---------- ожидание друга: поллинг с самовосстановлением ---------- */
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
        // друг вошёл — в бой (интро покажет GameScreen)
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
          // комната пропала на этом инстансе — пересоздать по снимку
          if (misses >= 6) {
            try {
              const v = await apiSyncRoom({
                code: creds.code,
                playerId: creds.playerId,
                name: creds.name ?? name ?? 'Игрок',
                level: creds.level ?? useGame.getState().level,
                seed: creds.seed ?? 1,
                hostId: creds.playerId,
                status: 'waiting',
                timeLeftMs: 120000,
                players: [],
              });
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

  const createRoom = async () => {
    if (hasLiveOther()) {
      pendingActionRef.current = 'create';
      setReplaceWarn(true);
      return;
    }
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setErr('');
    try {
      saveName(nm);
      const { playerId, view: v } = await apiCreateRoom(
        nm,
        useGame.getState().level,
      );
      saveCreds({
        code: v.code,
        playerId,
        host: true,
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

  const joinRoom = async () => {
    if (hasLiveOther()) {
      pendingActionRef.current = 'join';
      setReplaceWarn(true);
      return;
    }
    const c = code.trim().toUpperCase();
    if (c.length !== 5) {
      setErr(t('room.codeLen'));
      return;
    }
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setErr('');
    try {
      saveName(nm);
      const { playerId, view: v } = await apiJoinRoom(c, nm);
      saveCreds({
        code: c,
        playerId,
        host: playerId === v.hostId,
        seed: v.seed,
        level: v.level,
        name: nm,
      });
      buzz(15);
      enter(v);
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
        // комната уже исчезла — не страшно
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

  const shareUrl = () =>
    `${window.location.origin}/?room=${view?.code ?? ''}`;

  const confirmReplace = () => {
    setReplaceWarn(false);
    useGame.setState({ session: null });
    buzz(12);
    // продолжаем действие, ради которого спросили
    const act = pendingActionRef.current;
    pendingActionRef.current = null;
    if (act === 'create') void createRoom();
    else if (act === 'join') void joinRoom();
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

  /* ---------- экран ожидания (хост) ---------- */
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

          <div className="mt-4 flex gap-2">
            <button
              className="mj-btn-secondary flex-1 gap-1.5"
              onClick={() => copy(shareUrl(), t('room.copyLink'))}
            >
              <Link2 className="h-4 w-4" /> {t('room.copyLink')}
            </button>
            <button
              className="mj-btn-secondary flex-1 gap-1.5"
              onClick={() => copy(view.code, t('room.copyCode'))}
            >
              <Copy className="h-4 w-4" /> {t('room.copyCode')}
            </button>
          </div>

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
            <p className="mj-room-hint text-center">{t('room.waitingHint')}</p>
          </div>

          <button className="mj-btn mj-btn-ghost mt-4" onClick={cancelWaiting}>
            {t('room.cancel')}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- выбор: создать или войти ---------- */
  return (
    <div className="mj-table relative flex h-dvh flex-col items-center justify-center gap-5 px-5">
      <button
        type="button"
        className="mj-circle-btn absolute left-3 top-[max(0.8rem,env(safe-area-inset-top))] sm:left-5"
        onClick={onClose}
        aria-label={t('room.back')}
        title={t('room.back')}
      >
        <ArrowLeft className="h-5 w-5 text-sky-900 sm:h-6 sm:w-6" />
      </button>

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
        <p className="text-lg font-bold tracking-[0.3em] text-amber-200/85 sm:text-2xl">
          {t('room.title')}
        </p>
        <p className="mj-room-hint text-center">{t('room.subtitle')}</p>
      </div>

      <div className="mj-card w-full max-w-sm p-5 sm:p-6">
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

        <button
          className="mj-btn mt-4"
          data-testid="mj-create-room"
          disabled={busy}
          onClick={createRoom}
        >
          {busy ? '…' : t('room.create')}
        </button>

        <div className="mj-room-divider my-4" aria-hidden>
          <span>{t('room.or')}</span>
        </div>

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
          onClick={joinRoom}
        >
          {busy ? '…' : t('room.enter')}
        </button>

        {err && <p className="mj-err mt-3 text-center">{err}</p>}
      </div>

      {/* живая партия другого режима: закрыть её? (спрашиваем ДО
          создания комнаты — раньше вопрос зависал ПОСЛЕ входа друга) */}
      {replaceWarn && (
        <div className="mj-overlay">
          <div className="mj-card">
            <h2 className="text-2xl font-black text-sky-900">
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
                onClick={() => setReplaceWarn(false)}
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
