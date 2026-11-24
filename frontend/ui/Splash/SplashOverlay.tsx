"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BrandMark } from "../BrandMark/BrandMark";
import styles from "./SplashOverlay.module.css";

export function SplashOverlay() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  const dismiss = useCallback(() => {
    try {
      window.localStorage?.setItem("eg.splashSeen", "1");
    } catch {}

    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setVisible(false);
      return;
    }

    setFading(true);
    window.setTimeout(() => {
      setVisible(false);
    }, 200);
  }, []);

  useEffect(() => {
    try {
      const forceSplash = typeof window !== "undefined" && window.location.search.includes("splash=1");
      const isAllowedRoute = pathname === "/" || pathname === "/o/start";

      if (!isAllowedRoute && !forceSplash) {
        return;
      }

      const seen = typeof window !== "undefined" && window.localStorage?.getItem("eg.splashSeen");
      if (seen && !forceSplash) {
        return;
      }

      const showTimer = window.setTimeout(() => {
        setVisible(true);
      }, 0);

      const timer = window.setTimeout(() => {
        dismiss();
      }, 1200);

      return () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(timer);
      };
    } catch {
      // fallback
    }
  }, [pathname, dismiss]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      className={`${styles.overlay} ${fading ? styles.fading : ""}`}
      onClick={dismiss}
      role="presentation"
      data-testid="splash-overlay"
    >
      <span className="eg-sr-only" aria-live="polite">
        ElectraGuard AI
      </span>
      <div className={styles.center}>
        <div className={styles.sunRings}>
          <div className={styles.ringOuter}>
            <div className={styles.ringMid}>
              <div className={styles.ringInner}>
                <div className={styles.logoWrap}>
                  <BrandMark variant="symbol" size="lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className={styles.title}>ElectraGuard AI</p>
        <p className={styles.credit}>by Cairn</p>
      </div>

      <div className={styles.bottomArt} aria-hidden="true">
        <div className={styles.scene} />
      </div>
    </div>
  );
}
