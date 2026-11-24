import type { Metadata } from "next";
import { Suspense } from "react";
import { StartFlow } from "./StartFlow";

export const metadata: Metadata = { title: "ElectraGuard AI" };

/** O-01 Language, O-02 What this app keeps, O-03 Who are you / Sign in. */
export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartFlow />
    </Suspense>
  );
}
