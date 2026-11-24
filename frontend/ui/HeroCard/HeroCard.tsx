import Link from "next/link";
import type { ReactNode } from "react";
import { PlusIcon } from "../icons";
import styles from "./HeroCard.module.css";

export type HeroCardProps = {
  title: ReactNode;
  body?: ReactNode;
  /** Navigates when set. */
  href?: string;
  onClick?: () => void;
  /** Intake is paused: the sun greys, the card is not interactive and shows pausedText. */
  paused?: boolean;
  pausedText?: ReactNode;
  "data-testid"?: string;
};

function Art() {
  return (
    <svg className={styles.art} viewBox="0 0 350 146" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
      <g className={styles.sunGroup}>
        <circle cx="262" cy="50" r="66" className={styles.sun} opacity=".08" />
        <circle cx="262" cy="50" r="44" className={styles.sun} opacity=".14" />
        <circle cx="262" cy="50" r="26" className={styles.sun} />
      </g>
      <path d="M140 146 Q210 102 262 110 T350 96 V146Z" fill="var(--hero-ink)" opacity=".07" />
      <g fill="var(--hero-ink)" opacity=".18">
        <path d="M214 118h28v-13l-14-10-14 10z" />
        <circle cx="190" cy="110" r="8" />
        <rect x="189" y="110" width="2" height="12" />
      </g>
    </svg>
  );
}

/**
 * The "Report something" card: an ink card with a sun and a hill, one link, and a
 * round plus. Text sits in normal flow so it can grow with large type.
 */
export function HeroCard({ title, body, href, onClick, paused, pausedText, "data-testid": testId = "hero-card" }: HeroCardProps) {
  const content = (
    <>
      <Art />
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {paused ? (
          pausedText ? <span className={styles.body}>{pausedText}</span> : null
        ) : body ? (
          <span className={styles.body}>{body}</span>
        ) : null}
      </span>
      {paused ? null : (
        <span className={styles.plus} aria-hidden="true">
          <PlusIcon size={26} strokeWidth={2.4} />
        </span>
      )}
    </>
  );

  if (paused) {
    return (
      <div className={`${styles.card} ${styles.paused}`} data-paused="" data-testid={testId}>
        {content}
      </div>
    );
  }
  if (href) {
    return (
      <Link href={href} className={styles.card} onClick={onClick} data-testid={testId}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={styles.card} onClick={onClick} data-testid={testId}>
      {content}
    </button>
  );
}
