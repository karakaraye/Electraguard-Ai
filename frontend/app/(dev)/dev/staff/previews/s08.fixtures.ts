import type { ModerationFlag, StateAreasResponse } from "../../../../../lib/api/types";

/** Preview-only data for screen 45 (S-08). Synthetic observers and places; never shipped in the app. */

export const S08_FLAGS: ModerationFlag[] = [
  {
    discussion_id: "disc-dala-01",
    post: {
      id: "post-name",
      author_label: "OBS-3M9Q4T",
      is_me: false,
      body: "Chief Abubakar Danladi was giving out rice to voters at Dala market square before the queue opened.",
      state: "visible",
      hidden_body: null,
      hidden_reason: null,
      created_at: "2026-12-05T08:42:00+01:00",
    },
    reasons: ["names_a_person", "abusive"],
    name_check: { possible_names: true },
    flag_count: 3,
  },
  {
    discussion_id: "disc-dala-01",
    post: {
      id: "post-place",
      author_label: "OBS-8RD2KC",
      is_me: false,
      body: "Nobody should go near the gate of the primary school on Kofar Mata road. The road is blocked and people are shouting.",
      state: "visible",
      hidden_body: null,
      hidden_reason: null,
      created_at: "2026-12-05T09:05:00+01:00",
    },
    reasons: ["too_specific_location"],
    name_check: { possible_names: false },
    flag_count: 2,
  },
  {
    discussion_id: "disc-fagge-02",
    post: {
      id: "post-topic",
      author_label: "OBS-7K2P9X",
      is_me: false,
      body: "Does anyone know where to buy recharge cards around Sabon Gari this afternoon?",
      state: "visible",
      hidden_body: null,
      hidden_reason: null,
      created_at: "2026-12-05T09:31:00+01:00",
    },
    reasons: ["other"],
    name_check: { possible_names: false },
    flag_count: 1,
  },
];

/** A post a moderator has already hidden (its original text is shown to moderators only). */
export const S08_HIDDEN_FLAG: ModerationFlag = {
  discussion_id: "disc-dala-01",
  post: {
    id: "post-hidden",
    author_label: "OBS-4T6WZB",
    is_me: false,
    body: null,
    state: "hidden",
    hidden_body: "Hajiya Maryam Sani told the presiding officer to let her people vote twice at unit 004.",
    hidden_reason: "names_a_person",
    created_at: "2026-12-05T07:58:00+01:00",
  },
  reasons: ["names_a_person"],
  name_check: { possible_names: true },
  flag_count: 2,
};

export const S08_AREA_STATES = [
  { state_code: "KN", name: "Kano" },
  { state_code: "KD", name: "Kaduna" },
  { state_code: "LA", name: "Lagos" },
];

export const S08_AREA_DETAIL: Record<string, StateAreasResponse> = {
  KN: {
    state_code: "KN",
    name: "Kano",
    version: "synthetic-1",
    lgas: [
      {
        lga_code: "1901",
        name: "Dala",
        wards: [
          { ward_code: "190101", name: "Dala", units: [] },
          { ward_code: "190102", name: "Gwammaja", units: [] },
          { ward_code: "190103", name: "Kofar Ruwa", units: [] },
        ],
      },
      {
        lga_code: "1902",
        name: "Fagge",
        wards: [
          { ward_code: "190201", name: "Fagge A", units: [] },
          { ward_code: "190202", name: "Sabon Gari", units: [] },
        ],
      },
      { lga_code: "1903", name: "Tarauni", wards: [{ ward_code: "190301", name: "Hotoro North", units: [] }] },
    ],
  },
};
