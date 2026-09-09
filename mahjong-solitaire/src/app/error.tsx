'use client';

/**
 * Error boundary приложения — «страховочная сетка» от вылетов.
 *
 * Если React-рендер падает (битое сохранение, неожиданное состояние),
 * игрок видит аккуратную карточку с кнопками «Продолжить» /
 * «Перезагрузить», а не белый экран. Тексты захардкожены (RU/EN
 * строками) намеренно: error page не должен зависеть от модулей,
 * которые могли стать причиной падения (в т.ч. i18n).
 */

import { useEffect } from 'react';

export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // в консоль — для диагностики; игроку —friendly-экран
    console.error('[mahjong] render error:', error);
  }, [error]);

  return (
    <div
      className="mj-table flex h-dvh flex-col items-center justify-center px-6"
      style={{ color: '#f3ead0' }}
    >
      <div className="mj-card" style={{ textAlign: 'center' }}>
        <h2 className="text-2xl font-black text-sky-900">
          Что-то пошло не так
        </h2>
        <p
          className="mt-2 text-sm font-semibold text-stone-600"
          style={{ lineHeight: 1.5 }}
        >
          Прогресс сохранён. Нажми «Продолжить» или перезагрузи страницу.
          <br />
          Something went wrong — tap Continue or reload the page.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button className="mj-btn" onClick={() => reset()}>
            Продолжить · Continue
          </button>
          <button
            className="mj-btn mj-btn-ghost"
            onClick={() => window.location.reload()}
          >
            Перезагрузить · Reload
          </button>
        </div>
      </div>
    </div>
  );
}
