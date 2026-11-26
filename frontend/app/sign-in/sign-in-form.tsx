"use client";

import { useState, type FormEvent } from "react";
import { authPost } from "../../lib/auth-client";

export function SignInForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = new URLSearchParams({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setError("");
    setPending(true);
    try {
      const response = await authPost("sign-in", body);
      if (response.ok) {
        window.location.replace("/workspace");
        return;
      }
      setError(response.status === 401 ? "Invalid email or password." : "Sign-in failed. Try again.");
    } catch {
      setError("Sign-in failed. Try again.");
    }
    setPending(false);
  }

  return (
    <form method="post" onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
