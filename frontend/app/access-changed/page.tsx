import type { Metadata } from "next";
import { AccessChanged } from "./AccessChanged";

export const metadata: Metadata = { title: "ElectraGuard AI", robots: { index: false, follow: false } };

/** Screen 50: the page someone reaches after their role changed or a case moved away from them. */
export default function AccessChangedPage() {
  return <AccessChanged />;
}
