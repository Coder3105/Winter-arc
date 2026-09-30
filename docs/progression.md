# XP, levels, ranks, and progression - Phase 8

## Boundary

Phase 8 adds deterministic Winter Arc gamification. XP, level, and rank describe
challenge progression only; they are not medical, health, body-composition, or
fitness assessments. This phase adds no rewards, punishments, recovery quests,
achievements, reports, notifications, or negative XP.

## Authoritative ledger

`ProgressionEvent` is the source of truth. Each event stores authenticated owner and
protocol IDs, typed source and event categories, a deterministic source key, optional
source document/date, challenge day/week, integer XP, ruleset version, status,
first-earned time, optional revocation time, and timestamps.

The unique identity is `{ userId, winterArcConfigId, sourceType, sourceKey }`.
Examples are `daily-rule:2026-10-05:sleep`, `perfect-day:2026-10-05`,
`workout-day:2026-10-05`, and `workout-week:4:secured`. Atomic upsert plus the unique
index makes retries and concurrent reconciliation converge on one event.

An `ACTIVE` event contributes its snapshotted XP. A `REVOKED` event contributes zero
but remains available for audit. Reactivation changes the same event back to ACTIVE,
clears `revokedAt`, and preserves its original `earnedAt`, `xp`, `ruleVersion`, and
`createdAt`. No mutable total-XP counter is authoritative.

## XP policy V1

`PROGRESSION_RULE_VERSION` is 1. Policy values live in one browser-safe module and
are copied into each new event:

| Source                         |  XP |
| ------------------------------ | --: |
| Morning Weight                 |   5 |
| Sleep                          |  15 |
| Hydration                      |  10 |
| No Junk Food                   |  20 |
| No Fap                         |  20 |
| Steps                          |  10 |
| Nutrition                      |  15 |
| Perfect Day                    |  25 |
| Distinct Workout Day           |  30 |
| Secured Weekly Workout Mission | 100 |

An unknown future daily-rule key receives zero XP and does not fail reconciliation.
Adding a new earnable rule therefore requires an explicit policy version. Historical
events retain their stored V1 value if a later policy changes.

Today's maximum Daily Quest XP is calculated from its immutable rule snapshot. The
default seven-rule snapshot provides 95 rule XP plus the 25 XP perfect bonus, or 120
XP. Disabled rules are absent and reduce the possible total; current configuration
never reinterprets an older snapshot.

## Reconciliation and reversibility

Daily Quest response writes reconcile all snapshotted rule PASS states and the
perfect-day result. Weight PUT/DELETE first synchronizes the genuine WeightRecord to
`morning_weight`, then the same quest reconciliation activates or revokes its 5 XP.
There is no manual morning-weight XP path.

Workout creation/deletion reconciles both the local date and challenge week. One or
more completed sessions on a date support exactly one 30 XP workout-day event.
Deleting the last session revokes it. Four distinct dates for a configured 4/7
mission support one 100 XP weekly event; dropping below target revokes it. Passing
again reactivates the same identity.

Source writes occur first and idempotent ledger convergence follows. A transient
failure can leave the source ahead of the ledger, but retrying the mutation or the
relevant today read converges without a distributed transaction. This matches the
Phase 7 WeightRecord-to-DailyQuest consistency strategy. Same-day corrections may
reduce total XP, level, and rank because unsupported XP is not retained.

## Level and rank calculations

Pure calculations under `src/server/calculations/progression` have no database,
framework, session, or clock dependency. Level 1 begins at 0 XP. Advancing from level
`L` requires `100 + 20 * (L - 1)` XP. With `n = L - 1`, cumulative XP to reach level
`L` is `100n + 10n(n - 1)`, equivalently `10n^2 + 90n`. Level resolution selects the
highest threshold not greater than total active XP and returns current-level start,
next threshold, XP into the level, required XP, remaining XP, and percentage. There
is no level cap.

Ranks map only from level: E 1-5, D 6-10, C 11-15, B 16-20, A 21-25, S 26-30, and
S+ 31 or higher. The projection also exposes the next rank and levels remaining.
Inputs must be nonnegative safe-integer XP and positive safe-integer levels.

## Read API and UI

`GET /api/v1/progression` requires the opaque owner session, accepts no browser
`userId`, and returns `Cache-Control: private, no-store`. Its service sums ACTIVE
events for the active protocol and derives level, rank, today's Daily Quest and
total XP, current challenge-week XP, four source categories, and the 12 most recent
active events. Mongo IDs, session data, source response values, and revoked events
are not exposed in the normal UI.

`/today` links its compact level/rank/XP status card to `/status`, shows rule XP and
the perfect-day bonus, and refreshes the projection after successful mutations.
`/workouts` identifies the distinct-day and secured-mission XP. `/profile` has a
compact System Identity link. `/status` contains the full progress bar, next level,
next rank, source breakdown, recent activity, and an explicit gamification-only
disclaimer. `/progress` remains physical transformation analytics. The five-item
primary navigation and clean calendar grid remain unchanged.

Private habit responses and weight values are never written to progression logs.
Diagnostics use sanitized categories, while the owner-scoped ledger stores only the
logical source identity and qualification result needed for audit.

## Phase 9 consumers

Phase 9 reads ACTIVE ledger facts to derive achievement progress, digital reward
grants, and safe recovery state. It never adds bonus XP and never writes a negative
XP event. `/status` includes the selected earned title, achievement/reward counts,
latest achievement, and active recovery state. The Phase 8 XP table and level/rank
formula remain unchanged. See [achievements-recovery.md](achievements-recovery.md).

## Phase 10 weekly-report consumer

Reports reconstruct weekly XP and historical level/rank movement from ACTIVE ledger
events. These values are descriptive and excluded from Arc Score. FINAL snapshots
preserve what the versioned report saw without introducing a mutable XP total.
