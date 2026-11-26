"use client";

import Link from "next/link";
import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { BrandMark } from "../../ui";
import { useThemePreference } from "../../ui/theme";
import "../../ui/tokens.css";
import styles from "./system.module.css";

export type SystemAction = { label: string; href: string } | { label: string; onClick: () => void };

export interface SystemPageProps {
  /** The spot: an icon drawn in a large sun disc. Decorative. */
  icon: ComponentType<{ size?: number }>;
  /** A spot illustration (ink and sun, no people). When given it replaces the icon disc. */
  spot?: ComponentType<{ size?: number }>;
  tone?: "plain" | "danger";
  title: string;
  /** One sentence. */
  body: ReactNode;
  action: SystemAction;
  /** A quiet second way out, for the error page only. */
  secondary?: SystemAction;
  "data-testid"?: string;
}

/**
 * Screen 50: the pages people land on when something is off — not found, offline, signed
 * out, access changed, intake paused and errors. One sentence and one action each; the
 * title takes focus so a screen reader announces where you are.
 */
export function SystemPage({ icon: Icon, spot: Spot, tone = "plain", title, body, action, secondary, "data-testid": testId = "system-page" }: SystemPageProps) {
  const theme = useThemePreference("system");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={styles.page} data-theme={theme} data-testid={testId}>
      <main className={styles.main}>
        <div className={styles.brand}>
          <BrandMark size="md" />
        </div>
        <section className={styles.card} aria-labelledby="system-title">
          {Spot ? (
            <span className={styles.spot} aria-hidden="true">
              <Spot size={132} />
            </span>
          ) : (
            <span className={styles.disc} data-tone={tone} aria-hidden="true">
              <Icon size={40} />
            </span>
          )}
          <h1 id="system-title" ref={heading} tabIndex={-1} className={styles.title}>
            {title}
          </h1>
          <p className={styles.body}>{body}</p>
          <div className={styles.actions}>
            <ActionButton action={action} primary />
            {secondary ? <ActionButton action={secondary} /> : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function ActionButton({ action, primary }: { action: SystemAction; primary?: boolean }) {
  const className = primary ? styles.primary : styles.quiet;
  return "href" in action ? (
    <Link href={action.href} className={className}>
      {action.label}
    </Link>
  ) : (
    <button type="button" className={className} onClick={action.onClick}>
      {action.label}
    </button>
  );
}
