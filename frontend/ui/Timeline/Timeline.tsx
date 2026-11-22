"use client";

import { useLocale, useT } from "../../lib/i18n/client";
import { formatWatDateTime } from "../format";
import { LinkBrokenIcon, ShieldCheckIcon, HelpIcon } from "../icons";
import styles from "./Timeline.module.css";

export type TimelineEvent = {
  id: string;
  /** Who did it: a staff name, an observer code, "System". */
  actor: string;
  /** ISO time or epoch ms. */
  at: string | number;
  /** What changed, in plain words. */
  change: string;
  detail?: string;
  /** This entry's own hash check, when known. */
  broken?: boolean;
};

export type TimelineProps = {
  events: TimelineEvent[];
  /** Result of the hash-chain check over the whole history. */
  chain: "intact" | "broken" | "unknown";
  label?: string;
  "data-testid"?: string;
};

/** Audit history with actor, time, change and the hash-chain status. */
export function Timeline({ events, chain, label, "data-testid": testId = "timeline" }: TimelineProps) {
  const t = useT();
  const { locale } = useLocale();
  const ChainIcon = chain === "intact" ? ShieldCheckIcon : chain === "broken" ? LinkBrokenIcon : HelpIcon;
  return (
    <section className={styles.timeline} data-testid={testId} aria-label={label}>
      <p className={styles.chain} data-chain={chain}>
        <ChainIcon size={20} />
        <span>{t(`ui.timeline.${chain}`)}</span>
      </p>
      <ol className={styles.list}>
        {events.map((event) => (
          <li key={event.id} className={styles.event} data-broken={event.broken || undefined}>
            <span className={styles.dot} aria-hidden="true" />
            <p className={styles.change}>{event.change}</p>
            <p className={`${styles.meta} eg-tnum`}>
              <span>{event.actor}</span>
              <span>{formatWatDateTime(event.at, locale)}</span>
            </p>
            {event.detail ? <p className={styles.detail}>{event.detail}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
