"use client";

import Link from "next/link";
import { preload } from "react-dom";
import { useId, useState, type ComponentType, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { BrandMark } from "../BrandMark/BrandMark";
import { MenuIcon, type IconProps } from "../icons";
import { Sheet } from "../Sheet/Sheet";
import { setThemePreference, useThemePreference, type ThemePreference } from "../theme";
import "../tokens.css";
import styles from "./StaffShell.module.css";

export type StaffNavItem = {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  current?: boolean;
  /** Small count after the label (open questions, urgent cases). */
  count?: number;
};

export type StaffShellProps = {
  /**
   * Every section the person can see. Phones show the first 4 as bottom tabs (all of
   * them when there are 5 or fewer) and put the rest behind "More"; tablets show 6.
   */
  nav: StaffNavItem[];
  /** Page heading. */
  title: string;
  /** Controls at the end of the header (filters, sign out). */
  headerEnd?: ReactNode;
  /** Single-pane content. */
  children?: ReactNode;
  /** Two-pane layout: queue on the left, case on the right from 900 px. */
  list?: ReactNode;
  detail?: ReactNode;
  /** Under 900 px only one pane shows: which one. */
  focus?: "list" | "detail";
  theme?: ThemePreference;
  /** Render inside a fixed frame (component gallery). */
  preview?: boolean;
  "data-testid"?: string;
};

/**
 * Staff shell: left navigation from 1024 px, bottom tabs on phones, and an
 * optional queue + case split from 900 px. Follows the device's dark mode
 * unless the person picks an appearance.
 */
export function StaffShell({
  nav,
  title,
  headerEnd,
  children,
  list,
  detail,
  focus = "list",
  theme,
  preview,
  "data-testid": testId = "staff-shell",
}: StaffShellProps) {
  preload("/fonts/noto-sans-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const t = useT();
  const storedTheme = useThemePreference("system");
  const Main = preview ? "div" : "main";
  const split = list !== undefined && detail !== undefined;
  const [moreOpen, setMoreOpen] = useState(false);

  // How many sections stay as tabs: phones 4 (all when 5 or fewer), tablets 6 (all when 7 or fewer).
  const phoneCap = nav.length <= 5 ? nav.length : 4;
  const tabletCap = nav.length <= 7 ? nav.length : 6;
  const overflow = nav.slice(phoneCap);
  const moreCount = overflow.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const moreCurrent = overflow.some((item) => item.current);

  const navLinks = (variant: "side" | "tabs") =>
    nav.map((item, index) => {
      const Icon = item.icon;
      const tier = variant === "tabs" ? (index < phoneCap ? undefined : index < tabletCap ? "tablet" : "hidden") : undefined;
      return (
        <li key={`${item.href}-${item.label}`} data-tier={tier}>
          <Link
            href={item.href}
            className={variant === "side" ? styles.sideLink : styles.tabLink}
            aria-current={item.current ? "page" : undefined}
          >
            <Icon size={variant === "side" ? 20 : 22} />
            <span className={styles.linkLabel}>{item.label}</span>
            {item.count ? <span className={`${styles.count} eg-tnum`}>{item.count}</span> : null}
          </Link>
        </li>
      );
    });

  return (
    <div
      className={`${styles.shell} ${preview ? styles.preview : ""}`}
      data-theme={theme ?? storedTheme}
      data-density="staff"
      data-testid={testId}
    >
      {preview ? null : (
        <a className={styles.skip} href="#eg-staff-content">
          {t("ui.skipToContent")}
        </a>
      )}
      <nav className={styles.side} aria-label={t("ui.nav.main")}>
        <div className={styles.brand}>
          <BrandMark variant="lockup" size="md" />
        </div>
        <ul className={styles.sideList}>{navLinks("side")}</ul>
      </nav>

      <div className={styles.column}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          {headerEnd ? <div className={styles.headerEnd}>{headerEnd}</div> : null}
        </header>

        <Main id={preview ? undefined : "eg-staff-content"} tabIndex={preview ? undefined : -1} className={styles.main}>
          {split ? (
            <div className={styles.split} data-focus={focus}>
              <div className={styles.listPane}>{list}</div>
              <div className={styles.detailPane}>{detail}</div>
            </div>
          ) : (
            children
          )}
        </Main>
      </div>

      <nav className={styles.tabs} aria-label={t("ui.nav.main")}>
        <ul className={styles.tabList}>
          {navLinks("tabs")}
          {overflow.length > 0 ? (
            <li data-more={nav.length <= tabletCap ? "phone-only" : "always"}>
              <button
                type="button"
                className={styles.tabLink}
                aria-haspopup="dialog"
                aria-current={moreCurrent ? "true" : undefined}
                onClick={() => setMoreOpen(true)}
                data-testid="staff-nav-more"
              >
                <MenuIcon size={22} />
                <span className={styles.linkLabel}>{t("staff.shell.more")}</span>
                {moreCount ? <span className={`${styles.count} eg-tnum`}>{moreCount}</span> : null}
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t("staff.shell.moreTitle")}
        closeOnBrowserBack={false}
        data-testid="staff-nav-sheet"
      >
        <ul className={styles.moreList}>
          {overflow.map((item, offset) => {
            const Icon = item.icon;
            // Sections that are tabs on a tablet are listed here on phones only.
            const onTablet = phoneCap + offset < tabletCap;
            return (
              <li key={`${item.href}-${item.label}`} data-tablet-tab={onTablet || undefined}>
                <Link
                  href={item.href}
                  className={styles.moreLink}
                  aria-current={item.current ? "page" : undefined}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon size={22} />
                  <span className={styles.linkLabel}>{item.label}</span>
                  {item.count ? <span className={`${styles.count} eg-tnum`}>{item.count}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}

/** Appearance choice for staff: same as device, light or dark. Stored on this device. */
export function ThemeSwitcher({ "data-testid": testId = "theme-switcher" }: { "data-testid"?: string }) {
  const t = useT();
  const id = useId();
  const theme = useThemePreference("system");
  return (
    <div className={styles.themeSwitcher} data-testid={testId}>
      <label htmlFor={`${id}-theme`} className="eg-sr-only">
        {t("ui.theme.label")}
      </label>
      <select
        id={`${id}-theme`}
        className={styles.themeSelect}
        value={theme}
        onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
      >
        <option value="system">{t("ui.theme.system")}</option>
        <option value="light">{t("ui.theme.light")}</option>
        <option value="dark">{t("ui.theme.dark")}</option>
      </select>
    </div>
  );
}
