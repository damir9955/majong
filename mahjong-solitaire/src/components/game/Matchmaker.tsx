'use client';

/**
 * Быстрый матч против реального человека: просто «найти игру» —
 * уровень больше НЕ важен. Соединяем с любым, кто тоже в
 * автопоиске, а если таких нет — присоединяемся к первой
 * открытой комнате. Пока ищем — радар и отмена.
 *
 * (Task 29) Транспорт — WebSocket на Deno-сервер: тикет очереди
 * живёт на сервере (Deno KV), подобранную пару сервер ПУШИТ
 * сообщением {t:'room'} — поллинга больше нет. Обрыв связи во
 * время поиска не страшен: сервер держит тикет, пока устройство
 * онлайн.
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { useT } from '@/lib/i18n';
import { buzz } from '@/lib/sound';
import {
  apiMatchLeave,
  apiMatchStart,
  onRoomView,
  saveCreds,
  getSavedName,
  saveName,
} from '@/lib/rooms/roomApi';
import { Search, X, ArrowLeft } from 'lucide-react';

export function Matchmaker({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [phase, setPhase] = useState<'setup' | 'search'>('setup');
  const [name, setName] = useState(() => getSavedName());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** секунд с начала поиска — после 25 подсказка «людей мало» */
  const [waited, setWaited] = useState(0);
  /** пара найдена — защита от двойного входа */
  const pairedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);
  const onName = (v: string) => setName([...v].slice(0, 16).join(''));

  useEffect(() => {
    if (phase !== 'search') return;
    const iv = window.setInterval(() => setWaited((v) => v + 1), 1000);
    // соперник найден: Deno-сервер пришлёт комнату пушем
    const off = onRoomView((view, playerId) => {
      if (pairedRef.current || !playerId) return; // толкают именно НАС в комнату
      pairedRef.current = true;
      saveCreds({
        code: view.code,
        playerId,
        host: playerId === view.hostId,
        seed: view.seed,
        level: view.level,
        name: nameRef.current || 'Игрок',
      });
      buzz(20);
      // живая партия другого режима заменяется без вопросов:
      // игрок сам выбрал «против человека»
      const s = useGame.getState().session;
      if (s && s.mode !== 'online' && s.status === 'play') {
        useGame.setState({ session: null });
      }
      useGame.getState().applyRoomView(view);
      onCloseRef.current();
    });
    return () => {
      window.clearInterval(iv);
      off();
    };
  }, [phase]);

  const startSearch = async () => {
    const nm = name.trim() || 'Игрок';
    setBusy(true);
    setErr('');
    pairedRef.current = false;
    try {
      saveName(nm);
      const st = await apiMatchStart(nm, useGame.getState().level);
      // могли подобрать мгновенно — пуш уже прилетел (или придёт)
      if (
        !pairedRef.current &&
        st.status === 'paired' &&
        st.view &&
        st.code &&
        st.playerId
      ) {
        pairedRef.current = true;
        saveCreds({
          code: st.code,
          playerId: st.playerId,
          host: st.playerId === st.view.hostId,
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
        onClose();
        return;
      }
      if (pairedRef.current) return;
      buzz(12);
      setWaited(0);
      setPhase('search');
    } catch {
      setErr(t('room.network'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    void apiMatchLeave().catch(() => {});
    pairedRef.current = false;
    setPhase('setup');
  };

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
            <p className="text-base font-black text-stone-800">
              {t('mm.searching')}
            </p>
            <p className="text-sm font-semibold text-stone-600">
              {t('mm.anyLevel')}
            </p>
            <p className="mj-room-hint text-center">
              {waited >= 25 ? t('mm.waited') : t('mm.hint')}
            </p>
          </div>
          <button className="mj-btn mj-btn-ghost mt-5" onClick={cancel}>
            {t('mm.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mj-table relative flex h-dvh flex-col items-center justify-center gap-5 px-5">
      <button
        type="button"
        className="mj-circle-btn absolute left-3 top-[max(0.8rem,env(safe-area-inset-top))] sm:left-5"
        onClick={onClose}
        aria-label={t('room.back')}
        title={t('room.back')}
      >
        <ArrowLeft className="h-5 w-5 text-[#22432e] sm:h-6 sm:w-6" />
      </button>

      <div className="flex flex-col items-center gap-2">
        <p className="text-lg font-bold tracking-[0.3em] mj-screen-title sm:text-2xl">
          {t('opp.human').toUpperCase()}
        </p>
        <p className="mj-room-hint text-center">{t('mm.hint')}</p>
      </div>

      <div className="mj-card w-full max-w-sm p-5 sm:p-6">
        <label
          className="mb-1 block text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500"
          htmlFor="mj-mm-name"
        >
          {t('mm.name')}
        </label>
        <input
          id="mj-mm-name"
          className="mj-input"
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={16}
          placeholder={t('room.player')}
          autoComplete="off"
        />
        <button
          className="mj-btn mt-4"
          data-testid="mj-mm-start"
          disabled={busy}
          onClick={startSearch}
        >
          {busy ? '…' : t('mi.search')}
        </button>
        {err && <p className="mj-err mt-3 text-center">{err}</p>}
      </div>
    </div>
  );
}
