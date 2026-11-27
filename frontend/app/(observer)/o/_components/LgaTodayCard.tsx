"use client";

/** "Your LGA today": reviewed reports at least 60 minutes old. A count under 5 is never shown as a number, and never as zero. */

import { useLocale, useT } from "../../../../lib/i18n/client";
import { formatWatTime } from "../../../../ui/format";
import { CATEGORY_ROWS } from "../../../(public)/_lib/public";
import styles from "./notice.module.css";

export type LgaToday = {
  lgaName: string;
  updatedAt: string;
  rows: Array<{ category: string; count: number | "fewer than 5" }>;
};

const CATEGORY_KEY: Record<string, string> = Object.fromEntries(CATEGORY_ROWS.map((row) => [row.value, row.key]));

export function LgaTodayCard({ data }: { data: LgaToday }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <section className={styles.lga} aria-labelledby="o04-lga" data-testid="o04-lga-today">
      <div className={styles.lgaHead}>
        <h2 className={styles.lgaTitle} id="o04-lga">{t("notice.lga.title", { lga: data.lgaName })}</h2>
        <span className={`${styles.lgaUpdated} eg-tnum`}>{t("notice.lga.updated", { time: formatWatTime(data.updatedAt, locale) })}</span>
      </div>
      <ul className={styles.lgaList}>
        {data.rows.map((row) => {
          const small = typeof row.count !== "number" || row.count < 5;
          return (
            <li key={row.category}>
              <span>{CATEGORY_KEY[row.category] ? t(CATEGORY_KEY[row.category]) : row.category}</span>
              <span className={`${styles.lgaCount} eg-tnum`} data-small={small || undefined}>
                {small ? t("notice.fewerThan5") : row.count}
              </span>
            </li>
          );
        })}
      </ul>
      <p className={styles.lgaNote}>{t("notice.lga.note")}</p>
    </section>
  );
}
