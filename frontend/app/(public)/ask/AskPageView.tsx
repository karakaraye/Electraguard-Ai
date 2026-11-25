import type { ReactNode } from "react";
import type { Translate } from "../../../lib/i18n";
import styles from "../_views/page.module.css";

/**
 * The whole P-04 page: heading, lead and the note above the form. Shared by the route and the
 * dev preview, so the captured screen is the real page. The form is passed in as the island.
 */
export function AskPageView({ t, children }: { t: Translate; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("p04.heading")}</h1>
        <p className={styles.lead}>{t("p04.lead")}</p>
        <p className={styles.small}>{t("p04.note")}</p>
      </header>
      {children}
    </div>
  );
}
