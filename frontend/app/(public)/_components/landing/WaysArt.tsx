import type { ReactNode } from "react";
import "../living-scene/scene-colours.css";
import "./landing-art.css";
import styles from "./ways.module.css";

/*
 * The three small drawings under "Three ways to report" (landing plan §4.6). Their base markup is the
 * finished still picture; ways.module.css loops them only while on screen and only with full motion.
 * No words except the real service codes, which come from the one place they are defined.
 */

/** The report form on the app: a card, a tap on its button. */
export function WayApp() {
  return (
    <svg className="ga living-scene" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="144" rx="66" ry="4.5" className="ga-sh" opacity="0.5" />
      <rect x="62" y="6" width="76" height="136" rx="14" className="ga-c1" />
      <rect x="68" y="16" width="64" height="116" rx="9" className="ga-rd" />
      <rect x="74" y="26" width="52" height="48" rx="6" className="ga-re" />
      <circle cx="100" cy="43" r="9" className="ga-sunt" />
      <path d="M95.5 47.5l1-4.2 5.8-5.8a1.6 1.6 0 0 1 2.3 2.3l-5.8 5.8z" className="ga-line ga-sink" strokeWidth="1.4" />
      <rect x="82" y="60" width="36" height="4" rx="2" className="ga-c3" />
      <rect x="74" y="84" width="52" height="22" rx="11" className="ga-c1" />
      <circle cx="100" cy="95" r="10" fill="none" strokeWidth="2" className={`ga-line ga-sstrong ${styles.ripple}`} />
      <rect x="82" y="114" width="36" height="5" rx="2.5" className="ga-c4" />
    </svg>
  );
}

function FeaturePhone({ children }: { children: ReactNode }) {
  return (
    <>
      <ellipse cx="100" cy="146" rx="52" ry="4" className="ga-sh" opacity="0.5" />
      <rect x="58" y="4" width="84" height="140" rx="14" className="ga-c1" />
      <rect x="66" y="14" width="68" height="58" rx="4" className="ga-rd" />
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2].map((col) => <rect key={`${row}-${col}`} x={68 + col * 22} y={82 + row * 14} width="18" height="10" rx="3" className="ga-c3" />),
      )}
      {children}
    </>
  );
}

/** A basic phone typing a short message to the SMS number; a tick shows it was sent. */
export function WaySms() {
  return (
    <svg className="ga living-scene" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      <FeaturePhone>
        <rect x="72" y="22" width="30" height="5" rx="2.5" className="ga-ink" />
        <rect x="72" y="36" width="56" height="5" rx="2.5" className={`ga-c3 ${styles.typed} ${styles.typed1}`} />
        <rect x="72" y="46" width="46" height="5" rx="2.5" className={`ga-c3 ${styles.typed} ${styles.typed2}`} />
        <rect x="72" y="56" width="30" height="5" rx="2.5" className={`ga-c3 ${styles.typed} ${styles.typed3}`} />
        <g className={styles.tick}>
          <circle cx="122" cy="62" r="6" className="ga-okbg" />
          <circle cx="122" cy="62" r="6" fill="none" strokeWidth="1.4" className="ga-line ga-sok" />
          <path d="M119 62.2l2.2 2.2 4-4.6" strokeWidth="1.6" className="ga-line ga-sok" />
        </g>
      </FeaturePhone>
    </svg>
  );
}

/** The same phone: the service code is dialled key by key, then a numbered menu appears. */
export function WayUssd() {
  return (
    <svg className="ga living-scene" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      <FeaturePhone>
        <rect x="72" y="22" width="52" height="6" rx="3" className={`ga-ink ${styles.dial}`} />
        <g className={styles.menu1}>
          <circle cx="75" cy="42.5" r="2.6" className="ga-ink" />
          <rect x="82" y="40" width="44" height="5" rx="2.5" className="ga-c3" />
        </g>
        <g className={styles.menu2}>
          <circle cx="75" cy="55.5" r="2.6" className="ga-ink" />
          <rect x="82" y="53" width="34" height="5" rx="2.5" className="ga-c3" />
        </g>
      </FeaturePhone>
    </svg>
  );
}
