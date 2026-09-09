'use client';

/**
 * Реклама с вознаграждением: когда бонус закончился, предлагаем
 * получить 1 бонус за просмотр рекламы (Рекламная сеть Яндекса,
 * блок R-M-20010647-1, награда 1 «Reward» по кабинету сети).
 *
 * Экран 1 — предложение: одна БОЛЬШАЯ кнопка «Смотреть рекламу»
 * по центру и крестик в углу. Экран 2 — ролик: 5 секунд таймер,
 * потом «Забрать награду». Бонус начисляется в потолках (5/5/15).
 */

import { useEffect, useState } from 'react';
import { useGame, type AdBonusKind } from '@/lib/game/store';
import { useT } from '@/lib/i18n';
import { buzz } from '@/lib/sound';
import {
  AD_WATCH_SEC,
  tryRenderYandexRewarded,
  YANDEX_REWARDED_BLOCK_ID,
} from '@/lib/ads/yandexAds';
import { Play, Gift, X } from 'lucide-react';

const CONTAINER_ID = 'mj-yandex-ad-slot';

type Phase = 'offer' | 'watch' | 'done';

export function AdModal() {
  const t = useT();
  const adOffer = useGame((s) => s.adOffer);
  const setAdOffer = useGame((s) => s.setAdOffer);
  const grantAdBonus = useGame((s) => s.grantAdBonus);
  const [phase, setPhase] = useState<Phase>('offer');
  const [left, setLeft] = useState(AD_WATCH_SEC);
  const [prevOffer, setPrevOffer] = useState<AdBonusKind | null>(adOffer);

  // смена предложения (в т.ч. закрытие) — сброс прямо в рендере:
  // рекомендованный React-паттерн вместо setState в эффекте
  if (adOffer !== prevOffer) {
    setPrevOffer(adOffer);
    setPhase('offer');
    setLeft(AD_WATCH_SEC);
  }

  // отсчёт просмотра
  useEffect(() => {
    if (phase !== 'watch') return;
    const iv = window.setInterval(() => {
      setLeft((v) => Math.max(0, v - 1));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [phase]);

  if (!adOffer) return null;
  const kind: AdBonusKind = adOffer;
  const bonusName = t(`bonus.name.${kind}`);
  const canClaim = left <= 0;

  const close = () => {
    buzz(10);
    setAdOffer(null);
  };

  const startWatch = async () => {
    buzz(12);
    setPhase('watch');
    setLeft(AD_WATCH_SEC);
    // пробуем показать реальную рекламу Яндекса; если блок не
    // отрендерился — остаётся наш демо-ролик с таймером
    void tryRenderYandexRewarded(CONTAINER_ID);
  };

  const claim = () => {
    const ok = grantAdBonus(kind);
    buzz(20);
    if (ok) {
      setPhase('done');
      window.setTimeout(() => setAdOffer(null), 1300);
    } else {
      // потолок достигнут — просто закрываем
      setAdOffer(null);
    }
  };

  /* ---------- экран 1: предложение ---------- */
  if (phase === 'offer') {
    return (
      <div className="mj-overlay" data-testid="mj-ad-offer">
        <div className="mj-card relative w-full max-w-sm p-6">
          <button
            type="button"
            className="mj-close-x"
            onClick={close}
            aria-label="×"
            data-testid="mj-ad-close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="mj-ad-ico">
              <Gift className="h-7 w-7 text-white" />
            </span>
            <h2 className="text-2xl font-black text-sky-900">
              {t('ad.title', { bonus: bonusName })}
            </h2>
            <p className="text-sm font-semibold text-stone-600">
              {t('ad.text', { bonus: bonusName })}
            </p>
          </div>
          {/* одна большая кнопка по центру */}
          <button
            className="mj-btn mj-btn-xl mt-5 w-full"
            data-testid="mj-ad-watch"
            onClick={() => void startWatch()}
          >
            <Play className="h-5 w-5" />
            {t('ad.watch')}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- экран 2: ролик ---------- */
  if (phase === 'watch') {
    return (
      <div
        className="mj-ad-screen"
        data-testid="mj-ad-screen"
        role="dialog"
        aria-label={t('ad.ad')}
      >
        {/* контейнер для реального блока Яндекс.РС */}
        <div id={CONTAINER_ID} className="mj-ad-slot" />
        {/* демо-ролик: виден, пока реальный блок не занял место */}
        <div className="mj-ad-demo">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-stone-300/70">
            {t('ad.ad')}
          </p>
          <div className="mj-ad-demo-logo">
            <span className="text-4xl font-black tracking-widest text-amber-200/90">
              MJ
            </span>
          </div>
          <p className="mt-3 text-lg font-black text-stone-100">
            {t('ad.demo', { n: left })}
          </p>
          <div className="mj-ad-progress">
            <div
              className="mj-ad-progress-fill"
              style={{ width: `${((AD_WATCH_SEC - left) / AD_WATCH_SEC) * 100}%` }}
            />
          </div>
        </div>

        {canClaim && (
          <button
            className="mj-btn mj-btn-xl"
            data-testid="mj-ad-claim"
            onClick={claim}
          >
            <Gift className="h-5 w-5" />
            {t('ad.reward')}
          </button>
        )}

        <button
          type="button"
          className="mj-close-x mj-close-x-dark"
          onClick={close}
          aria-label="×"
          data-testid="mj-ad-close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  /* ---------- экран 3: награда получена ---------- */
  return (
    <div className="mj-overlay" data-testid="mj-ad-done">
      <div className="mj-card flex w-full max-w-xs flex-col items-center gap-2 p-6">
        <span className="mj-ad-ico">
          <Gift className="h-7 w-7 text-white" />
        </span>
        <p className="text-xl font-black text-emerald-700">
          {t('ad.done', { bonus: bonusName })}
        </p>
      </div>
    </div>
  );
}

export { YANDEX_REWARDED_BLOCK_ID };
