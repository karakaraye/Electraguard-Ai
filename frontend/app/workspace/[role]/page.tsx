import Link from "next/link";
import { IncidentForm } from "../observer/incident-form";
import { notFound } from "next/navigation";
import { isRole, redirectToWorkspace, sessionRequest } from "../../../lib/session";
import { SignOut } from "./sign-out";

export default async function WorkspacePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  const response = await sessionRequest(`workspaces/${role}`);
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (!response.ok) throw new Error("Could not retrieve the workspace.");
  const { title, email } = await response.json();

  return (
    <section className="panel">
      <h1>{title}</h1>
      <p>Signed in as {email}</p>
      {role === "administrator" && <p>This role manages the prototype workspace. Official electoral decisions remain with the appropriate authorities.</p>}
      {role === "administrator" &&
        <nav aria-label="Administrator workspace">
          <p><Link href="/workspace/administrator/assignments" prefetch={false}>Reviewer assignments</Link></p>
          <p><Link href="/workspace/administrator/dashboard" prefetch={false}>Observation dashboard</Link></p>
        </nav>}
      {role === "reviewer" &&
        <p><Link href="/workspace/reviewer/cases" prefetch={false}>Review queue</Link></p>}
      {role === "observer" && (
        <>
          <nav className="workspace-links" aria-label="Observer workspace">
            <Link href="/workspace/observer/reports" prefetch={false}>My Reports</Link>
          </nav>
          <IncidentForm />
        </>
      )}
      <SignOut />
    </section>
  );
}
