import { OBSERVER_ART, type ArtSlotId } from "./art";
import styles from "./ArtSlot.module.css";

/**
 * A 342 x 200 slot for a scene. Decorative (empty alt). In development it shows which Blender
 * scene it is waiting for; in production the label is not rendered.
 */
export function ArtSlot({ id }: { id: ArtSlotId }) {
  const art = OBSERVER_ART[id];
  return (
    <div className={styles.slot} data-testid={`art-${id}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.img} src={art.src} alt="" width={342} height={200} decoding="async" />
      {process.env.NODE_ENV !== "production" ? (
        <span className={styles.label}>
          <i aria-hidden="true" />
          Art: {art.scene}
        </span>
      ) : null}
    </div>
  );
}
