'use client';

/**
 * Плитка доски: объёмная «костяная» грань + анимации входа,
 * «занято» и подсказка. Позиционированием и полётами управляет
 * Board напрямую через DOM (React не пишет transform/transition/display).
 * Занятые плитки НИЧЕМ не выделены — где ход, игрок ищет сам.
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
}

interface Props {
  v: TileVisual;
  registerEl: (id: number, el: HTMLDivElement | null) => void;
}

function TileInner({ v, registerEl }: Props) {
  const { tile } = v;
  const def = getTileDef(tile.defId);
  const radius = Math.max(5, v.width * 0.12);
  const depth = Math.max(2, v.width * 0.09);

  const cls = [
    'mj-tile',
    v.entering ? 'mj-enter' : '',
    v.invalid ? 'mj-invalid' : '',
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
      aria-label={def.name}
      className={cls}
      style={{
        position: 'absolute',
        left: v.left,
        top: v.top,
        width: v.width,
        height: v.height,
        zIndex: v.zIndex,
        borderRadius: radius,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.9), inset ${-depth * 0.5}px ${-depth}px 0 rgba(148,128,88,.4), 0 ${depth}px ${depth}px 0 rgba(120,104,72,.6), 0 ${depth + 3}px ${depth + 8}px rgba(0,0,0,.3)`,
        animationDelay: `${v.enterDelay}ms`,
      }}
    >
      <div className="mj-face" style={{ borderRadius: radius * 0.72 }}>
        <TileFace defId={tile.defId} />
      </div>
    </div>
  );
}

export const Tile = memo(TileInner);
