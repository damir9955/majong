'use client';

/**
 * Итог матча 1v1: победа/поражение, сравнение очков, трофеи,
 * прогресс лиги и кнопки «Реванш»/«Дальше». После победы —
 * автопереход на следующий уровень. Если друга в комнате нет —
 * только «В меню» (комната зачищена, никаких «вернуться в матч»).
 */

import { useEffect } from 'react';
import { useGame, type BonusItem, type MatchResult } from '@/lib/game/store';
import {
  LEAGUES,
  leagueIndexForPoints,
  leagueProgress,
} from '@/lib/game/league';
import { useT, useLang, leagueName } from '@/lib/i18n';
import { clearCreds } from '@/lib/rooms/roomApi';
import { confetti } from '@/lib/game/fx';
import { playTrophy } from '@/lib/sound';
import { Trophy, Lightbulb, Shuffle, Swords } from 'lucide-react';

function BonusChip({ kind, delay }: { kind: BonusItem; delay: number }) {
  const t = useT();
  const isHint = kind === 'hint';
  return (
    <span className="mj-bonus-chip" style={{ animationDelay: `${delay}ms` }}>
      {isHint ? (
        <Lightbulb className="h-4 w-4 text-amber-600" />
      ) : (
        <Shuffle className="h-4 w-4 text-sky-600" />
      )}
      {t(isHint ? 'bonus.hint' : 'bonus.shuffle')}
    </span>
  );
}

export function BattleResult() {
  const session = useGame((s) => s.session);
  const league = useGame((s) => s.league);
  const nextLevel = useGame((s) => s.nextLevel);
  const restartLevel = useGame((s) => s.restartLevel);
  const t = useT();
  const lang = useLang((s) => s.lang);

  const res = session?.battle?.result ?? null;
  const bonuses = session?.bonusGrant ?? [];
  const online = session?.mode === 'online';
  const won = res?.outcome === 'win';
  // друга в комнате уже нет — продолжать матч не с кем
  const oppGone =
    !!res && (res.reason === 'left' || res.reason === 'disconnect');

  useEffect(() => {
    if (!res) return;
    if (won) {
      confetti();
    }
    const t1 = window.setTimeout(() => playTrophy(), 900);
    // автопереход: в боте — после победы; в онлайн — если друг ещё
    // в комнате и никто не нажал кнопку (кто первый — того и воля)
    const autoMs = online && !oppGone ? 12000 : won ? 7500 : 0;
    const t2 = autoMs
      ? window.setTimeout(() => useGame.getState().nextLevel(), autoMs)
      : 0;
    return () => {
      window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
    };
  }, [res, won, online, oppGone]);

  if (!res) return null;

  const leagueIdx = leagueIndexForPoints(league.points);
  const cur = LEAGUES[leagueIdx];
  const next = LEAGUES[leagueIdx + 1];
  const progress = leagueProgress(league.points);
  const toNext = next ? next.min - league.points : 0;
  const reasonText = t(`res.reason.${res.reason as MatchResult['reason']}`);

  return (
    <div className="mj-overlay mj-res">
      <div className="mj-card mj-result-card">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.3em] text-stone-500">
          <Swords className="h-3.5 w-3.5" />
          {t('res.match', { n: session?.level ?? 1 })}
        </p>
        <h2
          className={`mt-1 text-4xl font-black ${
            won ? 'text-sky-700' : 'text-rose-600'
          }`}
        >
          {won ? t('res.win') : t('res.lose')}
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-stone-500">
          {reasonText}
        </p>

        {/* сравнение очков */}
        <div className="mj-res-scores mt-4">
          <div className="mj-res-col">
            <b className="mj-res-n tabular-nums">{res.myScore}</b>
            <span>{t('vs.you')}</span>
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
              {leagueName(leagueIdx, lang)}
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
              ? t('res.toNext', { name: leagueName(leagueIdx + 1, lang), n: toNext })
              : t('res.topLeague')}
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
          {oppGone ? (
            <button
              className="mj-btn"
              onClick={() => {
                clearCreds();
                useGame.setState({ session: null, showMenu: true });
              }}
            >
              {t('res.menu')}
            </button>
          ) : (
            <>
              <button className="mj-btn-secondary" onClick={restartLevel}>
                {t('res.rematch')}
              </button>
              <button className="mj-btn" onClick={nextLevel}>
                {t('res.next')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
