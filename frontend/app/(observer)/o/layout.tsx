import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getT } from "../../../lib/i18n/server";
import { Splash } from "../../../ui/Splash/Splash";
import { splashGateScript } from "../../../ui/Splash/gate";
import { ObserverRuntime } from "./_components/ObserverRuntime";
import "../../../ui/tokens.css";
import "./observer.css";

export const metadata: Metadata = {
  title: "ElectraGuard AI",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** First-run entry points where the splash may show (spec screen 1). Deep links never show it. */
const SPLASH_PATHS = ["/o", "/o/start"];

/** Observer app: offline runtime (sync loop, service worker, PIN prompt) around every screen. */
export default async function ObserverLayout({ children }: { children: ReactNode }) {
  const { t } = await getT();
  return (
    <>
      {/* Decides before first paint whether the splash shows, so nothing flashes underneath. */}
      <script dangerouslySetInnerHTML={{ __html: splashGateScript(SPLASH_PATHS) }} />
      <Splash credit={t("ui.byCairn")} />
      <ObserverRuntime>{children}</ObserverRuntime>
    </>
  );
}
