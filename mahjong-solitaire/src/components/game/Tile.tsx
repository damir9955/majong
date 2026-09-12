'use client';

/**
 * Плитка доски = ФОТО-КАРТИНКА (Task 25): настоящий снимок кости
 * заливает всю плитку, рисованного тела больше нет. Сверху — лишь
 * лёгкая тень по краям (белое не сливается) и мягкий контакт со
 * столом. Позиционированием и полётами управляет Board напрямую
 * через DOM (React не пишет transform/transition/display). Занятые
 * плитки НИЧЕМ не выделены.
 *
 * Фидбек «ужасные края вернулись»: выступающие 3D-грани (терракотовая
 * нижняя + коричневая правая, Task 28) УБРАНЫ — плитка снова
 * чистое фото кости от края до края, как в одобренном виде Task 27.
 * Уровни стопки читаются по затемнению накрытых плиток.
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
        // тонкая кромка по краю картинки (белое не сливается) +
        // мягкий контакт со столом — без выступающих граней
        // (фидбек «ужасные края»: 3D-грани Task 28 убраны)
        boxShadow: v.covered
          ? `inset 0 0 0 1px rgba(56,45,26,.14), 0 1px 3px rgba(0,0,0,.20)`
          : `inset 0 0 0 1px rgba(56,45,26,.16), 0 2px 4px rgba(0,0,0,.22), 0 7px 16px rgba(0,0,0,.16)`,
        animationDelay: `${v.enterDelay}ms`,
      }}
    >
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
