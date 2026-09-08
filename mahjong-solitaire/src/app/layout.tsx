import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TileFaceDefs } from "@/components/game/TileFace";

export const metadata: Metadata = {
  title: "Маджонг — классика и матчи 1 на 1",
  description:
    "Два режима: спокойная Классика без соперника и матчи 1 на 1 как в Vita Mahjong — гонка с соперником, трофеи и лиги от Бронзы до Легенды.",
  applicationName: "Маджонг",
  keywords: ["маджонг", "пасьянс", "mahjong", "solitaire", "игра", "головоломка"],
  manifest: "/manifest.webmanifest",
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
  themeColor: "#0e3255",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased bg-[#0e3255]">
        {/* глобальные SVG-градиенты граней плиток — один раз на страницу */}
        <TileFaceDefs />
        {children}
      </body>
    </html>
  );
}
