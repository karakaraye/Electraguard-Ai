import type { Metadata } from "next";
import { getT } from "../../../lib/i18n/server";
import styles from "../_views/page.module.css";
import { PhoneSimulator, type PhoneStart } from "./PhoneSimulator";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("p07.title"), robots: { index: false, follow: false } };
}

/** P-07 on-screen basic phone for USSD and SMS (SIM-01). */
export default async function PhonePage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  // ?start=ussd types the USSD code for the person; ?start=sms opens a new message (links from the home page).
  const requested = (await searchParams).start;
  const start: PhoneStart = requested === "ussd" || requested === "sms" ? requested : "home";
  const { t } = await getT();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("p07.title")}</h1>
        <p className={styles.lead}>{t("p07.lead")}</p>
      </header>
      <PhoneSimulator start={start} />
    </div>
  );
}
