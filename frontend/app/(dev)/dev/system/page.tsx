import { Suspense } from "react";
import { SystemPreview } from "./SystemPreview";

/** Development only: every screen 50 system page, picked with ?state=. */
export default function SystemPreviewPage() {
  return (
    <Suspense fallback={null}>
      <SystemPreview />
    </Suspense>
  );
}
