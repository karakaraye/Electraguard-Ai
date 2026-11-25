"use client";

import { useEffect, useState } from "react";
import styles from "./DayArc.module.css";

export type DayArcStage = { id: string; label: string; state: "sent" | "next" | "later" };

export type DayArcProps = {
  stages: DayArcStage[];
  /** For tests and previews. Defaults to the real clock. */
  now?: Date;
  /** The one visible line, for example "Next: Accreditation". Supplied by the caller, already translated. */
  nextLabel?: string;
  /** Accessible name of the stage list. */
  listLabel: string;
  /** Words for each state in the stage list. */
  stateLabels: Record<DayArcStage["state"], string>;
  "data-testid"?: string;
};

// Quadratic arc in a 340 x 58 box.
const P0 = { x: 20, y: 50 };
const P1 = { x: 170, y: -10 };
const P2 = { x: 320, y: 50 };
const PATH = `M${P0.x} ${P0.y} Q${P1.x} ${P1.y} ${P2.x} ${P2.y}`;

function pointAt(t: number) {
  const u = 1 - t;
  return {
    x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
    y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y,
  };
}

// INEC polling hours: accreditation and voting open 08:30 and close 14:30 WAT (voters in the queue still vote).
const DAY_START = 8 * 60 + 30; // 08:30 WAT
const DAY_END = 14 * 60 + 30; // 14:30 WAT

/** The sun's place on the arc for an instant, read in West Africa Time (UTC+1, no daylight saving). */
export function sunPosition(date: Date): { t: number; below: boolean } {
  const minutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 60) % (24 * 60);
  const raw = (minutes - DAY_START) / (DAY_END - DAY_START);
  return { t: Math.min(1, Math.max(0, raw)), below: raw < 0 || raw > 1 };
}

/** Re-renders once a minute, and only while the page is visible. */
function useVisibleMinute(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let id: number | undefined;
    const start = () => {
      if (id === undefined) id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    };
    const stop = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        setTick((n) => n + 1);
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
  return tick;
}

/**
 * The polling day as an arc: one dot per stage and the sun riding the real WAT clock.
 * Stage names are not printed on the arc (they do not fit at 360 px). A hidden list
 * reads each stage and its state, and one visible line names the next stage.
 */
export function DayArc({ stages, now, nextLabel, listLabel, stateLabels, "data-testid": testId = "day-arc" }: DayArcProps) {
  useVisibleMinute(!now);
  const clock = now ?? new Date();
  const count = Math.max(stages.length, 1);
  const sent = stages.filter((s) => s.state === "sent").length;
  const progress = sent === 0 ? 0 : Math.min(100, ((sent - 1) / Math.max(count - 1, 1)) * 100);
  const sun = sunPosition(clock);
  const sunPoint = pointAt(sun.t);
  // The sun rides just above the arc so it never sits on a stage dot (spec I-11);
  // outside polling hours it sits below the line, dimmed.
  const sunY = sun.below ? sunPoint.y + 18 : sunPoint.y - 18;

  return (
    <div className={styles.arc} data-testid={testId}>
      <svg viewBox="0 -24 340 100" className={styles.svg} aria-hidden="true" focusable="false">
        <path d={PATH} className={styles.track} />
        <path d={PATH} className={styles.progress} pathLength={100} strokeDasharray={`${progress} 100`} />
        {stages.map((stage, index) => {
          const p = pointAt(count === 1 ? 0 : index / (count - 1));
          return (
            <circle
              key={stage.id}
              cx={p.x}
              cy={p.y}
              r={stage.state === "next" ? 7 : 5.5}
              className={styles.dot}
              data-state={stage.state}
            />
          );
        })}
        <g className={styles.sun} data-below={sun.below || undefined} style={{ transform: `translate(${sunPoint.x}px, ${sunY}px)` }}>
          <circle r="13" className={styles.glow} />
          <circle r="8" className={styles.disc} />
        </g>
      </svg>
      {nextLabel ? <p className={styles.next}>{nextLabel}</p> : null}
      <ol className="eg-sr-only" aria-label={listLabel}>
        {stages.map((stage) => (
          <li key={stage.id} aria-current={stage.state === "next" ? "step" : undefined}>
            {stage.label}, {stateLabels[stage.state]}
          </li>
        ))}
      </ol>
    </div>
  );
}
