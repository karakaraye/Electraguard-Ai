import type { AuditVerifyResponse, SecurityAlert } from "../../../../../lib/api/types";

/** Screen 49 (S-12) preview data. Synthetic: nothing here exists outside this gallery. */

export const ALERTS_OPEN: SecurityAlert[] = [
  {
    id: "al-open-1",
    rule: "repeated_failed_pins",
    severity: "high",
    status: "open",
    version: 1,
    subject: { type: "observer_code", label: "OBS-7K2P9D" },
    details: { failures: 12, window_minutes: 30, distinct_networks: 3, permanent: true },
    first_seen_at: "2026-12-05T07:10:00+01:00",
    last_seen_at: "2026-12-05T07:38:00+01:00",
    detector: "rules",
  },
  {
    id: "al-open-2",
    rule: "intake_burst",
    severity: "medium",
    status: "open",
    version: 1,
    subject: { type: "intake_source", label: "Report intake" },
    details: { reports: 412, window_minutes: 10 },
    first_seen_at: "2026-12-05T09:02:00+01:00",
    last_seen_at: "2026-12-05T09:14:00+01:00",
    detector: "rules",
  },
  {
    id: "al-open-3",
    rule: "anomaly",
    severity: "low",
    status: "open",
    version: 1,
    subject: { type: "receipt_lookup", label: "Receipt checks from one network" },
    details: { reports: 58, network: "a41f09c2e77b" },
    first_seen_at: "2026-12-05T10:20:00+01:00",
    last_seen_at: "2026-12-05T10:47:00+01:00",
    detector: "model",
  },
  {
    id: "al-open-4",
    rule: "new_network_sign_in",
    severity: "medium",
    status: "open",
    version: 2,
    subject: { type: "staff", label: "F. Musa" },
    details: { network: "5d2c18b0a9e3" },
    first_seen_at: "2026-12-05T11:31:00+01:00",
    last_seen_at: "2026-12-05T11:31:00+01:00",
    detector: "rules",
  },
];

export const ALERTS_ACKNOWLEDGED: SecurityAlert[] = [
  {
    id: "al-ack-1",
    rule: "unusual_download_volume",
    severity: "medium",
    status: "acknowledged",
    version: 2,
    subject: { type: "staff", label: "H. Bello" },
    details: { distinct_items: 64, window_minutes: 10 },
    first_seen_at: "2026-12-04T15:05:00+01:00",
    last_seen_at: "2026-12-04T15:19:00+01:00",
    detector: "rules",
  },
];

export const ALERTS_RESOLVED: SecurityAlert[] = [
  {
    id: "al-res-1",
    rule: "repeated_failed_staff_sign_in",
    severity: "high",
    status: "resolved",
    version: 3,
    subject: { type: "staff", label: "A. Okafor" },
    details: { failures: 9, window_minutes: 15 },
    first_seen_at: "2026-12-03T22:40:00+01:00",
    last_seen_at: "2026-12-03T22:58:00+01:00",
    detector: "rules",
  },
  {
    id: "al-res-2",
    rule: "receipt_enumeration",
    severity: "medium",
    status: "resolved",
    version: 3,
    subject: { type: "network", label: "Network 5d2c18b0a9e3" },
    details: { reports: 140, window_minutes: 20 },
    first_seen_at: "2026-12-02T13:00:00+01:00",
    last_seen_at: "2026-12-02T13:32:00+01:00",
    detector: "model",
  },
];

/** A page filler for the "Show more alerts" state. */
export const ALERTS_MORE: SecurityAlert[] = [
  ...ALERTS_OPEN,
  ...Array.from({ length: 4 }, (_, i): SecurityAlert => ({
    id: `al-more-${i}`,
    rule: "repeated_failed_pins",
    severity: "low",
    status: "open",
    version: 1,
    subject: { type: "observer_code", label: `OBS-4M${i}Q8T` },
    details: { failures: 5 + i, window_minutes: 30 },
    first_seen_at: "2026-12-05T06:00:00+01:00",
    last_seen_at: `2026-12-05T06:${10 + i}:00+01:00`,
    detector: "rules",
  })),
];

export const VERIFY_INTACT: AuditVerifyResponse = {
  intact: true,
  events_checked: 12402,
  head: {
    hash: "b5d12a884f3e9c1b72a0d9e8c6f1a4e2b0c9d7e5f3a1b4c6d8e0f2a4b6c8d0e2",
    event_count: 12402,
    at: "2026-12-05T11:00:00+01:00",
  },
  first_broken_event_id: null,
  checked_at: "2026-12-05T11:02:00+01:00",
};

export const VERIFY_BROKEN: AuditVerifyResponse = {
  intact: false,
  events_checked: 8217,
  head: {
    hash: "b5d12a884f3e9c1b72a0d9e8c6f1a4e2b0c9d7e5f3a1b4c6d8e0f2a4b6c8d0e2",
    event_count: 12402,
    at: "2026-12-05T11:00:00+01:00",
  },
  first_broken_event_id: "7f3a9c1e-52b4-4d86-9a0e-c61d2b84f7a3",
  checked_at: "2026-12-05T11:02:00+01:00",
};
