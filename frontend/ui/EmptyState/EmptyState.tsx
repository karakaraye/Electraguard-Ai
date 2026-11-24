import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  /** One plain sentence: "No reports yet." */
  title: string;
  /** Optional second sentence explaining what will appear here. */
  children?: ReactNode;
  /** Optional spot illustration (decorative) shown above the sentence. */
  art?: ReactNode;
  /** One action. */
  action?: ReactNode;
  "data-testid"?: string;
};

/** Honest empty state: a sentence and one action. Spot art is decorative and never shows people. */
export function EmptyState({ title, children, art, action, "data-testid": testId = "empty-state" }: EmptyStateProps) {
  return (
    <section className={styles.empty} data-testid={testId}>
      {art ? (
        <div className={styles.art} aria-hidden="true">
          {art}
        </div>
      ) : null}
      <p className={styles.title}>{title}</p>
      {children ? <div className={styles.text}>{children}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}
