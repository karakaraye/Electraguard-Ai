import { redirect } from "next/navigation";
import { currentUser } from "../../lib/session";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  const user = await currentUser();
  if (user) redirect(`/workspace/${user.role}`);
  return (
    <section className="panel">
      <h1>Sign in</h1>
      <p>ElectraGuard AI supports election observation and incident documentation alongside Nigeria’s existing electoral processes. Official electoral decisions remain with the appropriate authorities.</p>
      <SignInForm />
    </section>
  );
}
