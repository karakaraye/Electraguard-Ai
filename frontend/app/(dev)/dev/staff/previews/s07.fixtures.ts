import type { Cell, PublicSnapshot, SnapshotRecord, SnapshotStatus } from "../../../../../lib/api/types";

/** Screen 44 (S-07) preview data. Synthetic: nothing here exists outside this gallery. */

const ok = (count: number): Cell => ({ count, suppressed: false });
const hidden: Cell = { count: null, suppressed: true };

const ORG = { id: "org-1", name: "ElectraGuard Observation Mission" };

function preview(over: Partial<PublicSnapshot> & { snapshot_id: string; cutoff: string }): PublicSnapshot {
  return {
    organisation: ORG,
    published_at: null,
    delay_minutes: 60,
    total: ok(412),
    by_state: [
      {
        state_code: "KN",
        state_name: "Kano",
        total: ok(236),
        by_category: {
          late_materials: ok(98),
          equipment_failure: ok(61),
          queues_crowding: ok(34),
          intimidation_violence: ok(21),
          access_barrier: ok(12),
          vote_buying: hidden,
          good_practice: ok(10),
        },
      },
      {
        state_code: "LA",
        state_name: "Lagos",
        total: ok(141),
        by_category: {
          late_materials: ok(52),
          equipment_failure: ok(40),
          queues_crowding: ok(27),
          intimidation_violence: hidden,
          access_barrier: ok(9),
          misinformation: ok(8),
          good_practice: ok(5),
        },
      },
      {
        state_code: "EB",
        state_name: "Ebonyi",
        total: ok(35),
        by_category: {
          late_materials: ok(14),
          equipment_failure: ok(11),
          queues_crowding: ok(6),
          intimidation_violence: hidden,
          vote_buying: hidden,
        },
      },
    ],
    outcomes: [
      { outcome: "corroborated", count: 268, share_percent: 65.0, suppressed: false },
      { outcome: "insufficient_evidence", count: 119, share_percent: 28.9, suppressed: false },
      { outcome: "out_of_scope", count: 25, share_percent: 6.1, suppressed: false },
    ],
    timeline: [
      { hour_start: "2026-12-05T07:00:00+01:00", count: ok(58) },
      { hour_start: "2026-12-05T08:00:00+01:00", count: ok(96) },
      { hour_start: "2026-12-05T09:00:00+01:00", count: ok(121) },
      { hour_start: "2026-12-05T10:00:00+01:00", count: ok(84) },
      { hour_start: "2026-12-05T11:00:00+01:00", count: ok(53) },
    ],
    audit_chain_head: {
      hash: "b5d12a884f3e9c1b72a0d9e8c6f1a4e2b0c9d7e5f3a1b4c6d8e0f2a4b6c8d0e2",
      event_count: 18422,
      at: "2026-12-05T12:00:00+01:00",
    },
    ...over,
  };
}

function release(
  id: string,
  status: SnapshotStatus,
  cutoff: string,
  more: { hash: string; by?: string; publishedAt?: string | null; total?: Cell; version?: number; excluded?: SnapshotRecord["excluded"]; over?: Partial<PublicSnapshot> },
): SnapshotRecord {
  const publishedAt = more.publishedAt ?? null;
  return {
    id,
    status,
    version: more.version ?? 1,
    cutoff,
    created_by: more.by ?? "F. Musa",
    approved_by: publishedAt ? "A. Bello" : null,
    published_at: publishedAt,
    preview: preview({
      snapshot_id: id,
      cutoff,
      published_at: publishedAt,
      total: more.total ?? ok(412),
      audit_chain_head: { hash: more.hash, event_count: 18422, at: cutoff },
      ...more.over,
    }),
    excluded: more.excluded ?? { not_closed: 20, withdrawn: 3, after_cutoff: 15, other_kinds: 2 },
  };
}

export const DRAFT = release("snap-5", "draft", "2026-12-05T11:00:00+01:00", {
  hash: "b5d12a884f3e9c1b72a0d9e8c6f1a4e2b0c9d7e5f3a1b4c6d8e0f2a4b6c8d0e2",
});

export const PUBLISHED = release("snap-4", "published", "2026-12-05T10:00:00+01:00", {
  hash: "7e3a09c4d1f58b26a0c93e7d41b6f258c0a9e3d7b14f6a82c5d09e3b7a1f4c68",
  publishedAt: "2026-12-05T11:10:00+01:00",
  version: 2,
  total: ok(328),
  excluded: { not_closed: 31, withdrawn: 2, after_cutoff: 51, other_kinds: 0 },
  over: {
    total: ok(328),
    by_state: [
      { state_code: "KN", state_name: "Kano", total: ok(190), by_category: { late_materials: ok(80), equipment_failure: ok(48), queues_crowding: ok(30) } },
      { state_code: "LA", state_name: "Lagos", total: ok(138), by_category: { late_materials: ok(49), equipment_failure: ok(37), queues_crowding: ok(22) } },
    ],
    outcomes: [
      { outcome: "corroborated", count: 211, share_percent: 64.3, suppressed: false },
      { outcome: "insufficient_evidence", count: 98, share_percent: 29.9, suppressed: false },
      { outcome: "out_of_scope", count: 19, share_percent: 5.8, suppressed: false },
    ],
  },
});

export const SUPERSEDED = release("snap-3", "superseded", "2026-12-05T09:00:00+01:00", {
  hash: "2c91f4a7e03b58d6a1c47f90e2b35d86c7a04e19f3b62d58a0c71e94b3f6d205",
  publishedAt: "2026-12-05T10:10:00+01:00",
  version: 3,
  total: ok(241),
});

export const DISCARDED = release("snap-2", "discarded", "2026-12-05T08:00:00+01:00", {
  hash: "e84b1d70a3c9562f08d7b4e1a96c30f5d2b87a41c60e9f3d58a2b7c14e0f9d63",
  version: 2,
  by: "T. Okafor",
  total: hidden,
  over: { total: hidden, by_state: [], outcomes: [], timeline: [] },
});

export const OLDEST = release("snap-1", "superseded", "2026-12-05T07:00:00+01:00", {
  hash: "5a07c3e91d4b8f26a0e5c73d19b4f862c0a7e3d51b94f6a08c2d7e3b15f9a064",
  publishedAt: "2026-12-05T08:10:00+01:00",
  version: 3,
  total: ok(117),
});

/** A draft where small counts are hidden, as the public page will hide them. */
export const DRAFT_SMALL = release("snap-6", "draft", "2026-12-05T07:00:00+01:00", {
  hash: "9d40b7e2a15c83f6d0a9e4b21c7f5380e6a2d94b17c3f085a6d2e9b41f7c0358",
  total: hidden,
  excluded: { not_closed: 4, withdrawn: 0, after_cutoff: 1, other_kinds: 0 },
  over: {
    total: hidden,
    by_state: [{ state_code: "EB", state_name: "Ebonyi", total: hidden, by_category: { late_materials: hidden, equipment_failure: hidden } }],
    outcomes: [
      { outcome: "corroborated", count: null, share_percent: null, suppressed: true },
      { outcome: "insufficient_evidence", count: null, share_percent: null, suppressed: true },
      { outcome: "out_of_scope", count: null, share_percent: null, suppressed: true },
    ],
    timeline: [],
  },
});

export const HISTORY: SnapshotRecord[] = [DRAFT, PUBLISHED, SUPERSEDED, DISCARDED, OLDEST];

/** A longer history, for the load-more state. */
export const HISTORY_LONG: SnapshotRecord[] = [
  DRAFT,
  PUBLISHED,
  SUPERSEDED,
  DISCARDED,
  OLDEST,
  ...Array.from({ length: 5 }, (_, i) =>
    release(`snap-old-${i}`, "superseded", `2026-12-04T${String(18 - i * 2).padStart(2, "0")}:00:00+01:00`, {
      hash: `${(0x3a7f1c90 + i * 4097).toString(16).padStart(8, "0")}d4b8e2a6c1f05937ae82b4d6c9f1e30a5b7d2c84e6f1a093b5c7d8e2f4a61`,
      publishedAt: `2026-12-04T${String(19 - i * 2).padStart(2, "0")}:10:00+01:00`,
      total: ok(300 - i * 41),
      by: i % 2 ? "T. Okafor" : "F. Musa",
    }),
  ),
];
