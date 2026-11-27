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
  /** Intake is paused: the card turns quiet and shows pausedText. It stays tappable, because a report can still be written. */
  paused?: boolean;
  pausedText?: ReactNode;
  /** A second action under the main one inside the same card (for example "Continue your draft"). Interactive content goes here, never inside the main link. */
  footer?: ReactNode;
  "data-testid"?: string;
};

function Art() {
  return (
    <svg className={styles.art} viewBox="0 0 350 146" preserveAspectRatio="xMaxYMin slice" aria-hidden="true" focusable="false">
      <g className={styles.sunGroup}>
        <circle cx="318" cy="2" r="66" className={styles.sunHalo} />
        <circle cx="290" cy="30" r="20" className={styles.sun} />
      </g>
    </svg>
  );
}

/**
 * The "Report something" card: an ink card with a sun, one tap target and a round plus.
 * Text sits in normal flow so it can grow with large type. A footer can carry a second action.
 */
export function HeroCard({ title, body, href, onClick, paused, pausedText, footer, "data-testid": testId = "hero-card" }: HeroCardProps) {
  const text = paused ? pausedText : body;
  const content = (
    <>
      <Art />
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {text ? <span className={styles.body}>{text}</span> : null}
      </span>
      <span className={styles.plus} aria-hidden="true">
        <PlusIcon size={28} strokeWidth={2} />
      </span>
    </>
  );
  const main =
    href && !paused ? (
      <Link href={href} className={styles.main} onClick={onClick} data-testid={testId}>
        {content}
      </Link>
    ) : (
      <button type="button" className={styles.main} onClick={onClick} data-testid={testId}>
        {content}
      </button>
    );
  return (
    <div className={styles.card} data-paused={paused || undefined}>
      {main}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}
