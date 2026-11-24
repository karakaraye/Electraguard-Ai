/** The incident steps O-05 … O-11, in order (shared by server pages and client code). */
export const STEPS = ["what", "danger", "where", "when", "describe", "evidence", "check"] as const;
export type StepId = (typeof STEPS)[number];
