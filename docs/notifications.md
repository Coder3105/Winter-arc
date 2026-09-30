# Smart reminders and notifications — Phase 11

## Boundary

Phase 11 owns opt-in policy, owner-scoped inbox records, privacy content, timing, and
deterministic server evaluation. Phase 12 adds an optional device delivery transport;
it does not rewrite the Phase 11 policy.

Notifications are projections of existing Winter Arc facts. They never create or
rewrite Daily Quest, weight, workout, progression, achievement, reward, recovery,
or weekly-report source data. Reminder targets remain configured challenge targets,
not medical requirements.

## NotificationPreferences

`NotificationPreferences` is unique by authenticated owner. The global `enabled`
flag defaults to `false`, so no reminder is generated until the owner opts in.
Independent settings cover Daily Quest, Morning Weight, hydration, steps, workout,
recovery, weekly reports, and achievements/rewards. There are no external No Fap or
No Junk Food categories.

Editable local-time defaults are 09:00 for Morning Weight, 14:00 and 18:00 for
hydration, 19:00 for steps, 20:00 for Daily Quest, and 09:00 for weekly reports.
They are product defaults only and make no health or lifestyle claim. Hydration
accepts no more than four unique `HH:mm` slots.

The profile IANA timezone is authoritative. A stored `timezoneSnapshot` is
server-controlled and synchronized when preferences are saved; the browser cannot
choose a conflicting scheduling timezone.

### Quiet hours

Quiet hours are disabled by default. When enabled they support same-day and
cross-midnight ranges. The start boundary is inside and the end boundary is outside.
Every reminder, including workout `CRITICAL`, respects quiet hours. A configured
slot inside quiet hours is skipped instead of being deferred into a stale alert
after quiet hours end.

### Privacy modes

Every notification has external-safe `title` and `body` fields plus optional
authenticated `privateTitle` and `privateBody`. `PRIVATE` uses generic safe previews.
`DETAILED` may include non-sensitive hydration or step progress, but weight values,
private notes, raw Daily Quest responses, and sensitive habit names remain excluded.
The authenticated inbox may show the private payload.

## NotificationRecord

`NotificationRecord` stores type, deterministic dedupe key, policy version, safe and
private text, controlled internal action route, sanitized source identity,
challenge context, priority, lifecycle timestamps, and delivery state. `UNREAD`,
`READ`, and `DISMISSED` are content lifecycle states. Delivery is separate:
`PUSH_PENDING`, `PUSH_DELIVERED`, `PUSH_UNAVAILABLE`, and `PUSH_FAILED` describe the
aggregate external attempt while the inbox record remains available.

The unique identity is `{ userId, winterArcConfigId, dedupeKey, policyVersion }`.
Atomic upsert and duplicate-key recovery make repeated or concurrent evaluation
converge on one logical record. Reading or dismissing a record does not remove its
dedupe identity, so the same reminder is not recreated.

Normal reads exclude dismissed records, use cursor pagination, and return at most a
bounded page. The challenge produces manageable history, so Phase 11 retains recent
records and does not add destructive automatic deletion. A later retention policy
may safely expire old read/dismissed records.

## Notification Policy V1

`NOTIFICATION_POLICY_VERSION` is 1. The pure evaluator receives sanitized state and
has no MongoDB, React, session, or clock dependency.

Time-based reminders are:

- Daily Quest: one generic incomplete reminder for the configured slot; no reminder
  after a Perfect Day. Private details omit an explicitly failed binary habit from
  the actionable list.
- Morning Weight: only when no canonical WeightRecord exists for the local date;
  payloads contain no weight value.
- Hydration: one identity per configured slot, using the day's immutable rule
  snapshot and suppressing later reminders after `PASS`.
- Steps: uses the day's snapshot target and suppresses `PASS` or `NOT_APPLICABLE`.
- Workout: state-transition identities for `AT_RISK` and exact no-rest-days
  `CRITICAL`; `ON_TRACK` and `SECURED` are silent. A mathematically impossible
  active week receives at most one informational notice.
- Recovery: one gentle reminder per active recovery and local day. A later
  completion produces a separate event notification.
- Weekly report: only an existing `FINAL` report can produce a ready notification;
  a `PREVIEW` cannot.

Event-based notifications are created after authoritative reconciliation for a new
achievement, reward, recovery completion, final reached level, or reached rank.
They create no ProgressionEvent and award no XP. A sensitive achievement uses a
generic safe payload while retaining its title only in authenticated private text.

Deterministic examples include `hydration:2026-10-05:14:00`,
`workout:week-4:critical`, `achievement:<key>`, and `level:12`. If multiple levels
are crossed at once, only the final current level is evaluated, preventing level
spam.

## Slots, grace, ceiling, and relevance

Repeated scheduler calls do not require exact-minute timing. A slot is eligible
when its local time has passed and it is still inside the central category grace
window: three hours for Morning Weight, hydration, and steps; Daily Quest and
weekly-report readiness remain eligible through the same local day. State is loaded
again when evaluation runs, so a task completed after its slot but before the
scheduler runs suppresses the stale reminder.

Time-based records are defensively capped at 10 per owner/config/local date.
Event-based records do not consume the cap. Candidate ordering under the cap is
deterministic: workout critical, Daily Quest, recovery, Morning Weight, hydration,
steps, then lower urgency states and report readiness. Slot and transition dedupe
normally keep the total below the ceiling.

## Service, transport, and APIs

The server loads only owner/config-scoped current sources, converts the injected
instant once using the profile timezone, and supplies the pure policy. The
`NotificationTransport` interface separates generation from delivery.
`WebPushNotificationTransport` loads all active owner devices and sends only the
external-safe title/body. Private title/body, raw rule values, weight values, notes,
and sensitive habit identities never enter push payloads. One successful device
makes aggregate delivery successful; 404/410 invalidates only that device, while a
transient failure remains eligible for a later scheduler retry.

Authenticated private/no-store endpoints are:

- `GET /api/v1/notifications?limit=…&cursor=…`
- `GET /api/v1/notifications/unread-count`
- `PATCH /api/v1/notifications/[id]/read`
- `POST /api/v1/notifications/read-all`
- `PATCH /api/v1/notifications/[id]/dismiss`
- `GET /api/v1/notification-preferences`
- `PUT /api/v1/notification-preferences`
- `GET /api/v1/push/status`
- `POST /api/v1/push/subscriptions`
- `DELETE /api/v1/push/subscriptions`

All ownership comes from the opaque session. Notification actions use a fixed
server mapping to internal application routes; no browser-provided URL is accepted.

`POST /api/internal/notifications/evaluate` is a server-to-server endpoint protected
by `Authorization: Bearer <CRON_SECRET>`. It does not use an owner browser session
and evaluates only the existing active owner in this single-owner phase. Missing or
wrong credentials are rejected without exposing the secret. `CRON_SECRET` is
server-only, optional for local browsing, and must be at least 16 characters when
configured.

`GET /api/internal/notifications/cron` is the Vercel Cron-compatible adapter. It uses
the same scheduler service and the same bearer secret. No `vercel.json` cadence is
committed because the deployment plan is not known; hourly execution is an example
only for a plan that explicitly supports it.

## UI and verification

The authenticated header bell links to `/notifications` and shows the unread count.
The inbox supports read, read-all, dismiss, and controlled navigation. Notification
settings live at `/profile/notifications` and expose category, local-time, quiet-hour,
and privacy controls plus a separate device-push panel. Device unsubscribe never
modifies reminder preferences.

Run the normal lint, typecheck, tests, formatting check, and production build. Atlas
collection/index verification is read-only apart from creating the two authorized
Phase 11 collections and indexes:

```powershell
node --conditions=react-server --env-file=.env.local --import tsx scripts/verify-phase11-database.ts
npm run start -- --hostname 127.0.0.1 --port 3211
node --env-file=.env.local scripts/verify-phase11.mjs
```

The live verifier does not enable reminders, write preference values, invoke an
authorized scheduler evaluation, or fabricate personal history. It logs no secrets
and revokes its own session in `finally`.
