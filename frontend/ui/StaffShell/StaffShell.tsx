"use client";

import Link from "next/link";
import { preload } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { useT } from "../../lib/i18n/client";
import { BrandMark } from "../BrandMark/BrandMark";
import { Count, type CountTone } from "../Count/Count";
import { useMediaQuery, useScrolled } from "../hooks";
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, HelpIcon, MenuIcon, SearchIcon, SignOutIcon, type IconProps } from "../icons";
import { Sheet } from "../Sheet/Sheet";
import { THEME_LOCK, type ThemePreference } from "../theme";
import "../tokens.css";
import { Drawer } from "./Drawer";
import { StaffPopover } from "./Popover";
import styles from "./StaffShell.module.css";

export type StaffNavItem = {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  current?: boolean;
  /** Small count after the label (open cases, discussions to moderate). */
  count?: number;
  /** neutral: a total. needs: work waits. urgent: something is overdue. */
  countTone?: CountTone;
  /** Group heading. Neighbouring items with the same heading sit under one label. */
  group?: string;
};

export type StaffCrumb = { label: string; href?: string };

export type StaffShellProps = {
  /** Every section the person can see, in order, with its group heading. */
  nav: StaffNavItem[];
  /** The page heading (H1). It is the last step of the breadcrumb. */
  title: string;
  /** Steps before the title. A step with an href is a link back. */
  crumbs?: StaffCrumb[];
  /** Name shown under the product name (the signed-in organisation). */
  organisation?: string;
  /** Intake status row. Leave out to hide it. */
  intake?: { paused: boolean; href: string };
  /** The signed-in person. Leave out to hide the user row. */
  user?: { name: string; role: string };
  onSignOut?: () => void;
  /** Called with the typed text when the search field is submitted. */
  onSearch?: (query: string) => void;
  /** Controls at the end of the header, before the help button. */
  headerEnd?: ReactNode;
  /** Single-pane content. */
  children?: ReactNode;
  /** Two-pane layout: list on the left, detail on the right from 900 px. */
  list?: ReactNode;
  detail?: ReactNode;
  /** Under 900 px only one pane shows: which one. */
  focus?: "list" | "detail";
  /** Ignored: the product is light only. Kept so older callers still compile. */
  theme?: ThemePreference;
  /** Render inside a fixed frame (component gallery, dev viewer). */
  preview?: boolean;
  "data-testid"?: string;
};

function initialsOf(name: string): string {
  const base = name.includes("@") ? name.split("@")[0].replace(/[._-]+/g, " ") : name;
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/* ---------- The rail: used as the desktop rail and again inside the phone's left sheet ---------- */

type RailProps = {
  variant: "rail" | "sheet";
  nav: StaffNavItem[];
  organisation?: string;
  intake?: StaffShellProps["intake"];
  user?: StaffShellProps["user"];
  onSignOut?: () => void;
  onShortcuts: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
};

function Rail({ variant, nav, organisation, intake, user, onSignOut, onShortcuts, onNavigate, onClose }: RailProps) {
  const t = useT();
  const wrapRef = useRef<HTMLElement>(null);
  const [mark, setMark] = useState<{ y: number; h: number; ready: boolean } | null>(null);
  const activeHref = nav.find((item) => item.current)?.href;

  // The raised "current" tile slides to the new item instead of jumping.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const active = wrap.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!active || active.offsetHeight === 0) {
        setMark(null);
        return;
      }
      setMark((previous) => ({ y: active.offsetTop, h: active.offsetHeight, ready: previous !== null }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [activeHref, nav.length, variant]);

  // The dot rings once when intake changes to paused.
  const [pulse, setPulse] = useState(false);
  const wasPaused = useRef(intake?.paused ?? false);
  useEffect(() => {
    const paused = intake?.paused ?? false;
    if (paused && !wasPaused.current) {
      const start = window.setTimeout(() => setPulse(true), 0);
      const stop = window.setTimeout(() => setPulse(false), 900);
      wasPaused.current = paused;
      return () => {
        window.clearTimeout(start);
        window.clearTimeout(stop);
      };
    }
    wasPaused.current = paused;
  }, [intake?.paused]);

  return (
    <div className={styles.rail} data-variant={variant}>
      <div className={styles.railTop}>
        <div className={styles.brandRow}>
          <span className={styles.brandMark}>
            <BrandMark variant="symbol" size="bar" />
          </span>
          <span className={styles.brandName}>{t("ui.productName")}</span>
          {onClose ? (
            <button type="button" className={styles.iconButton} onClick={onClose} aria-label={t("staff.shell.closeMenu")}>
              <CloseIcon size={20} />
            </button>
          ) : null}
        </div>
        {organisation ? <p className={styles.organisation}>{organisation}</p> : null}
      </div>

      <nav ref={wrapRef} className={styles.railNav} aria-label={t("ui.nav.main")}>
        {mark ? (
          <span
            className={styles.indicator}
            aria-hidden="true"
            data-ready={mark.ready || undefined}
            style={{ transform: `translateY(${mark.y}px)`, height: mark.h }}
          />
        ) : null}
        {nav.map((item, index) => {
          const Icon = item.icon;
          const heading = index === 0 || item.group !== nav[index - 1].group ? item.group : undefined;
          return (
            <div key={`${item.href}-${item.label}`} className={styles.itemWrap}>
              {heading ? <p className={styles.groupLabel}>{heading}</p> : null}
              <Link
                href={item.href}
                className={styles.item}
                aria-current={item.current ? "page" : undefined}
                data-tip={item.label}
                onClick={onNavigate}
              >
                <Icon size={20} />
                <span className={styles.itemLabel}>{item.label}</span>
                {item.count ? (
                  <Count value={item.count} tone={item.countTone ?? "neutral"} label={undefined} className={styles.itemCount} />
                ) : null}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className={styles.railFoot}>
        {intake ? (
          <Link
            href={intake.href}
            className={styles.intake}
            data-state={intake.paused ? "paused" : "open"}
            data-pulse={pulse || undefined}
            data-tip={intake.paused ? t("staff.shell.intake.paused") : t("staff.shell.intake.receiving")}
            onClick={onNavigate}
            data-testid="staff-intake"
          >
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.intakeLabel}>{intake.paused ? t("staff.shell.intake.paused") : t("staff.shell.intake.receiving")}</span>
          </Link>
        ) : null}
        {user ? (
          <StaffPopover
            label={t("staff.shell.account")}
            placement="above-start"
            className={styles.meRoot}
            trigger={(props) => (
              <button type="button" className={styles.me} {...props} data-tip={user.name} data-testid="staff-user">
                <span className={styles.disc} aria-hidden="true">
                  {initialsOf(user.name)}
                </span>
                <span className={styles.meText}>
                  <span className={styles.meName}>{user.name}</span>
                  <span className={styles.meRole}>{user.role}</span>
                </span>
                <ChevronDownIcon size={20} className={styles.meChevron} />
              </button>
            )}
          >
            {(close) => (
              <ul className={styles.menu}>
                <li>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      close();
                      onShortcuts();
                    }}
                  >
                    <HelpIcon size={18} />
                    {t("staff.shell.shortcuts")}
                  </button>
                </li>
                {onSignOut ? (
                  <li>
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={() => {
                        close();
                        onSignOut();
                      }}
                      data-testid="staff-sign-out"
                    >
                      <SignOutIcon size={18} />
                      {t("staff.signOut")}
                    </button>
                  </li>
                ) : null}
              </ul>
            )}
          </StaffPopover>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Staff shell. From 1280 px a light grouped rail with intake status and the signed-in person;
 * 1024 to 1279 px the same rail folded to icons with tooltips; below 1024 px a top bar and the
 * rail in a left sheet. A sticky 56 px header carries the breadcrumb, title, search and help.
 */
export function StaffShell({
  nav,
  title,
  crumbs = [],
  organisation,
  intake,
  user,
  onSignOut,
  onSearch,
  headerEnd,
  children,
  list,
  detail,
  focus = "list",
  preview,
  "data-testid": testId = "staff-shell",
}: StaffShellProps) {
  preload("/fonts/noto-sans-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const t = useT();
  const theme = THEME_LOCK ?? "light";
  // Dialogs may render beside the shell: give the page root the same theme.
  useEffect(() => {
    if (preview) return;
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => {
      if (root.dataset.theme === theme) delete root.dataset.theme;
    };
  }, [theme, preview]);

  const Main = "main";
  const split = list !== undefined && detail !== undefined;

  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState(false);
  const [query, setQuery] = useState("");
  const wide = useMediaQuery("(min-width: 1024px)");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrolled = useScrolled(sentinelRef);
  const deskInput = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  // A wide window has no left sheet.
  useEffect(() => {
    if (wide && menuOpen) {
      const id = window.setTimeout(() => setMenuOpen(false), 0);
      return () => window.clearTimeout(id);
    }
  }, [wide, menuOpen]);

  useEffect(() => {
    if (phoneSearch) phoneInput.current?.focus();
  }, [phoneSearch]);

  // "/" jumps to search, "?" lists the shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "/") {
        event.preventDefault();
        if (deskInput.current && deskInput.current.offsetParent !== null) deskInput.current.focus();
        else setPhoneSearch(true);
      } else if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    onSearch?.(query.trim());
    setPhoneSearch(false);
  }

  const back = [...crumbs].reverse().find((crumb) => crumb.href);

  const searchField = (input: typeof deskInput, id: string) => (
    <form className={styles.search} role="search" onSubmit={submitSearch}>
      <SearchIcon size={20} className={styles.searchIcon} />
      <label className="eg-sr-only" htmlFor={id}>
        {t("staff.shell.searchLabel")}
      </label>
      <input
        ref={input}
        id={id}
        type="search"
        className={styles.searchInput}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("staff.shell.searchPlaceholder")}
        enterKeyHint="search"
        autoComplete="off"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
            setPhoneSearch(false);
          }
        }}
      />
      <kbd className={styles.kbd} aria-hidden="true">
        /
      </kbd>
    </form>
  );

  const shortcuts: Array<[string, string]> = [
    ["/", t("staff.shell.keys.search")],
    ["?", t("staff.shell.keys.help")],
    ["J", t("staff.shell.keys.next")],
    ["K", t("staff.shell.keys.previous")],
    ["Enter", t("staff.shell.keys.open")],
    ["Esc", t("staff.shell.keys.close")],
  ];

  return (
    <div
      className={`${styles.shell} ${preview ? styles.preview : ""}`}
      data-theme={theme}
      data-density="staff"
      data-testid={testId}
    >
      {preview ? null : (
        <a className={styles.skip} href="#eg-staff-content">
          {t("ui.skipToContent")}
        </a>
      )}

      <aside className={styles.side} data-testid="staff-rail">
        <Rail
          variant="rail"
          nav={nav}
          organisation={organisation}
          intake={intake}
          user={user}
          onSignOut={onSignOut}
          onShortcuts={() => setHelpOpen(true)}
        />
      </aside>

      <div className={styles.column}>
        <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />

        {/* Phones and tablets: menu, centred title, search */}
        <header className={styles.topBar} data-scrolled={scrolled || undefined}>
          <div className={styles.topBarRow}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setMenuOpen(true)}
              aria-label={t("staff.shell.menu")}
              aria-haspopup="dialog"
              data-testid="staff-menu"
            >
              <MenuIcon size={24} />
            </button>
            <h1 className={styles.topTitle}>{title}</h1>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.topEnd}`}
              onClick={() => setPhoneSearch((value) => !value)}
              aria-label={t("staff.shell.search")}
              aria-expanded={phoneSearch}
            >
              <SearchIcon size={24} />
            </button>
          </div>
          {phoneSearch ? <div className={styles.phoneSearch}>{searchField(phoneInput, "staff-search-phone")}</div> : null}
          {back ? (
            <Link href={back.href as string} className={styles.backLink}>
              <ChevronRightIcon size={16} className={styles.backIcon} />
              {back.label}
            </Link>
          ) : null}
        </header>

        {/* Desktop: breadcrumb, title, search, help */}
        <header className={styles.header} data-scrolled={scrolled || undefined}>
          <div className={styles.crumbs}>
            {crumbs.length > 0 ? (
              <nav aria-label={t("staff.shell.breadcrumb")}>
                <ol className={styles.crumbList}>
                  {crumbs.map((crumb) => (
                    <li key={`${crumb.label}-${crumb.href ?? ""}`}>
                      {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
                      <ChevronRightIcon size={16} />
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
            <h1 className={styles.title}>{title}</h1>
          </div>
          {searchField(deskInput, "staff-search")}
          {headerEnd ? <div className={styles.headerEnd}>{headerEnd}</div> : null}
          <button
            type="button"
            className={styles.helpButton}
            onClick={() => setHelpOpen(true)}
            aria-label={t("staff.shell.shortcuts")}
            aria-haspopup="dialog"
            data-testid="staff-help"
          >
            ?
          </button>
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

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} label={t("staff.shell.menu")}>
        <Rail
          variant="sheet"
          nav={nav}
          organisation={organisation}
          intake={intake}
          user={user}
          onSignOut={onSignOut}
          onShortcuts={() => {
            setMenuOpen(false);
            setHelpOpen(true);
          }}
          onNavigate={() => setMenuOpen(false)}
          onClose={() => setMenuOpen(false)}
        />
      </Drawer>

      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title={t("staff.shell.shortcuts")} closeOnBrowserBack={false} data-testid="staff-shortcuts">
        <dl className={styles.keyList}>
          {shortcuts.map(([key, label]) => (
            <div key={key}>
              <dt>
                <kbd className={styles.kbdLarge}>{key}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </div>
  );
}
