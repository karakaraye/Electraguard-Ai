export const matchDecisions = {
  pending: "Awaiting review",
  confirmed: "Confirmed by Reviewer",
  dismissed: "Dismissed by Reviewer",
  reversed: "Reversed",
} as const;

export type MatchDecision = keyof typeof matchDecisions;

export type PossibleMatch = {
  reference: string;
  location: string;
  occurred_at: string;
  decision: MatchDecision;
};
