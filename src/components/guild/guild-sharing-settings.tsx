"use client";

import { useState } from "react";

import type { GuildSharingSettings } from "@/lib/guild/sharing";
import { redirectExpiredSession } from "@/lib/auth/client-session";

const OPTIONS = [
  ["shareProfileSummary", "PROFILE SUMMARY", "Title and high-level Arc status."],
  ["shareCalendar", "CALENDAR", "Perfect, partial, missed, and pending days."],
  ["shareWeeklyReports", "WEEKLY REPORTS", "Sanitized weekly System evaluation."],
  ["shareProgression", "PROGRESSION", "Level, rank, and approved XP summaries."],
  ["shareWorkoutSummary", "WORKOUT SUMMARY", "Mission counts without notes."],
  ["shareWeight", "EXACT WEIGHT", "Daily and weekly weight values."],
  ["shareBodyComposition", "BODY COMPOSITION", "Assessment summary metrics."],
  ["sharePrivateHabits", "PRIVATE HABITS", "Rule rows marked private."],
] as const satisfies readonly [keyof GuildSharingSettings, string, string][];

export function GuildSharingSettingsForm({
  initial,
}: {
  readonly initial: GuildSharingSettings;
}) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="guild-sharing-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage(null);
        setError(null);
        try {
          const response = await fetch("/api/v1/guild/sharing", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(settings),
          });
          if (redirectExpiredSession(response)) return;
          const payload = (await response.json()) as {
            success: boolean;
            data?: GuildSharingSettings;
            error?: { message?: string };
          };
          if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.error?.message ?? "PRIVACY UPDATE INTERRUPTED");
          }
          setSettings(payload.data);
          setMessage("GUILD SHARING UPDATED. CHANGES APPLY IMMEDIATELY.");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "PRIVACY UPDATE INTERRUPTED");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="guild-sharing-list">
        {OPTIONS.map(([key, label, description]) => (
          <label key={key} className="guild-sharing-row">
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <input
              type="checkbox"
              checked={settings[key]}
              disabled={saving}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
            />
          </label>
        ))}
      </div>
      <p className="guild-privacy-note">
        Exact weight, body composition, and private habits begin OFF. No Fap and every
        future catalogue rule marked private remain hidden unless explicitly enabled.
      </p>
      {message ? (
        <p className="guild-feedback guild-feedback--success">{message}</p>
      ) : null}
      {error ? (
        <p className="guild-feedback guild-feedback--error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="system-button" type="submit" disabled={saving}>
        {saving ? "APPLYING…" : "SAVE SHARING POLICY"}
      </button>
    </form>
  );
}
