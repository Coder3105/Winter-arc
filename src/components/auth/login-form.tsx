"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export function LoginForm({ redirectTo = "/" }: { readonly redirectTo?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });

      if (!response.ok) {
        setError("Invalid email or password.");
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("System access is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="system-form" onSubmit={handleSubmit}>
      <label className="system-field">
        <span>EMAIL</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="system-field">
        <span>PASSWORD</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}
      <button className="system-button" type="submit" disabled={pending}>
        <span>{pending ? "VERIFYING" : "ENTER SYSTEM"}</span>
        <span className="system-button__arrow" aria-hidden="true">
          →
        </span>
      </button>
    </form>
  );
}
