import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Component gallery",
  robots: { index: false, follow: false },
};

/** Development-only gallery of every design-system component and state. */
export default function ComponentGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
