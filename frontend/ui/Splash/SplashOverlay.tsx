"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "../BrandMark/BrandMark";
import styles from "./SplashOverlay.module.css";

export function SplashOverlay() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Only show on first visit in the session
    try {
      const forceSplash = typeof window !== "undefined" && window.location.search.includes("splash=1");
      if (forceSplash) {
        const timer = window.setTimeout(() => setVisible(true), 0);
        return () => window.clearTimeout(timer);
      }
      const isTest = typeof window !== "undefined" && window.localStorage?.getItem("eg.test.ready");
      const isAutomation = typeof navigator !== "undefined" && navigator.webdriver;
      const seen = typeof window !== "undefined" && window.sessionStorage?.getItem("eg.splashSeen");
      const isSubRoute = typeof window !== "undefined" && (window.location.pathname.startsWith("/o/new") || window.location.pathname.startsWith("/o/reports") || window.location.pathname.startsWith("/o/checklist"));
      if (isTest || isAutomation || seen || isSubRoute) {
        return;
      }
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) {
        window.sessionStorage?.setItem("eg.splashSeen", "1");
        return;
      }

      const showTimer = window.setTimeout(() => {
        setVisible(true);
      }, 0);

      const timer = window.setTimeout(() => {
        setFading(true);
        window.setTimeout(() => {
          setVisible(false);
          window.sessionStorage?.setItem("eg.splashSeen", "1");
        }, 300);
      }, 1200);

      return () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(timer);
      };
    } catch {
      // fallback
    }
  }, []);

  const dismiss = () => {
    setFading(true);
    window.setTimeout(() => {
      setVisible(false);
      try {
        window.sessionStorage?.setItem("eg.splashSeen", "1");
      } catch {}
    }, 200);
  };

  if (!visible) return null;

  return (
    <div
      className={`${styles.overlay} ${fading ? styles.fading : ""}`}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="ElectraGuard AI"
    >
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
        <h1 className={styles.title}>ElectraGuard AI</h1>
        <p className={styles.credit}>by Cairn</p>
      </div>

      <div className={styles.bottomArt} aria-hidden="true">
        <div className={styles.scene} />
      </div>
    </div>
  );
}
