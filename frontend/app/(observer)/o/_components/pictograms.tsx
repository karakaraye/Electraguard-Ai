/* O-03 tiles and the Home report button: same 40 px grid and 2 px stroke as the category set. */
import { pictogram } from "../../../../ui/icons/Icon";

/** Accredited observer: an ID badge on a lanyard. */
export const BadgePictogram = pictogram(
  "BadgePictogram",
  <>
    <path d="M15 4.5 20 11l5-6.5" />
    <rect x="9.5" y="11" width="21" height="25" rx="2.5" />
    <circle cx="20" cy="20" r="4" />
    <path d="M13.5 31c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5" />
  </>,
);

/** Citizen: a person, no badge. */
export const PersonPictogram = pictogram(
  "PersonPictogram",
  <>
    <circle cx="20" cy="12" r="6" />
    <path d="M8.5 35.5c1.2-8 5.5-12.5 11.5-12.5s10.3 4.5 11.5 12.5" />
  </>,
);

/** Polling-day checklist: a clipboard with ticked lines. */
export const ChecklistPictogram = pictogram(
  "ChecklistPictogram",
  <>
    <rect x="8.5" y="7.5" width="23" height="28" rx="2.5" />
    <path d="M15 5.5h10v4H15z" />
    <path d="m13 17 2 2 3.5-3.5M21.5 17.5H27M13 26l2 2 3.5-3.5M21.5 26.5H27" />
  </>,
);

/** Result-sheet check: a posted sheet with rows of figures and a magnifier. */
export const SheetPictogram = pictogram(
  "SheetPictogram",
  <>
    <path d="M9.5 5.5h16l5 5v24h-21z" />
    <path d="M14 15h12M14 20h7M14 25h5" />
    <circle cx="26" cy="27" r="4" />
    <path d="m29 30 3.5 3.5" />
  </>,
);

/** Messages with a reviewer: two speech bubbles. */
export const MessagesPictogram = pictogram(
  "MessagesPictogram",
  <>
    <path d="M5.5 8.5h20v13h-11l-6 5v-5h-3z" />
    <path d="M28.5 15.5h6v13h-3v5l-6-5h-9v-3" />
  </>,
);

/** Discussions: three people in a ring. */
export const DiscussionsPictogram = pictogram(
  "DiscussionsPictogram",
  <>
    <circle cx="20" cy="11" r="4" />
    <circle cx="9.5" cy="20" r="3.5" />
    <circle cx="30.5" cy="20" r="3.5" />
    <path d="M13 34c.8-5.5 3.5-8.5 7-8.5s6.2 3 7 8.5M3.5 33c.6-3.8 2.8-6 6-6M36.5 33c-.6-3.8-2.8-6-6-6" />
  </>,
);

/** Ask: an open guide with a question mark. */
export const AskPictogram = pictogram(
  "AskPictogram",
  <>
    <path d="M5.5 9.5c5-2 9.5-2 14.5 1v24c-5-3-9.5-3-14.5-1zM34.5 9.5c-5-2-9.5-2-14.5 1v24c5-3 9.5-3 14.5-1z" />
    <path d="M24.5 17.5a3 3 0 1 1 4 2.8c-.9.4-1.5 1-1.5 2v.7M27 26v.5" />
  </>,
);

/** Report something: a plus in a square. */
export const ReportPictogram = pictogram(
  "ReportPictogram",
  <>
    <rect x="6.5" y="6.5" width="27" height="27" rx="3" />
    <path d="M20 13v14M13 20h14" />
  </>,
);
