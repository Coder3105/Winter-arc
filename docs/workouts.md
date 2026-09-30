# Workout tracker and weekly mission — Phase 6

## Boundary and Daily Quest independence

Phase 6 stores completed workout sessions and evaluates the configurable weekly
training-day target. It does not implement exercises, sets, reps, weights, personal
records, templates, calories burned, medical prescriptions, XP, rewards, or reports.
Phase 7 WeightRecord persistence is a separate module and does not enter this service.
Workout is not a Daily Quest rule and does not affect
Daily Quest completion, perfection, or daily streaks.

## WorkoutRecord

Each source record is owner/config scoped and contains the profile-local
`YYYY-MM-DD`, timezone, challenge day/week, controlled type (`STRENGTH`, `CARDIO`,
`SPORT`, `MOBILITY`, `MIXED`, or `OTHER`), optional title/notes, integer duration
from 1–1,440 minutes, completion time, and `COMPLETED` status. The server derives
ownership and challenge fields for the current day. The primary UI cannot backdate.

The `{ userId, winterArcConfigId, date }` index is deliberately non-unique. Two
sessions on one date remain two source records, but contribute one distinct training
day. Today-only deletion uses the exact record ID, authenticated owner, active
config, and local date; it cannot remove another session or another aggregate.

## Challenge-relative week semantics

Weeks are seven-day blocks from the configured challenge start, irrespective of
weekday. A Wednesday start produces Wednesday–Tuesday weeks. Days 85–90 form the
six-day Week 13. The profile timezone resolves today and stored date labels; UTC
timestamps and server locale never choose a week.

Only completed, in-range records for the same owner/config count. The engine filters
to the requested week, retains total sessions, and deduplicates their local dates.
The configured `weeklyWorkoutTarget` supplies the required days; the generic helper
does not hardcode four.

## Mission calculations and states

`workoutsRemaining = max(requiredWorkoutDays - completedWorkoutDays, 0)`.
`daysRemaining` includes the current active challenge date and uses the actual week
end; it is zero after closure. `requiredRate = workoutsRemaining / daysRemaining`.
Completion delegates to Phase 3, retaining raw overachievement and clamping display
to 100%.

State priority is deterministic:

1. `SECURED` when no workouts remain, including 5/4 or higher.
2. `FAILED` when finalized below target or completion is mathematically impossible
   (`workoutsRemaining > daysRemaining`). The latter can occur before closure and
   returns `isWeekFinalized: false`.
3. `CRITICAL` when every remaining day must be trained (`remaining === days`).
4. `NOT_STARTED` before the first training day while sufficient opportunity remains.
5. `ON_TRACK` when the remaining required rate is at most 0.5.
6. `AT_RISK` when the remaining required rate is above 0.5 but below 1.

`NO REST DAYS REMAIN` appears only for a positive CRITICAL equality. A day without a
workout during an open week is displayed as rest/available, not as a failed habit.

## Weekly workout streak

The workout streak counts consecutive finalized weeks that reached the target. An
active unsecured week is provisional and does not break the prior sequence; an
active secured week extends it immediately. A finalized failed week breaks it. The
partial final week participates normally. Current and longest values are derived on
read and never persisted.

## APIs and UI

- `POST /api/v1/workouts` creates one completed session for today.
- `GET /api/v1/workouts/today` returns today's sessions.
- `GET /api/v1/workouts/week` returns the current challenge-week mission/dashboard.
- `GET /api/v1/workouts?date=YYYY-MM-DD` provides read-only calendar detail.
- `DELETE /api/v1/workouts/[id]` corrects an exact current-day session.

All APIs require the opaque owner session, accept no browser `userId`, and return
private no-store responses. Client request locking prevents repeated form actions.
`/today` presents a separate mission panel; `/workouts` adds the challenge-relative
timeline, current-week sessions, and current/longest weekly streak. Calendar markers
and detail are read-only.

## Phase 8 progression consumer

Workout source records remain session-level, but progression reconciles a separate
date identity. At least one completed session on a profile-local date supports one
30 XP workout-day event; multiple sessions do not multiply it. The configured weekly
mission supports one 100 XP challenge-week event when its distinct-day target is
secured. Deleting the final daily session or dropping an active week below target
revokes the corresponding event; renewed qualification reactivates the same event.
No workout persistence or weekly-state formula is duplicated. See
[progression.md](progression.md).

## Phase 9 weekly recovery consumer

A finalized challenge week below the configured normal workout target can support a
consolidated workout recovery protocol. A later week that secures the same ordinary
mission completes it. Recovery does not demand extra workouts, change the target,
remove XP as punishment, or alter WorkoutRecord source data.

## Phase 10 weekly-report consumer

The report workout component uses distinct completed workout dates divided by the
configured weekly target and clamps overachievement at 100%. It supplies 25% of Arc
Score; session counts and streaks remain descriptive report fields.

## Phase 11 notification consumer

The Phase 6 weekly mission evaluator remains authoritative for smart workout
notifications. `ON_TRACK` and `SECURED` are silent. Entering `AT_RISK` or exact
no-rest-days `CRITICAL` creates one transition-keyed notification; a mathematically
impossible active week receives one informational notice and never an instruction to
exceed the configured target. Source mutations reconcile event notifications after
progression and Phase 9 convergence. See [notifications.md](notifications.md).
