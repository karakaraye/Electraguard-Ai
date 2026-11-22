"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLocale } from "../../lib/i18n/client";
import { formatWatDateTime } from "../format";
import { categoryPictograms, ChevronRightIcon, type IncidentCategory } from "../icons";
import { StatusBadge, type ReportStatus } from "../StatusBadge/StatusBadge";
import styles from "./ReportRow.module.css";

export type ReportRowProps = {
  href: string;
  category: IncidentCategory;
  /** Category name in the current language. */
  categoryLabel: string;
  /** Ward or polling unit name (never finer than the unit). */
  place: string;
  /** Observed time (ISO or epoch ms). */
  observedAt: string | number;
  /** Receipt code or local draft label. */
  reference?: string;
  status: ReportStatus;
  /** Extra line, e.g. "Question for you: reply by 16:00". */
  note?: ReactNode;
  "data-testid"?: string;
};

/** One report in a list: pictogram, category, place, time and status. */
export function ReportRow({
  href,
  category,
  categoryLabel,
  place,
  observedAt,
  reference,
  status,
  note,
  "data-testid": testId = "report-row",
}: ReportRowProps) {
  const { locale } = useLocale();
  const Pictogram = categoryPictograms[category];
  return (
    <li className={styles.item}>
      <Link href={href} className={styles.row} data-testid={testId}>
        <span className={styles.pictogram}>
          <Pictogram size={32} />
        </span>
        <span className={styles.main}>
          <span className={styles.title}>{categoryLabel}</span>
          <span className={styles.meta}>
            <span>{place}</span>
            <span className="eg-tnum">{formatWatDateTime(observedAt, locale)}</span>
            {reference ? <span className="eg-tnum">{reference}</span> : null}
          </span>
          {note ? <span className={styles.note}>{note}</span> : null}
          <span className={styles.badge}>
            <StatusBadge status={status} />
          </span>
        </span>
        <ChevronRightIcon className={styles.chevron} />
      </Link>
    </li>
  );
}

/** List wrapper with hairline separators. */
export function ReportList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {children}
    </ul>
  );
}
