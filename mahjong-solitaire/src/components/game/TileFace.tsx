'use client';

/**
 * РЕАЛИСТИЧНЫЕ SVG-грани плиток — «кость слоновой кости»:
 *  — фон грани — градиент слоновой кости с тонкой зелёной рамкой
 *    и внутренней линией, как у настоящих костяшек;
 *  — фигурки ОБЪЁМНЫЕ: кружки — сферы с бликом, бамбук — палочки
 *    с суставами и глянцевым краем, иероглифы — с тиснением
 *    (светлая кромка + мягкая тень);
 *  — каждый номинал кружков и бамбука имеет СВОЙ ЦВЕТ и СВОЙ узор:
 *    кости различаются с первого взгляда, даже мелкие;
 *  — знаки — только сильно различающиеся иероглифы 五六七八九
 *    (похожие 一二三四 убраны из колоды);
 *  — цветы и сезоны — цветные пиктограммы;
 *  — все иероглифы — залитые контуры (пути) из glyphs.ts:
 *    никаких <text>/шрифтов, значки видны на любом устройстве.
 *
 * Градиенты объявлены ОДИН раз на страницу в <TileFaceDefs />
 * (монтируется в layout.tsx): все плитки ссылаются на url(#id).
 */

import { memo } from 'react';
import { getTileDef } from '@/lib/mahjong/tiles';
import { GLYPHS, WAN } from './glyphs';

/* классическая палитра знаков */
const RED = '#bf3a30';
const GREEN = '#2f7d4f';
const INK = '#2e3f51';

const FRAME = '#2c6a4e';
const IVORY_STROKE = 'rgba(255,252,240,.92)';

/* ---------- градиенты: один глобальный <defs> на страницу ---------- */

/** кружки: [светлый центр, основной, тёмный край] */
const PIPS: Record<string, [string, string, string]> = {
  red: ['#f6a294', '#d24a39', '#8f241b'],
  blue: ['#86aade', '#3f6db3', '#223e6c'],
  green: ['#93cda3', '#479160', '#215735'],
  violet: ['#b9a1e0', '#7e5cbb', '#463078'],
  teal: ['#96d2c8', '#48a191', '#1c5a4f'],
  amber: ['#f4d28a', '#d9a43e', '#8a6112'],
  terra: ['#eeb291', '#c96e42', '#77371a'],
  indigo: ['#a3b1e4', '#5c6fbb', '#2c3970'],
};

/** бамбук: [светлый левый край, основной, тёмный правый] */
const BAMS: Record<string, [string, string, string]> = {
  green: ['#a8dab3', '#3f7a4e', '#1f4a2d'],
  red: ['#f2b3a2', '#b04a36', '#66210f'],
  blue: ['#b4cbec', '#4a6aa8', '#22345a'],
  amber: ['#f3d698', '#b8923a', '#684c0e'],
  teal: ['#a6d8cf', '#3d8d7d', '#1a4c42'],
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Глобальные градиенты граней. Рендерится один раз в layout.tsx
 * (width=0/height=0, без display:none — ссылки url(#id) живут всегда).
 */
export function TileFaceDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id="mjIvory" x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#fffef8" />
          <stop offset="0.45" stopColor="#f8f1de" />
          <stop offset="1" stopColor="#e8dfc4" />
        </linearGradient>
        {/* блеск-«эмаль» вдоль верхнего края грани */}
        <linearGradient id="mjGlossTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,.42)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {/* микротекстура «кости»: едва заметная крапинка */}
        <pattern id="mjGrain" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.5" r="0.6" fill="rgba(120,100,60,.09)" />
          <circle cx="4.5" cy="3.8" r="0.5" fill="rgba(90,70,40,.08)" />
          <circle cx="2.6" cy="5.9" r="0.55" fill="rgba(140,120,70,.09)" />
          <circle cx="6.1" cy="0.9" r="0.45" fill="rgba(80,60,30,.07)" />
        </pattern>
        {Object.entries(PIPS).map(([k, [a, b, c]]) => (
          <radialGradient
            key={k}
            id={`mjPip${cap(k)}`}
            cx="0.5"
            cy="0.5"
            r="0.68"
            fx="0.36"
            fy="0.3"
          >
            <stop offset="0" stopColor={a} />
            <stop offset="0.55" stopColor={b} />
            <stop offset="1" stopColor={c} />
          </radialGradient>
        ))}
        {Object.entries(BAMS).map(([k, [a, b, c]]) => (
          <linearGradient key={k} id={`mjBam${cap(k)}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={a} />
            <stop offset="0.5" stopColor={b} />
            <stop offset="1" stopColor={c} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

/* ---------- база грани: слоновая кость + рамка ---------- */

/** лёгкий тон масти поверх кости — группы читаются с первого взгляда */
const TINT: Record<string, string> = {
  dots: 'rgba(88,138,198,.10)',
  bamboo: 'rgba(66,128,88,.10)',
  wind: 'rgba(198,168,88,.13)',
  flower: 'rgba(222,120,164,.08)',
  season: 'rgba(146,126,198,.08)',
};
const DRAGON_TINT = [
  'rgba(190,58,48,.08)',
  'rgba(50,122,82,.10)',
  'rgba(72,110,160,.10)',
];

function FaceBase({ tint }: { tint?: string }) {
  return (
    <>
      <rect x="2.5" y="2.5" width="95" height="125" rx="8" fill="url(#mjIvory)" />
      {tint ? (
        <rect x="2.5" y="2.5" width="95" height="125" rx="8" fill={tint} />
      ) : null}
      {/* микротекстура кости — очень лёгкая крапинка */}
      <rect x="2.5" y="2.5" width="95" height="125" rx="8" fill="url(#mjGrain)" />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="125"
        rx="8"
        fill="none"
        stroke={FRAME}
        strokeWidth="2.6"
      />
      <rect
        x="6.5"
        y="6.5"
        width="87"
        height="117"
        rx="5.5"
        fill="none"
        stroke="rgba(44,106,78,.28)"
        strokeWidth="1"
      />
      {/* блеск-эмаль сверху */}
      <rect x="4" y="4" width="92" height="24" rx="6" fill="url(#mjGlossTop)" />
    </>
  );
}

/* ---------- иероглифы с тиснением ---------- */

interface GlyphProps {
  ch: string;
  fill: string;
  /** увеличение вокруг опорной точки */
  scale?: number;
  /** опорная точка масштабирования (центр фигуры) */
  px?: number;
  py?: number;
}

function Glyph({ ch, fill, scale = 1, px = 50, py = 65 }: GlyphProps) {
  const g = GLYPHS[ch];
  if (!g) return null;
  const t =
    scale === 1
      ? g.t
      : `${g.t} translate(${px} ${py}) scale(${scale}) translate(${-px} ${-py})`;
  return (
    <g>
      {/* тиснение: светлая кромка сверху-слева… */}
      <path d={g.d} transform={`${t} translate(-1.8 -2.2)`} fill="rgba(255,255,255,.72)" />
      {/* …и мягкая тень снизу-справа */}
      <path d={g.d} transform={`${t} translate(2 2.5)`} fill="rgba(84,58,28,.28)" />
      <path d={g.d} transform={t} fill={fill} />
    </g>
  );
}

/* ---------- Кружки: объёмные «эмалированные» сферы ---------- */

function Pip({
  cx,
  cy,
  r,
  grad,
}: {
  cx: number;
  cy: number;
  r: number;
  grad: string;
}) {
  const sw = Math.max(1.4, r * 0.16);
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={`url(#${grad})`}
        stroke={IVORY_STROKE}
        strokeWidth={sw}
      />
      <ellipse
        cx={cx - r * 0.3}
        cy={cy - r * 0.36}
        rx={r * 0.34}
        ry={r * 0.2}
        fill="rgba(255,255,255,.5)"
      />
    </g>
  );
}

/** узоры кружков: у каждого номинала СВОЙ узор и СВОЙ цвет */
const DOT_PATTERNS: Record<
  number,
  { pts: [number, number][]; r: number; col: keyof typeof PIPS; centerCol?: keyof typeof PIPS }
> = {
  2: { pts: [[50, 44], [50, 86]], r: 17, col: 'blue' },
  3: { pts: [[32, 36], [50, 65], [68, 94]], r: 13, col: 'violet' },
  4: { pts: [[30, 42], [70, 42], [30, 88], [70, 88]], r: 13, col: 'green' },
  5: {
    pts: [[30, 42], [70, 42], [50, 65], [30, 88], [70, 88]],
    r: 12,
    col: 'teal',
    centerCol: 'amber',
  },
  6: {
    pts: [[32, 36], [32, 65], [32, 94], [68, 36], [68, 65], [68, 94]],
    r: 11,
    col: 'indigo',
  },
  7: {
    pts: [
      [32, 42], [50, 42], [68, 42],
      [26, 96], [41.3, 96], [58.7, 96], [74, 96],
    ],
    r: 10.5,
    col: 'terra',
  },
  8: {
    pts: [[32, 30], [68, 30], [32, 54], [68, 54], [32, 78], [68, 78], [32, 102], [68, 102]],
    r: 10,
    col: 'amber',
  },
  9: {
    pts: [
      [26, 32], [50, 32], [74, 32],
      [26, 65], [50, 65], [74, 65],
      [26, 98], [50, 98], [74, 98],
    ],
    r: 10,
    col: 'blue',
    centerCol: 'red',
  },
};

function DotsFace({ n }: { n: number }) {
  // единица — большая «пионовая» розетка, как на настоящих костях
  if (n === 1) {
    const petals = Array.from({ length: 8 }).map((_, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      return (
        <circle
          key={i}
          cx={50 + Math.cos(a) * 17.5}
          cy={65 + Math.sin(a) * 17.5}
          r={6.2}
          fill="#fdf6e4"
        />
      );
    });
    return (
      <g>
        <circle cx={50} cy={65} r={29} fill="url(#mjPipRed)" stroke={IVORY_STROKE} strokeWidth={3} />
        {petals}
        <circle cx={50} cy={65} r={7.5} fill="url(#mjPipAmber)" stroke="rgba(255,252,240,.8)" strokeWidth={2} />
        <ellipse cx={41.5} cy={55} rx={9} ry={5.5} fill="rgba(255,255,255,.45)" />
      </g>
    );
  }
  const p = DOT_PATTERNS[n];
  if (!p) return null;
  const center = Math.floor(p.pts.length / 2);
  return (
    <g>
      {p.pts.map(([cx, cy], i) => (
        <Pip
          key={`${cx}-${cy}-${i}`}
          cx={cx}
          cy={cy}
          r={p.r}
          grad={`mjPip${cap(p.centerCol && i === center ? p.centerCol : p.col)}`}
        />
      ))}
    </g>
  );
}

/* ---------- Бамбук: настоящие палочки со суставами ---------- */

function BamStick({
  x,
  y,
  w,
  h,
  grad,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  grad: string;
}) {
  const j1 = y - h / 2 + h * 0.36;
  const j2 = y - h / 2 + h * 0.72;
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={w * 0.32}
        fill={`url(#${grad})`}
        stroke="rgba(28,38,24,.35)"
        strokeWidth={1}
      />
      {/* волокна бамбука — тонкие тёмные прожилки */}
      <line
        x1={x - w / 2 + w * 0.42}
        y1={y - h / 2 + 3}
        x2={x - w / 2 + w * 0.42}
        y2={y + h / 2 - 3}
        stroke="rgba(0,0,0,.12)"
        strokeWidth={0.9}
      />
      <line
        x1={x + w / 2 - w * 0.34}
        y1={y - h / 2 + 4}
        x2={x + w / 2 - w * 0.34}
        y2={y + h / 2 - 4}
        stroke="rgba(0,0,0,.09)"
        strokeWidth={0.8}
      />
      {/* светлые «суставы» бамбука */}
      <line x1={x - w / 2 + 1.6} y1={j1} x2={x + w / 2 - 1.6} y2={j1} stroke="rgba(255,252,240,.5)" strokeWidth={2.2} />
      <line x1={x - w / 2 + 1.6} y1={j2} x2={x + w / 2 - 1.6} y2={j2} stroke="rgba(255,252,240,.42)" strokeWidth={2} />
      {/* глянцевый край слева… */}
      <rect
        x={x - w / 2 + 1.7}
        y={y - h / 2 + 3}
        width={Math.max(2, w * 0.26)}
        height={Math.max(4, h - 6)}
        rx={w * 0.13}
        fill="rgba(255,255,255,.34)"
      />
      {/* …и тень справа — ствол читается объёмным */}
      <rect
        x={x + w / 2 - w * 0.2 - 1}
        y={y - h / 2 + 2.5}
        width={Math.max(1.6, w * 0.2)}
        height={Math.max(4, h - 5)}
        rx={w * 0.1}
        fill="rgba(0,0,0,.16)"
      />
    </g>
  );
}

/** узоры бамбука: у каждого номинала СВОЙ узор и СВОЯ расцветка */
const BAM_PATTERNS: Record<
  number,
  { pts: [number, number, keyof typeof BAMS][]; w: number; h: number }
> = {
  2: { pts: [[50, 42, 'red'], [50, 88, 'red']], w: 15, h: 44 },
  3: {
    pts: [[50, 34, 'green'], [36, 88, 'red'], [64, 88, 'red']],
    w: 15,
    h: 38,
  },
  4: {
    pts: [[34, 44, 'blue'], [66, 44, 'blue'], [34, 88, 'blue'], [66, 88, 'blue']],
    w: 14,
    h: 36,
  },
  5: {
    pts: [
      [30, 42, 'amber'], [70, 42, 'amber'],
      [50, 65, 'green'],
      [30, 88, 'amber'], [70, 88, 'amber'],
    ],
    w: 13,
    h: 34,
  },
  6: {
    pts: [
      [30, 44, 'green'], [50, 44, 'green'], [70, 44, 'green'],
      [30, 90, 'red'], [50, 90, 'red'], [70, 90, 'red'],
    ],
    w: 13,
    h: 34,
  },
  7: {
    pts: [
      [50, 28, 'red'],
      [30, 64, 'green'], [50, 64, 'green'], [70, 64, 'green'],
      [30, 100, 'green'], [50, 100, 'green'], [70, 100, 'green'],
    ],
    w: 12,
    h: 27,
  },
  8: {
    pts: [
      [34, 27, 'teal'], [66, 27, 'teal'],
      [34, 53, 'teal'], [66, 53, 'teal'],
      [34, 79, 'teal'], [66, 79, 'teal'],
      [34, 105, 'teal'], [66, 105, 'teal'],
    ],
    w: 12,
    h: 24,
  },
  9: {
    pts: [
      [28, 30, 'red'], [50, 30, 'green'], [72, 30, 'blue'],
      [28, 65, 'red'], [50, 65, 'green'], [72, 65, 'blue'],
      [28, 100, 'red'], [50, 100, 'green'], [72, 100, 'blue'],
    ],
    w: 11.5,
    h: 28,
  },
};

function BambooFace({ n }: { n: number }) {
  // бамбук-единица: один большой ствол с листьями — узнаётся мгновенно
  if (n === 1) {
    return (
      <g>
        <BamStick x={50} y={64} w={19} h={94} grad="mjBamGreen" />
        <path
          d="M60 40 Q 80 28 87 10 Q 62 17 56 36 Z"
          fill="url(#mjBamGreen)"
          stroke="rgba(28,38,24,.3)"
          strokeWidth={1}
        />
        <path
          d="M60 88 Q 80 100 87 118 Q 62 111 56 92 Z"
          fill="url(#mjBamGreen)"
          stroke="rgba(28,38,24,.3)"
          strokeWidth={1}
          opacity={0.9}
        />
      </g>
    );
  }
  const p = BAM_PATTERNS[n];
  if (!p) return null;
  return (
    <g>
      {p.pts.map(([x, y, col], i) => (
        <BamStick key={`${x}-${y}-${i}`} x={x} y={y} w={p.w} h={p.h} grad={`mjBam${cap(col)}`} />
      ))}
    </g>
  );
}

/* ---------- Знаки: крупная цифра-контур + маленькая 萬 ---------- */

const NUM_GLYPHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function CharsFace({ n }: { n: number }) {
  return (
    <g>
      <Glyph ch={NUM_GLYPHS[n - 1]} fill={INK} scale={1.18} px={50} py={50} />
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
      <g fill="none">
        <rect x={16} y={14} width={68} height={102} rx={9} stroke="#3a6b9a" strokeWidth={8} />
        <rect x={27} y={25} width={46} height={80} rx={6} stroke="#3a6b9a" strokeWidth={5} />
      </g>
    );
  }
  return <Glyph ch={DRAGON_GLYPHS[n - 1]} fill={n === 1 ? RED : GREEN} />;
}

/* ---------- Цветы: крупные пиктограммы с обводкой ---------- */

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
        stroke="rgba(255,252,240,.75)"
        strokeWidth={2}
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
        <circle cx={50} cy={63} r={9} fill="#c9862d" stroke="rgba(255,252,240,.7)" strokeWidth={2} />
      </g>
    );
  }
  if (n === 2) {
    // орхидея — три фиолетовых лепестка
    return (
      <g transform="translate(50 65) scale(1.34) translate(-50 -65)">
        {petals(50, 63, 3, 18, 15, '#8e6cc7')}
        <circle cx={50} cy={63} r={8} fill="#c9862d" stroke="rgba(255,252,240,.7)" strokeWidth={2} />
      </g>
    );
  }
  if (n === 3) {
    // хризантема — шесть оранжевых лепестков
    return (
      <g transform="translate(50 65) scale(1.34) translate(-50 -65)">
        {petals(50, 63, 6, 20, 11, '#d98a2b')}
        <circle cx={50} cy={63} r={9} fill="#a85f1c" stroke="rgba(255,252,240,.7)" strokeWidth={2} />
      </g>
    );
  }
  // бамбуковый цветок — две зелёные палочки
  return (
    <g transform="translate(50 65) scale(1.34) translate(-50 -65)">
      <BamStick x={41} y={63} w={14} h={78} grad="mjBamGreen" />
      <BamStick x={59} y={63} w={14} h={78} grad="mjBamGreen" />
    </g>
  );
}

/* ---------- Сезоны: крупные цветные иконки ---------- */

function SeasonFace({ n }: { n: number }) {
  if (n === 1) {
    // весна — росток с двумя листками
    return (
      <g transform="translate(50 65) scale(1.32) translate(-50 -65)">
        <path d="M50 98 L50 44" stroke="#4c9a2f" strokeWidth={7} strokeLinecap="round" fill="none" />
        <path d="M50 64 Q 28 58 22 36 Q 46 36 50 58" fill="#4c9a2f" stroke="rgba(24,46,20,.25)" strokeWidth={1} />
        <path d="M50 52 Q 72 46 78 24 Q 54 24 50 46" fill="#6db54a" stroke="rgba(24,46,20,.25)" strokeWidth={1} />
      </g>
    );
  }
  if (n === 2) {
    // лето — солнце: кружок и лучи
    return (
      <g transform="translate(50 65) scale(1.32) translate(-50 -65)">
        <circle cx={50} cy={65} r={26} fill="url(#mjPipAmber)" stroke="rgba(255,252,240,.8)" strokeWidth={2.5} />
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
          stroke="rgba(120,50,10,.3)"
          strokeWidth={1}
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
  const tint =
    def.suit === 'dragon' ? DRAGON_TINT[def.value - 1] : TINT[def.suit];
  return (
    <svg
      viewBox="0 0 100 130"
      className="h-full w-full select-none"
      aria-hidden="true"
    >
      <FaceBase tint={tint} />
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
