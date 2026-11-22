/*
 * Incident category pictograms. 40 px grid, 2 px stroke, square caps.
 * Drawn to be recognisable without their label (design contract 4.4).
 */
import type { ComponentType } from "react";
import { pictogram, type IconProps } from "./Icon";

/** Late or missing materials: an open box with a ballot paper. */
export const MaterialsPictogram = pictogram(
  "MaterialsPictogram",
  <>
    <path d="M8 20h24v14H8z" />
    <path d="M8 20 4.5 14.5h8.5M32 20l3.5-5.5H27" />
    <path d="M14 20V6.5h12V20" />
    <path d="M17.5 11h5M17.5 15h5" />
  </>,
);

/** Equipment failure: a handheld device with a cracked screen. */
export const EquipmentPictogram = pictogram(
  "EquipmentPictogram",
  <>
    <rect x="10.5" y="4.5" width="19" height="31" rx="2.5" />
    <path d="M14 9h12v14H14z" />
    <path d="m21.5 9-3.5 5 4 3-3 6" />
    <path d="M17 29h6" />
  </>,
);

/** Queues or crowding: people standing in line. */
export const QueuePictogram = pictogram(
  "QueuePictogram",
  <>
    <circle cx="9" cy="12" r="3.5" />
    <circle cx="20" cy="10" r="3.5" />
    <circle cx="31" cy="12" r="3.5" />
    <path d="M3.5 30v-6a5.5 5.5 0 0 1 11 0v6M14.5 30v-8a5.5 5.5 0 0 1 11 0v8M25.5 30v-6a5.5 5.5 0 0 1 11 0v6" />
    <path d="M3 35h34" />
  </>,
);

/** Intimidation or violence: a raised fist. */
export const ThreatPictogram = pictogram(
  "ThreatPictogram",
  <>
    <path d="M12 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" />
    <path d="M16 9v5M20 9v5M24 9v5" />
    <path d="M12 15h7a2 2 0 0 1 0 4h-3" />
    <path d="M15 23v12M25 23v12" />
    <path d="M7 7 5 5M33 7l2-2M6.5 13H4M33.5 13H36" />
  </>,
);

/** Access barrier: a wheelchair user facing steps. */
export const AccessPictogram = pictogram(
  "AccessPictogram",
  <>
    <circle cx="12" cy="6.5" r="2.5" />
    <path d="M12 11v9h7l2.5 6" />
    <path d="M12 15h5.5" />
    <path d="M8 20.5a7 7 0 1 0 10 6" />
    <path d="M24 35v-5h4v-5h4v-5h4.5" />
  </>,
);

/** People lack information: a speech bubble with a question mark. */
export const InformationPictogram = pictogram(
  "InformationPictogram",
  <>
    <path d="M5.5 6h29v20H17l-7 6v-6H5.5z" />
    <path d="M16.5 12.5a3.5 3.5 0 1 1 5 3.15c-.9.4-1.5 1.25-1.5 2.25v.6M20 21.5v.5" />
  </>,
);

/** Misinformation seen here: a phone showing a warning, with messages spreading. */
export const MisinformationPictogram = pictogram(
  "MisinformationPictogram",
  <>
    <rect x="9" y="4.5" width="18" height="31" rx="2.5" />
    <path d="M16 8.5h4" />
    <path d="m18 13 6.5 11.5h-13z" />
    <path d="M18 17.5v3M18 22.5v.25" />
    <path d="M31 14a6 6 0 0 1 0 9M34.5 11a11 11 0 0 1 0 15" />
  </>,
);

/** Vote buying or inducement: a banknote passed into an open hand. */
export const InducementPictogram = pictogram(
  "InducementPictogram",
  <>
    <path d="M10 5h20v12H10z" />
    <circle cx="20" cy="11" r="2.5" />
    <path d="M4 27h5l5-2.5h7.5a2.5 2.5 0 0 1 0 5H16" />
    <path d="M21.5 29.5H27l6.5-5a2.4 2.4 0 0 1 3.2 3.4L29 35H4" />
  </>,
);

/** Good practice: thumbs up. */
export const GoodPracticePictogram = pictogram(
  "GoodPracticePictogram",
  <>
    <path d="M6 18h6v16H6z" />
    <path d="m12 18 6-11a3 3 0 0 1 4.8 3.4L21 16h9.5a3 3 0 0 1 2.9 3.7l-2.6 11.1A4 4 0 0 1 26.9 34H12" />
  </>,
);

/** Not sure: a question mark. */
export const NotSurePictogram = pictogram(
  "NotSurePictogram",
  <>
    <circle cx="20" cy="20" r="15.5" />
    <path d="M15 15.5a5 5 0 1 1 7.2 4.5c-1.35.65-2.2 1.9-2.2 3.4V25M20 29.5v.5" />
  </>,
);

export const incidentCategories = [
  "materials",
  "equipment",
  "queues",
  "intimidation",
  "access",
  "information",
  "misinformation",
  "inducement",
  "good-practice",
  "not-sure",
] as const;

export type IncidentCategory = (typeof incidentCategories)[number];

export const categoryPictograms: Record<IncidentCategory, ComponentType<IconProps>> = {
  materials: MaterialsPictogram,
  equipment: EquipmentPictogram,
  queues: QueuePictogram,
  intimidation: ThreatPictogram,
  access: AccessPictogram,
  information: InformationPictogram,
  misinformation: MisinformationPictogram,
  inducement: InducementPictogram,
  "good-practice": GoodPracticePictogram,
  "not-sure": NotSurePictogram,
};
