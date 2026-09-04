/**
 * Реестр DOM-элементов слотов лотка.
 * Доска читает отсюда координаты, чтобы отправлять в них летящие плитки.
 */

export const slotEls: Array<HTMLDivElement | null> = [null, null, null, null];

export function slotRect(i: number): DOMRect | null {
  const el = slotEls[i];
  return el ? el.getBoundingClientRect() : null;
}
