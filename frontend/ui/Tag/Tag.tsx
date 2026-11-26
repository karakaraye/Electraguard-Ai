import type { ReactNode } from "react";
import styles from "./Tag.module.css";

export type TagProps = { children: ReactNode; className?: string; "data-testid"?: string };

/** An outline label for a category or a fact ("Photo", "Ward 4"). No icon, no status colour. */
export function Tag({ children, className, "data-testid": testId }: TagProps) {
  return (
    <span className={`${styles.tag} ${className ?? ""}`} data-testid={testId}>
      {children}
    </span>
  );
}
