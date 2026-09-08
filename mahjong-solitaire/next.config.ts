import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // БЕЗ output: "standalone" — Vercel собирает свой выпуск, а
  // standalone-копирование node_modules (платформенные optional-зависимости
  // sharp/@img) падало на свежем bun install с ENOENT.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Строгий режим выключен: DOM-анимации полёта плиток в лоток
  // рассчитаны на однократное срабатывание эффектов.
  reactStrictMode: false,
};

export default nextConfig;
