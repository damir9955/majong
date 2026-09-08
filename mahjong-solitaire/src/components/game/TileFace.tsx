'use client';

/**
 * SVG-грани плиток в классическом стиле (референс пользователя):
 *  — тонкая тёмно-зелёная рамка по периметру грани, как у настоящих
 *    костяшек, и пастельный фон СВОЙ у каждой масти — группы
 *    различаются с первого взгляда;
 *  — все иероглифы — ЗАЛИТЫЕ КОНТУРЫ (пути) из glyphs.ts: никаких
 *    <text>/шрифтов, значки видны на любом устройстве сразу;
 *  — кружки/бамбук — крупные простые знаки, цветы и сезоны —
 *    простые пиктограммы. Всё векторное, без внешних картинок.
 */

import { memo } from 'react';
import { getTileDef } from '@/lib/mahjong/tiles';
import { GLYPHS, WAN } from './glyphs';

/* классическая палитра знаков */
const BLUE = '#2b5d9e';
const RED = '#bf3a30';
const GREEN = '#2f7d4f';
const INK = '#2e3f51';
const IVORY = '#fbf7ec';

/* пастельные фоны мастей + рамка */
const FRAME = '#2c6a4e';
const BG: Record<string, string> = {
  dots: '#d7e7f5',
  bamboo: '#dcefdd',
  chars: '#f8f2e0',
  wind: '#f6ecc4',
  flower: '#f7dfe9',
  season: '#e5e0f5',
};
const DRAGON_BG = ['#f8dee1', '#ddf0e2', '#eef0f3'];

/** фон грани: пастель по масти + зелёная рамка по периметру */
function FaceBase({ bg }: { bg: string }) {
  return (
    <>
      <rect x="2.5" y="2.5" width="95" height="125" rx="7.5" fill={bg} />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="125"
        rx="7.5"
        fill="none"
        stroke={FRAME}
        strokeWidth="2.6"
      />
    </>
  );
}

/** иероглиф-контур из glyphs.ts (трансформация уже внутри) */
function Glyph({ ch, fill }: { ch: string; fill: string }) {
  const g = GLYPHS[ch];
  if (!g) return null;
  return <path d={g.d} transform={g.t} fill={fill} />;
}

/* ---------- Кружки: просто цветные кружки ---------- */

const DOT_COLS = [26, 50, 74];
const R3 = [32, 65, 98];

const DOT_PATTERNS: Record<number, [number, number][]> = {
  1: [[50, 65]],
  2: [[50, 45], [50, 85]],
  3: [[26, 32], [50, 65], [74, 98]],
  4: [[26, 40], [74, 40], [26, 90], [74, 90]],
  5: [[26, 40], [74, 40], [50, 65], [26, 90], [74, 90]],
  6: [
    [26, 32], [26, 65], [26, 98],
    [74, 32], [74, 65], [74, 98],
  ],
  7: [
    [50, 28],
    [26, 60], [74, 60],
    [26, 85], [50, 85], [74, 85],
    [26, 110], [74, 110],
  ],
  8: [
    [26, 30], [74, 30],
    [26, 55], [74, 55],
    [26, 80], [74, 80],
    [26, 105], [74, 105],
  ],
  9: [
    ...DOT_COLS.flatMap((x) => R3.map((y) => [x, y] as [number, number])),
  ],
};

function DotsFace({ n }: { n: number }) {
  // единица — один большой красный кружок, остальные — синие
  if (n === 1) {
    return (
      <g transform="translate(50 65) scale(1.28) translate(-50 -65)">
        <circle cx={50} cy={65} r={26} fill={RED} stroke={IVORY} strokeWidth={4} />
        <circle cx={50} cy={65} r={12} fill={IVORY} />
      </g>
    );
  }
  const pts = DOT_PATTERNS[n];
  const r = n <= 4 ? 12 : n === 5 ? 11 : 10;
  return (
    <g transform="translate(50 65) scale(1.2) translate(-50 -65)">
      {pts.map(([cx, cy], i) => {
        const isAccent =
          (n === 5 && i === 2) ||
          (n === 7 && i === 0) ||
          (n === 9 && cx === 50 && cy === 65);
        return (
          <circle
            key={`${cx}-${cy}-${i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill={isAccent ? RED : BLUE}
            stroke={IVORY}
            strokeWidth={3}
          />
        );
      })}
    </g>
  );
}

/* ---------- Бамбук: простые палочки ---------- */

function Stick({ cx, cy, h, color }: { cx: number; cy: number; h: number; color: string }) {
  const w = 15;
  return (
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={w * 0.35}
      fill={color}
    />
  );
}

const BAM_PATTERNS: Record<number, [number, number][]> = {
  2: [[50, 42], [50, 92]],
  3: [[50, 30], [34, 85], [66, 85]],
  4: [[34, 40], [66, 40], [34, 92], [66, 92]],
  5: [[33, 30], [67, 30], [50, 65], [33, 100], [67, 100]],
  6: [
    [29, 40], [50, 40], [71, 40],
    [29, 92], [50, 92], [71, 92],
  ],
  7: [
    [50, 25],
    [29, 62], [50, 62], [71, 62],
    [29, 104], [50, 104], [71, 104],
  ],
  8: [
    [33, 27], [67, 27],
    [33, 53], [67, 53],
    [33, 79], [67, 79],
    [33, 105], [67, 105],
  ],
  9: [
    [29, 28], [50, 28], [71, 28],
    [29, 65], [50, 65], [71, 65],
    [29, 102], [50, 102], [71, 102],
  ],
};

function BambooFace({ n }: { n: number }) {
  if (n === 1) {
    // бамбук-единица: одна простая жирная палочка с листиком
    return (
      <g transform="translate(50 65) scale(1.24) translate(-50 -65)">
        <Stick cx={50} cy={64} h={86} color={GREEN} />
        <path
          d="M58 44 Q 76 34 82 18 Q 60 24 55 40 Z"
          fill={GREEN}
          opacity={0.85}
        />
        <path
          d="M58 80 Q 76 90 82 106 Q 60 100 55 84 Z"
          fill={GREEN}
          opacity={0.6}
        />
      </g>
    );
  }
  const pts = BAM_PATTERNS[n];
  const h = n === 9 || n === 8 ? 26 : n === 7 || n === 6 ? 30 : 34;
  return (
    <g transform="translate(50 65) scale(1.2) translate(-50 -65)">
      {pts.map(([cx, cy], i) => {
        const isAccent =
          (n === 5 && i === 2) || (n === 7 && i === 0) || (n === 6 && cy > 60);
        const color = isAccent ? RED : GREEN;
        return <Stick key={`${cx}-${cy}-${i}`} cx={cx} cy={cy} h={h} color={color} />;
      })}
    </g>
  );
}

/* ---------- Знаки: крупная цифра-контур + маленькая 萬 ---------- */

const NUM_GLYPHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function CharsFace({ n }: { n: number }) {
  return (
    <g>
      <Glyph ch={NUM_GLYPHS[n - 1]} fill={INK} />
      <path d={WAN.d} transform={WAN.t} fill={RED} />
    </g>
  );
}

/* ---------- Драконы: 中 / 發 / рамка ---------- */

const DRAGON_GLYPHS = ['中', '發'];
const WIND_GLYPHS = ['東', '南', '西', '北'];

function DragonFace({ n }: { n: number }) {
  if (n === 3) {
    // Белый дракон — двойная синяя рамка
    return (
      <g fill="none" stroke="#3a6b9a">
        <rect x={16} y={14} width={68} height={102} rx={9} strokeWidth={8} />
        <rect x={27} y={25} width={46} height={80} rx={6} strokeWidth={5} />
      </g>
    );
  }
  return <Glyph ch={DRAGON_GLYPHS[n - 1]} fill={n === 1 ? RED : GREEN} />;
}

/* ---------- Цветы: простые крупные пиктограммы ---------- */

function petals(
  cx: number,
  cy: number,
  count: number,
  radius: number,
  r: number,
  color: string,
) {
  return Array.from({ length: count }).map((_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    return (
      <circle
        key={i}
        cx={cx + Math.cos(a) * radius}
        cy={cy + Math.sin(a) * radius}
        r={r}
        fill={color}
      />
    );
  });
}

function FlowerFace({ n }: { n: number }) {
  if (n === 1) {
    // слива — пять розовых лепестков
    return (
      <g transform="translate(50 65) scale(1.34) translate(-50 -65)">
        {petals(50, 63, 5, 20, 13, '#c94f7d')}
        <circle cx={50} cy={63} r={9} fill="#c9862d" />
      </g>
    );
  }
  if (n === 2) {
    // орхидея — три фиолетовых лепестка
    return (
      <g transform="translate(50 65) scale(1.34) translate(-50 -65)">
        {petals(50, 63, 3, 18, 15, '#8e6cc7')}
        <circle cx={50} cy={63} r={8} fill="#c9862d" />
      </g>
    );
  }
  if (n === 3) {
    // хризантема — шесть оранжевых лепестков
    return (
      <g transform="translate(50 65) scale(1.34) translate(-50 -65)">
        {petals(50, 63, 6, 20, 11, '#d98a2b')}
        <circle cx={50} cy={63} r={9} fill="#a85f1c" />
      </g>
    );
  }
  // бамбуковый цветок — две зелёные палочки
  return (
    <g transform="translate(50 65) scale(1.34) translate(-50 -65)">
      <Stick cx={41} cy={63} h={78} color={GREEN} />
      <Stick cx={59} cy={63} h={78} color={GREEN} />
    </g>
  );
}

/* ---------- Сезоны: простые крупные иконки ---------- */

function SeasonFace({ n }: { n: number }) {
  if (n === 1) {
    // весна — росток с двумя листками
    return (
      <g transform="translate(50 65) scale(1.32) translate(-50 -65)">
        <path d="M50 98 L50 44" stroke="#4c9a2f" strokeWidth={7} strokeLinecap="round" fill="none" />
        <path d="M50 64 Q 28 58 22 36 Q 46 36 50 58" fill="#4c9a2f" />
        <path d="M50 52 Q 72 46 78 24 Q 54 24 50 46" fill="#6db54a" />
      </g>
    );
  }
  if (n === 2) {
    // лето — солнце: кружок и лучи
    return (
      <g transform="translate(50 65) scale(1.32) translate(-50 -65)">
        <circle cx={50} cy={65} r={26} fill="#e8a13a" />
        <circle cx={50} cy={65} r={15} fill="#f6c968" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * 32}
              y1={65 + Math.sin(a) * 32}
              x2={50 + Math.cos(a) * 42}
              y2={65 + Math.sin(a) * 42}
              stroke="#e8a13a"
              strokeWidth={6}
              strokeLinecap="round"
            />
          );
        })}
      </g>
    );
  }
  if (n === 3) {
    // осень — простой лист
    return (
      <g transform="translate(50 65) scale(1.32) translate(-50 -65)">
        <path
          d="M50 22 C 78 34 84 62 54 88 C 50 91 46 91 42 88 C 16 62 24 34 50 22 Z"
          fill="#d07030"
        />
        <path d="M50 32 L50 82" stroke="#a8541c" strokeWidth={5} strokeLinecap="round" />
        <path d="M50 84 L40 98" stroke="#a8541c" strokeWidth={6} strokeLinecap="round" />
      </g>
    );
  }
  // зима — простая снежинка: 6 лучей
  return (
    <g transform="translate(50 65) scale(1.32) translate(-50 -65)">
      <g stroke="#4a80b8" strokeWidth={6} strokeLinecap="round">
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i * Math.PI) / 3;
          return (
            <line
              key={i}
              x1={50}
              y1={65}
              x2={50 + Math.cos(a) * 38}
              y2={65 + Math.sin(a) * 38}
            />
          );
        })}
        <circle cx={50} cy={65} r={7} fill="#4a80b8" stroke="none" />
      </g>
    </g>
  );
}

/* ---------- Главная компонента ---------- */

function TileFaceInner({ defId }: { defId: string }) {
  const def = getTileDef(defId);
  const bg =
    def.suit === 'dragon' ? DRAGON_BG[def.value - 1] : (BG[def.suit] ?? '#f8f2e0');
  return (
    <svg
      viewBox="0 0 100 130"
      className="h-full w-full select-none"
      aria-hidden="true"
    >
      <FaceBase bg={bg} />
      {def.suit === 'dots' && <DotsFace n={def.value} />}
      {def.suit === 'bamboo' && <BambooFace n={def.value} />}
      {def.suit === 'chars' && <CharsFace n={def.value} />}
      {def.suit === 'wind' && <Glyph ch={WIND_GLYPHS[def.value - 1]} fill={INK} />}
      {def.suit === 'dragon' && <DragonFace n={def.value} />}
      {def.suit === 'flower' && <FlowerFace n={def.value} />}
      {def.suit === 'season' && <SeasonFace n={def.value} />}
    </svg>
  );
}

export const TileFace = memo(TileFaceInner);
