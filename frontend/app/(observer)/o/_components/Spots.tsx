/* Spot illustrations for empty states: ink line work with one sun disc. No people. */

const ink = { fill: "none", stroke: "var(--ink)", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A report form with a pen line and a rising sun behind it. */
export function ReportsSpot({ size = 144 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 144 144" aria-hidden="true" focusable="false">
      <circle cx="72" cy="72" r="64" fill="var(--sun-wash)" />
      <circle cx="72" cy="72" r="44" fill="var(--sun-tint)" />
      <circle cx="98" cy="40" r="14" fill="var(--sun)" />
      <rect x="40" y="38" width="52" height="68" rx="7" {...ink} fill="var(--paper-raised)" />
      <path d="M52 58h28M52 70h28M52 82h16" {...ink} />
      <path d="M86 104l22-22 7 7-22 22-10 3z" {...ink} fill="var(--paper-raised)" />
    </svg>
  );
}

/** An open speech bubble with three quiet lines and a sun dot. */
export function MessagesSpot({ size = 144 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 144 144" aria-hidden="true" focusable="false">
      <circle cx="72" cy="72" r="64" fill="var(--sun-wash)" />
      <circle cx="72" cy="72" r="44" fill="var(--sun-tint)" />
      <path d="M34 48a10 10 0 0 1 10-10h56a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10H70l-18 16v-16h-8a10 10 0 0 1-10-10z" {...ink} fill="var(--paper-raised)" />
      <path d="M50 58h44M50 70h28" {...ink} />
      <circle cx="104" cy="38" r="9" fill="var(--sun)" />
    </svg>
  );
}
