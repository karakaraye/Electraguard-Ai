/* Development-only check-in fixtures for the observer viewer, on the synthetic institutions. */
import type { NoticeView } from "../../../(observer)/o/_lib/notices";

export const NOTICE_NOW = Date.parse("2026-12-05T09:46:00+01:00");

const question = {
  id: "voting_started",
  category: "lack_of_information",
  text_by_lang: { en: "Has voting started at your unit?", pcm: "Voting don start for your unit?", ha: "An fara kada kuri'a a rumfarka?", yo: "Se idibo ti bere ni ibudo re?", ig: "Ntuli aka amalitela n'ebe ntuli aka gi?" },
  answers: ["yes", "no", "not_seen"],
};

export const NOTICE_LOGISTICS: NoticeView = {
  id: "11111111-1111-4111-8111-111111111111",
  scope: { kind: "ward", code: "KN-04-07" },
  type: "logistics",
  text: question.text_by_lang.en,
  question,
  my_answer: null,
  answer: null,
  expires_at: "2026-12-05T10:30:00+01:00",
  created_at: "2026-12-05T08:30:00+01:00",
};

export const NOTICE_SAFETY: NoticeView = {
  id: "22222222-2222-4222-8222-222222222222",
  scope: { kind: "ward", code: "KN-04-08" },
  type: "safety",
  text: "Avoid the Kofar Mazugal junction. Use the Dala road to reach your unit.",
  question: null,
  my_answer: null,
  answer: null,
  expires_at: "2026-12-05T11:20:00+01:00",
  created_at: "2026-12-05T09:20:00+01:00",
};

export const AREA_TODAY = {
  lgaName: "Dala",
  updatedAt: "2026-12-05T09:00:00+01:00",
  rows: [
    { category: "late_materials", count: 12 },
    { category: "queues_crowding", count: 8 },
    { category: "equipment_failure", count: 6 },
    { category: "intimidation_violence", count: "fewer than 5" as const },
  ],
};
