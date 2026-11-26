import type { Metadata } from "next";
import { IntakePaused } from "./IntakePaused";

export const metadata: Metadata = { title: "ElectraGuard AI" };

/** Screen 50: full page for citizens while the organisation has paused new reports. */
export default function PausedPage() {
  return <IntakePaused />;
}
