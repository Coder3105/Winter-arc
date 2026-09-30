# Weekly Reports, Arc Score, and System Evaluation — Phase 10

## Boundary

Phase 10 is a read projection over the existing Daily Quest, workout, weight,
progression, achievement, reward, recovery, and assessment sources. It adds no new
XP source, target, medical judgment, notification, offline behavior, or animation.
Arc Score is a gamified consistency score only. Weight and body-composition data are
descriptive and never affect the score.

## Challenge-relative weeks and lifecycle

Reports use challenge-relative weeks: Weeks 1–12 have seven days and Week 13 has
Days 85–90. A current active week is a dynamically derived `PREVIEW`. It includes
only elapsed challenge dates, including today, and is never persisted. After a week
ends, its first read atomically creates an immutable `FINAL` snapshot.

`WeeklyReport` uses policy version 1 and the unique identity
`{ userId, winterArcConfigId, challengeWeek, reportPolicyVersion }`. Atomic
`$setOnInsert` persistence makes repeated and concurrent reads converge. Existing
snapshots are returned unchanged; source corrections do not silently rewrite a
historical report. The collection contains no private rule responses, password,
session token, or mutable total.

## Arc Score V1

Daily Discipline is the arithmetic mean of every elapsed date's evaluated Daily
Quest `completionPercent`. An elapsed date with no quest record contributes 0;
missing rule snapshots are never guessed. Today is included in a preview and future
dates are excluded. With no elapsed day, Daily Discipline and Arc Score are null.

The workout component is `min(completed distinct workout days / configured target ×
100, 100)`. Arc Score is:

```text
0.75 × Daily Discipline + 0.25 × Workout Component
```

Full precision is retained until display. Score labels are `INCOMPLETE` from 0 to
below 60, `STEADY` from 60 to below 75, `STRONG` from 75 to below 90, and
`EXCEPTIONAL` from 90 through 100. XP, level, rank, weight, body composition,
achievements, rewards, and recovery never change Arc Score.

## Report projection

The sanitized snapshot includes the period and lifecycle, Daily Discipline and day
counts, per-rule compliance from actual historical snapshots, all strongest and
attention-rule ties, configured workout mission, descriptive weight facts, optional
body-composition assessments, ACTIVE-ledger XP and historical level/rank movement,
weekly achievements and digital rewards, constructive recovery activity, a factual
daily breakdown, comparison with the prior week, deterministic observations, and
up to three safe next-week focus items.

Week 13 may report all six available days cleared but never claims a seven-day
Perfect Week. Missing weight data remains null; four measurements are required for a
weekly average to be marked sufficient. No raw habit response is copied into the
report.

## API and UI

- `GET /api/v1/reports` returns finalized summaries plus the current preview.
- `GET /api/v1/reports/week/[week]` returns one available report.
- `/reports` is the report archive and `/reports/week/[week]` is the complete view.
- `/status` links the latest available weekly evaluation.

All reads require the opaque owner session, accept no browser `userId`, and return
`Cache-Control: private, no-store`. Future, invalid, and out-of-range weeks are not
available. The five primary navigation items are Today, Calendar, Workouts,
Progress, and Reports; Profile remains accessible through the owner identity link.

## Verification

Run lint, typecheck, tests, formatting validation, and a production build. Verify the
Atlas collection and indexes with `scripts/verify-phase10-database.ts`. With the
production server on loopback port 3211, run
`node --env-file=.env.local scripts/verify-phase10.mjs`. Verification logs no
secrets, does not seed source data, and revokes its own session in `finally`.

## Phase 11 notification consumer

Only an already persisted `FINAL` weekly snapshot is eligible for a report-ready
notification. Current-week `PREVIEW` projections never trigger one. The notification
uses a deterministic challenge-week identity and a controlled link to the existing
report detail page; report generation and scoring remain unchanged. See
[notifications.md](notifications.md).
