import styles from "./BackgroundArt.module.css";

export type BackgroundArtProps = {
  /**
   * Keep the ground line above the pinned action area.
   * "actions" (default) clears one primary button; "none" sits on the viewport edge
   * (screens without an action area, such as the receipt).
   */
  clear?: "actions" | "none";
  "data-testid"?: string;
};

/**
 * Decorative polling-day scene fixed to the bottom of the viewport, tinted with --ink at
 * very low strength and faded toward the top so the text above stays fully readable.
 *
 * Place it as the first child of the screen's content. Siblings after it are lifted above
 * it without creating a new stacking context. Hidden for assistive technology, never
 * interactive, and not downloaded when the device asks for reduced data.
 *
 * Use on O-01 language, O-02 notice, O-03 choose / sign in (the choice screen, not the code
 * and PIN inputs), O-04 home empty state and O-12 receipt (clear="none" when there is no
 * action area). Never on form steps with inputs (O-05 to O-11, sign-in fields, set PIN).
 */
export function BackgroundArt({ clear = "actions", "data-testid": testId = "background-art" }: BackgroundArtProps) {
  return (
    <div
      className={styles.art}
      data-clear={clear}
      aria-hidden="true"
      data-testid={testId}
    >
      <div className={styles.scene} />
    </div>
  );
}
