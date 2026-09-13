'use client';

/**
 * СТАТИСТИКА v2 — полностью переработанный экран (Task 36).
 *
 * Было: три вкладки с сухими строками «Побед — 3», ничего не
 * понятно и всё криво. Стало:
 *  — «ОБЗОР»: лига-герой с прогрессом до следующей, KPI-плитки,
 *    кольцо винрейта и ДОСТИЖЕНИЯ с прогрессом (новое!);
 *  — «КЛАССИКА»: подробности — уровни, пары, серии, лучшее
 *    время, время в игре, потраченные бонусы;
 *  — «МАТЧИ»: лига, трофеи (сейчас/пик), полоса побед-поражений,
 *    винрейт, текущая и ЛУЧШАЯ серия;
 *  — «ДРУЗЬЯ»: аватары, W—L, винрейт-чип.
 */

import { useState } from 'react';
import { useGame, type FriendRecord } from '@/lib/game/store';
import { useT, leagueName, useLang } from '@/lib/i18n';
import { leagueIndexForPoints, LEAGUES, leagueProgress } from '@/lib/game/league';
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
} from 'lucide-react';

type Tab = 'overview' | 'classic' | 'matches' | 'friends';

/* ---------- форматирование ---------- */

function fmtTime(ms: number, t: ReturnType<typeof useT>): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} ${t('tu.sec')}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${t('tu.min')} ${s % 60} ${t('tu.sec')}`;
  const h = Math.floor(m / 60);
  return `${h} ${t('tu.h')} ${m % 60} ${t('tu.min')}`;
}

/* ---------- достижения (новое) ---------- */

interface AchDef {
  id: string;
  label: string;
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
      icon: Star,
      value: classic.pairsMatched,
      tiers: [1, 50, 250, 1000],
    },
    {
      id: 'levels',
      label: t('ach.levels'),
      icon: Target,
      value: classic.levelsCleared,
      tiers: [1, 5, 25, 100],
    },
    {
      id: 'wins',
      label: t('ach.wins'),
      icon: Swords,
      value: league.wins,
      tiers: [1, 10, 50],
    },
    {
      id: 'streak',
      label: t('ach.streak'),
      icon: Flame,
      value: league.bestStreak,
      tiers: [2, 5, 10],
    },
    {
      id: 'friends',
      label: t('ach.friends'),
      icon: Handshake,
      value: friendsGames,
      tiers: [1, 5, 20],
    },
    {
      id: 'league',
      label: t('ach.league'),
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

function AchCard({ def }: { def: AchDef }) {
  const t = useT();
  const st = achState(def);
  const Icon = def.icon;
  return (
    <div
      className={st.doneAll ? 'mj-st2-ach mj-st2-ach-done' : 'mj-st2-ach'}
      data-testid={`mj-ach-${def.id}`}
    >
      <span className="mj-st2-ach-ico">
        {st.doneAll ? (
          <Medal className="h-5 w-5" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </span>
      <span className="mj-st2-ach-body">
        <b>{def.label}</b>
        <span className="mj-st2-bar">
          <i style={{ width: `${Math.round(st.progress * 100)}%` }} />
        </span>
        <span className="mj-st2-ach-meta">
          {st.doneAll ? (
            <>
              <Check className="h-3.5 w-3.5" /> {t('ach.done')}
            </>
          ) : (
            t('ach.progress', { n: Math.min(def.value, st.nextTier), m: st.nextTier })
          )}
        </span>
      </span>
    </div>
  );
}

/* ---------- кольцо винрейта ---------- */

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

      {/* достижения */}
      <p className="mj-st2-title">{t('ach.title')}</p>
      <div className="mj-st2-ach-grid">
        {achs.map((a) => (
          <AchCard key={a.id} def={a} />
        ))}
      </div>
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

function MatchesTab() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const league = useGame((s) => s.league);
  const idx = leagueIndexForPoints(league.points);
  const cur = LEAGUES[idx];
  const next = LEAGUES[idx + 1];
  const progress = leagueProgress(league.points);
  const total = league.wins + league.losses;
  const winrate = total > 0 ? Math.round((league.wins / total) * 100) : 0;
  if (total === 0) {
    return <p className="mj-st-empty">{t('st.emptyMatches')}</p>;
  }
  const wl = [
    league.wins,
    league.losses,
  ];
  const wlPct =
    total > 0 ? Math.round((wl[0] / (wl[0] + wl[1] || 1)) * 100) : 0;
  return (
    <div className="flex flex-col gap-3.5">
      {/* лига-герой */}
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

      {/* победы/поражения — полоса доли */}
      <div className="mj-st2-wl" data-testid="mj-st-wl">
        <div className="mj-st2-wl-nums">
          <span className="mj-st2-wl-w">
            {t('st.wins')} <b>{wl[0]}</b>
          </span>
          <span className="mj-st2-wl-l">
            <b>{wl[1]}</b> {t('st.losses')}
          </span>
        </div>
        <div className="mj-st2-wl-bar">
          <i style={{ width: `${wlPct}%` }} />
        </div>
      </div>

      <div className="mj-st2-grid">
        <div className="mj-st2-kpi">
          <BarChart3 className="h-4 w-4" />
          <b>{winrate}%</b>
          <span>{t('st.winrate')}</span>
        </div>
        <div className="mj-st2-kpi">
          <Flame className="h-4 w-4" />
          <b>
            {league.streak >= 0 ? `+${league.streak}` : league.streak}
          </b>
          <span>{t('st.curStreak')}</span>
        </div>
        <div className="mj-st2-kpi">
          <Medal className="h-4 w-4" />
          <b>{league.bestStreak}</b>
          <span>{t('st.bestStreak')}</span>
        </div>
        <div className="mj-st2-kpi">
          <Trophy className="h-4 w-4" />
          <b>{league.pointsBest}</b>
          <span>{t('st.peak')}</span>
        </div>
      </div>
    </div>
  );
}

function FriendRow({ rec, t }: { rec: FriendRecord; t: ReturnType<typeof useT> }) {
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
        <span className="block text-xs font-semibold text-stone-500">
          {t('st.played')} {rec.played} · {t('st.wl')} {rec.wins}—{rec.losses}
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
  const list = Object.values(friends).sort((a, b) => b.played - a.played);
  if (list.length === 0) {
    return <p className="mj-st-empty">{t('st.emptyFriends')}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {list.map((rec) => (
        <FriendRow key={rec.name} rec={rec} t={t} />
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
    ['matches', Swords, t('st.matches')],
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
          телефонах — вкладки прилипают сверху, контент катается */}
      <div className="mj-card w-full max-w-sm flex-1 overflow-y-auto overscroll-contain p-4 sm:max-w-md sm:p-5">
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
          {tab === 'matches' && <MatchesTab />}
          {tab === 'friends' && <FriendsTab />}
        </div>
      </div>
    </div>
  );
}
