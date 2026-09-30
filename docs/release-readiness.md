# Winter Arc release readiness — Phase 13

## Release status

The Phase 1–13 software scope is complete and ready for production configuration and
device verification. The domain architecture is frozen; Phase 13 adds release
hardening rather than a new product module. Production deployment has not been
performed.

## Implemented system

- Phase 1–2: foundation, opaque owner authentication, profile/configuration, and
  immutable baseline source data.
- Phase 3–7: deterministic calculations, Daily Quest, calendar/streaks, workouts,
  WeightRecord synchronization, and transformation analytics.
- Phase 8–10: reversible XP ledger, levels/ranks, achievements, digital rewards,
  constructive recovery, and immutable finalized weekly reports.
- Phase 11–12: timezone-aware notification policy, private inbox, installable PWA,
  privacy-safe service worker, and multi-device Web Push transport.
- Phase 13: final System UI consistency, accessible route/loading/error states,
  keyboard-contained calendar detail, session-expiry routing, private cache defaults,
  security headers, reduced-motion event feedback, audits, documentation, and an
  isolated 90-day simulation.

## Quality and audit evidence

Required gates are:

```powershell
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

The deterministic simulation is `tests/phase13-simulation.test.ts`; it uses only
isolated fixture identities and pure/in-memory state. It never changes the real owner,
start date, protocol, Daily Quest, workout, weight, or assessment history.

The final automated regression baseline is **695 tests across 71 files, 0 failed**
(the Phase 12 baseline was 685). ESLint, strict TypeScript, Prettier validation, and
the production build pass. `npm audit` reports 0 known vulnerabilities across the
resolved production and development dependency tree.

The source audit confirms the critical unique identities for DailyQuestRecord,
WeightRecord, ProgressionEvent, AchievementUnlock, RewardGrant, WeeklyReport,
NotificationRecord, and endpoint-hashed PushSubscriptionRecord. WorkoutRecord keeps
its intentional non-unique owner/config/date range index because multiple sessions on
one day are valid.

Source-controlled files contain placeholders only for secrets. Authentication uses
HttpOnly opaque sessions, mutations are owner-scoped, same-origin protection remains
on sensitive setup/push paths, external push copy excludes private habit and measured
values, and all API envelopes are private/no-store. The service worker bypasses APIs
and authenticated HTML.

The client-boundary audit keeps database work and calculations server-side. Recharts
is isolated behind a progress-route dynamic boundary while all essential numeric
weight information remains available as text; no authenticated projection is fetched
twice merely for the chart.

## Required production environment

Use the exact variables documented by `.env.example`:

```dotenv
MONGODB_URI=
MONGODB_DB_NAME=winter_arc
OWNER_EMAIL=
OWNER_PASSWORD=
OWNER_DISPLAY_NAME=
CRON_SECRET=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=
```

Production also requires HTTPS, Atlas network access from the deployment runtime, a
compatible Web Push device/browser, and a hosting plan whose scheduler cadence can
support the chosen notification evaluation interval. VAPID private material and the
cron secret must remain server-only.

## Pre-deployment checklist

1. Configure production Atlas credentials and access policy.
2. Configure owner bootstrap values, run the idempotent bootstrap once, and remove
   bootstrap-only values later if operational policy requires it.
3. Configure `CRON_SECRET` and the VAPID key pair/subject in the hosting environment.
4. Confirm the Vercel plan supports the required schedule before adding `vercel.json`.
5. Run all five quality gates and the read-only database index verifiers.
6. Review deployment headers for `/sw.js`, `/manifest.webmanifest`, and `/api/*`.
7. Deploy only with separate explicit authorization.

## Post-deployment verification

1. Verify health, owner login/logout/revocation, setup gate, and every primary route.
2. Verify authenticated API responses are private/no-store and anonymous access is
   rejected.
3. Install on supported Chromium and verify update/offline behavior without caching
   private pages.
4. Subscribe a real device, run a due notification evaluation, receive the push,
   inspect safe lock-screen copy, follow its controlled route, then unsubscribe.
5. On physical compatible iPhone Safari over HTTPS, install to Home Screen, reopen in
   standalone mode, grant notification permission, and receive a real push.
6. Confirm cron authorization, cadence, dedupe, and observability in production.
7. Re-run Atlas collection/index verification without seeding or changing source data.

## External verification still required

- MongoDB Atlas live verification requires current network/IP allow-list access.
- Production `CRON_SECRET` is not configured locally.
- Production VAPID public/private keys and subject are not configured locally.
- Vercel cron schedule: **NOT CONFIGURED — PLAN REQUIRED**.
- Live Web Push requires real VAPID configuration and a subscribed compatible device.
- iPhone install/push requires physical device testing on deployed HTTPS.
- Production deployment is not performed by Phase 13.

## Intentionally deferred

Multi-user self-registration, personal real-world reward configuration, full offline
private tracking, exercise sets/reps programming, a food/calorie database, AI
coaching, and email/SMS/WhatsApp notifications are intentionally not implemented.
The current release remains single-owner. There is no Phase 14.
