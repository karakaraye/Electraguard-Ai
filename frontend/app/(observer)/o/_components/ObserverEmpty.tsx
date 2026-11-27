import type { ReactNode } from "react";
import { ArtSlot } from "../../../../ui/ArtSlot/ArtSlot";
import type { ArtSlotId } from "../../../../ui/ArtSlot/art";
import p3 from "./p3.module.css";

/** Empty state for an observer list: a labelled art slot, one sentence, what will appear, and at most one action. */
export function ObserverEmpty({ art, title, children, action, "data-testid": testId }: { art: ArtSlotId; title: string; children?: ReactNode; action?: ReactNode; "data-testid"?: string }) {
  return (
    <section className={p3.empty} data-testid={testId}>
      <ArtSlot id={art} />
      <h2 className={p3.emptyTitle}>{title}</h2>
      {children ? <p className={p3.emptyText}>{children}</p> : null}
      {action ? <div className={p3.emptyAction}>{action}</div> : null}
    </section>
  );
}
