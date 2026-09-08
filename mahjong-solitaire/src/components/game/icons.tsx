/**
 * Иконки «в стиле игры»: тёплая палитра маджонга, без тонких
 * люцидовских штрихов — домик с крышей и жирный вопросительный
 * знак. Используются в верхней панели (Домой) и нижней (Помощь).
 */

/** Домой: домик с тёплой крышей — маджонг-классика */
export function IconHome({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3.1 21.6 11.2l-1.9 2.1L12 7.3 4.3 13.3l-1.9-2.1L12 3.1Z"
        fill="#c9862d"
      />
      <path
        d="M12 7.5 19.4 13.9v5.6c0 .8-.6 1.4-1.4 1.4H6c-.8 0-1.4-.6-1.4-1.4v-5.6L12 7.5Z"
        fill="#1f5c46"
      />
      <rect x="9.8" y="14.8" width="4.4" height="6.1" rx="1.3" fill="#f4ead0" />
    </svg>
  );
}

/** Помощь/подсказка: тёплый жирный вопросительный знак */
export function IconHelp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M8.9 8.9a4.3 4.3 0 1 1 7 3.3c-1.3.9-1.9 1.6-1.9 3v.5h-3.4v-.9c0-1.9.8-2.9 2.2-4 1-.8 1.5-1.4 1.5-2.3 0-1.1-.8-1.9-2-1.9s-1.9.8-2 2.3H8.9Z"
        fill="#c9862d"
      />
      <circle cx="13.1" cy="19.7" r="1.9" fill="#c9862d" />
    </svg>
  );
}
