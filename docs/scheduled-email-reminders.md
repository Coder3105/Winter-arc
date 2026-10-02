# Scheduled Daily Quest email reminders  V2.7

## Boundary

V2.7 adds one optional email channel: a generic Daily Quest incomplete reminder.
It adds no workout email, XP, reward, punishment, Guild delivery, OTP cleanup job,
or V2.8 release/deployment feature. Existing in-app and Web Push preferences and
delivery remain separate.

## Preference and eligibility

`NotificationPreferences.dailyQuestEmailReminder` defaults to `false` for new and
existing users. The owner must explicitly enable it in Notification Protocol
settings. The global application/Web Push toggle does not enable or disable email.

At evaluation time every condition must still hold:

- the account is ACTIVE, enabled, and has a verified account email;
- a profile with a valid configured IANA timezone exists;
- an ACTIVE Winter Arc configuration is on an active challenge day;
- the email preference is enabled and local time is `18:00 <= time < 19:00`;
- the authoritative Daily Quest evaluation is not perfect/complete and has at least
  one applicable selected rule;
- the email provider and canonical `APP_BASE_URL` are configured; and
- the delivery ledger permits a claim for that local date.

The profile timezone and local calendar date are authoritative. `Intl.DateTimeFormat`
performs IANA conversion and daylight-saving handling; no server timezone, IP,
browser history, or manually calculated UTC offset participates. Day 90 is eligible;
pre-start dates and Day 91 onward are not. A missed 18:0018:59 invocation produces
no stale late-night email.

## Completion and privacy

Existing `evaluateDailyQuestRecord` remains the only completion algorithm. The
reminder dynamically uses the day's immutable selected/applicable rule snapshot.
`NOT_RECORDED` remains incomplete. When no record exists, enabled configured daily
rules (excluding workout) determine the total and completion is zero.

The HTML and text email use the shared Winter Arc shell, subject
`Winter Arc  Daily Quest Pending`, and an absolute `/today` link built from the
validated server-side `APP_BASE_URL`. It may show only completed/total objective
counts. It never lists rule names, No Fap, responses, notes, weight/body data, OTPs,
or secrets. Delivery targets only `Owner.email` when `emailVerifiedAt` is present.
Guild addresses and browser input are never used.

## Delivery ledger and retries

`daily_quest_email_deliveries` uses the unique identity
`{ userId, winterArcConfigId, localDate, type }`. An atomic transition from PENDING
or FAILED to SENDING ensures concurrent/serverless invocations cannot both send.
Gmail/Resend is reached only through the existing `EmailProvider`, and the send is
awaited. SENT is written only after provider success. Provider failures store only
`EMAIL_DELIVERY_FAILED` and can retry, at most three attempts in the same window.

SENDING is deliberately not automatically reclaimed. If SMTP succeeds but the
following database acknowledgement is interrupted, leaving the record ambiguous is
safer than risking a duplicate successful email. The next invocation suppresses it.
Preference and completion are re-read after the claim and immediately before send.

## Scheduler operation

`GET /api/internal/notifications/cron` is the vendor-neutral hourly endpoint. The
legacy protected POST adapter remains available. Both require
`Authorization: Bearer <CRON_SECRET>` and never accept the secret in a query string.
Responses contain only aggregate counts.

Processing is bounded to 100 ordered ACTIVE owners. When `nextCursor` is non-null,
the scheduler may call the same URL again with `?cursor=<opaque-owner-id>` and the
same Authorization header. This avoids an unbounded serverless loop. Each owner is
processed sequentially and provider sends are awaited. The current implementation
uses practical per-owner owner-scoped reads; correctness and source-authoritative
checks take precedence over speculative aggregation.

Vercel Cron or an external HTTPS scheduler can invoke the endpoint hourly. No vendor
configuration is committed. If a hosting plan cannot invoke hourly, an external
scheduler can use the same endpoint and bearer contract without business-logic
changes.

Required runtime values are the existing `CRON_SECRET`, `EMAIL_PROVIDER`, selected
provider credentials, `EMAIL_FROM`, and `APP_BASE_URL`. Gmail mode uses the existing
Nodemailer SMTP adapter. Production `APP_BASE_URL` must resolve to the deployed HTTPS
origin. No live email is sent by automated verification.

## OTP and rate-limit maintenance decision

MongoDB TTL remains authoritative. `email_otps.expiresAt` has an
`expireAfterSeconds: 0` TTL index and application verification rejects expiration
immediately. `auth_rate_limits.expiresAt` has the same TTL lifecycle. Therefore a
redundant 11:59 PM deletion cron is not implemented: TTL deletion timing is not part
of OTP validity, and no uncovered retained record class requires nightly cleanup.

## Verification and next boundary

`npm run verify:v2.7:database` creates/verifies only required indexes and confirms
the OTP/rate-limit TTL contracts without changing preference documents or sending
email. `npm run verify:v2.7:responsive` covers notification settings at the required
3201024 pixel widths. `npm run verify:v2.7:email-template` renders email at mobile
and desktop widths. V2.8 remains out of scope.
