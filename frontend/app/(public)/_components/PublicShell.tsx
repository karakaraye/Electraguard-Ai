import type { ReactNode } from "react";
import Link from "next/link";
import type { Translate } from "../../../lib/i18n";
import { BrandMark } from "../../../ui/BrandMark/BrandMark";
import { THEME_LOCK } from "../../../ui/theme";
import { LanguageMenu } from "./LanguageMenu";
import { HeaderFrame } from "./HeaderFrame";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { HeaderReport } from "./landing/HeaderReport";
import styles from "./shell.module.css";

export const NAV = [
  { href: "/results", key: "pub.nav.results" },
  { href: "/check", key: "pub.nav.check" },
  { href: "/ask", key: "pub.nav.ask" },
  { href: "/guide", key: "pub.nav.guide" },
  { href: "/phone", key: "pub.nav.phone" },
] as const;

/**
 * Public shell: a sticky 64 px header (five destinations, language chip, Report) on top, one reading column, and a footer that
 * carries the credit line, the nonpartisan statement and the emergency number.
 * Always light. The shell owns the landmarks.
 */
export function PublicShell({ t, children, theme = THEME_LOCK ?? "light" }: { t: Translate; children: ReactNode; theme?: "system" | "light" | "dark" }) {
  const items = NAV.map((item) => ({ href: item.href, label: t(item.key) }));
  return (
    <div className={`eg-public ${styles.shell}`} data-theme={THEME_LOCK ?? theme} suppressHydrationWarning>
      <a className={styles.skip} href="#eg-main">
        {t("ui.skipToContent")}
      </a>
      <HeaderFrame>
        <div className={styles.topInner}>
          <Link href="/" className={styles.home} aria-label={t("pub.homeLink")}>
            <BrandMark size="bar" />
          </Link>
          <nav className={styles.wideNav} aria-label={t("pub.nav.label")}>
            <NavLinks items={items} className={styles.wideList} indicatorClassName={styles.wideBar} />
          </nav>
          <div className={styles.wideLang}>
            <LanguageMenu />
          </div>
          <HeaderReport href="/o/new/what?as=citizen" label={t("p02.report")} shortLabel={t("pub.reportShort")} className={styles.headReport} />
          <div className={styles.menuSlot}>
            <MobileMenu
              items={items}
              menuLabel={t("pub.menu")}
              closeLabel={t("pub.menuClose")}
              homeLabel={t("pub.homeLink")}
              hereLabel={t("pub.nav.here")}
              languageLabel={t("ui.language.label")}
              navLabel={t("pub.nav.label")}
              emergency={t("pub.footer.emergency")}
            />
          </div>
        </div>
      </HeaderFrame>

      <main id="eg-main" tabIndex={-1} className={styles.main}>
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.credit}>
            <BrandMark size="md" credit />
            <p>{t("pub.footer.nonpartisan")}</p>
            <p>{t("pub.footer.emergency")}</p>
          </div>
          <nav aria-label={t("pub.footer.label")}>
            <ul className={styles.footerLinks}>
              <li><Link href="/privacy">{t("pub.nav.privacy")}</Link></li>
              <li><Link href="/guide">{t("pub.nav.guide")}</Link></li>
              <li><Link href="/phone">{t("pub.nav.phone")}</Link></li>
              <li><Link href="/o/start">{t("pub.footer.observer")}</Link></li>
              <li><Link href="/sign-in">{t("pub.footer.staff")}</Link></li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
