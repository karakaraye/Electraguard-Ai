import type { Metadata } from "next";
import { getT } from "../../../lib/i18n/server";
import styles from "../_views/page.module.css";
import { AskScreen } from "./AskScreen";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("p04.title") };
}

/** P-04 Ask ElectraGuard. The heading and notes are server rendered; only the form is a client island. */
export default async function AskPage() {
  const { t } = await getT();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("p04.heading")}</h1>
        <p className={styles.lead}>{t("p04.lead")}</p>
        <p className={styles.small}>{t("p04.note")}</p>
      </header>
      <AskScreen />
    </div>
  );
}
