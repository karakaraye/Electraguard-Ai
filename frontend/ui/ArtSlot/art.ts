/**
 * The one place that names the scene each art slot takes. The files under /public/art/observer are the
 * line-drawing stand-ins; the final Blender renders replace them by file name (same path, same ratio),
 * and nothing else in the app changes. `scene` is the Blender scene the slot is waiting for.
 */
export type ArtSlotId = "reportsEmpty" | "messagesEmpty" | "discussionsEmpty";

export type ArtSlotEntry = { src: string; scene: string };

export const OBSERVER_ART: Record<ArtSlotId, ArtSlotEntry> = {
  reportsEmpty: { src: "/art/observer/reports-empty.svg", scene: "story, panel a" },
  messagesEmpty: { src: "/art/observer/messages-empty.svg", scene: "story, panel b" },
  discussionsEmpty: { src: "/art/observer/discussions-empty.svg", scene: "sheet, observers row" },
};
