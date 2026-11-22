import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ObserverRuntime } from "./_components/ObserverRuntime";

export const metadata: Metadata = {
  title: "ElectraGuard AI",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Observer app: offline runtime (sync loop, service worker, PIN prompt) around every screen. */
export default function ObserverLayout({ children }: { children: ReactNode }) {
  return <ObserverRuntime>{children}</ObserverRuntime>;
}
