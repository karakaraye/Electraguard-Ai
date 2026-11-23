import type { Cell } from "../../../lib/api/types";
import styles from "./bars.module.css";

/**
 * One count with a plain bar, for tables that must load on 2G: no chart library, no
 * script, just a width. Suppressed cells say "fewer than 5" in words and draw an empty
 * dashed track, so nobody reads a hidden value as zero.
 */
export function CountBar({ cell, max, text, fewer }: { cell: Cell; max: number; text: string; fewer: string }) {
  if (cell.suppressed) {
    return (
      <span className={styles.row} data-suppressed="true">
        <span className={styles.value}>{fewer}</span>
        <span className={`${styles.track} ${styles.hidden}`} aria-hidden="true" />
      </span>
    );
  }
  const share = max > 0 ? Math.max(cell.count > 0 ? 2 : 0, Math.round((cell.count / max) * 100)) : 0;
  return (
    <span className={styles.row}>
      <span className={`${styles.value} eg-tnum`}>{text}</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ inlineSize: `${share}%` }} />
      </span>
    </span>
  );
}

/** Largest unsuppressed count, used to scale every bar in one table. */
export function maxCount(cells: Cell[]): number {
  return cells.reduce((top, cell) => (cell.suppressed ? top : Math.max(top, cell.count)), 0);
}
