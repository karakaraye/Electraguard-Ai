import Link from "next/link";

/**
 * The "Report what you saw" button in the header, on every public page. The full label shows on
 * wide screens and the short one on phones (the shell's CSS decides which). It is the only solid
 * black button in the bar, and its accessible name is always the full label.
 */
export function HeaderReport({ href, label, shortLabel, className }: { href: string; label: string; shortLabel: string; className: string }) {
  return (
    <Link href={href} className={className} data-testid="header-report" aria-label={label}>
      <span data-full aria-hidden="true">{label}</span>
      <span data-short aria-hidden="true">{shortLabel}</span>
    </Link>
  );
}
