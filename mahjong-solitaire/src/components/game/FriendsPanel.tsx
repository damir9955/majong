'use client';

/**
 * ПАНЕЛЬ ДРУЗЕЙ (Task 37) — «небольшая отдельная кнопка» с огоньком
 * в меню открывает этот экран.
 *
 *  — МОЙ ID: короткий код — покажи другу, он введёт его в «Добавить»;
 *  — ЗАЯВКИ: кто хочет дружить (принять/отклонить);
 *  — ДРУЗЬЯ: онлайн-точка, чат (переписка живёт на сервере),
 *    «В бой» — позвать друга в битву (ему придёт приглашение),
 *    удаление из друзей;
 *  — «Добавить»: по короткому коду друга. Встречные заявки срастаются
 *    автоматически.
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { useT } from '@/lib/i18n';
import { showToast } from '@/lib/game/fx';
import { buzz } from '@/lib/sound';
import {
  apiFriendAccept,
  apiFriendAdd,
  apiFriendDecline,
  apiFriendInvite,
  apiFriendMsg,
  apiFriendRemove,
  apiLeave,
  clearCreds,
  getSavedCreds,
  getSavedName,
  saveCreds,
  subscribeRoom,
} from '@/lib/rooms/roomApi';
import { loadChat, useFriends } from '@/lib/rooms/friends';
import {
  RoomError,
  type ChatMsgView,
  type FriendInfo,
  type RoomView,
} from '@/lib/rooms/types';
import {
  ArrowLeft,
  Copy,
  MessageCircle,
  Send,
  Swords,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

/* ============================ аватар ============================ */

function Av({
  name,
  online,
  size = 38,
}: {
  name: string;
  online?: boolean;
  size?: number;
}) {
  return (
    <span className="relative inline-block shrink-0">
      <div
        className="mj-av"
        style={{
          width: size,
          height: size,
          background:
            'linear-gradient(160deg, hsl(150 45% 55%), hsl(150 45% 36%))',
          borderColor: 'rgba(255,255,255,.55)',
        }}
        aria-hidden
      >
        <span style={{ fontSize: size * 0.42 }}>
          {(name[0] ?? 'Д').toUpperCase()}
        </span>
      </div>
      {online !== undefined && (
        <span
          className={`mj-online-dot ${online ? '' : 'mj-online-dot-off'}`}
        />
      )}
    </span>
  );
}

/* ============================ чат ============================ */

/** стабильная ссылка на «нет сообщений»: селектор zustand не должен
 *  создавать новый массив каждый снапшот (иначе useSyncExternalStore
 *  уходит в бесконечный цикл перерисовки) */
const NO_MSGS: ChatMsgView[] = [];

/** время сообщения «14:05» / «вчера»-подобное — просто ЧЧ:ММ */
function msgTime(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function ChatView({
  friend,
  onBack,
}: {
  friend: FriendInfo;
  onBack: () => void;
}) {
  const t = useT();
  const msgs = useFriends((s) => s.chats[friend.uid] ?? NO_MSGS);
  const clearUnread = useFriends((s) => s.clearUnread);
  const appendMsg = useFriends((s) => s.appendMsg);
  const myName = (getSavedName() || 'Я').trim();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadChat(friend.uid);
    clearUnread(friend.uid);
  }, [friend.uid, clearUnread]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length]);

  const send = async () => {
    const val = text.trim().slice(0, 300);
    if (!val || busy) return;
    setBusy(true);
    setText('');
    appendMsg(friend.uid, {
      from: 'me',
      name: myName,
      text: val,
      at: Date.now(),
    });
    try {
      await apiFriendMsg(friend.uid, val);
    } catch {
      showToast(t('room.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mj-fr-chat flex h-full min-h-0 flex-col"
      data-testid="mj-friends-chat"
    >
      {/* шапка: назад · аватар · имя · онлайн-статус */}
      <div className="mj-fr-chat-head flex items-center gap-2.5">
        <button
          type="button"
          className="mj-circle-btn mj-circle-btn-sm shrink-0"
          onClick={onBack}
          aria-label={t('room.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Av name={friend.name} online={friend.online} size={36} />
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-black leading-tight text-stone-800">
            {friend.name}
          </b>
          <span
            className={`text-[11px] font-bold ${
              friend.online ? 'text-emerald-600' : 'text-stone-400'
            }`}
          >
            {friend.online ? t('fr.online') : t('fr.offline')}
          </span>
        </div>
      </div>

      {/* лента: свои — СПРАВА зелёные, друга — СЛЕВА светлые */}
      <div
        ref={listRef}
        className="mj-fr-chat-list mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
      >
        {msgs.length === 0 && (
          <p className="mj-st-empty mt-6">{t('fr.chatEmpty')}</p>
        )}
        {msgs.map((m, i) => {
          const mine = m.from === 'me';
          const prev = msgs[i - 1];
          const sameSide = prev && prev.from === m.from;
          return (
            <div
              key={`${m.at}-${i}`}
              className={`mj-fr-chat-row ${mine ? 'mj-fr-chat-row-me' : ''} ${
                sameSide ? '' : 'mt-2'
              }`}
            >
              <div
                className={`mj-fr-msg ${mine ? 'mj-fr-msg-me' : ''}`}
                data-testid="mj-fr-msg"
                data-mine={mine ? '1' : '0'}
              >
                <p>{m.text}</p>
                <span className="mj-fr-msg-time">{msgTime(m.at)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ввод: поле + кнопка «отправить» */}
      <div className="mj-fr-chat-input mt-2 flex items-center gap-2">
        <input
          className="mj-input min-w-0 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder={t('fr.chatPlaceholder')}
          maxLength={300}
          data-testid="mj-fr-chat-input"
        />
        <button
          type="button"
          className="mj-btn-secondary !px-3.5"
          disabled={busy || !text.trim()}
          onClick={() => void send()}
          aria-label={t('fr.send')}
          data-testid="mj-fr-chat-send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ============================ список друзей ============================ */

function FriendRow({
  f,
  onChat,
  onInvite,
}: {
  f: FriendInfo;
  onChat: () => void;
  onInvite: () => void;
}) {
  const t = useT();
  const unread = useFriends((s) => s.unread[f.uid] ?? 0);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="mj-fr-row" data-testid="mj-fr-row">
      <Av name={f.name} online={f.online} />
      <div className="min-w-0 flex-1">
        <b className="block truncate text-sm font-black text-stone-800">
          {f.name}
        </b>
        <span className="block text-[11px] font-bold text-stone-500">
          {f.online ? t('fr.online') : t('fr.offline')}
        </span>
      </div>

      {confirmDel ? (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            className="mj-fr-act mj-fr-act-danger"
            onClick={() => {
              buzz(10);
              void apiFriendRemove(f.uid).catch(() => {});
              setConfirmDel(false);
            }}
            aria-label={t('fr.remove')}
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="mj-fr-act"
            onClick={() => setConfirmDel(false)}
            aria-label={t('wait.confirmNo')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </span>
      ) : (
        <>
          {unread > 0 && (
            <span className="mj-fr-unread" data-testid="mj-fr-unread">
              {unread}
            </span>
          )}
          <button
            type="button"
            className="mj-fr-act"
            onClick={onChat}
            aria-label={t('fr.chat')}
            data-testid="mj-fr-chat-btn"
          >
            <MessageCircle className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            className="mj-fr-act mj-fr-act-fight"
            onClick={onInvite}
            disabled={!f.online}
            aria-label={t('fr.invite')}
            data-testid="mj-fr-invite-btn"
          >
            <Swords className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            className="mj-fr-act mj-fr-act-del"
            onClick={() => setConfirmDel(true)}
            aria-label={t('fr.remove')}
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

/* ============================ панель ============================ */

export function FriendsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const st = useFriends();
  const [chatWith, setChatWith] = useState<FriendInfo | null>(null);
  /** жду ответа друга на приглашение в битву */
  const [invited, setInvited] = useState<string | null>(null);
  const [addCode, setAddCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onAddCode = (v: string) =>
    setAddCode(
      v
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10),
    );

  const copy = async (text: string) => {
    buzz(10);
    try {
      await navigator.clipboard.writeText(text);
      // Task 40: короткий понятный тост (было «Мой ID — нажми,
      // чтобы скопировать скопирован» — бессмыслица)
      showToast(t('fr.idCopied'));
    } catch {
      showToast(t('room.copyManual', { text }));
    }
  };

  const addFriend = async () => {
    const code = addCode.trim();
    if (code.length < 4 || busy) return;
    setBusy(true);
    setErr('');
    try {
      await apiFriendAdd({ code });
      setAddCode('');
      buzz(12);
      showToast(t('fr.sent'));
    } catch (e) {
      if (e instanceof RoomError && e.code === 'ALREADY_FRIENDS') {
        setErr(t('fr.already'));
      } else {
        setErr(t('fr.notFound'));
      }
    } finally {
      setBusy(false);
    }
  };

  /** «В бой»: создаю комнату, жду согласия друга */
  const invite = async (f: FriendInfo) => {
    if (invited || busy) return;
    setBusy(true);
    setErr('');
    try {
      const { playerId, view } = await apiFriendInvite(
        f.uid,
        useGame.getState().level,
      );
      saveCreds({
        code: view.code,
        playerId,
        host: true,
        visibility: 'closed',
        seed: view.seed,
        level: view.level,
        name: getSavedName() || 'Игрок',
      });
      setInvited(f.uid);
      buzz(15);
    } catch {
      setErr(t('room.network'));
    } finally {
      setBusy(false);
    }
  };

  /** отмена приглашения: закрыть комнату и вернуться к списку */
  const cancelInvite = async () => {
    const creds = getSavedCreds();
    if (creds) {
      try {
        await apiLeave(creds.code, creds.playerId);
      } catch {
        // комната уже исчезла
      }
      clearCreds();
    }
    setInvited(null);
  };

  // пока ждём согласия друга — следим за своей комнатой: как только
  // статус станет «playing» (он вошёл) — применяем вьюху и закрываемся
  useEffect(() => {
    if (!invited) return;
    const off = subscribeRoom((view: RoomView) => {
      if (view.status !== 'playing' && view.status !== 'result') return;
      const s = useGame.getState().session;
      if (s && s.mode !== 'online' && s.status === 'play') {
        useGame.setState({ session: null });
      }
      useGame.getState().applyRoomView(view);
      onClose();
    });
    return off;
  }, [invited, onClose]);

  /* ---------- чат с другом ---------- */
  if (chatWith) {
    return (
      <div className="mj-fr-chat-layer" data-testid="mj-friends-chat-layer">
        <div className="mj-fr-chat-card">
          <ChatView friend={chatWith} onBack={() => setChatWith(null)} />
        </div>
      </div>
    );
  }

  const invitedName = st.friends.find((f) => f.uid === invited)?.name ?? '';

  return (
    <div className="mj-overlay" data-testid="mj-friends-panel">
      <div className="mj-card mj-fr-panel relative w-full max-w-sm p-5 sm:max-w-md">
        <button
          type="button"
          className="mj-close-x"
          onClick={onClose}
          aria-label="×"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#2e6b52]" />
          <h2 className="text-xl font-black text-[#22432e]">{t('fr.title')}</h2>
        </div>

        {/* МОЙ ID: покажи другу */}
        <button
          type="button"
          className="mj-fr-myid mt-3.5"
          onClick={() => void copy(st.myCode)}
          data-testid="mj-fr-myid"
        >
          <span className="mj-fr-myid-label">{t('fr.myId')}</span>
          <b className="tracking-[0.22em]">{st.myCode || '······'}</b>
          <Copy className="h-3.5 w-3.5 shrink-0 text-stone-500" />
        </button>

        {/* добавить по коду */}
        <div className="mt-3 flex items-center gap-2">
          <input
            className="mj-input min-w-0 flex-1 tracking-[0.18em]"
            value={addCode}
            onChange={(e) => onAddCode(e.target.value)}
            placeholder={t('fr.codePlaceholder')}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            data-testid="mj-fr-add-input"
          />
          <button
            type="button"
            className="mj-btn-secondary !px-3.5"
            disabled={busy || addCode.trim().length < 4}
            onClick={() => void addFriend()}
            data-testid="mj-fr-add-btn"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>
        {err && <p className="mj-err mt-1.5 text-center text-xs">{err}</p>}

        {/* ЗАЯВКИ */}
        {st.reqs.length > 0 && (
          <>
            <p className="mj-st2-title mt-4">
              {t('fr.reqs')} · {st.reqs.length}
            </p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {st.reqs.map((r) => (
                <div className="mj-fr-row" key={r.uid}>
                  <Av name={r.name} />
                  <b className="min-w-0 flex-1 truncate text-sm font-black text-stone-800">
                    {r.name}
                  </b>
                  <button
                    type="button"
                    className="mj-fr-act mj-fr-act-fight"
                    onClick={() => {
                      buzz(12);
                      void apiFriendAccept(r.uid).catch(() => {});
                    }}
                    aria-label={t('fr.accept')}
                    data-testid="mj-fr-accept-btn"
                  >
                    <UserPlus className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    className="mj-fr-act mj-fr-act-del"
                    onClick={() => {
                      buzz(10);
                      void apiFriendDecline(r.uid).catch(() => {});
                    }}
                    aria-label={t('fr.decline')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ДРУЗЬЯ */}
        <p className="mj-st2-title mt-4">{t('fr.list')}</p>
        <div className="mt-1.5 flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
          {st.friends.length === 0 && (
            <p className="mj-st-empty">{t('fr.empty')}</p>
          )}
          {st.friends.map((f) => (
            <FriendRow
              key={f.uid}
              f={f}
              onChat={() => setChatWith(f)}
              onInvite={() => void invite(f)}
            />
          ))}
        </div>

        {/* жду ответа на приглашение */}
        {invited && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-center">
            <p className="text-sm font-bold text-stone-700">
              {t('fr.waitingFriend', { name: invitedName })}
            </p>
            <button
              type="button"
              className="mj-btn mj-btn-ghost mt-2 !py-2 !text-sm"
              onClick={() => void cancelInvite()}
              data-testid="mj-fr-cancel-invite"
            >
              {t('room.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
