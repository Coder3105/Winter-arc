"use client";

import { useState } from "react";

import { SystemPanel } from "@/components/system/system-panel";
import { redirectExpiredSession } from "@/lib/auth/client-session";
interface AchievementItem {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly current: number;
  readonly target: number;
  readonly progressPercent: number;
  readonly status: string;
  readonly titleReward: string | null;
  readonly unlockedAt: string | null;
}

type AchievementSummary =
  | { readonly kind: "UNAVAILABLE"; readonly reason: string }
  | {
      readonly kind: "AVAILABLE";
      readonly unlocked: readonly AchievementItem[];
      readonly locked: readonly AchievementItem[];
      readonly titles: readonly string[];
      readonly selectedTitle: string | null;
    };

export function AchievementDashboard({
  initialSummary,
}: {
  readonly initialSummary: AchievementSummary;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (summary.kind === "UNAVAILABLE")
    return <p className="empty-state">PROFILE OR ACTIVE WINTER ARC REQUIRED</p>;

  async function selectTitle(title: string | null) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/profile/title", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: { selectedTitle: string | null };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success)
        throw new Error(payload.error?.message ?? "Title update failed.");
      setSummary((current) =>
        current.kind === "AVAILABLE"
          ? { ...current, selectedTitle: payload.data?.selectedTitle ?? null }
          : current,
      );
      window.dispatchEvent(new Event("progression:updated"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Title update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="achievement-dashboard">
      <SystemPanel
        eyebrow="IDENTITY // ACTIVE TITLE"
        title={summary.selectedTitle ?? "NO TITLE SELECTED"}
        glow
      >
        <div className="title-selector">
          <button
            type="button"
            disabled={saving || summary.selectedTitle === null}
            onClick={() => selectTitle(null)}
          >
            CLEAR TITLE
          </button>
          {summary.titles.map((title) => (
            <button
              key={title}
              type="button"
              disabled={saving || title === summary.selectedTitle}
              onClick={() => selectTitle(title)}
            >
              {title}
            </button>
          ))}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </SystemPanel>
      <SystemPanel
        eyebrow={`${summary.unlocked.length} UNLOCKED`}
        title="ACHIEVEMENT ARCHIVE"
      >
        <div className="achievement-grid">
          {[...summary.unlocked, ...summary.locked].map((item) => (
            <article
              className={item.status === "ACTIVE" ? "is-unlocked" : "is-locked"}
              key={item.key}
            >
              <span>{item.category}</span>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
              <div
                role="progressbar"
                aria-label={`${item.name} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.progressPercent}
              >
                <i style={{ width: `${item.progressPercent}%` }} />
              </div>
              <small>
                {item.status === "ACTIVE"
                  ? "UNLOCKED"
                  : `${item.current} / ${item.target}`}
                {item.titleReward ? ` // TITLE: ${item.titleReward}` : ""}
              </small>
            </article>
          ))}
        </div>
      </SystemPanel>
    </div>
  );
}
