import type { ReactNode } from "react";
import Link from "next/link";
import type { Translate } from "../../../lib/i18n";
import { BrandMark } from "../../../ui/BrandMark/BrandMark";
import { MenuIcon } from "../../../ui/icons";
import { LanguageMenu } from "./LanguageMenu";
import { NavLinks } from "./NavLinks";
import styles from "./shell.module.css";

export const NAV = [
  { href: "/", key: "pub.nav.home" },
  { href: "/results", key: "pub.nav.results" },
  { href: "/ask", key: "pub.nav.ask" },
  { href: "/guide", key: "pub.nav.guide" },
  { href: "/phone", key: "pub.nav.phone" },
  { href: "/privacy", key: "pub.nav.privacy" },
] as const;

/**
 * Public shell: mark and navigation on top, one reading column, and a footer that
 * carries the credit line, the nonpartisan statement and the emergency number.
 * Follows the device's light or dark setting. The shell owns the landmarks.
 */
export function PublicShell({ t, children }: { t: Translate; children: ReactNode }) {
  const items = NAV.map((item) => ({ href: item.href, label: t(item.key) }));
  return (
    <div className={`eg-public ${styles.shell}`} data-theme="system">
      <a className={styles.skip} href="#eg-main">
        {t("ui.skipToContent")}
      </a>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <Link href="/" className={styles.home} aria-label={t("pub.homeLink")}>
            <BrandMark size="bar" />
          </Link>
          <nav className={styles.wideNav} aria-label={t("pub.nav.label")}>
            <NavLinks items={items} className={styles.wideList} />
          </nav>
          <div className={styles.wideLang}>
            <LanguageMenu />
          </div>
          <details className={styles.menu}>
            <summary className={styles.menuButton}>
              <MenuIcon size={22} />
              {t("pub.menu")}
            </summary>
            <div className={styles.menuPanel}>
              <nav aria-label={t("pub.nav.label")}>
                <NavLinks items={items} className={styles.menuList} />
              </nav>
              <LanguageMenu />
            </div>
          </details>
        </div>
      </header>

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
