/**
 * Лоток — ОДНА прямоугольная зона, рассчитанная РОВНО на четыре
 * ячейки: ширина зоны в CSS подогнана под 4 слота, поэтому по виду
 * влезает ровно столько, сколько реально принимает игра.
 *
 * ПАРА ЗАНИМАЕТ ДВЕ СОСЕДНИЕ ЯЧЕЙКИ (base и base+1): житель — в
 * своей, прилетевшая — в следующей; соединяются в точке между
 * ячейками и взрываются. Пока пара не взорвалась ПОЛНОСТЬЮ, её
 * ячейки ЗАРЕЗЕРВИРОВАНЫ — новые плитки летят в ячейки 3-4
 * (пока 1-2 взрываются) и не наезжают на взрыв.
 *
 * Доска читает отсюда координаты, чтобы отправлять в них летящие
 * плитки и «соскальзывать» остаток на место взорвавшихся.
 */

/** число видимых позиций в ряду зоны (емкость лотка игры) */
export const TRAY_CAP = 4;

let zoneEl: HTMLDivElement | null = null;

export function registerTrayZone(el: HTMLDivElement | null) {
  zoneEl = el;
}

export interface SlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Геометрия виртуальной позиции i внутри зоны лотка.
 * i = 0..3 — видимый ряд; i >= 4 — «очередь» над рядом (по тем же
 * колонкам, приподнято) — используется только на время взрыва.
 */
export function slotRect(i: number): SlotRect | null {
  if (!zoneEl) return null;
  const z = zoneEl.getBoundingClientRect();
  if (z.width < 10 || z.height < 10) return null;
  const padX = 8;
  const padY = 7;
  const gap = 4;
  // размер слота ограничен и высотой, и шириной (ровно CAP позиций)
  const sw = Math.min(
    (z.height - 2 * padY) / 1.28,
    (z.width - 2 * padX - (TRAY_CAP - 1) * gap) / TRAY_CAP,
  );
  if (sw <= 4) return null;
  const sh = sw * 1.28;
  const step = sw + gap;
  // ряд позиций центрируем внутри зоны
  const rowW = TRAY_CAP * sw + (TRAY_CAP - 1) * gap;
  const left0 = z.left + (z.width - rowW) / 2;
  const top0 = z.top + (z.height - sh) / 2;

  const row = Math.floor(i / TRAY_CAP);
  const col = i % TRAY_CAP;
  const left = left0 + col * step;
  // «очередь»: лоток сверху, поэтому строки-страховки уходят ВНИЗ
  // (к доске), а не за верхний край экрана
  const top = top0 + row * (sh * 0.8 + 6);
  return { left, top, width: sw, height: sh };
}

/** устаревший реестр (совместимость) — отдельные ячейки больше не нужны */
export const slotEls: Array<HTMLDivElement | null> = [];
