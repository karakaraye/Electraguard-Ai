import styles from "./BackgroundArt.module.css";

export type BackgroundArtProps = {
  /**
   * "hero": the full scene as a band across the top of the screen, in the page flow, with the
   * screen content below it on plain paper (welcome screens O-01, O-02, O-03 choose).
   * "plate": the scene at full strength along the bottom of its (positioned, paint-contained)
   * parent, with a paper fade only at the top edge. Used under the public home hero.
   * "soft": the same scene at low contrast, fixed to the bottom of the viewport and faded
   * toward the top, behind content that needs only a quiet background (O-04 empty, O-12).
   */
  variant?: "hero" | "soft" | "plate";
  /**
   * Soft only. Keep the ground line above the pinned action area.
   * "actions" (default) clears one primary button; "none" sits on the viewport edge.
   */
  clear?: "actions" | "none";
  "data-testid"?: string;
};

/**
 * Polling-day illustration: morning at a polling unit outside a school, people queueing under
 * the canopy and walking in from the road. Light and dark versions are separate SVG files;
 * only the one for the current theme is downloaded, and none at all when the device asks for
 * reduced data, prints, or uses forced colours.
 *
 * Place it as the first child of the screen's content. Hidden for assistive technology and
 * never interactive. Never on form steps with inputs (O-05 to O-11, sign-in fields, set PIN).
 */
export function BackgroundArt({
  variant = "soft",
  clear = "actions",
  "data-testid": testId = "background-art",
}: BackgroundArtProps) {
  return (
    <div
      className={styles.art}
      data-variant={variant}
      data-clear={variant === "soft" ? clear : undefined}
      aria-hidden="true"
      data-testid={testId}
    >
      <div className={styles.scene} />
    </div>
  );
}
