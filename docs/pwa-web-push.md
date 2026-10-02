# PWA and Web Push — Phase 12

## Boundary

Phase 12 controls how an already-eligible Phase 11 notification reaches a browser.
Phase 11 remains authoritative for when and why it exists, quiet hours, grace windows,
daily ceilings, dedupe, categories, and safe/private copy. Device delivery adds no XP,
health judgment, source mutation, new reminder category, or Phase 13 polish.

V2.7 email reminders are a separate opt-in channel. Their fixed local 6 PM policy,
SMTP delivery ledger, and verified-email eligibility neither read nor mutate Web
Push subscriptions, the global application reminder toggle, or Phase 11 push
delivery states. See [scheduled-email-reminders.md](scheduled-email-reminders.md).

## Manifest, icons, and installation

`src/app/manifest.ts` publishes ID, start URL, and scope `/`, standalone display,
the black/navy theme, and 192px, 512px, and maskable PNG icons. The 180px Apple touch
icon and favicon are generated from the project's original `system-mark.svg`; the
visual reference PNG is not used. Root metadata enables Apple standalone mode and
the viewport uses `viewport-fit=cover`. Shared shells and banners respect safe areas.

V2.5 keeps the app icon separate from user identity: every install surface uses the
original geometric Winter Arc mark, never a selected avatar. The static PWA launch
document and App Router loading boundary display the same mark with visible text and
restrained CSS motion. `/launch.html` redirects after a paint opportunity and has no
timer-based minimum duration. Native operating-system splash behavior remains
platform-controlled through the manifest, icons, theme/background colors, and Apple
metadata; the app-controlled loader begins only after web execution starts.

V2.6 adds a mobile-browser `INSTALL SYSTEM` utility without changing manifest or
cache fundamentals. One shared controller defers `beforeinstallprompt`, invokes it
only from a user action, clears it after one use, and reacts immediately to
`appinstalled`. iPhone/iPad uses an accessible browser-generic Share/menu to Add to
Home Screen instruction dialog rather than simulated installation. Standalone mode,
desktop contexts, `/install`, active form input, and a seven-day namespaced local
dismissal suppress the automatic surface. See [install-system.md](install-system.md).

`/install` detects installed/standalone state. Chromium's `beforeinstallprompt` is
captured but invoked only from the explicit install button. Safari on iPhone receives
Share → Add to Home Screen instructions; push cannot be enabled there until the app
is running from the Home Screen. Dismissal is non-coercive.

## Service worker and offline safety

`/sw.js` registers at scope `/` in production. `?pwa-test=1` explicitly enables the
same registration path in local development. The worker has revalidation/no-store
headers so update checks are not pinned behind an immutable cache.

The `winter-arc-safe-v12-*` cache contains only the standalone public offline
document, original icons, favicon, manifest, and versioned `/_next/static/` assets.
Every `/api/*` request bypasses Cache Storage. Navigation is network-only and is
never inserted into a cache; network failure returns the generic offline document.
Profile, Daily Quest, weight, report, notification, auth, and other private HTML/data
therefore cannot be replayed as a stale offline snapshot. A global offline guard
prevents form/button mutations and explains that a connection is required. There is
no background queue, fake success, or offline authenticated session.

Activation deletes only obsolete caches with the Winter Arc cache prefix. A waiting
worker produces `SYSTEM UPDATE AVAILABLE`; only an explicit Update action sends
`SKIP_WAITING`, after which `controllerchange` reloads the page.

## Device subscription and VAPID

`PushSubscriptionRecord` stores authenticated user ID, sensitive endpoint, SHA-256
endpoint hash, browser keys, expiration, ACTIVE/INVALID state, last-seen/success/
failure timestamps, and failure count. Endpoint hash is unique and an owner/status
index supports multi-device fanout. Endpoint and browser keys are excluded from
ordinary selection and never appear in status responses or logs.

Required production configuration is:

```dotenv
CRON_SECRET=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:owner@example.com
```

The private key is server-only and must never use a `NEXT_PUBLIC_` prefix. Vercel
project environment variables must supply all four values; nothing secret is
committed. Production PWA and push require HTTPS. Localhost may be used for supported
development verification.

Authenticated private/no-store APIs are:

- `GET /api/v1/push/status`, returning configuration, public key, and safe counts;
- `POST /api/v1/push/subscriptions`, idempotently registering a strictly bounded
  browser subscription;
- `DELETE /api/v1/push/subscriptions`, invalidating the authenticated owner's device.

Both mutations require a same-origin `Origin` header in addition to the opaque owner
session. The permission prompt occurs only after the owner presses Enable Device
Push. Denial is reported without repeatedly prompting. Unsubscribe changes only the
device record, never Phase 11 reminder settings. An endpoint hash remains globally
unique: a second account receives a conflict and the record is never silently
reassigned. Logout never transfers ownership.

## Transport, privacy, and clicks

The standards-based `web-push` transport fans out to all ACTIVE subscriptions. It
serializes only external-safe `title`, `body`, a hashed tag, a controlled path, icon,
and badge. It never serializes `privateTitle`, `privateBody`, endpoint details, a raw
dedupe/source key, private habit name, note, or measured value. A 404/410 response
invalidates only the terminal subscription; transient failures keep the device
active. At least one success yields `PUSH_DELIVERED`; zero devices/configuration yields
`PUSH_UNAVAILABLE`; all transient failures yield `PUSH_FAILED`.

The external-safe payload also carries a SHA-256 intended-user binding for a local equality
check. Before showing its title, body, tag, or path, the service worker calls the
private no-store current-session endpoint. A logged-out browser, a different account,
an offline check, or a legacy/malformed payload receives only the generic title/body
and notifications path. This prevents a shared browser from showing one account's
push copy to another account while keeping endpoint ownership stable.

The service worker supplies a generic notification for missing/malformed payloads.
Notification clicks accept only a fixed internal route set, reject external,
protocol-relative, JavaScript, data, backslash, and control-character destinations,
then focus/navigate a same-origin app window or open one. Offline clicks land on the
same generic fallback.

## Scheduler and deployment

The POST evaluator and Vercel-compatible GET cron adapter call the same scheduler.
Both require `Authorization: Bearer <CRON_SECRET>` and return sanitized no-store data.
The notification record is inserted under its deterministic identity before push is
attempted; only the upsert winner dispatches, while pending/transient states can be
retried. No Vercel cron schedule is committed: **NOT CONFIGURED — DEPLOYMENT PLAN
REQUIRED**. On a plan explicitly supporting it, approximately hourly invocation is
the recommended example cadence; repeated evaluation remains deduplicated.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
node --conditions=react-server --env-file=.env.local --import tsx scripts/verify-phase12-database.ts
npm run start -- --hostname 127.0.0.1 --port 3211
node --env-file=.env.local scripts/verify-phase12.mjs
```

Implementation tests mock provider outcomes. A live push PASS additionally requires
real VAPID keys and a compatible subscribed device. iPhone Web Push PASS additionally
requires an HTTPS deployment, installed Home Screen PWA, supported iOS/iPadOS,
permission grant, and an actually received notification; these claims are never
inferred from mocks or desktop testing.
