import type { ReactNode } from "react";
import "./styles.css";

/**
 * The original plain header and padded <main> used by the first pages (home notice,
 * sign-in, /workspace). New route groups render their own shell, so this frame and
 * its global stylesheet are imported only by those pages, not by the root layout.
 */
export function LegacyFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header">ElectraGuard AI</header>
      <main className="legacy-main">{children}</main>
    </>
  );
}
