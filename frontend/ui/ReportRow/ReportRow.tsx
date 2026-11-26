"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { useLocale } from "../../lib/i18n/client";
import { formatWatDateTime } from "../format";
import { categoryPictograms, ChevronRightIcon, type IconProps, type IncidentCategory } from "../icons";
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
  "data-testid": testId = "report-row",
}: ReportRowProps) {
  const { locale } = useLocale();
  const Pictogram = pictogram ?? categoryPictograms[category];
  return (
    <li className={styles.item}>
      <Link href={href} className={styles.row} data-testid={testId}>
        <span className={styles.disc}>
          <Pictogram size={30} />
        </span>
        <span className={styles.main}>
          <span className={styles.title} data-unread={unread || undefined}>
            {unread ? <span className={styles.dot} aria-hidden="true" /> : null}
            {categoryLabel}
          </span>
          <span className={styles.meta}>
            {place ? <span>{place}</span> : null}
            {hideTime ? null : <span className="eg-tnum">{formatWatDateTime(observedAt, locale)}</span>}
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
