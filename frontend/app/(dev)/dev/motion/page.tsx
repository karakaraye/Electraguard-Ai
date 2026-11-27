import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MotionScenes } from "./scenes";
import "../../../../ui/tokens.css";
import "../../../(observer)/o/observer.css";

export const metadata: Metadata = {
  title: "Motion scenes",
  robots: { index: false, follow: false },
};

/** Development only: each interface motion on its own stage, driven by buttons, with the real components. */
export default function MotionScenesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <MotionScenes />
    </Suspense>
  );
}
