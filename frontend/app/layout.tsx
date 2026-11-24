import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import { getT } from "../lib/i18n/server";
import "../ui/fonts-display.css";

export const metadata: Metadata = {
  title: "ElectraGuard AI",
  description: "Election observation and incident documentation",
  applicationName: "ElectraGuard AI",
  appleWebApp: { title: "ElectraGuard" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

/** html and body only: each route group owns its own shell (header, main, padding). */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { lang } = await getT();
  preload("/fonts/noto-sans-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preload("/fonts/noto-sans-display-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    // ui/motion.ts marks <html> with page-visibility attributes before hydration.
    <html lang={lang} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
