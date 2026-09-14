'use client';

/**
 * Матчмейкинг как в Vita Mahjong: карточка VS → отсчёт 3-2-1 → старт.
 *
 * Task 37 «синхронизация устройств»: у ОНЛАЙН-матча отсчёт привязан
 * к серверному моменту startedAt (Battle.online.startAt, с поправкой
 * хода часов). Оба игрока — и тот, кто ждал в комнате, и тот, кто
 * вошёл вторым, — начинают тапать в ОДИН момент: ранний ждёт в
 * интро дольше, поздний короче, но стрелки стартуют одновременно.
 * Тап по экрану якорь не сдвигает (это была бы нечестная фора).
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { LEAGUES, leagueIndexForPoints } from '@/lib/game/league';
import { useT } from '@/lib/i18n';
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

/** длительность кусочков отсчёта */
const N_MS = 820; // одна цифра «3 / 2 / 1»
const GO_MS = 560; // финальное «Вперёд!»
const VS_MS = 1750; // карточка VS (и поиск у бота — 1250 до неё)
/** окно отсчёта: «3»+«2»+«1»+GO — столько остаётся до старта,
 *  когда VS-карточка уже сменилась цифрами */
const COUNT_WINDOW = GO_MS + 3 * N_MS;

export function MatchIntro() {
  const session = useGame((s) => s.session);
  const leaguePoints = useGame((s) => s.league.points);
  const t = useT();
  // онлайн: соперник уже найден (комната) — радар поиска не нужен
  const online = session?.mode === 'online';
  const b = session?.battle;

  /** абсолютный момент старта (локальные часы):
   *  онлайн — серверный якорь startAt; бот/классика — свой таймлайн
   *  (поиск 1250 → VS 1750 → отсчёт 2350). */
  const [startAt] = useState<number>(() => {
    const sa = useGame.getState().session?.battle?.online?.startAt ?? 0;
    if (useGame.getState().session?.mode === 'online' && sa > 0) {
      // поздняя вьюха (якорь уже почти прошёл) — минимальное «3-2-1»,
      // чтобы игрок не стартовал вслепую
      return Math.max(sa, Date.now() + COUNT_WINDOW + 200);
    }
    return Date.now() + 1250 + VS_MS + COUNT_WINDOW;
  });

  // перерисовка таймлайна: ~10 раз/сек — цифры и VS переключаются
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(iv);
  }, []);

  // звук на смене фаз (однократный)
  const phaseRef = useRef('');
  const remain = startAt - now;
  // фаза: 'search' (бот) → 'vs' → цифры 3..1 → старт
  const phase: 'search' | 'vs' = !online
    ? remain > COUNT_WINDOW + VS_MS
      ? 'search'
      : 'vs'
    : 'vs';
  const countNum =
    remain > GO_MS ? Math.max(1, Math.min(3, Math.ceil((remain - GO_MS) / N_MS))) : 0;

  useEffect(() => {
    let key = '';
    if (phase === 'search') key = 's';
    else if (phase === 'vs') key = 'vs';
    else if (remain <= GO_MS) key = 'go';
    else key = `n${countNum}`;
    if (phaseRef.current === key) return;
    phaseRef.current = key;
    if (key === 'vs') {
      if (!online) return; // у бота звук VS — при входе в фазу ниже
      playVersus();
    } else if (key === 'go') {
      playCount(true);
    } else if (key.startsWith('n')) {
      playCount(false);
    }
  }, [phase, countNum, remain, online]);

  // бот: звук VS при переходе поиск → карточка
  const vsSoundRef = useRef(false);
  useEffect(() => {
    if (online || vsSoundRef.current) return;
    if (phase === 'vs') {
      vsSoundRef.current = true;
      playVersus();
    }
  }, [phase, online]);

  // СТАРТ ровно в якорный момент (и страховочный таймаут — интервал
  // в свёрнутой вкладке может дросселироваться)
  const begunRef = useRef(false);
  useEffect(() => {
    if (begunRef.current) return;
    const s = useGame.getState().session;
    if (!s?.battle || s.battle.started || s.status !== 'play') return;
    const ms = startAt - Date.now();
    const fire = () => {
      if (begunRef.current) return;
      begunRef.current = true;
      useGame.getState().beginBattle();
    };
    if (ms <= 0) {
      fire();
      return;
    }
    const tm = window.setTimeout(fire, ms + 20);
    return () => window.clearTimeout(tm);
  }, [startAt, now]);

  if (!b) return null;

  // поиск: радар (только бот/классика) — тап пропускает поиск,
  // но НЕ сдвигает якорь старта
  if (phase === 'search') {
    return (
      <div
        className="mj-overlay mj-intro"
        onClick={() => setNow(Date.now() - (startAt - COUNT_WINDOW - VS_MS) + 1)}
        role="button"
        aria-label={t('mi.skip')}
      >
        <div className="mj-intro-inner">
          <div className="mj-radar">
            <span />
            <span />
            <span />
            <Search className="h-7 w-7" />
          </div>
          <p className="mt-4 text-sm font-bold uppercase tracking-[0.3em] text-stone-100/80">
            {t('mi.search')}
          </p>
          <p className="mt-2 text-xs text-stone-300/70">
            {t('mi.searchSub', { n: session?.level ?? 1, p: b.totalPairs })}
          </p>
        </div>
      </div>
    );
  }

  // VS-карточка (у онлайна тап ничего не меняет — старт по якорю);
  // как только до старта остался кусок «3-2-1» — сменяем цифрами
  if (remain > COUNT_WINDOW) {
    const myName = online ? getSavedName() || t('vs.me') : t('vs.you');
    return (
      <div className="mj-overlay mj-intro" aria-label={t('mi.skip')}>
        <div className="mj-intro-inner">
          <div className="flex items-center gap-3">
            <SideCard
              hue={150}
              initial={myName[0] ?? 'Я'}
              name={myName}
              leagueIndex={leagueIndexForPoints(leaguePoints)}
              delay={0}
              chip={online ? t('mi.youChip') : undefined}
              chipColor={online ? '#7fd4c1' : undefined}
            />
            <span className="mj-vs-badge">VS</span>
            <SideCard
              hue={b.opponent.hue}
              initial={b.opponent.name[0]}
              name={b.opponent.name}
              leagueIndex={b.opponent.leagueIndex}
              delay={120}
              chip={online ? t('mi.friendChip') : undefined}
              chipColor={online ? '#e6b84a' : undefined}
            />
          </div>
          <p className="mt-5 text-xs text-stone-300/70">
            {online ? t('mi.fasterFriend') : t('mi.faster')}
          </p>
        </div>
      </div>
    );
  }

  // отсчёт: «3 / 2 / 1» → «Вперёд!» — финал ровно в якорный момент
  return (
    <div className="mj-overlay mj-intro">
      <div className="mj-intro-inner">
        {countNum > 0 ? (
          <span key={countNum} className="mj-count-num tabular-nums">
            {countNum}
          </span>
        ) : (
          <span className="mj-count-go">{t('mi.go')}</span>
        )}
      </div>
    </div>
  );
}
