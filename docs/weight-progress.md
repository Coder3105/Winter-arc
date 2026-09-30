# Weight persistence and transformation analytics — Phase 7

## Boundary and source ownership

Phase 7 stores genuine daily body weight and derives transformation analytics. It
does not add XP, levels, ranks, rewards, penalties, reports, notifications, calorie
targets, diet prescriptions, or offline behavior. `WeightRecord` is source data;
averages, trend, change, progress, graph points, and body-composition deltas are
calculated read models and are never persisted.

The immutable InBody120 assessment dated 14 August 2026 remains the explicit baseline
when present. It is not duplicated into WeightRecord and is never overwritten. Its
reported target is assessment data, not the user's Winter Arc goal.

## WeightRecord and canonical date

Each record stores authenticated owner/config IDs, profile-local `YYYY-MM-DD`, the
profile IANA timezone, challenge day/week, raw `weightKg`, source, first `recordedAt`,
and normal timestamps. Phase 7 daily entries use `MANUAL`. The unique compound index
is `{ userId: 1, winterArcConfigId: 1, date: 1 }`.

The server resolves the date from the injected instant and profile timezone. Browser,
Vercel, MongoDB, and UTC server dates are not authoritative. A value may be entered
at any time on the current protocol day; “Morning Weight” is a product label, not a
clock cutoff. Structural validation accepts finite values from 20–500 kg and stores
the supplied numeric precision. UI display uses one decimal place.

`PUT /api/v1/weights/today` performs atomic `findOneAndUpdate` upsert after ensuring
the unique index. Simultaneous requests use the same owner/config/date filter and
converge. An edit updates the value and `updatedAt` while preserving the original
`recordedAt`. `GET` returns the record or an explicit null; `DELETE` removes only the
authenticated owner's current local-date record. Historical entries are read-only.

## Daily Quest consistency

WeightRecord is the only editable source for `morning_weight`. A create/update safely
gets or creates today's DailyQuestRecord and sets its snapshotted response to true.
Deletion unsets the response, making it `NOT_RECORDED`, and never deletes the quest or
its other responses. Direct Daily Quest PATCH attempts for this key are rejected.

The consistency policy uses ordered idempotent writes plus reconciliation. Weight is
written first, then the quest mirrors source presence. Every today quest read repeats
that reconciliation. Retrying an interrupted upsert repeats the canonical write and
sync; retrying deletion still syncs even if the weight is already absent. The final
state therefore converges without two editable sources.

## Protected APIs and privacy

- `GET|PUT|DELETE /api/v1/weights/today`
- `GET /api/v1/weights?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/v1/weights/summary`

All resolve owner identity from the opaque persisted session, accept no browser
`userId`, return `Cache-Control: private, no-store`, and avoid logging weight values.
History requires real ordered dates and is limited to 366 inclusive calendar days.
Today mutation requires an ACTIVE protocol day; missing profile, draft, pre-start,
and completed states remain explicit and create no source records.

## Analytics projection

The service loads the explicit baseline, latest assessment, all measured assessment
history, configured goal, and sorted protocol WeightRecords. Latest current weight
prefers the most recent WeightRecord. With no daily record it may show the latest
assessment weight, explicitly labelled `BODY_COMPOSITION_ASSESSMENT`; it is never
mislabelled as today. Missing baseline leaves baseline-dependent analytics null.

The projection reuses Phase 3 without duplicating formulas:

- signed total change and percent use `calculateWeightChange` and
  `calculateWeightChangePercent`;
- goal progress uses configured `targetWeightKg`, retaining raw progress and a
  UI-clamped percentage; missing goal is `NO_TARGET`;
- rolling seven-day average uses today plus six local dates, ignores missing dates,
  and requires four samples only for the sufficiency flag;
- week-over-week compares current and previous seven-calendar-day averages;
- OLS trend uses actual date gaps, requires three points, and is labelled a
  retrospective recent trend rather than a prediction.

Graph ranges are 7D, 30D, and 90D inclusive of the current local date, plus ALL
available challenge WeightRecords. Each point exposes source weight and a calculated
seven-day average. The baseline is separate. Daily data is visible alongside the
stronger average line; missing dates are not filled.

## Body composition and UI

`compareBodyComposition` compares the explicit baseline with the latest different
assessment using measured weight, body-fat percentage, fat mass, fat-free mass,
skeletal muscle, visceral fat, and waist–hip ratio. Percentage change is expressed
in percentage points. A baseline-only history returns no comparison. Daily weight
never interpolates body fat, muscle, visceral fat, or fat mass.

`/today` places the canonical input near the top and updates quest completion only
after the server succeeds. Save failure restores the previous authoritative value;
removal requires confirmation. `/progress` shows baseline-to-current metrics, goal,
7D/30D/90D/ALL graph filters, neutral trend language, and a compact measured
assessment timeline. `/calendar` uses a subtle weight marker and read-only value in
date detail. Navigation exposes Today, Calendar, Workouts, Progress, and Reports;
Profile remains accessible through the owner identity link.

## Phase 8 Morning Weight progression

After WeightRecord synchronization, Daily Quest progression reconciliation treats
the derived `morning_weight` PASS as a 5 XP source. Deleting today's canonical weight
unsets the quest response and revokes that same date's event. Restoring the weight
reactivates it; there is no independent manual XP action and no duplicate award.
Weight values, analytics, graph data, and measured body composition never determine
rank directly. See [progression.md](progression.md).

## Phase 10 weekly-report consumer

Weekly reports show first, last, change, measurement count, and optional average
from genuine WeightRecord sources. Missing values stay null and insufficient data is
explicit. Neither weight direction nor body-composition change affects Arc Score or
System Evaluation.
