"use client";

import "../motion";
import { useEffect, useState, type CSSProperties } from "react";
import styles from "./Skeleton.module.css";

export type SkeletonProps = {
  /** Number of text-line blocks. */
  lines?: number;
  /** Height of each block in px. */
  height?: number;
  /** Delay before it shows, so fast loads do not flash. */
  delay?: number;
  className?: string;
};

/**
 * Placeholder blocks in the shape of the coming content. They take up their space at once
 * but only become visible after 300 ms. The caller sets aria-busy on the region.
 */
export function Skeleton({ lines = 3, height = 16, delay = 300, className }: SkeletonProps) {
  const [shown, setShown] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const id = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);

  return (
    <div className={`${styles.skeleton} ${className ?? ""}`} data-shown={shown || undefined} aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span
          key={index}
          className={styles.block}
          style={{ height, width: index === lines - 1 && lines > 1 ? "62%" : "100%" } as CSSProperties}
        />
      ))}
    </div>
  );
}
