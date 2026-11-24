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

/** Report something: a plus in a square. */
export const ReportPictogram = pictogram(
  "ReportPictogram",
  <>
    <rect x="6.5" y="6.5" width="27" height="27" rx="3" />
    <path d="M20 13v14M13 20h14" />
  </>,
);
