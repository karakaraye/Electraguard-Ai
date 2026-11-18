import { redirectToWorkspace } from "../lib/session";

export default async function Home() {
  await redirectToWorkspace();
}
