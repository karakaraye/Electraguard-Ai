import type { ReactNode, SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Rendered size in px. Defaults to the grid size (24 for icons, 40 for pictograms). */
  size?: number | string;
  /**
   * Accessible name. Leave empty when the icon sits next to visible text: it is
   * then hidden from screen readers.
   */
  title?: string;
};

type Spec = { grid: number; stroke: number; paths: ReactNode; displayName: string };

/** Line icons: square caps, mitred joins, stroke in currentColor. */
export function createIcon({ grid, stroke, paths, displayName }: Spec) {
  function Icon({ size = grid, title, ...rest }: IconProps) {
    const labelled = Boolean(title);
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${grid} ${grid}`}
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="square"
        strokeLinejoin="miter"
        focusable="false"
        role={labelled ? "img" : undefined}
        aria-hidden={labelled ? undefined : true}
        {...rest}
      >
        {labelled ? <title>{title}</title> : null}
        {paths}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const icon = (displayName: string, paths: ReactNode) =>
  createIcon({ grid: 24, stroke: 1.75, paths, displayName });

export const pictogram = (displayName: string, paths: ReactNode) =>
  createIcon({ grid: 40, stroke: 2, paths, displayName });
