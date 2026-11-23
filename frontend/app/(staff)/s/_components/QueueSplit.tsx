"use client";

import type { ReactNode } from "react";
import styles from "../../../../ui/StaffShell/StaffShell.module.css";

export function QueueSplit({
  list,
  detail,
  focus = "list",
}: {
  list: ReactNode;
  detail: ReactNode;
  focus?: "list" | "detail";
}) {
  return (
    <div className={styles.split} data-focus={focus}>
      <div className={styles.listPane}>{list}</div>
      <div className={styles.detailPane}>{detail}</div>
    </div>
  );
}
