import type { CodeBatch, CodeCard, ObserverCodeRow } from "../../../../../lib/api/types";

/* Synthetic data for the screen 46 preview. The codes and PINs below are made up and match no real credential. */

export const S09_BATCHES: CodeBatch[] = [
  {
    id: "7d2b1a40-0000-4000-8000-000000000001",
    label: "Kano Municipal ward monitors",
    count: 120,
    created_at: "2026-11-20T10:00:00+01:00",
    created_by: "Adaeze Okafor",
    printed_at: "2026-11-20T10:14:00+01:00",
    active: 96,
    unclaimed: 20,
    revoked: 4,
  },
  {
    id: "7d2b1a40-0000-4000-8000-000000000002",
    label: "Dala training group B",
    count: 40,
    created_at: "2026-11-22T14:30:00+01:00",
    created_by: "Adaeze Okafor",
    printed_at: null,
    active: 0,
    unclaimed: 40,
    revoked: 0,
  },
  {
    id: "7d2b1a40-0000-4000-8000-000000000003",
    label: "Fagge rapid response",
    count: 25,
    created_at: "2026-11-23T09:05:00+01:00",
    created_by: "Ibrahim Sule",
    printed_at: "2026-11-23T09:20:00+01:00",
    active: 22,
    unclaimed: 2,
    revoked: 1,
  },
];

const [B1, B2, B3] = S09_BATCHES.map((b) => b.id);

function row(
  observer_code: string,
  batch_id: string,
  status: ObserverCodeRow["status"],
  activated_on: string | null,
  last_active_on: string | null,
  replaced_by: string | null = null,
): ObserverCodeRow {
  return { observer_code, batch_id, status, activated_on, last_active_on, replaced_by };
}

export const S09_CODES: ObserverCodeRow[] = [
  row("OBS-AB2C3D", B1, "active", "2026-11-21", "2026-11-25"),
  row("OBS-AB4E5F", B1, "active", "2026-11-21", "2026-11-24"),
  row("OBS-AB6G7H", B1, "locked", "2026-11-22", "2026-11-23"),
  row("OBS-AB8J9K", B1, "unclaimed", null, null),
  row("OBS-AC2M3N", B1, "revoked", "2026-11-21", "2026-11-22", "OBS-AC4P5Q"),
  row("OBS-AC4P5Q", B1, "unclaimed", null, null),
  row("OBS-AC6R7S", B1, "active", "2026-11-23", "2026-11-25"),
  row("OBS-BD2T3V", B2, "unclaimed", null, null),
  row("OBS-BD4W5X", B2, "unclaimed", null, null),
  row("OBS-BD6Y7Z", B2, "unclaimed", null, null),
  row("OBS-CE2A3B", B3, "active", "2026-11-23", "2026-11-25"),
  row("OBS-CE4C5D", B3, "locked", "2026-11-24", "2026-11-24"),
  row("OBS-CE6E7F", B3, "revoked", "2026-11-23", "2026-11-24"),
  row("OBS-CE8G9H", B3, "unclaimed", null, null),
];

const EXPIRES = "2026-12-09T10:20:00+01:00";

function card(observer_code: string, setup_pin: string): CodeCard {
  return { observer_code, setup_pin, setup_expires_at: EXPIRES };
}

/** Six cards, enough to show the grid and a second row. PINs are obvious fakes. */
export const S09_CARDS: CodeCard[] = [
  card("OBS-DF2G3H", "10000001"),
  card("OBS-DF4J5K", "10000002"),
  card("OBS-DF6M7N", "10000003"),
  card("OBS-DF8P9Q", "10000004"),
  card("OBS-DG2R3S", "10000005"),
  card("OBS-DG4T5V", "10000006"),
];

export const S09_ONE_CARD: CodeCard[] = [card("OBS-AC4P5Q", "20000001")];
