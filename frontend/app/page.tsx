import Link from "next/link";
import { LegacyFrame } from "./legacy-frame";
import { currentUser, redirectToWorkspace } from "../lib/session";

export default async function Home({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  if ((await searchParams).access === "changed") {
    const user = await currentUser();
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
  await redirectToWorkspace();
}
