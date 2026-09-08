'use client';

/**
 * Верхняя панель матча 1v1: аватары и очки обоих игроков,
 * таймер по центру и двойная шкала гонки (кто дальше по доске).
 */

import { useGame } from '@/lib/game/store';
import { LEAGUES, leagueIndexForPoints } from '@/lib/game/league';

function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Avatar({
  hue,
  initial,
  leagueIndex,
  size = 36,
}: {
  hue: number;
  initial: string;
  leagueIndex: number;
  size?: number;
}) {
  const color = LEAGUES[leagueIndex].color;
  return (
    <div
      className="mj-av"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, hsl(${hue} 52% 62%), hsl(${hue} 48% 40%))`,
        borderColor: color,
      }}
      aria-hidden
    >
      <span style={{ fontSize: size * 0.42 }}>{initial}</span>
    </div>
  );
}

export function VersusBar() {
  const session = useGame((s) => s.session);
  const leaguePoints = useGame((s) => s.league.points);
  if (!session?.battle) return null;
  const b = session.battle;
  const myLeague = leagueIndexForPoints(leaguePoints);
  const mePct = Math.min(100, (b.myPairsDone / b.totalPairs) * 100);
  const botPct = Math.min(
    100,
    ((b.botPairsDone + b.botProgress) / b.totalPairs) * 100,
  );
  const low = b.timeLeftMs < 15000;

  return (
    <header className="mj-versus z-20 shrink-0 px-3 pb-1.5 pt-[max(0.55rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        {/* я */}
        <div className="mj-vside">
          <Avatar hue={150} initial="Я" leagueIndex={myLeague} />
          <div className="mj-vinfo">
            <span className="mj-vname">Вы</span>
            <span className="flex items-baseline gap-1">
              <span className="mj-vscore tabular-nums">{b.myScore}</span>
              {b.myCombo > 1 && (
                <span className="mj-combo tabular-nums">×{b.myCombo}</span>
              )}
            </span>
          </div>
        </div>

        {/* таймер + гонка */}
        <div className="mj-vmid">
          <div className={`mj-timer tabular-nums ${low ? 'mj-timer-low' : ''}`}>
            {fmtTime(b.timeLeftMs)}
          </div>
          <div className="mj-race" aria-label="Прогресс гонки">
            <div className="mj-race-row">
              <div
                className="mj-race-fill mj-race-me"
                style={{ width: `${mePct}%` }}
              />
            </div>
            <div className="mj-race-row">
              <div
                className="mj-race-fill mj-race-bot"
                style={{ width: `${botPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* соперник */}
        <div className="mj-vside mj-vside-right">
          <div className="mj-vinfo mj-vinfo-right">
            <span className="mj-vname">{b.opponent.name}</span>
            <span className="flex items-baseline gap-1 justify-end">
              {b.botCombo > 1 && (
                <span className="mj-combo mj-combo-bot tabular-nums">
                  ×{b.botCombo}
                </span>
              )}
              <span className="mj-vscore tabular-nums">{b.botScore}</span>
            </span>
          </div>
          <Avatar
            hue={b.opponent.hue}
            initial={b.opponent.name[0]}
            leagueIndex={b.opponent.leagueIndex}
          />
        </div>
      </div>
    </header>
  );
}
