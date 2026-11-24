import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ObserverRuntime } from "../(observer)/o/_components/ObserverRuntime";
import "../../ui/tokens.css";
import "../(observer)/o/observer.css";

export const metadata: Metadata = {
  title: "ElectraGuard AI",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Citizen receipt and status lookup: the same offline runtime, so a citizen's attachments keep sending. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <ObserverRuntime>{children}</ObserverRuntime>;
}
