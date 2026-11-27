import type { ReactNode } from "react";
import { ArtSlot } from "../../../../ui/ArtSlot/ArtSlot";
import type { ArtSlotId } from "../../../../ui/ArtSlot/art";
import p3 from "./p3.module.css";

/** Empty state for an observer list: a labelled art slot, one sentence, what will appear, and at most one action. */
/** `headingLevel` 1 when the empty state is the whole screen (no other heading names the page). */
export function ObserverEmpty({ art, title, children, action, headingLevel = 2, "data-testid": testId }: { art: ArtSlotId; title: string; children?: ReactNode; action?: ReactNode; headingLevel?: 1 | 2; "data-testid"?: string }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className={p3.empty} data-testid={testId}>
      <ArtSlot id={art} />
      <Heading className={p3.emptyTitle}>{title}</Heading>
      {children ? <p className={p3.emptyText}>{children}</p> : null}
      {action ? <div className={p3.emptyAction}>{action}</div> : null}
    </section>
  );
}
