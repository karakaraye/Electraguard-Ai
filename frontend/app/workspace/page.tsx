import { redirectToWorkspace } from "../../lib/session";

/**
 * Staff landing after sign-in: forwards to the signed-in person's workspace, or to sign-in.
 * It used to live at "/", which is now the public home (P-02).
 */
export default async function WorkspaceHome() {
  await redirectToWorkspace();
}
