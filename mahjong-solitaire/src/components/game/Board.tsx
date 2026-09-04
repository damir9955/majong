'use client';

/**
 * Доска: авто-масштаб раскладки, жесты и полёты плиток.
 *
 * Жесты:
 *  — короткий тап по свободной плитке — она улетает в лоток;
 *  — удержание (300 мс) или сдвиг пальцем — плитка поднимается
 *    и следует за пальцем: можно отодвинуть и посмотреть,
 *    что под ней;
 *  — тап по занятой плитке — «занято» (тряска). Какие плитки
 *    свободны — нигде не подсвечивается, игрок ищет сам.
 *
 * Пара в лотке: прилетевшая плитка встаёт РЯДОМ с парной,
 * затем анимация соединяет их и взрывает.
 *
 * Полёт в лоток двухэтапный: подскок (плитка приподнимается
 * и чуть разворачивается) → плавное скольжение в слот с мягким
 * прилётом. Слои доски почти не смещены друг относительно друга —
 * стопки выглядят ровно.
 *
 * Полёты и взрывы реализованы напрямую через DOM
 * (transform/transition/display), React не трогает эти свойства.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { layoutBounds } from '@/lib/mahjong/layouts';
import { Tile, type TileVisual } from './Tile';
import { slotRect } from '@/lib/game/traySlots';
import { sparkle, ring, flash } from '@/lib/game/fx';
import { buzz, playBoom, playPeek } from '@/lib/sound';

const LAYER_OFF_X = 0.08; // доля ширины плитки — едва заметный сдвиг слоя
const LAYER_OFF_Y = 0.08; // слои стоят почти ровно, стопка читается
const TILE_RATIO = 1.28; // высота плитки к ширине
const MAX_TILE_W = 78;

const HOP_MS = 160; // этап 1: подскок плитки
const GLIDE_MS = 480; // этап 2: скольжение в слот
const FLIGHT_MS = HOP_MS + GLIDE_MS;
const JOIN_MS = 300; // соединение пары в лотке
const PEEK_HOLD_MS = 300; // удержание до поднятия плитки
const PEEK_MAX_X = 120;
const PEEK_MIN_Y = -170;
const PEEK_MAX_Y = 70;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type FlightState = 'tray' | 'joining' | 'gone';

interface FlightCtrl {
  sid: number;
  slotOf: Map<number, number>;
  state: Map<number, FlightState>;
  baseZ: Map<number, string>;
  matchedSeq: number;
  /** таймеры этапов полёта конкретной плитки */
  flyTimers: Map<number, number[]>;
}

export function Board() {
  const session = useGame((s) => s.session);
  const tapTile = useGame((s) => s.tapTile);
  const sid = session?.sid ?? -1;
  const tiles = session?.tiles;
  const invalidId = session?.invalidId;

  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // каскадное появление новой доски: класс снимается после анимации,
  // чтобы не конфликтовать с «занято» (правка состояния при рендере —
  // шаблон из документации React)
  const [entering, setEntering] = useState(false);
  const [enterSid, setEnterSid] = useState(-1);
  if (sid > 0 && sid !== enterSid) {
    setEnterSid(sid);
    setEntering(true);
  }
  useEffect(() => {
    if (!entering) return;
    const t = window.setTimeout(() => setEntering(false), 1500);
    return () => window.clearTimeout(t);
  }, [entering, enterSid]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bounds = useMemo(() => {
    if (!tiles || tiles.length === 0) return null;
    return layoutBounds(tiles.map((t) => ({ x: t.x, y: t.y, z: t.z })));
  }, [tiles]);

  const geom = useMemo(() => {
    if (!bounds || size.w < 10 || size.h < 10) return null;
    const xSpan = bounds.maxX - bounds.minX; // в юнитах (плитка = 2)
    const ySpan = bounds.maxY - bounds.minY;
    const availW = size.w - 16;
    const availH = size.h - 16;
    const tw = Math.min(
      availW / (xSpan / 2 + bounds.maxZ * LAYER_OFF_X),
      availH / (TILE_RATIO * (ySpan / 2) + bounds.maxZ * LAYER_OFF_Y),
      MAX_TILE_W,
    );
    const tileW = Math.max(18, tw);
    const tileH = tileW * TILE_RATIO;
    return {
      tileW,
      tileH,
      ux: tileW / 2,
      uy: tileH / 2,
      boardW: xSpan * (tileW / 2) + bounds.maxZ * LAYER_OFF_X * tileW,
      boardH: ySpan * (tileH / 2) + bounds.maxZ * LAYER_OFF_Y * tileW,
    };
  }, [bounds, size]);

  // порядок появления плиток новой доски (снизу вверх)
  const enterOrder = useMemo(() => {
    const m = new Map<string, number>();
    if (!tiles) return m;
    const sorted = [...tiles].sort(
      (a, b) => a.z - b.z || a.y - b.y || a.x - b.x,
    );
    sorted.forEach((t, i) =>
      m.set(`${t.x},${t.y},${t.z}`, Math.min(i * 13, 820)),
    );
    return m;
  }, [sid, tiles]);

  const visuals = useMemo<TileVisual[]>(() => {
    if (!tiles || !bounds || !geom) return [];
    return tiles.map((t) => ({
      tile: t,
      left: t.z * LAYER_OFF_X * geom.tileW + (t.x - bounds.minX) * geom.ux,
      top: t.z * LAYER_OFF_Y * geom.tileW + (t.y - bounds.minY) * geom.uy,
      width: geom.tileW,
      height: geom.tileH,
      zIndex: t.z * 1000 + (t.y - bounds.minY),
      invalid: t.id === invalidId,
      entering,
      enterDelay: enterOrder.get(`${t.x},${t.y},${t.z}`) ?? 0,
    }));
  }, [tiles, bounds, geom, invalidId, enterOrder, entering]);

  /* ------------------ полёты, соединение и взрывы ------------------ */

  const els = useRef(new Map<number, HTMLDivElement>());
  const registerEl = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  }, []);

  const fl = useRef<FlightCtrl>({
    sid: -1,
    slotOf: new Map(),
    state: new Map(),
    baseZ: new Map(),
    matchedSeq: 0,
    flyTimers: new Map(),
  });

  const clearFlyTimers = useCallback((id: number) => {
    const F = fl.current;
    const timers = F.flyTimers.get(id);
    if (timers) {
      timers.forEach((t) => window.clearTimeout(t));
      F.flyTimers.delete(id);
    }
  }, []);

  const addFlyTimer = useCallback((id: number, t: number) => {
    const F = fl.current;
    const arr = F.flyTimers.get(id) ?? [];
    arr.push(t);
    F.flyTimers.set(id, arr);
  }, []);

  /** поставить плитку центром в экранные координаты (cx, cy) */
  const placeAt = useCallback(
    (id: number, cx: number, cy: number, scale: number, ms: number, ease = 'cubic-bezier(.28,.7,.3,1)') => {
      const el = els.current.get(id);
      const inner = innerRef.current;
      if (!el || !inner) return;
      clearFlyTimers(id);
      const base = inner.getBoundingClientRect();
      const left = parseFloat(el.style.left || '0');
      const top = parseFloat(el.style.top || '0');
      const w = parseFloat(el.style.width || '0');
      const h = parseFloat(el.style.height || '0');
      if (!w || !h) return;
      const nx = base.left + left + w / 2;
      const ny = base.top + top + h / 2;
      el.style.transition = ms > 0 ? `transform ${ms}ms ${ease}` : 'none';
      el.style.transform = `translate(${cx - nx}px, ${cy - ny}px) scale(${scale})`;
      if (ms <= 0) {
        // вернуть возможность анимации после мгновенной перестановки
        requestAnimationFrame(() => {
          if (el.style.transition === 'none') el.style.transition = '';
        });
      }
    },
    [clearFlyTimers],
  );

  /**
   * Полёт в слот лотка: подскок → скольжение по дуге с мягким
   * прилётом. CSS-анимации входа/перемешивания заранее гасятся,
   * иначе они перекрывают transform и плитка «телепортируется».
   */
  const flyToSlot = useCallback(
    (id: number, idx: number, animate = true) => {
      const el = els.current.get(id);
      const sr = slotRect(idx);
      if (!el || !sr) return;
      const w = parseFloat(el.style.width || '0');
      if (!w) return;
      const F = fl.current;
      clearFlyTimers(id);
      el.classList.remove('mj-enter', 'mj-shuffle-wave');
      if (!F.baseZ.has(id)) F.baseZ.set(id, el.style.zIndex || '');
      if ((el.style.zIndex || '') !== '7000') el.style.zIndex = '7000';
      const k = sr.width / w;

      if (!animate) {
        placeAt(id, sr.left + sr.width / 2, sr.top + sr.height / 2, k, 0);
        F.slotOf.set(id, idx);
        F.state.set(id, 'tray');
        return;
      }

      const inner = innerRef.current;
      if (!inner) return;
      const base = inner.getBoundingClientRect();
      const left = parseFloat(el.style.left || '0');
      const top = parseFloat(el.style.top || '0');
      const h = parseFloat(el.style.height || '0');
      if (!h) return;
      const nx = base.left + left + w / 2;
      const ny = base.top + top + h / 2;
      const dx = sr.left + sr.width / 2 - nx;
      const dy = sr.top + sr.height / 2 - ny;

      // этап 1: подскок — плитка приподнимается навстречу лотку
      const lift = Math.min(64, 24 + Math.abs(dy) * 0.1);
      el.style.transition = `transform ${HOP_MS}ms cubic-bezier(.3,.6,.45,1)`;
      el.style.transform = `translate(${dx * 0.12}px, ${
        dy * 0.12 - lift
      }px) scale(1.13) rotate(${dx >= 0 ? 2.5 : -2.5}deg)`;

      // этап 2: скольжение в слот, мягкий прилёт с лёгким перелётом
      addFlyTimer(
        id,
        window.setTimeout(() => {
          const st = F.state.get(id);
          if (st !== 'tray' && st !== 'joining') return;
          el.style.transition = `transform ${GLIDE_MS}ms cubic-bezier(.24,.74,.3,1.04)`;
          el.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
        }, HOP_MS + 10),
      );
      addFlyTimer(
        id,
        window.setTimeout(() => {
          if (fl.current.state.get(id) === 'tray') el.style.transition = '';
        }, FLIGHT_MS + 80),
      );
      F.slotOf.set(id, idx);
      F.state.set(id, 'tray');
    },
    [placeAt, clearFlyTimers, addFlyTimer],
  );

  /** первый свободный слот с учётом соединяющейся пары */
  const firstFreeSlot = useCallback(() => {
    const F = fl.current;
    const used = new Set<number>();
    F.slotOf.forEach((slot, id) => {
      const st = F.state.get(id);
      if (st === 'tray' || st === 'joining') used.add(slot);
    });
    for (let i = 0; i < 4; i++) if (!used.has(i)) return i;
    return -1;
  }, []);

  /**
   * Пара в лотке: обе плитки съезжаются к середине, соединяются
   * и взрываются с волной, вспышкой и искрами.
   */
  const joinAndExplode = useCallback(
    (resident: number, arriving: number) => {
      const F = fl.current;
      // ждём прилёта второй плитки
      setTimeout(() => {
        const elR = els.current.get(resident);
        const elA = els.current.get(arriving);
        if (!elR || !elA) return;
        const rr = elR.getBoundingClientRect();
        const ar = elA.getBoundingClientRect();
        const mx = (rr.left + rr.width / 2 + ar.left + ar.width / 2) / 2;
        const my = (rr.top + rr.height / 2 + ar.top + ar.height / 2) / 2;
        const wR = parseFloat(elR.style.width || '0');
        const wA = parseFloat(elA.style.width || '0');
        const kR = wR ? rr.width / wR : 1;
        const kA = wA ? ar.width / wA : 1;

        // соединение: съезжаются к середине
        elR.classList.add('mj-joining');
        elA.classList.add('mj-joining');
        placeAt(resident, mx, my, kR * 1.12, JOIN_MS, 'cubic-bezier(.45,0,.55,1)');
        placeAt(arriving, mx, my, kA * 1.12, JOIN_MS, 'cubic-bezier(.45,0,.55,1)');

        // взрыв
        setTimeout(() => {
          for (const id of [resident, arriving]) {
            const el = els.current.get(id);
            if (!el) continue;
            clearFlyTimers(id);
            F.state.set(id, 'gone');
            F.slotOf.delete(id);
            const cur = el.style.transform || 'translate(0px, 0px)';
            el.style.transition = 'none';
            const anim = el.animate(
              [
                { transform: cur, opacity: 1, filter: 'brightness(1.6)' },
                { transform: `${cur} scale(1.7)`, opacity: 0, filter: 'brightness(2.2)' },
              ],
              { duration: 400, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' },
            );
            anim.onfinish = () => {
              el.style.display = 'none';
              el.classList.remove('mj-joining');
            };
          }
          ring(mx, my);
          flash(mx, my);
          sparkle(mx, my, 22);
          playBoom();
          buzz(24);
        }, JOIN_MS + 60);
      }, FLIGHT_MS + 60);
    },
    [placeAt, clearFlyTimers],
  );

  const returnHome = useCallback(
    (id: number) => {
      const el = els.current.get(id);
      if (!el) return;
      const F = fl.current;
      clearFlyTimers(id);
      F.state.delete(id);
      F.slotOf.delete(id);
      el.classList.remove('mj-joining');
      el.style.transition = `transform ${FLIGHT_MS}ms cubic-bezier(.25,.8,.3,1.04)`;
      el.style.transform = '';
      const bz = F.baseZ.get(id);
      setTimeout(() => {
        el.style.transition = '';
        if (bz !== undefined) {
          el.style.zIndex = bz;
          F.baseZ.delete(id);
        }
      }, FLIGHT_MS + 60);
    },
    [clearFlyTimers],
  );

  // реакция на изменения партии
  useEffect(() => {
    const unsub = useGame.subscribe((st, prev) => {
      const s = st.session;
      const p = prev.session;
      if (!s) return;
      const F = fl.current;

      if (!p || s.sid !== F.sid || s.sid !== p.sid) {
        // новая доска — сброс контроллера
        F.flyTimers.forEach((timers) => timers.forEach((t) => window.clearTimeout(t)));
        F.sid = s.sid;
        F.slotOf.clear();
        F.state.clear();
        F.baseZ.clear();
        F.flyTimers.clear();
        F.matchedSeq = s.matchedSeq;
        return;
      }

      // ПАРА: прилетевшая встаёт рядом с жителем, остальные уплотняются,
      // затем пара соединяется и взрывается
      const newMatch = s.matchedSeq !== F.matchedSeq ? s.matchedPair : null;
      if (newMatch) {
        F.matchedSeq = s.matchedSeq;
        const [resident, arriving] = newMatch;
        const L = s.tray.length; // остальные займут слоты 0..L-1
        // остальные плитки уплотняются к началу лотка
        s.tray.forEach((id, i) => {
          if (F.state.get(id) === 'tray') flyToSlot(id, i, true);
        });
        // житель съезжает в слот L, прилетевшая — рядом, в L+1
        flyToSlot(resident, L, true);
        F.state.set(resident, 'joining');
        flyToSlot(arriving, Math.min(L + 1, 3), true);
        F.state.set(arriving, 'joining');
        joinAndExplode(resident, arriving);
      }

      // новые плитки в лотке
      s.tray.forEach((id, i) => {
        if (!F.state.has(id)) {
          const free = firstFreeSlot();
          flyToSlot(id, free >= 0 ? free : i, true);
        }
      });

      // вернувшиеся на доску (отмена)
      const gone = newMatch ? [newMatch[0], newMatch[1]] : [];
      const returned = p.tray.filter(
        (id) => !s.tray.includes(id) && !gone.includes(id),
      );
      returned.forEach((id) => {
        if (F.state.get(id) === 'tray') returnHome(id);
      });

      // уплотнение лотка (кроме кадра самого взрыва — там свой сценарий)
      if (!newMatch) {
        s.tray.forEach((id, i) => {
          if (F.state.get(id) === 'tray' && F.slotOf.get(id) !== i) {
            flyToSlot(id, i, true);
          }
        });
      }

      // перемешивание: волна переворотов по оставшимся плиткам
      if (s.shuffleSeq !== p.shuffleSeq) {
        const remaining = s.tiles.filter((t) => !t.removed);
        remaining.forEach((t, i) => {
          const el = els.current.get(t.id);
          if (!el || F.state.has(t.id)) return;
          el.style.animationDelay = `${Math.min(i * 5, 400)}ms`;
          el.classList.add('mj-shuffle-wave');
        });
        window.setTimeout(() => {
          remaining.forEach((t) => {
            const el = els.current.get(t.id);
            if (!el) return;
            el.classList.remove('mj-shuffle-wave');
            el.style.animationDelay = '';
          });
        }, 1050);
      }
    });
    return unsub;
  }, [flyToSlot, joinAndExplode, returnHome, firstFreeSlot]);

  // подсветка пары-подсказки (золотое свечение двух плиток)
  useEffect(() => {
    const unsub = useGame.subscribe((st, prev) => {
      const h = st.session?.hintPair ?? null;
      const ph = prev.session?.hintPair ?? null;
      if (h === ph) return;
      if (ph) ph.forEach((id) => els.current.get(id)?.classList.remove('mj-hint'));
      if (h) h.forEach((id) => els.current.get(id)?.classList.add('mj-hint'));
    });
    return unsub;
  }, []);

  // пересадка плиток лотка при ИЗМЕНЕНИИ РАЗМЕРА экрана.
  // Важно: зависимость только от size — bounds/geom пересчитываются
  // после каждого тапа (новый массив tiles), и тогда мгновенная
  // пересадка «телепортировала» бы летящую плитку в слот.
  const flyRef = useRef(flyToSlot);
  useEffect(() => {
    flyRef.current = flyToSlot;
  });
  useEffect(() => {
    if (size.w < 10) return;
    const F = fl.current;
    const s = useGame.getState().session;
    if (!s) return;
    requestAnimationFrame(() => {
      s.tray.forEach((id, i) => {
        if (F.state.get(id) === 'tray') flyRef.current(id, i, false);
      });
    });
  }, [size]);

  /* ------------------ жесты ------------------ */

  const gs = useRef({
    active: false,
    pid: -1,
    x0: 0,
    y0: 0,
    t0: 0,
    id: -1,
    el: null as HTMLDivElement | null,
    peek: false,
    timer: 0,
    moved: 0,
    baseZ: '',
  });

  const tileIdFrom = (target: EventTarget | null): number | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-tile-id]');
    if (!el) return null;
    const id = Number(el.getAttribute('data-tile-id'));
    return Number.isFinite(id) ? id : null;
  };

  const beginPeek = () => {
    const g = gs.current;
    if (g.peek || !g.el) return;
    g.peek = true;
    g.el.classList.add('mj-peek');
    g.el.style.zIndex = '8000';
    playPeek();
    buzz(12);
  };

  const endPeek = () => {
    const g = gs.current;
    const el = g.el;
    if (!el) return;
    el.classList.remove('mj-peek');
    el.style.transition = 'transform .34s cubic-bezier(.2,1.5,.4,1)';
    el.style.transform = '';
    const bz = g.baseZ;
    setTimeout(() => {
      el.style.transition = '';
      if (el.style.zIndex === '8000') el.style.zIndex = bz;
    }, 380);
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (gs.current.active) return;
      const s = useGame.getState().session;
      if (!s || s.status !== 'play' || s.pendingLose) return;
      const id = tileIdFrom(e.target);
      if (id == null) return;
      if (fl.current.state.has(id)) return; // уже в лотке
      const el = els.current.get(id);
      if (!el) return;
      try {
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      const g = gs.current;
      g.active = true;
      g.pid = e.pointerId;
      g.x0 = e.clientX;
      g.y0 = e.clientY;
      g.t0 = performance.now();
      g.id = id;
      g.el = el;
      g.peek = false;
      g.moved = 0;
      g.baseZ = el.style.zIndex || '';
      g.timer = window.setTimeout(beginPeek, PEEK_HOLD_MS);
    },
    [],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gs.current;
    if (!g.active || e.pointerId !== g.pid || !g.el) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    g.moved = Math.max(g.moved, Math.hypot(dx, dy));
    if (!g.peek && g.moved > 14) {
      window.clearTimeout(g.timer);
      beginPeek();
    }
    if (g.peek) {
      const px = clamp(dx, -PEEK_MAX_X, PEEK_MAX_X);
      const py = clamp(dy, PEEK_MIN_Y, PEEK_MAX_Y);
      g.el.style.transition = 'none';
      g.el.style.transform = `translate(${px}px, ${py}px) scale(1.08) rotate(${px * 0.03}deg)`;
    }
  }, []);

  const finishGesture = useCallback(
    (e: React.PointerEvent, cancelled: boolean) => {
      const g = gs.current;
      if (!g.active || e.pointerId !== g.pid) return;
      window.clearTimeout(g.timer);
      const quick = performance.now() - g.t0 < 360 && g.moved < 14;
      if (g.peek) {
        endPeek();
      } else if (quick && !cancelled && g.id >= 0) {
        tapTile(g.id);
      }
      g.active = false;
      g.el = null;
      g.id = -1;
      g.pid = -1;
      g.peek = false;
      g.timer = 0;
    },
    [tapTile],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => finishGesture(e, false),
    [finishGesture],
  );
  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => finishGesture(e, true),
    [finishGesture],
  );

  /* ------------------ отрисовка ------------------ */

  const left = geom ? (size.w - geom.boardW) / 2 : 0;
  const top = geom ? (size.h - geom.boardH) / 2 : 0;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {geom && (
        <div
          ref={innerRef}
          className="absolute"
          style={{
            left,
            top,
            width: geom.boardW,
            height: geom.boardH,
          }}
        >
          {visuals.map((v) => (
            <Tile key={`${sid}-${v.tile.id}`} v={v} registerEl={registerEl} />
          ))}
        </div>
      )}
    </div>
  );
}
