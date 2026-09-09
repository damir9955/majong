'use client';

/**
 * Доска: авто-масштаб раскладки, жесты и полёты плиток.
 *
 * Жесты:
 *  — короткий тап по свободной плитке — она улетает в лоток;
 *  — удержание (300 мс) или сдвиг пальцем — плитка поднимается
 *    и следует за пальцем: можно отодвинуть и посмотреть,
 *    что под ней (только СВОБОДНЫЕ плитки — зажатые не поддаются);
 *  — тап по занятой плитке — «занято» (тряска). Какие плитки
 *    свободны — нигде не подсвечивается, игрок ищет сам.
 *
 * Лоток — одна зона ровно на 4 плитки с виртуальными позициями:
 *  — ПАРА ДЕРЖИТ ДВЕ СОСЕДНИЕ ЯЧЕЙКИ: житель — в своей, прилетевшая —
 *    в следующую (классические «1 и 2» или «3 и 4»);
 *  — обе съезжаются в точку между ячейками — соединяются в одну
 *    кость и взрываются там;
 *  — ячейки взрывающейся пары ЗАРЕЗЕРВИРОВАНЫ ДО ПОЛНОГО КОНЦА
 *    взрыва: новые плитки летят только в СВОБОДНЫЕ ячейки (3 и 4,
 *    пока 1 и 2 взрываются) и не наезжают на взрыв;
 *  — когда взрыв полностью закончился, остаток тихонько
 *    соскальзывает на освободившиеся ячейки.
 *
 * Полёт ОБЫЧНЫЙ: одно плавное скольжение из доски в слот —
 * без подскока, поворотов и следов-фантомов.
 *
 * Полёты и взрывы реализованы напрямую через DOM
 * (transform/transition/display), React не трогает эти свойства.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame, type Session } from '@/lib/game/store';
import { layoutBounds } from '@/lib/mahjong/layouts';
import { isFree, buildOccupancy } from '@/lib/mahjong/engine';
import { Tile, type TileVisual } from './Tile';
import { slotRect, TRAY_CAP } from '@/lib/game/traySlots';
import { sparkle, ring, flash, glow } from '@/lib/game/fx';
import { buzz, playBoom, playPeek } from '@/lib/sound';

const LAYER_OFF_X = 0.08; // доля ширины плитки — едва заметный сдвиг слоя
const LAYER_OFF_Y = 0.08; // слои стоят почти ровно, стопка читается
const TILE_RATIO = 1.28; // высота плитки к ширине
const MAX_TILE_W = 168; // на планшете/десктопе плитки крупнее
const RESERVE_MS = 160; // страховка после взрыва до освобождения ячеек

const FLIGHT_MS = 420; // обычный полёт доска → лоток одним скольжением
const TRAY_MS = 300; // спокойные сдвиги внутри лотка
const JOIN_MS = 260; // соединение пары в лотке
const BOOM_MS = 520; // взрыв пары
const FLIP_MS = 460; // переворот рубашки — полёт начинается ПОСЛЕ него
const PEEK_HOLD_MS = 300; // удержание до поднятия плитки
const PEEK_MAX_X = 120;
const PEEK_MIN_Y = -170;
const PEEK_MAX_Y = 70;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** была ли плитка рубашкой вверх в ПРЕДЫДУЩЕМ состоянии партии —
 *  тогда перед полётом ей нужно сначала развернуться (FLIP_MS) */
function wasConcealed(sess: Session | null | undefined, id: number): boolean {
  if (!sess) return false;
  if (sess.faceDownIds.includes(id)) {
    return sess.peekId !== id && !sess.revealedIds.includes(id);
  }
  if (sess.buriedIds.includes(id)) return !sess.revealedIds.includes(id);
  return false;
}

type FlightState = 'tray' | 'joining' | 'gone';

interface FlightCtrl {
  sid: number;
  /** виртуальная позиция плитки в зоне лотка */
  posOf: Map<number, number>;
  state: Map<number, FlightState>;
  baseZ: Map<number, string>;
  matchedSeq: number;
  /** таймеры этапов полёта конкретной плитки */
  flyTimers: Map<number, number[]>;
  /** плитки, которые сейчас переворачиваются перед полётом
   *  (чтобы повторный тап не запланировал второй полёт) */
  pendingFlip: Set<number>;
}

export function Board() {
  const session = useGame((s) => s.session);
  const tapTile = useGame((s) => s.tapTile);
  const sid = session?.sid ?? -1;
  const tiles = session?.tiles;
  const invalidId = session?.invalidId;
  const faceDownIds = session?.faceDownIds;
  const buriedIds = session?.buriedIds;
  const revealedIds = session?.revealedIds;
  const peekId = session?.peekId;

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
    // БОКОВЫЕ ПОЛЯ — совсем узкие (расклады не шире 6 плиток,
    // крупнее сами кости): телефон ~3%, планшет до 24px
    const padX = Math.min(24, Math.max(6, size.w * 0.03));
    const padY = Math.min(10, Math.max(4, size.h * 0.008));
    const xSpan = bounds.maxX - bounds.minX; // в юнитах (плитка = 2)
    const ySpan = bounds.maxY - bounds.minY;
    const availW = size.w - padX * 2;
    const availH = size.h - padY * 2;
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

  const concealedSet = useMemo(() => {
    const m = new Set<number>();
    // свободные рубашки: закрыты, кроме текущей подглядки (peekId)
    // и уже открытых навсегда (revealedIds — в т.ч. улетающие в лоток:
    // кость летит и взрывается ЛИЦОМ ВВЕРХ, не рубашкой)
    if (faceDownIds) {
      for (const id of faceDownIds) {
        if (id !== peekId && !revealedIds?.includes(id)) m.add(id);
      }
    }
    // закопанные рубашки: закрыты, пока не открылись сами
    if (buriedIds) {
      for (const id of buriedIds) {
        if (!revealedIds?.includes(id)) m.add(id);
      }
    }
    return m;
  }, [faceDownIds, buriedIds, revealedIds, peekId]);

  /* ------------------ контроллер полётов (refs) ------------------ */

  const els = useRef(new Map<number, HTMLDivElement>());
  const registerEl = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  }, []);

  const fl = useRef<FlightCtrl>({
    sid: -1,
    posOf: new Map(),
    state: new Map(),
    baseZ: new Map(),
    matchedSeq: 0,
    flyTimers: new Map(),
    pendingFlip: new Set(),
  });

  const visuals = useMemo<TileVisual[]>(() => {
    if (!tiles || !bounds || !geom) return [];
    // «живые» плитки: лоток + ТЕКУЩАЯ взрывающаяся пара + всё, чем
    // ещё владеет контроллер полётов (пары, взрывающиеся ПОСЛЕ
    // нового матча, тоже видны до полного конца взрыва)
    const live = new Set(session?.tray ?? []);
    const mp = session?.matchedPair;
    if (mp) {
      live.add(mp[0]);
      live.add(mp[1]);
    }
    const animating = fl.current.state;
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
      concealed: concealedSet.has(t.id),
      gone: t.removed && !live.has(t.id) && !animating.has(t.id),
    }));
  }, [tiles, bounds, geom, invalidId, enterOrder, entering, concealedSet, session?.tray, session?.matchedPair]);

  /* ------------------ полёты, соединение и взрывы ------------------ */

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
    (
      id: number,
      cx: number,
      cy: number,
      scale: number,
      ms: number,
      ease = 'cubic-bezier(.3,.75,.35,1)',
    ) => {
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
   * Полёт в виртуальную позицию зоны лотка: обычное плавное
   * скольжение одним движением. CSS-анимации входа/перемешивания
   * заранее гасятся, иначе они перекрывают transform.
   */
  const flyToTray = useCallback(
    (id: number, pos: number, animate = true, ms = FLIGHT_MS) => {
      const el = els.current.get(id);
      const sr = slotRect(pos);
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
        F.posOf.set(id, pos);
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

      // одно спокойное скольжение — без подскока и поворотов
      el.style.transition = `transform ${ms}ms cubic-bezier(.3,.75,.35,1)`;
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
      addFlyTimer(
        id,
        window.setTimeout(() => {
          if (fl.current.state.get(id) === 'tray') el.style.transition = '';
        }, ms + 80),
      );
      F.posOf.set(id, pos);
      F.state.set(id, 'tray');
    },
    [placeAt, clearFlyTimers, addFlyTimer],
  );

  /** первая свободная позиция зоны: занято всё, что имеет позицию —
   *  одиночки, соединяющиеся пары и ЯЧЕЙКИ ВЗРЫВАЮЩИХСЯ пар
   *  (резерв держится до полного конца взрыва) */
  const firstFreePos = useCallback(() => {
    const used = new Set<number>();
    fl.current.posOf.forEach((pos) => used.add(pos));
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }, []);

  /** база пары: две СВОБОДНЫЕ соседние ячейки — житель и прилетевшая
   *  встают рядом, как классические ячейки 1-2 или 3-4 */
  const pairBasePos = useCallback(() => {
    const used = new Set<number>();
    fl.current.posOf.forEach((pos) => used.add(pos));
    for (let b = 0; b < TRAY_CAP; b++) {
      if (!used.has(b) && !used.has(b + 1)) return b;
    }
    return -1;
  }, []);

  /** ячейку держит взрывающаяся/соединяющаяся пара (не одиночка)? */
  const cellBlocked = useCallback((b: number) => {
    const F = fl.current;
    let blocked = false;
    F.posOf.forEach((pos, id) => {
      if (pos === b && F.state.get(id) !== 'tray') blocked = true;
    });
    return blocked;
  }, []);

  /** пересадить одиночку, занимающую ячейку пары, на свободное место */
  const makeRoomFor = useCallback(
    (base: number, a: number, b: number) => {
      const F = fl.current;
      const s = useGame.getState().session;
      if (!s) return;
      const used = new Set<number>();
      F.posOf.forEach((pos, id) => {
        if (id !== a && id !== b) used.add(pos);
      });
      used.add(base);
      used.add(base + 1);
      for (const id of s.tray) {
        if (id === a || id === b) continue;
        const pos = F.posOf.get(id);
        if (F.state.get(id) === 'tray' && (pos === base || pos === base + 1)) {
          let np = 0;
          while (used.has(np)) np++;
          flyToTray(id, np, true, TRAY_MS);
          used.add(np);
        }
      }
    },
    [flyToTray],
  );

  /**
   * ОЧЕРЕДЬ: если все 4 позиции заняты (взрывается пара),
   * новая плитка НЕ лезет наверх и не перекрывает взрыв —
   * она тихонько ждёт на доске и летит, как только слот
   * освободится (взрывы проходят «по очереди»).
   */
  const queueFlight = useCallback(
    (id: number, sid: number) => {
      const started = performance.now();
      const tick = () => {
        const F = fl.current;
        if (F.sid !== sid) return; // партия сменилась
        if (F.state.has(id)) return; // уже улетела (в паре)
        const s = useGame.getState().session;
        if (!s || s.sid !== sid || !s.tray.includes(id)) return; // вернули на доску
        const free = firstFreePos();
        if (free < TRAY_CAP) {
          flyToTray(id, free, true, FLIGHT_MS);
          return;
        }
        // страховка: совсем без свободных — летим сверху (редкий случай)
        if (performance.now() - started > 3000) {
          flyToTray(id, firstFreePos(), true, FLIGHT_MS);
          return;
        }
        window.setTimeout(tick, 130);
      };
      window.setTimeout(tick, 170);
    },
    [flyToTray, firstFreePos],
  );

  /**
   * Остаток лотка тихонько соскальзывает на освободившиеся
   * позиции. Вызывается ТОЛЬКО когда взрыв пары полностью
   * закончился и её ячейки освобождились — никто не наезжает
   * на взрыв.
   */
  const compactTray = useCallback(() => {
    const F = fl.current;
    const s = useGame.getState().session;
    if (!s) return;
    const used = new Set<number>();
    F.posOf.forEach((pos, id) => {
      if (F.state.get(id) !== 'tray') used.add(pos);
    });
    let next = 0;
    const takePos = () => {
      while (used.has(next)) next++;
      return next++;
    };
    s.tray.forEach((id) => {
      if (F.state.get(id) !== 'tray') return;
      const target = takePos();
      if (F.posOf.get(id) !== target) {
        flyToTray(id, target, true, TRAY_MS);
      }
    });
  }, [flyToTray]);

  /**
   * Пара: житель и прилетевшая стоят в СВОИХ ячейках (base и base+1 —
   * классические «1 и 2»), потом мягко съезжаются в точку между
   * ячейками — СОЕДИНЯЮТСЯ В ОДНУ кость, светлеют и взрываются там.
   * Ячейки пары ЗАРЕЗЕРВИРОВАНЫ ДО ПОЛНОГО КОНЦА ВЗРЫВА: новые
   * плитки летят в свободные ячейки (3 и 4, пока 1 и 2 взрываются)
   * и не наезжают на взрыв. Освобождение ячеек — только после
   * полного конца взрыва, затем компакт лотка.
   */
  const pairExplode = useCallback(
    (resident: number, arriving: number, waitMs: number, base: number) => {
      const F = fl.current;
      window.setTimeout(() => {
        const elR = els.current.get(resident);
        const elA = els.current.get(arriving);
        const s1 = slotRect(base);
        const s2 = slotRect(base + 1);
        if (!elR || !elA || !s1 || !s2) return;
        const rr = elR.getBoundingClientRect();
        const ar = elA.getBoundingClientRect();
        const wR = parseFloat(elR.style.width || '0');
        const wA = parseFloat(elA.style.width || '0');
        const kR = wR ? rr.width / wR : 1;
        const kA = wA ? ar.width / wA : 1;
        // точка соединения: середина между ячейками base и base+1
        const mx = (s1.left + s1.width / 2 + s2.left + s2.width / 2) / 2;
        const my = (s1.top + s1.height / 2 + s2.top + s2.height / 2) / 2;
        const slotH = Math.max(s1.height, s2.height);

        // соединение: обе съезжаются в одну точку — «стали в одну кость»
        elR.classList.add('mj-joining');
        elA.classList.add('mj-joining');
        placeAt(resident, mx, my, kR * 1.06, JOIN_MS, 'cubic-bezier(.4,.1,.3,1)');
        placeAt(arriving, mx, my, kA * 1.06, JOIN_MS, 'cubic-bezier(.4,.1,.3,1)');
        for (const el of [elR, elA]) {
          el.animate(
            [
              { filter: 'brightness(1.05)' },
              { filter: 'brightness(1.4) saturate(1.1)' },
            ],
            { duration: Math.max(JOIN_MS, 260), easing: 'ease-in', fill: 'forwards' },
          );
        }

        // взрыв: соединённая пара мягко оседает чуть ниже ряда
        // (лоток сверху) и растворяется с увеличением
        window.setTimeout(() => {
          const lift = slotH * 0.35;
          const inner = innerRef.current;
          for (const id of [resident, arriving]) {
            const el = els.current.get(id);
            if (!el || !inner) continue;
            clearFlyTimers(id);
            F.state.set(id, 'gone'); // ячейки ещё ДЕРЖИМ — резерв
            const rect = el.getBoundingClientRect();
            const w = parseFloat(el.style.width || '0');
            const h = parseFloat(el.style.height || '0');
            const k = w ? rect.width / w : 1;
            // КОНЕЧНЫЙ офсет считается от layout-позиции плитки
            // (style.left/top + inner), а НЕ от текущей точки —
            // иначе пара «уплывала» обратно к доске во время взрыва
            const base = inner.getBoundingClientRect();
            const nx = base.left + parseFloat(el.style.left || '0') + w / 2;
            const ny = base.top + parseFloat(el.style.top || '0') + h / 2;
            const cur = el.style.transform || 'translate(0px, 0px)';
            el.style.transition = 'none';
            const anim = el.animate(
              [
                {
                  transform: cur,
                  opacity: 1,
                  filter: 'brightness(1.4)',
                },
                {
                  transform: `translate(${mx - nx}px, ${my + lift - ny}px) scale(${k * 1.55})`,
                  opacity: 0,
                  filter: 'brightness(2.1)',
                },
              ],
              {
                duration: BOOM_MS,
                easing: 'cubic-bezier(.2,.6,.3,1)',
                fill: 'forwards',
              },
            );
            anim.onfinish = () => {
              el.style.display = 'none';
              el.classList.remove('mj-joining');
            };
            // страховка от «зависшей» плитки (фоновая вкладка)
            addFlyTimer(
              id,
              window.setTimeout(() => {
                el.style.display = 'none';
                el.classList.remove('mj-joining');
              }, BOOM_MS + 200),
            );
          }
          ring(mx, my + lift);
          flash(mx, my + lift);
          glow(mx, my + lift);
          sparkle(mx, my + lift, 20);
          playBoom();
          buzz(20);
          // ПОЛНЫЙ конец взрыва: только теперь ячейки пары
          // освобождаются — и остаток соскальзывает на них
          addFlyTimer(
            resident,
            window.setTimeout(() => {
              F.posOf.delete(resident);
              F.posOf.delete(arriving);
              F.state.delete(resident);
              F.state.delete(arriving);
              compactTray();
            }, BOOM_MS + RESERVE_MS),
          );
        }, JOIN_MS + 60);
      }, waitMs + 60);
    },
    [placeAt, clearFlyTimers, addFlyTimer, compactTray],
  );

  const returnHome = useCallback(
    (id: number) => {
      const el = els.current.get(id);
      if (!el) return;
      const F = fl.current;
      clearFlyTimers(id);
      F.state.delete(id);
      F.posOf.delete(id);
      el.classList.remove('mj-joining');
      el.style.transition = `transform ${FLIGHT_MS}ms cubic-bezier(.3,.75,.35,1)`;
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
    // ВАЖНО: доска монтируется уже ПОСЛЕ создания сессии (экран режимов).
    // Синхронизируем контроллер с текущей партией при подписке — иначе
    // первый тап попадёт в ветку «новая доска» и плитка не улетит в лоток.
    const cur = useGame.getState().session;
    if (cur && fl.current.sid !== cur.sid) {
      fl.current.sid = cur.sid;
      fl.current.matchedSeq = cur.matchedSeq;
    }
    const unsub = useGame.subscribe((st, prev) => {
      const s = st.session;
      const p = prev.session;
      if (!s) return;
      const F = fl.current;

      if (!p || s.sid !== F.sid || s.sid !== p.sid) {
        // новая доска — сброс контроллера
        F.flyTimers.forEach((timers) => timers.forEach((t) => window.clearTimeout(t)));
        F.sid = s.sid;
        F.posOf.clear();
        F.state.clear();
        F.baseZ.clear();
        F.flyTimers.clear();
        F.pendingFlip.clear();
        F.matchedSeq = s.matchedSeq;
        return;
      }

      // ПАРА: житель — одиночка лотка, прилетевшая — с доски (или
      // peek-пара с доски). Обе встают в СВОИ соседние ячейки
      // (житель — в своей, прилетевшая — в следующую), потом
      // съезжаются, соединяются и взрываются; ячейки держатся
      // до ПОЛНОГО конца взрыва — новые плитки идут в ячейки 3-4
      //
      // ПЕРЕВЁРНУТАЯ кость СНАЧАЛА РАЗВОРАЧИВАЕТСЯ на своём месте
      // (3D-флип) и только ПОТОМ улетает — не рубашкой вверх.
      const newMatch = s.matchedSeq !== F.matchedSeq ? s.matchedPair : null;
      if (newMatch) {
        F.matchedSeq = s.matchedSeq;
        const [resident, arriving] = newMatch;
        const residentFlying =
          F.state.has(resident) && F.state.get(resident) === 'tray';
        // сразу помечаем пару «владением контроллера»: плитки не
        // исчезнут с экрана, пока идёт переворот-задержка или очередь
        F.state.set(resident, 'joining');
        F.state.set(arriving, 'joining');
        const beginPair = (base: number) => {
          // одиночку из ячейки base+1 тихонько пересаживаем
          makeRoomFor(base, resident, arriving);
          flyToTray(resident, base, true, residentFlying ? TRAY_MS : FLIGHT_MS);
          flyToTray(arriving, base + 1, true, FLIGHT_MS);
          F.state.set(resident, 'joining');
          F.state.set(arriving, 'joining');
          const elA = els.current.get(arriving);
          if (elA) elA.style.zIndex = '7100';
          const waitMs = residentFlying
            ? Math.max(FLIGHT_MS, TRAY_MS)
            : FLIGHT_MS + 80;
          pairExplode(resident, arriving, waitMs, base);
        };
        // база: житель лотка остаётся в СВОЕЙ ячейке, прилетевшая —
        // в следующую; из доски — первая пара свободных соседних ячеек
        const pickBase = () =>
          residentFlying
            ? (F.posOf.get(resident) ?? pairBasePos())
            : pairBasePos();
        const baseOk = (b: number) =>
          b >= 0 && b < TRAY_CAP && !cellBlocked(b + 1);
        const launch = () => {
          const base = pickBase();
          if (!baseOk(base)) {
            // соседних свободных ячеек нет (взрывы держат ряд) —
            // пару тоже отправляем в очередь: не наезжаем на взрыв
            const sid0 = s.sid;
            const t0 = performance.now();
            const tick = () => {
              if (fl.current.sid !== sid0) return;
              const b = pickBase();
              if (baseOk(b) || performance.now() - t0 > 2500) {
                beginPair(baseOk(b) ? b : Math.max(0, firstFreePos() - 1));
              } else {
                window.setTimeout(tick, 140);
              }
            };
            window.setTimeout(tick, 170);
          } else {
            beginPair(base);
          }
        };
        // рубашка в паре? даём ей развернуться (FLIP_MS), потом полёт
        const needFlip =
          wasConcealed(p, resident) || wasConcealed(p, arriving);
        if (needFlip) {
          const sid0 = s.sid;
          window.setTimeout(() => {
            if (fl.current.sid === sid0) launch();
          }, FLIP_MS);
        } else {
          launch();
        }
      }

      // новые плитки в лотке — первая СВОБОДНАЯ позиция;
      // если все 4 заняты взрывами — летим ПО ОЧЕРЕДИ, когда
      // освободится (перезаписи: очередь ждёт на доске).
      // Перевёрнутая кость сначала разворачивается на месте —
      // и только потом улетает в лоток лицом вверх.
      s.tray.forEach((id) => {
        if (!F.state.has(id) && !F.pendingFlip.has(id)) {
          const go = () => {
            F.pendingFlip.delete(id);
            const cur = useGame.getState().session;
            // плитку вернули на доску (отмена) или её уже забрала
            // пара — полёт не нужен
            if (
              F.state.has(id) ||
              !cur ||
              cur.sid !== s.sid ||
              !cur.tray.includes(id)
            ) {
              return;
            }
            const free = firstFreePos();
            if (free < TRAY_CAP) flyToTray(id, free, true, FLIGHT_MS);
            else queueFlight(id, s.sid);
          };
          if (wasConcealed(p, id)) {
            F.pendingFlip.add(id);
            window.setTimeout(go, FLIP_MS);
          } else {
            go();
          }
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
  }, [flyToTray, pairExplode, returnHome, firstFreePos, pairBasePos, cellBlocked, makeRoomFor, queueFlight]);

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
  // При ПЕРВОМ монтировании (size 0 → измерили) этот же эффект
  // восстанавливает лоток сохранённой партии: плитки мгновенно
  // расставляются по своим ячейкам, взорвавшиеся скрыты рендером.
  const flyRef = useRef(flyToTray);
  useEffect(() => {
    flyRef.current = flyToTray;
  });
  useEffect(() => {
    if (size.w < 10) return;
    const F = fl.current;
    const s = useGame.getState().session;
    if (!s) return;
    requestAnimationFrame(() => {
      s.tray.forEach((id, i) => {
        const st = F.state.get(id);
        if (st === 'tray') {
          flyRef.current(id, F.posOf.get(id) ?? 0, false);
        } else if (!st && i < TRAY_CAP) {
          // восстановление сохранённой партии: мгновенная расстановка
          flyRef.current(id, i, false);
        }
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
    /** свободную плитку можно поднять пальцем, зажатую — нет */
    liftable: false,
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
    if (g.peek || !g.el || !g.liftable) return;
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
    el.style.transition = 'transform .32s cubic-bezier(.3,.75,.35,1)';
    el.style.transform = '';
    const bz = g.baseZ;
    setTimeout(() => {
      el.style.transition = '';
      if (el.style.zIndex === '8000') el.style.zIndex = bz;
    }, 360);
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
      // поднять пальцем можно только СВОБОДНУЮ плитку
      const tile = s.tiles.find((t) => t.id === id);
      g.liftable = !!tile && isFree(tile, buildOccupancy(s.tiles));
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
      g.liftable = false;
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
