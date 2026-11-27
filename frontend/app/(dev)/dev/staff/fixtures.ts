import type {
  CaseDetail,
  Claim,
  Cluster,
  CodeBatch,
  CoverageResponse,
  LateMaterialsResponse,
  AssignmentListResponse,
  Message,
  ModerationFlag,
  OrganisationSettings,
  OverviewResponse,
  QueueItem,
  QueueResponse,
  SecurityAlert,
  SnapshotRecord,
  StaffAccount,
} from "../../../../lib/api/types";

export const FIXTURE_STAFF_ACCOUNT: StaffAccount = {
  id: "st-1",
  email: "f.musa@electraguard.ng",
  display_name: "F. Musa",
  roles: ["reviewer", "coordinator"],
  status: "active",
  totp_enrolled: true,
  last_sign_in_on: "2026-11-23",
  version: 1,
};

export const FIXTURE_QUEUE_ITEM: QueueItem = {
  id: "rep-001",
  receipt_code: "EG-7K2P-9DNQ",
  kind: "incident",
  channel: "app",
  status: "received",
  urgency: {
    level: "urgent",
    source: "suggested",
    reasons: ["danger_reported"],
  },
  category: {
    value: "intimidation_violence",
    source: "observer",
  },
  area: {
    state_code: "KN",
    state_name: "Kano",
    lga_code: "1901",
    lga_name: "Kano Municipal",
    ward_code: "190101",
    ward_name: "Zango",
    polling_unit_code: null,
    polling_unit_name: null,
  },
  occurred_at: "2026-12-05T08:15:00+01:00",
  received_at: "2026-12-05T08:16:30+01:00",
  media_counts: { photo: 2, video: 0, audio: 0 },
  has_open_question: false,
  unread_messages: 0,
  flags: {
    possible_duplicate: true,
    result_sheet_flags: 0,
    possible_names: false,
  },
  last_activity_at: "2026-12-05T08:20:00+01:00",
};

export const FIXTURE_QUEUE_RESPONSE: QueueResponse = {
  items: [FIXTURE_QUEUE_ITEM],
  next_cursor: null,
  counts: {
    received: 1,
    in_review: 0,
    question: 0,
    closed: 0,
    withdrawn: 0,
  },
};

export const FIXTURE_CASE_DETAIL: CaseDetail = {
  id: "rep-001",
  receipt_code: "EG-7K2P-9DNQ",
  kind: "incident",
  channel: "app",
  status: "received",
  outcome: null,
  version: 3,
  reporter: {
    type: "observer",
    label: "Observer OBS-7K2P9D",
    accredited: true,
  },
  language: "ha",
  original: {
    description: "Wasu mutane dauke da makamai sun shigo rumfar zabe sun kori masu kada kuri'a.",
    redacted_description: "Wasu mutane dauke da makamai sun shigo rumfar zabe sun kori masu kada kuri'a.",
    redactions: [],
  },
  translation: {
    status: "ready",
    text: "Some armed individuals entered the polling unit and chased away voters.",
    from: "ha",
    to: "en",
    method: "neural_mt",
    label_key: "case.machine_translation",
  },
  category_observer: "intimidation_violence",
  access_barrier_details: [],
  danger_now: true,
  firsthand: true,
  area: {
    state_code: "KN",
    state_name: "Kano",
    lga_code: "1901",
    lga_name: "Kano Municipal",
    ward_code: "190101",
    ward_name: "Zango",
    polling_unit_code: "19-01-01-002",
    polling_unit_name: "Zango Primary School",
  },
  times: {
    occurred_at: "2026-12-05T08:15:00+01:00",
    device_saved_at: "2026-12-05T08:15:30+01:00",
    received_at: "2026-12-05T08:16:30+01:00",
    clock_skew_seconds: 0,
  },
  checklist: null,
  result_sheet: null,
  media: [
    {
      id: "med-1",
      kind: "photo",
      status: "ready",
      size_bytes: 245000,
      duration_ms: null,
      blurred: false,
      exif_removed: true,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      original_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      integrity_verified: true,
      transcript: null,
      created_at: "2026-12-05T08:16:00+01:00",
    },
  ],
  pending_uploads: [],
  suggestions: {
    status: "ready",
    model_versions: { triage: "v2.1" },
    category: {
      value: "intimidation_violence",
      confidence: "high",
      reasons: ["Armed men are said to have driven voters away from the polling unit"],
      decision: null,
      corrected_value: null,
    },
    urgency: {
      value: "urgent",
      confidence: "high",
      reasons: ["The report says people are in danger right now", "The observer saw it first-hand"],
      decision: null,
      corrected_value: null,
    },
    abstained: false,
  },
  duplicates: [],
  result_sheet_flags: [],
  related_claims: [],
  name_check: { possible_names: false },
  open_question: null,
  allowed_actions: ["start", "ask", "close", "redact"],
  history: {
    chain_intact: true,
    events: [
      {
        id: "ev-1",
        version: 1,
        action: "start",
        actor_label: "F. Musa (Admin)",
        created_at: "2026-12-05T08:18:00+01:00",
        change: {},
      },
    ],
  },
};

export const FIXTURE_OVERVIEW: OverviewResponse = {
  range: { from: "2026-12-05", to: "2026-12-05" },
  totals: {
    reports: 1240,
    incidents_after_links: 980,
    urgent_open: 42,
    open_questions: 12,
    result_sheet_flags_open: 5,
    withdrawn: 14,
  },
  by_status: [
    { status: "received", count: 180 },
    { status: "in_review", count: 42 },
    { status: "question", count: 12 },
    { status: "closed", count: 720 },
  ],
  by_outcome: [
    { outcome: "corroborated", count: 500 },
    { outcome: "insufficient_evidence", count: 120 },
    { outcome: "out_of_scope", count: 100 },
  ],
  by_category: [
    { category: "late_materials", count: 400 },
    { category: "equipment_failure", count: 250 },
    { category: "intimidation_violence", count: 150 },
    { category: "not_sure", count: 180 },
  ],
  by_channel: [
    { channel: "app", count: 800 },
    { channel: "sms", count: 300 },
    { channel: "ussd", count: 140 },
  ],
  by_lga: [
    { state_code: "KN", lga_code: "1901", lga_name: "Kano Municipal", count: 350, urgent: 15 },
    { state_code: "KN", lga_code: "1902", lga_name: "Fagge", count: 280, urgent: 10 },
    { state_code: "KN", lga_code: "1903", lga_name: "Dala", count: 214, urgent: 9 },
    { state_code: "KN", lga_code: "1904", lga_name: "Gwale", count: 166, urgent: 4 },
    { state_code: "KN", lga_code: "1905", lga_name: "Nassarawa", count: 92, urgent: 2 },
    { state_code: "KN", lga_code: "1906", lga_name: "Tarauni", count: 81, urgent: 1 },
    { state_code: "KN", lga_code: "1907", lga_name: "Ungogo", count: 57, urgent: 0 },
  ],
  generated_at: "2026-12-05T12:00:00+01:00",
};

export const FIXTURE_COVERAGE: CoverageResponse = {
  date: "2026-12-05",
  stage: "voting",
  as_of: "2026-12-05T12:00:00+01:00",
  next_cursor: null,
  rows: [
    {
      lga_code: "1901",
      lga_name: "Kano Municipal",
      expected_units: 350,
      units_with_checklist: 310,
      units_without: 40,
      no_answers: 3,
    },
    {
      lga_code: "1902",
      lga_name: "Fagge",
      expected_units: 280,
      units_with_checklist: 195,
      units_without: 85,
      no_answers: 1,
    },
    { lga_code: "1903", lga_name: "Dala", expected_units: 212, units_with_checklist: 201, units_without: 11, no_answers: 7 },
    { lga_code: "1904", lga_name: "Gwale", expected_units: 318, units_with_checklist: 176, units_without: 142, no_answers: 12 },
  ],
  most_no_answers: [
    { polling_unit_code: "19-04-04-011", polling_unit_name: "Gwale Model School II", no_count: 4, questions: ["secrecy_kept", "party_agents_present", "device_working", "priority_given"] },
    { polling_unit_code: "19-03-02-006", polling_unit_name: "Gwammaja Community Hall", no_count: 3, questions: ["opened_on_time", "materials_all_present", "officials_present"] },
  ],
};

export const FIXTURE_LATE_MATERIALS: LateMaterialsResponse = {
  model_version: "v1.2",
  generated_at: "2026-12-05T10:00:00+01:00",
  data_source: "synthetic",
  metrics: { mae_transit_hours: 1.2, evaluated_on: "2026-12-05" },
  rows: [
    {
      rank: 1,
      lga_code: "1902",
      lga_name: "Fagge",
      ward_code: "190201",
      ward_name: "Fagge A",
      polling_unit_code: "19-02-01-005",
      predicted_transit_hours: 2.5,
      risk: "high",
      factors: ["Road closure", "Heavy rain"],
    },
  ],
};

export const FIXTURE_CLAIM: Claim = {
  id: "cl-1",
  status: "response_draft",
  version: 1,
  text: "Rumour circulating that polling in Kano Municipal has been postponed.",
  image: null,
  seen_on: "whatsapp",
  language: "ha",
  area: { state_code: "KN", state_name: "Kano", lga_code: "1901", lga_name: "Kano Municipal" },
  harm: { level: "high", score: 85, reasons: ["May disenfranchise voters"] },
  check_worthiness: { level: "high", score: 90 },
  image_check: null,
  created_at: "2026-12-05T08:35:00+01:00",
  created_by: "F. Musa",
  response: {
    text: "Voting is actively ongoing across all polling units in Kano Municipal.",
    language: "ha",
    drafted_by: "F. Musa",
    drafted_at: "2026-12-05T08:40:00+01:00",
    approved_by: null,
    approved_at: null,
    rejection_note: null,
  },
};

export const FIXTURE_SNAPSHOT_RECORD: SnapshotRecord = {
  id: "snap-1",
  status: "draft",
  cutoff: "2026-12-05T09:00:00+01:00",
  created_by: "F. Musa",
  approved_by: null,
  published_at: null,
  version: 1,
  preview: {
    organisation: { id: "org-1", name: "ElectraGuard Observation Mission" },
    snapshot_id: "snap-1",
    published_at: null,
    cutoff: "2026-12-05T09:00:00+01:00",
    delay_minutes: 60,
    total: { count: 412, suppressed: false },
    by_state: [
      {
        state_code: "KN",
        state_name: "Kano",
        total: { count: 412, suppressed: false },
        by_category: {
          late_materials: { count: 180, suppressed: false },
          equipment_failure: { count: 95, suppressed: false },
          intimidation_violence: { count: 42, suppressed: false },
          vote_buying: { count: 0, suppressed: false },
          access_barrier: { count: 12, suppressed: false },
          queues_crowding: { count: 48, suppressed: false },
          misinformation: { count: 5, suppressed: false },
          good_practice: { count: 30, suppressed: false },
        },
      },
    ],
    outcomes: [],
    timeline: [],
    audit_chain_head: {
      hash: "b5d12a884f3e9c1b72a0d9e8c6f1a4e2b0c9d7e5f3a1b4c6d8e0f2a4b6c8d0e2",
      event_count: 18422,
      at: "2026-12-05T11:00:00+01:00",
    },
  },
  excluded: {
    not_closed: 20,
    withdrawn: 3,
    after_cutoff: 15,
    other_kinds: 2,
  },
};

export const FIXTURE_FLAG: ModerationFlag = {
  discussion_id: "disc-1",
  post: {
    id: "post-1",
    author_label: "Observer Kano 4",
    is_me: false,
    body: "The queue here at PU 005 is very calm and orderly, voting proceeding smoothly.",
    state: "visible",
    hidden_body: null,
    hidden_reason: null,
    created_at: "2026-12-05T09:15:00+01:00",
  },
  reasons: ["abusive"],
  name_check: {
    possible_names: false,
  },
  flag_count: 1,
};

export const FIXTURE_BATCHES: CodeBatch[] = [
  {
    id: "batch-1",
    label: "Kano Municipal Observers Set A",
    count: 50,
    created_at: "2026-11-20T10:00:00+01:00",
    created_by: "F. Musa",
    printed_at: null,
    active: 48,
    unclaimed: 0,
    revoked: 2,
  },
];

export const FIXTURE_SETTINGS: OrganisationSettings = {
  version: 8,
  intake_paused: false,
  retention_days: 180,
  election_day: "2026-12-05",
  public_delay_minutes: 60,
  party_labels: ["A", "B", "C", "D", "E"],
  coverage_area: {
    state_codes: ["KN"],
    lga_codes: [],
  },
  simulator_enabled: false,
  updated_by: "F. Musa",
  updated_at: "2026-11-23T08:00:00+01:00",
};

export const FIXTURE_ALERT: SecurityAlert = {
  id: "al-1",
  rule: "repeated_failed_pins",
  severity: "medium",
  status: "open",
  version: 1,
  subject: {
    type: "observer_code",
    label: "OBS-7K2P9D",
  },
  details: {
    failures: 12,
    window_minutes: 30,
    distinct_networks: 3,
  },
  first_seen_at: "2026-12-05T07:10:00+01:00",
  last_seen_at: "2026-12-05T07:38:00+01:00",
  detector: "rules",
};

/** Screen 39 (S-02): a morning queue from the synthetic test institutions, newest urgency first. */
function queueRow(
  n: number,
  patch: Partial<QueueItem> & Pick<QueueItem, "receipt_code" | "urgency" | "category" | "area" | "occurred_at">,
): QueueItem {
  return {
    id: `rep-1${String(n).padStart(2, "0")}`,
    kind: "incident",
    channel: "app",
    status: "received",
    received_at: patch.occurred_at ?? "2026-12-05T09:00:00+01:00",
    media_counts: { photo: 0, video: 0, audio: 0 },
    has_open_question: false,
    unread_messages: 0,
    flags: { possible_duplicate: false, result_sheet_flags: 0, possible_names: false },
    last_activity_at: patch.occurred_at ?? "2026-12-05T09:00:00+01:00",
    ...patch,
  };
}

const area = (state_code: string, state_name: string, lga_name: string, ward_name: string | null, polling_unit_name: string | null = null) => ({
  state_code, state_name, lga_code: null, lga_name, ward_code: null, ward_name, polling_unit_code: null, polling_unit_name,
});

export const FIXTURE_QUEUE_ITEMS: QueueItem[] = [
  queueRow(1, {
    receipt_code: "EG-4H7Q-92KD",
    urgency: { level: "urgent", source: "suggested", reasons: ["danger_reported", "seen_firsthand", "video"] },
    category: { value: "intimidation_violence", source: "observer" },
    area: area("KN", "Kano", "Kano Municipal", "Zango", "Zango Primary School I"),
    occurred_at: "2026-12-05T08:41:00+01:00",
    received_at: "2026-12-05T08:43:00+01:00",
    media_counts: { photo: 1, video: 1, audio: 0 },
    flags: { possible_duplicate: true, result_sheet_flags: 0, possible_names: true },
  }),
  queueRow(2, {
    receipt_code: "EG-9M2C-61TA",
    status: "in_review",
    urgency: { level: "urgent", source: "corrected", reasons: ["vote_buying", "photo"] },
    category: { value: "vote_buying", source: "suggested" },
    area: area("KN", "Kano", "Dala", "Gwammaja"),
    occurred_at: "2026-12-05T08:30:00+01:00",
    media_counts: { photo: 3, video: 0, audio: 0 },
  }),
  queueRow(3, {
    receipt_code: "EG-2P8R-07LW",
    channel: "sms",
    urgency: { level: "high", source: "suggested", reasons: ["cluster", "sms_report"] },
    category: { value: "late_materials", source: "observer" },
    area: area("KN", "Kano", "Gwale", null),
    occurred_at: "2026-12-05T08:12:00+01:00",
  }),
  queueRow(4, {
    receipt_code: "EG-6T4N-38QE",
    status: "question",
    kind: "result_sheet",
    urgency: { level: "high", source: "suggested", reasons: ["result_sheet_flag"] },
    category: { value: "not_sure", source: "observer" },
    area: area("KN", "Kano", "Nassarawa", "Tudun Murtala"),
    occurred_at: "2026-12-05T07:58:00+01:00",
    media_counts: { photo: 2, video: 0, audio: 0 },
    has_open_question: true,
    unread_messages: 1,
    flags: { possible_duplicate: false, result_sheet_flags: 2, possible_names: false },
  }),
  queueRow(5, {
    receipt_code: "EG-8K1D-54VB",
    channel: "citizen",
    urgency: { level: "normal", source: "suggested", reasons: ["told_by_someone", "citizen_report"] },
    category: { value: "misinformation", source: "suggested" },
    area: area("KN", "Kano", "Tarauni", "Gyadi-Gyadi"),
    occurred_at: "2026-12-05T07:44:00+01:00",
  }),
  queueRow(6, {
    receipt_code: "EG-3W9F-20HC",
    urgency: { level: "normal", source: "suggested", reasons: ["seen_firsthand", "audio"] },
    category: { value: "access_barrier", source: "observer" },
    area: area("KN", "Kano", "Ungogo", "Ungogo"),
    occurred_at: "2026-12-05T07:31:00+01:00",
    media_counts: { photo: 0, video: 0, audio: 1 },
  }),
  queueRow(7, {
    receipt_code: "EG-5B6J-83XR",
    channel: "ussd",
    simulated: true,
    urgency: { level: "low", source: "suggested", reasons: [] },
    category: { value: "queues_crowding", source: "observer" },
    area: area("KN", "Kano", "Kumbotso", null),
    occurred_at: "2026-12-05T07:20:00+01:00",
  }),
  queueRow(8, {
    receipt_code: "EG-7C3V-46MP",
    status: "closed",
    urgency: { level: "low", source: "suggested", reasons: ["seen_firsthand"] },
    category: { value: "good_practice", source: "observer" },
    area: area("KN", "Kano", "Fagge", "Fagge A"),
    occurred_at: "2026-12-05T07:05:00+01:00",
    media_counts: { photo: 1, video: 0, audio: 0 },
  }),
];

export const FIXTURE_QUEUE_PAGE: QueueResponse = {
  items: FIXTURE_QUEUE_ITEMS,
  next_cursor: null,
  counts: { received: 38, in_review: 12, question: 5, closed: 141, withdrawn: 2 },
};

/** Screen 40 (S-03): the same Kano case part-way through review, with help and a conversation. */
export const FIXTURE_CASE_IN_REVIEW: CaseDetail = {
  ...FIXTURE_CASE_DETAIL,
  receipt_code: "EG-4H7Q-92KD",
  status: "in_review",
  version: 5,
  reporter: { type: "observer", label: "OBS-KN-0417", accredited: true },
  times: { ...FIXTURE_CASE_DETAIL.times, clock_skew_seconds: 420 },
  media: [
    { ...FIXTURE_CASE_DETAIL.media[0], blurred: true },
    {
      id: "med-2",
      kind: "audio",
      status: "ready",
      size_bytes: 310000,
      duration_ms: 41000,
      blurred: false,
      exif_removed: true,
      sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      original_sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      integrity_verified: true,
      transcript: { text: "Men with sticks came in at about twenty to nine and told people in the queue to go home.", language: "en", method: "local_asr" },
      created_at: "2026-12-05T08:17:00+01:00",
    },
  ],
  pending_uploads: [{ id: "up-3", kind: "video", size_bytes: 8_400_000, received_bytes: 5_100_000 }],
  suggestions: {
    ...FIXTURE_CASE_DETAIL.suggestions,
    category: { value: "intimidation_violence", confidence: "high", reasons: ["Weapons mentioned", "Voters sent away"], decision: null, corrected_value: null },
    urgency: { value: "urgent", confidence: "medium", reasons: ["Danger reported now", "Seen firsthand"], decision: "accepted", corrected_value: null },
  },
  duplicates: [
    {
      report_id: "rep-204",
      receipt_code: "EG-2X7M-55RD",
      score: 0.82,
      decision: "pending",
      accessible: true,
      summary: { category: "intimidation_violence", ward_name: "Zango", occurred_at: "2026-12-05T08:38:00+01:00", channel: "sms" },
    } as CaseDetail["duplicates"][number],
  ],
  name_check: { possible_names: true },
  open_question: { id: "q-1", body: "How many people with sticks did you see, and are they still there?", asked_at: "2026-12-05T08:52:00+01:00" } as CaseDetail["open_question"],
  allowed_actions: ["ask", "close", "redact"],
  history: {
    chain_intact: true,
    events: [
      { id: "ev-1", version: 1, action: "received", actor_label: "System", created_at: "2026-12-05T08:16:30+01:00", change: {} },
      { id: "ev-2", version: 3, action: "start", actor_label: "F. Musa (Admin)", created_at: "2026-12-05T08:48:00+01:00", change: {} },
      { id: "ev-3", version: 4, action: "suggestion_accepted", actor_label: "F. Musa (Admin)", created_at: "2026-12-05T08:49:00+01:00", change: { urgency: "urgent" } },
      { id: "ev-4", version: 5, action: "ask", actor_label: "F. Musa (Admin)", created_at: "2026-12-05T08:52:00+01:00", change: {} },
    ],
  },
};

export const FIXTURE_CASE_MESSAGES: Message[] = [
  {
    id: "m-1", kind: "formal_question", author: "reviewer", author_label: "F. Musa (Admin)",
    body: "How many people with sticks did you see, and are they still there?", attachment: null,
    question_state: "open", reply_to: null, created_at: "2026-12-05T08:52:00+01:00", read: true,
  },
  {
    id: "m-2", kind: "message", author: "observer", author_label: "OBS-KN-0417",
    body: "I am outside the gate now. Voting has stopped.", attachment: null,
    question_state: null, reply_to: null, created_at: "2026-12-05T08:55:00+01:00", read: false,
  },
];

/** A result sheet with two failed checks, for the flags box and its fixed disclaimer. */
export const FIXTURE_CASE_RESULT_SHEET: CaseDetail = {
  ...FIXTURE_CASE_DETAIL,
  receipt_code: "EG-6T4N-38QE",
  kind: "result_sheet",
  status: "question",
  language: "en",
  original: { description: "Sheet photographed at the polling unit after counting.", redacted_description: null, redactions: [] },
  translation: { ...FIXTURE_CASE_DETAIL.translation, status: "not_needed", text: null },
  category_observer: "not_sure",
  danger_now: false,
  result_sheet_flags: [
    { type: "accredited_exceeds_registered", explanation_key: "rs.flag.accredited_exceeds_registered", values: { accredited: 812, registered: 790 }, benign_causes_keys: ["rs.benign.copy_error", "rs.benign.unread_digit"] },
    { type: "votes_plus_rejected_differs", explanation_key: "rs.flag.sum_differs", values: { accredited: 812, sum: 821 }, benign_causes_keys: ["rs.benign.copy_error", "rs.benign.unread_digit"] },
  ],
  suggestions: { ...FIXTURE_CASE_DETAIL.suggestions, abstained: true },
  allowed_actions: ["ask", "close"],
};

/** Screen 41 (S-04): five reviewers of the synthetic organisation and the morning's unassigned cases. */
export const FIXTURE_ASSIGNMENTS: AssignmentListResponse = {
  next_cursor: null,
  reviewers: [
    { id: "st-1", display_name: "F. Musa", open_cases: 12, urgent_open: 3, areas: ["1901", "1902"], active_now: true },
    { id: "st-2", display_name: "A. Okafor", open_cases: 9, urgent_open: 1, areas: ["1903"], active_now: true },
    { id: "st-3", display_name: "T. Adeyemi", open_cases: 6, urgent_open: 0, areas: ["1904", "1905", "1906"], active_now: false },
    { id: "st-4", display_name: "H. Bello", open_cases: 3, urgent_open: 2, areas: ["1901"], active_now: true },
    { id: "st-5", display_name: "N. Eze", open_cases: 0, urgent_open: 0, areas: [], active_now: false },
  ],
  items: FIXTURE_QUEUE_ITEMS.slice(0, 6).map((item, i) => ({
    id: item.id,
    receipt_code: item.receipt_code,
    kind: item.kind,
    channel: item.channel,
    status: "received",
    version: 2,
    urgency: item.urgency,
    category: item.category,
    area: item.area ? { ...item.area, polling_unit_code: null, polling_unit_name: null } : null,
    received_at: item.received_at,
    assigned_reviewer: null,
    suggested_reviewer:
      i === 5
        ? null
        : [
            { id: "st-4", display_name: "H. Bello", reason: "fewest_open_cases_in_area" as const },
            { id: "st-5", display_name: "N. Eze", reason: "fewest_open_cases" as const },
            { id: "st-3", display_name: "T. Adeyemi", reason: "same_area" as const },
          ][i % 3],
  })),
};

/** Screen 42 (S-05): two cluster warnings, one already reviewed. */
export const FIXTURE_CLUSTERS: Cluster[] = [
  {
    id: "cl-1",
    category: "intimidation_violence",
    area: { state_code: "KN", state_name: "Kano", lga_code: "1901", lga_name: "Kano Municipal" } as Cluster["area"],
    report_count: 9,
    baseline: null,
    expected: 1.5,
    window_start: "2026-12-05T08:30:00+01:00",
    window_end: "2026-12-05T09:30:00+01:00",
    report_ids: [],
    status: "open",
    reviewed_by: null,
    reviewed_at: null,
  },
  {
    id: "cl-2",
    category: "late_materials",
    area: { state_code: "KN", state_name: "Kano", lga_code: "1904", lga_name: "Gwale" } as Cluster["area"],
    report_count: 14,
    baseline: null,
    expected: 4,
    window_start: "2026-12-05T07:00:00+01:00",
    window_end: "2026-12-05T08:00:00+01:00",
    report_ids: [],
    status: "reviewed",
    reviewed_by: "A. Okafor",
    reviewed_at: "2026-12-05T08:20:00+01:00",
  },
];
