"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { SystemEvent, type SystemEventData } from "@/components/system/system-event";
import { SystemPanel } from "@/components/system/system-panel";
import { notifyProgressionUpdated } from "@/components/progression/progression-status";
import { redirectExpiredSession } from "@/lib/auth/client-session";
import { WEEKLY_WORKOUT_XP, WORKOUT_DAY_XP } from "@/lib/progression/xp-policy";
import type { WorkoutWeekSummary } from "@/server/calculations";
import type {
  WorkoutDto,
  WorkoutUnavailableReason,
} from "@/server/services/workout-service";

interface WorkoutDashboard {
  readonly kind: "AVAILABLE";
  readonly timezone: string;
  readonly localDate: string;
  readonly challengeDay: number;
  readonly durationDays: number;
  readonly todaySessions: readonly WorkoutDto[];
  readonly week: WorkoutWeekSummary;
  readonly timeline: readonly {
    readonly date: string;
    readonly challengeDay: number;
    readonly dayInChallengeWeek: number;
    readonly sessionCount: number;
    readonly hasWorkout: boolean;
    readonly temporalState: "PAST" | "TODAY" | "FUTURE";
  }[];
  readonly weekSessions: readonly WorkoutDto[];
  readonly streak: { readonly current: number; readonly longest: number };
}

type WorkoutResult =
  | WorkoutDashboard
  | { readonly kind: "UNAVAILABLE"; readonly reason: WorkoutUnavailableReason };

const UNAVAILABLE_COPY: Record<WorkoutUnavailableReason, string> = {
  PROFILE_REQUIRED: "COMPLETE OWNER PROFILE SETUP",
  CONFIGURATION_REQUIRED: "ACTIVATE YOUR WINTER ARC IN SETUP",
  PROTOCOL_NOT_STARTED: "WORKOUT PROTOCOL NOT STARTED",
  CHALLENGE_COMPLETED: "WINTER ARC COMPLETE",
};

const TYPES = ["STRENGTH", "CARDIO", "SPORT", "MOBILITY", "MIXED", "OTHER"];

function shortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function MissionMessage({ week }: { readonly week: WorkoutWeekSummary }) {
  if (week.state === "SECURED") {
    return (
      <p className="workout-message workout-message--secured">
        WEEKLY MISSION COMPLETE // {week.completedWorkoutDays} /{" "}
        {week.requiredWorkoutDays} TRAINING DAYS CLEARED
      </p>
    );
  }
  if (week.state === "FAILED") {
    return (
      <p className="workout-message workout-message--failed">
        MISSION FAILED // {week.completedWorkoutDays} / {week.requiredWorkoutDays}{" "}
        TRAINING DAYS
      </p>
    );
  }
  if (week.state === "CRITICAL") {
    return (
      <p className="workout-message workout-message--critical">
        SYSTEM WARNING // NO REST DAYS REMAIN // {week.workoutsRemaining} WORKOUTS /{" "}
        {week.daysRemaining} DAYS
      </p>
    );
  }
  return (
    <p className="workout-message">
      MISSION STATUS: {week.state.replaceAll("_", " ")} {"//"} {week.workoutsRemaining}{" "}
      WORKOUTS REMAIN {"//"} {week.daysRemaining} DAYS AVAILABLE
    </p>
  );
}

function SessionCard({
  session,
  deletable,
  pending,
  onDelete,
}: {
  readonly session: WorkoutDto;
  readonly deletable: boolean;
  readonly pending: boolean;
  readonly onDelete: (id: string) => void;
}) {
  return (
    <article className="workout-session">
      <div>
        <span>{session.type}</span>
        <h3>{session.title || session.type.replaceAll("_", " ")}</h3>
        <p>
          {session.durationMinutes} MIN{session.notes ? ` // ${session.notes}` : ""}
        </p>
      </div>
      {deletable && (
        <button type="button" disabled={pending} onClick={() => onDelete(session.id)}>
          DELETE
        </button>
      )}
    </article>
  );
}

export function WorkoutTracker({
  initialResult,
  full = false,
}: {
  readonly initialResult: WorkoutResult;
  readonly full?: boolean;
}) {
  const [dashboard, setDashboard] = useState<WorkoutDashboard | null>(
    initialResult.kind === "AVAILABLE" ? initialResult : null,
  );
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [missionEvent, setMissionEvent] = useState<SystemEventData | null>(null);
  const dismissMissionEvent = useCallback(() => setMissionEvent(null), []);

  if (!dashboard) {
    const reason =
      initialResult.kind === "UNAVAILABLE"
        ? initialResult.reason
        : "CONFIGURATION_REQUIRED";
    return (
      <SystemPanel eyebrow="MISSION // UNAVAILABLE" title="WORKOUT PROTOCOL">
        <div className="quest-unavailable">
          <strong>{UNAVAILABLE_COPY[reason]}</strong>
          <p>Workout sessions are available only during an active challenge day.</p>
        </div>
      </SystemPanel>
    );
  }

  async function submitWorkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    const previousWeekState = dashboard?.week.state;
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/workouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: form.get("type"),
          title: form.get("title"),
          durationMinutes: Number(form.get("durationMinutes")),
          notes: form.get("notes"),
        }),
      });
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: { dashboard?: WorkoutResult };
        error?: { message?: string };
      };
      if (
        !response.ok ||
        !payload.success ||
        payload.data?.dashboard?.kind !== "AVAILABLE"
      ) {
        throw new Error(payload.error?.message ?? "Workout could not be saved.");
      }
      if (
        previousWeekState !== "SECURED" &&
        payload.data.dashboard.week.state === "SECURED"
      ) {
        setMissionEvent({
          id: `mission-${payload.data.dashboard.week.challengeWeek}`,
          eyebrow: "WEEKLY MISSION COMPLETE",
          title: `${payload.data.dashboard.week.completedWorkoutDays} / ${payload.data.dashboard.week.requiredWorkoutDays} TRAINING DAYS CLEARED`,
          detail: `+${WEEKLY_WORKOUT_XP} XP`,
          accent: "ACHIEVEMENT",
        });
      }
      setDashboard(payload.data.dashboard);
      notifyProgressionUpdated();
      setShowForm(false);
      setMessage("WORKOUT RECORDED");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Workout could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function deleteWorkout(id: string) {
    if (pending || !window.confirm("Delete this workout session?")) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/workouts/${id}`, { method: "DELETE" });
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: { dashboard?: WorkoutResult };
        error?: { message?: string };
      };
      if (
        !response.ok ||
        !payload.success ||
        payload.data?.dashboard?.kind !== "AVAILABLE"
      ) {
        throw new Error(payload.error?.message ?? "Workout could not be deleted.");
      }
      setDashboard(payload.data.dashboard);
      notifyProgressionUpdated();
      setMessage("WORKOUT DELETED");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Workout could not be deleted.",
      );
    } finally {
      setPending(false);
    }
  }

  const progress = dashboard.week.completionPercent ?? 0;
  return (
    <div className="workout-tracker">
      <SystemEvent event={missionEvent} onDismiss={dismissMissionEvent} />
      <SystemPanel
        eyebrow={`WEEK ${dashboard.week.challengeWeek} // ${dashboard.week.requiredWorkoutDays}/7 MISSION`}
        title="WORKOUT PROTOCOL"
        glow
      >
        <div className="workout-mission-grid">
          <div>
            <span>TRAINING DAYS</span>
            <strong>
              {dashboard.week.completedWorkoutDays} / {dashboard.week.requiredWorkoutDays}
            </strong>
          </div>
          <div>
            <span>MISSION STATE</span>
            <strong>{dashboard.week.state.replaceAll("_", " ")}</strong>
          </div>
          <div>
            <span>WEEKLY STREAK</span>
            <strong>{dashboard.streak.current}</strong>
          </div>
        </div>
        <div className="quest-progress" aria-label={`${progress}% complete`}>
          <div>
            <span style={{ width: `${progress}%` }} />
          </div>
          <strong>
            {progress.toLocaleString("en-US", { maximumFractionDigits: 1 })}%
          </strong>
        </div>
        <MissionMessage week={dashboard.week} />
        <div className="workout-xp-strip">
          <span className={dashboard.todaySessions.length ? "is-earned" : ""}>
            WORKOUT DAY // +{WORKOUT_DAY_XP} XP
          </span>
          <span className={dashboard.week.state === "SECURED" ? "is-earned" : ""}>
            MISSION BONUS // +{WEEKLY_WORKOUT_XP} XP
          </span>
        </div>

        <button
          className="workout-log-button"
          type="button"
          onClick={() => setShowForm((value) => !value)}
          disabled={pending}
        >
          {showForm ? "CANCEL" : "LOG WORKOUT"}
        </button>

        {showForm && (
          <form className="workout-form" onSubmit={(event) => void submitWorkout(event)}>
            <label>
              <span>TYPE</span>
              <select name="type" defaultValue="STRENGTH" disabled={pending}>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>TITLE</span>
              <input
                name="title"
                maxLength={100}
                placeholder="Push Day"
                disabled={pending}
              />
            </label>
            <label>
              <span>DURATION (MIN)</span>
              <input
                name="durationMinutes"
                type="number"
                min="1"
                max="1440"
                step="1"
                inputMode="numeric"
                required
                disabled={pending}
              />
            </label>
            <label className="workout-form__wide">
              <span>NOTES (OPTIONAL)</span>
              <textarea name="notes" maxLength={2000} rows={3} disabled={pending} />
            </label>
            <button type="submit" disabled={pending}>
              {pending ? "SAVING…" : "COMPLETE WORKOUT"}
            </button>
          </form>
        )}

        {dashboard.todaySessions.length > 0 && (
          <div className="workout-session-list">
            <h3>TODAY&apos;S WORKOUTS</h3>
            {dashboard.todaySessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                deletable
                pending={pending}
                onDelete={(id) => void deleteWorkout(id)}
              />
            ))}
          </div>
        )}
        {message && (
          <p className="quest-feedback" role="status">
            {message}
          </p>
        )}
      </SystemPanel>

      {full ? (
        <>
          <SystemPanel eyebrow="CHALLENGE-RELATIVE" title="WEEK TIMELINE">
            <div className="workout-timeline">
              {dashboard.timeline.map((day) => (
                <article
                  key={day.date}
                  className={`workout-timeline__day${day.hasWorkout ? " is-trained" : ""}`}
                >
                  <span>DAY {day.dayInChallengeWeek}</span>
                  <strong>{shortDate(day.date)}</strong>
                  <em>
                    {day.hasWorkout
                      ? `${day.sessionCount} SESSION${day.sessionCount === 1 ? "" : "S"}`
                      : day.temporalState === "FUTURE"
                        ? "AVAILABLE"
                        : day.temporalState === "TODAY"
                          ? "REST / AVAILABLE"
                          : "REST"}
                  </em>
                </article>
              ))}
            </div>
          </SystemPanel>
          <SystemPanel eyebrow="CURRENT CHALLENGE WEEK" title="WORKOUT SESSIONS">
            {dashboard.weekSessions.length ? (
              <div className="workout-session-list">
                {dashboard.weekSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    deletable={session.date === dashboard.localDate}
                    pending={pending}
                    onDelete={(id) => void deleteWorkout(id)}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-state">NO WORKOUT SESSIONS THIS WEEK</p>
            )}
            <div className="workout-streak-summary">
              <span>CURRENT WEEKLY STREAK {dashboard.streak.current}</span>
              <span>LONGEST {dashboard.streak.longest}</span>
            </div>
          </SystemPanel>
        </>
      ) : (
        <Link className="workout-page-link" href="/workouts">
          OPEN WEEKLY MISSION →
        </Link>
      )}
    </div>
  );
}
