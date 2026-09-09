'use client';

/**
 * Матчмейкинг как в Vita Mahjong: поиск соперника → карточка VS →
 * отсчёт 3-2-1 → старт боя. Тапом можно пропустить поиск.
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { LEAGUES, leagueIndexForPoints } from '@/lib/game/league';
import { getSavedName } from '@/lib/rooms/roomApi';
import { playVersus, playCount } from '@/lib/sound';
import { Search } from 'lucide-react';

function SideCard({
  hue,
  initial,
  name,
  leagueIndex,
  delay,
  chip,
  chipColor,
}: {
  hue: number;
  initial: string;
  name: string;
  leagueIndex: number;
  delay: number;
  /** свой чип вместо лиги (напр. «друг» в онлайн-матче) */
  chip?: string;
  chipColor?: string;
}) {
  const color = chipColor ?? LEAGUES[leagueIndex].color;
  return (
    <div className="mj-vs-side" style={{ animationDelay: `${delay}ms` }}>
      <div
        className="mj-av mj-av-lg"
        style={{
          background: `linear-gradient(160deg, hsl(${hue} 52% 62%), hsl(${hue} 48% 40%))`,
          borderColor: color,
        }}
        aria-hidden
      >
        <span>{initial}</span>
      </div>
      <b className="mj-vs-name">{name}</b>
      <span className="mj-league-chip" style={{ borderColor: color, color }}>
        {chip ?? LEAGUES[leagueIndex].name}
      </span>
    </div>
  );
}

export function MatchIntro() {
  const session = useGame((s) => s.session);
  const leaguePoints = useGame((s) => s.league.points);
  // онлайн: соперник уже найден (комната) — радар поиска не нужен
  const online = session?.mode === 'online';
  const [phase, setPhase] = useState<'search' | 'vs' | 'count'>(
    () => (useGame.getState().session?.mode === 'online' ? 'vs' : 'search'),
  );
  const [count, setCount] = useState(3);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const t = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    if (phase === 'search') {
      t(1250, () => setPhase('vs'));
    } else if (phase === 'vs') {
      playVersus();
      t(1750, () => {
        setPhase('count');
        setCount(3);
      });
    } else if (phase === 'count') {
      playCount(false);
      t(600, () => {
        setCount(2);
        playCount(false);
      });
      t(1200, () => {
        setCount(1);
        playCount(false);
      });
      t(1800, () => {
        setCount(0);
        playCount(true);
      });
      t(2350, () => useGame.getState().beginBattle());
    }
    return clearAll;
  }, [phase]);

  if (!session?.battle) return null;
  const b = session.battle;

  // поиск: радар
  if (phase === 'search') {
    return (
      <div
        className="mj-overlay mj-intro"
        onClick={() => setPhase('vs')}
        role="button"
        aria-label="Пропустить поиск"
      >
        <div className="mj-intro-inner">
          <div className="mj-radar">
            <span />
            <span />
            <span />
            <Search className="h-7 w-7" />
          </div>
          <p className="mt-4 text-sm font-bold uppercase tracking-[0.3em] text-stone-100/80">
            Поиск соперника
          </p>
          <p className="mt-2 text-xs text-stone-300/70">
            Уровень {session.level} · {b.totalPairs} пар
          </p>
        </div>
      </div>
    );
  }

  // VS-карточка
  if (phase === 'vs') {
    const myName = online ? getSavedName() || 'Ты' : 'Вы';
    return (
      <div
        className="mj-overlay mj-intro"
        onClick={() => setPhase('count')}
        role="button"
        aria-label="Пропустить"
      >
        <div className="mj-intro-inner">
          <div className="flex items-center gap-3">
            <SideCard
              hue={150}
              initial={myName[0] ?? 'Я'}
              name={myName}
              leagueIndex={leagueIndexForPoints(leaguePoints)}
              delay={0}
              chip={online ? 'ты' : undefined}
              chipColor={online ? '#7fd4c1' : undefined}
            />
            <span className="mj-vs-badge">VS</span>
            <SideCard
              hue={b.opponent.hue}
              initial={b.opponent.name[0]}
              name={b.opponent.name}
              leagueIndex={b.opponent.leagueIndex}
              delay={120}
              chip={online ? 'друг' : undefined}
              chipColor={online ? '#e6b84a' : undefined}
            />
          </div>
          <p className="mt-5 text-xs text-stone-300/70">
            {online ? 'Собери доску быстрее друга' : 'Собери доску быстрее соперника'}
          </p>
        </div>
      </div>
    );
  }

  // отсчёт
  return (
    <div className="mj-overlay mj-intro">
      <div className="mj-intro-inner">
        {count > 0 ? (
          <span key={count} className="mj-count-num tabular-nums">
            {count}
          </span>
        ) : (
          <span className="mj-count-go">Вперёд!</span>
        )}
      </div>
    </div>
  );
}
