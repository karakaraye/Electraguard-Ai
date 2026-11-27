"use client";

/** The menu sheet's content (spec screen 28): who is signed in, the occasional places, language, the 112 line, sign out. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { isLocale, localeNames, localeTags, locales } from "../../../../lib/i18n/config";
import { useLocale, useT } from "../../../../lib/i18n/client";
import {
  AlertIcon,
  BookIcon,
  ChevronRightIcon,
  DiscussionIcon,
  HelpIcon,
  LanguageIcon,
  ListIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SlidersIcon,
  type IconProps,
} from "../../../../ui/icons";
import { STAGES, useChecklistDay, watDay } from "../_lib/checklist";
import styles from "./ObserverShell.module.css";

type Row = { href: string; key: string; icon: ComponentType<IconProps>; testId: string; aside?: string };

export function ObserverMenu({ code, unitLabel, onNavigate }: { code?: string; unitLabel?: string | null; onNavigate?: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const { locale, setLocale } = useLocale();
  const day = useChecklistDay(code ?? null, watDay());
  const sent = STAGES.filter((stage) => day.stages[stage.slug]?.state === "received").length;
  const unit = unitLabel === undefined ? day.unit?.label : unitLabel;

  const groups: Row[][] = [
    [
      { href: "/o/checklist", key: "o04.checklist", icon: ListIcon, testId: "checklist", aside: t("o04.checklistProgress", { done: sent, total: STAGES.length }) },
      { href: "/o/ask", key: "o04.ask", icon: HelpIcon, testId: "ask" },
      { href: "/o/discussions", key: "o18.title", icon: DiscussionIcon, testId: "discussions" },
    ],
    [
      { href: "/guide", key: "pub.nav.guide", icon: BookIcon, testId: "guide" },
      { href: "/o/start?view=notice&from=settings", key: "o20.privacy", icon: ShieldCheckIcon, testId: "privacy" },
      { href: "/o/settings", key: "o20.title", icon: SlidersIcon, testId: "settings" },
    ],
  ];

  const current = (href: string) => (href.startsWith("/o/start") ? false : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className={styles.menu}>
      {code ? (
        <div className={styles.who} data-testid="menu-who">
          <span className={`${styles.whoName} eg-tnum`}>{t("o04.signedInAs", { code })}</span>
          {unit ? <span className={styles.whoUnit}>{unit}</span> : null}
        </div>
      ) : null}

      {groups.map((rows, index) => (
        <ul key={index} className={styles.group}>
          {rows.map((row) => (
            <li key={row.href}>
              <Link
                href={row.href}
                className={styles.row}
                aria-current={current(row.href) ? "page" : undefined}
                onClick={onNavigate}
                data-testid={`menu-${row.testId}`}
              >
                <row.icon size={24} aria-hidden="true" />
                <span>{t(row.key)}</span>
                {row.aside ? <span className={`${styles.aside} eg-tnum`}>{row.aside}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ))}

      <ul className={styles.group}>
        <li>
          <label className={styles.row} data-testid="menu-language">
            <LanguageIcon size={24} aria-hidden="true" />
            <span>{t("ui.language.label")}</span>
            <span className={styles.aside} aria-hidden="true" lang={localeTags[locale]}>
              {localeNames[locale]}
              <ChevronRightIcon size={20} aria-hidden="true" />
            </span>
            <select
              className={styles.langSelect}
              aria-label={t("ui.language.label")}
              value={locale}
              onChange={(event) => {
                if (isLocale(event.target.value)) void setLocale(event.target.value);
              }}
            >
              {locales.map((item) => (
                <option key={item} value={item} lang={localeTags[item]}>
                  {localeNames[item]}
                </option>
              ))}
            </select>
          </label>
        </li>
      </ul>

      <p className={styles.line112} data-testid="menu-112">
        <AlertIcon size={18} aria-hidden="true" />
        <span>{t("o02.line4")}</span>
      </p>

      <ul className={styles.group}>
        <li>
          <Link href="/o/settings#sign-out" className={`${styles.row} ${styles.out}`} onClick={onNavigate} data-testid="menu-sign-out">
            <SignOutIcon size={24} aria-hidden="true" />
            <span>{t("o20.signOut.button")}</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
