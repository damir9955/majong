'use client';

/**
 * Друзья (Task 37) — состояние с сервера (Deno KV через WS).
 * Стор НЕ персистится: источник истины — сервер; при загрузке
 * страницы hello/f_sync присылает всё состояние (заявки, инвайты,
 * непрочитанные). Локально кешируем только переписку открытого чата.
 */

import { create } from 'zustand';
import {
  apiFriendChat,
  apiFriendRead,
  subscribeFriendEvent,
  subscribeFriends,
} from './roomApi';
import type {
  ChatMsgView,
  FriendEvent,
  FriendInfo,
  FriendInviteInfo,
  FriendReqInfo,
  FriendsStateView,
} from './types';

interface FriendsStore {
  /** пришло первое состояние с сервера */
  ready: boolean;
  /** мой короткий код для добавления («Мой ID») */
  myCode: string;
  friends: FriendInfo[];
  /** входящие заявки */ reqs: FriendReqInfo[];
  /** кому я уже отправил заявку */ sent: string[];
  /** приглашения в битву */ invites: FriendInviteInfo[];
  /** непрочитанные сообщения по uid */
  unread: Record<string, number>;
  /** кеш переписки (uid → сообщения) */
  chats: Record<string, ChatMsgView[]>;
  /** последнее событие для UI-уведомлений (инвайт/сообщение) */
  lastEvent: { ev: FriendEvent; seq: number } | null;

  applyState: (st: FriendsStateView) => void;
  setChat: (withUid: string, msgs: ChatMsgView[]) => void;
  appendMsg: (withUid: string, msg: ChatMsgView) => void;
  clearUnread: (uid: string) => void;
  /** сколько всего «огоньков»: заявки + инвайты + непрочитанные */
  badgeCount: () => number;
  isFriend: (uid: string) => boolean;
}

export const useFriends = create<FriendsStore>((set, get) => ({
  ready: false,
  myCode: '',
  friends: [],
  reqs: [],
  sent: [],
  invites: [],
  unread: {},
  chats: {},
  lastEvent: null,

  applyState: (st) =>
    set({
      ready: true,
      myCode: st.code ?? '',
      friends: st.friends ?? [],
      reqs: st.reqs ?? [],
      sent: st.sent ?? [],
      invites: st.invites ?? [],
      unread: st.unread ?? {},
    }),

  setChat: (withUid, msgs) =>
    set((s) => ({ chats: { ...s.chats, [withUid]: msgs } })),

  appendMsg: (withUid, msg) =>
    set((s) => {
      const cur = s.chats[withUid] ?? [];
      // дедуп: серверная история + живое событие могли дублироваться
      if (cur.some((m) => m.at === msg.at && m.from === msg.from)) {
        return {};
      }
      return { chats: { ...s.chats, [withUid]: [...cur, msg] } };
    }),

  clearUnread: (uid) => {
    set((s) => {
      if (!s.unread[uid]) return {};
      const next = { ...s.unread };
      delete next[uid];
      return { unread: next };
    });
    apiFriendRead(uid);
  },

  badgeCount: () => {
    const s = get();
    return (
      s.reqs.length +
      s.invites.length +
      Object.values(s.unread).reduce((acc, n) => acc + n, 0)
    );
  },

  isFriend: (uid) => get().friends.some((f) => f.uid === uid),
}));

/* ================= подписка на сервер (один раз) ================= */

let inited = false;

/** подключить стор к серверу (вызывается из GameScreen при старте) */
export function initFriends(): () => void {
  if (inited) return () => {};
  inited = true;

  const offState = subscribeFriends((st) => {
    useFriends.getState().applyState(st);
  });

  let evSeq = 0;
  const offEvent = subscribeFriendEvent((ev) => {
    // сообщение — в кеш переписки, если чат открыт (или для истории)
    if (ev.kind === 'msg' && ev.text) {
      useFriends.getState().appendMsg(ev.uid, {
        from: ev.uid,
        name: ev.name,
        text: ev.text,
        at: ev.at ?? Date.now(),
      });
    }
    // приглашение истекло/устроено — состояние придёт следом
    evSeq++;
    useFriends.setState({ lastEvent: { ev, seq: evSeq } });
    // свежую историю чата подтянем лениво — при открытии чата
    if (ev.kind === 'accept') {
      void apiFriendChat(ev.uid)
        .then((msgs) => useFriends.getState().setChat(ev.uid, msgs))
        .catch(() => {});
    }
  });

  return () => {
    offState();
    offEvent();
    inited = false;
  };
}

/** загрузить историю переписки (при открытии чата) */
export function loadChat(withUid: string): Promise<void> {
  return apiFriendChat(withUid)
    .then((msgs) => useFriends.getState().setChat(withUid, msgs))
    .catch(() => {});
}
