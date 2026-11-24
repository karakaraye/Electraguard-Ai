"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ReceiptScreen } from "./ReceiptScreen";
import { ReportDetailScreen } from "./ReportDetailScreen";

function ReportRoute() {
  const search = useSearchParams();
  // O-12 right after sending (and for the citizen receipt fallback); O-14 otherwise.
  return search.has("just-sent") || search.get("as") === "citizen" ? <ReceiptScreen /> : <ReportDetailScreen />;
}

/** O-12 Report received (`?just-sent`) and O-14 Report detail. */
export default function ReportPage() {
  return (
    <Suspense fallback={null}>
      <ReportRoute />
    </Suspense>
  );
}
