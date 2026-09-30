# Daily Quest engine — Phase 4

## Purpose and phase boundary

Phase 4 is the first persisted daily tracking workflow. It evaluates the enabled
rules from the owner's active Winter Arc configuration for one local calendar day.
It remains single-owner, but every query is scoped by the authenticated `userId`.

Phase 7 now supplies the Morning Weight rule from a genuine daily WeightRecord; the
quest aggregate stores only the synchronized response needed by the existing evaluator.
Workout is intentionally excluded because it belongs to the separate 4/7 weekly
mission. This phase also adds no calendar UI, streaks, XP, ranks,
rewards, punishments, reports, reminders, or offline behavior.

## DailyQuestRecord

`DailyQuestRecord` persists:

- authenticated owner and Winter Arc configuration IDs;
- the explicit `YYYY-MM-DD` quest date and profile timezone;
- challenge day and challenge-relative week at creation;
- an ordered snapshot of enabled daily rules;
- raw responses in an extensible map keyed by rule key;
- first completion timestamp, optional bounded daily note, and timestamps.

The compound `{ userId, winterArcConfigId, date }` index is unique. The creation
service waits for model indexes and uses atomic `findOneAndUpdate` with `$setOnInsert`
and `upsert`. If two first requests race and MongoDB returns duplicate key 11000, the
loser reads the winning record. Repeated and concurrent access therefore converge
on one daily record.

The date is resolved from the injected instant using the profile's IANA timezone and
Phase 3 calendar utilities. Vercel, MongoDB, and UTC server dates never choose the
quest day. A quest is created only for an ACTIVE protocol while its calendar status
is ACTIVE. Draft, pre-start, and completed states return explicit availability data;
they do not generate records outside the protocol.

## Rule snapshots and responses

Creation copies only enabled rule fields needed for evaluation: key, name, type,
target, unit, required frequency, and order. Workout is defensively excluded even if
misconfigured as a daily rule. Snapshots are immutable after insertion. A later
configuration change never rewrites an existing day's requirement, including a
hydration or sleep target. This predictable policy also applies before the first
response: an existing date always retains its original snapshot.

Responses are separate source inputs. Boolean/logging rules store a boolean;
numeric-minimum rules store a finite nonnegative number. Steps additionally require
a safe integer. The server verifies that the key exists in today's snapshot and that
the value matches its type. Unknown rules, negative/non-finite values, fractional
steps, and wrong types are rejected. The browser never supplies ownership.

Hydration is stored as an absolute litre value. The UI converts +250 ml to +0.25 L
and +500 ml to +0.5 L, then sends the resulting absolute amount. Buttons are disabled
during a request and the UI replaces its state with the server response. Direct edit
and reset allow correction. Targets remain configurable and are not medical advice.

No Junk Food and No Fap are configurable binary user habits. True, false, and absent
map to PASS, FAIL, and NOT_RECORDED. No Fap evaluation makes no medical or moral
claim. Nutrition is binary only; there is no calorie, macro, meal, or food database.

## Derived evaluation

`evaluateDailyQuest` is framework- and database-independent. It delegates boolean,
numeric minimum, sleep, hydration, steps, and compliance math to the Phase 3 engine.
It does not store percentages or duplicate formulas.

Each rule returns its raw actual value, snapshot target, state, raw completion
percentage, and UI-clamped completion percentage. A missing response remains
NOT_RECORDED. A malformed numeric snapshot without a target is NOT_APPLICABLE rather
than silently passing. Applicable required rules determine quest completion:

- `NOT_STARTED`: no applicable rule has recorded data on the current day;
- `IN_PROGRESS`: at least one response exists and not every rule passes today;
- `COMPLETE`: every applicable required daily rule passes;
- `MISSED`: the local quest date is in the past and it was not complete.

An explicit failed habit still leaves today's quest IN_PROGRESS because the day has
not ended. `isPerfectDay` is true only when all applicable required daily rules pass.
Workout never participates. Completion is `passed / applicable × 100` through the
central compliance helper; full precision is returned and the UI formats it.

## APIs and UI

All routes require the existing opaque owner session and return the standard API
envelope with private no-store responses:

- `GET /api/v1/daily-quest/today` resolves availability and atomically gets/creates
  today's record.
- `PATCH /api/v1/daily-quest/today` accepts `{ key, value }` and updates only today's
  snapshotted rule.
- `GET /api/v1/daily-quest/[date]` validates the calendar date and protocol range,
  then reads an existing owner-scoped record. It never fabricates history and returns
  `DAILY_QUEST_NOT_FOUND` when absent.

Arbitrary historical editing is not exposed. The evaluated read contract already
contains `date`, `status`, `isPerfectDay`, and `completionPercent` for the future
calendar phase without implementing calendar aggregation.

`/today` is server-rendered with a focused client tracker. It uses the existing
SystemPanel, black/navy surfaces, cyan borders, restrained pass/fail colors,
safe-area shell, 44px controls, two-choice habit actions, numeric entry, hydration
quick actions, progress, saving/error feedback, and inactive-protocol states. `/`
routes authenticated configured owners to `/today`; setup remains the gate for an
incomplete owner. Today, Calendar, and Profile are live navigation.

## Phase 5 history consumer

The Phase 5 calendar reuses `evaluateDailyQuest` for every existing historical
record; it does not duplicate rule or completion formulas. Month and streak reads
never upsert. A missing past challenge date is projected as a missed calendar day
with `recordExists: false`, while a recorded imperfect day remains distinguishable
as `PARTIAL`. The existing date route remains the only full historical detail source
and remains read-only. See [calendar-streaks.md](calendar-streaks.md).

## Phase 6 workout separation

Workout sessions and the configurable weekly target are evaluated by the separate
WorkoutRecord/service/calculation path. They never enter a Daily Quest snapshot,
`totalRequiredRules`, completion percentage, `isPerfectDay`, or daily streak. A rest
day therefore cannot fail the Daily Quest. `/today` presents the weekly mission
after a visual separator, not as an eighth checklist rule. See
[workouts.md](workouts.md).

## Phase 7 Morning Weight source

`morning_weight` is no longer accepted by the generic Daily Quest PATCH operation.
The `/today` screen writes `PUT /api/v1/weights/today`; the server then safely creates
today's quest when needed and synchronizes the response to true. Updating weight
keeps it true. Deleting the canonical weight unsets the response, producing
`NOT_RECORDED` rather than `FAIL`, while preserving the DailyQuestRecord and every
other response.

Daily Quest today reads also reconcile this field from WeightRecord presence. This
idempotent read-after-write strategy makes retries converge after a partial request
failure without introducing an independent browser-controlled value. Historical
quest snapshots and full date reads remain read-only. See
[weight-progress.md](weight-progress.md).

## Phase 8 progression consumer

After a successful response mutation, the evaluated quest is reconciled into the
versioned progression ledger. Each PASS supports one deterministic rule/date event;
FAIL or NOT_RECORDED revokes an existing event. A perfect evaluated quest supports
one additional 25 XP event. Corrections and repeated PASS/FAIL/PASS toggles update
the same identity, so Daily Quest state, snapshots, percentages, and streak semantics
remain unchanged while XP cannot be farmed. See [progression.md](progression.md).

## Phase 9 achievement and recovery consumers

Daily rule PASS events and Perfect Day events drive configured-rule streaks,
Perfect Day achievements, and one digital Daily Clear reward per perfect date. A
past finalized partial or missing challenge date can support a consolidated daily
recovery protocol. One later Perfect Day completes that protocol; there is no
negative XP, harsher target, or historical source rewrite.

## Phase 10 weekly-report consumer

Weekly reports evaluate existing records through this phase's pure quest evaluator.
Each elapsed day's completion contributes to Daily Discipline; a missing whole day
contributes zero without creating a record. Rule-specific compliance uses only rules
present in that date's immutable snapshot, so it never guesses historical policy.

## Phase 11 notification consumer

Daily Quest writes continue to persist and reconcile their Phase 8/9 sources first,
then idempotently reconcile event notifications. Time-based evaluation reads the
current immutable rule snapshot. Its external-safe reminder reports only aggregate
completion; sensitive habits are never individually named, and an explicitly failed
binary habit is not treated as a naggable actionable item. Hydration and steps use
the snapshot's actual target, while Morning Weight remains derived only from a
canonical WeightRecord. See [notifications.md](notifications.md).
