import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PublicStateViewer } from "./viewer";
import "../../../../ui/tokens.css";
import "../../../(public)/public.css";

export const metadata: Metadata = {
  title: "Public page states",
  robots: { index: false, follow: false },
};

/** Development only: public pages in every spec state, from local fixtures. */
export default function PublicStatesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <PublicStateViewer />
    </Suspense>
  );
}
