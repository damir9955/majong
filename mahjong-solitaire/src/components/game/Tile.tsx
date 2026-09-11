'use client';

/**
 * Плитка доски = ФОТО-КАРТИНКА (Task 25): настоящий снимок кости
 * заливает всю плитку, рисованного тела больше нет. Сверху — лишь
 * лёгкая тень по краям (белое не сливается) и мягкий контакт со
 * столом. Позиционированием и полётами управляет Board напрямую
 * через DOM (React не пишет transform/transition/display). Занятые
 * плитки НИЧЕМ не выделены.
 *
 * 3D-БЛОК (Task 28): у ОТКРЫТЫХ плиток есть нижняя и правая
 * грань (свет сверху-слева — как на реальном фото костей):
 * нижняя тёплая терракотовая, правая темнее. Плитки, накрытые
 * костью сверху (covered), граней НЕ показывают — они «в стене»,
 * вместо этого несут лёгкое затемнение от лежащей сверху кости:
 * сразу видно, кто на каком уровне.
 *
 * Рубашка: concealed=true — плитка лежит лицом вниз (тёмная
 * «ткань» с золотым орнаментом). Переворот — 3D-поворот
 * .mj-flipper (грань и рубашка с backface-visibility).
 */

import { memo } from 'react';
import { TileFace } from './TileFace';
import type { TileInstance } from '@/lib/mahjong/engine';
import { getTileDef } from '@/lib/mahjong/tiles';

export interface TileVisual {
  tile: TileInstance;
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
  /** тап по занятой — «занято» */
  invalid: boolean;
  /** идёт каскадное появление доски */
  entering: boolean;
  /** задержка анимации появления */
  enterDelay: number;
  /** плитка лежит рубашкой вверх */
  concealed: boolean;
  /** плитка уже покинула доску и лоток (взорвалась) — скрыта */
  gone: boolean;
  /** сверху лежит другая кость: граней нет, лёгкое затемнение */
  covered: boolean;
}

interface Props {
  v: TileVisual;
  registerEl: (id: number, el: HTMLDivElement | null) => void;
}

function TileInner({ v, registerEl }: Props) {
  const { tile } = v;
  const def = getTileDef(tile.defId);
  const radius = Math.max(5, v.width * 0.11);
  const depth = Math.max(2, v.width * 0.062);

  const cls = [
    'mj-tile',
    v.concealed ? 'concealed' : '',
    v.entering ? 'mj-enter' : '',
    v.invalid ? 'mj-invalid' : '',
    v.covered ? 'mj-covered' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={(el) => {
        registerEl(tile.id, el);
      }}
      data-tile-id={tile.id}
      role="button"
      aria-label={v.concealed ? 'Закрытая плитка' : def.name}
      className={cls}
      style={{
        position: 'absolute',
        left: v.left,
        top: v.top,
        width: v.width,
        height: v.height,
        zIndex: v.zIndex,
        borderRadius: radius,
        display: v.gone ? 'none' : undefined,
        // лёгкая кромка по краю картинки + контакт блока со столом
        // (тень ложится ПОД нижнюю грань) + спокойное широкое
        // затенение вокруг
        boxShadow: v.covered
          ? `inset 0 0 0 1px rgba(56,45,26,.14), 0 ${Math.max(1, depth * 0.3)}px ${Math.max(2, depth * 0.7)}px rgba(0,0,0,.18)`
          : `inset 0 0 0 1px rgba(56,45,26,.16), 0 ${Math.max(2, depth * 0.7)}px ${Math.max(3, depth * 1.5)}px rgba(0,0,0,.26), 0 ${depth * 1.6}px ${depth * 5}px rgba(0,0,0,.18)`,
        animationDelay: `${v.enterDelay}ms`,
      }}
    >
      {/* 3D-блок: правая, нижняя и угловая грани — только у плиток,
          сверху которых ничего не лежит (открытые «поверхностные»
          кости). Накрытые — без граней, со лёгкой тенью сверху */}
      {!v.covered && (
        <>
          <div
            className="mj-side mj-side-r"
            style={{ width: depth, borderRadius: `0 ${radius}px 0 0` }}
            aria-hidden="true"
          />
          <div
            className="mj-side mj-side-b"
            style={{ height: depth, borderRadius: `0 0 0 ${radius}px` }}
            aria-hidden="true"
          />
          <div
            className="mj-side mj-side-c"
            style={{ width: depth, height: depth, borderRadius: `0 0 ${radius}px 0` }}
            aria-hidden="true"
          />
        </>
      )}
      <div className="mj-flipper">
        <div className="mj-face" style={{ borderRadius: radius }}>
          <TileFace defId={tile.defId} />
        </div>
        <div className="mj-back" style={{ borderRadius: radius }} />
      </div>
      {/* затемнение от кости, лежащей сверху: чуть заметная тень
          сверху-слева, к открытому краю сходит на нет — уровни
          стопки читаются с первого взгляда */}
      {v.covered && (
        <div
          className="mj-cover-shade"
          style={{ borderRadius: radius }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export const Tile = memo(TileInner);
