export const reportStatuses = {
  submitted: "Submitted",
  in_review: "In review",
  needs_clarification: "Needs clarification",
  closed: "Closed",
} as const;

export const reviewOutcomes = {
  corroborated: "Corroborated by available evidence",
  insufficient_evidence: "Insufficient evidence",
  out_of_scope: "Out of scope",
} as const;

export type ReportStatus = keyof typeof reportStatuses;
export type Report = {
  reference: string;
  occurred_at: string;
  location: string;
  description: string;
  status: ReportStatus;
};

export type Attachment = { id: string; name: string };
export type ReportDetail = Report & { attachments: Attachment[] };
export type ObserverReport = ReportDetail & { clarification: string | null; version: number };
export type ReviewEvent = {
  version: number;
  actor: string;
  created_at: string;
  action_label: string;
  change: {
    previous_reviewer?: string | null;
    reviewer?: string;
    from_status?: ReportStatus;
    to_status?: ReportStatus;
    note?: string;
    outcome?: keyof typeof reviewOutcomes;
    previous_category?: string;
    category?: string;
    candidate?: string;
    match_decision?: "confirmed" | "dismissed";
    previous_decision?: "confirmed";
    reason?: string;
  };
};
export type ReviewCase = ReportDetail & { version: number; history: ReviewEvent[] };
