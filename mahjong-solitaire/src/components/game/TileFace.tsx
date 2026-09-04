'use client';

/**
 * SVG-грани плиток: кружки, бамбук, знаки, ветры, драконы, цветы, сезоны.
 * Всё рисуется векторно — никаких внешних картинок.
 * Картинки простые и контрастные: легко отличить даже на маленькой плитке.
 */

import { memo } from 'react';
import { CN_CHARS, getTileDef } from '@/lib/mahjong/tiles';

const CJK_FONT =
  "'Noto Sans SC','Noto Sans CJK SC','PingFang SC','Microsoft YaHei','WenQuanYi Zen Hei',sans-serif";
const BLUE = '#2e6ca8';
const RED = '#cf4030';
const GREEN = '#2e8b57';
const DARK = '#26324a';
const AMBER = '#c9862d';

/* ---------- Кружки (dots) ---------- */

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
  const pts = DOT_PATTERNS[n];
  const r = n === 1 ? 15 : n <= 4 ? 10.5 : n === 5 ? 9.5 : 8.5;
  return (
    <g transform="translate(50 65) scale(1.16) translate(-50 -65)">
      {pts.map(([cx, cy], i) => {
        const isAccent =
          (n === 5 && i === 2) ||
          (n === 7 && i === 0) ||
          (n === 9 && cx === 50 && cy === 65);
        return (
          <g key={`${cx}-${cy}-${i}`}>
            <circle cx={cx} cy={cy} r={r} fill={isAccent ? RED : BLUE} />
            <circle cx={cx} cy={cy} r={r * 0.55} fill="#f8f3e0" />
            <circle cx={cx} cy={cy} r={r * 0.22} fill={isAccent ? RED : BLUE} />
          </g>
        );
      })}
    </g>
  );
}

/* ---------- Бамбук ---------- */

function Stick({ cx, cy, h, color }: { cx: number; cy: number; h: number; color: string }) {
  const w = h > 30 ? 13 : 12;
  return (
    <g>
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={w * 0.3}
        fill={color}
      />
      <rect
        x={cx - w / 2 + 2.5}
        y={cy - h / 2 + 2.5}
        width={w - 5}
        height={h - 5}
        rx={w * 0.22}
        fill="#ffffff"
        opacity={0.28}
      />
      <circle cx={cx} cy={cy - h / 2 + w * 0.6} r={w * 0.3} fill="#f8f3e0" opacity={0.9} />
      <circle cx={cx} cy={cy + h / 2 - w * 0.6} r={w * 0.3} fill="#f8f3e0" opacity={0.9} />
    </g>
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
      <g transform="translate(50 65) scale(1.14) translate(-50 -65)">
        <Stick cx={50} cy={64} h={84} color={GREEN} />
        <path
          d="M56 44 Q 72 36 78 22 Q 60 26 54 40 Z"
          fill={GREEN}
          opacity={0.85}
        />
        <path
          d="M56 78 Q 72 86 78 100 Q 60 96 54 82 Z"
          fill={GREEN}
          opacity={0.6}
        />
      </g>
    );
  }
  const pts = BAM_PATTERNS[n];
  const h = n === 9 || n === 8 ? 26 : n === 7 || n === 6 ? 30 : 34;
  return (
    <g transform="translate(50 65) scale(1.13) translate(-50 -65)">
      {pts.map(([cx, cy], i) => {
        const isAccent =
          (n === 5 && i === 2) || (n === 7 && i === 0) || (n === 6 && cy > 60);
        const color = isAccent ? RED : GREEN;
        return <Stick key={`${cx}-${cy}-${i}`} cx={cx} cy={cy} h={h} color={color} />;
      })}
    </g>
  );
}

/* ---------- Знаки (китайские цифры + 萬) ---------- */

function CharsFace({ n }: { n: number }) {
  return (
    <g>
      <text
        x={50}
        y={52}
        textAnchor="middle"
        fontFamily={CJK_FONT}
        fontSize={56}
        fontWeight={700}
        fill={DARK}
      >
        {CN_CHARS.num[n - 1]}
      </text>
      <text
        x={50}
        y={116}
        textAnchor="middle"
        fontFamily={CJK_FONT}
        fontSize={52}
        fontWeight={700}
        fill={RED}
      >
        万
      </text>
    </g>
  );
}

/* ---------- Ветры ---------- */

function WindFace({ n }: { n: number }) {
  return (
    <text
      x={50}
      y={94}
      textAnchor="middle"
      fontFamily={CJK_FONT}
      fontSize={76}
      fontWeight={700}
      fill={DARK}
    >
      {CN_CHARS.winds[n - 1].char}
    </text>
  );
}

/* ---------- Драконы ---------- */

function DragonFace({ n }: { n: number }) {
  if (n === 3) {
    // Белый дракон — традиционно простая синяя рамка
    return (
      <rect
        x={21}
        y={19}
        width={58}
        height={94}
        rx={8}
        fill="none"
        stroke={BLUE}
        strokeWidth={7}
      />
    );
  }
  const d = CN_CHARS.dragons[n - 1];
  return (
    <text
      x={50}
      y={98}
      textAnchor="middle"
      fontFamily={CJK_FONT}
      fontSize={76}
      fontWeight={700}
      fill={d.color}
    >
      {d.char}
    </text>
  );
}

/* ---------- Цветы: крупные простые пиктограммы ---------- */

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
      <g transform="translate(50 65) scale(1.18) translate(-50 -65)">
        {petals(50, 63, 5, 17, 12, '#d2547f')}
        <circle cx={50} cy={63} r={8} fill={AMBER} />
      </g>
    );
  }
  if (n === 2) {
    // орхидея — три фиолетовых лепестка
    return (
      <g transform="translate(50 65) scale(1.18) translate(-50 -65)">
        {petals(50, 63, 3, 15, 14, '#8e6cc7')}
        <circle cx={50} cy={63} r={7} fill="#f8f3e0" />
        <circle cx={50} cy={63} r={3} fill={AMBER} />
      </g>
    );
  }
  if (n === 3) {
    // хризантема — восемь оранжевых лепестков
    return (
      <g transform="translate(50 65) scale(1.18) translate(-50 -65)">
        {petals(50, 63, 8, 17, 8.5, '#d98a2b')}
        <circle cx={50} cy={63} r={8} fill="#a85f1c" />
        <circle cx={50} cy={63} r={4} fill="#f8b53e" />
      </g>
    );
  }
  // бамбуковый цветок — две зелёные палочки
  return (
    <g transform="translate(50 65) scale(1.18) translate(-50 -65)">
      <Stick cx={41} cy={63} h={72} color={GREEN} />
      <Stick cx={59} cy={63} h={72} color={GREEN} />
    </g>
  );
}

/* ---------- Сезоны: крупные простые иконки ---------- */

function SeasonFace({ n }: { n: number }) {
  if (n === 1) {
    // весна — росток с двумя листками
    return (
      <g transform="translate(50 65) scale(1.16) translate(-50 -65)">
        <g stroke="#4c9a2f" strokeWidth={5} strokeLinecap="round" fill="none">
          <path d="M50 96 L50 46" />
          <path d="M50 62 Q 30 58 24 38 Q 44 38 50 56" fill="#4c9a2f" stroke="none" />
          <path d="M50 52 Q 70 48 76 28 Q 56 28 50 46" fill="#6db54a" stroke="none" />
        </g>
      </g>
    );
  }
  if (n === 2) {
    // лето — солнце
    return (
      <g transform="translate(50 65) scale(1.16) translate(-50 -65)">
        <circle cx={50} cy={65} r={22} fill="#e8a13a" />
        <circle cx={50} cy={65} r={14} fill="#f6c968" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * 28}
              y1={65 + Math.sin(a) * 28}
              x2={50 + Math.cos(a) * 38}
              y2={65 + Math.sin(a) * 38}
              stroke="#e8a13a"
              strokeWidth={5}
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
      <g transform="translate(50 65) scale(1.16) translate(-50 -65)">
        <path
          d="M50 22 C 76 34 82 62 54 86 C 50 89 46 89 42 86 C 18 62 26 34 50 22 Z"
          fill="#d07030"
        />
        <path d="M50 30 L50 82" stroke="#a8541c" strokeWidth={4} strokeLinecap="round" />
        <path d="M50 82 L40 96" stroke="#a8541c" strokeWidth={5} strokeLinecap="round" />
      </g>
    );
  }
  // зима — снежинка
  return (
    <g transform="translate(50 65) scale(1.16) translate(-50 -65)">
      <g stroke="#4a80b8" strokeWidth={5} strokeLinecap="round">
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i * Math.PI) / 3;
          const x2 = 50 + Math.cos(a) * 34;
          const y2 = 65 + Math.sin(a) * 34;
          return (
            <g key={i}>
              <line x1={50} y1={65} x2={x2} y2={y2} />
              <line
                x1={x2}
                y1={y2}
                x2={x2 - Math.cos(a - 0.6) * 11}
                y2={y2 - Math.sin(a - 0.6) * 11}
              />
              <line
                x1={x2}
                y1={y2}
                x2={x2 - Math.cos(a + 0.6) * 11}
                y2={y2 - Math.sin(a + 0.6) * 11}
              />
            </g>
          );
        })}
        <circle cx={50} cy={65} r={5.5} fill="#4a80b8" stroke="none" />
      </g>
    </g>
  );
}

/* ---------- Главная компонента ---------- */

function TileFaceInner({ defId }: { defId: string }) {
  const def = getTileDef(defId);
  return (
    <svg
      viewBox="0 0 100 130"
      className="h-full w-full select-none"
      aria-hidden="true"
    >
      {def.suit === 'dots' && <DotsFace n={def.value} />}
      {def.suit === 'bamboo' && <BambooFace n={def.value} />}
      {def.suit === 'chars' && <CharsFace n={def.value} />}
      {def.suit === 'wind' && <WindFace n={def.value} />}
      {def.suit === 'dragon' && <DragonFace n={def.value} />}
      {def.suit === 'flower' && <FlowerFace n={def.value} />}
      {def.suit === 'season' && <SeasonFace n={def.value} />}
    </svg>
  );
}

export const TileFace = memo(TileFaceInner);
