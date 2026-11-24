/**
 * Wire types for the ElectraGuard API (/api/v1/).
 * Source of truth: docs/design/api-contracts.md. Field names are snake_case as on the wire.
 * Types only: no runtime code here.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** UUID v4 string. */
export type Uuid = string;
/** ISO 8601 date-time with offset. The server returns +01:00 (West Africa Time). */
export type DateTimeString = string;
/** YYYY-MM-DD in West Africa Time. */
export type DateString = string;
/** `EG-XXXX-XXXX`, Crockford base32 with a check symbol. */
export type ReceiptCode = string;
/** `OBS-XXXXXX`, Crockford base32 with a check symbol. */
export type ObserverCode = string;
/** base64url of 32 random bytes (43 characters), made on the phone. */
export type ReceiptSecret = string;
/** Opaque cursor for paging. */
export type Cursor = string;
/** Lower-case hex SHA-256. */
export type Sha256Hex = string;
/** Opaque area codes from REF-01. */
export type StateCode = string;
export type LgaCode = string;
export type WardCode = string;
export type PollingUnitCode = string;
/** Staff ids are opaque strings. */
export type StaffId = string;

export type Language = "en" | "pcm" | "ha" | "yo" | "ig";

export interface Page<T> {
  items: T[];
  next_cursor: Cursor | null;
}

export interface PageQuery {
  cursor?: Cursor;
  /** 1..100, default 50 */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Errors (section 1.4)
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "bad_request"
  | "idempotency_key_required"
  | "not_authenticated"
  | "invalid_credentials"
  | "totp_invalid"
  | "receipt_secret_invalid"
  | "csrf_failed"
  | "forbidden"
  | "totp_required"
  | "code_revoked"
  | "same_person_approval"
  | "not_found"
  | "stale_version"
  | "idempotency_key_reused"
  | "request_in_progress"
  | "invalid_transition"
  | "withdraw_unavailable"
  | "question_closed"
  | "report_closed"
  | "report_withdrawn"
  | "closure_evidence_changed"
  | "already_assigned"
  | "offset_mismatch"
  | "upload_expired"
  | "upload_completed"
  | "media_limit_reached"
  | "last_admin"
  | "confirmation_required"
  | "discussion_closed"
  | "not_a_member"
  | "payload_too_large"
  | "unsupported_media_type"
  | "validation_failed"
  | "hash_mismatch"
  | "media_unreadable"
  | "receipt_code_invalid"
  | "code_locked"
  | "account_locked"
  | "rate_limited"
  | "intake_paused"
  | "service_unavailable";

export type FieldErrorCode =
  | "required"
  | "invalid"
  | "max_length"
  | "min_length"
  | "min_value"
  | "max_value"
  | "invalid_choice"
  | "invalid_datetime"
  | "in_future"
  | "too_old"
  | "too_recent"
  | "unknown_area"
  | "not_allowed_for_kind"
  | "duplicate"
  | "pin_too_simple"
  | "pin_reused"
  | "contains_polling_unit_code";

export interface FieldError {
  code: FieldErrorCode;
  message: string;
  limit?: number;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Dotted paths, e.g. "result_sheet.votes.C", "answers.2.answer". */
    fields?: Record<string, FieldError>;
  };
}

// ---------------------------------------------------------------------------
// Shared domain enums
// ---------------------------------------------------------------------------

export type Role = "observer" | "reviewer" | "moderator" | "coordinator" | "org_admin";
export type StaffRole = Exclude<Role, "observer">;

export type ReportKind = "incident" | "checklist" | "result_sheet";
export type Channel = "app" | "citizen" | "sms" | "ussd";
export type ReportStatus = "received" | "in_review" | "question" | "closed" | "withdrawn";
/** Client-only states held in the outbox (section 2.1). */
export type LocalReportState = "draft" | "on_device" | "not_confirmed" | "needs_attention";
export type AnyReportState = ReportStatus | LocalReportState;
export type Outcome = "corroborated" | "insufficient_evidence" | "out_of_scope";

export type Category =
  | "late_materials"
  | "equipment_failure"
  | "queues_crowding"
  | "intimidation_violence"
  | "access_barrier"
  | "lack_of_information"
  | "misinformation"
  | "vote_buying"
  | "good_practice"
  | "not_sure";
/** Triage never suggests "not_sure". */
export type SuggestedCategory = Exclude<Category, "not_sure">;

export type AccessBarrierDetail =
  | "steps_no_ramp"
  | "distance"
  | "no_assistance"
  | "no_large_print_braille"
  | "no_sign_language"
  | "other";

export type Urgency = "urgent" | "high" | "normal" | "low";
export type Confidence = "high" | "medium" | "low";

export type UrgencyReason =
  | "danger_reported"
  | "intimidation"
  | "vote_buying"
  | "seen_firsthand"
  | "told_by_someone"
  | "video"
  | "photo"
  | "audio"
  | "cluster"
  | "result_sheet_flag"
  | "citizen_report"
  | "sms_report";

export type MediaKind = "photo" | "video" | "audio";
export type MediaStatus = "processing" | "ready" | "failed";
export type MediaPurpose = "evidence" | "message";

// ---------------------------------------------------------------------------
// Area
// ---------------------------------------------------------------------------

export interface Area {
  state_code: StateCode;
  state_name: string;
  lga_code: LgaCode | null;
  lga_name: string | null;
  ward_code: WardCode | null;
  ward_name: string | null;
  polling_unit_code: PollingUnitCode | null;
  polling_unit_name: string | null;
}

/** Ward-level area (discussions, rumour matches). */
export interface WardArea {
  state_code: StateCode;
  state_name: string;
  lga_code: LgaCode;
  lga_name: string;
  ward_code: WardCode | null;
  ward_name: string | null;
}

export interface LgaArea {
  state_code: StateCode;
  state_name: string;
  lga_code: LgaCode | null;
  lga_name: string | null;
}

export interface PlaceInput {
  polling_unit_code: PollingUnitCode | null;
  /** Required when polling_unit_code is null. */
  ward_code?: WardCode;
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

export interface CsrfResponse {
  csrf_token: string;
}

export interface OrganisationSummary {
  id: Uuid;
  name: string;
  intake_paused: boolean;
}

export interface MeUser {
  id: string;
  kind: "observer" | "staff";
  observer_code: ObserverCode | null;
  email: string | null;
  display_name: string | null;
  roles: Role[];
  totp_enrolled: boolean;
  organisation: OrganisationSummary;
}

export type MeResponse =
  | {
      authenticated: true;
      user: MeUser;
      session_expires_at: DateTimeString;
      citizen_intake_open: boolean;
      server_time: DateTimeString;
    }
  | {
      authenticated: false;
      user: null;
      session_expires_at: null;
      citizen_intake_open: boolean;
      server_time: DateTimeString;
      pending?: "totp_required" | "totp_enrolment_required";
    };

export type SignedInResponse = { status: "signed_in"; me: Extract<MeResponse, { authenticated: true }> };

export interface ObserverSignInRequest {
  code: ObserverCode;
  /** 6 digits (personal PIN) or 8 digits (setup PIN). */
  pin: string;
}

export type ObserverSignInResponse =
  | SignedInResponse
  | { status: "pin_setup_required"; setup_token: string; setup_token_expires_at: DateTimeString };

export interface ObserverPinSetRequest {
  setup_token: string;
  /** Exactly 6 digits. */
  new_pin: string;
}

/** AUTH-08 (gap decision G12). Other sessions of the code stay signed in (Q9). */
export interface ObserverPinChangeRequest {
  current_pin: string;
  /** Exactly 6 digits. */
  new_pin: string;
}

export interface StaffSignInRequest {
  email: string;
  password: string;
}

export type StaffSignInResponse = {
  status: "totp_required" | "totp_enrolment_required";
  expires_at: DateTimeString;
};

export interface TotpCodeRequest {
  code: string;
}

export interface TotpEnrolmentStartResponse {
  otpauth_uri: string;
  secret: string;
  expires_at: DateTimeString;
}

export interface AcceptInviteRequest {
  token: string;
  password: string;
}

export interface SignOutRequest {
  everywhere: boolean;
}

// ---------------------------------------------------------------------------
// REF
// ---------------------------------------------------------------------------

export interface AreaIndexResponse {
  dataset_version: string;
  source: "synthetic" | "official";
  states: Array<{
    state_code: StateCode;
    name: string;
    lga_count: number;
    unit_count: number;
    version: string;
    bytes_gzip: number;
  }>;
}

/** REF-02 (gap decisions G4/G5). */
export interface ObserverSettingsResponse {
  coverage_area: { state_codes: StateCode[]; lga_codes: LgaCode[] };
  party_labels: string[];
}

/** [polling_unit_code, name] */
export type PollingUnitTuple = [PollingUnitCode, string];

export interface StateAreasResponse {
  state_code: StateCode;
  name: string;
  version: string;
  lgas: Array<{
    lga_code: LgaCode;
    name: string;
    wards: Array<{ ward_code: WardCode; name: string; units: PollingUnitTuple[] }>;
  }>;
}

// ---------------------------------------------------------------------------
// REP: report create
// ---------------------------------------------------------------------------

export type ChecklistStage =
  | "arrival"
  | "opening"
  | "accreditation"
  | "voting"
  | "closing_counting"
  | "results_posted";

export type YesNoNotSeen = "yes" | "no" | "not_seen";
export type QueueSize = "none" | "under_50" | "50_200" | "over_200";
export type MissingMaterial =
  | "ballot_papers"
  | "result_sheets"
  | "ballot_boxes"
  | "voting_cubicles"
  | "indelible_ink"
  | "voter_register"
  | "accreditation_device"
  | "stamps_seals"
  | "other";

export type YesNoQuestion =
  | "opened_on_time"
  | "materials_all_present"
  | "officials_present"
  | "party_agents_present"
  | "device_working"
  | "priority_given"
  | "secrecy_kept"
  | "assistance_available"
  | "disruption"
  | "inducement_seen"
  | "closed_on_time"
  | "counting_public"
  | "agents_signed"
  | "sheet_posted";

export type ChecklistQuestionId = YesNoQuestion | "arrival_time" | "materials_missing" | "queue_size";

export type ChecklistAnswer =
  | { question: YesNoQuestion; answer: YesNoNotSeen }
  | { question: "arrival_time"; answer: DateTimeString }
  | { question: "materials_missing"; answer: MissingMaterial[] }
  | { question: "queue_size"; answer: QueueSize };

export type PartyLabel = string; // default "A".."E", set in ADM-04

export type ResultSheetField = "registered" | "accredited" | "rejected" | `votes.${string}`;

export interface ResultSheetValues {
  registered: number;
  accredited: number;
  rejected: number;
  votes: Record<PartyLabel, number>;
}

export interface ResultSheetInput extends ResultSheetValues {
  confirmed_fields: ResultSheetField[];
  ocr_id: Uuid | null;
  entry_method: "ocr_confirmed" | "manual" | "offline_ocr";
}

interface ReportCreateCommon {
  language: Language;
  occurred_at: DateTimeString;
  place: PlaceInput;
  device_saved_at?: DateTimeString;
  related_report_id?: Uuid | null;
}

export interface IncidentFields {
  category_observer: Category;
  access_barrier_details?: AccessBarrierDetail[];
  danger_now: boolean;
  firsthand: boolean;
  /** 1..2000 characters */
  description: string;
  input_method?: "typed" | "dictated" | "mixed";
  from_checklist_question?: ChecklistQuestionId | null;
}

export type IncidentCreateRequest = ReportCreateCommon & IncidentFields & { kind: "incident" };

export type ChecklistCreateRequest = ReportCreateCommon & {
  kind: "checklist";
  stage: ChecklistStage;
  answers: ChecklistAnswer[];
  note?: string | null;
};

export type ResultSheetCreateRequest = ReportCreateCommon & {
  kind: "result_sheet";
  result_sheet: ResultSheetInput;
};

export type ReportCreateRequest = IncidentCreateRequest | ChecklistCreateRequest | ResultSheetCreateRequest;

export interface ReportCreateResponse {
  id: Uuid;
  receipt_code: ReceiptCode;
  kind: ReportKind;
  status: ReportStatus;
  received_at: DateTimeString;
  version: number;
  media_upload: { max_items: number; max_total_bytes: number };
}

export type CitizenReportCreateRequest = IncidentCreateRequest & { receipt_secret: ReceiptSecret };

// ---------------------------------------------------------------------------
// REP: list, detail, withdraw, public status
// ---------------------------------------------------------------------------

export interface ReportListQuery extends PageQuery {
  kind?: ReportKind;
  status?: ReportStatus;
  has_messages?: boolean;
  /** Gap decision G14: open question or unread message. */
  needs_attention?: boolean;
}

export interface ReportListItem {
  id: Uuid;
  receipt_code: ReceiptCode;
  kind: ReportKind;
  category_observer: Category | null;
  checklist_stage: ChecklistStage | null;
  area: Area | null;
  occurred_at: DateTimeString | null;
  received_at: DateTimeString;
  status: ReportStatus;
  outcome: Outcome | null;
  has_open_question: boolean;
  unread_messages: number;
  last_activity_at: DateTimeString;
  media_count: number;
  /** Gap decision G7: false when only the date is known. */
  time_known?: boolean | null;
  /** Gap decision G8: the latest reviewer message on the observer's own report. */
  last_message_preview?: { author: MessageAuthor; snippet: string; created_at: DateTimeString } | null;
}

export interface ReportListResponse extends Page<ReportListItem> {
  /** `total` and `needs_attention`: gap decisions G3 and G14. */
  counts: { open_questions: number; unread_messages: number; total?: number; needs_attention?: number };
}

export interface MediaSummary {
  id: Uuid;
  kind: MediaKind;
  status: MediaStatus;
  size_bytes: number;
  duration_ms: number | null;
  blurred: boolean;
  exif_removed: boolean;
  created_at: DateTimeString;
}

export interface OpenQuestion {
  id: Uuid;
  body: string;
  asked_at: DateTimeString;
}

export interface ChecklistView {
  stage: ChecklistStage;
  answers: ChecklistAnswer[];
  note: string | null;
}

export interface ObserverResultSheetView extends ResultSheetValues {
  confirmed_fields: ResultSheetField[];
  entry_method: ResultSheetInput["entry_method"];
}

export interface ReportDetail {
  id: Uuid;
  receipt_code: ReceiptCode;
  kind: ReportKind;
  channel: Channel;
  status: ReportStatus;
  outcome: Outcome | null;
  language: Language | null;
  category_observer: Category | null;
  access_barrier_details: AccessBarrierDetail[];
  danger_now: boolean | null;
  firsthand: boolean | null;
  description: string | null;
  checklist: ChecklistView | null;
  /** Never includes check flags. */
  result_sheet: ObserverResultSheetView | null;
  area: Area | null;
  occurred_at: DateTimeString | null;
  received_at: DateTimeString;
  closed_at: DateTimeString | null;
  withdrawn_at: DateTimeString | null;
  media: MediaSummary[];
  open_question: OpenQuestion | null;
  can_withdraw: boolean;
  can_add_media: boolean;
  can_message: boolean;
  /** Gap decision G10. */
  reviewer_assigned?: boolean;
  time_known?: boolean | null;
}

export interface WithdrawRequest {
  confirm: true;
}

export interface WithdrawnStub {
  id: Uuid;
  receipt_code: ReceiptCode;
  kind: ReportKind;
  channel: Channel;
  status: "withdrawn";
  received_at: DateTimeString;
  withdrawn_at: DateTimeString;
  version: number;
}

export interface ReceiptStatusResponse {
  receipt_code: ReceiptCode;
  status: ReportStatus;
  outcome: Outcome | null;
  has_open_question: boolean;
  received_on: DateString;
  updated_on: DateString;
}

// ---------------------------------------------------------------------------
// MSG
// ---------------------------------------------------------------------------

export type MessageKind = "formal_question" | "reply" | "message" | "system";
export type MessageAuthor = "observer" | "citizen" | "sms_reporter" | "reviewer" | "system";
export type QuestionState = "open" | "answered" | "closed_unanswered";

export interface MessageAttachment {
  id: Uuid;
  kind: MediaKind;
  status: MediaStatus;
  size_bytes: number;
  duration_ms: number | null;
}

export interface Message {
  id: Uuid;
  kind: MessageKind;
  author: MessageAuthor;
  author_label: string;
  body: string;
  attachment: MessageAttachment | null;
  question_state: QuestionState | null;
  reply_to: Uuid | null;
  created_at: DateTimeString;
  read: boolean;
}

export type MessageListResponse = Page<Message>;

export interface MarkReadRequest {
  up_to_message_id: Uuid;
}

export type PostMessageRequest =
  | { kind: "message"; body: string; attachment_media_id?: Uuid | null }
  | { kind: "reply"; body: string; reply_to: Uuid; attachment_media_id?: Uuid | null };

export interface PostMessageResponse {
  message: Message;
  report_status: ReportStatus;
  version: number;
}

export interface CitizenConversationResponse {
  receipt_code: ReceiptCode;
  status: ReportStatus;
  messages: Array<Omit<Message, "attachment"> & { attachment: null }>;
}

export interface CitizenReplyRequest {
  question_id: Uuid;
  body: string;
}

export interface CitizenReplyResponse {
  message: Message;
  status: ReportStatus;
  version: number;
}

// ---------------------------------------------------------------------------
// MED
// ---------------------------------------------------------------------------

export interface UploadStartRequest {
  kind: MediaKind;
  purpose: MediaPurpose;
  content_type: string;
  size_bytes: number;
  sha256: Sha256Hex;
  duration_ms: number | null;
  blur_faces?: boolean;
  client_media_id: string;
}

export type UploadStatus = "open" | "completed" | "expired";

export interface UploadSession {
  id: Uuid;
  report_id: Uuid;
  client_media_id: string;
  kind: MediaKind;
  size_bytes: number;
  received_bytes: number;
  chunk_bytes: number;
  status: UploadStatus;
  expires_at: DateTimeString;
}

export type UploadStartResponse =
  | { upload: UploadSession; media: null }
  | { upload: null; media: MediaSummary };

/** MED-02 send: the body is raw bytes; these are the headers. */
export interface UploadChunkHeaders {
  "Content-Type": "application/offset+octet-stream";
  "Upload-Offset": string;
  "Upload-Chunk-Sha256"?: Sha256Hex;
}

export interface UploadChunkResponse {
  id: Uuid;
  received_bytes: number;
  size_bytes: number;
  status: UploadStatus;
}

export interface UploadCompleteResponse {
  media: MediaSummary;
  client_media_id: string;
}

export type MediaVariant = "display" | "thumb" | "poster" | "original";

export interface MediaContentQuery {
  variant?: MediaVariant;
  download?: 0 | 1;
}

// ---------------------------------------------------------------------------
// DIS
// ---------------------------------------------------------------------------

export type DiscussionStatus = "open" | "closed";
export type Membership = "invited" | "member" | "declined" | "left" | "removed" | "moderator";

export interface DiscussionSummary {
  id: Uuid;
  title: string;
  area: WardArea;
  status: DiscussionStatus;
  membership: Membership;
  member_count: number;
  unread_posts: number;
  last_post_at: DateTimeString | null;
  closes_at: DateTimeString;
}

export interface Discussion {
  id: Uuid;
  title: string;
  topic: string;
  area: WardArea;
  status: DiscussionStatus;
  membership: Membership;
  closes_at: DateTimeString;
}

export type PostState = "visible" | "hidden";
export type FlagReason = "names_a_person" | "too_specific_location" | "abusive" | "other";
export type HideReason = FlagReason | "off_topic";

export interface Post {
  id: Uuid;
  author_label: string;
  is_me: boolean;
  body: string | null;
  state: PostState;
  created_at: DateTimeString;
  /** Moderators only. */
  hidden_body?: string | null;
  hidden_reason?: HideReason | null;
  flag_count?: number;
}

export interface DiscussionListQuery extends PageQuery {
  status?: DiscussionStatus;
}

export interface ThreadQuery {
  after?: Uuid;
  limit?: number;
}

export interface ThreadResponse {
  discussion: Discussion;
  posts: Post[];
  next_after: Uuid | null;
}

export interface CreatePostRequest {
  body: string;
}

export interface FlagPostRequest {
  reason: FlagReason;
}

export interface MembershipRequest {
  action: "accept" | "decline" | "leave";
}

export interface MembershipResponse {
  discussion_id: Uuid;
  membership: Membership;
}

export type CreateDiscussionRequest = {
  title: string;
  topic: string;
  closes_at?: DateTimeString;
} & ({ ward_code: WardCode; lga_code?: never } | { lga_code: LgaCode; ward_code?: never });

export interface InviteRequest {
  observer_codes: ObserverCode[];
}

export interface InviteResponse {
  invited: ObserverCode[];
  already_members: ObserverCode[];
  not_found: ObserverCode[];
}

export interface HidePostRequest {
  reason: HideReason;
  note?: string;
}

export interface RemoveMemberRequest {
  reason: string;
}

export interface ModerationFlag {
  post: Post;
  discussion_id: Uuid;
  reasons: FlagReason[];
  name_check: { possible_names: boolean };
  flag_count: number;
}

// ---------------------------------------------------------------------------
// ASK
// ---------------------------------------------------------------------------

export interface AskRequest {
  question: string;
  language: Language;
  audience: "observer" | "public";
}

export interface AskPassage {
  text: string;
  source: {
    document_id: string;
    title: string;
    section: string;
    version: string;
    language: Language;
    url: string;
  };
  score: number;
}

export interface AskResponse {
  status: "answered" | "abstained";
  language: Language;
  passages: AskPassage[];
  fallback_language_used: boolean;
}

// ---------------------------------------------------------------------------
// GUIDE
// ---------------------------------------------------------------------------

export interface GuideSummary {
  slug: string;
  document_id: string;
  title: string;
  version: string;
  language: Language;
}

export interface GuideListResponse {
  language: Language;
  documents: Array<GuideSummary & { fallback_language_used: boolean }>;
}

export interface GuideSection {
  /** Anchor id; ASK-01 source urls point at /guide/{slug}#{id}. */
  id: string;
  heading: string;
  /** Plain text. Paragraphs are separated by a blank line; lines starting "- " are list items. */
  body: string;
}

export interface GuideDocument extends GuideSummary {
  fallback_language_used: boolean;
  approved_on: DateString;
  sections: GuideSection[];
}

// ---------------------------------------------------------------------------
// RS
// ---------------------------------------------------------------------------

export interface OcrField {
  value: number | null;
  confidence: number;
}

export interface OcrResponse {
  ocr_id: Uuid;
  expires_at: DateTimeString;
  fields: {
    registered: OcrField;
    accredited: OcrField;
    rejected: OcrField;
    votes: Record<PartyLabel, OcrField>;
  };
  model_version: string;
  notice_key: "result_sheet.not_a_result";
}

/** RS-01 is multipart: `file` (Blob) and `sha256`. */
export interface OcrRequestForm {
  file: Blob;
  sha256: Sha256Hex;
}

// ---------------------------------------------------------------------------
// Q and CASE
// ---------------------------------------------------------------------------

export interface UrgencyView {
  level: Urgency;
  source: "suggested" | "corrected";
  reasons: UrgencyReason[];
}

export interface CategoryView {
  value: Category;
  source: "observer" | "suggested" | "corrected";
}

export interface QueueQuery extends PageQuery {
  status?: ReportStatus[];
  category?: Category[];
  urgency?: Urgency[];
  state_code?: StateCode;
  lga_code?: LgaCode;
  channel?: Channel[];
  kind?: ReportKind[];
  has_evidence?: boolean;
}

export interface QueueItem {
  id: Uuid;
  receipt_code: ReceiptCode;
  kind: ReportKind;
  channel: Channel;
  status: ReportStatus;
  urgency: UrgencyView;
  category: CategoryView;
  area: Area | null;
  occurred_at: DateTimeString | null;
  received_at: DateTimeString;
  media_counts: Record<MediaKind, number>;
  has_open_question: boolean;
  unread_messages: number;
  flags: { possible_duplicate: boolean; result_sheet_flags: number; possible_names: boolean };
  last_activity_at: DateTimeString;
  simulated?: boolean;
}

export interface QueueResponse extends Page<QueueItem> {
  counts: Partial<Record<ReportStatus, number>>;
}

export interface Redaction {
  start: number;
  end: number;
}

export interface CaseMedia extends MediaSummary {
  sha256: Sha256Hex | null;
  original_sha256: Sha256Hex;
  integrity_verified: boolean;
  transcript: { text: string; language: Language | null; method: string } | null;
}

export interface PendingUpload {
  id: Uuid;
  kind: MediaKind;
  size_bytes: number;
  received_bytes?: number;
}

export type SuggestionDecision = "accepted" | "corrected" | null;

export interface Suggestion<T extends string> {
  value: T | null;
  confidence: Confidence | null;
  reasons: string[];
  decision: SuggestionDecision;
  corrected_value: T | null;
}

export type ResultSheetFlagType =
  | "accredited_exceeds_registered"
  | "votes_plus_rejected_differs"
  | "round_numbers"
  | "identical_to_other_unit"
  | "possible_digit_swap";

export interface ResultSheetFlag {
  type: ResultSheetFlagType;
  explanation_key: string;
  values: Record<string, number>;
  benign_causes_keys: string[];
}

export interface CaseResultSheet {
  values: ResultSheetValues;
  confirmed_fields: ResultSheetField[];
  entry_method: ResultSheetInput["entry_method"];
  ocr: { fields: OcrResponse["fields"]; disagreements: ResultSheetField[] } | null;
}

export interface DuplicateCandidate {
  report_id: Uuid;
  receipt_code: ReceiptCode | null;
  score: number;
  decision: "pending" | "linked" | "kept_separate";
  accessible: boolean;
  summary: {
    category: Category | null;
    ward_name: string | null;
    occurred_at: DateTimeString | null;
    channel: Channel;
    /** null when not accessible to this reviewer. */
    description: string | null;
  };
}

export type CaseAction = "start" | "ask" | "close" | "redact";

export interface AuditEventView {
  id: Uuid;
  version: number;
  action: string;
  actor_label: string;
  created_at: DateTimeString;
  change: Record<string, unknown>;
}

export interface CaseDetail {
  id: Uuid;
  receipt_code: ReceiptCode;
  kind: ReportKind;
  channel: Channel;
  status: ReportStatus;
  outcome: Outcome | null;
  version: number;
  simulated?: boolean;
  reporter: { type: "observer" | "citizen" | "sms" | "ussd"; label: string; accredited: boolean };
  language: Language | null;
  original: { description: string | null; redacted_description: string | null; redactions: Redaction[] };
  translation: {
    status: "pending" | "ready" | "failed" | "not_needed";
    text: string | null;
    from: Language | null;
    to: "en";
    method: string | null;
    label_key: "case.machine_translation";
  };
  category_observer: Category | null;
  access_barrier_details: AccessBarrierDetail[];
  danger_now: boolean | null;
  firsthand: boolean | null;
  area: Area | null;
  times: {
    occurred_at: DateTimeString | null;
    device_saved_at: DateTimeString | null;
    received_at: DateTimeString;
    clock_skew_seconds: number | null;
  };
  checklist: ChecklistView | null;
  result_sheet: CaseResultSheet | null;
  media: CaseMedia[];
  pending_uploads: PendingUpload[];
  suggestions: {
    status: "pending" | "ready" | "failed";
    model_versions: Record<string, string>;
    category: Suggestion<SuggestedCategory>;
    urgency: Suggestion<Urgency>;
    abstained: boolean;
  };
  duplicates: DuplicateCandidate[];
  result_sheet_flags: ResultSheetFlag[];
  related_claims: Array<{ claim_id: Uuid; excerpt: string; status: ClaimStatus }>;
  name_check: { possible_names: boolean };
  open_question: OpenQuestion | null;
  allowed_actions: CaseAction[];
  history: { chain_intact: boolean; events: AuditEventView[] };
  legacy_location?: string | null;
}

export type CaseActionRequest =
  | { action: "start"; version: number }
  | { action: "ask"; version: number; question: string }
  | { action: "close"; version: number; outcome: Outcome; rationale: string; expected_media_ids: Uuid[] };

export interface CaseActionResponse {
  id: Uuid;
  status: ReportStatus;
  outcome: Outcome | null;
  version: number;
  question_id?: Uuid;
  closure?: { media_ids: Uuid[]; pending_uploads: PendingUpload[] };
}

export type SuggestionType = "category" | "urgency";

export type SuggestionDecisionRequest =
  | { decision: "accept"; version: number }
  | { decision: "correct"; value: SuggestedCategory | Urgency; version: number };

export interface SuggestionDecisionResponse {
  version: number;
  suggestion: { value: string | null; decision: SuggestionDecision; corrected_value: string | null };
}

export interface DuplicateDecisionRequest {
  decision: "link" | "keep_separate";
  version: number;
}

export interface DuplicateDecisionResponse {
  version: number;
  duplicate: { report_id: Uuid; decision: "linked" | "kept_separate" };
}

export interface RedactionRequest {
  spans: Redaction[];
  version: number;
}

export interface RedactionResponse {
  version: number;
  redacted_description: string | null;
  redactions: Redaction[];
}

// ---------------------------------------------------------------------------
// ASG
// ---------------------------------------------------------------------------

export interface StaffRef {
  id: StaffId;
  display_name: string;
}

export interface AssignmentQuery extends PageQuery {
  /** "any", "none" or a reviewer id */
  assigned?: string;
  status?: ReportStatus[];
  urgency?: Urgency[];
  state_code?: StateCode;
  lga_code?: LgaCode;
}

export interface AssignmentRow {
  id: Uuid;
  receipt_code: ReceiptCode;
  kind: ReportKind;
  channel: Channel;
  status: ReportStatus;
  version: number;
  urgency: UrgencyView;
  category: CategoryView;
  /** Polling-unit fields are always null here. */
  area: Area | null;
  received_at: DateTimeString;
  assigned_reviewer: StaffRef | null;
  suggested_reviewer: (StaffRef & { reason: "fewest_open_cases_in_area" | "fewest_open_cases" | "same_area" }) | null;
}

export interface ReviewerWorkload extends StaffRef {
  open_cases: number;
  urgent_open: number;
  areas: LgaCode[];
  active_now: boolean;
}

export interface AssignmentListResponse extends Page<AssignmentRow> {
  reviewers: ReviewerWorkload[];
}

export interface AssignRequest {
  items: Array<{ report_id: Uuid; reviewer_id: StaffId | "suggested"; version: number }>;
}

export type AssignItemResult =
  | { report_id: Uuid; ok: true; version: number; assigned_reviewer: StaffRef }
  | { report_id: Uuid; ok: false; error: { code: ErrorCode; message: string; fields?: Record<string, FieldError> } };

export interface AssignResponse {
  results: AssignItemResult[];
}

// ---------------------------------------------------------------------------
// OPS
// ---------------------------------------------------------------------------

export interface OverviewQuery {
  from?: DateString;
  to?: DateString;
  kind?: ReportKind;
}

export interface OverviewResponse {
  range: { from: DateString; to: DateString };
  totals: {
    reports: number;
    incidents_after_links: number;
    urgent_open: number;
    open_questions: number;
    result_sheet_flags_open: number;
    withdrawn: number;
  };
  by_status: Array<{ status: Exclude<ReportStatus, "withdrawn">; count: number }>;
  by_outcome: Array<{ outcome: Outcome; count: number }>;
  by_category: Array<{ category: Category; count: number }>;
  by_channel: Array<{ channel: Channel; count: number }>;
  by_lga: Array<{ state_code: StateCode; lga_code: LgaCode; lga_name: string; count: number; urgent: number }>;
  generated_at: DateTimeString;
}

export interface Cluster {
  id: Uuid;
  category: Category;
  area: LgaArea;
  report_count: number;
  baseline: number;
  window_start: DateTimeString;
  window_end: DateTimeString;
  report_ids: Uuid[];
  status: "open" | "reviewed";
  reviewed_by: string | null;
  reviewed_at: DateTimeString | null;
}

export interface ClusterListQuery extends PageQuery {
  status?: "open" | "reviewed";
}

export interface ClusterReviewRequest {
  note?: string;
}

export interface ClusterSettings {
  window_minutes: number;
  min_reports: number;
  categories: Category[];
  version: number;
}

export interface CoverageQuery extends PageQuery {
  date?: DateString;
  stage?: ChecklistStage;
  lga_code?: LgaCode;
}

export interface CoverageResponse {
  date: DateString;
  stage: ChecklistStage;
  as_of: DateTimeString;
  rows: Array<
    | { lga_code: LgaCode; lga_name: string; expected_units: number; units_with_checklist: number; units_without: number; no_answers: number }
    | { polling_unit_code: PollingUnitCode; polling_unit_name: string; has_checklist: boolean; no_answers: number }
  >;
  most_no_answers: Array<{
    polling_unit_code: PollingUnitCode;
    polling_unit_name: string;
    no_count: number;
    questions: ChecklistQuestionId[];
  }>;
  next_cursor: Cursor | null;
}

export interface LateMaterialsQuery {
  state_code?: StateCode;
  limit?: number;
}

export interface LateMaterialsResponse {
  model_version: string | null;
  generated_at: DateTimeString | null;
  data_source: "synthetic" | "official";
  metrics: { mae_transit_hours: number; evaluated_on: string } | null;
  rows: Array<{
    rank: number;
    lga_code: LgaCode;
    lga_name: string;
    ward_code: WardCode;
    ward_name: string;
    polling_unit_code: PollingUnitCode;
    predicted_transit_hours: number;
    risk: "high" | "medium" | "low";
    factors: string[];
  }>;
}

// ---------------------------------------------------------------------------
// RUM
// ---------------------------------------------------------------------------

export type ClaimStatus = "new" | "matched" | "response_draft" | "response_approved" | "dismissed";
export type SeenOn = "whatsapp" | "facebook" | "x" | "tiktok" | "sms" | "radio" | "in_person" | "other";

export interface ClaimCreateFields {
  text?: string;
  seen_on: SeenOn;
  language: Language;
  seen_at?: DateTimeString;
  area?: { state_code: StateCode; lga_code?: LgaCode };
}

/** JSON body when there is no image; multipart (fields + `image`) otherwise. */
export type ClaimCreateRequest = ClaimCreateFields | (ClaimCreateFields & { image: Blob });

export interface ClaimResponseView {
  text: string;
  language: Language;
  drafted_by: string;
  drafted_at: DateTimeString;
  approved_by: string | null;
  approved_at: DateTimeString | null;
  rejection_note: string | null;
}

export interface Claim {
  id: Uuid;
  status: ClaimStatus;
  version: number;
  text: string | null;
  image: { media_id: Uuid; width: number; height: number } | null;
  seen_on: SeenOn;
  language: Language;
  area: LgaArea | null;
  harm: { level: "high" | "medium" | "low"; score: number; reasons: string[] };
  check_worthiness: { level: "high" | "medium" | "low"; score: number };
  image_check: {
    metadata: { had_metadata: boolean; camera_make?: string; created_at?: DateTimeString; software?: string };
    prompts: string[];
    error_level_hint: string | null;
  } | null;
  response: ClaimResponseView | null;
  created_by: string;
  created_at: DateTimeString;
}

export interface ClaimListQuery extends PageQuery {
  status?: ClaimStatus;
  harm?: "high" | "medium" | "low";
  language?: Language;
}

export interface ClaimMatchesResponse {
  observations: Array<{
    report_id: Uuid;
    category: Category;
    area: WardArea;
    occurred_at: DateTimeString;
    status: "closed";
    outcome: Outcome;
    similarity: number;
    excerpt: string;
  }>;
  past_claims: Array<{
    claim_id: Uuid;
    text: string;
    similarity: number;
    response: { text: string; approved_at: DateTimeString } | null;
  }>;
  model_version: string;
}

export interface SaveClaimResponseRequest {
  text: string;
  language: Language;
  version: number;
}

export interface VersionOnlyRequest {
  version: number;
}

export interface NoteVersionRequest {
  note: string;
  version: number;
}

// ---------------------------------------------------------------------------
// PUB
// ---------------------------------------------------------------------------

export type Cell = { count: number; suppressed: false } | { count: null; suppressed: true };

export interface PublicSnapshot {
  organisation: { id: Uuid; name: string };
  snapshot_id: Uuid;
  published_at: DateTimeString | null;
  cutoff: DateTimeString;
  delay_minutes: number;
  total: Cell;
  by_state: Array<{
    state_code: StateCode;
    state_name: string;
    total: Cell;
    by_category: Partial<Record<SuggestedCategory, Cell>>;
  }>;
  outcomes: Array<
    | { outcome: Outcome; count: number; share_percent: number; suppressed: false }
    | { outcome: Outcome; count: null; share_percent: null; suppressed: true }
  >;
  timeline: Array<{ hour_start: DateTimeString; count: Cell }>;
  audit_chain_head: AuditChainHead;
}

export interface PublicResultsResponse {
  generated_at: DateTimeString;
  notice_key: "results.notice";
  snapshots: PublicSnapshot[];
  combined: Omit<PublicSnapshot, "organisation" | "snapshot_id" | "audit_chain_head"> | null;
}

export type SnapshotStatus = "draft" | "published" | "discarded" | "superseded";

export interface SnapshotRecord {
  id: Uuid;
  status: SnapshotStatus;
  version: number;
  cutoff: DateTimeString;
  created_by: string;
  approved_by: string | null;
  published_at: DateTimeString | null;
  preview: PublicSnapshot;
  excluded: { not_closed: number; withdrawn: number; after_cutoff: number; other_kinds: number };
}

export interface CreateSnapshotRequest {
  cutoff?: DateTimeString;
}

export interface PublishScheduleRequest {
  hourly: boolean;
  version: number;
}

// ---------------------------------------------------------------------------
// ADM
// ---------------------------------------------------------------------------

export interface CodeCard {
  observer_code: ObserverCode;
  /** 8 digits; shown only in create, print_data, reissue, reset_pin responses. */
  setup_pin: string;
  setup_expires_at: DateTimeString;
}

export interface CodeBatch {
  id: Uuid;
  label: string;
  count: number;
  created_at: DateTimeString;
  created_by: string;
  printed_at: DateTimeString | null;
  active: number;
  unclaimed: number;
  revoked: number;
}

export interface CreateCodeBatchRequest {
  label: string;
  count: number;
}

export interface CodeBatchWithCards {
  batch: CodeBatch;
  cards: CodeCard[];
}

export interface PrintDataRequest {
  confirm_reset_setup_pins: true;
}

export type CodeStatus = "unclaimed" | "active" | "locked" | "revoked";

export interface ObserverCodeRow {
  observer_code: ObserverCode;
  batch_id: Uuid;
  status: CodeStatus;
  activated_on: DateString | null;
  last_active_on: DateString | null;
  replaced_by: ObserverCode | null;
}

export interface CodeListQuery extends PageQuery {
  batch_id?: Uuid;
  status?: CodeStatus;
  q?: string;
}

export type RevokeReason = "lost_phone" | "left_programme" | "suspected_misuse" | "other";

export interface RevokeRequest {
  reason: RevokeReason;
}

export interface RevokeResponse {
  observer_code: ObserverCode;
  status: "revoked";
  sessions_ended: number;
}

export interface ReissueResponse {
  revoked: ObserverCode;
  card: CodeCard;
}

export interface ResetPinResponse {
  card: CodeCard;
}

export type StaffStatus = "invited" | "active" | "offboarded";

export interface StaffAccount {
  id: StaffId;
  email: string;
  display_name: string;
  roles: StaffRole[];
  status: StaffStatus;
  totp_enrolled: boolean;
  last_sign_in_on: DateString | null;
  version: number;
}

export interface StaffListQuery {
  role?: StaffRole;
  status?: "active" | "offboarded";
}

export interface CreateStaffRequest {
  email: string;
  display_name: string;
  roles: StaffRole[];
}

export interface CreateStaffResponse {
  staff: StaffAccount;
  invite: { url: string; expires_at: DateTimeString };
}

export interface UpdateStaffRequest {
  display_name?: string;
  roles?: StaffRole[];
  version: number;
}

export interface OffboardRequest {
  reason: "access_ended" | "role_changed" | "credential_risk";
  version: number;
}

export interface OrganisationSettings {
  version: number;
  intake_paused: boolean;
  retention_days: number;
  election_day: DateString | null;
  public_delay_minutes: number;
  party_labels: PartyLabel[];
  coverage_area: { state_codes: StateCode[]; lga_codes: LgaCode[] };
  simulator_enabled: boolean;
  updated_by: string | null;
  updated_at: DateTimeString | null;
}

export type UpdateSettingsRequest = Partial<
  Omit<OrganisationSettings, "version" | "updated_by" | "updated_at">
> & { version: number; confirm?: boolean };

// ---------------------------------------------------------------------------
// SEC and AUD
// ---------------------------------------------------------------------------

export type AlertRule =
  | "repeated_failed_pins"
  | "repeated_failed_staff_sign_in"
  | "unusual_download_volume"
  | "new_network_sign_in"
  | "intake_burst"
  | "receipt_enumeration"
  | "staff_offboarded_with_cases"
  | "anomaly";

export type AlertStatus = "open" | "acknowledged" | "resolved" | "false_positive";

export interface SecurityAlert {
  id: Uuid;
  rule: AlertRule;
  severity: "high" | "medium" | "low";
  status: AlertStatus;
  version: number;
  subject: { type: "observer_code" | "staff" | "network" | "receipt_lookup" | "intake_source"; label: string };
  details: Record<string, string | number | boolean>;
  first_seen_at: DateTimeString;
  last_seen_at: DateTimeString;
  detector: "rules" | "model";
}

export interface AlertListQuery extends PageQuery {
  status?: Exclude<AlertStatus, "false_positive">;
  severity?: SecurityAlert["severity"];
}

export interface AlertUpdateRequest {
  status: "acknowledged" | "resolved" | "false_positive";
  note?: string;
  version: number;
}

export interface AuditChainHead {
  hash: Sha256Hex;
  event_count: number;
  at: DateTimeString;
}

export interface AuditExportQuery {
  from: DateString;
  to: DateString;
  format: "jsonl" | "csv";
}

export interface AuditExportRow {
  id: Uuid;
  created_at: DateTimeString;
  actor_ref: string;
  actor_label: string;
  action: string;
  object_type: string;
  object_id: string;
  version: number | null;
  content_digest: Sha256Hex;
  prev_hash: Sha256Hex;
  hash: Sha256Hex;
}

export interface AuditVerifyResponse {
  intact: boolean;
  events_checked: number;
  head: AuditChainHead;
  first_broken_event_id: Uuid | null;
  checked_at: DateTimeString;
}

// ---------------------------------------------------------------------------
// SMS, USSD (gateway formats) and SIM
// ---------------------------------------------------------------------------

/** Africa's Talking inbound SMS callback (form-encoded). */
export interface SmsInboundForm {
  from: string;
  to: string;
  text: string;
  date: string;
  id: string;
  linkId?: string;
  networkCode?: string;
}

/** Africa's Talking USSD callback (form-encoded). Response is text/plain "CON ..." or "END ...". */
export interface UssdSessionForm {
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  text: string;
  networkCode?: string;
}

export interface SimUssdRequest {
  session_id: Uuid;
  service_code: string;
  input: string;
}

export interface SimUssdResponse {
  type: "CON" | "END";
  text: string;
  session_id: Uuid;
}

export interface SimSmsRequest {
  text: string;
}

export interface SimMessage {
  id: string;
  text: string;
  received_at: DateTimeString;
}

export interface SimSmsResponse {
  replies: SimMessage[];
}

export interface SimInboxResponse {
  phone_label: string;
  messages: Array<SimMessage & { from: string }>;
}

export interface SimResetResponse {
  phone_label: string;
}

// ---------------------------------------------------------------------------
// Empty bodies
// ---------------------------------------------------------------------------

export type EmptyBody = Record<string, never>;
/** 204 No Content */
export type NoContent = null;
