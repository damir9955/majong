'use client';

/**
 * ФОТОРЕАЛИСТИЧНЫЕ грани плиток (Task 24).
 *
 * Раньше грани рисовались SVG-примитивами — выходило «по-детски».
 * Теперь каждая из 41 грани — СНИМОК настоящей костяной поверхности
 * с выгравированными/нарисованными символами (AI-генерация, каждая
 * проверена VLM: счёт кружков/бамбука, правильность иероглифов).
 *
 *  — файлы: public/tiles/<defId>.webp (432x576, WebP q82);
 *  — геометрию (скругление, фаску, тень, толщину) рисует CSS
 *    (.mj-tile/.mj-face в globals.css) — все плитки идеально
 *    совпадают по размеру, а «настоящесть» даёт фотография;
 *  — цветы и сезоны — ФОТОдекали (настоящие листья и цветы,
 *    как на современных костяных наборах);
 *  — старый сейв с исчезнувшим видом — «пустая кость» (без вылета),
 *    недоступный файл — тихий фолбэк на кость;
 *  — все 41 картинка пре-лоадятся при первой загрузке модуля:
 *    к старту партии грани уже в кеше браузера.
 */

import { memo, useState } from 'react';
import { TILE_DEFS, hasTileDef } from '@/lib/mahjong/tiles';

/** путь к арту грани (public/tiles) */
export function tileArtUrl(defId: string): string {
  return `/tiles/${defId}.webp`;
}

/* прелоад всех граней — один раз на сессию */
if (typeof window !== 'undefined') {
  for (const d of TILE_DEFS) {
    const img = new Image();
    img.decoding = 'async';
    img.src = tileArtUrl(d.id);
  }
}

function TileFaceInner({ defId }: { defId: string }) {
  const [failed, setFailed] = useState(false);
  // старое сохранение с исчезнувшим видом плитки — «пустая кость»
  // (getTileDef самолечится, но арта для неизвестного id нет)
  const known = hasTileDef(defId);
  if (!known || failed) {
    return <div className="mj-art mj-art-plain" aria-hidden="true" />;
  }
  return (
    <img
      className="mj-art"
      src={tileArtUrl(defId)}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export const TileFace = memo(TileFaceInner);
