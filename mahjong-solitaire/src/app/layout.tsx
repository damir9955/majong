import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Маджонг — расслабляющий пасьянс",
  description:
    "Маджонг-пасьянс с бесконечными уровнями: находи пары, отправляй их в лоток и убирай доску. Удерживай плитку пальцем, чтобы заглянуть под неё. Идеально, чтобы расслабиться.",
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
  themeColor: "#0d4030",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased bg-[#0d4030]">{children}</body>
    </html>
  );
}
