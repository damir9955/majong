'use client';

/**
 * Итог матча 1v1: победа/поражение, сравнение очков, трофеи,
 * прогресс лиги и кнопки.
 *
 * ОНЛАЙН (Task 25): новый матч — только по согласию ОБоИХ.
 *  — нажал «Реванш» → «Ждём согласия соперника…»;
 *  — соперник нажал раньше → вопрос «соперник предлагает
 *    реванш — согласен?» ([Согласиться] / [Отказаться]);
 *  — оба согласились → сервер стартует матч автоматически.
 * Автоперехода в онлайн больше нет (только в матче с ботом).
 *
 * Бот: [Реванш] / [Дальше], автопереход на следующий уровень
 * после победы. Если друга в комнате нет — только «В меню».
 */

import { useEffect, useState } from 'react';
import { useGame, type BonusItem, type MatchResult } from '@/lib/game/store';
import {
  LEAGUES,
  leagueIndexForPoints,
  leagueProgress,
} from '@/lib/game/league';
import { useT, useLang, leagueName } from '@/lib/i18n';
import { apiLeave, clearCreds } from '@/lib/rooms/roomApi';
import { confetti } from '@/lib/game/fx';
import { playTrophy, buzz } from '@/lib/sound';
import { Trophy, Lightbulb, Shuffle, Swords, Hourglass } from 'lucide-react';

function BonusChip({ kind, delay }: { kind: BonusItem; delay: number }) {
  const t = useT();
  const isHint = kind === 'hint';
  return (
    <span className="mj-bonus-chip" style={{ animationDelay: `${delay}ms` }}>
      {isHint ? (
        <Lightbulb className="h-4 w-4 text-amber-600" />
      ) : (
        <Shuffle className="h-4 w-4 text-[#2e6b52]" />
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
  // «Отказаться» от предложения реванша — прячем вопрос,
  // обычные кнопки остаются доступны
  const [declined, setDeclined] = useState(false);

  const res = session?.battle?.result ?? null;
  const bonuses = session?.bonusGrant ?? [];
  const online = session?.mode === 'online';
  const won = res?.outcome === 'win';
  // друга в комнате уже нет — продолжать матч не с кем
  const oppGone =
    !!res && (res.reason === 'left' || res.reason === 'disconnect');

  const on = session?.battle?.online;
  const myAdvance = on?.myAdvance ?? null;
  const oppAdvance = on?.oppAdvance ?? null;
  // соперник уже предложил реванш, а я ещё не отвечал
  const askAccept =
    online && !oppGone && oppAdvance === 'rematch' && !myAdvance && !declined;
  // я предложил — жду согласия соперника
  const waitingConsent =
    online && !oppGone && myAdvance === 'rematch' && !oppAdvance;

  useEffect(() => {
    if (!res) return;
    if (won) {
      confetti();
    }
    const t1 = window.setTimeout(() => playTrophy(), 900);
    // автопереход — только матч с ботом (в онлайн решают игроки)
    const autoMs = !online && won ? 7500 : 0;
    const t2 = autoMs
      ? window.setTimeout(() => useGame.getState().nextLevel(), autoMs)
      : 0;
    return () => {
      window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
    };
  }, [res, won, online]);

  if (!res) return null;

  /** выйти из комнаты после итога: другу сразу «ушёл», мне — в меню */
  const exitRoom = () => {
    const onl = useGame.getState().session?.battle?.online;
    if (onl) {
      void apiLeave(onl.code, onl.playerId).catch(() => {});
    }
    clearCreds();
    useGame.setState({ session: null, showMenu: true });
  };

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
            won ? 'text-emerald-800' : 'text-rose-600'
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

        {/* ---- вопрос о реванше: соперник уже согласен ---- */}
        {askAccept && (
          <div className="mj-rematch-ask mt-4" data-testid="mj-rematch-ask">
            <p className="text-[15px] font-bold text-stone-800">
              {t('rem.offer')}
            </p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                className="mj-btn"
                data-testid="mj-rematch-accept"
                onClick={() => {
                  buzz(15);
                  restartLevel();
                }}
              >
                {t('rem.accept')}
              </button>
              <button
                className="mj-btn mj-btn-ghost"
                data-testid="mj-rematch-decline"
                onClick={() => {
                  buzz(10);
                  setDeclined(true);
                }}
              >
                {t('rem.decline')}
              </button>
            </div>
          </div>
        )}

        {/* ---- я предложил — ждём согласия соперника ---- */}
        {waitingConsent && (
          <p
            className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-stone-700"
            data-testid="mj-rematch-waiting"
          >
            <Hourglass className="h-4 w-4 animate-pulse text-amber-600" />
            {t('rem.waiting')}
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-3">
          {oppGone ? (
            <button className="mj-btn" onClick={exitRoom}>
              {t('res.menu')}
            </button>
          ) : online ? (
            <>
              {!myAdvance && (
                <button
                  className="mj-btn-secondary"
                  data-testid="mj-btn-rematch"
                  onClick={() => {
                    buzz(15);
                    restartLevel();
                  }}
                >
                  {t('res.rematch')}
                </button>
              )}
              <button className="mj-btn mj-btn-ghost" onClick={exitRoom}>
                {t('res.menu')}
              </button>
            </>
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
