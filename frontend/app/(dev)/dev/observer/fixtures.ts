/*
 * Development-only fixtures for the observer state viewer. Synthetic values for
 * layout review; never imported by a production route.
 */
import type { StateAreasResponse } from "../../../../lib/api/types";

export const FIXTURE_CODE = "OBS-7K2P9X";
export const FIXTURE_RECEIPT = "EG-4H7Q-92KD";
export const FIXTURE_RECEIVED_AT = "2026-12-05T09:14:31+01:00";
export const FIXTURE_OCCURRED_AT = "2026-12-05T09:05:00+01:00";

export const FIXTURE_STATES = [
  { state_code: "KN", name: "Kano" },
  { state_code: "LA", name: "Lagos" },
  { state_code: "OY", name: "Ọ̀yọ́" },
];

export const FIXTURE_AREAS: Record<string, StateAreasResponse> = {
  KN: {
    state_code: "KN",
    name: "Kano",
    version: "fixture",
    lgas: [
      {
        lga_code: "KN-04",
        name: "Dala",
        wards: [
          {
            ward_code: "KN-04-07",
            name: "Kantudu",
            units: [
              ["KN-04-07-012", "Kantudu Primary School I"],
              ["KN-04-07-013", "Kantudu Primary School II"],
            ],
          },
          { ward_code: "KN-04-08", name: "Gwammaja", units: [["KN-04-08-001", "Gwammaja Open Space"]] },
        ],
      },
    ],
  },
};

export const FIXTURE_PLACE = "Kantudu Primary School I, Kantudu, Dala";

export const FIXTURE_TEXT =
  "Young men stood at the gate of the polling unit and told people in the queue to go home. Two women left the queue. The presiding officer did not come out. It was still happening when I left at about 9 o'clock.";

export const FIXTURE_LONG_TEXT = Array.from({ length: 8 }, (_, i) => `${i + 1}. ${FIXTURE_TEXT}`).join("\n");

export const FIXTURE_NAME_TEXT = "Mr Okafor gave money to voters near the gate.";

/** A tiny grey square as a photo preview (data URL, no network). */
export const FIXTURE_PREVIEW =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" fill="#c9c9c6"/><path d="M8 56 28 32l14 16 8-10 14 18z" fill="#5f5f63"/></svg>');
