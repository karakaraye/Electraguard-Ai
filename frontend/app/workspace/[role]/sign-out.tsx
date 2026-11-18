"use client";

import { useState } from "react";
import { authPost } from "../../../lib/auth-client";

export function SignOut() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await authPost("sign-out");
      if (response.ok) {
        window.location.replace("/sign-in");
        return;
      }
    } catch {
      // The user can retry if the API is temporarily unavailable.
    }
    setError("Sign-out failed. Try again.");
    setPending(false);
  }

  return (
    <>
      <button onClick={signOut} disabled={pending}>{pending ? "Signing out…" : "Sign out"}</button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
