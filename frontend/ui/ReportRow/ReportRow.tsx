"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { useLocale } from "../../lib/i18n/client";
import { formatWatShort } from "../format";
import { categoryPictograms, ChevronRightIcon, type IconProps, type IncidentCategory } from "../icons";
import { Count } from "../Count/Count";
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
  /** A pictogram for rows that are not incidents (checklist stage, result-sheet check). */
  pictogram?: ComponentType<IconProps>;
  /** Hide the time line (for rows whose time is not known). */
  hideTime?: boolean;
  /** Something new since the last visit: bold title and a dot. */
  unread?: boolean;
  /** Unread messages: one Count at the end of the row instead of a text line. */
  count?: number;
  /** Spoken name of the count, for example "new messages". */
  countLabel?: string;
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
  pictogram,
  hideTime,
  unread,
  count,
  countLabel,
  "data-testid": testId = "report-row",
}: ReportRowProps) {
  const { locale } = useLocale();
  const Pictogram = pictogram ?? categoryPictograms[category];
  return (
    <li className={styles.item}>
      <Link href={href} className={styles.row} data-count={count ? "" : undefined} data-testid={testId}>
        <span className={styles.disc}>
          <Pictogram size={24} />
        </span>
        <span className={styles.main}>
          <span className={styles.title} data-unread={unread || undefined}>
            {unread ? <span className={styles.dot} aria-hidden="true" /> : null}
            <span className={styles.titleText}>{categoryLabel}</span>
          </span>
          <span className={styles.meta}>
            {place ? <span>{place}</span> : null}
            {hideTime ? null : <span className="eg-tnum">{formatWatShort(observedAt, locale)}</span>}
          </span>
          <span className={styles.status}>
            <StatusBadge status={status} morph />
            {reference ? <span className={`${styles.code} eg-tnum`}>{reference}</span> : null}
            {note ? <span className={styles.note}>{note}</span> : null}
          </span>
        </span>
        {count ? <Count value={count} tone="needs" label={countLabel} /> : null}
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
