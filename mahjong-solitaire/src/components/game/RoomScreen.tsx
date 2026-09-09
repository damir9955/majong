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
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { showToast } from '@/lib/game/fx';
import { buzz } from '@/lib/sound';
import {
  apiCreateRoom,
  apiJoinRoom,
  apiLeave,
  apiPollRoom,
  clearCreds,
  getSavedCreds,
  getSavedName,
  saveCreds,
  saveName,
} from '@/lib/rooms/roomApi';
import { RoomError, type RoomView } from '@/lib/rooms/types';
import { TileFace } from './TileFace';
import { Users, Copy, Link2, ArrowLeft } from 'lucide-react';

function errText(e: unknown): string {
  if (e instanceof RoomError) {
    if (e.code === 'ROOM_NOT_FOUND') return 'Комната не найдена — проверь код';
    if (e.code === 'ROOM_FULL') return 'Комната уже занята';
    if (e.code === 'NETWORK') return 'Нет связи — попробуй ещё раз';
    return e.message;
  }
  return 'Что-то пошло не так';
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
  const [phase, setPhase] = useState<Phase>('choose');
  const [name, setName] = useState(() => getSavedName());
  const [code, setCode] = useState(initialCode);
  const [view, setView] = useState<RoomView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** комната играет, но у нас живая партия другого режима — спросить */
  const [replaceWarn, setReplaceWarn] = useState<RoomView | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /** вход в матч: если мешает живая партия другого режима — спросить */
  const enter = (v: RoomView) => {
    const s = useGame.getState().session;
    if (s && s.mode !== 'online' && s.status === 'play') {
      setReplaceWarn(v);
      return;
    }
    useGame.getState().applyRoomView(v);
    onCloseRef.current();
  };

  // авто-возврат: сохранённая комната ещё жива?
  useEffect(() => {
    let alive = true;
    void (async () => {
      const creds = getSavedCreds();
      if (!creds) return;
      try {
        const v = await apiPollRoom(creds.code, creds.playerId);
        if (!alive) return;
        if (v.status === 'waiting' && v.players[0]?.id === creds.playerId) {
          setView(v);
          setPhase('waiting');
          return;
        }
        if (v.status === 'playing' || v.status === 'result') {
          enter(v);
          return;
        }
        clearCreds();
      } catch {
        clearCreds();
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ожидание друга: поллинг, пока не начнётся матч
  useEffect(() => {
    if (phase !== 'waiting') return;
    const creds = getSavedCreds();
    if (!creds) {
      setPhase('choose');
      return;
    }
    let alive = true;
    const iv = window.setInterval(async () => {
      try {
        const v = await apiPollRoom(creds.code, creds.playerId);
        if (!alive) return;
        if (v.status === 'waiting') {
          setView(v);
          return;
        }
        // друг вошёл — в бой (интро покажет GameScreen)
        window.clearInterval(iv);
        if (!alive) return;
        const s = useGame.getState().session;
        if (s && s.mode !== 'online' && s.status === 'play') {
          setReplaceWarn(v);
          return;
        }
        useGame.getState().applyRoomView(v);
        onCloseRef.current();
      } catch {
        // сеть моргнула — попробуем в следующий тик
      }
    }, 1100);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [phase]);

  const createRoom = async () => {
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setErr('');
    try {
      saveName(nm);
      const { playerId, view: v } = await apiCreateRoom(
        nm,
        useGame.getState().level,
      );
      saveCreds({ code: v.code, playerId });
      buzz(15);
      setView(v);
      setPhase('waiting');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 5) {
      setErr('Код — 5 символов');
      return;
    }
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setErr('');
    try {
      saveName(nm);
      const { playerId, view: v } = await apiJoinRoom(c, nm);
      saveCreds({ code: c, playerId });
      buzz(15);
      enter(v);
    } catch (e) {
      setErr(errText(e));
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
      showToast(`${what} скопирован`);
    } catch {
      showToast(`Скопируй вручную: ${text}`);
    }
  };

  const shareUrl = () =>
    `${window.location.origin}/?room=${view?.code ?? ''}`;

  const confirmReplace = () => {
    if (!replaceWarn) return;
    useGame.setState({ session: null });
    useGame.getState().applyRoomView(replaceWarn);
    setReplaceWarn(null);
    onCloseRef.current();
  };

  const declineReplace = () => {
    const creds = getSavedCreds();
    if (creds) {
      void apiLeave(creds.code, creds.playerId).catch(() => {});
      clearCreds();
    }
    setReplaceWarn(null);
    onCloseRef.current();
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

  /* ---------- экран ожидания (хост) ---------- */
  if (phase === 'waiting' && view) {
    return (
      <div className="mj-table flex h-dvh flex-col items-center justify-center gap-4 px-5">
        <div className="mj-card w-full max-w-sm p-6">
          <div className="flex flex-col items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-stone-500">
              Код комнаты
            </p>
            <p className="mj-code-display" data-testid="mj-code">
              {view.code}
            </p>
            <p className="text-sm font-semibold text-stone-600">
              Уровень {view.level} · {view.timeTotalMs >= 60000 ? `${Math.round(view.timeTotalMs / 60000)} мин` : '90 сек'}
            </p>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="mj-btn-secondary flex-1 gap-1.5"
              onClick={() => copy(shareUrl(), 'Ссылка')}
            >
              <Link2 className="h-4 w-4" /> Ссылка
            </button>
            <button
              className="mj-btn-secondary flex-1 gap-1.5"
              onClick={() => copy(view.code, 'Код')}
            >
              <Copy className="h-4 w-4" /> Код
            </button>
          </div>

          <div className="mt-5 flex flex-col items-center gap-2">
            <div className="mj-radar">
              <span />
              <span />
              <span />
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-stone-700">Ждём друга…</p>
            <p className="mj-room-hint text-center">
              Отправь другу код или ссылку — он введёт его в разделе «С другом»
            </p>
          </div>

          <button className="mj-btn mj-btn-ghost mt-4" onClick={cancelWaiting}>
            Отмена
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
        aria-label="Назад"
        title="Назад в меню"
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
          С ДРУГОМ
        </p>
        <p className="mj-room-hint text-center">
          Матч 1 на 1 по интернету: одинаковая доска у обоих —
          кто соберёт первым
        </p>
      </div>

      <div className="mj-card w-full max-w-sm p-5 sm:p-6">
        <label
          className="mb-1 block text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500"
          htmlFor="mj-room-name"
        >
          Твоё имя
        </label>
        <input
          id="mj-room-name"
          className="mj-input"
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={16}
          placeholder="Игрок"
          autoComplete="off"
        />

        <button className="mj-btn mt-4" disabled={busy} onClick={createRoom}>
          {busy ? 'Секунду…' : 'Создать комнату'}
        </button>

        <div className="mj-room-divider my-4" aria-hidden>
          <span>или</span>
        </div>

        <label
          className="mb-1 block text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500"
          htmlFor="mj-room-code"
        >
          Код приглашения
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
          {busy ? 'Секунду…' : 'Войти по коду'}
        </button>

        {err && <p className="mj-err mt-3 text-center">{err}</p>}
      </div>

      {/* комната играет, но есть живая партия другого режима */}
      {replaceWarn && (
        <div className="mj-overlay">
          <div className="mj-card">
            <h2 className="text-2xl font-black text-sky-900">
              Друг уже ждёт
            </h2>
            <p className="mt-2 text-sm font-semibold text-stone-600">
              Вернуться в комнату? Партия другого режима, что сейчас открыта,
              будет закрыта без сохранения прогресса.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button className="mj-btn" onClick={confirmReplace}>
                Вернуться в матч
              </button>
              <button className="mj-btn mj-btn-ghost" onClick={declineReplace}>
                Остаться здесь
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
