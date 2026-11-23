import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ObserverStateViewer } from "./viewer";
import "../../../../ui/tokens.css";
import "../../../(observer)/o/observer.css";

export const metadata: Metadata = {
  title: "Observer screen states",
  robots: { index: false, follow: false },
};

/** Development only: every observer screen O-01 … O-12 in every spec state, from local fixtures. */
export default function ObserverStatesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <ObserverStateViewer />
    </Suspense>
  );
}
