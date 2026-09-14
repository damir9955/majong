'use client';

/**
 * СТАТИСТИКА v3 (Task 37 — фидбек «ничего не понятно, всё криво»).
 *
 *  — «ОБЗОР»: лига-герой, KPI, кольцо процента побед и ДОСТИЖЕНИЯ —
 *    компактная сетка квадратных плиток (3 в ряд, влезает без
 *    горизонтальной прокрутки); тап по плитке — подробная карточка:
 *    описание, прогресс, вехи (бронза → серебро → золото);
 *  — «КЛАССИКА»: подробности — уровни, пары, серии, время, бонусы;
 *  — «ПО СЕТИ» (вместо прежней «Друзей»): победы и поражения —
 *    БОЛЬШИЕ разноцветные карточки, процент побед, серия; отдельная
 *    строка только для сетевых матчей (бот не мешается);
 *  — «ДРУЗЬЯ»: настоящие друзья (система друзей) + история встреч:
 *    победы/поражения по каждому, словами, без загадочных «П — П».
 *
 * «Винрейт» переименован в «Процент побед» (фидбек: слово непонятно).
 */

import { useState } from 'react';
import { useGame, type FriendRecord } from '@/lib/game/store';
import { useT, leagueName, useLang } from '@/lib/i18n';
import { leagueIndexForPoints, LEAGUES, leagueProgress } from '@/lib/game/league';
import { useFriends } from '@/lib/rooms/friends';
import {
  ArrowLeft,
  Trophy,
  Flower2,
  Swords,
  Users,
  LayoutGrid,
  Flame,
  Timer,
  Clock3,
  Lightbulb,
  Medal,
  Check,
  Handshake,
  Crown,
  Star,
  Target,
  BarChart3,
  X,
} from 'lucide-react';

type Tab = 'overview' | 'classic' | 'online' | 'friends';

/* ---------- форматирование ---------- */

function fmtTime(ms: number, t: ReturnType<typeof useT>): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} ${t('tu.sec')}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${t('tu.min')} ${s % 60} ${t('tu.sec')}`;
  const h = Math.floor(m / 60);
  return `${h} ${t('tu.h')} ${m % 60} ${t('tu.min')}`;
}

/* ---------- достижения (компактно + подробности по тапу) ---------- */

interface AchDef {
  id: string;
  label: string;
  desc: string;
  icon: typeof Star;
  value: number;
  /** вехи: первая достигнутая веха = бронза, …, последняя = золото */
  tiers: number[];
}

/** собрать достижения из живой статистики (без нового трекинга) */
function useAchievements(): AchDef[] {
  const t = useT();
  const classic = useGame((s) => s.stats.classic);
  const league = useGame((s) => s.league);
  const friends = useGame((s) => s.stats.friends);
  const friendsGames = Object.values(friends).reduce(
    (acc, r) => acc + r.played,
    0,
  );
  return [
    {
      id: 'pairs',
      label: t('ach.pairs'),
      desc: t('ach.pairs.desc'),
      icon: Star,
      value: classic.pairsMatched,
      tiers: [1, 50, 250, 1000],
    },
    {
      id: 'levels',
      label: t('ach.levels'),
      desc: t('ach.levels.desc'),
      icon: Target,
      value: classic.levelsCleared,
      tiers: [1, 5, 25, 100],
    },
    {
      id: 'wins',
      label: t('ach.wins'),
      desc: t('ach.wins.desc'),
      icon: Swords,
      value: league.wins,
      tiers: [1, 10, 50],
    },
    {
      id: 'streak',
      label: t('ach.streak'),
      desc: t('ach.streak.desc'),
      icon: Flame,
      value: league.bestStreak,
      tiers: [2, 5, 10],
    },
    {
      id: 'friends',
      label: t('ach.friends'),
      desc: t('ach.friends.desc'),
      icon: Handshake,
      value: friendsGames,
      tiers: [1, 5, 20],
    },
    {
      id: 'league',
      label: t('ach.league'),
      desc: t('ach.league.desc'),
      icon: Crown,
      value: leagueIndexForPoints(league.pointsBest),
      tiers: [1, 3, 5, 6],
    },
  ];
}

/** состояние достижения: пройденные вехи + прогресс до следующей */
function achState(def: AchDef): {
  doneAll: boolean;
  nextTier: number;
  from: number;
  progress: number;
  tier: number;
} {
  let tier = -1;
  for (let i = 0; i < def.tiers.length; i++) {
    if (def.value >= def.tiers[i]) tier = i;
  }
  const doneAll = tier >= def.tiers.length - 1;
  const nextIdx = Math.min(tier + 1, def.tiers.length - 1);
  const nextTier = def.tiers[nextIdx];
  const from = tier >= 0 ? def.tiers[tier] : 0;
  const progress = doneAll
    ? 1
    : Math.min(1, Math.max(0, (def.value - from) / (nextTier - from)));
  return { doneAll, nextTier, from, progress, tier: Math.max(0, tier) };
}

/** компактная квадратная плитка достижения: иконка + мини-кольцо */
function AchTile({
  def,
  onOpen,
}: {
  def: AchDef;
  onOpen: () => void;
}) {
  const st = achState(def);
  const Icon = def.icon;
  const r = 15.9;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      className={`mj-st2-ach-tile ${st.doneAll ? 'mj-st2-ach-tile-done' : ''}`}
      data-testid={`mj-ach-${def.id}`}
      onClick={onOpen}
      aria-label={def.label}
    >
      <svg viewBox="0 0 36 36" className="mj-st2-ach-ring">
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="rgba(0,0,0,.09)"
          strokeWidth="3.6"
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={st.doneAll ? '#d99f2b' : '#1f8f7a'}
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeDasharray={`${(c * st.progress).toFixed(1)} ${c.toFixed(1)}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      {st.doneAll ? (
        <Medal className="h-5 w-5" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
      <span className="mj-st2-ach-tile-n tabular-nums">
        {st.doneAll ? <Check className="h-3.5 w-3.5" /> : def.value}
      </span>
    </button>
  );
}

/** подробная карточка достижения (тап по плитке) */
function AchDetail({
  def,
  onClose,
}: {
  def: AchDef;
  onClose: () => void;
}) {
  const t = useT();
  const st = achState(def);
  const Icon = def.icon;
  return (
    <div className="mj-overlay" data-testid={`mj-ach-detail-${def.id}`}>
      <div className="mj-card relative w-full max-w-sm p-6">
        <button
          type="button"
          className="mj-close-x"
          onClick={onClose}
          aria-label="×"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <span
            className={`mj-st2-ach-ico-lg ${st.doneAll ? 'mj-st2-ach-ico-lg-done' : ''}`}
          >
            {st.doneAll ? <Medal className="h-7 w-7" /> : <Icon className="h-7 w-7" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-tight text-[#22432e]">
              {def.label}
            </h2>
            <p className="text-xs font-bold text-stone-500">
              {st.doneAll
                ? t('ach.done')
                : t('ach.progress', { n: Math.min(def.value, st.nextTier), m: st.nextTier })}
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm font-semibold leading-snug text-stone-600">
          {def.desc}
        </p>

        {/* вехи: достигнутые — золотые */}
        <div className="mt-4 flex flex-wrap gap-2">
          {def.tiers.map((tier, i) => {
            const done = def.value >= tier;
            return (
              <span
                key={tier}
                className={`mj-st2-tier ${done ? 'mj-st2-tier-done' : ''}`}
              >
                {done && <Check className="h-3.5 w-3.5" />}
                {tier}
              </span>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="mj-st2-bar mj-st2-bar-lg">
            <i
              style={{
                width: `${Math.round(st.progress * 100)}%`,
                background: st.doneAll
                  ? 'linear-gradient(90deg, #f0c96a, #d99f2b)'
                  : undefined,
              }}
            />
          </div>
          <p className="mt-1.5 text-center text-[11px] font-bold text-stone-500">
            {st.doneAll
              ? t('ach.maxTier')
              : `${def.value} / ${st.nextTier}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- кольцо процента побед ---------- */

function WinRateRing({
  percent,
  color,
  label,
  sub,
}: {
  percent: number;
  color: string;
  label: string;
  sub: string;
}) {
  const r = 15.9;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="mj-st2-ring" data-testid="mj-winrate-ring">
      <svg viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="rgba(0,0,0,.08)"
          strokeWidth="3.4"
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray={`${(c * p) / 100} ${c}`}
          transform="rotate(-90 18 18)"
        />
        <text x="18" y="19.5" textAnchor="middle" className="mj-st2-ring-val">
          {Math.round(p)}%
        </text>
      </svg>
      <div className="mj-st2-ring-txt">
        <b>{label}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

/* ---------- вкладки ---------- */

function OverviewTab() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const league = useGame((s) => s.league);
  const classic = useGame((s) => s.stats.classic);
  const level = useGame((s) => s.level);
  const friends = useGame((s) => s.stats.friends);
  const idx = leagueIndexForPoints(league.pointsBest);
  const cur = LEAGUES[idx];
  const next = LEAGUES[idx + 1];
  const progress = leagueProgress(league.pointsBest);
  const total = league.wins + league.losses;
  const winrate = total > 0 ? (league.wins / total) * 100 : 0;
  const friendsGames = Object.values(friends).reduce(
    (acc, r) => acc + r.played,
    0,
  );
  const achs = useAchievements();
  const [achOpen, setAchOpen] = useState<AchDef | null>(null);

  return (
    <div className="flex flex-col gap-3.5">
      {/* лига-герой: имя, трофеи, прогресс до следующей */}
      <div className="mj-st2-hero" style={{ borderColor: cur.color }}>
        <div className="mj-st2-hero-top">
          <span
            className="mj-st2-hero-orb"
            style={{
              background: `radial-gradient(circle at 32% 28%, ${cur.color}, ${cur.color}88 62%, rgba(0,0,0,.25))`,
              boxShadow: `0 4px 14px ${cur.color}66`,
            }}
          >
            <Trophy className="h-6 w-6 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mj-st2-hero-league" style={{ color: cur.color }}>
              {leagueName(idx, lang)}
            </p>
            <p className="mj-st2-hero-pts">
              {league.points} {t('st.trophies').toLowerCase()}
              {league.pointsBest > league.points && (
                <span className="mj-st2-hero-peak">
                  · {t('st.peak')} {league.pointsBest}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="mj-st2-bar mj-st2-bar-lg">
          <i
            style={{
              width: `${Math.round(progress * 100)}%`,
              background: `linear-gradient(90deg, ${cur.color}, ${next?.color ?? cur.color})`,
            }}
          />
        </div>
        <p className="mj-st2-hero-next">
          {next
            ? t('st.toNext', {
                n: next.min - league.points,
                name: leagueName(idx + 1, lang),
              })
            : t('st.maxLeague')}
        </p>
      </div>

      {/* KPI-плитки */}
      <div className="mj-st2-grid">
        <div className="mj-st2-kpi">
          <Swords className="h-4 w-4" />
          <b>{league.wins}</b>
          <span>{t('st.wins')}</span>
        </div>
        <div className="mj-st2-kpi">
          <BarChart3 className="h-4 w-4" />
          <b>{Math.round(winrate)}%</b>
          <span>{t('st.winrate')}</span>
        </div>
        <div className="mj-st2-kpi">
          <Flower2 className="h-4 w-4" />
          <b>{classic.pairsMatched}</b>
          <span>{t('st.pairsMatched')}</span>
        </div>
        <div className="mj-st2-kpi">
          <Trophy className="h-4 w-4" />
          <b>{level}</b>
          <span>{t('home.level', { n: level })}</span>
        </div>
      </div>

      {/* серия + друзья */}
      <div className="mj-st2-pair">
        <WinRateRing
          percent={winrate}
          color={cur.color}
          label={t('st.winrate')}
          sub={
            total > 0
              ? `${league.wins}${t('st.wlSep')}${league.losses}`
              : t('st.emptyMatches')
          }
        />
        <div className="mj-st2-mini">
          <Flame className="h-4 w-4 text-orange-500" />
          <div>
            <b>
              {league.streak >= 0
                ? t('st.streakHot', { n: league.streak })
                : t('st.streakCold', { n: -league.streak })}
            </b>
            <span>
              {t('st.bestStreak')}: {league.bestStreak}
            </span>
          </div>
        </div>
        <div className="mj-st2-mini">
          <Users className="h-4 w-4 text-emerald-700" />
          <div>
            <b>
              {friendsGames} {t('st.withFriends')}
            </b>
            <span>
              {Object.keys(friends).length > 0
                ? t('st.friendsMet', { n: Object.keys(friends).length })
                : t('st.emptyFriends')}
            </span>
          </div>
        </div>
      </div>

      {/* достижения: компактная сетка квадратных плиток, тап — подробно */}
      <p className="mj-st2-title">{t('ach.title')}</p>
      <div className="mj-st2-ach-tiles" data-testid="mj-ach-tiles">
        {achs.map((a) => (
          <AchTile key={a.id} def={a} onOpen={() => setAchOpen(a)} />
        ))}
      </div>
      <p className="mj-st2-ach-hint">{t('ach.tapHint')}</p>

      {achOpen && <AchDetail def={achOpen} onClose={() => setAchOpen(null)} />}
    </div>
  );
}

function ClassicTab() {
  const t = useT();
  const stats = useGame((s) => s.stats.classic);
  const level = useGame((s) => s.level);
  if (stats.games === 0) {
    return <p className="mj-st-empty">{t('st.emptyClassic')}</p>;
  }
  const rows: [typeof Flower2, string, string, boolean?][] = [
    [Flower2, t('st.levelsCleared'), String(stats.levelsCleared)],
    [Target, t('home.level', { n: level }), String(level)],
    [Star, t('st.pairsMatched'), String(stats.pairsMatched)],
    [BarChart3, t('st.games'), String(stats.games)],
    [
      Flame,
      t('st.curStreak'),
      `${stats.winStreak} · ${t('st.best')} ${stats.bestStreak}`,
    ],
    [
      Timer,
      t('st.bestTime'),
      stats.bestTimeMs > 0 ? fmtTime(stats.bestTimeMs, t) : '—',
    ],
    [Clock3, t('st.timePlayed'), fmtTime(stats.totalTimeMs, t)],
    [
      Lightbulb,
      t('st.bonuses'),
      `${stats.hintsUsed} ${t('st.hintN')} · ${stats.shufflesUsed} ${t(
        'st.shufN',
      )} · ${stats.undosUsed} ${t('st.undoN')}`,
      true,
    ],
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([Icon, label, value, wrap]) => (
        <div className="mj-st2-row" key={label}>
          <span className="mj-st2-row-ico">
            <Icon className="h-4 w-4" />
          </span>
          <span className="mj-st2-row-label">{label}</span>
          <b
            className={
              wrap
                ? 'mj-st2-row-val mj-st2-row-val-wrap tabular-nums'
                : 'mj-st2-row-val tabular-nums'
            }
          >
            {value}
          </b>
        </div>
      ))}
    </div>
  );
}

/** «ПО СЕТИ»: только живые соперники (бот — отдельно, не мешает) */
function OnlineTab() {
  const t = useT();
  const onl = useGame((s) => s.stats.online);
  const total = onl.wins + onl.losses;
  const winrate = total > 0 ? Math.round((onl.wins / total) * 100) : 0;
  if (total === 0) {
    return <p className="mj-st-empty">{t('st.emptyOnline')}</p>;
  }
  return (
    <div className="flex flex-col gap-3.5">
      {/* победы/поражения — две большие понятные карточки */}
      <div className="mj-st2-wl-cards" data-testid="mj-st-online-wl">
        <div className="mj-st2-wl-card mj-st2-wl-card-w">
          <Swords className="h-5 w-5" />
          <b className="tabular-nums">{onl.wins}</b>
          <span>{t('st.winsN', { n: onl.wins })}</span>
        </div>
        <div className="mj-st2-wl-card mj-st2-wl-card-l">
          <X className="h-5 w-5" />
          <b className="tabular-nums">{onl.losses}</b>
          <span>{t('st.lossesN', { n: onl.losses })}</span>
        </div>
      </div>

      {/* доля побед полосой */}
      <div className="mj-st2-wl">
        <div className="mj-st2-wl-nums">
          <span className="mj-st2-wl-w">
            {t('st.wins')} <b>{onl.wins}</b>
          </span>
          <span className="mj-st2-wl-l">
            <b>{onl.losses}</b> {t('st.losses')}
          </span>
        </div>
        <div className="mj-st2-wl-bar">
          <i style={{ width: `${winrate}%` }} />
        </div>
      </div>

      <div className="mj-st2-grid">
        <div className="mj-st2-kpi">
          <BarChart3 className="h-4 w-4" />
          <b>{winrate}%</b>
          <span>{t('st.winrate')}</span>
        </div>
        <div className="mj-st2-kpi">
          <Swords className="h-4 w-4" />
          <b>{total}</b>
          <span>{t('st.onlineTotal')}</span>
        </div>
        <div className="mj-st2-kpi">
          <Flame className="h-4 w-4" />
          <b>{onl.streak >= 0 ? `+${onl.streak}` : onl.streak}</b>
          <span>{t('st.curStreak')}</span>
        </div>
        <div className="mj-st2-kpi">
          <Medal className="h-4 w-4" />
          <b>{onl.bestStreak}</b>
          <span>{t('st.bestStreak')}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- ДРУЗЬЯ: настоящие друзья + история встреч ---------- */

function FriendStatRow({ rec, t }: { rec: FriendRecord; t: ReturnType<typeof useT> }) {
  const total = rec.wins + rec.losses;
  const winrate = total > 0 ? Math.round((rec.wins / total) * 100) : 0;
  return (
    <div className="mj-st2-friend">
      <div
        className="mj-av"
        style={{
          width: 34,
          height: 34,
          background: `linear-gradient(160deg, hsl(${rec.hue} 52% 62%), hsl(${rec.hue} 48% 40%))`,
          borderColor: 'rgba(255,255,255,.55)',
        }}
        aria-hidden
      >
        <span style={{ fontSize: 15 }}>{rec.name[0]?.toUpperCase() ?? '·'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <b className="block truncate text-sm font-black text-stone-800">
          {rec.name}
        </b>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <i className="mj-st2-chip mj-st2-chip-w">
            {t('st.winsN', { n: rec.wins })}
          </i>
          <i className="mj-st2-chip mj-st2-chip-l">
            {t('st.lossesN', { n: rec.losses })}
          </i>
        </span>
      </div>
      <span
        className={
          winrate >= 50
            ? 'mj-st2-winrate mj-st2-winrate-hot'
            : 'mj-st2-winrate'
        }
      >
        {winrate}%
      </span>
    </div>
  );
}

function FriendsTab() {
  const t = useT();
  const friends = useGame((s) => s.stats.friends);
  const realFriends = useFriends((s) => s.friends);
  // настоящие друзья — первыми (у кого нет истории встреч, всё равно покажем)
  const list: FriendRecord[] = realFriends.map((f) => {
    const rec = friends[f.name];
    return (
      rec ?? { name: f.name, hue: 150, played: 0, wins: 0, losses: 0 }
    );
  });
  // история встреч с игроками, которых нет в друзьях
  for (const rec of Object.values(friends)) {
    if (!realFriends.some((f) => f.name === rec.name)) list.push(rec);
  }
  list.sort((a, b) => b.played - a.played);
  if (list.length === 0) {
    return <p className="mj-st-empty">{t('st.emptyFriendsV2')}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {list.map((rec) => (
        <FriendStatRow key={rec.name} rec={rec} t={t} />
      ))}
    </div>
  );
}

export function Standings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: [Tab, typeof Trophy, string][] = [
    ['overview', LayoutGrid, t('st.overview')],
    ['classic', Flower2, t('st.classic')],
    ['online', Swords, t('st.online')],
    ['friends', Users, t('st.friends')],
  ];

  return (
    <div className="mj-table relative flex h-dvh flex-col items-center justify-center gap-3 px-4 py-4 sm:gap-4 sm:px-6">
      <button
        type="button"
        className="mj-circle-btn absolute left-3 top-[max(0.8rem,env(safe-area-inset-top))] sm:left-5"
        onClick={onClose}
        aria-label={t('st.back')}
        title={t('st.back')}
        data-testid="mj-standings-back"
      >
        <ArrowLeft className="h-5 w-5 text-[#22432e] sm:h-6 sm:w-6" />
      </button>

      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-[#e6b84a]" />
        <p className="text-lg font-bold tracking-[0.25em] mj-screen-title sm:text-2xl">
          {t('st.title').toUpperCase()}
        </p>
      </div>

      {/* прокручиваемая зона: экран не должен обрезаться на маленьких
          телефонах — вкладки прилипают сверху, контент катается
          (и только ВНИЗ: горизонтальной прокрутки нет) */}
      <div
        className="mj-card w-full max-w-sm flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 sm:max-w-md sm:p-5"
        data-testid="mj-standings-card"
      >
        <div className="mj-st-tabs mj-st-tabs-four" data-testid="mj-standings-tabs">
          {tabs.map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`mj-st-tab-${id}`}
              className={tab === id ? 'mj-st-tab mj-st-tab-active' : 'mj-st-tab'}
              onClick={() => setTab(id)}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-4" data-testid="mj-standings-body">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'classic' && <ClassicTab />}
          {tab === 'online' && <OnlineTab />}
          {tab === 'friends' && <FriendsTab />}
        </div>
      </div>
    </div>
  );
}
