'use client';

/**
 * Итог матча 1v1: победа/поражение, сравнение очков, трофеи,
 * прогресс лиги и кнопки «Реванш»/«Дальше». После победы —
 * автопереход на следующий уровень.
 */

import { useEffect } from 'react';
import { useGame, type BonusItem, type MatchResult } from '@/lib/game/store';
import { LEAGUES, leagueIndexForPoints, leagueProgress } from '@/lib/game/league';
import { confetti } from '@/lib/game/fx';
import { playTrophy } from '@/lib/sound';
import { Trophy, Lightbulb, Shuffle, Swords } from 'lucide-react';

const REASON_TEXT: Record<MatchResult['reason'], string> = {
  cleared: 'Доска собрана',
  opponent: 'Соперник собрал первым',
  timeout: 'Время вышло',
  tray: 'Нет места',
};

function BonusChip({ kind, delay }: { kind: BonusItem; delay: number }) {
  const isHint = kind === 'hint';
  return (
    <span className="mj-bonus-chip" style={{ animationDelay: `${delay}ms` }}>
      {isHint ? (
        <Lightbulb className="h-4 w-4 text-amber-600" />
      ) : (
        <Shuffle className="h-4 w-4 text-sky-600" />
      )}
      {isHint ? 'Подсказка +1' : 'Перемешать +1'}
    </span>
  );
}

export function BattleResult() {
  const session = useGame((s) => s.session);
  const league = useGame((s) => s.league);
  const nextLevel = useGame((s) => s.nextLevel);
  const restartLevel = useGame((s) => s.restartLevel);

  const res = session?.battle?.result ?? null;
  const bonuses = session?.bonusGrant ?? [];

  const won = res?.outcome === 'win';

  useEffect(() => {
    if (!res) return;
    if (won) {
      confetti();
      const t1 = window.setTimeout(() => playTrophy(), 900);
      const t2 = window.setTimeout(() => useGame.getState().nextLevel(), 7500);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
  }, [res, won]);

  if (!res) return null;

  const leagueIdx = leagueIndexForPoints(league.points);
  const cur = LEAGUES[leagueIdx];
  const next = LEAGUES[leagueIdx + 1];
  const progress = leagueProgress(league.points);
  const toNext = next ? next.min - league.points : 0;

  return (
    <div className="mj-overlay mj-res">
      <div className="mj-card mj-result-card">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.3em] text-stone-500">
          <Swords className="h-3.5 w-3.5" />
          матч · уровень {session?.level}
        </p>
        <h2
          className={`mt-1 text-4xl font-black ${
            won ? 'text-sky-700' : 'text-rose-600'
          }`}
        >
          {won ? 'Победа!' : 'Поражение'}
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-stone-500">
          {REASON_TEXT[res.reason]}
        </p>

        {/* сравнение очков */}
        <div className="mj-res-scores mt-4">
          <div className="mj-res-col">
            <b className="mj-res-n tabular-nums">{res.myScore}</b>
            <span>Вы</span>
          </div>
          <span className="mj-res-sep">—</span>
          <div className="mj-res-col">
            <b className="mj-res-n mj-res-n-bot tabular-nums">{res.botScore}</b>
            <span>{session?.battle?.opponent.name}</span>
          </div>
        </div>

        {/* трофеи и лига */}
        <div className="mj-res-league mt-4">
          <div className="flex items-center justify-center gap-2">
            <Trophy
              className={`h-5 w-5 ${res.trophiesDelta >= 0 ? 'text-amber-500' : 'text-stone-400'}`}
            />
            <b
              className={`tabular-nums text-lg ${
                res.trophiesDelta >= 0 ? 'text-amber-600' : 'text-stone-500'
              }`}
            >
              {res.trophiesDelta >= 0 ? '+' : ''}
              {res.trophiesDelta}
            </b>
            <span className="text-sm font-semibold" style={{ color: cur.color }}>
              {cur.name}
            </span>
            <span className="text-xs text-stone-400 tabular-nums">
              {league.points}
            </span>
          </div>
          <div className="mj-league-track mt-2">
            <div
              className="mj-league-fill"
              style={{
                width: `${progress * 100}%`,
                background: `linear-gradient(90deg, ${cur.color}, ${next?.color ?? cur.color})`,
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-stone-400">
            {next
              ? `До «${next.name}»: ${toNext} трофеев`
              : 'Высшая лига достигнута'}
          </p>
        </div>

        {won && bonuses.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {bonuses.map((b, i) => (
              <BonusChip key={`${b}-${i}`} kind={b} delay={450 + i * 170} />
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            className="mj-btn-secondary"
            onClick={restartLevel}
          >
            Реванш
          </button>
          <button className="mj-btn" onClick={nextLevel}>
            Дальше
          </button>
        </div>
      </div>
    </div>
  );
}
