# Маджонг — расслабляющий пасьянс

Веб-версия маджонг-пасьянса в стиле популярных мобильных игр: бесконечные уровни
без меню, красивая «костяная» графика, плавные анимации и звук.

## Как играть

- **Тапни по свободной плитке** — она улетает в лоток сверху.
- **Две одинаковые** в лотке — соединяются и взрываются.
- **Четыре разных** в лотке — уровень проигран (кнопка «Отменить» спасает).
- **Удерживай плитку пальцем** — она приподнимется, и увидишь, что под ней.
- **Подсказка** и **перемешивание** — ограничены, за победу даются бонусы.
- За каждый пройденный уровень начисляется 1–2 бонуса к следующему.

## Стек

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- Tailwind CSS 4
- Zustand (сохранение прогресса в localStorage)
- Все раскладки генерируются решаемыми (reverse-solve алгоритм)

## Локальный запуск

```bash
bun install        # или: npm install
bun run dev        # или: npm run dev
```

Продакшн-сборка:

```bash
bun run build      # или: npm run build
bun run start
```

## Деплой на Vercel

1. **Загрузите проект на GitHub**
   - Вариант А (через сайт): создайте новый репозиторий → «uploading an existing
     file» → перетащите содержимое этой папки (все файлы, включая `.gitignore`).
   - Вариант Б (через git):
     ```bash
     git init
     git add .
     git commit -m "Mahjong Solitaire"
     git branch -M main
     git remote add origin https://github.com/ВАШ_ЛОГИН/ИМЯ_РЕПО.git
     git push -u origin main
     ```
2. **Подключите Vercel**: [vercel.com](https://vercel.com) → **Add New → Project**
   → выберите репозиторий → **Deploy**.
   - Framework Preset определится сам: **Next.js**
   - Build Command: `next build` (по умолчанию)
   - Ничего настраивать не нужно — просто нажмите Deploy.
3. Через минуту получите публичную ссылку вида `https://имя-проекта.vercel.app`.
   Дальше каждое обновление репозитория на GitHub деплоится автоматически.

## Структура проекта

```
src/
  app/                  # страница, layout, PWA-манифест, глобальные стили
  components/game/      # Board, Tray, HUD, Tile, TileFace, GameScreen
  lib/mahjong/          # движок: плитки, раскладки, генератор решаемых досок
  lib/game/             # состояние игры, эффекты, слоты лотка
  lib/sound.ts          # синтезированные звуки (Web Audio)
public/icons/           # PWA-иконки
```

## Google Play (на будущее)

Игра — готовый PWA (манифест + иконки). После запуска на Vercel её можно
упаковать в Android-приложение через [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
или [PWABuilder](https://www.pwabuilder.com) как Trusted Web Activity (TWA).

