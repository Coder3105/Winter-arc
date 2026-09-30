"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SystemPanel } from "@/components/system/system-panel";
import { ShadowPortrait, SHADOW_SOLDIERS } from "@/components/system/shadow-portrait";
import { redirectExpiredSession } from "@/lib/auth/client-session";
import type { CalendarDaySummary } from "@/server/calculations";
import type { EvaluatedDailyQuest } from "@/server/daily-quest/evaluation";
import type { WorkoutDto } from "@/server/services/workout-service";

interface CalendarData {
  readonly kind: "AVAILABLE";
  readonly month: string;
  readonly timezone: string;
  readonly currentDate: string;
  readonly leadingMondaySlots: number;
  readonly challenge: {
    readonly startDate: string;
    readonly endDate: string;
    readonly durationDays: number;
    readonly status: "NOT_STARTED" | "ACTIVE" | "COMPLETED";
    readonly currentDay: number | null;
  };
  readonly days: readonly CalendarDaySummary[];
}

interface StreakData {
  readonly kind: "AVAILABLE";
  readonly perfectDay: { readonly current: number; readonly longest: number };
  readonly rules: Readonly<
    Record<
      string,
      { readonly name: string; readonly current: number; readonly longest: number }
    >
  >;
  readonly summary: {
    readonly perfectDays: number;
    readonly recordedDays: number;
    readonly missedDays: number;
    readonly elapsedChallengeDays: number;
  };
}

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const CALENDAR_STATE_LABEL = {
  PERFECT: "✓ PERFECT",
  PARTIAL: "PARTIAL",
  MISSED: "MISSED",
  TODAY_PENDING: "TODAY",
  FUTURE: "FUTURE",
  OUTSIDE_CHALLENGE: "OUTSIDE",
} as const;

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year!, monthNumber! - 1, 1)))
    .toUpperCase();
}

function moveMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = year! * 12 + monthNumber! - 1 + delta;
  return `${Math.floor(index / 12)
    .toString()
    .padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function displayDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year!, month! - 1, day!)))
    .toUpperCase();
}

function DetailRule({ rule }: { readonly rule: EvaluatedDailyQuest["rules"][number] }) {
  const actual =
    rule.actual === null
      ? "NOT RECORDED"
      : typeof rule.actual === "boolean"
        ? rule.actual
          ? "YES"
          : "NO"
        : `${rule.actual.toLocaleString("en-US", { maximumFractionDigits: 2 })}${rule.unit ? ` ${rule.unit.toUpperCase()}` : ""}`;
  const target =
    rule.target === null
      ? null
      : ` / ${rule.target.toLocaleString("en-US")} ${rule.unit?.toUpperCase() ?? ""}`;
  return (
    <li>
      <span>{rule.name}</span>
      <strong>
        {actual}
        {target}
      </strong>
      <em className={`quest-state quest-state--${rule.state.toLowerCase()}`}>
        {rule.state.replaceAll("_", " ")}
      </em>
    </li>
  );
}

function WorkoutDetail({ sessions }: { readonly sessions: readonly WorkoutDto[] }) {
  return (
    <div className="history-workouts">
      <h3>WORKOUT</h3>
      {sessions.length ? (
        sessions.map((session) => (
          <article key={session.id}>
            <span>{session.type}</span>
            <strong>{session.title || session.type.replaceAll("_", " ")}</strong>
            <em>{session.durationMinutes} MIN</em>
          </article>
        ))
      ) : (
        <p>NO WORKOUT</p>
      )}
    </div>
  );
}

export function CalendarHistory({
  initialCalendar,
  streaks,
}: {
  readonly initialCalendar: CalendarData;
  readonly streaks: StreakData;
}) {
  const [calendar, setCalendar] = useState(initialCalendar);
  const [selected, setSelected] = useState<CalendarDaySummary | null>(null);
  const [detail, setDetail] = useState<EvaluatedDailyQuest | null>(null);
  const [workoutDetail, setWorkoutDetail] = useState<readonly WorkoutDto[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const minimumMonth = calendar.challenge.startDate.slice(0, 7);
  const maximumMonth = calendar.challenge.endDate.slice(0, 7);

  useEffect(() => {
    if (!selected) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const sheet = sheetRef.current;
    sheet
      ?.querySelector<HTMLElement>("button, a, [tabindex]:not([tabindex='-1'])")
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(null);
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const controls = [
        ...sheet.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [selected]);

  async function loadMonth(month: string) {
    setLoadingMonth(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/calendar?month=${month}`);
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: CalendarData;
        error?: { message?: string };
      };
      if (!response.ok || !payload.success || payload.data?.kind !== "AVAILABLE")
        throw new Error(payload.error?.message ?? "Calendar unavailable.");
      setCalendar(payload.data);
      setSelected(null);
      setDetail(null);
      setWorkoutDetail([]);
      window.history.replaceState(null, "", `/calendar?month=${month}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar unavailable.");
    } finally {
      setLoadingMonth(false);
    }
  }

  async function selectDay(day: CalendarDaySummary) {
    setSelected(day);
    setDetail(null);
    setWorkoutDetail([]);
    setMessage(null);
    if (
      day.relation !== "CHALLENGE_DAY" ||
      day.temporalState === "FUTURE" ||
      day.temporalState === "TODAY"
    )
      return;
    setLoadingDetail(true);
    try {
      const [questResponse, workoutResponse] = await Promise.all([
        day.recordExists ? fetch(`/api/v1/daily-quest/${day.date}`) : null,
        fetch(`/api/v1/workouts?date=${day.date}`),
      ]);
      if (
        (questResponse && redirectExpiredSession(questResponse)) ||
        redirectExpiredSession(workoutResponse)
      )
        return;
      if (questResponse) {
        const payload = (await questResponse.json()) as {
          success: boolean;
          data?: { quest?: EvaluatedDailyQuest };
          error?: { message?: string };
        };
        if (!questResponse.ok || !payload.success || !payload.data?.quest)
          throw new Error(payload.error?.message ?? "Record unavailable.");
        setDetail(payload.data.quest);
      }
      const workoutPayload = (await workoutResponse.json()) as {
        success: boolean;
        data?: { kind?: string; sessions?: readonly WorkoutDto[] };
        error?: { message?: string };
      };
      if (!workoutResponse.ok || !workoutPayload.success)
        throw new Error(workoutPayload.error?.message ?? "Workout history unavailable.");
      setWorkoutDetail(workoutPayload.data?.sessions ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Record unavailable.");
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="calendar-history">
      <section className="calendar-hero" aria-label="Winter Arc progress">
        <div>
          <span>PROTOCOL</span>
          <strong>{calendar.challenge.status}</strong>
        </div>
        <div>
          <span>CHALLENGE DAY</span>
          <strong>
            {calendar.challenge.currentDay
              ? `${calendar.challenge.currentDay} / ${calendar.challenge.durationDays}`
              : "—"}
          </strong>
        </div>
        <div>
          <span>CURRENT STREAK</span>
          <strong>{streaks.perfectDay.current} DAYS</strong>
        </div>
      </section>

      <section className="shadow-streak" aria-label="Perfect Day streak">
        <ShadowPortrait soldier="igris" size={96} />
        <div>
          <span>IGRIS // THE UNBROKEN OATH</span>
          <h2>
            {streaks.perfectDay.current} <small>DAY STREAK</small>
          </h2>
          <p>
            One Perfect Day at a time. Your longest run: {streaks.perfectDay.longest}{" "}
            days.
          </p>
        </div>
        <div
          className="shadow-streak__chain"
          aria-label={`${Math.min(streaks.perfectDay.current, 7)} of 7 streak markers lit`}
        >
          {Array.from({ length: 7 }, (_, index) => (
            <i
              key={index}
              className={index < Math.min(streaks.perfectDay.current, 7) ? "is-lit" : ""}
              aria-hidden="true"
            />
          ))}
          <small>
            {streaks.perfectDay.current >= 7
              ? "7+ CONSECUTIVE DAYS"
              : "BUILD YOUR FIRST SEVEN"}
          </small>
        </div>
      </section>

      <section className="history-metrics" aria-label="History summary">
        <div>
          <span>PERFECT DAYS</span>
          <strong>
            {streaks.summary.perfectDays} / {streaks.summary.elapsedChallengeDays}
          </strong>
        </div>
        <div>
          <span>RECORDED</span>
          <strong>{streaks.summary.recordedDays}</strong>
        </div>
        <div>
          <span>MISSED</span>
          <strong>{streaks.summary.missedDays}</strong>
        </div>
        <div>
          <span>LONGEST STREAK</span>
          <strong>{streaks.perfectDay.longest}</strong>
        </div>
      </section>

      <SystemPanel
        className="calendar-panel"
        eyebrow="SYSTEM // WINTER ARC RECORD"
        title={monthLabel(calendar.month)}
        glow
      >
        <div className="month-controls">
          <button
            type="button"
            disabled={loadingMonth || calendar.month <= minimumMonth}
            onClick={() => void loadMonth(moveMonth(calendar.month, -1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <span>{loadingMonth ? "SYNCING…" : "MONDAY — SUNDAY"}</span>
          <button
            type="button"
            disabled={loadingMonth || calendar.month >= maximumMonth}
            onClick={() => void loadMonth(moveMonth(calendar.month, 1))}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: calendar.leadingMondaySlots }, (_, index) => (
            <span className="calendar-cell calendar-cell--blank" key={`blank-${index}`} />
          ))}
          {calendar.days.map((day) => (
            <button
              type="button"
              key={day.date}
              className={`calendar-cell calendar-cell--${day.calendarState.toLowerCase()}${day.date === calendar.currentDate ? " is-today" : ""}`}
              onClick={() => void selectDay(day)}
              aria-label={`${displayDate(day.date)}${day.challengeDay ? `, Challenge Day ${day.challengeDay}` : ""}, ${day.calendarState.replaceAll("_", " ")}${day.hasWorkout ? ", workout recorded" : ""}${day.hasWeight ? ", weight recorded" : ""}`}
              aria-pressed={selected?.date === day.date}
            >
              <strong>{Number(day.date.slice(-2))}</strong>
              {day.isPerfectDay && (
                <ShadowPortrait
                  soldier={
                    SHADOW_SOLDIERS[
                      ((day.challengeDay ?? 1) - 1) % SHADOW_SOLDIERS.length
                    ] ?? "beru"
                  }
                  size={40}
                  className="calendar-cell__shadow"
                />
              )}
              <small>{day.challengeDay ? `D${day.challengeDay}` : "·"}</small>
              <span className="calendar-cell__state" aria-hidden="true">
                {CALENDAR_STATE_LABEL[day.calendarState]}
              </span>
              {day.hasWorkout && (
                <b className="calendar-cell__workout" aria-hidden="true">
                  W
                </b>
              )}
              {day.hasWeight && (
                <b className="calendar-cell__weight" aria-hidden="true">
                  KG
                </b>
              )}
            </button>
          ))}
        </div>
        <div className="calendar-legend" aria-label="Calendar legend">
          {(["PERFECT", "PARTIAL", "MISSED", "TODAY_PENDING", "FUTURE"] as const).map(
            (state) => (
              <span key={state} className={`legend--${state.toLowerCase()}`}>
                {state.replaceAll("_", " ")}
              </span>
            ),
          )}
        </div>
      </SystemPanel>

      <SystemPanel eyebrow="SHADOW ARMY // CONSISTENCY" title="RULE STREAKS">
        <div className="streak-table">
          <div className="streak-table__header">
            <span>RULE</span>
            <span>CURRENT</span>
            <span>LONGEST</span>
          </div>
          {Object.entries(streaks.rules).map(([key, streak]) => (
            <div key={key}>
              <strong>{streak.name}</strong>
              <span>{streak.current}</span>
              <span>{streak.longest}</span>
            </div>
          ))}
        </div>
        <p className="history-note">
          Only snapshotted eligible days count. Ineligible days neither increment nor
          break a rule streak.
        </p>
      </SystemPanel>

      {selected && (
        <div
          className="history-sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            ref={sheetRef}
            className="history-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-sheet-title"
            aria-describedby="history-sheet-description"
            tabIndex={-1}
          >
            <button
              className="history-sheet__close"
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close date details"
            >
              ×
            </button>
            <p>SYSTEM RECORD</p>
            <h2 id="history-sheet-title">{displayDate(selected.date)}</h2>
            <div className="history-sheet__meta" id="history-sheet-description">
              <span>
                {selected.challengeDay
                  ? `DAY ${selected.challengeDay} / ${calendar.challenge.durationDays}`
                  : "OUTSIDE PROTOCOL"}
              </span>
              <span>
                {selected.challengeWeek ? `WEEK ${selected.challengeWeek}` : "—"}
              </span>
              <strong>{selected.calendarState.replaceAll("_", " ")}</strong>
            </div>
            <div className="history-weight">
              <span>WEIGHT</span>
              <strong>
                {selected.weightKg === null
                  ? "NOT RECORDED"
                  : `${selected.weightKg.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} KG`}
              </strong>
              <small>SOURCE DATA · READ ONLY</small>
            </div>
            {selected.temporalState === "TODAY" ? (
              <div className="history-sheet__empty">
                <strong>{"TODAY'S QUEST"}</strong>
                <p>Editing remains in the focused Daily Quest screen.</p>
                <Link className="primary-button" href="/today">
                  {"OPEN TODAY'S QUEST"}
                </Link>
              </div>
            ) : selected.temporalState === "FUTURE" &&
              selected.relation === "CHALLENGE_DAY" ? (
              <div className="history-sheet__empty">
                <strong>QUEST NOT YET AVAILABLE</strong>
                <p>Future days do not create Daily Quest records.</p>
              </div>
            ) : selected.relation !== "CHALLENGE_DAY" ? (
              <div className="history-sheet__empty">
                <strong>OUTSIDE WINTER ARC</strong>
                <p>This date is not part of the active protocol.</p>
              </div>
            ) : loadingDetail ? (
              <p className="quest-loading" role="status">
                LOADING RECORD…
              </p>
            ) : (
              <>
                {detail ? (
                  <>
                    <div className="history-sheet__completion">
                      <span>COMPLETION</span>
                      <strong>
                        {detail.completedRequiredRules} / {detail.totalRequiredRules} ·{" "}
                        {(detail.completionPercent ?? 0).toLocaleString("en-US", {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </strong>
                    </div>
                    <ul className="history-rule-list">
                      {detail.rules.map((rule) => (
                        <DetailRule key={rule.key} rule={rule} />
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="history-sheet__no-record">
                    <strong>NO DAILY QUEST RECORD</strong>
                    <p>DAILY QUEST WAS NOT RECORDED</p>
                  </div>
                )}
                <WorkoutDetail sessions={workoutDetail} />
              </>
            )}
            {message && (
              <p className="quest-feedback" role="alert">
                {message}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
