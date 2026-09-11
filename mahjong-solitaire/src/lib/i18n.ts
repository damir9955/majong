'use client';

/**
 * Двуязычный интерфейс (русский / английский).
 *
 * Язык — отдельное мини-хранилище с persist (ключ 'mahjong-lang'),
 * чтобы не тянуть его в основной стор и не порождать циклических
 * импортов: компоненты берут useT() (реактивно), а стор и утилиты
 * вне React — tr() (по текущему значению).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Lang = 'ru' | 'en';

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLang = create<LangState>()(
  persist(
    (set) => ({
      lang: 'ru',
      setLang: (l) => set({ lang: l }),
    }),
    { name: 'mahjong-lang' },
  ),
);

/* ---------- словарь ---------- */

const RU: Record<string, string> = {
  // главное меню
  'home.title': 'МАДЖОНГ',
  'home.classic': 'Классика',
  'home.classicSub': 'Спокойная игра без соперника',
  'home.classicResume': 'Уровень {n} — партия сохранена',
  'home.continue': 'Продолжить',
  'home.continueMatch': 'Продолжить матч',
  'home.battle': '1 на 1',
  'home.battleSub': 'Матч против соперника · трофеи',
  'home.battleWaiting': 'Уровень {n} ждёт тебя',
  'home.online': 'С другом',
  'home.onlineSub': 'Открытые игры · вход по коду',
  'home.onlineWaiting': 'Друг ждёт на уровне {n}',
  'home.level': 'Уровень {n}',
  'home.standings': 'Таблица',
  'home.settings': 'Настройки',
  'settings.language': 'Язык',
  'settings.sound': 'Звук',
  'settings.on': 'Вкл',
  'settings.off': 'Выкл',

  // выбор темы стола (Task 25: 6 тем «от реалистичной до простой»)
  'settings.theme': 'Тема стола',
  'theme.emerald': 'Фетр',
  'theme.wood': 'Дерево',
  'theme.walnut': 'Орех',
  'theme.night': 'Ночь',
  'theme.paper': 'Пергамент',
  'theme.mint': 'Мята',

  // «1 на 1»: всё в одном месте (Task 25)
  'one.title': 'Против кого играть?',
  'one.find': 'Найти игру',
  'one.findSub': 'Автопоиск соперника — уровень не важен',
  'one.code': 'По коду',
  'one.codeSub': 'Открытые игры · вход по коду',
  'one.bot': 'С компьютером',
  'one.botSub': 'Соперник найден сразу',

  // подтверждение выхода из онлайн-матча (Task 25)
  'exit.title': 'Выйти из матча?',
  'exit.text': 'Матч будет зачтён как поражение',
  'exit.yes': 'Выйти',
  'exit.no': 'Остаться',

  // возврат в незаконченный матч (Task 28): устройство помнит комнату
  'return.title': 'Незаконченный матч',
  'return.text': 'Ты играл с «{name}» на уровне {n}. Комната ещё жива — вернуться?',
  'return.rejoin': 'Вернуться в матч',
  'return.new': 'Начать новую игру',
  'return.waitTitle': 'Твоя комната ждёт',
  'return.waitText': 'Комната {code} всё ещё ждёт соперника. Вернуться к ожиданию?',
  'return.waitBack': 'Вернуться',
  'return.waitClose': 'Закрыть комнату',

  // ждущие игроки в главном меню (Task 28)
  'wait.title': 'Сейчас ждут соперника',
  'wait.join': 'Войти',
  'wait.more': '+{n}',
  'wait.joining': 'Входим…',

  // реванш по согласию обоих (Task 25)
  'rem.waiting': 'Ждём согласия соперника…',
  'rem.offer': 'Соперник предлагает реванш — согласен?',
  'rem.accept': 'Согласиться',
  'rem.decline': 'Отказаться',

  // соперник потерял связь
  'vs.offline': 'Соперник потерял связь — ждём…',

  // матчмейкинг
  'mm.searching': 'Ищем соперника…',
  'mm.anyLevel': 'Уровень не важен',
  'mm.hint': 'Соединяем с любым свободным игроком или первой открытой комнатой',
  'mm.waited': 'Ждём чуть дольше — людей сейчас мало',
  'mm.cancel': 'Отмена',
  'mm.name': 'Твоё имя',

  // комната по коду
  'room.title': 'С ДРУГОМ',
  'room.subtitle': 'Матч 1 на 1 по интернету: одинаковая доска у обоих — кто соберёт первым',
  'room.name': 'Твоё имя',
  'room.player': 'Игрок',
  'room.create': 'Создать игру',
  'room.or': 'или',
  'room.inviteCode': 'Код приглашения',
  'room.enter': 'Войти по коду',
  'room.codeLen': 'Код — 5 символов',
  'room.codeTitle': 'Код игры',
  'room.waiting': 'Ждём соперника…',
  'room.waitingHint': 'Отправь другу код — он введёт его в разделе «С другом»',
  'room.openWaitingHint': 'Игра видна в списке открытых — соперник зайдёт сам, или отправь ему код',
  'room.visTitle': 'Тип игры',
  'room.visOpen': 'Открытая',
  'room.visClosed': 'Закрытая',
  'room.visOpenHint': 'Видна всем в списке «Открытые игры» — заходят без кода',
  'room.visClosedHint': 'Только по коду приглашения',
  'room.openList': 'Открытые игры',
  'room.openLoading': 'Загружаем список…',
  'room.openEmpty': 'Сейчас нет открытых игр — создай свою!',
  'room.join': 'Войти',
  'room.copyCode': 'Код',
  'room.copied': '{what} скопирован',
  'room.copyManual': 'Скопируй вручную: {text}',
  'room.cancel': 'Отмена',
  'room.back': 'Назад',
  'room.time': 'Уровень {n} · {t}',
  'room.min': 'мин',
  'room.sec': 'сек',
  'room.replaceTitle': 'Есть незакрытая партия',
  'room.replaceText': 'Начать онлайн-матч? Текущая партия будет закрыта без сохранения прогресса.',
  'room.replaceYes': 'Начать матч',
  'room.replaceNo': 'Отмена',
  'room.notFound': 'Игра не найдена — проверь код',
  'room.full': 'Игра уже занята',
  'room.network': 'Нет связи — попробуй ещё раз',
  'room.lost': 'Игра больше не существует',
  'room.closed': 'Игра закрыта — матч прерван',

  // обучение
  'tut.classicTitle': 'Маджонг',
  'tut.battleTitle': 'Маджонг 1 на 1',
  'tut.onlineTitle': 'Маджонг с другом',
  'tut.pairs': 'Собирай пары',
  'tut.pairsText': 'Одинаковые плитки взрываются.',
  'tut.flip': 'Переворачивай рубашки',
  'tut.flipText': 'Тапни закрытую — а её близнеца ищи рядом.',
  'tut.under': 'Смотри под кости',
  'tut.underText': 'Рубашки прячутся и ПОД костями: снимешь верхнюю — нижняя откроется сама.',
  'tut.classic': 'Спокойный режим',
  'tut.classicText': 'Без таймера и соперника — в своё удовольствие.',
  'tut.raceBot': 'Обгони соперника',
  'tut.raceFriend': 'Обгони друга',
  'tut.raceText': 'Собери доску быстрее и получи трофеи.',
  'tut.raceFriendText': 'Доска у вас одна — кто соберёт первым, тот победил.',
  'tut.play': 'Играть',

  // HUD и верхняя панель
  'hud.home': 'Домой',
  'hud.homeTitle': 'В меню (партия сохранится)',
  'hud.undo': 'Вернуть плитку',
  'hud.undoLeft': 'Вернуть последнюю плитку из лотка (осталось {n})',
  'hud.shuffle': 'Перемешать',
  'hud.hint': 'Подсказка',
  'vs.you': 'Вы',
  'vs.me': 'Я',

  // интро матча
  'mi.search': 'Поиск соперника',
  'mi.skip': 'Пропустить',
  'mi.searchSub': 'Уровень {n} · {p} пар',
  'mi.youChip': 'ты',
  'mi.friendChip': 'друг',
  'mi.faster': 'Собери доску быстрее соперника',
  'mi.fasterFriend': 'Собери доску быстрее друга',
  'mi.go': 'Вперёд!',

  // результаты
  'res.levelDone': 'Уровень пройден!',
  'res.levelDoneSub': 'Доска собрана — дальше новая',
  'res.noSpace': 'Нет места',
  'res.again': 'Ещё раз',
  'res.menu': 'В меню',
  'res.next': 'Дальше',
  'res.win': 'Победа!',
  'res.lose': 'Поражение',
  'res.match': 'матч · уровень {n}',
  'res.rematch': 'Реванш',
  'res.time': 'Время победителя: {t}',
  'series.title': 'Серия',
  'series.score': 'Счёт серии',
  'res.reason.cleared': 'Доска собрана',
  'res.reason.opponent': 'Соперник собрал первым',
  'res.reason.timeout': 'Время вышло',
  'res.reason.tray': 'Нет места',
  'res.reason.oppTray': 'Соперник: нет места',
  'res.reason.left': 'Соперник вышел',
  'res.reason.disconnect': 'Соперник отключился',
  'res.toNext': 'До «{name}»: {n} трофеев',
  'res.topLeague': 'Высшая лига достигнута',
  'bonus.hint': 'Подсказка +1',
  'bonus.shuffle': 'Перемешать +1',

  // тосты (стор)
  'toast.noUndos': 'Возвраты закончились',
  'toast.noPairs': 'Нет пар',
  'toast.nothing': 'Нечего мешать',
  'toast.stuck': 'Ходов больше нет — перемешали',
  'toast.missed': 'Челлендж упущен',
  'toast.divine': 'Божественный ход! +{n}',
  'toast.friendLeft': 'Друг вышел из комнаты',
  'toast.roomGone': 'Комната недоступна',
  'toast.roomClosed': 'Комната закрыта — матч прерван',

  // лиги
  'league.0': 'Бронза',
  'league.1': 'Серебро',
  'league.2': 'Золото',
  'league.3': 'Платина',
  'league.4': 'Алмаз',
  'league.5': 'Мастер',
  'league.6': 'Легенда',

  // вход на уровень
  'entry.title': 'Уровень {n}',
  'entry.text': 'На этом уровне уже есть прогресс.',
  'entry.continue': 'Продолжить',
  'entry.restart': 'Начать заново',

  // реклама за бонус
  'ad.title': 'Получить {bonus}?',
  'ad.text': 'Посмотри рекламу и получи 1 «{bonus}» прямо сейчас.',
  'ad.watch': 'Смотреть рекламу',
  'ad.reward': 'Забрать награду',
  'ad.ad': 'Реклама',
  'ad.demo': 'Рекламный ролик · {n}',
  'ad.done': '+1 {bonus} получен',
  'bonus.name.hint': 'подсказка',
  'bonus.name.shuffle': 'перемешивание',
  'bonus.name.undo': 'возврат',

  // таблица
  'st.title': 'Таблица',
  'st.classic': 'Классика',
  'st.matches': 'Матчи',
  'st.friends': 'Друзья',
  'st.levelsCleared': 'Уровней пройдено',
  'st.pairsMatched': 'Пар собрано',
  'st.games': 'Партий',
  'st.wins': 'Побед',
  'st.losses': 'Поражений',
  'st.winrate': 'Винрейт',
  'st.trophies': 'Трофеи',
  'st.league': 'Лига',
  'st.streak': 'Серия',
  'st.streakHot': '{n} побед подряд',
  'st.streakCold': '{n} поражений подряд',
  'st.you': 'Ты',
  'st.friend': 'Друг',
  'st.played': 'Игр',
  'st.wl': 'П — П',
  'st.emptyClassic': 'Пройди уровни в «Классике» — статистика появится здесь',
  'st.emptyMatches': 'Сыграй матч 1 на 1 — результаты появятся здесь',
  'st.emptyFriends': 'Сыграй с другом по коду — итоги встреч появятся здесь',
  'st.back': 'Назад',
};

const EN: Record<string, string> = {
  'home.title': 'MAHJONG',
  'home.classic': 'Classic',
  'home.classicSub': 'A relaxed game with no opponent',
  'home.classicResume': 'Level {n} — game saved',
  'home.continue': 'Continue',
  'home.continueMatch': 'Continue match',
  'home.battle': '1 vs 1',
  'home.battleSub': 'Match vs opponent · trophies',
  'home.battleWaiting': 'Level {n} is waiting for you',
  'home.online': 'With a friend',
  'home.onlineSub': 'Open games · join by code',
  'home.onlineWaiting': 'Your friend is waiting at level {n}',
  'home.level': 'Level {n}',
  'home.standings': 'Standings',
  'home.settings': 'Settings',
  'settings.language': 'Language',
  'settings.sound': 'Sound',
  'settings.on': 'On',
  'settings.off': 'Off',

  // table themes (Task 25)
  'settings.theme': 'Table theme',
  'theme.emerald': 'Felt',
  'theme.wood': 'Wood',
  'theme.walnut': 'Walnut',
  'theme.night': 'Night',
  'theme.paper': 'Paper',
  'theme.mint': 'Mint',

  // «1 на 1» — всё в одном месте (Task 25)
  'one.title': 'Choose your opponent',
  'one.find': 'Find a game',
  'one.findSub': 'Auto-match with any player — level does not matter',
  'one.code': 'By code',
  'one.codeSub': 'Open games · join by code',
  'one.bot': 'vs Computer',
  'one.botSub': 'Opponent found instantly',

  // подтверждение выхода из онлайн-матча (Task 25)
  'exit.title': 'Leave the match?',
  'exit.text': 'The match will count as a loss',
  'exit.yes': 'Leave',
  'exit.no': 'Stay',

  // return to an unfinished match (Task 28): the device remembers the room
  'return.title': 'Unfinished match',
  'return.text': 'You were playing with "{name}" on level {n}. The room is still live — return?',
  'return.rejoin': 'Return to match',
  'return.new': 'Start a new game',
  'return.waitTitle': 'Your room is waiting',
  'return.waitText': 'Room {code} is still waiting for an opponent. Return to waiting?',
  'return.waitBack': 'Return',
  'return.waitClose': 'Close room',

  // players waiting on the main menu (Task 28)
  'wait.title': 'Waiting for an opponent now',
  'wait.join': 'Join',
  'wait.more': '+{n}',
  'wait.joining': 'Joining…',

  // реванш по согласию (Task 25)
  'rem.waiting': 'Waiting for the opponent to accept…',
  'rem.offer': 'Opponent offers a rematch — accept?',
  'rem.accept': 'Accept',
  'rem.decline': 'Decline',

  // соперник потерял связь
  'vs.offline': 'Opponent lost connection — waiting…',

  'mm.searching': 'Looking for an opponent…',
  'mm.anyLevel': 'Any level works',
  'mm.hint': 'Matching with any free player or the first open room',
  'mm.waited': 'Waiting a bit longer — few players right now',
  'mm.cancel': 'Cancel',
  'mm.name': 'Your name',

  'room.title': 'WITH A FRIEND',
  'room.subtitle': 'Online 1v1 match: the same board for both — first to clear it wins',
  'room.name': 'Your name',
  'room.player': 'Player',
  'room.create': 'Create game',
  'room.or': 'or',
  'room.inviteCode': 'Invite code',
  'room.enter': 'Join by code',
  'room.codeLen': 'The code is 5 characters',
  'room.codeTitle': 'Game code',
  'room.waiting': 'Waiting for an opponent…',
  'room.waitingHint': 'Send your friend the code — they will enter it in the "With a friend" section',
  'room.openWaitingHint': 'The game is visible in the open list — or send the code to your friend',
  'room.visTitle': 'Game type',
  'room.visOpen': 'Open',
  'room.visClosed': 'Closed',
  'room.visOpenHint': 'Visible to everyone in "Open games" — join without a code',
  'room.visClosedHint': 'Invite code only',
  'room.openList': 'Open games',
  'room.openLoading': 'Loading the list…',
  'room.openEmpty': 'No open games right now — create your own!',
  'room.join': 'Join',
  'room.copyCode': 'Code',
  'room.copied': '{what} copied',
  'room.copyManual': 'Copy manually: {text}',
  'room.cancel': 'Cancel',
  'room.back': 'Back',
  'room.time': 'Level {n} · {t}',
  'room.min': 'min',
  'room.sec': 'sec',
  'room.replaceTitle': 'You have an unfinished game',
  'room.replaceText': 'Start an online match? The current game will be closed without saving progress.',
  'room.replaceYes': 'Start match',
  'room.replaceNo': 'Cancel',
  'room.notFound': 'Game not found — check the code',
  'room.full': 'This game is already taken',
  'room.network': 'No connection — try again',
  'room.lost': 'This game no longer exists',
  'room.closed': 'Game closed — match interrupted',

  'tut.classicTitle': 'Mahjong',
  'tut.battleTitle': 'Mahjong 1 vs 1',
  'tut.onlineTitle': 'Mahjong with a friend',
  'tut.pairs': 'Match pairs',
  'tut.pairsText': 'Identical tiles explode.',
  'tut.flip': 'Flip face-down tiles',
  'tut.flipText': 'Tap a hidden one — then look for its twin nearby.',
  'tut.under': 'Look under the tiles',
  'tut.underText': 'Tiles hide UNDER others too: lift the top one — the one below opens by itself.',
  'tut.classic': 'Relaxed mode',
  'tut.classicText': 'No timer, no opponent — just enjoy.',
  'tut.raceBot': 'Outrun your rival',
  'tut.raceFriend': 'Outrun your friend',
  'tut.raceText': 'Clear the board first and earn trophies.',
  'tut.raceFriendText': 'The board is the same — whoever clears it first wins.',
  'tut.play': 'Play',

  'hud.home': 'Home',
  'hud.homeTitle': 'To menu (the game is saved)',
  'hud.undo': 'Return tile',
  'hud.undoLeft': 'Return the last tile to the board ({n} left)',
  'hud.shuffle': 'Shuffle',
  'hud.hint': 'Hint',
  'vs.you': 'You',
  'vs.me': 'Me',

  'mi.search': 'Finding an opponent',
  'mi.skip': 'Skip',
  'mi.searchSub': 'Level {n} · {p} pairs',
  'mi.youChip': 'you',
  'mi.friendChip': 'friend',
  'mi.faster': 'Clear the board faster than your rival',
  'mi.fasterFriend': 'Clear the board faster than your friend',
  'mi.go': 'Go!',

  'res.levelDone': 'Level complete!',
  'res.levelDoneSub': 'Board cleared — a new one ahead',
  'res.noSpace': 'No space',
  'res.again': 'Try again',
  'res.menu': 'To menu',
  'res.next': 'Next',
  'res.win': 'Victory!',
  'res.lose': 'Defeat',
  'res.match': 'match · level {n}',
  'res.rematch': 'Rematch',
  'res.time': 'Winner’s time: {t}',
  'series.title': 'Series',
  'series.score': 'Series score',
  'res.reason.cleared': 'Board cleared',
  'res.reason.opponent': 'Opponent cleared first',
  'res.reason.timeout': "Time's up",
  'res.reason.tray': 'No space',
  'res.reason.oppTray': 'Opponent: no space',
  'res.reason.left': 'Opponent left',
  'res.reason.disconnect': 'Opponent disconnected',
  'res.toNext': 'To "{name}": {n} trophies',
  'res.topLeague': 'Top league reached',
  'bonus.hint': 'Hint +1',
  'bonus.shuffle': 'Shuffle +1',

  'toast.noUndos': 'No returns left',
  'toast.noPairs': 'No pairs',
  'toast.nothing': 'Nothing to shuffle',
  'toast.stuck': 'No moves left — reshuffled',
  'toast.missed': 'Challenge missed',
  'toast.divine': 'Divine move! +{n}',
  'toast.friendLeft': 'Your friend left the room',
  'toast.roomGone': 'Room unavailable',
  'toast.roomClosed': 'Room closed — match interrupted',

  'league.0': 'Bronze',
  'league.1': 'Silver',
  'league.2': 'Gold',
  'league.3': 'Platinum',
  'league.4': 'Diamond',
  'league.5': 'Master',
  'league.6': 'Legend',

  'entry.title': 'Level {n}',
  'entry.text': 'This level already has progress.',
  'entry.continue': 'Continue',
  'entry.restart': 'Start over',

  'ad.title': 'Get {bonus}?',
  'ad.text': 'Watch an ad and get 1 "{bonus}" right now.',
  'ad.watch': 'Watch ad',
  'ad.reward': 'Claim reward',
  'ad.ad': 'Advertisement',
  'ad.demo': 'Ad video · {n}',
  'ad.done': '+1 {bonus} received',
  'bonus.name.hint': 'hint',
  'bonus.name.shuffle': 'shuffle',
  'bonus.name.undo': 'undo',

  'st.title': 'Standings',
  'st.classic': 'Classic',
  'st.matches': 'Matches',
  'st.friends': 'With friends',
  'st.levelsCleared': 'Levels cleared',
  'st.pairsMatched': 'Pairs matched',
  'st.games': 'Games',
  'st.wins': 'Wins',
  'st.losses': 'Losses',
  'st.winrate': 'Win rate',
  'st.trophies': 'Trophies',
  'st.league': 'League',
  'st.streak': 'Streak',
  'st.streakHot': '{n} wins in a row',
  'st.streakCold': '{n} losses in a row',
  'st.you': 'You',
  'st.friend': 'Friend',
  'st.played': 'Played',
  'st.wl': 'W — L',
  'st.emptyClassic': 'Complete levels in Classic — stats will appear here',
  'st.emptyMatches': 'Play a 1 vs 1 match — results will appear here',
  'st.emptyFriends': 'Play with a friend by code — results will appear here',
  'st.back': 'Back',
};

const DICTS: Record<Lang, Record<string, string>> = { ru: RU, en: EN };

/** подстановка {n}/{p}/{t}/{name}/{bonus}/{what}/{text}... */
function fill(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  let s = template;
  for (const [k, v] of Object.entries(params)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** чистый перевод по языку (для кода вне React: стор, утилиты) */
export function tr(lang: Lang, key: string, params?: Record<string, string | number>) {
  const dict = DICTS[lang] ?? RU;
  const s = dict[key] ?? RU[key] ?? key;
  return fill(s, params);
}

/** перевод по ТЕКУЩЕМУ языку хранилища (вызывать в момент события) */
export function trNow(key: string, params?: Record<string, string | number>) {
  return tr(useLang.getState().lang, key, params);
}

/** Реактивный перевод для компонентов: перерисуется при смене языка */
export function useT(): TFunc {
  const lang = useLang((s) => s.lang);
  return (key, params) => tr(lang, key, params);
}

/** имя лиги на текущем языке (index 0..6) */
export function leagueName(index: number, lang: Lang): string {
  return tr(lang, `league.${Math.max(0, Math.min(6, index))}`);
}
