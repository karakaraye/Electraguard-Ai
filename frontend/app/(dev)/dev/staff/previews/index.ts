import type { ComponentType } from "react";
import * as s06 from "./s06";
import * as s07 from "./s07";
import * as s08 from "./s08";
import * as s09 from "./s09";
import * as s10 from "./s10";
import * as s11 from "./s11";
import * as s12 from "./s12";

/** One file per staff screen, so each screen's preview can change without touching the others. */
export const PREVIEWS: Record<string, { states: readonly string[]; Preview: ComponentType<{ state: string }> }> = {
  s06, s07, s08, s09, s10, s11, s12,
};
