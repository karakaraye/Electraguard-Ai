import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiOrigin } from "./api-origin";

const roles = ["observer", "reviewer", "administrator"] as const;
export type Role = (typeof roles)[number];
type User = { email: string; role: Role };

export function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}

export async function sessionRequest(path: string) {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(`${apiOrigin}/api/${path}`, {
    headers: { cookie },
    cache: "no-store",
  });
}

export async function currentUser(): Promise<User | null> {
  const response = await sessionRequest("auth/me");
  if (response.status === 403 || response.status === 401) return null;
  if (!response.ok) throw new Error("Could not retrieve the current session.");
  const user: User = await response.json();
  return isRole(user.role) ? user : null;
}

export async function redirectToWorkspace(): Promise<never> {
  const user = await currentUser();
  redirect(user ? `/workspace/${user.role}` : "/sign-in");
}
