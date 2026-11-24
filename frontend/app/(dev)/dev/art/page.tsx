import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArtPreview } from "./preview";
import "../../../../ui/tokens.css";
import "../../../(observer)/o/observer.css";

export const metadata: Metadata = {
  title: "Background art preview",
  robots: { index: false, follow: false },
};

/** Development only: the polling-day background art behind sample screen content. */
export default function BackgroundArtPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <ArtPreview />
    </Suspense>
  );
}
