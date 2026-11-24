import type { CSSProperties, ReactNode } from "react";
import styles from "./SunRings.module.css";

export type SunRingsProps = {
  /** Outer diameter in px. */
  size?: number;
  /** Number of concentric circles (2 to 4). */
  rings?: 2 | 3 | 4;
  /** Play the one-shot ripple on mount (the rings expand outward, 120 ms apart). */
  ripple?: boolean;
  /** Centre content, for example a check disc or the mark. */
  children?: ReactNode;
  className?: string;
};

const FILLS = ["var(--sun-wash)", "var(--sun-tint)", "var(--sun-tint)", "var(--sun)"];

/** Concentric sun-toned circles. Decorative. */
export function SunRings({ size = 156, rings = 3, ripple, children, className }: SunRingsProps) {
  const count = Math.min(4, Math.max(2, rings));
  // The outermost is the wash, the innermost is the sun (or the tint when there are only two).
  const fills = count === 2 ? [FILLS[0], FILLS[3]] : count === 3 ? [FILLS[0], FILLS[1], FILLS[3]] : FILLS;
  const step = size / (count * 2 + 0.6);
  return (
    <span
      className={`${styles.rings} ${className ?? ""}`}
      data-ripple={ripple || undefined}
      style={{ width: size, height: size } as CSSProperties}
      aria-hidden="true"
    >
      {fills.map((fill, index) => (
        <span
          key={index}
          className={styles.ring}
          style={{ inset: index * step, background: fill, animationDelay: `${index * 120}ms` } as CSSProperties}
        />
      ))}
      {children ? <span className={styles.centre}>{children}</span> : null}
    </span>
  );
}
