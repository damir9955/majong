'use client';

/**
 * Турнирная таблица: три вкладки — «Классика», «Матчи», «С друзьями».
 * Классика: пройденные уровни, собранные пары, партий. Матчи:
 * лига, трофеи, победы/поражения, серия. Друзья: итоги встреч
 * с каждым другом (по имени из онлайн-матчей).
 */

import { useState } from 'react';
import { useGame, type FriendRecord } from '@/lib/game/store';
import { useT, leagueName, useLang } from '@/lib/i18n';
import { leagueIndexForPoints, LEAGUES, leagueProgress } from '@/lib/game/league';
import { ArrowLeft, Trophy, Flower2, Swords, Users } from 'lucide-react';

type Tab = 'classic' | 'matches' | 'friends';

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mj-st-row">
      <span>{label}</span>
      <b className="tabular-nums">{value}</b>
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
  return (
    <div className="flex flex-col gap-2">
      <Row label={t('st.levelsCleared')} value={stats.levelsCleared} />
      <Row label={t('home.level', { n: level })} value={level} />
      <Row label={t('st.pairsMatched')} value={stats.pairsMatched} />
      <Row label={t('st.games')} value={stats.games} />
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
  return (
    <div className="flex flex-col gap-2">
      {/* лига — крупная плашка */}
      <div className="mj-st-league" style={{ borderColor: cur.color }}>
        <span className="mj-st-league-name" style={{ color: cur.color }}>
          {leagueName(idx, lang)}
        </span>
        <span className="mj-st-league-pts tabular-nums">
          {league.points} {t('st.trophies').toLowerCase()}
        </span>
      </div>
      <div className="mj-league-track">
        <div
          className="mj-league-fill"
          style={{
            width: `${progress * 100}%`,
            background: `linear-gradient(90deg, ${cur.color}, ${next?.color ?? cur.color})`,
          }}
        />
      </div>
      <Row label={t('st.wins')} value={league.wins} />
      <Row label={t('st.losses')} value={league.losses} />
      <Row label={t('st.winrate')} value={`${winrate}%`} />
      <Row
        label={t('st.streak')}
        value={
          league.streak >= 0
            ? t('st.streakHot', { n: league.streak })
            : t('st.streakCold', { n: -league.streak })
        }
      />
    </div>
  );
}

function FriendRow({ rec, t }: { rec: FriendRecord; t: ReturnType<typeof useT> }) {
  const total = rec.wins + rec.losses;
  const winrate = total > 0 ? Math.round((rec.wins / total) * 100) : 0;
  return (
    <div className="mj-st-friend">
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
      <span className="mj-st-winrate tabular-nums">{winrate}%</span>
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
  const [tab, setTab] = useState<Tab>('classic');

  const tabs: [Tab, typeof Trophy, string][] = [
    ['classic', Flower2, t('st.classic')],
    ['matches', Swords, t('st.matches')],
    ['friends', Users, t('st.friends')],
  ];

  return (
    <div className="mj-table relative flex h-dvh flex-col items-center justify-center gap-4 px-5">
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
        <p className="text-lg font-bold tracking-[0.25em] text-amber-200/85 sm:text-2xl">
          {t('st.title').toUpperCase()}
        </p>
      </div>

      <div className="mj-card w-full max-w-sm p-5 sm:p-6">
        <div className="mj-st-tabs" data-testid="mj-standings-tabs">
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
          {tab === 'classic' && <ClassicTab />}
          {tab === 'matches' && <MatchesTab />}
          {tab === 'friends' && <FriendsTab />}
        </div>
      </div>
    </div>
  );
}
