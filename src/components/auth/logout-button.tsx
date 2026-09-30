"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BeruLoader } from "@/components/system/beru-loader";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401)
        throw new Error("Exit failed. Please try again.");
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not close your session. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="system-exit" aria-busy={pending}>
      {pending && <BeruLoader compact message="Closing your session…" />}
      <button
        className="system-exit__button"
        type="button"
        onClick={logout}
        disabled={pending}
      >
        <span aria-hidden="true">×</span>
        {pending ? "EXITING…" : "EXIT"}
        <small>{pending ? "PLEASE WAIT" : "CLOSE SESSION"}</small>
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
