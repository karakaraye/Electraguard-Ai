import type { Metadata } from "next";
import { getT } from "../../../lib/i18n/server";
import styles from "../_views/page.module.css";
import { PhoneSimulator } from "./PhoneSimulator";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("p07.title"), robots: { index: false, follow: false } };
}

/** P-07 on-screen basic phone for USSD and SMS (SIM-01). */
export default async function PhonePage() {
  const { t } = await getT();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("p07.title")}</h1>
        <p className={styles.lead}>{t("p07.lead")}</p>
      </header>
      <PhoneSimulator />
    </div>
  );
}
