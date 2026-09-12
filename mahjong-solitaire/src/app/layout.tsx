import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Маджонг — классика и матчи 1 на 1",
  description:
    "Два режима: спокойная Классика без соперника и матчи 1 на 1 как в Vita Mahjong — гонка с соперником, трофеи и лиги от Бронзы до Легенды.",
  applicationName: "Маджонг",
  keywords: ["маджонг", "пасьянс", "mahjong", "solitaire", "игра", "головоломка"],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Маджонг",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0c2214",
};

/**
 * РЕГИСТРАЦИЯ SERVICE WORKER (PWA: оффлайн + мгновенный запуск).
 * Регистрируется ПОСЛЕ загрузки страницы, чтобы не тормозить
 * первый старт. localhost не регистрируем — кеш ломает dev-режим
 * (HMR); на проде (Vercel) работает всегда.
 */
const SW_REGISTER = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return;
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased bg-[#0c2214]">
        {children}
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
      </body>
    </html>
  );
}
