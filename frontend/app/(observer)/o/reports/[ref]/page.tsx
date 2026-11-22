import { Suspense } from "react";
import { ReceiptScreen } from "./ReceiptScreen";

/** O-12 Report received (`?just-sent`). The report's data comes from the phone's outbox and index only. */
export default function ReportReceiptPage() {
  return (
    <Suspense fallback={null}>
      <ReceiptScreen />
    </Suspense>
  );
}
