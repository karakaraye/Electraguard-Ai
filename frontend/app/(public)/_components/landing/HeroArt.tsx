/**
 * A transparent render laid straight on the paper: no frame, no box, no tint. The phone
 * picture is cropped for a narrow screen, the desktop one is wide with empty paper on its left.
 * The left and top edges are faded into the page by the stylesheet (mask-image).
 */
export function HeroArt({ name, className, width, height, phone, "data-testid": testId }: {
  name: "hero" | "evening-footer";
  className?: string;
  width: number;
  height: number;
  /** Optional narrower picture for phones (the hero only). */
  phone?: { width: number; height: number };
  "data-testid"?: string;
}) {
  const desktop = name === "hero" ? "hero-desktop" : name;
  return (
    <picture className={className} data-testid={testId}>
      {phone ? (
        <>
          <source media="(max-width: 767px)" type="image/avif" srcSet="/art/hero-phone.avif" />
          <source media="(max-width: 767px)" type="image/webp" srcSet="/art/hero-phone.webp" />
          <source media="(max-width: 767px)" srcSet="/art/hero-phone.png" />
        </>
      ) : null}
      <source type="image/avif" srcSet={`/art/${desktop}.avif`} />
      <source type="image/webp" srcSet={`/art/${desktop}.webp`} />
      <img src={`/art/${desktop}.png`} alt="" width={width} height={height} decoding="async" fetchPriority={name === "hero" ? "high" : "low"} loading={name === "hero" ? "eager" : "lazy"} />
    </picture>
  );
}
