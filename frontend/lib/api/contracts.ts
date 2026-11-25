/**
 * Contract id → method, path, roles. Source of truth: docs/design/api-contracts.md.
 * Contracts with several operations use "<ID>.<operation>" keys; every entry names its contract id.
 * Paths are relative to /api/v1 and use {param} placeholders.
 */

import type * as T from "./types";

export const API_BASE = "/api/v1" as const;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Who may call. "citizen" = anonymous with X-Receipt-Secret; "gateway" = SMS/USSD provider. */
export type Caller =
  | "public"
  | "citizen"
  | "observer"
  | "reviewer"
  | "moderator"
  | "coordinator"
  | "org_admin"
  | "gateway";

export type ContractStatus = "EXISTS" | "CHANGE" | "NEW";

export type ContractId =
  | "AUTH-01" | "AUTH-02" | "AUTH-03" | "AUTH-04" | "AUTH-05" | "AUTH-06" | "AUTH-07" | "AUTH-08"
  | "REF-01" | "REF-02"
  | "REP-01" | "REP-02" | "REP-03" | "REP-04" | "REP-05" | "REP-06" | "REP-07"
  | "MED-01" | "MED-02" | "MED-03" | "MED-04" | "MED-05"
  | "MSG-01" | "MSG-02"
  | "DIS-01" | "DIS-02" | "DIS-03" | "DIS-04" | "DIS-05"
  | "ASK-01" | "GUIDE-01" | "RS-01"
  | "Q-01" | "CASE-01" | "CASE-02" | "CASE-03" | "CASE-04" | "CASE-05"
  | "ASG-01" | "ASG-02"
  | "OPS-01" | "OPS-02" | "OPS-03" | "OPS-04"
  | "RUM-01" | "RUM-02" | "RUM-03"
  | "PUB-01" | "PUB-02"
  | "ADM-01" | "ADM-02" | "ADM-03" | "ADM-04"
  | "SEC-01" | "AUD-01"
  | "SMS-01" | "USSD-01" | "SIM-01"
  | "CHK-01" | "CHK-02"
  | "NOT-01" | "NOT-02" | "NOT-03" | "NOT-04" | "NOT-05" | "NOT-06"
  | "AREA-01";

export interface OperationSpec {
  contract: ContractId;
  method: HttpMethod;
  path: string;
  callers: readonly Caller[];
  status: ContractStatus;
  /** Idempotency-Key required (section 1.5). */
  idempotent: boolean;
  /** Request body encoding. */
  body?: "json" | "multipart" | "octet-stream" | "form";
}

const OBS = ["observer"] as const;
const OBS_CIT = ["observer", "citizen"] as const;
const REV = ["reviewer"] as const;
const MOD = ["moderator"] as const;
const COORD = ["coordinator"] as const;
const ADMIN = ["org_admin"] as const;
const STAFF = ["reviewer", "moderator", "coordinator", "org_admin"] as const;
const ALL = ["public", "citizen", "observer", "reviewer", "moderator", "coordinator", "org_admin"] as const;

export const OPERATIONS = {
  // AUTH
  "AUTH-01": { contract: "AUTH-01", method: "GET", path: "/auth/csrf", callers: ALL, status: "CHANGE", idempotent: false },
  "AUTH-02": { contract: "AUTH-02", method: "POST", path: "/auth/observer/sign-in", callers: ["public"], status: "NEW", idempotent: false, body: "json" },
  "AUTH-03": { contract: "AUTH-03", method: "POST", path: "/auth/observer/pin", callers: ["public"], status: "NEW", idempotent: false, body: "json" },
  "AUTH-04": { contract: "AUTH-04", method: "POST", path: "/auth/staff/sign-in", callers: ["public"], status: "CHANGE", idempotent: false, body: "json" },
  "AUTH-05.verify": { contract: "AUTH-05", method: "POST", path: "/auth/staff/totp", callers: STAFF, status: "NEW", idempotent: false, body: "json" },
  "AUTH-05.enrol_start": { contract: "AUTH-05", method: "POST", path: "/auth/staff/totp/enrolment", callers: STAFF, status: "NEW", idempotent: false, body: "json" },
  "AUTH-05.enrol_confirm": { contract: "AUTH-05", method: "POST", path: "/auth/staff/totp/enrolment/confirm", callers: STAFF, status: "NEW", idempotent: false, body: "json" },
  "AUTH-05.accept_invite": { contract: "AUTH-05", method: "POST", path: "/auth/staff/invite", callers: ["public"], status: "NEW", idempotent: false, body: "json" },
  "AUTH-06": { contract: "AUTH-06", method: "POST", path: "/auth/sign-out", callers: ["observer", ...STAFF], status: "CHANGE", idempotent: false, body: "json" },
  "AUTH-07": { contract: "AUTH-07", method: "GET", path: "/auth/me", callers: ALL, status: "CHANGE", idempotent: false },
  /** Gap decision G12: change an existing personal PIN. */
  "AUTH-08": { contract: "AUTH-08", method: "POST", path: "/auth/observer/pin/change", callers: OBS, status: "NEW", idempotent: false, body: "json" },

  // REF
  "REF-01.index": { contract: "REF-01", method: "GET", path: "/reference/areas", callers: ALL, status: "NEW", idempotent: false },
  "REF-01.state": { contract: "REF-01", method: "GET", path: "/reference/areas/{state_code}", callers: ALL, status: "NEW", idempotent: false },
  /** Gap decisions G4/G5: the signed-in observer's coverage area and party labels. */
  "REF-02": { contract: "REF-02", method: "GET", path: "/reference/settings", callers: OBS, status: "NEW", idempotent: false },

  // REP
  "REP-01": { contract: "REP-01", method: "POST", path: "/reports", callers: OBS, status: "CHANGE", idempotent: true, body: "json" },
  "REP-02": { contract: "REP-02", method: "GET", path: "/reports", callers: OBS, status: "CHANGE", idempotent: false },
  "REP-03": { contract: "REP-03", method: "GET", path: "/reports/{id}", callers: OBS, status: "CHANGE", idempotent: false },
  "REP-04.observer": { contract: "REP-04", method: "POST", path: "/reports/{id}/withdraw", callers: OBS, status: "NEW", idempotent: true, body: "json" },
  "REP-04.citizen": { contract: "REP-04", method: "POST", path: "/public/receipts/{receipt_code}/withdraw", callers: ["citizen"], status: "NEW", idempotent: true, body: "json" },
  "REP-05": { contract: "REP-05", method: "POST", path: "/public/reports", callers: ["public", "citizen"], status: "NEW", idempotent: true, body: "json" },
  "REP-06": { contract: "REP-06", method: "GET", path: "/public/receipts/{receipt_code}", callers: ALL, status: "NEW", idempotent: false },
  "REP-07.read": { contract: "REP-07", method: "GET", path: "/public/receipts/{receipt_code}/conversation", callers: ["citizen"], status: "NEW", idempotent: false },
  "REP-07.reply": { contract: "REP-07", method: "POST", path: "/public/receipts/{receipt_code}/reply", callers: ["citizen"], status: "NEW", idempotent: true, body: "json" },

  // MED
  "MED-01": { contract: "MED-01", method: "POST", path: "/reports/{report_id}/uploads", callers: OBS_CIT, status: "CHANGE", idempotent: true, body: "json" },
  "MED-02.send": { contract: "MED-02", method: "PATCH", path: "/uploads/{upload_id}", callers: OBS_CIT, status: "NEW", idempotent: false, body: "octet-stream" },
  "MED-02.progress": { contract: "MED-02", method: "GET", path: "/uploads/{upload_id}", callers: OBS_CIT, status: "NEW", idempotent: false },
  "MED-03": { contract: "MED-03", method: "POST", path: "/uploads/{upload_id}/complete", callers: OBS_CIT, status: "NEW", idempotent: true, body: "json" },
  "MED-04": { contract: "MED-04", method: "GET", path: "/media/{media_id}/content", callers: ["observer", "reviewer"], status: "CHANGE", idempotent: false },
  "MED-05.media": { contract: "MED-05", method: "DELETE", path: "/reports/{report_id}/media/{media_id}", callers: OBS_CIT, status: "NEW", idempotent: false },
  "MED-05.upload": { contract: "MED-05", method: "DELETE", path: "/uploads/{upload_id}", callers: OBS_CIT, status: "NEW", idempotent: false },

  // MSG
  "MSG-01.list": { contract: "MSG-01", method: "GET", path: "/reports/{report_id}/messages", callers: ["observer", "reviewer"], status: "CHANGE", idempotent: false },
  "MSG-01.mark_read": { contract: "MSG-01", method: "POST", path: "/reports/{report_id}/messages/read", callers: ["observer", "reviewer"], status: "CHANGE", idempotent: false, body: "json" },
  "MSG-02": { contract: "MSG-02", method: "POST", path: "/reports/{report_id}/messages", callers: ["observer", "reviewer"], status: "CHANGE", idempotent: true, body: "json" },

  // DIS
  "DIS-01": { contract: "DIS-01", method: "GET", path: "/discussions", callers: ["observer", "moderator"], status: "NEW", idempotent: false },
  "DIS-02": { contract: "DIS-02", method: "GET", path: "/discussions/{id}", callers: ["observer", "moderator"], status: "NEW", idempotent: false },
  "DIS-03.post": { contract: "DIS-03", method: "POST", path: "/discussions/{id}/posts", callers: OBS, status: "NEW", idempotent: true, body: "json" },
  "DIS-03.flag": { contract: "DIS-03", method: "POST", path: "/discussions/{id}/posts/{post_id}/flag", callers: OBS, status: "NEW", idempotent: true, body: "json" },
  "DIS-04": { contract: "DIS-04", method: "POST", path: "/discussions/{id}/membership", callers: OBS, status: "NEW", idempotent: true, body: "json" },
  "DIS-05.create": { contract: "DIS-05", method: "POST", path: "/discussions", callers: MOD, status: "NEW", idempotent: true, body: "json" },
  "DIS-05.invite": { contract: "DIS-05", method: "POST", path: "/discussions/{id}/invitations", callers: MOD, status: "NEW", idempotent: true, body: "json" },
  "DIS-05.hide_post": { contract: "DIS-05", method: "POST", path: "/discussions/{id}/posts/{post_id}/hide", callers: MOD, status: "NEW", idempotent: true, body: "json" },
  "DIS-05.unhide_post": { contract: "DIS-05", method: "POST", path: "/discussions/{id}/posts/{post_id}/unhide", callers: MOD, status: "NEW", idempotent: true, body: "json" },
  "DIS-05.remove_member": { contract: "DIS-05", method: "POST", path: "/discussions/{id}/members/{observer_code}/remove", callers: MOD, status: "NEW", idempotent: true, body: "json" },
  "DIS-05.close": { contract: "DIS-05", method: "POST", path: "/discussions/{id}/close", callers: MOD, status: "NEW", idempotent: true, body: "json" },
  "DIS-05.flags": { contract: "DIS-05", method: "GET", path: "/moderation/flags", callers: MOD, status: "NEW", idempotent: false },

  // ASK, RS
  "ASK-01": { contract: "ASK-01", method: "POST", path: "/ask", callers: ALL, status: "NEW", idempotent: false, body: "json" },
  "RS-01": { contract: "RS-01", method: "POST", path: "/result-sheets/ocr", callers: OBS, status: "NEW", idempotent: true, body: "multipart" },

  // Q, CASE
  "Q-01": { contract: "Q-01", method: "GET", path: "/review/queue", callers: REV, status: "CHANGE", idempotent: false },
  "CASE-01": { contract: "CASE-01", method: "GET", path: "/review/cases/{id}", callers: REV, status: "CHANGE", idempotent: false },
  "CASE-02": { contract: "CASE-02", method: "POST", path: "/review/cases/{id}/actions", callers: REV, status: "CHANGE", idempotent: true, body: "json" },
  "CASE-03": { contract: "CASE-03", method: "POST", path: "/review/cases/{id}/suggestions/{type}", callers: REV, status: "CHANGE", idempotent: true, body: "json" },
  "CASE-04": { contract: "CASE-04", method: "POST", path: "/review/cases/{id}/duplicates/{other_id}", callers: REV, status: "CHANGE", idempotent: true, body: "json" },
  "CASE-05": { contract: "CASE-05", method: "POST", path: "/review/cases/{id}/redaction", callers: REV, status: "NEW", idempotent: true, body: "json" },

  // ASG
  "ASG-01": { contract: "ASG-01", method: "GET", path: "/assignments", callers: COORD, status: "CHANGE", idempotent: false },
  "ASG-02": { contract: "ASG-02", method: "POST", path: "/assignments", callers: COORD, status: "CHANGE", idempotent: true, body: "json" },

  // OPS
  "OPS-01": { contract: "OPS-01", method: "GET", path: "/ops/overview", callers: COORD, status: "CHANGE", idempotent: false },
  "OPS-02.list": { contract: "OPS-02", method: "GET", path: "/ops/clusters", callers: COORD, status: "NEW", idempotent: false },
  "OPS-02.review": { contract: "OPS-02", method: "POST", path: "/ops/clusters/{id}/review", callers: COORD, status: "NEW", idempotent: false, body: "json" },
  "OPS-02.get_settings": { contract: "OPS-02", method: "GET", path: "/ops/cluster-settings", callers: COORD, status: "NEW", idempotent: false },
  "OPS-02.update_settings": { contract: "OPS-02", method: "PUT", path: "/ops/cluster-settings", callers: COORD, status: "NEW", idempotent: false, body: "json" },
  "OPS-03": { contract: "OPS-03", method: "GET", path: "/ops/coverage", callers: COORD, status: "NEW", idempotent: false },
  "OPS-04": { contract: "OPS-04", method: "GET", path: "/ops/late-materials-risk", callers: COORD, status: "NEW", idempotent: false },

  // RUM
  "RUM-01.list": { contract: "RUM-01", method: "GET", path: "/rumours/claims", callers: COORD, status: "NEW", idempotent: false },
  "RUM-01.create": { contract: "RUM-01", method: "POST", path: "/rumours/claims", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "RUM-01.get": { contract: "RUM-01", method: "GET", path: "/rumours/claims/{id}", callers: COORD, status: "NEW", idempotent: false },
  "RUM-02": { contract: "RUM-02", method: "GET", path: "/rumours/claims/{id}/matches", callers: COORD, status: "NEW", idempotent: false },
  "RUM-03.save_draft": { contract: "RUM-03", method: "PUT", path: "/rumours/claims/{id}/response", callers: COORD, status: "NEW", idempotent: false, body: "json" },
  "RUM-03.approve": { contract: "RUM-03", method: "POST", path: "/rumours/claims/{id}/response/approve", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "RUM-03.reject": { contract: "RUM-03", method: "POST", path: "/rumours/claims/{id}/response/reject", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "RUM-03.dismiss": { contract: "RUM-03", method: "POST", path: "/rumours/claims/{id}/dismiss", callers: COORD, status: "NEW", idempotent: true, body: "json" },

  // PUB
  "PUB-01.list": { contract: "PUB-01", method: "GET", path: "/publish/snapshots", callers: COORD, status: "NEW", idempotent: false },
  "PUB-01.create": { contract: "PUB-01", method: "POST", path: "/publish/snapshots", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "PUB-01.get": { contract: "PUB-01", method: "GET", path: "/publish/snapshots/{id}", callers: COORD, status: "NEW", idempotent: false },
  "PUB-01.approve": { contract: "PUB-01", method: "POST", path: "/publish/snapshots/{id}/approve", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "PUB-01.discard": { contract: "PUB-01", method: "POST", path: "/publish/snapshots/{id}/discard", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "PUB-01.schedule": { contract: "PUB-01", method: "PUT", path: "/publish/schedule", callers: COORD, status: "NEW", idempotent: false, body: "json" },
  "PUB-02": { contract: "PUB-02", method: "GET", path: "/public/results", callers: ALL, status: "NEW", idempotent: false },

  // ADM
  "ADM-01.list": { contract: "ADM-01", method: "GET", path: "/admin/code-batches", callers: ADMIN, status: "NEW", idempotent: false },
  "ADM-01.create": { contract: "ADM-01", method: "POST", path: "/admin/code-batches", callers: ADMIN, status: "NEW", idempotent: true, body: "json" },
  "ADM-01.print_data": { contract: "ADM-01", method: "POST", path: "/admin/code-batches/{id}/print-data", callers: ADMIN, status: "NEW", idempotent: true, body: "json" },
  "ADM-01.codes": { contract: "ADM-01", method: "GET", path: "/admin/codes", callers: ADMIN, status: "NEW", idempotent: false },
  "ADM-02.revoke": { contract: "ADM-02", method: "POST", path: "/admin/codes/{observer_code}/revoke", callers: ADMIN, status: "NEW", idempotent: true, body: "json" },
  "ADM-02.reissue": { contract: "ADM-02", method: "POST", path: "/admin/codes/{observer_code}/reissue", callers: ADMIN, status: "NEW", idempotent: true, body: "json" },
  "ADM-02.reset_pin": { contract: "ADM-02", method: "POST", path: "/admin/codes/{observer_code}/reset-pin", callers: ADMIN, status: "NEW", idempotent: true, body: "json" },
  "ADM-03.list": { contract: "ADM-03", method: "GET", path: "/admin/staff", callers: ADMIN, status: "CHANGE", idempotent: false },
  "ADM-03.create": { contract: "ADM-03", method: "POST", path: "/admin/staff", callers: ADMIN, status: "CHANGE", idempotent: true, body: "json" },
  "ADM-03.update": { contract: "ADM-03", method: "PATCH", path: "/admin/staff/{id}", callers: ADMIN, status: "CHANGE", idempotent: false, body: "json" },
  "ADM-03.reset_2fa": { contract: "ADM-03", method: "POST", path: "/admin/staff/{id}/reset-2fa", callers: ADMIN, status: "CHANGE", idempotent: true, body: "json" },
  "ADM-03.offboard": { contract: "ADM-03", method: "POST", path: "/admin/staff/{id}/offboard", callers: ADMIN, status: "CHANGE", idempotent: true, body: "json" },
  "ADM-04.get": { contract: "ADM-04", method: "GET", path: "/admin/settings", callers: ADMIN, status: "CHANGE", idempotent: false },
  "ADM-04.update": { contract: "ADM-04", method: "PATCH", path: "/admin/settings", callers: ADMIN, status: "CHANGE", idempotent: false, body: "json" },

  // SEC, AUD
  "SEC-01.list": { contract: "SEC-01", method: "GET", path: "/security/alerts", callers: ["coordinator", "org_admin"], status: "NEW", idempotent: false },
  "SEC-01.update": { contract: "SEC-01", method: "POST", path: "/security/alerts/{id}", callers: ["coordinator", "org_admin"], status: "NEW", idempotent: false, body: "json" },
  "AUD-01.export": { contract: "AUD-01", method: "GET", path: "/audit/export", callers: ADMIN, status: "NEW", idempotent: false },
  "AUD-01.verify": { contract: "AUD-01", method: "GET", path: "/audit/verify", callers: ["coordinator", "org_admin"], status: "NEW", idempotent: false },

  // SMS, USSD, SIM
  "SMS-01": { contract: "SMS-01", method: "POST", path: "/channels/sms/inbound/{webhook_secret}", callers: ["gateway"], status: "NEW", idempotent: false, body: "form" },
  "USSD-01": { contract: "USSD-01", method: "POST", path: "/channels/ussd/{webhook_secret}", callers: ["gateway"], status: "NEW", idempotent: false, body: "form" },
  "SIM-01.ussd": { contract: "SIM-01", method: "POST", path: "/simulator/ussd", callers: ALL, status: "NEW", idempotent: true, body: "json" },
  "SIM-01.sms": { contract: "SIM-01", method: "POST", path: "/simulator/sms", callers: ALL, status: "NEW", idempotent: true, body: "json" },
  "SIM-01.inbox": { contract: "SIM-01", method: "GET", path: "/simulator/inbox", callers: ALL, status: "NEW", idempotent: false },
  "SIM-01.reset": { contract: "SIM-01", method: "POST", path: "/simulator/reset", callers: ALL, status: "NEW", idempotent: false, body: "json" },

  // GUIDE (approved documents rendered on P-05; the same set ASK-01 quotes)
  "GUIDE-01.list": { contract: "GUIDE-01", method: "GET", path: "/public/guides", callers: ALL, status: "NEW", idempotent: false },
  "GUIDE-01.get": { contract: "GUIDE-01", method: "GET", path: "/public/guides/{slug}", callers: ALL, status: "NEW", idempotent: false },

  // CHK
  "CHK-01": { contract: "CHK-01", method: "GET", path: "/public/check", callers: ALL, status: "NEW", idempotent: false },
  "CHK-02": { contract: "CHK-02", method: "POST", path: "/public/check", callers: ["public"], status: "NEW", idempotent: true, body: "json" },

  // NOT
  "NOT-01": { contract: "NOT-01", method: "POST", path: "/notices", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "NOT-02.approve": { contract: "NOT-02", method: "POST", path: "/notices/{id}/approve", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "NOT-02.reject": { contract: "NOT-02", method: "POST", path: "/notices/{id}/reject", callers: COORD, status: "NEW", idempotent: true, body: "json" },
  "NOT-03.list": { contract: "NOT-03", method: "GET", path: "/notices", callers: COORD, status: "NEW", idempotent: false },
  "NOT-03.results": { contract: "NOT-03", method: "GET", path: "/notices/{id}/results", callers: COORD, status: "NEW", idempotent: false },
  "NOT-04": { contract: "NOT-04", method: "GET", path: "/observer/notices", callers: OBS, status: "NEW", idempotent: false },
  "NOT-05": { contract: "NOT-05", method: "POST", path: "/observer/notices/{id}/answer", callers: OBS, status: "NEW", idempotent: true, body: "json" },
  "NOT-06": { contract: "NOT-06", method: "GET", path: "/notices/questions", callers: COORD, status: "NEW", idempotent: false },

  // AREA
  "AREA-01": { contract: "AREA-01", method: "GET", path: "/observer/area-today", callers: OBS, status: "NEW", idempotent: false },
} as const satisfies Record<string, OperationSpec>;

export type OperationId = keyof typeof OPERATIONS;

/** Every contract id has at least one operation. Fails to compile if one is missing. */
type MissingContracts = Exclude<ContractId, (typeof OPERATIONS)[OperationId]["contract"]>;
const _allContractsCovered: [MissingContracts] extends [never] ? true : MissingContracts = true;
void _allContractsCovered;

// ---------------------------------------------------------------------------
// Request and response types per operation
// ---------------------------------------------------------------------------

type PathParamNames<P extends string> = P extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PathParamNames<Rest>
  : never;

/** `{ id: string }` for "/reports/{id}", `{}` when the path has no parameters. */
export type PathParams<Op extends OperationId> = {
  [K in PathParamNames<(typeof OPERATIONS)[Op]["path"]>]: string;
};

interface Io<Body, Res, Query = undefined> {
  body: Body;
  query: Query;
  response: Res;
}

export interface OperationTypes {
  "AUTH-01": Io<undefined, T.CsrfResponse>;
  "AUTH-02": Io<T.ObserverSignInRequest, T.ObserverSignInResponse>;
  "AUTH-03": Io<T.ObserverPinSetRequest, T.SignedInResponse>;
  "AUTH-04": Io<T.StaffSignInRequest, T.StaffSignInResponse>;
  "AUTH-05.verify": Io<T.TotpCodeRequest, T.SignedInResponse>;
  "AUTH-05.enrol_start": Io<T.EmptyBody, T.TotpEnrolmentStartResponse>;
  "AUTH-05.enrol_confirm": Io<T.TotpCodeRequest, T.SignedInResponse>;
  "AUTH-05.accept_invite": Io<T.AcceptInviteRequest, T.StaffSignInResponse>;
  "AUTH-06": Io<T.SignOutRequest, T.NoContent>;
  "AUTH-07": Io<undefined, T.MeResponse>;
  "AUTH-08": Io<T.ObserverPinChangeRequest, T.NoContent>;

  "REF-01.index": Io<undefined, T.AreaIndexResponse>;
  "REF-01.state": Io<undefined, T.StateAreasResponse>;
  "REF-02": Io<undefined, T.ObserverSettingsResponse>;

  "REP-01": Io<T.ReportCreateRequest, T.ReportCreateResponse | T.WithdrawnStub>;
  "REP-02": Io<undefined, T.ReportListResponse, T.ReportListQuery>;
  "REP-03": Io<undefined, T.ReportDetail>;
  "REP-04.observer": Io<T.WithdrawRequest, T.WithdrawnStub>;
  "REP-04.citizen": Io<T.WithdrawRequest, T.WithdrawnStub>;
  "REP-05": Io<T.CitizenReportCreateRequest, T.ReportCreateResponse | T.WithdrawnStub>;
  "REP-06": Io<undefined, T.ReceiptStatusResponse>;
  "REP-07.read": Io<undefined, T.CitizenConversationResponse>;
  "REP-07.reply": Io<T.CitizenReplyRequest, T.CitizenReplyResponse>;

  "MED-01": Io<T.UploadStartRequest, T.UploadStartResponse>;
  "MED-02.send": Io<Blob | ArrayBuffer, T.UploadChunkResponse>;
  "MED-02.progress": Io<undefined, T.UploadSession>;
  "MED-03": Io<T.EmptyBody, T.UploadCompleteResponse>;
  /** Binary stream or a 302 to a 60-second link; used as a URL for <img>/<video>/<audio>. */
  "MED-04": Io<undefined, Blob, T.MediaContentQuery>;
  "MED-05.media": Io<undefined, T.NoContent>;
  "MED-05.upload": Io<undefined, T.NoContent>;

  "MSG-01.list": Io<undefined, T.MessageListResponse, T.PageQuery>;
  "MSG-01.mark_read": Io<T.MarkReadRequest, T.NoContent>;
  "MSG-02": Io<T.PostMessageRequest, T.PostMessageResponse>;

  "DIS-01": Io<undefined, T.Page<T.DiscussionSummary>, T.DiscussionListQuery>;
  "DIS-02": Io<undefined, T.ThreadResponse, T.ThreadQuery>;
  "DIS-03.post": Io<T.CreatePostRequest, { post: T.Post }>;
  "DIS-03.flag": Io<T.FlagPostRequest, T.NoContent>;
  "DIS-04": Io<T.MembershipRequest, T.MembershipResponse>;
  "DIS-05.create": Io<T.CreateDiscussionRequest, { discussion: T.Discussion }>;
  "DIS-05.invite": Io<T.InviteRequest, T.InviteResponse>;
  "DIS-05.hide_post": Io<T.HidePostRequest, { post: T.Post }>;
  "DIS-05.unhide_post": Io<T.EmptyBody, { post: T.Post }>;
  "DIS-05.remove_member": Io<T.RemoveMemberRequest, { membership: "removed" }>;
  "DIS-05.close": Io<T.EmptyBody, { discussion: T.Discussion }>;
  "DIS-05.flags": Io<undefined, T.Page<T.ModerationFlag>, T.PageQuery & { status?: "open" }>;

  "ASK-01": Io<T.AskRequest, T.AskResponse>;
  "RS-01": Io<T.OcrRequestForm, T.OcrResponse>;

  "Q-01": Io<undefined, T.QueueResponse, T.QueueQuery>;
  "CASE-01": Io<undefined, T.CaseDetail>;
  "CASE-02": Io<T.CaseActionRequest, T.CaseActionResponse>;
  "CASE-03": Io<T.SuggestionDecisionRequest, T.SuggestionDecisionResponse>;
  "CASE-04": Io<T.DuplicateDecisionRequest, T.DuplicateDecisionResponse>;
  "CASE-05": Io<T.RedactionRequest, T.RedactionResponse>;

  "ASG-01": Io<undefined, T.AssignmentListResponse, T.AssignmentQuery>;
  "ASG-02": Io<T.AssignRequest, T.AssignResponse>;

  "OPS-01": Io<undefined, T.OverviewResponse, T.OverviewQuery>;
  "OPS-02.list": Io<undefined, T.Page<T.Cluster>, T.ClusterListQuery>;
  "OPS-02.review": Io<T.ClusterReviewRequest, T.Cluster>;
  "OPS-02.get_settings": Io<undefined, T.ClusterSettings>;
  "OPS-02.update_settings": Io<T.ClusterSettings, T.ClusterSettings>;
  "OPS-03": Io<undefined, T.CoverageResponse, T.CoverageQuery>;
  "OPS-04": Io<undefined, T.LateMaterialsResponse, T.LateMaterialsQuery>;

  "RUM-01.list": Io<undefined, T.Page<T.Claim>, T.ClaimListQuery>;
  "RUM-01.create": Io<T.ClaimCreateRequest, T.Claim>;
  "RUM-01.get": Io<undefined, T.Claim>;
  "RUM-02": Io<undefined, T.ClaimMatchesResponse>;
  "RUM-03.save_draft": Io<T.SaveClaimResponseRequest, T.Claim>;
  "RUM-03.approve": Io<T.VersionOnlyRequest, T.Claim>;
  "RUM-03.reject": Io<T.NoteVersionRequest, T.Claim>;
  "RUM-03.dismiss": Io<T.NoteVersionRequest, T.Claim>;

  "PUB-01.list": Io<undefined, T.Page<T.SnapshotRecord>, T.PageQuery>;
  "PUB-01.create": Io<T.CreateSnapshotRequest, T.SnapshotRecord>;
  "PUB-01.get": Io<undefined, T.SnapshotRecord>;
  "PUB-01.approve": Io<T.VersionOnlyRequest, T.SnapshotRecord>;
  "PUB-01.discard": Io<T.VersionOnlyRequest, T.SnapshotRecord>;
  "PUB-01.schedule": Io<T.PublishScheduleRequest, { hourly: boolean; version: number }>;
  "PUB-02": Io<undefined, T.PublicResultsResponse>;

  "ADM-01.list": Io<undefined, T.Page<T.CodeBatch>, T.PageQuery>;
  "ADM-01.create": Io<T.CreateCodeBatchRequest, T.CodeBatchWithCards>;
  "ADM-01.print_data": Io<T.PrintDataRequest, T.CodeBatchWithCards>;
  "ADM-01.codes": Io<undefined, T.Page<T.ObserverCodeRow>, T.CodeListQuery>;
  "ADM-02.revoke": Io<T.RevokeRequest, T.RevokeResponse>;
  "ADM-02.reissue": Io<T.RevokeRequest, T.ReissueResponse>;
  "ADM-02.reset_pin": Io<T.EmptyBody, T.ResetPinResponse>;
  "ADM-03.list": Io<undefined, { items: T.StaffAccount[] }, T.StaffListQuery>;
  "ADM-03.create": Io<T.CreateStaffRequest, T.CreateStaffResponse>;
  "ADM-03.update": Io<T.UpdateStaffRequest, { staff: T.StaffAccount }>;
  "ADM-03.reset_2fa": Io<T.VersionOnlyRequest, { staff: T.StaffAccount }>;
  "ADM-03.offboard": Io<T.OffboardRequest, { staff: T.StaffAccount }>;
  "ADM-04.get": Io<undefined, T.OrganisationSettings>;
  "ADM-04.update": Io<T.UpdateSettingsRequest, T.OrganisationSettings>;

  "SEC-01.list": Io<undefined, T.Page<T.SecurityAlert>, T.AlertListQuery>;
  "SEC-01.update": Io<T.AlertUpdateRequest, T.SecurityAlert>;
  /** Streamed file (jsonl or csv) of AuditExportRow. */
  "AUD-01.export": Io<undefined, Blob, T.AuditExportQuery>;
  "AUD-01.verify": Io<undefined, T.AuditVerifyResponse, { from?: T.DateString; to?: T.DateString }>;

  /** Gateway only; the web client never calls these. Response: 200 empty / text/plain "CON …" | "END …". */
  "SMS-01": Io<T.SmsInboundForm, T.NoContent>;
  "USSD-01": Io<T.UssdSessionForm, string>;
  "SIM-01.ussd": Io<T.SimUssdRequest, T.SimUssdResponse>;
  "SIM-01.sms": Io<T.SimSmsRequest, T.SimSmsResponse>;
  "SIM-01.inbox": Io<undefined, T.SimInboxResponse, { after?: string }>;
  "SIM-01.reset": Io<T.EmptyBody, T.SimResetResponse>;

  "GUIDE-01.list": Io<undefined, T.GuideListResponse, { language?: T.Language }>;
  "GUIDE-01.get": Io<undefined, T.GuideDocument, { language?: T.Language }>;

  // CHK
  "CHK-01": Io<undefined, { result: string; response?: Record<string, unknown>; claim_ref?: string }, { q?: string; lang?: string }>;
  "CHK-02": Io<{ text: string; lang: string; device_token: string }, { result: string; claim_ref: string }>;

  // NOT
  "NOT-01": Io<{ scope: { kind: string; code: string }; type: string; text: string; question_id?: string; expires_in_minutes?: number }, { id: string; status: string }>;
  "NOT-02.approve": Io<Record<string, unknown>, { status: string }>;
  "NOT-02.reject": Io<{ note: string }, { status: string }>;
  "NOT-03.list": Io<undefined, { items: Record<string, unknown>[] }>;
  "NOT-03.results": Io<undefined, { notice_id: string; status: string; wards: Record<string, unknown> }>;
  "NOT-04": Io<undefined, { items: Record<string, unknown>[] }, { ward_code?: string; lga_code?: string }>;
  "NOT-05": Io<{ answer: "yes" | "no" | "not_seen"; answered_at: string }, { status: string }>;
  "NOT-06": Io<undefined, { items: Record<string, unknown>[] }>;

  // AREA
  "AREA-01": Io<undefined, { lga_name: string; lga_code: string; updated_at: string; by_category: { category: string; count: number | "fewer than 5" }[] }, { lga_code?: string }>;
}

/** Fails to compile if an operation has no types or a type entry has no operation. */
type _TypesCoverOps = [Exclude<OperationId, keyof OperationTypes>, Exclude<keyof OperationTypes, OperationId>];
const _typesCoverOps: _TypesCoverOps extends [never, never] ? true : _TypesCoverOps = true;
void _typesCoverOps;

export type BodyOf<Op extends OperationId> = OperationTypes[Op]["body"];
export type QueryOf<Op extends OperationId> = OperationTypes[Op]["query"];
export type ResponseOf<Op extends OperationId> = OperationTypes[Op]["response"];

// ---------------------------------------------------------------------------
// Typed fetch wrapper signature (implementation lives in lib/api/client.ts)
// ---------------------------------------------------------------------------

type Optional<K extends string, V> = [V] extends [undefined] ? { [P in K]?: undefined } : { [P in K]: V };

export type CallInput<Op extends OperationId> = Optional<"params", keyof PathParams<Op> extends never ? undefined : PathParams<Op>> &
  Optional<"body", BodyOf<Op>> & { query?: QueryOf<Op> } & {
    /** Required when OPERATIONS[op].idempotent; made when the item enters the outbox, reused on every retry. */
    idempotency_key?: T.Uuid;
    /** Citizen ownership proof (X-Receipt-Secret). */
    receipt_secret?: T.ReceiptSecret;
    /** Extra headers, e.g. Upload-Offset for MED-02.send, If-None-Match for REF-01. */
    headers?: Record<string, string>;
    signal?: AbortSignal;
  };

export type ApiResult<R> =
  | { ok: true; status: number; data: R; replayed: boolean; etag: string | null }
  | { ok: false; status: number; error: T.ApiErrorBody["error"]; retry_after_seconds: number | null }
  | { ok: false; status: 0; error: { code: "network_error"; message: string }; retry_after_seconds: null };

/** One function for every contract: CSRF, idempotency headers and the error shape are handled centrally. */
export type ApiCall = <Op extends OperationId>(op: Op, input: CallInput<Op>) => Promise<ApiResult<ResponseOf<Op>>>;
