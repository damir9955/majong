import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Строгий режим выключен: DOM-анимации полёта плиток в лоток
  // рассчитаны на однократное срабатывание эффектов.
  reactStrictMode: false,
};

export default nextConfig;
