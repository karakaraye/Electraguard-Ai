import Link from "next/link";
import { LegacyFrame } from "../legacy-frame";
import { currentUser } from "../../lib/session";

/** Shown by the legacy /workspace forms when a case is no longer available to the signed-in person. */
export default async function AccessChanged() {
  const user = await currentUser().catch(() => null);
  return (
    <LegacyFrame>
      <section className="panel">
        <h1>Access changed</h1>
        <p>This action is no longer available. Your session may have ended or the case may have been reassigned.</p>
        <Link href={user ? `/workspace/${user.role}` : "/sign-in"}>
          {user ? "Return to your workspace" : "Sign in"}
        </Link>
      </section>
    </LegacyFrame>
  );
}
