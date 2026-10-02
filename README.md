# Winter Arc

Winter Arc is a private, multi-user-ready 90-day discipline and body-transformation
application. The completed V1 system and V2 account foundation combine source-data tracking,
deterministic calculations, reversible gamification, reporting, notifications, and
an installable privacy-safe PWA. Progression is motivational System feedback, not a
medical or fitness assessment.

## Stack

- Next.js App Router and React
- TypeScript in strict mode
- Tailwind CSS and centralized CSS design tokens
- MongoDB Atlas with Mongoose
- Zod environment validation
- Vitest, ESLint, and Prettier
- Recharts for the focused responsive weight visualization
- npm and a single-project Vercel deployment model

## V2.5 avatar and branding

Profiles may optionally select one of ten original Winter Arc character portraits at
`/profile/avatar`. The saved value is a controlled catalogue key, never an external
URL; null uses the geometric `SYSTEM_DEFAULT` mark. Avatar changes are cosmetic and
do not affect any progression or tracking source.

Guild surfaces expose the normalized avatar key only when the viewed member enables
Profile summary sharing. The original Winter Arc mark remains the favicon, installed
PWA icon, maskable icon, Apple touch icon, authentication mark, and startup brand.
See [docs/avatar-branding.md](docs/avatar-branding.md) for persistence, privacy,
artwork, splash, and expansion rules.

## V2.6 mobile Install System

Eligible mobile browsers receive a compact, dismissible `INSTALL SYSTEM` surface.
Chromium installation is invoked only after a captured browser event and an explicit
tap; iPhone/iPad receives honest Share/menu to Add to Home Screen instructions.
Installed standalone mode, desktop browsing, active form input, `/install`, and a
seven-day device-local dismissal all suppress the automatic panel. Installation
state never enters MongoDB. See [docs/install-system.md](docs/install-system.md).

## V2.7 scheduled Daily Quest email

Owners may separately opt in to one generic Daily Quest reminder during their local
18:0018:59 window. The hourly, `CRON_SECRET`-protected scheduler uses the profile's
IANA timezone, authoritative Daily Quest evaluation, verified account email, bounded
cursor batches, and a unique atomic delivery ledger. Existing users remain opted out.
No private habit name or body data enters email. MongoDB TTL remains authoritative
for OTP and authentication rate-limit cleanup; no redundant nightly deletion cron is
added. See [docs/scheduled-email-reminders.md](docs/scheduled-email-reminders.md).

## V2.8 final release readiness

The final V2 audit adds no product behavior. It verifies security boundaries,
serverless/runtime compatibility, release environment placeholders, Atlas ownership
integrity, secret hygiene, dependency health, and the complete 3201280px responsive
matrix. Vercel deployment and cron configuration remain manual approval steps. See
[docs/v2-release-readiness.md](docs/v2-release-readiness.md).

## Prerequisites

- Node.js 24.x (the verified release runtime, also declared in `package.json`)
- npm
- A MongoDB Atlas connection authorized for development

## Installation

```bash
npm ci
```

Copy `.env.example` to `.env.local` and provide the server-only values:

```dotenv
MONGODB_URI=
MONGODB_DB_NAME=winter_arc
OWNER_EMAIL=
OWNER_PASSWORD=
OWNER_DISPLAY_NAME=Nivedan
CRON_SECRET=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=
EMAIL_PROVIDER=
GMAIL_USER=
GMAIL_APP_PASSWORD=
RESEND_API_KEY=
EMAIL_FROM=
APP_BASE_URL=
OTP_PEPPER=
```

Never prefix these server configuration values with `NEXT_PUBLIC_`; the browser gets
the VAPID public key only through the authenticated status API. The checked-in example
contains no credentials, and `.env.local` is ignored by Git.

`OWNER_PASSWORD` must be at least 12 characters. After setting the private owner
credentials, run the idempotent bootstrap once:

```bash
npm run bootstrap:owner
```

The command hashes the password, creates at most one owner, and seeds the supplied
14 August 2026 InBody120 baseline if it does not already exist. It never prints the
password and never overwrites a historical assessment.

## Commands

```bash
npm run dev       # local development server
npm run lint      # ESLint
npm run typecheck # TypeScript validation
npm test          # Vitest suite
npm run build     # production build
npm start         # serve the production build locally
npm run format:check # formatting validation
npm run bootstrap:owner # empty-database original owner and source baseline only
npm run migrate:v2.1 # safe V2.1 account/index dry-run
npm run verify:v2.2:database # create/verify only V2.2 auth collections/indexes
npm run verify:v2.2:responsive # public auth UI at required viewport widths
npm run verify:v2.3:database # V2.3 draft/active indexes without source mutation
npm run verify:v2.3:responsive # isolated setup wizard at required viewport widths
npm run migrate:v2.4 # replace legacy OTP identity with invite context support
npm run verify:v2.4:database # Guild/OTP indexes without source-data writes
npm run verify:v2.7:database # reminder ledger/preference and existing TTL indexes
npm run verify:v2.7:responsive # notification settings at required widths
npm run verify:v2.7:email-template # HTML reminder at mobile/desktop email widths
npm run verify:v2.8:database # read-only ownership/index/TTL/orphan audit
npm run verify:v2.8:responsive # final 320-1280px release matrix
npm run verify:v2.8:secrets # non-disclosing tracked/worktree secret scan
```

The public health endpoint is available at `GET /api/v1/health`. Authentication uses
an HttpOnly, SameSite=Lax cookie containing an opaque token; MongoDB stores only its
SHA-256 hash. Personal endpoints require a valid persisted session.

## Phase boundary

Phase 3 implements pure BMI/BMR and body-composition formulas, weight analytics,
calendar helpers, and configurable compliance primitives. The authenticated
`GET /api/v1/calculations/summary` endpoint and profile panel distinguish reported
data from derived values. A profile with an explicit supported sex coefficient is
needed for Mifflin-St Jeor; incomplete setup does not receive invented demographics.

See [Calculation contracts and formulas](docs/calculations.md) for units, validation,
rounding, DST/date semantics, source preservation, baseline examples, and live
verification instructions. BMR estimates are not calorie prescriptions.

Phase 4 snapshots enabled daily rules, stores raw boolean/numeric responses by local
calendar date, and derives rule/quest states through the Phase 3 helpers. See
[Daily Quest contracts](docs/daily-quests.md). The authenticated root now opens
`/today` after setup.

Phase 5 derives month history without fabricating missing records. `/calendar`,
`GET /api/v1/calendar?month=YYYY-MM`, and `GET /api/v1/streaks` share the same
timezone-aware history service and pure calendar/streak calculations. See
[Calendar and streak contracts](docs/calendar-streaks.md).

Phase 6 keeps workouts separate from Daily Quest perfection. `/today` and
`/workouts` expose the configurable challenge-relative weekly mission, while
calendar history overlays workout markers without changing daily states. See
[Workout contracts](docs/workouts.md).

Phase 7 persists one owner/config/local-date `WeightRecord`. `/today` writes that
source record and derives Morning Weight completion from it; `/progress` presents
baseline-to-current change, goal progress, 7-day averages, week-over-week comparison,
regression trend, graph ranges, and measured assessment history. Calendar weight
markers and detail remain read-only. See [Weight and progress contracts](docs/weight-progress.md).

Phase 8 derives XP only from ACTIVE, versioned `ProgressionEvent` ledger entries.
Rule, perfect-day, distinct workout-day, and weekly-mission events are revoked and
reactivated as their source facts change, preventing retry/toggle farming. `/status`
shows level/rank progression while `/progress` remains body analytics. See
[Progression contracts](docs/progression.md).

Phase 9 derives achievements and digital reward grants from those source facts.
Finalized misses may create consolidated constructive recovery protocols: one future
Perfect Day clears daily recovery and one later normal secured workout week clears
weekly recovery. There is no negative XP or punitive requirement. See
[Achievement, reward, and recovery contracts](docs/achievements-recovery.md).

Phase 10 derives live previews and persists immutable FINAL weekly snapshots. Arc
Score V1 weights Daily Discipline at 75% and the configured workout mission at 25%;
weight, XP, achievements, rewards, and recovery are informational only. See
[Weekly report contracts](docs/weekly-reports.md).

Phase 11 adds opt-in, timezone-aware in-app reminders, a private notification inbox,
quiet hours, deterministic dedupe, and a secret-protected scheduler evaluation
policy. See [Smart notification contracts](docs/notifications.md).

Phase 12 adds the `/install` experience, standalone manifest, original platform
icons, a versioned safe-shell service worker, explicit update UI, device subscription
APIs, and a multi-device `web-push` transport. Private API responses and authenticated
HTML are never cached; offline mutations are neither queued nor reported as saved.
See [PWA and Web Push contracts](docs/pwa-web-push.md).

Phase 13 completes the release-hardening layer: consistent loading/error/empty states,
accessible keyboard-contained history detail, explicit non-color calendar states,
reduced-motion System events, session-expiry recovery, private API cache defaults,
security headers, responsive QA, and an isolated deterministic 90-day simulation.
See [Final release readiness](docs/release-readiness.md).

## Production preparation

Import `Coder3105/Winter-arc` into Vercel with the Next.js framework preset and
repository root as the root directory. Use `npm ci` to install and `npm run build`
to build; retain the framework's default output directory and Node.js 24.x. This
application requires server-side Next.js; do not configure a static export.
See [Vercel's Node.js version documentation](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Production requires an HTTPS deployment, Atlas network access, the existing owner
bootstrap values, `CRON_SECRET`, and all three `WEB_PUSH_*` variables. Add the same
values to the hosting provider; never commit `.env.local`. No `vercel.json` cron is
included because sub-daily plan capability must be confirmed before choosing a
schedule. Run the quality commands and the phase-specific read-only verification
scripts before deployment, then verify installation, an actually subscribed device,
notification delivery, and iPhone behavior on deployed HTTPS.

Production values belong in Vercel Project Settings → Environment Variables.
Vercel cron schedule: **NOT CONFIGURED — PLAN REQUIRED**. Import, environment setup,
scheduler setup, and production deployment remain separate operational steps.

V2.2 adds verified public registration and optional email-code login while preserving
password login and the V2.1 owner/data model. `OTP_PEPPER` must be a private random
value of at least 32 characters. Set `EMAIL_PROVIDER=gmail` with `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, and `EMAIL_FROM` to use the active Gmail SMTP adapter. The
optional isolated Resend adapter is selected only with `EMAIL_PROVIDER=resend` and
its own key/origin configuration. Missing provider-specific configuration fails
closed at the email boundary. See [Email OTP authentication](docs/email-otp-auth.md),
[Multi-user foundation](docs/multi-user-foundation.md), and
[Authentication](docs/authentication.md).

Set `APP_BASE_URL` to the deployed HTTPS origin when a hosting proxy gives Next.js an
internal request URL; this preserves exact same-origin checks without trusting client
or forwarding headers.

V2.3 routes a newly verified account through the existing `/setup` entry. The
six-step System initialization keeps identity and optional physical inputs blank,
requires an explicitly confirmed timezone, start date, weekly workout target, and at
least one selected Daily Quest rule, supports a resumable inactive draft, and
activates exactly one owner-scoped 90-day protocol. Suggested routine targets remain
placeholders until entered. No Fap is private, opt-in, and never preselected. Existing
completed accounts redirect away from setup and retain their stored profile,
configuration, history, and V1 XP snapshots. See
[Onboarding and routine selection](docs/onboarding-routine-selection.md).

V2.4 adds bilateral Guild/friend connections, invite-scoped email OTP acceptance,
and privacy-controlled member Profile, Calendar, and Weekly Report projections.
Owner APIs are never forwarded to another user. Exact weight, body composition, and
catalogue-private habits default OFF. See [Guild privacy contracts](docs/guild.md).

Before deploying V2.4, run `npm run migrate:v2.4` once to replace the legacy EmailOtp
identity index with its backwards-compatible contextual form. Validate Atlas without
seeding Guild data with `npm run verify:v2.4:database`.

Avatars, personal real-world reward configuration, private offline tracking, exercise
sets/reps programming, food/calorie databases, AI coaching, and email/SMS/WhatsApp
reminder delivery are outside scope. V2.4 email remains limited to authentication and
Guild invitation verification.
