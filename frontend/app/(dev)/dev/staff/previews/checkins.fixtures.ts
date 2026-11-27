import type { CoordinatorNotice, NoticeQuestion, NoticeResultsResponse } from "../../../../../lib/api/types";
import type { Places } from "../../../../(staff)/s/_views/CheckinsView";

/** Preview-only data for the Check-ins tab, on the synthetic institutions. */

export const CHECKINS_NOW = Date.parse("2026-12-05T09:40:00+01:00");
export const CHECKINS_USER = "Hadiza Yusuf";

export const CHECKINS_PLACES: Places = {
  lgas: [{ value: "KN-04", label: "Dala, Kano" }],
  wards: [
    { value: "KN-04-07", label: "Kantudu, Dala" },
    { value: "KN-04-08", label: "Gwammaja, Dala" },
    { value: "KN-04-09", label: "Kofar Mazugal, Dala" },
    { value: "KN-04-10", label: "Dala, Dala" },
    { value: "KN-04-11", label: "Madigawa, Dala" },
    { value: "KN-04-12", label: "Adakawa, Dala" },
  ],
  names: {
    "KN-04": "Dala",
    "KN-04-07": "Kantudu",
    "KN-04-08": "Gwammaja",
    "KN-04-09": "Kofar Mazugal",
    "KN-04-10": "Dala",
    "KN-04-11": "Madigawa",
    "KN-04-12": "Adakawa",
    "KN-04-08-001": "Gwammaja Islamiyya I",
    "KN-04-07-013": "Kantudu Primary School II",
    "KN-04-09-001": "Kofar Mazugal Primary I",
    "KN-04-09-002": "Mazugal Market Square",
    "KN-04-11-001": "Madigawa Health Post I",
    "KN-04-12-001": "Adakawa Primary I",
    "KN-04-12-002": "Adakawa Primary II",
  },
};

const text = (en: string) => ({ en, pcm: en, ha: en, yo: en, ig: en });

export const CHECKINS_QUESTIONS: NoticeQuestion[] = [
  { id: "materials_arrived", category: "late_materials", text_by_lang: text("Have materials arrived at your unit?"), answers: ["yes", "no", "not_seen"] },
  { id: "voting_started", category: "lack_of_information", text_by_lang: text("Has voting started at your unit?"), answers: ["yes", "no", "not_seen"] },
  { id: "unit_calm", category: "intimidation_violence", text_by_lang: text("Is your polling unit calm?"), answers: ["yes", "no", "not_seen"] },
];

export const CHECKINS_NOTICES: CoordinatorNotice[] = [
  {
    id: "n-voting",
    scope: { kind: "lga", code: "KN-04" },
    type: "logistics",
    text: "Has voting started at your unit?",
    question: CHECKINS_QUESTIONS[1],
    status: "sent",
    expires_at: "2026-12-05T10:30:00+01:00",
    created_at: "2026-12-05T08:30:00+01:00",
    created_by: "Hadiza Yusuf",
    approved_by: "Hadiza Yusuf",
  },
  {
    id: "n-junction",
    scope: { kind: "ward", code: "KN-04-09" },
    type: "safety",
    text: "Avoid the Kofar Mazugal junction. Use the Dala road to reach your unit.",
    question: null,
    status: "pending_approval",
    expires_at: "2026-12-05T11:12:00+01:00",
    created_at: "2026-12-05T09:12:00+01:00",
    created_by: "Musa Bello",
    approved_by: null,
  },
  {
    id: "n-materials",
    scope: { kind: "lga", code: "KN-04" },
    type: "logistics",
    text: "Have materials arrived at your unit?",
    question: CHECKINS_QUESTIONS[0],
    status: "sent",
    expires_at: "2026-12-05T09:05:00+01:00",
    created_at: "2026-12-05T07:05:00+01:00",
    created_by: "Hadiza Yusuf",
    approved_by: "Hadiza Yusuf",
  },
  {
    id: "n-calm",
    scope: { kind: "ward", code: "KN-04-07" },
    type: "instruction",
    text: "Is your polling unit calm?",
    question: CHECKINS_QUESTIONS[2],
    status: "withdrawn",
    expires_at: "2026-12-05T08:40:00+01:00",
    created_at: "2026-12-05T06:40:00+01:00",
    created_by: "Musa Bello",
    approved_by: null,
  },
];

export const CHECKINS_RESULTS: NoticeResultsResponse = {
  notice_id: "n-voting",
  status: "sent",
  wards: {
    "KN-04-08": { yes: 3, no: 2, not_seen: 0, unanswered_units: ["KN-04-08-001"] },
    "KN-04-07": { yes: 3, no: 0, not_seen: 1, unanswered_units: ["KN-04-07-013"] },
    "KN-04-09": { yes: 1, no: 2, not_seen: 0, unanswered_units: ["KN-04-09-001", "KN-04-09-002"] },
    "KN-04-10": { yes: 4, no: 0, not_seen: 0, unanswered_units: [] },
    "KN-04-11": { yes: 2, no: 0, not_seen: 1, unanswered_units: ["KN-04-11-001"] },
    "KN-04-12": { yes: 1, no: 0, not_seen: 0, unanswered_units: ["KN-04-12-001", "KN-04-12-002"] },
  },
};
