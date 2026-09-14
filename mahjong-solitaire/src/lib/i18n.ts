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
  'home.standings': 'Статистика',
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
  'one.bot': 'С ботом',
  'one.botSub': 'Соперник сразу',

  // новый экран «1 на 1» (Task 32): играть сразу, минимум выбора
  'duel.play': 'Играть',
  'duel.playSub': 'Случайный соперник — уровень не важен',
  'duel.codeSub': 'Код или своя игра',
  'duel.codeTitle': 'По коду',
  'duel.createText': 'Создай свою игру — получишь код и позовёшь друга',
  'duel.orJoin': 'или войти по коду друга',
  'duel.createOpen': 'Создать игру',
  'duel.saveName': 'Сохранить',
  'duel.openEmptyHint': 'Открытых игр нет — нажми «Играть» или создай свою',

  // счёт серии побед с одним соперником (Task 32)
  'series.title': 'Серия',
  'series.lead': 'Ты ведёшь +{n}',
  'series.behind': 'Соперник ведёт +{n}',
  'series.equal': 'Счёт равный',

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
  'wait.confirmTitle': 'Присоединиться к игре?',
  'wait.confirmText': '{name} ждёт соперника · уровень {n}',
  'wait.confirmYes': 'Войти в игру',
  'wait.confirmNo': 'Пока нет',

  // ищущие быстрый матч — видны в меню (Task 36)
  'wait.searchingSub': 'Ищет соперника',
  'wait.play': 'Играть',
  'wait.quickTitle': 'Сыграть с соперником?',
  'wait.quickText': '{name} ищет быстрый матч — вы сойдётесь через пару секунд',
  'wait.gone': 'Соперник уже нашёл игру — попробуйте ещё раз',

  // сеть
  'net.offline': 'Нет интернета — подключитесь, чтобы играть с живыми соперниками (с ботом можно и без сети)',

  // загрузчик первой установки (Task 36)
  'boot.title': 'Скачиваем игру…',
  'boot.progress': '{n} из {m} · {p}%',
  'boot.hint': 'Одна загрузка — дальше игра работает даже без интернета',
  'boot.needNet': 'Для первой загрузки нужен интернет. Подключитесь к сети и попробуйте ещё раз',
  'boot.failed': 'Загрузка прервалась. Проверьте интернет и попробуйте ещё раз',
  'boot.retry': 'Повторить',

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
  'st.title': 'Статистика',
  'st.classic': 'Классика',
  'st.online': 'По сети',
  'st.matches': 'Матчи',
  'st.friends': 'Друзья',
  'st.levelsCleared': 'Уровней пройдено',
  'st.pairsMatched': 'Пар собрано',
  'st.games': 'Партий',
  'st.wins': 'Побед',
  'st.losses': 'Поражений',
  'st.winrate': 'Процент побед',
  'st.onlineTotal': 'Матчей по сети',
  'st.winsN': '{n} побед',
  'st.lossesN': '{n} поражений',
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
  'st.emptyOnline': 'Сыграй матч по сети — с живым соперником, не с ботом. Результаты появятся здесь',
  'st.emptyFriends': 'Сыграй с другом по коду — итоги встреч появятся здесь',
  'st.emptyFriendsV2': 'Добавляй друзей по ID или из матча — итоги встреч появятся здесь',
  'st.back': 'Назад',

  // статистика v2 (Task 36): обзор, подробности, достижения
  'st.overview': 'Обзор',
  'st.peak': 'пик',
  'st.toNext': 'До «{name}» — {n} трофеев',
  'st.maxLeague': 'Высшая лига достигнута!',
  'st.curStreak': 'Текущая серия',
  'st.bestStreak': 'Лучшая серия',
  'st.best': 'лучшая',
  'st.timePlayed': 'Время в игре',
  'st.bestTime': 'Лучшее время уровня',
  'st.bonuses': 'Бонусы потрачены',
  'st.hintN': 'подсказок',
  'st.shufN': 'миксов',
  'st.undoN': 'возвратов',
  'st.wlSep': '/',
  'st.withFriends': 'игр с друзьями',
  'st.friendsMet': 'Друзей: {n}',
  'tu.h': 'ч',
  'tu.min': 'мин',
  'tu.sec': 'с',
  'ach.title': 'Достижения',
  'ach.done': 'Выполнено!',
  'ach.maxTier': 'Высшая ступень достигнута',
  'ach.tapHint': 'Нажми на достижение — увидишь подробности',
  'ach.progress': '{n} из {m}',
  'ach.pairs': 'Собиратель пар',
  'ach.pairs.desc': 'Собирай одинаковые пары на доске. Чем больше пар собрано за всё время — тем выше ступень.',
  'ach.levels': 'Покоритель уровней',
  'ach.levels.desc': 'Проходи уровни «Классики» полностью — доска за доской, без поражений по лотку.',
  'ach.wins': 'Победитель',
  'ach.wins.desc': 'Побеждайте в матчах 1 на 1 — с ботом или живым соперником. Каждая победа приближает к высшей ступени.',
  'ach.streak': 'Огонь серии',
  'ach.streak.desc': 'Побеждай несколько матчей ПОДРЯД — серия считается от лучшей за всё время.',
  'ach.friends': 'Душа компании',
  'ach.friends.desc': 'Играй с друзьями по сети: добавляй по ID или прямо из матча — встречи считаются.',
  'ach.league': 'Покоритель лиг',
  'ach.league.desc': 'Поднимайся по лигам от Бронзы до Легенды: трофеи за победы двигают тебя вверх.',

  // друзья (Task 37)
  'fr.title': 'Друзья',
  'fr.myId': 'Мой ID — нажми, чтобы скопировать',
  'fr.codePlaceholder': 'ID друга',
  'fr.reqs': 'Заявки',
  'fr.list': 'Мои друзья',
  'fr.empty': 'Пока никого: добавь друга по ID или из итога матча',
  'fr.online': 'в сети',
  'fr.offline': 'не в сети',
  'fr.chat': 'Чат',
  'fr.remove': 'Удалить из друзей',
  'fr.accept': 'Принять',
  'fr.decline': 'Отклонить',
  'fr.sent': 'Заявка отправлена',
  'fr.sentToast': 'Заявка отправлена: {name}',
  'fr.already': 'Вы уже друзья',
  'fr.notFound': 'Друг с таким ID не найден — проверь код',
  'fr.addOpponent': 'Добавить в друзья',
  'fr.chatEmpty': 'Напишите первое сообщение — оно придёт другу, даже если он сейчас не в игре',
  'fr.chatPlaceholder': 'Сообщение…',
  'fr.send': 'Отправить',
  'fr.invite': 'Позвать в бой',
  'fr.waitingFriend': 'Ждём ответа: {name}…',
  'fr.inviteTitle': '{name} зовёт в бой!',
  'fr.inviteText': 'Друг приглашает тебя на матч — доска будет одна на двоих, кто быстрее.',
  'fr.play': 'Играть!',
  'fr.declineInvite': 'Отклонить',
  'fr.msgToast': 'Сообщение от {name}',
  'fr.reqToast': '{name} хочет добавить тебя в друзья',
  'fr.acceptToast': '{name} теперь твой друг',
  'fr.declinedToast': '{name} отказался от боя',
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
  'home.standings': 'Stats',
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
  'one.bot': 'vs Bot',
  'one.botSub': 'Instant opponent',

  // new 1v1 screen (Task 32): play instantly, minimal choices
  'duel.play': 'Play',
  'duel.playSub': 'Random opponent — any level',
  'duel.codeSub': 'Join by code or host your own',
  'duel.codeTitle': 'By code',
  'duel.createText': 'Host your own game — you get a code to share',
  'duel.orJoin': 'or join with a friend’s code',
  'duel.createOpen': 'Create game',
  'duel.saveName': 'Save',
  'duel.openEmptyHint': 'No open games right now — tap Play or create your own',

  // win series score with one opponent (Task 32)
  'series.title': 'Series',
  'series.lead': 'You lead +{n}',
  'series.behind': 'Opponent leads +{n}',
  'series.equal': 'Series tied',

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
  'wait.confirmTitle': 'Join this game?',
  'wait.confirmText': '{name} is waiting · level {n}',
  'wait.confirmYes': 'Join game',
  'wait.confirmNo': 'Not yet',

  // searching players in the menu (Task 36)
  'wait.searchingSub': 'Looking for an opponent',
  'wait.play': 'Play',
  'wait.quickTitle': 'Play a match?',
  'wait.quickText': '{name} is looking for a quick match — you will be paired in a couple of seconds',
  'wait.gone': 'That player already found a game — try again',

  // network
  'net.offline': 'No internet — connect to play live opponents (the bot works offline)',

  // first-install loader (Task 36)
  'boot.title': 'Downloading the game…',
  'boot.progress': '{n} of {m} · {p}%',
  'boot.hint': 'One download — then the game works even offline',
  'boot.needNet': 'Internet is required for the first download. Connect and try again',
  'boot.failed': 'Download was interrupted. Check your connection and try again',
  'boot.retry': 'Retry',

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

  'st.title': 'Statistics',
  'st.classic': 'Classic',
  'st.online': 'Online',
  'st.matches': 'Matches',
  'st.friends': 'Friends',
  'st.levelsCleared': 'Levels cleared',
  'st.pairsMatched': 'Pairs matched',
  'st.games': 'Games',
  'st.wins': 'Wins',
  'st.losses': 'Losses',
  'st.winrate': 'Win %',
  'st.onlineTotal': 'Online games',
  'st.winsN': '{n} wins',
  'st.lossesN': '{n} losses',
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
  'st.emptyOnline': 'Play an online match — against a live player, not the bot. Results will appear here',
  'st.emptyFriends': 'Play with a friend by code — results will appear here',
  'st.emptyFriendsV2': 'Add friends by ID or from a match — results will appear here',
  'st.back': 'Back',

  // stats v2 (Task 36)
  'st.overview': 'Overview',
  'st.peak': 'peak',
  'st.toNext': '{n} trophies to {name}',
  'st.maxLeague': 'Top league reached!',
  'st.curStreak': 'Current streak',
  'st.bestStreak': 'Best streak',
  'st.best': 'best',
  'st.timePlayed': 'Time played',
  'st.bestTime': 'Best level time',
  'st.bonuses': 'Boosters used',
  'st.hintN': 'hints',
  'st.shufN': 'shuffles',
  'st.undoN': 'undos',
  'st.wlSep': '/',
  'st.withFriends': 'games with friends',
  'st.friendsMet': 'Friends: {n}',
  'tu.h': 'h',
  'tu.min': 'm',
  'tu.sec': 's',
  'ach.title': 'Achievements',
  'ach.done': 'Done!',
  'ach.maxTier': 'Top tier reached',
  'ach.tapHint': 'Tap an achievement to see details',
  'ach.progress': '{n} of {m}',
  'ach.pairs': 'Pair Collector',
  'ach.pairs.desc': 'Match identical pairs on the board. The more pairs collected over time — the higher the tier.',
  'ach.levels': 'Level Climber',
  'ach.levels.desc': 'Complete Classic levels fully — board after board, without tray failures.',
  'ach.wins': 'Champion',
  'ach.wins.desc': 'Win 1v1 matches — vs the bot or a live player. Every victory brings you closer to the top tier.',
  'ach.streak': 'On Fire',
  'ach.streak.desc': 'Win several matches IN A ROW — the streak counts your all-time best.',
  'ach.friends': 'Good Company',
  'ach.friends.desc': 'Play online with friends: add them by ID or right after a match — every game counts.',
  'ach.league': 'League Hero',
  'ach.league.desc': 'Climb the leagues from Bronze to Legend: trophies for wins push you up.',

  // friends (Task 37)
  'fr.title': 'Friends',
  'fr.myId': 'My ID — tap to copy',
  'fr.codePlaceholder': "Friend's ID",
  'fr.reqs': 'Requests',
  'fr.list': 'My friends',
  'fr.empty': 'Nobody yet: add a friend by ID or from a match result',
  'fr.online': 'online',
  'fr.offline': 'offline',
  'fr.chat': 'Chat',
  'fr.remove': 'Remove friend',
  'fr.accept': 'Accept',
  'fr.decline': 'Decline',
  'fr.sent': 'Request sent',
  'fr.sentToast': 'Request sent: {name}',
  'fr.already': 'You are already friends',
  'fr.notFound': 'No player with this ID — check the code',
  'fr.addOpponent': 'Add friend',
  'fr.chatEmpty': 'Write the first message — it will reach your friend even if they are offline',
  'fr.chatPlaceholder': 'Message…',
  'fr.send': 'Send',
  'fr.invite': 'Invite to battle',
  'fr.waitingFriend': 'Waiting for {name}…',
  'fr.inviteTitle': '{name} invites you to battle!',
  'fr.inviteText': 'Your friend invites you to a match — the board is the same for both, fastest one wins.',
  'fr.play': 'Play!',
  'fr.declineInvite': 'Decline',
  'fr.msgToast': 'Message from {name}',
  'fr.reqToast': '{name} wants to add you as a friend',
  'fr.acceptToast': '{name} is now your friend',
  'fr.declinedToast': '{name} declined the battle',
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
