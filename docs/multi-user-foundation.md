# Multi-user foundation — V2.1

## Scope

V1 used one bootstrapped owner, but its personal collections already stored
`userId`. V2.1 turns that owner document into a durable multi-user account entity,
keeps all existing IDs and personal data in place, and makes scheduler/session/push
behavior safe for independent accounts. It adds no public signup, OTP, Resend,
onboarding, Guild, avatar, install-banner, or email-scheduler feature.

## Account and migration

The existing `owners` collection remains authoritative. The migration adds only:

- canonical `emailNormalized`;
- `ACTIVE`, `PENDING_VERIFICATION`, or `DISABLED` status;
- nullable `emailVerifiedAt`;
- immutable `isOriginalOwner` metadata;
- unique canonical-email and one-original-owner indexes.

An active V1 account becomes ACTIVE; an inactive V1 account becomes DISABLED. The
account whose normalized email matches `OWNER_EMAIL` is the original account.
`emailVerifiedAt` becomes null because V1 recorded no verification instant. No
password, `_id`, session, relationship, profile field, measurement, history, title,
configuration, or preference is rewritten.

Run the preflight first:

```powershell
npm run migrate:v2.1
```

It reads account metadata, detects invalid accounts, ambiguous original ownership,
canonical-email collisions, and incompatible named indexes, then prints only
sanitized counts. It performs no writes. After a clean preflight, apply explicitly:

```powershell
npm run migrate:v2.1 -- --apply
```

Apply uses guarded updates, creates the two indexes, re-runs the plan, and compares
a database fingerprint that excludes only the four new account metadata fields. It
stops on concurrent changes rather than claiming preservation. Re-running preflight
after success reports zero accounts needing metadata. Conflicts are never deleted or
silently merged.

After apply, the read-only live audit checks canonical accounts, the preserved
original account, existing personal-document ownership, and deployed unique indexes:

```powershell
npm run verify:v2.1:database
```

The legacy `bootstrap:owner` path is now an empty-database-only original-owner tool.
It cannot seed the V1 InBody baseline for a future account. Internal future-account
creation also refuses to run until the exact canonical-email unique index exists.

## Ownership graph and blank accounts

Each account may independently own one profile and many sessions, configurations,
Daily Quest records, workouts, weights, progression events, achievements, rewards,
recovery protocols, weekly reports, notifications, and push subscriptions. Global
policy remains shared code: XP values, ranks, achievement definitions, scoring,
rule catalogue, and UI theme.

A newly created internal account contains only explicit account inputs. It begins
without a profile, timezone, height, weight, target, baseline, protocol, selected
rules, start date, history, XP, titles, rewards, reports, notifications, or push
device. Existing services therefore return `PROFILE_REQUIRED` or the equivalent
unavailable projection until later onboarding supplies that user's own inputs.

## Query and unique-index audit

All personal route ownership originates in the authenticated session. Service reads,
writes, upserts, deletes, and exact-ID mutations include `userId`; compound resources
also include their configuration/date/week identity. The audit found no production
`findById(id)` personal lookup.

| Resource                  | Per-user identity / access rule                                        |
| ------------------------- | ---------------------------------------------------------------------- |
| UserProfile               | unique `userId`                                                        |
| OnboardingDraft           | unique `userId`; deleted after activation                              |
| WinterArcConfig           | queries and index begin with `userId`                                  |
| BodyCompositionAssessment | `userId`; baseline uniqueness includes user/config                     |
| DailyQuestRecord          | unique user + config + local date                                      |
| WorkoutRecord             | user + config + date range; session IDs are not global access keys     |
| WeightRecord              | unique user + config + local date                                      |
| ProgressionEvent          | unique user + config + source type + source key                        |
| AchievementUnlock         | unique user + config + achievement + policy version                    |
| RewardGrant               | unique user + config + reward type + reward key                        |
| RecoveryProtocol          | unique user/config/type/source identities                              |
| WeeklyReport              | unique user + config + challenge week + policy version                 |
| NotificationPreferences   | unique `userId`                                                        |
| NotificationRecord        | unique user/config/dedupe/policy identity; exact IDs also require user |
| PushSubscriptionRecord    | globally unique endpoint hash plus immutable user ownership            |

Two users may use the same local date, challenge week, logical source key, or report
week because every relevant unique identity includes `userId`. The globally unique
push endpoint is the exception: a browser endpoint cannot be silently transferred.
A collision for another user returns a conflict, and unsubscribe is scoped to the
authenticated user and endpoint hash.

## Push and scheduler lifecycle

Logout does not transfer or delete device ownership. A later account on the same
browser cannot register over the old user's globally unique endpoint. Push payloads
carry a one-way intended-user binding solely for local comparison; before showing detailed
copy, the service worker calls the private no-store session endpoint. If the browser
is logged out, offline, or logged into another user, it displays generic text and a
generic notifications destination. The intended account can explicitly unsubscribe
its device later. V2.2 may add account-switch UX but must retain these rules.

The scheduler now iterates every ACTIVE account in stable ID order with a cursor.
One user's evaluation failure is counted and does not prevent other users from being
evaluated. This is foundation only: no production cron or email reminder is added.

## Verification policy

Synthetic fixtures cover two sessions and two users across profile, configuration,
body composition, Daily Quest mutation/history, calendar, workouts, weights, XP,
achievements, rewards, recovery, weekly reports, notifications, and push ownership.
They include equal dates, weeks, and progression source keys, exact-ID denial,
disabled/pending accounts, malformed/expired/revoked sessions, blank accounts,
migration idempotence, and password compatibility. Fixtures never enter the real
owner dataset.

V2.2 consumes this foundation for verified registration and email-code login. V2.3
then gives each blank account an isolated, explicitly saved onboarding draft and an
idempotent activation path. No profile/configuration or source document is copied
from another account. The original account's profile, protocol, selected rules,
targets, start date, and progression ledger are not rewritten. OTP documents contain
no profile data and cannot grant access to a different normalized email, purpose, or
request ID. Guild remains V2.4.

With a production server on loopback port 3211, the authenticated responsive smoke
test checks the today route at 390px and 1024px and revokes its own session:

```powershell
npm run verify:v2.1:responsive
```

## V2.4 bilateral authorization edge

Guild adds a bilateral authorization edge without weakening ownership. A member ID is
only a requested view target: the server must find the one canonical ACTIVE
`GuildConnection` between requester and target before any projection. Removal or block
changes that one record and therefore revokes both directions immediately. Email alone
never authorizes friend data.
