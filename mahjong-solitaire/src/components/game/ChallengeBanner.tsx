'use client';

/**
 * Баннер челленджа «Божественный ход»: собери пару за 6 секунд —
 * бонус +150 к очкам. Обновляется на каждом тике боя.
 */

import { useGame } from '@/lib/game/store';
import { Zap } from 'lucide-react';

export function ChallengeBanner() {
  const session = useGame((s) => s.session);
  if (!session || session.status !== 'play') return null;
  const ch = session.battle?.challenge;
  if (!ch) return null;

  const left = Math.max(0, ch.endsAt - performance.now());
  const pct = Math.max(0, Math.min(100, (left / ch.totalMs) * 100));

  return (
    <div className="mj-challenge" role="status" aria-label="Челлендж">
      <Zap className="h-4 w-4 shrink-0" />
      <span className="shrink-0 font-bold">Собери пару за {(left / 1000).toFixed(1)}с</span>
      <span className="mj-challenge-track">
        <span className="mj-challenge-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="mj-challenge-bonus shrink-0 font-black tabular-nums">+150</span>
    </div>
  );
}
