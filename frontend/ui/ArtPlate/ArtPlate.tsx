import type { ReactNode } from "react";
import styles from "./ArtPlate.module.css";

export type ArtPlateProps = {
  /** Fallback image (WebP or PNG). Without src (and sources), children are drawn instead. */
  src?: string;
  /** Extra sources, best first: { type: "image/avif", srcSet: "a.avif 1x, a@2x.avif 2x" }. */
  sources?: Array<{ type: string; srcSet: string }>;
  /** Decorative by default. Give a sentence only where the picture carries meaning. */
  alt?: string;
  /** Inline SVG art, used when there is no image. */
  children?: ReactNode;
  /** Width / height, to reserve space while an image loads. */
  width?: number;
  height?: number;
  className?: string;
};

/**
 * A picture wrapper. In dark mode the art sits in a rounded paper window with a soft
 * inner fade, like an old photograph on a dark desk. There is one art file for both themes.
 */
export function ArtPlate({ src, sources, alt = "", children, width, height, className }: ArtPlateProps) {
  const decorative = alt === "";
  return (
    <div className={`${styles.plate} ${className ?? ""}`} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : alt}>
      <div className={styles.window} aria-hidden={decorative ? true : undefined}>
        {src ? (
          <picture>
            {sources?.map((source) => (
              <source key={source.type} type={source.type} srcSet={source.srcSet} />
            ))}
            <img src={src} alt="" width={width} height={height} className={styles.image} loading="lazy" decoding="async" />
          </picture>
        ) : (
          children
        )}
        <span className={styles.fade} />
      </div>
    </div>
  );
}
