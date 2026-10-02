# Winter Arc Architecture

## Modular monolith

Winter Arc is one Next.js application and one Vercel deployment. The App Router
serves both the web interface and versioned REST endpoints. This keeps deployment
simple while preserving module boundaries that can grow independently.

## Application and API layers

- `src/app` owns routes, metadata, global styles, and composition.
- `src/app/api/v1` is the public REST boundary. Responses use a shared typed envelope.
- `src/components` contains generic presentation and layout building blocks.
- `src/features` reserves isolated vertical modules for later phases.
- `src/lib` contains browser-safe constants, utilities, validation, and environment
  schema definitions.
- `src/server` contains server-only database, service, calculation, model, and error
  layers.

Route handlers should remain thin: validate input, call a service, and translate the
result through shared response/error helpers. Business decisions do not belong in
route files or React components.

## MongoDB and Mongoose lifecycle

`src/server/db/mongoose.ts` is the only connection entry point. It validates the
server environment on demand, connects with the configured database name, and caches
both the active Mongoose instance and an in-progress promise on `globalThis`. This
prevents duplicate connections during development hot reload and reuses connections
across warm serverless invocations.

The Phase 1 health service obtains the established connection and issues MongoDB's
non-destructive admin ping. It does not create collections or modify documents.
Connection errors are translated into a sanitized `DATABASE_UNAVAILABLE` response.

## Server and client boundary

MongoDB, Mongoose, environment secrets, persistence, and business services are
server-only and import the `server-only` guard. Pure calculation modules intentionally
have no framework imports and remain independently runnable in Node/Vitest. They are
consumed by server services/components; no client component imports them. Client
components may call HTTP routes and hold browser-safe presentation state, but never
import from `src/server` or read server environment values.

The landing screen fetches `/api/v1/health`; therefore its database state reflects
the server without exposing credentials or infrastructure details.

## Deterministic calculation layer (Phase 3)

`src/server/calculations` contains pure body formulas, weight analytics,
challenge-calendar helpers, compliance primitives, shared validation/rounding and
a source-preserving summary projection. It has no database, session, React or clock
dependency. Calendar labels use shared strict parsing; instants are normalized with
an explicit timezone. Formula failures use typed CalculationError; legitimate
missing data uses documented null results. Formula outputs retain full precision.

`calculation-summary-service.ts` loads owner-scoped profile/config/baseline/latest
assessment data and injects the clock. The protected summary route resolves the owner
from the persisted session, accepts no browser userId, and disables response caching.
The profile uses the same service and rounds only in its read-only metrics panel.
Reported source values and calculated estimates are separate response fields. No
derived values are persisted, and no assessment is overwritten. Detailed formula,
date, sufficiency, demographic and missing-data contracts are in
[calculations.md](calculations.md).

## Calendar history and streaks (Phase 5)

`history-service.ts` loads the authenticated owner's explicit profile timezone and
active protocol, then performs one compound-indexed date-range query for a calendar
month or one for the protocol streak projection. It evaluates existing records with
the Phase 4 evaluator. Missing past dates remain absent in MongoDB and are projected
as missed only in the read model.

Pure modules under `src/server/calculations/history` build Monday-first month data
and calculate current/longest streaks from plain inputs. The active local day is
provisional: a pass may extend a streak, while an incomplete or failed today does
not break the finalized sequence until the date becomes past. Per-rule eligibility
comes from each immutable historical rule snapshot. Details and state mappings are
in [calendar-streaks.md](calendar-streaks.md).

The calendar and streak APIs resolve ownership from the opaque session, accept no
browser owner ID, return private no-store responses, and expose projections rather
than MongoDB internals. Historical detail reuses the read-only Phase 4 date route.

## Workout tracking (Phase 6)

`WorkoutRecord` stores one completed session, so multiple legitimate sessions can
share the same owner/config/local date. Its non-unique compound range index supports
today, challenge-week, and calendar-month reads. `workout-service.ts` owns profile
timezone resolution, active-day gating, owner scoping, exact today-only correction,
and DTO projection. Workout notes never enter logs or public caches.

Pure modules under `src/server/calculations/workouts` derive challenge-relative week
boundaries, distinct training days, required-rate states, and weekly streaks. These
modules do not import MongoDB, sessions, React, or the clock. The `/today` workout
panel and `/workouts` screen consume this separate projection; Daily Quest rules,
completion, perfection, and streaks remain unchanged. See [workouts.md](workouts.md).

## Weight persistence and progress (Phase 7)

`WeightRecord` is source data for one authenticated owner, protocol, and profile-local
calendar date. A unique `{ userId, winterArcConfigId, date }` index plus atomic upsert
makes concurrent saves converge on one record. Corrections change `weightKg` and
`updatedAt` while preserving the first `recordedAt`; the primary UI can modify or
remove only today's record.

`weight-service.ts` owns timezone resolution, active-day gating, owner scoping,
history bounds, DTO projection, and the consistency handshake with Daily Quest.
`morning_weight` is no longer independently editable: every today quest read
reconciles it to WeightRecord presence, create/update sets it to true, and deletion
unsets it. The ordered idempotent operations converge after retries without turning
a missing source into explicit false.

Pure Phase 3 functions calculate change, goal progress, rolling averages,
week-over-week comparison, and OLS trend from source points. The Phase 7 projection
adds 7D/30D/90D/ALL graph windows without persistence. The explicit baseline
assessment remains immutable; body-fat and muscle values come only from measured
assessments. `/progress` is a presentation consumer, while protected APIs remain
private/no-store. See [weight-progress.md](weight-progress.md).

## Progression ledger (Phase 8)

`ProgressionEvent` is an append-preserving, status-driven audit ledger. Its unique
owner/config/source-type/source-key identity makes repeated and concurrent
reconciliation idempotent. Qualifying source state activates one versioned XP
snapshot; correction revokes it; renewed qualification reactivates that same event.
ACTIVE events alone form total XP. No mutable owner counter or route-handler increment
is authoritative.

`progression-service.ts` reconciles evaluated Daily Quest records, distinct workout
dates, and secured challenge weeks after their source mutations. Ordered source-first
writes plus repeatable convergence avoid a fragile distributed transaction. Pure
level/rank math lives under `src/server/calculations/progression`; centralized,
versioned XP policy lives under `src/lib/progression`. The owner-scoped, private/no-store API and
server-rendered pages consume a sanitized summary projection. See
[progression.md](progression.md).

## New-user initialization (V2.3)

`/setup` is the single onboarding entry. Completed users are redirected to `/today`.
Blank users receive no profile metrics, timezone, start date, rules, targets, or
assessment from the original account. Temporary explicit saves live in one
owner-scoped `OnboardingDraft`; this separate draft is necessary because profile and
active protocol documents intentionally require activation-safe fields and must not
contain fake dates, zero metrics, or partial ACTIVE state.

`onboarding-service.ts` owns draft upsert and activation. Route ownership always
comes from the opaque session. Activation builds rule configuration from the shared
browser-safe catalogue, writes nullable optional metrics, creates an ACTIVE fixed
90-day `WinterArcConfig`, updates the account display name, and removes the draft.
A partial unique active-protocol index plus atomic upsert makes concurrent requests
converge. If an active protocol already exists, activation returns it and performs no
profile/config rewrite; this is the existing-owner preservation guard.

The catalogue is global code, while selected rule keys and confirmed targets are
stored per configuration. Daily records still snapshot their enabled rules, so new
selection never rewrites history. Calendar, streak, report, notification-count, and
progression projections consume those snapshots without a seven-rule assumption.
See [onboarding-routine-selection.md](onboarding-routine-selection.md).

## Achievement, reward, and recovery projections (Phase 9)

`AchievementUnlock`, `RewardGrant`, and `RecoveryProtocol` are separate owner/config
scoped collections. Achievement and reward identities use deterministic unique keys,
and unsupported derived state is revoked rather than deleted. System titles are
selectable only while their granting achievement is ACTIVE.

Daily and workout source writes remain authoritative. Phase 9 reconciliation runs
after Phase 8 convergence and can be retried safely. Recovery never changes XP,
level, rank, source data, or normal targets: finalized daily failures consolidate
into one future-Perfect-Day objective, while failed finalized workout weeks
consolidate into one later normal weekly-mission objective. See
[achievements-recovery.md](achievements-recovery.md).

## Weekly reporting projection (Phase 10)

`WeeklyReport` stores immutable FINAL, policy-versioned snapshots under a unique
owner/config/challenge-week identity. Current-week PREVIEW reports remain dynamic
and are not persisted. The reporting service performs bounded owner-scoped source
queries, delegates scoring and comparisons to pure calculations, and exposes only a
sanitized projection through private/no-store endpoints.

Arc Score V1 is 75% elapsed-day Daily Discipline and 25% configured workout
completion, with workout overachievement clamped at 100%. Weight, body composition,
XP, rank, achievements, rewards, and recovery remain descriptive. See
[weekly-reports.md](weekly-reports.md).

## Phase 12 PWA and push boundary

`manifest.ts`, generated original icons, `/install`, and the root client runtime own
browser installation and service-worker lifecycle. `public/sw.js` has one versioned
Winter Arc cache. It bypasses every API request, never persists navigation HTML, and
caches only the public offline document, icons, manifest, and versioned Next static
assets. Offline writes are blocked at the UI boundary and there is no mutation queue.

`PushSubscriptionRecord` stores multiple user devices under hashed unique endpoint
identity. Endpoint and key fields are excluded from default Mongoose selection.
Authenticated same-origin APIs expose only configuration state, public VAPID key,
and counts. `WebPushNotificationTransport` fans out the Phase 11 external-safe
payload with a one-way intended-user binding, invalidates only terminal 404/410 subscriptions, and records aggregate
delivery status without replacing the private inbox. The VAPID private key remains
server-only. Before displaying payload details, the service worker confirms that the
current authenticated session belongs to the intended user. A logged-out, offline,
or different-user browser sees generic content only. See [pwa-web-push.md](pwa-web-push.md).

## Phase 13 release boundary

Phase 13 freezes the domain architecture and adds no new product module. Shared
System loading, error, not-found, and transient event components standardize the
release surface while keeping route data loading server-side. Client mutation paths
detect an expired owner session and emit one root-handled redirect to `/login` with a
validated same-origin return path; no component retries a failed mutation in a loop.

Every shared API success or failure envelope now defaults to `Cache-Control: private,
no-store`. The service worker still bypasses `/api/*` and never caches authenticated
HTML. Production headers deny framing and object embedding, restrict form and base
targets to this origin, and disable unused browser capabilities without broadening
script permissions.

Calendar detail behaves as a labelled modal dialog: focus enters the sheet, Tab stays
inside, Escape closes it, and focus returns to the originating date. Calendar states
have concise visible text in addition to color. XP, level, rank, achievement, Daily
Quest, and weekly-mission transitions use short opacity/transform feedback with a
static reduced-motion fallback.

`tests/phase13-simulation.test.ts` is an in-memory, isolated-owner architecture
harness. It walks the 90-day boundary and verifies perfect/partial/missing days,
weight-linked XP reversibility, distinct workout days, weekly qualification reversal,
constructive recovery, reporting, notification dedupe, achievements, ranks, Week 13,
and post-Day-90 behavior. It imports authoritative policies and pure calculations and
does not connect to MongoDB or mutate the real owner.

## V2.7 scheduled email boundary

The existing notification scheduler remains the sole cron entry point and now uses
bounded, ordered owner batches with an optional continuation cursor. In-app/Web Push
evaluation remains unchanged. A separate email preference and
`DailyQuestEmailDelivery` ledger are necessary because SMTP has an independent
delivery lifecycle; the ledger's unique owner/config/local-date/type index and atomic
PENDING-or-FAILED to SENDING claim provide multi-instance deduplication.

The service resolves each instant through the profile IANA timezone, admits only the
local 18:0018:59 window and active challenge dates, and delegates completion to the
existing Daily Quest evaluator. It rechecks mutable preference/completion facts just
before the awaited `EmailProvider` call. The template exposes only aggregate counts
and a canonical server-configured `/today` URL. See
[scheduled-email-reminders.md](scheduled-email-reminders.md).

## Intentionally deferred architecture

- **Daily Quest:** definitions, completion records, and evaluation services remain
  separate so daily rules can evolve without coupling UI and persistence.
- **Workout extensions:** exercise libraries, sets, reps, templates, and performance
  analytics remain outside the completed-session compliance module.
- **Analytics:** immutable measurement inputs feed pure calculation services and
  Phase 10 reporting projections.
- **Personal rewards:** Phase 9 grants digital System recognition only; personal
  real-world reward configuration is not part of this release.

Calendar/streak history exists in Phase 5, workout compliance in Phase 6, weight
analytics in Phase 7, XP/rank progression in Phase 8, achievements/recovery in
Phase 9, weekly reports in Phase 10, in-app smart reminders in Phase 11, PWA/Web Push
delivery in Phase 12, and final integration hardening in Phase 13. Full offline
private-data access and the other documented deferred modules remain outside this
architecture. There is no planned Phase 14.

## Notification and PWA delivery boundary

Application metadata, viewport configuration, safe-area spacing, and an icon
integration point are established. Phase 11 adds `NotificationPreferences`,
versioned/deduplicated `NotificationRecord` projections, a pure reminder policy, a
private inbox, and an in-app transport. The profile timezone remains authoritative,
and time-based evaluation is protected by a server-only scheduler secret. See
[notifications.md](notifications.md).

Phase 12 supplies installation and real browser delivery without changing Phase 11
timing, quiet-hour, privacy, category, ceiling, or dedupe policy. It intentionally
does not add offline synchronization. Notification permission and device delivery
remain distinct from reminder preferences and domain services.

## V2.2 multi-user authentication

The existing `owners` collection is now the account collection; `UserModel` is an
alias over that same model and does not create a second identity or collection.
Accounts have a canonical unique `emailNormalized`, lifecycle status (`ACTIVE`,
`PENDING_VERIFICATION`, or `DISABLED`), nullable verification metadata, and an
immutable original-owner marker. Passwords remain bcrypt cost 12 hashes and are
excluded from ordinary queries.

The legacy bootstrap is restricted to an empty database and seeds personal baseline
data only for the marked original account. New identity creation produces only an
account; it cannot create a profile, configuration, baseline, history, preferences,
or other personal defaults.

Login creates a cryptographically random 256-bit opaque token. Only a SHA-256 token
hash is persisted in `AuthSession`; the raw value exists only in an HttpOnly,
SameSite=Lax cookie that is Secure in production. Sessions have explicit expiry,
revocation, last-use tracking, a unique token-hash index, and a TTL cleanup index.
Protected pages enforce authentication in their Server Components, while protected
REST handlers independently validate the session before resolving user-scoped data.
All personal service queries derive userId from that session. Compatibility helper
names containing “owner” mean the current resource owner, never a singleton.

V2.2 adds server-only `EmailOtp` and `AuthRateLimit` collections. OTP requests are
cryptographically generated, bound by HMAC-SHA256 to purpose, request ID, canonical
email, and code, and sent through a narrow Resend provider abstraction. The database
stores only the digest. A PENDING_SEND record becomes SENT only after confirmed
provider success; verification accepts only SENT, unexpired, under-attempt-limit
records and atomically consumes one. Fixed-window email/IP limits and resend cooldown
state are database-enforced, so warm instances do not own security state.

Registration creates only a verified ACTIVE account after code consumption, then
uses the existing session service and current setup gate. It creates no profile,
timezone, body data, protocol, rules, or history. Login-code requests return the same
public shape for missing and disabled accounts, and successful code login records
`emailVerifiedAt` only when it was previously null. Password login remains supported
and does not manufacture verification history. All new auth mutations require a
same-origin request and return private/no-store envelopes.

See [authentication.md](authentication.md), [email-otp-auth.md](email-otp-auth.md),
and [multi-user-foundation.md](multi-user-foundation.md).

## V2.5 cosmetic identity and brand boundary

`UserProfile.avatarKey` is an optional stable key into the local, browser-safe avatar
catalogue. Missing or unknown legacy values project to `SYSTEM_DEFAULT`; the default
is not written as a character assignment. The dedicated same-origin PUT route derives
ownership from the opaque session and updates only this one profile field. It does
not call progression, quest, workout, achievement, reward, report, or recovery
services.

Guild projection code applies `shareProfileSummary` before returning an avatar key.
All friend surfaces receive null when sharing is disabled, and every read retains the
ACTIVE bilateral connection check. Original 512x512 WebP assets are served through
`next/image` with explicit dimensions and responsive sizes. See
[avatar-branding.md](avatar-branding.md).

## V2.6 device-local install experience

The root `PwaRuntime` mounts one `InstallSystemPrompt` and one shared
`InstallSystemController`. The controller owns `beforeinstallprompt`, `appinstalled`,
standalone media, touch/mobile eligibility, and the namespaced seven-day local
dismissal. `/install` consumes the same state rather than registering duplicate
browser listeners. Server snapshots are always hidden, avoiding hydration flash.

Native install events are one-use capability objects: they are deferred on receipt
and consumed only by an explicit action. iOS/iPadOS uses a modal manual instruction
flow and makes no installation-success claim. The feature has no model, API, owner
field, or database migration. Service-worker and private navigation caching rules are
unchanged. See [install-system.md](install-system.md).

## Profile and protocol configuration

`UserProfile` is unique per owner and stores identity/preferences without inventing a
date of birth. `WinterArcConfig` owns schedule configuration, workout frequency, and
editable ordered rules. A protocol's end date uses inclusive UTC calendar semantics:
start date plus `durationDays - 1`. The selected timezone remains an explicit profile
choice; calendar dates are not inferred from the server timezone.

Rules are configuration documents, not quest completions. Workout remains a separate
weekly target and is deliberately absent from the seven daily rules.

## Daily Quest tracking

`DailyQuestRecord` is the Phase 4 source-input aggregate for one owner, protocol and
profile-local `YYYY-MM-DD` date. A unique compound index plus atomic upsert makes
creation idempotent under concurrent requests. The record snapshots enabled rules
once, then stores boolean/numeric responses separately in a typed map. Configuration
changes never rewrite historical snapshots. Workout is excluded from daily
perfection because its weekly 4/7 engine belongs to Phase 6.

The snapshotted `morning_weight` rule remains part of evaluation, but its response is
derived only from Phase 7 WeightRecord presence. The general Daily Quest PATCH route
rejects direct edits to that key.

`daily-quest-service.ts` owns active-protocol gating, explicit timezone resolution,
challenge day/week integration, database access and response validation. The pure
`daily-quest/evaluation.ts` layer delegates all formulas to Phase 3 and derives rule
states, completion, perfect-day and day status. Today is editable; the date route is
read-only and never creates history. Full semantics are in
[daily-quests.md](daily-quests.md).

## Body composition and baseline semantics

`BodyCompositionAssessment` is append-oriented and supports multiple assessments.
It records source measurements, segmental values, raw impedance, and values such as
BMI/BMR only when reported by the source assessment. Calculation logic lives outside
the model. A partial unique index prevents multiple baselines for the same owner and
Winter Arc configuration. New scans create new documents; services never silently
replace historical assessments.

The bootstrapped InBody120 record preserves the supplied 14 August 2026 source data.
Its reported 71.4 kg target remains `targetWeightKgReported` and is independent of
the optional Winter Arc goal weight.

## V2.4 bilateral Guild privacy boundary

`GuildInvite` owns pending email requests, `GuildConnection` owns one canonical sorted
pair, and `GuildSharingPreferences` owns the viewed member's live policy. Guild OTPs
reuse V2.2 cryptography with the invite ID as `EmailOtp.contextKey`; null context keeps
REGISTER/LOGIN hashes and behavior compatible. Acceptance converges through consumed
OTP reconciliation plus a unique pair upsert.

Friend authorization always starts from the requester's opaque session and an ACTIVE
pair. Dedicated projection functions whitelist friend-safe identity, Calendar, and
Report fields after reading current preferences. They do not reuse owner API payloads.
Unknown catalogue rules are treated as private; weight, body composition, private
habits, recovery, raw ledgers, notes, auth data, and notification data remain outside
the default projection. See [guild.md](guild.md).
