'use client';

/**
 * Плитка доски = ФОТО-КАРТИНКА (Task 25): настоящий снимок кости
 * заливает всю плитку, рисованного тела больше нет. Сверху — лишь
 * лёгкая тень по краям (белое не сливается) и мягкий контакт со
 * столом. Позиционированием и полётами управляет Board напрямую
 * через DOM (React не пишет transform/transition/display). Занятые
 * плитки НИЧЕМ не выделены.
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
  const radius = Math.max(5, v.width * 0.11);
  const depth = Math.max(2, v.width * 0.06);

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
        // лёгкая тень по краям картинки-плитки: тонкая кромка
        // (белое по белому не сливается) + мягкий контакт со столом
        // + широкое спокойное затенение под плиткой
        boxShadow: `inset 0 0 0 1px rgba(56,45,26,.16), 0 ${Math.max(1, depth * 0.35)}px ${Math.max(2, depth * 0.9)}px rgba(0,0,0,.24), 0 ${depth + 4}px ${depth * 6}px rgba(0,0,0,.20)`,
        animationDelay: `${v.enterDelay}ms`,
      }}
    >
      <div className="mj-flipper">
        <div className="mj-face" style={{ borderRadius: radius }}>
          <TileFace defId={tile.defId} />
        </div>
        <div className="mj-back" style={{ borderRadius: radius }} />
      </div>
    </div>
  );
}

export const Tile = memo(TileInner);
