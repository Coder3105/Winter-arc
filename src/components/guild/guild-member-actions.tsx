"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { redirectExpiredSession } from "@/lib/auth/client-session";

export function GuildMemberActions({ memberId }: { readonly memberId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"REMOVE" | "BLOCK" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(action: "REMOVE" | "BLOCK") {
    const confirmed = window.confirm(
      action === "BLOCK"
        ? "Block this member and stop all Guild sharing?"
        : "Remove this member and stop all Guild sharing?",
    );
    if (!confirmed) return;
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(
        action === "BLOCK"
          ? `/api/v1/guild/members/${memberId}/block`
          : `/api/v1/guild/members/${memberId}`,
        { method: action === "BLOCK" ? "POST" : "DELETE" },
      );
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "GUILD UPDATE INTERRUPTED");
      }
      router.replace("/guild");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GUILD UPDATE INTERRUPTED");
      setBusy(null);
    }
  }

  return (
    <div className="guild-member-actions">
      {error ? (
        <p className="guild-feedback guild-feedback--error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="secondary-button"
        type="button"
        disabled={busy !== null}
        onClick={() => void mutate("REMOVE")}
      >
        {busy === "REMOVE" ? "REMOVING…" : "REMOVE FROM GUILD"}
      </button>
      <button
        className="secondary-button guild-danger-action"
        type="button"
        disabled={busy !== null}
        onClick={() => void mutate("BLOCK")}
      >
        {busy === "BLOCK" ? "BLOCKING…" : "BLOCK MEMBER"}
      </button>
    </div>
  );
}
