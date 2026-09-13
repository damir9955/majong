'use client';

/**
 * Точка входа (Task 36): загрузочный экран первой установки.
 *
 * Первый запуск: маркера «игра скачана» нет → окно с полосой
 * прогресса качает ВСЕ файлы (кости, текстуры, скрипты) в кеш
 * Cache API → пишется маркер с версией → открывается игра.
 *
 * Повторный запуск: маркер на месте → игра открывается МГНОВЕННО
 * (всё из кеша, интернет не нужен — офлайн-режим).
 *
 * Вышло обновление: стартуем мгновенно из старого кеша, новую
 * версию тихо перекачиваем в фоне и применяем при следующем
 * запуске — игрок ничего не замечает.
 */

import { useCallback, useEffect, useState } from 'react';
import { useGame } from '@/lib/game/store';
import { setSoundEnabled } from '@/lib/sound';
import { GameScreen } from '@/components/game/GameScreen';
import { TileFace } from '@/components/game/TileFace';
import { BootScreen, type BootState } from '@/components/pwa/BootScreen';
import { GAME_VERSION, readMarker, writeMarker, registerServiceWorker } from '@/lib/pwa/version';
import { downloadAllAssets, backgroundUpdate } from '@/lib/pwa/assets';

function Splash() {
  return (
    <div className="mj-table flex h-dvh flex-col items-center justify-center gap-4">
      <div className="flex items-end gap-2">
        <div className="mj-logo-tile" style={{ transform: 'rotate(-8deg)' }}>
          <TileFace defId="drg-1" />
        </div>
        <div
          className="mj-logo-tile"
          style={{ transform: 'rotate(6deg) translateY(-6px)' }}
        >
          <TileFace defId="drg-2" />
        </div>
      </div>
      <p className="text-lg font-bold tracking-widest text-amber-200/80">МАДЖОНГ</p>
    </div>
  );
}

/** localhost (dev/e2e): пропускать загрузчик — иначе тесты
 *  будут качать все файлы; принудительно — флагом ?mjboot=1 */
function bootAllowedHere(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') {
    return new URLSearchParams(window.location.search).get('mjboot') === '1';
  }
  return true;
}

export default function Page() {
  const hydrated = useGame((s) => s.hydrated);
  const [boot, setBoot] = useState<BootState | null | 'ready'>(null);

  useEffect(() => {
    setSoundEnabled(useGame.getState().settings.sound);
    if (useGame.persist.hasHydrated()) {
      // сохранённая партия: поднять счётчик sid, нормализовать
      // время боя, перезапустить защитные таймеры
      useGame.getState().resumeAfterHydration();
      useGame.getState().setHydrated(true);
    }
    const unsub = useGame.persist.onFinishHydration(() => {
      useGame.getState().resumeAfterHydration();
      useGame.getState().setHydrated(true);
      setSoundEnabled(useGame.getState().settings.sound);
    });
    return unsub;
  }, []);

  const runBoot = useCallback(async () => {
    // 1. Service Worker: офлайн-раздача из кеша
    registerServiceWorker();

    const marker = readMarker();

    // 2. уже скачано, версия та же → мгновенный старт
    if (marker && marker.v === GAME_VERSION) {
      setBoot('ready');
      return;
    }

    // 3. localhost dev/e2e: загрузчик не нужен (если не попросили)
    if (!bootAllowedHere()) {
      setBoot('ready');
      return;
    }

    // 4. сети нет:
    //    — старая версия есть в кеше → стартуем, обновимся позже;
    //    — кеша нет → честно просим подключиться к интернету
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (marker) {
        setBoot('ready');
        window.addEventListener(
          'online',
          () => void backgroundUpdate(),
          { once: true },
        );
        return;
      }
      setBoot({ phase: 'offline', done: 0, total: 0 });
      return;
    }

    // 5. старая версия скачана → старт мгновенный, обновление в фоне
    if (marker) {
      setBoot('ready');
      void backgroundUpdate();
      return;
    }

    // 6. ПЕРВАЯ УСТАНОВКА: качаем всё с полосой прогресса
    setBoot({ phase: 'downloading', done: 0, total: 0 });
    const res = await downloadAllAssets((done, total) => {
      setBoot({ phase: 'downloading', done, total });
    });
    if (res.ok) {
      writeMarker(res.count);
      setBoot('ready');
    } else {
      setBoot({ phase: 'error', done: res.count, total: res.count + res.failed.length });
    }
  }, []);

  useEffect(() => {
    void runBoot();
  }, [runBoot]);

  if (!hydrated) return <Splash />;
  if (boot === null) return <Splash />;
  if (boot !== 'ready') {
    return <BootScreen state={boot} onRetry={() => void runBoot()} />;
  }
  return <GameScreen />;
}
