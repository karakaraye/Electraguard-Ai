import styles from "./Count.module.css";

export type CountTone = "neutral" | "urgent" | "needs";

export type CountProps = {
  value: number;
  /** neutral: a plain total. needs: asks for action. urgent: something is wrong or overdue. */
  tone?: CountTone;
  /** Spoken name for the number, for example "unread messages". Without it the number is read as is. */
  label?: string;
  className?: string;
  "data-testid"?: string;
};

/** A small number chip, never wider than "99+". Same size wherever it appears. */
export function Count({ value, tone = "neutral", label, className, "data-testid": testId }: CountProps) {
  const shown = value > 99 ? "99+" : String(Math.max(0, Math.floor(value)));
  return (
    <span
      className={`${styles.count} eg-tnum ${className ?? ""}`}
      data-tone={tone}
      data-testid={testId}
      aria-label={label ? `${shown} ${label}` : undefined}
    >
      {shown}
    </span>
  );
}
