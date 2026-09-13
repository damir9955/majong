'use client';

/**
 * ЗАГРУЗОЧНЫЙ ЭКРАН первой установки (Task 36).
 *
 * Просьба юзера: «при первой установке должны скачиваться абсолютно
 * все файлы — окно с полосой загрузки, и только после полного
 * скачивания игра открывается; иначе потом картинки не прогружаются».
 *
 * Состояния:
 *  — downloading: полоса «Скачиваем игру… N из M» (кости летят);
 *  — offline: нет сети и ничего не скачано — просим подключиться;
 *  — error: скачивание сорвалось — кнопка «Повторить».
 */

import { useT } from '@/lib/i18n';
import { TileFace } from '@/components/game/TileFace';
import { Download, RefreshCw, WifiOff } from 'lucide-react';

export type BootPhase = 'downloading' | 'offline' | 'error';

export interface BootState {
  phase: BootPhase;
  done: number;
  total: number;
}

export function BootScreen({
  state,
  onRetry,
}: {
  state: BootState;
  onRetry: () => void;
}) {
  const t = useT();
  const pct =
    state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div className="mj-table flex h-dvh flex-col items-center justify-center gap-6 px-8">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-end gap-1.5 sm:gap-2.5">
          <div
            className="mj-logo-tile"
            style={{ transform: 'rotate(-9deg) translateY(2px)' }}
          >
            <TileFace defId="bam-1" />
          </div>
          <div
            className="mj-logo-tile"
            style={{ transform: 'translateY(-5px) rotate(-2deg)' }}
          >
            <TileFace defId="flower-3" />
          </div>
          <div
            className="mj-logo-tile"
            style={{ transform: 'rotate(7deg) translateY(2px)' }}
          >
            <TileFace defId="drg-1" />
          </div>
        </div>
        <p className="mj-screen-title text-lg font-bold tracking-[0.3em] sm:text-2xl">
          {t('home.title')}
        </p>
      </div>

      {state.phase === 'downloading' && (
        <div className="w-full max-w-xs" data-testid="mj-boot">
          <p className="mb-2 flex items-center justify-center gap-2 text-sm font-bold text-emerald-100/90">
            <Download className="h-4 w-4 animate-bounce" />
            {t('boot.title')}
          </p>
          <div className="mj-boot-bar" data-testid="mj-boot-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-center text-xs font-semibold text-emerald-100/85 tabular-nums">
            {t('boot.progress', {
              n: state.done,
              m: state.total,
              p: pct,
            })}
          </p>
          <p className="mt-1 text-center text-[11px] font-semibold text-emerald-100/75">
            {t('boot.hint')}
          </p>
        </div>
      )}

      {state.phase === 'offline' && (
        <div
          className="w-full max-w-xs rounded-2xl border border-emerald-100/15 bg-black/20 p-5 text-center"
          data-testid="mj-boot-offline"
        >
          <WifiOff className="mx-auto h-8 w-8 text-emerald-200/80" />
          <p className="mt-3 text-sm font-bold text-emerald-100/90">
            {t('boot.needNet')}
          </p>
          <button
            className="mj-btn mj-btn-ghost mt-4 w-full"
            onClick={onRetry}
            data-testid="mj-boot-retry"
          >
            {t('boot.retry')}
          </button>
        </div>
      )}

      {state.phase === 'error' && (
        <div
          className="w-full max-w-xs rounded-2xl border border-emerald-100/15 bg-black/20 p-5 text-center"
          data-testid="mj-boot-error"
        >
          <p className="text-sm font-bold text-emerald-100/90">
            {t('boot.failed')}
          </p>
          <button
            className="mj-btn mj-btn-ghost mt-4 w-full gap-2"
            onClick={onRetry}
          >
            <RefreshCw className="h-4 w-4" />
            {t('boot.retry')}
          </button>
        </div>
      )}
    </div>
  );
}
