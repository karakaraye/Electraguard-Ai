import type { ReactElement } from "react";

/**
 * Spot illustrations for the system pages (screen 50): ink lines with sun fills, no people.
 * Decorative: the page title says what happened. They share one drawing language so the five
 * pages read as one family: the ballot box, a rounded 2.5 px ink line, and the sun for the
 * one thing to look at.
 */
type SpotProps = { size?: number };

const line = {
  fill: "none",
  stroke: "var(--ink)",
  strokeWidth: 2.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Frame({ size = 120, children }: SpotProps & { children: ReactElement | ReactElement[] }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 120 96" aria-hidden="true" focusable="false">
      <path d="M12 86h96" {...line} strokeWidth={2} />
      {children}
    </svg>
  );
}

/** Not found: a signpost whose boards point nowhere in particular. */
export function NotFoundSpot({ size }: SpotProps) {
  return (
    <Frame size={size}>
      <path d="M60 86V14" {...line} />
      <path d="M60 22h36l8 9-8 9H60z" {...line} fill="var(--sun-tint)" stroke="var(--ink)" />
      <path d="M60 48H24l-8 9 8 9h36z" {...line} fill="var(--sun)" />
      <circle cx="60" cy="12" r="3" fill="var(--ink)" />
      <path d="M72 31h18M30 57h18" {...line} strokeWidth={2} strokeDasharray="1 5" />
    </Frame>
  );
}

/** Error: a ballot box with a crack through it; the sun is the slot where the paper goes in. */
export function ErrorSpot({ size }: SpotProps) {
  return (
    <Frame size={size}>
      <path d="M26 40h68l-6 46H32z" {...line} fill="var(--sun-tint)" />
      <path d="M44 40V28h32v12" {...line} />
      <rect x="46" y="18" width="28" height="8" rx="4" fill="var(--sun)" stroke="var(--ink)" strokeWidth={2.5} />
      <path d="M70 40l-8 14 10 8-9 14" {...line} />
      <path d="M96 24l6-8M104 38l8-3M22 24l-6-8" {...line} strokeWidth={2} />
    </Frame>
  );
}

/** Session ended: a padlock, closed. */
export function SessionSpot({ size }: SpotProps) {
  return (
    <Frame size={size}>
      <path d="M44 48V34a16 16 0 0 1 32 0v14" {...line} />
      <rect x="32" y="48" width="56" height="38" rx="8" fill="var(--sun-tint)" stroke="var(--ink)" strokeWidth={2.5} />
      <circle cx="60" cy="64" r="6" fill="var(--sun)" stroke="var(--ink)" strokeWidth={2.5} />
      <path d="M60 70v7" {...line} />
    </Frame>
  );
}

/** Access changed: a key that now opens a different door. */
export function AccessSpot({ size }: SpotProps) {
  return (
    <Frame size={size}>
      <circle cx="40" cy="44" r="16" fill="var(--sun)" stroke="var(--ink)" strokeWidth={2.5} />
      <circle cx="40" cy="44" r="5" fill="var(--paper-raised)" stroke="var(--ink)" strokeWidth={2.5} />
      <path d="M56 44h42M84 44v12M96 44v9" {...line} />
      <path d="M22 76c8 8 28 8 38-2M56 71l4 3-1 5" {...line} strokeWidth={2} />
    </Frame>
  );
}

/** Intake paused: the ballot box, sealed, with a pause sign on its front. */
export function PausedSpot({ size }: SpotProps) {
  return (
    <Frame size={size}>
      <path d="M24 34h72l-6 52H30z" {...line} fill="var(--sun-tint)" />
      <path d="M44 34V22h32v12" {...line} />
      <path d="M52 22h16" {...line} />
      <rect x="49" y="46" width="7" height="26" rx="2" fill="var(--sun)" stroke="var(--ink)" strokeWidth={2.5} />
      <rect x="64" y="46" width="7" height="26" rx="2" fill="var(--sun)" stroke="var(--ink)" strokeWidth={2.5} />
    </Frame>
  );
}
