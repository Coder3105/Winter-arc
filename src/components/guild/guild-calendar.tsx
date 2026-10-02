"use client";

import { useState } from "react";

import { SystemPanel } from "@/components/system/system-panel";
import { Avatar } from "@/components/profile/avatar";
import { redirectExpiredSession } from "@/lib/auth/client-session";
import type { getGuildMemberCalendarProjection } from "@/server/services/guild-projection-service";

type CalendarResult = Awaited<ReturnType<typeof getGuildMemberCalendarProjection>>;
type GuildCalendarData = Extract<CalendarResult, { kind: "AVAILABLE" }>;
type GuildCalendarDay = GuildCalendarData["days"][number];

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1));
  return `${String(next.getUTCFullYear()).padStart(4, "0")}-${String(
    next.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

export function GuildCalendar({
  memberId,
  initialCalendar,
}: {
  readonly memberId: string;
  readonly initialCalendar: GuildCalendarData;
}) {
  const [calendar, setCalendar] = useState(initialCalendar);
  const [selected, setSelected] = useState<GuildCalendarDay | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(month: string) {
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      const response = await fetch(
        `/api/v1/guild/members/${memberId}/calendar?month=${encodeURIComponent(month)}`,
      );
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: GuildCalendarData;
        error?: { message?: string };
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? "CALENDAR LINK INTERRUPTED");
      }
      setCalendar(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CALENDAR LINK INTERRUPTED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="calendar-history guild-calendar">
      <div className="guild-member-heading">
        <Avatar avatarKey={calendar.member.avatarKey} size={48} />
        <strong>{calendar.member.displayName}</strong>
      </div>
      <SystemPanel
        className="calendar-panel"
        eyebrow="GUILD // SHARED CALENDAR"
        title={calendar.month}
      >
        <div className="month-controls">
          <button
            type="button"
            aria-label="Previous month"
            disabled={busy}
            onClick={() => void load(shiftMonth(calendar.month, -1))}
          >
            ‹
          </button>
          <span>{busy ? "SYNCING…" : calendar.member.displayName}</span>
          <button
            type="button"
            aria-label="Next month"
            disabled={busy}
            onClick={() => void load(shiftMonth(calendar.month, 1))}
          >
            ›
          </button>
        </div>
        {error ? (
          <p className="guild-feedback guild-feedback--error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="calendar-weekdays" aria-hidden="true">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: calendar.leadingMondaySlots }, (_, index) => (
            <span key={`blank-${index}`} className="calendar-cell calendar-cell--blank" />
          ))}
          {calendar.days.map((day) => (
            <button
              key={day.date}
              type="button"
              className={`calendar-cell calendar-cell--${day.calendarState.toLowerCase()}`}
              aria-label={`${day.date}: ${day.calendarState.replaceAll("_", " ")}`}
              aria-pressed={selected?.date === day.date}
              onClick={() => setSelected(day)}
            >
              <strong>{Number(day.date.slice(-2))}</strong>
              <span className="calendar-cell__state">
                {day.calendarState.replaceAll("_", " ")}
              </span>
              {"hasWorkout" in day && day.hasWorkout ? <small>TRAINING</small> : null}
            </button>
          ))}
        </div>
        <div className="calendar-legend">
          <span className="legend--perfect">PERFECT</span>
          <span className="legend--partial">PARTIAL</span>
          <span className="legend--missed">MISSED</span>
          <span className="legend--today_pending">TODAY</span>
          <span className="legend--future">FUTURE</span>
        </div>
      </SystemPanel>

      {selected ? (
        <SystemPanel eyebrow="GUILD // DATE DETAIL" title={selected.date}>
          <dl className="detail-list detail-list--columns">
            <div>
              <dt>STATE</dt>
              <dd>{selected.calendarState.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>CHALLENGE DAY</dt>
              <dd>{selected.challengeDay ?? "OUTSIDE"}</dd>
            </div>
            <div>
              <dt>DAILY COMPLETION</dt>
              <dd>
                {selected.completionPercent === null
                  ? "NOT AVAILABLE"
                  : `${selected.completionPercent.toFixed(0)}%`}
              </dd>
            </div>
            {"workoutSessionCount" in selected ? (
              <div>
                <dt>WORKOUT SESSIONS</dt>
                <dd>{selected.workoutSessionCount}</dd>
              </div>
            ) : null}
            {"weightKg" in selected ? (
              <div>
                <dt>SHARED WEIGHT</dt>
                <dd>
                  {selected.weightKg === null
                    ? "NOT RECORDED"
                    : `${selected.weightKg} kg`}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="guild-privacy-note">
            Individual Daily Quest responses and private habit states are not included.
          </p>
        </SystemPanel>
      ) : null}
    </div>
  );
}
