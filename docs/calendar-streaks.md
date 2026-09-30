# Calendar and streak engine — Phase 5

## Boundary

Phase 5 is a read-only historical projection over the Phase 4 Daily Quest source
records. It adds monthly navigation, date detail, perfect-day streaks, and generic
configured-rule streaks. It does not create history while reading and adds no
workout engine, XP, rank, reward, penalty, or report. Phase 7 adds only a read-only
WeightRecord overlay to this projection.

## CalendarDaySummary

The pure `CalendarDaySummary` contains the local `YYYY-MM-DD` date, optional
challenge day/week, challenge relation, temporal state, record existence, evaluated
quest status, perfect-day flag, completion, passed/required counts, and one display
state. Phase 6 adds independent `hasWorkout` and `workoutSessionCount` fields;
Phase 7 adds `hasWeight` and nullable `weightKg` overlay fields:

- `PERFECT`: an existing challenge record evaluates complete and perfect.
- `PARTIAL`: a past record exists but is not perfect.
- `MISSED`: a past challenge date has no record.
- `TODAY_PENDING`: the active local date is not perfect, with or without a record.
- `FUTURE`: a future challenge date.
- `OUTSIDE_CHALLENGE`: before Day 1 or after the inclusive final day.

`recordExists` preserves the difference between an incomplete recorded day and no
source record. Missing dates are never inserted merely to display a miss. A workout
marker never changes the Daily Quest state or perfection value. A weight marker has
the same independence and appears only for a genuine WeightRecord.

## Month aggregation and timezone authority

`aggregateCalendarMonth` accepts a strict `YYYY-MM`, explicit IANA timezone,
protocol start/duration, injected current instant, and evaluated source records. It
returns every date in the month and a deterministic Monday-through-Sunday leading
slot count. Leap months, year boundaries, and Day 1/Day 90 use the Phase 3 calendar
helpers rather than browser or elapsed-millisecond date arithmetic.

The profile timezone is authoritative. The history service normalizes the injected
instant once, computes month boundaries once, and issues one owner/config/date range
query using the existing `{ userId, winterArcConfigId, date }` compound index. Phase
6 performs one additional indexed WorkoutRecord range query for the month and
aggregates session counts in memory. Phase 7 performs one additional compound-indexed
WeightRecord range query. It never queries any source collection per day.
Months outside the protocol remain valid projections of outside dates.

## Streak policy

The perfect-day streak counts consecutive challenge days whose evaluated quest is
perfect. Past missing or imperfect days break it; future days never affect it.
Before the challenge it is zero. After completion, current means the final ending
sequence. During today, an unfinished or failed quest is provisional and therefore
does not prematurely break yesterday's finalized streak; becoming perfect extends
the sequence immediately.

Rule streaks use the same generic calculation for every snapshotted rule key. A rule
day is eligible only when that rule exists in the historical snapshot and does not
evaluate `NOT_APPLICABLE`. Absent and not-applicable days neither increment nor
break the eligible sequence. This allows a rule introduced mid-challenge to begin
at its first eligible day and preserves earlier/later configuration history. A
today `PASS` can extend the streak; today's unanswered or explicit failure remains
provisional until the local date closes.

Current and longest values are derived on read and never persisted.

## APIs and history detail

- `GET /api/v1/calendar?month=YYYY-MM` returns a private owner-scoped month.
- `GET /api/v1/streaks` returns perfect-day, per-rule, and summary counts.
- `GET /api/v1/daily-quest/[date]` remains the full existing-record detail source.

All require the opaque owner session and accept no browser `userId`. `/calendar`
loads Daily Quest detail only when `recordExists` is true, while its independent
workout detail may exist without a quest record. Missing history, future dates, and
outside dates are explained locally without causing writes. Today links to `/today`;
historical editing is not exposed.

Phase 6 history detail also calls the protected read-only workout date projection.
This permits a workout to appear even when no Daily Quest record exists. Historical
workout editing remains unavailable.

The month projection already contains the real canonical `weightKg`, so the date
sheet displays it without another request. Missing source data is labelled not
recorded. Calendar never exposes historical weight editing and never infers weight
from a quest response or body-composition assessment.

## Summary counts

Perfect and recorded counts include elapsed challenge dates, with today included
only according to its current source state. Missed count includes past no-record
challenge dates and never includes today. These labels are history summaries, not
an Arc Score or medical assessment.

## Phase 9 finalized-history consumers

Achievement and recovery reconciliation uses the same profile-local finalized-day
boundary. A full seven-day challenge week can support PERFECT WEEK only after its
last date is in the past and all seven dates are perfect. Today is never treated as
a finalized miss, and reading the calendar still creates no Daily Quest history.

## Phase 10 weekly-report consumer

Report periods reuse the challenge-relative day/week and profile-timezone semantics.
PREVIEW includes elapsed dates through today; FINAL begins only after the inclusive
week end. Week 13 contains six available days and cannot be a seven-day Perfect Week.
