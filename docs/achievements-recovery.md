# Achievements, rewards, titles, and recovery — Phase 9

## Boundary and safety invariant

Phase 9 derives auditable System recognition from the existing Daily Quest, workout,
weight, calendar, and Phase 8 progression sources. It adds no new XP source and does
not modify the Phase 8 XP policy. XP events may still be revoked when their own source
fact is corrected, but a miss never creates negative XP or an additional penalty.

Recovery is constructive only. It never prescribes starvation, dehydration, sleep
deprivation, extra exercise, money loss, humiliation, or a harsher target. A
finalized missed/partial daily date is cleared by one future Perfect Day. A finalized
failed workout week is cleared by one later week meeting the normal configured
weekly target.

Personal reward configuration is **NOT IMPLEMENTED**. Reward grants in this phase
are digital System recognition only.

## Achievement policy V1

`ACHIEVEMENT_POLICY_VERSION` and the 21 ordered definitions live in
`src/server/achievements/achievement-policy.ts`. They cover first/perfect clears,
7/14/30 Perfect Day streaks, five configured-rule streaks, secured workout weeks,
levels 5/10/20, ranks A/S/S+, Days 30/60/90 with tracked participation, and a
finalized full seven-day Perfect Week. No partial final challenge week qualifies.

`AchievementUnlock` has one logical identity per owner, configuration, achievement
key, and policy version. Reconciliation atomically activates or revokes the same
record. ACTIVE unlocks alone count in normal projections. The first unlock time is
preserved across reactivation.

Earned titles are SYSTEM INITIATE, DISCIPLINED, UNBROKEN, ASCENDANT, IRON
CONSISTENCY, RISING, ELITE, APEX, and TRANSCENDENT. `UserProfile.selectedTitle` can
be null or one currently ACTIVE earned title. The server rejects locked titles and
automatically clears a selected title if its granting achievement becomes revoked.

## Rewards

`RewardGrant` identities are deterministic and unique by owner, configuration,
reward type, and reward key. Active grants cover one Daily Clear per Perfect Day,
one Perfect Week emblem per finalized qualifying week, one training-protocol grant
per secured workout week, and digital milestone emblems at levels 5, 10, 15, 20, 25,
and 30. Unsupported unclaimed grants are revoked rather than deleted. Rewards add no
XP and normal owner views expose only sanitized grant details.

## Recovery lifecycle

`RecoveryProtocol` supports PENDING, ACTIVE, COMPLETED, and CANCELLED states. Phase 9
creates ACTIVE protocols and retains completed history. New finalized failures join
the existing unresolved protocol of the same type, preventing stacked punishments.
Daily trigger keys are local calendar dates; workout trigger keys are challenge weeks.
Retry and concurrent reconciliation converge on deterministic source identities.

Today and unfinished workout weeks are provisional and never trigger recovery. A
later qualifying Perfect Day or secured workout week completes the protocol without
rewriting its triggers. Recovery records have no XP or penalty field.

## APIs and UI

All routes require the opaque owner session, accept no browser `userId`, and return
private/no-store responses: `GET /api/v1/achievements`, `PUT /api/v1/profile/title`,
`GET /api/v1/rewards`, and `GET /api/v1/recovery`.

`/achievements` shows progress and title selection. `/rewards` shows digital grants
and the personal-reward boundary. `/status` summarizes the System record. `/today`
and `/workouts` show active recovery objectives. These are secondary links; the
five-item primary navigation remains unchanged.

## Verification

Run lint, typecheck, tests, formatting validation, and production build. Verify the
new Atlas collections and unique indexes with `scripts/verify-phase9-database.ts`.
With a production server on loopback port 3211, run
`node --env-file=.env.local scripts/verify-phase9.mjs`. Verification logs no secrets,
does not seed source data, and revokes its own session in `finally`.

## Phase 10 weekly-report consumer

Reports summarize ACTIVE achievements and digital rewards granted in the weekly
period plus constructive recovery assignments and completions. Recovery may produce
a safe focus item but never changes Arc Score, XP, normal targets, or source facts.

## Phase 11 notification consumer

After Phase 9 reconciliation, new active achievements and digital rewards, completed
recovery protocols, and the final current level/rank are projected into idempotent
event notifications. Sensitive achievement names remain private to the authenticated
inbox. Active recovery may also produce one gentle time-based reminder per local
day. Disabling reminders never cancels recovery, revokes recognition, changes XP, or
rewrites source records. See [notifications.md](notifications.md).
