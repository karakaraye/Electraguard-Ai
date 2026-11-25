"use client";

/*
 * O-15 plate: the polling day drawn in code. The sun rides the real West Africa Time
 * clock along the arc between INEC's published opening (08:30) and closing (14:30)
 * times; before opening it waits at the left horizon, after closing it has set at the
 * right. The six stages are the stops on the ground line, filled as they are sent.
 */

import { useSyncExternalStore } from "react";
import { ArtPlate } from "../../../../ui/ArtPlate/ArtPlate";
import { sunPosition } from "../../../../ui/DayArc/DayArc";
import styles from "./DayPlate.module.css";

export type DayPlateStage = {
  id: string;
  label: string;
  state: "sent" | "next" | "later";
};

export type DayPlateProps = {
  stages: DayPlateStage[];
  /** For previews. Defaults to the real clock, read once a minute. */
  now?: Date;
  nextLabel?: string;
  listLabel: string;
  stateLabels: Record<DayPlateStage["state"], string>;
};

const HORIZON = 150;
const LEFT = 36;
const RIGHT = 354;
const CONTROL_Y = -90;
const STOP_Y = 196;

const arcPoint = (t: number) => {
  const u = 1 - t;
  return {
    x: u * u * LEFT + 2 * u * t * 195 + t * t * RIGHT,
    y: u * u * HORIZON + 2 * u * t * CONTROL_Y + t * t * HORIZON,
  };
};

const subscribe = (notify: () => void) => {
  const id = window.setInterval(notify, 60_000);
  return () => window.clearInterval(id);
};
const readMinute = () => Math.floor(Date.now() / 60_000);

export function DayPlate({
  stages,
  now,
  nextLabel,
  listLabel,
  stateLabels,
}: DayPlateProps) {
  const minute = useSyncExternalStore(subscribe, readMinute, readMinute);
  const clock = now ?? new Date(minute * 60_000);
  const sun = sunPosition(clock);
  const before = sun.below && sun.t === 0;
  const point = sun.below
    ? { x: before ? LEFT - 4 : RIGHT + 4, y: HORIZON + 6 }
    : arcPoint(sun.t);
  const count = Math.max(stages.length, 1);
  const stopX = (index: number) =>
    count === 1 ? LEFT : LEFT + ((RIGHT - LEFT) * index) / (count - 1);
  const sent = stages.filter((stage) => stage.state === "sent").length;
  const fillTo = sent === 0 ? LEFT : stopX(Math.min(sent - 1, count - 1));

  return (
    <div className={styles.wrap} data-testid="day-plate">
      <ArtPlate>
        <svg
          viewBox="0 0 390 220"
          className={styles.svg}
          aria-hidden="true"
          focusable="false"
        >
          <rect width="390" height="220" className={styles.sky} />
          <circle cx="195" cy="96" r="120" className={styles.ringOuter} />
          <circle cx="195" cy="96" r="78" className={styles.ringInner} />
          <path
            d={`M${LEFT} ${HORIZON} Q195 ${CONTROL_Y} ${RIGHT} ${HORIZON}`}
            className={styles.arc}
          />
          <g
            className={styles.sun}
            data-set={sun.below || undefined}
            transform={`translate(${point.x} ${point.y})`}
            suppressHydrationWarning
          >
            <circle r="19" className={styles.glow} />
            <circle r="11" className={styles.disc} />
          </g>
          <rect
            y={HORIZON}
            width="390"
            height={220 - HORIZON}
            className={styles.ground}
          />
          <line
            x1="0"
            x2="390"
            y1={HORIZON}
            y2={HORIZON}
            className={styles.horizon}
          />
          <text
            x={LEFT}
            y={HORIZON + 18}
            textAnchor="middle"
            className={styles.time}
          >
            08:30
          </text>
          <text
            x={RIGHT}
            y={HORIZON + 18}
            textAnchor="middle"
            className={styles.time}
          >
            14:30
          </text>
          <line
            x1={LEFT}
            x2={RIGHT}
            y1={STOP_Y}
            y2={STOP_Y}
            className={styles.track}
          />
          <line
            x1={LEFT}
            x2={fillTo}
            y1={STOP_Y}
            y2={STOP_Y}
            className={styles.done}
          />
          {stages.map((stage, index) => (
            <circle
              key={stage.id}
              cx={stopX(index)}
              cy={STOP_Y}
              r={stage.state === "next" ? 7 : 5.5}
              className={styles.stop}
              data-state={stage.state}
            />
          ))}
        </svg>
      </ArtPlate>
      {nextLabel ? <p className={styles.next}>{nextLabel}</p> : null}
      <ol className="eg-sr-only" aria-label={listLabel}>
        {stages.map((stage) => (
          <li
            key={stage.id}
            aria-current={stage.state === "next" ? "step" : undefined}
          >
            {stage.label}, {stateLabels[stage.state]}
          </li>
        ))}
      </ol>
    </div>
  );
}
