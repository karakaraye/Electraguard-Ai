import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StaffStateViewer } from "./viewer";
import "../../../../ui/tokens.css";

export const metadata: Metadata = {
  title: "Staff screen states",
  robots: { index: false, follow: false },
};

/** Development only: every staff screen S-01 … S-12 in every spec state, from local fixtures. */
export default function StaffStatesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <StaffStateViewer />
    </Suspense>
  );
}
