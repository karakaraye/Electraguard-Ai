import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getT } from "../../lib/i18n/server";
import { I18nProvider } from "../../lib/i18n/client";
import type { Messages } from "../../lib/i18n";
import { PublicShell } from "./_components/PublicShell";
import "../../ui/tokens.css";
import "./public.css";

export const metadata: Metadata = {
  title: { default: "ElectraGuard AI", template: "%s | ElectraGuard AI" },
  description: "Report what you see on election day, check a report with its receipt code, and read reviewed, privacy-safe totals. Nonpartisan and independent of INEC.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Namespaces the client islands on public pages need; the rest stays on the server. */
const CLIENT_NAMESPACES = ["ui", "common", "pub", "p01", "p02", "p04", "p07", "p08", "o05"];

function pick(messages: Messages): Messages {
  const subset: Messages = {};
  for (const key of CLIENT_NAMESPACES) if (messages[key] !== undefined) subset[key] = messages[key];
  return subset;
}

/** Public pages (P-02 … P-07): server rendered, light for 2G, follow the device's light or dark setting. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const { t, locale, messages } = await getT();
  return (
    <I18nProvider locale={locale} messages={pick(messages)}>
      <PublicShell t={t}>{children}</PublicShell>
    </I18nProvider>
  );
}
