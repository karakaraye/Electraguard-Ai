"use client";

import Link from "next/link";
import { preload } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { useKeyboardInset, useOffline } from "../hooks";
import { BrandMark } from "../BrandMark/BrandMark";
import { ArrowLeftIcon, MenuIcon, OfflineIcon } from "../icons";
import { useThemePreference, type ThemePreference } from "../theme";
import "../tokens.css";
import styles from "./AppShell.module.css";

export type AppShellProps = {
  /** Short screen name (or the product mark) in the top bar. The screen question goes in the content as <h1>. */
  title?: ReactNode;
  /** Where Back goes. Without it, Back calls onBack, or the browser history. */
  backHref?: string;
  onBack?: () => void;
  /** Hide Back on the first screen of a flow (home, language). */
  hideBack?: boolean;
  /** Opens the menu. Omit to hide the Menu button. */
  onMenu?: () => void;
  /** Replaces the Menu button with your own control. */
  menu?: ReactNode;
  /** Extra controls before the menu (outbox badge, language). */
  end?: ReactNode;
  /** "home" shows the mark and name on the left instead of Back. */
  variant?: "home" | "task" | "plain";
  /** Banners shown under the top bar (intake paused, question waiting). */
  banner?: ReactNode;
  /** The pinned bottom action area: normally one primary Button. */
  actions?: ReactNode;
  /** Override the network state (for example from the outbox). Defaults to the browser's. */
  offline?: boolean;
  /** Reports waiting in the outbox, mentioned in the offline bar. */
  queuedCount?: number;
  /** Appearance. Defaults to the stored choice, else light (sunlight). */
  theme?: ThemePreference;
  /**
   * Render inside a fixed-height frame (component gallery, previews). Uses a
   * <div> instead of <main> and ignores the on-screen keyboard.
   */
  preview?: boolean;
  children: ReactNode;
  "data-testid"?: string;
};

function preloadFonts() {
  preload("/fonts/noto-sans-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
}

/**
 * Observer and citizen shell: labelled Back, screen title and Menu on top,
 * the network bar when offline, and one pinned action area that stays above
 * the on-screen keyboard and the phone's gesture bar.
 */
export function AppShell({
  title,
  backHref,
  onBack,
  hideBack,
  onMenu,
  menu,
  end,
  variant,
  banner,
  actions,
  offline,
  queuedCount,
  theme,
  preview,
  children,
  "data-testid": testId = "app-shell",
}: AppShellProps) {
  preloadFonts();
  const t = useT();
  const browserOffline = useOffline();
  const keyboard = useKeyboardInset(!preview);
  const storedTheme = useThemePreference("light");
  const isOffline = offline ?? browserOffline;
  const Root = preview ? "div" : "main";
  const shellRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // The bar's bottom rule appears only once content has scrolled under it.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // A focused field or the last tile is never hidden behind the action bar.
  const hasActions = Boolean(actions);
  useEffect(() => {
    const bar = actionsRef.current;
    const target = preview ? shellRef.current : document.documentElement;
    if (!bar || !target) return;
    const apply = () => target.style.setProperty("scroll-padding-bottom", `${bar.offsetHeight + 16}px`);
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      target.style.removeProperty("scroll-padding-bottom");
    };
  }, [hasActions, preview]);
  const contentId = preview ? undefined : "eg-content";

  const back = variant === "home" ? (
    <span className={styles.brand}>
      <BrandMark variant="lockup" size="bar" />
    </span>
  ) : hideBack ? (
    <span />
  ) : backHref ? (
    <Link href={backHref} className={styles.back} data-testid="back">
      <ArrowLeftIcon />
      <span>{t("ui.back")}</span>
    </Link>
  ) : (
    <button
      type="button"
      className={styles.back}
      data-testid="back"
      onClick={() => (onBack ? onBack() : window.history.back())}
    >
      <ArrowLeftIcon />
      <span>{t("ui.back")}</span>
    </button>
  );

  return (
    <div
      ref={shellRef}
      className={`${styles.shell} ${preview ? styles.preview : ""}`}
      data-theme={theme ?? storedTheme}
      data-testid={testId}
      style={{ "--kb": `${keyboard}px` } as CSSProperties}
    >
      {preview ? null : (
        <a className={styles.skip} href="#eg-content">
          {t("ui.skipToContent")}
        </a>
      )}
      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      <header className={styles.top} data-scrolled={scrolled || undefined}>
        <div className={styles.topInner}>
          {back}
          {title && variant !== "home" ? <p className={styles.title}>{title}</p> : <span />}
          <div className={styles.end}>
            {end}
            {menu ??
              (onMenu ? (
                <button type="button" className={styles.menu} onClick={onMenu} data-testid="menu">
                  <MenuIcon />
                  <span>{t("ui.menu")}</span>
                </button>
              ) : null)}
          </div>
        </div>
      </header>

      <div className={styles.network} role="status" aria-live="polite" data-testid="network-bar">
        {isOffline ? (
          <p className={styles.networkBar}>
            <span className={styles.networkInner}>
              <OfflineIcon />
              <span>
                {queuedCount
                  ? t("ui.network.offlineQueued", { count: queuedCount })
                  : t("ui.network.offline")}
              </span>
            </span>
          </p>
        ) : null}
      </div>

      {banner ? <div className={styles.banner}>{banner}</div> : null}

      <Root id={contentId} tabIndex={preview ? undefined : -1} className={styles.content}>
        {children}
      </Root>

      {actions ? (
        <div ref={actionsRef} className={styles.actions} data-keyboard={keyboard > 0 || undefined} data-testid="action-area">
          <div className={styles.actionsInner}>{actions}</div>
        </div>
      ) : null}
    </div>
  );
}
