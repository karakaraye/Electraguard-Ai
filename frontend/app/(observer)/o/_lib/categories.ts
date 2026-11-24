import type { AccessBarrierDetail, Category } from "../../../../lib/api/types";
import type { IncidentCategory } from "../../../../ui/icons";

/** Wire value (REP-01 category_observer) → tile key (message o05.tile.*) and pictogram. Order is fixed (O-05). */
export const CATEGORIES: Array<{ value: Category; tile: string; pictogram: IncidentCategory }> = [
  { value: "late_materials", tile: "materials", pictogram: "materials" },
  { value: "equipment_failure", tile: "equipment", pictogram: "equipment" },
  { value: "queues_crowding", tile: "queues", pictogram: "queues" },
  { value: "intimidation_violence", tile: "intimidation", pictogram: "intimidation" },
  { value: "access_barrier", tile: "access", pictogram: "access" },
  { value: "lack_of_information", tile: "information", pictogram: "information" },
  { value: "misinformation", tile: "misinformation", pictogram: "misinformation" },
  { value: "vote_buying", tile: "inducement", pictogram: "inducement" },
  { value: "good_practice", tile: "goodPractice", pictogram: "good-practice" },
  { value: "not_sure", tile: "notSure", pictogram: "not-sure" },
];

export function categoryMeta(value: Category | null | undefined) {
  return CATEGORIES.find((item) => item.value === value) ?? CATEGORIES[CATEGORIES.length - 1];
}

/** Wire value → message key suffix under o05.access.* */
export const ACCESS_DETAILS: Array<{ value: AccessBarrierDetail; key: string }> = [
  { value: "steps_no_ramp", key: "steps" },
  { value: "distance", key: "distance" },
  { value: "no_assistance", key: "noAssistance" },
  { value: "no_large_print_braille", key: "noLargePrint" },
  { value: "no_sign_language", key: "noSignLanguage" },
  { value: "other", key: "other" },
];
