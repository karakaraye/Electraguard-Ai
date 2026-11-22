import type { ReactNode } from "react";
import { LegacyFrame } from "../legacy-frame";

export default function SignInLayout({ children }: { children: ReactNode }) {
  return <LegacyFrame>{children}</LegacyFrame>;
}
