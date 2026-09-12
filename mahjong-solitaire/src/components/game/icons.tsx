/**
 * Иконки «в стиле игры»: тёплая палитра маджонга, без тонких
 * люцидовских штрихов — домик с крышей и жирный вопросительный
 * знак. Используются в верхней панели (Домой) и нижней (Помощь).
 */

/** Домой: домик во весь круг — крупная фигурка, видна сразу */
export function IconHome({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* крыша — от края до края, с бревенчатой тенью под ней */}
      <path
        d="M12 1.2 23 10.3l-2.3 2.7L12 6.1 3.3 13 1 10.3 12 1.2Z"
        fill="#c9862d"
      />
      <path
        d="M12 2.6 21.3 10.4l-.9 1L12 4.5 3.6 11.4l-.9-1L12 2.6Z"
        fill="#a96a20"
        opacity="0.55"
      />
      {/* корпус — почти до низа круга */}
      <path
        d="M12 5.7 21.2 13.6V21c0 .9-.7 1.6-1.6 1.6H4.4c-.9 0-1.6-.7-1.6-1.6v-7.4L12 5.7Z"
        fill="#1d5c40"
      />
      <path
        d="M12 5.7 21.2 13.6V15L12 7.3 2.8 15v-1.4L12 5.7Z"
        fill="#2a7a56"
      />
      {/* дверь по центру, крупная */}
      <rect x="9.4" y="13.7" width="5.2" height="8.9" rx="1.5" fill="#f4ead0" />
      <rect x="10.6" y="15" width="2.8" height="7.6" rx="1.2" fill="#e4d5b0" />
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

/** Отмена хода: жирная петля-стрелка «назад», латунь + тень резьбы */
export function IconUndo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M11.4 3.4 3 10.3l8.4 6.9v-4c4.9-.4 7.6 1.7 7.6 6.1h3.1c0-6.8-4.4-9.5-10.7-9.2v-6.7Z"
        fill="#8a6a3a"
      />
      <path
        d="M11.4 5.2 4.6 10.3l6.8 5.1v-2.6l-3.8-2.5 3.8-2.5V5.2Z"
        fill="#a98850"
        opacity="0.7"
      />
    </svg>
  );
}

/** Перемешивание: две перекрещённые кости-стрелки, тёплая терракота */
export function IconShuffle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M3 7.5h4.2c1.3 0 2.5.6 3.3 1.6l3.9 5.1c.8 1 2 1.6 3.3 1.6h1.5l-2.4-2.4 2-2 6 6-6 6-2-2 2.4-2.4h-1.7c-2.2 0-4.3-1-5.7-2.8l-3.9-5.1c-.5-.6-1.2-1-2-1H3v-3.2Z"
        fill="#b3543a"
      />
      <path
        d="M17.8 1.9 16 3.9l2.2 2.2h-1.5c-2.2 0-4.3 1-5.7 2.7l-.7.9 2 2.6.8-1c.5-.7 1.2-1.1 2-1.1h1.3l-2.4 2.4 2 2 6-6-6-5.7Z"
        fill="#8a6a3a"
      />
    </svg>
  );
}

/** Таблица: латунный кубок на костяной подставке */
export function IconTrophy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* чаша */}
      <path
        d="M7 3h10v2.5c0 4-2.4 6.8-5 6.8S7 9.5 7 5.5V3Z"
        fill="#d9a542"
      />
      <path d="M7.6 3.7h8.8v1.8c0 3.3-1.9 5.7-4.4 5.7S7.6 8.8 7.6 5.5V3.7Z" fill="#eec25f" opacity="0.65" />
      {/* ручки */}
      <path
        d="M7 4H4.6C3.6 4 3 4.7 3 5.7c0 2.4 1.5 4.1 4 4.4V7.7c-1.2-.2-1.7-.9-1.7-2 0-.2.1-.3.3-.3H7V4Zm10 0h2.4c1 0 1.6.7 1.6 1.7 0 2.4-1.5 4.1-4 4.4V7.7c1.2-.2 1.7-.9 1.7-2 0-.2-.1-.3-.3-.3H17V4Z"
        fill="#b8862d"
      />
      {/* ножка и подставка из кости */}
      <rect x="10.9" y="12" width="2.2" height="4.4" fill="#b8862d" />
      <rect x="7.6" y="16.4" width="8.8" height="2.6" rx="1" fill="#efe3c4" />
      <rect x="7.6" y="17.9" width="8.8" height="1.1" rx="0.5" fill="#d9c9a2" />
    </svg>
  );
}

/** Настройки: латунная шестерёнка с костяным центром */
export function IconGear({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 1.9c.8 0 1.5.1 2.2.3l.5 2.4c.7.3 1.4.7 2 1.2l2.3-.8c1 1.1 1.7 2.4 2.1 3.8l-1.8 1.6c.1.5.1 1 .1 1.6s0 1.1-.1 1.6l1.8 1.6c-.4 1.4-1.1 2.7-2.1 3.8l-2.3-.8c-.6.5-1.3.9-2 1.2l-.5 2.4c-.7.2-1.4.3-2.2.3s-1.5-.1-2.2-.3l-.5-2.4c-.7-.3-1.4-.7-2-1.2l-2.3.8c-1-1.1-1.7-2.4-2.1-3.8l1.8-1.6c-.1-.5-.1-1-.1-1.6s0-1.1.1-1.6L2.9 8.8c.4-1.4 1.1-2.7 2.1-3.8l2.3.8c.6-.5 1.3-.9 2-1.2l.5-2.4c.7-.2 1.4-.3 2.2-.3Z"
        fill="#a9814e"
      />
      <circle cx="12" cy="12" r="4.6" fill="#8a6a3a" />
      <circle cx="12" cy="12" r="3.1" fill="#efe3c4" />
    </svg>
  );
}
