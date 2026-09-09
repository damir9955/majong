'use client';

/**
 * Плитка доски: классическая «костяшка» — мятно-зелёное тело
 * с заметной толщиной (боковая грань) и светлая грань с тонкой
 * тёмно-зелёной рамкой (рисуется в TileFace). Позиционированием
 * и полётами управляет Board напрямую через DOM (React не пишет
 * transform/transition/display). Занятые плитки НИЧЕМ не выделены.
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
    v.concealed ? 'concealed' : '',
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
        // «настоящая» костяшка: тёплая кость, видимый боковой срез
        // (жёсткая серо-кремовая кромка снизу = толщина), мягкий
        // контакт с доской и широкая амбиентная тень
        boxShadow: `inset 0 1.5px 0 rgba(255,255,255,.72), inset 0 -2px 2px rgba(112,92,58,.22), 0 ${depth}px ${Math.max(2, depth * 0.35)}px 0 rgba(118,106,88,.62), 0 ${depth + 3}px ${depth * 7}px rgba(0,0,0,.28)`,
        animationDelay: `${v.enterDelay}ms`,
      }}
    >
      <div className="mj-flipper">
        <div className="mj-face" style={{ borderRadius: radius * 0.78 }}>
          <TileFace defId={tile.defId} />
        </div>
        <div className="mj-back" style={{ borderRadius: radius }} />
      </div>
    </div>
  );
}

export const Tile = memo(TileInner);
