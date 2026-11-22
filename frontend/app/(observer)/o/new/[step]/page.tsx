import { Suspense } from "react";
import { STEPS } from "../../../../../lib/drafts";
import { IncidentFlow } from "./IncidentFlow";

/** The seven steps are known in advance, so each is a static page that works from the offline cache. */
export function generateStaticParams() {
  return STEPS.map((step) => ({ step }));
}

export const dynamicParams = false;

/** O-05 … O-11 incident steps. */
export default function IncidentStepPage() {
  return (
    <Suspense fallback={null}>
      <IncidentFlow />
    </Suspense>
  );
}
