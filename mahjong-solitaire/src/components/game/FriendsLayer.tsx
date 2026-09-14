'use client';

/**
 * Слой друзей (Task 37): живёт поверх любого экрана игры.
 *  — ПРИГЛАШЕНИЕ В БИТВУ: друг зовёт — модалка [Играть / Отклонить],
 *    согласие сразу заводит обоих в матч (комната уже ждёт);
 *  — уведомления: заявка в друзья, новое сообщение, «теперь вы
 *    друзья», отказ от боя — спокойные тосты; огонёк на кнопке
 *    «Друзья» в меню считает всё непрочитанное.
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { useT, trNow } from '@/lib/i18n';
import { showToast } from '@/lib/game/fx';
import { buzz, playVersus } from '@/lib/sound';
import {
  apiFriendInviteReply,
  getSavedName,
  saveCreds,
} from '@/lib/rooms/roomApi';
import { useFriends } from '@/lib/rooms/friends';
import { Swords, X } from 'lucide-react';

export function FriendsLayer() {
  const t = useT();
  const last = useFriends((s) => s.lastEvent);
  const invites = useFriends((s) => s.invites);
  /** ключи (from|code) отклонённых вручную в этой сессии */
  const dismissed = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);

  /* ---------- реакция на живые события ---------- */
  const seen = useRef(0);
  useEffect(() => {
    if (!last || last.seq === seen.current) return;
    seen.current = last.seq;
    const { ev } = last;
    if (ev.kind === 'invite') {
      // модалку рисует блок ниже (по состоянию invites)
      try {
        playVersus();
      } catch {
        // звук недоступен
      }
      buzz(20);
      return;
    }
    if (ev.kind === 'msg') {
      showToast(trNow('fr.msgToast', { name: ev.name }));
    } else if (ev.kind === 'req') {
      showToast(trNow('fr.reqToast', { name: ev.name }));
    } else if (ev.kind === 'accept') {
      showToast(trNow('fr.acceptToast', { name: ev.name }));
    } else if (ev.kind === 'invite_declined') {
      showToast(trNow('fr.declinedToast', { name: ev.name }));
    }
  }, [last]);

  /* ---------- какую заявку показывать (свежие с сервера) ---------- */
  const live = invites.find((i) => !dismissed.current.has(`${i.from}|${i.code}`));
  if (!live) return null;

  /** согласиться: сервер возвращает комнату матча — в бой! */
  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFriendInviteReply(live.from, true);
      if (res) {
        saveCreds({
          code: res.view.code,
          playerId: res.playerId,
          host: false,
          visibility: 'closed',
          seed: res.view.seed,
          level: res.view.level,
          name: getSavedName() || 'Игрок',
        });
        const s = useGame.getState().session;
        if (s && s.mode !== 'online' && s.status === 'play') {
          useGame.setState({ session: null });
        }
        buzz(20);
        useGame.getState().applyRoomView(res.view);
        return;
      }
      showToast(trNow('wait.gone'));
    } catch {
      showToast(trNow('room.network'));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    dismissed.current.add(`${live.from}|${live.code}`);
    buzz(10);
    void apiFriendInviteReply(live.from, false).catch(() => {});
  };

  return (
    <div className="mj-overlay" data-testid="mj-f-invite-modal">
      <div className="mj-card relative w-full max-w-sm p-6">
        <button
          type="button"
          className="mj-close-x"
          onClick={() => void decline()}
          aria-label="×"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center gap-2 text-center">
          <span
            className="mj-av mj-av-lg"
            style={{
              background: 'linear-gradient(160deg, #f2b25c, #c07a2a)',
              borderColor: '#e6b84a',
            }}
            aria-hidden
          >
            <span>{(live.fromName[0] ?? 'Д').toUpperCase()}</span>
          </span>
          <h2 className="text-2xl font-black text-[#22432e]">
            {t('fr.inviteTitle', { name: live.fromName })}
          </h2>
          <p className="text-sm font-semibold text-stone-600">
            {t('fr.inviteText')}
          </p>
          <div className="mt-3 flex w-full flex-col gap-2">
            <button
              className="mj-btn"
              data-testid="mj-f-invite-yes"
              disabled={busy}
              onClick={() => void accept()}
            >
              <Swords className="h-4 w-4" /> {busy ? '…' : t('fr.play')}
            </button>
            <button
              className="mj-btn mj-btn-ghost"
              data-testid="mj-f-invite-no"
              disabled={busy}
              onClick={() => void decline()}
            >
              {t('fr.declineInvite')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
