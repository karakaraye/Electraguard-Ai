import type { Metadata } from "next";
import { SessionEnded } from "./SessionEnded";

export const metadata: Metadata = { title: "ElectraGuard AI", robots: { index: false, follow: false } };

/** Screen 50: shown when a signed-in session ends (expiry, sign-out elsewhere, revoked access). */
export default async function SessionEndedPage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const who = (await searchParams).for === "observer" ? "observer" : "staff";
  return <SessionEnded who={who} />;
}
