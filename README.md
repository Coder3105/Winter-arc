# Winter Arc

Winter Arc is a single-owner, personal 90-day discipline and body-transformation
application. The completed Phase 1–13 system combines source-data tracking,
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
npm run bootstrap:owner # initial owner and source baseline
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

The current release intentionally remains single-owner. Multi-user self-registration,
personal real-world reward configuration, private offline tracking, exercise
sets/reps programming, food/calorie databases, AI coaching, and email/SMS/WhatsApp
delivery are outside scope.
