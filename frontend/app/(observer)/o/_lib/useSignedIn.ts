"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useObserverSession, type ObserverSession } from "./session";

/** The signed-in observer, or null while loading; sends a phone with no session to O-03. */
export function useSignedIn(): { session: ObserverSession | null; expired: boolean } {
  const router = useRouter();
  const { session, ready, expired } = useObserverSession();
  useEffect(() => {
    if (ready && !session) router.replace("/o/start");
  }, [ready, session, router]);
  return { session, expired };
}
