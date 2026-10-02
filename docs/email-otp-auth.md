# Email verification and OTP authentication — V2.2

## Scope

V2.2 adds public verified registration and optional email-code login while preserving
the V2.1 account, bcrypt password, opaque session, ownership, and setup contracts. It
does not add onboarding/routine redesign, Guild functionality, avatars, reminder
email, or personal defaults. V2.4 activates the separate Guild template and workflow
without changing the V2.2 public REGISTER or LOGIN contracts.

## Server configuration and email providers

Email delivery reads these environment values without runtime defaults:

- `EMAIL_PROVIDER`: `gmail` for the active Gmail SMTP path or `resend` for the
  optional isolated Resend adapter;
- `GMAIL_USER` and `GMAIL_APP_PASSWORD`: private Gmail SMTP credentials required only
  in Gmail mode;
- `RESEND_API_KEY`: a private Resend key required only in Resend mode;
- `EMAIL_FROM`: the environment-controlled sender address/name;
- `APP_BASE_URL`: the canonical application origin;
- `OTP_PEPPER`: a private random value of at least 32 characters.

They must never use a `NEXT_PUBLIC_` prefix. `.env.example` contains empty
placeholders; `.env.local` remains private and is not modified by project scripts.
A previously exposed credential must not be reused or reproduced in code,
documentation, logs, or reports. Gmail mode requires `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, and `EMAIL_FROM`; it neither requires nor constructs a Resend
client. Resend mode separately requires `RESEND_API_KEY`, `EMAIL_FROM`, and
`APP_BASE_URL`. Missing provider-specific configuration makes email requests fail
closed with a sanitized 503 response while ordinary builds and password login remain
available. Unsupported provider values and invalid application URLs are server
configuration errors.

`GmailEmailProvider` uses Gmail SMTP over port 465 with TLS and sends the existing
explicit sender, recipient, subject, HTML body, and text body. SMTP failures are
mapped to the same sanitized application error. Credentials remain server-only and
are never logged. The optional `ResendEmailProvider` retains its production HTTPS and
verified-domain safeguards when explicitly selected.

Automated tests mock Nodemailer and never send live mail. Live Gmail SMTP verification
is a separate manual operation using private environment settings.

## EmailOtp lifecycle and cryptography

`EmailOtp` has one database identity per
`{ emailNormalized, purpose, contextKey }`, plus a unique unpredictable request ID.
Purposes are `REGISTER`, `LOGIN`, and `GUILD_INVITE`; public auth uses only the first
two and stores a null context. Status is `PENDING_SEND`, `SENT`,
`CONSUMED`, or `INVALIDATED`.

A code is generated with `crypto.randomInt(0, 1_000_000)` and left-padded to exactly
six digits. A 32-byte random request ID is base64url encoded. MongoDB never receives
the plaintext code. It stores HMAC-SHA256 over purpose, request ID, normalized email,
and code using `OTP_PEPPER`. Application verification uses a timing-safe digest
comparison before the atomic database consume.

V2.4 uses the Guild invite ID as the non-null context. REGISTER and LOGIN retain the
previous HMAC payload exactly, while the Guild context is included in its HMAC
identity. Multiple invitations to one email therefore cannot overwrite or validate
one another. The V2.4 migration replaces only the legacy two-field unique index; it
does not rewrite OTP or source documents.

Issuance replaces the previous eligible record as `PENDING_SEND`, calls the provider,
and marks the exact request `SENT` only after confirmed success. Confirmed send
failure invalidates it. Verification accepts only a matching `SENT` record that has
not expired and has fewer than five attempts; success atomically changes that exact
record to `CONSUMED`, so replay and concurrent double-use fail.

Codes expire after ten minutes. The service checks expiration immediately rather
than waiting for cleanup, and MongoDB has an `{ expiresAt: 1 }` TTL index with
`expireAfterSeconds: 0`. A maximum of five wrong attempts invalidates the record.

## Cooldown and distributed rate limiting

Every new request must wait 60 seconds after the prior request for the same normalized
email and purpose. A unique database constraint converts concurrent resend races into
the same cooldown response. Fixed-window counters live in `auth_rate_limits`, not
process memory:

- at most five sends per normalized email/purpose per 15 minutes;
- at most 30 code requests per client address per hour;
- at most 60 verification attempts per client address per hour.

Guild delivery additionally permits at most ten sends per inviter per hour and five
per normalized target per hour, using the same Mongo-backed limiter.

Limiter subjects are HMAC digests; raw email/IP values are not stored in that
collection. A unique scope/subject/window index makes increments concurrency-safe,
and a TTL index removes expired windows.

## Expiration maintenance review (V2.7)

MongoDB TTL remains the primary cleanup mechanism for both `email_otps` and
`auth_rate_limits`; each uses an `expiresAt` index with `expireAfterSeconds: 0`.
Application code checks OTP expiry synchronously, so MongoDB's asynchronous physical
deletion timing cannot extend validity. No retained invalidated/consumed record class
was found that needs separate nightly maintenance. Consequently an 11:59 PM OTP cron
is intentionally not implemented.

Scheduled Daily Quest email uses the same provider abstraction but is not an OTP
flow and does not change issuance, hashing, TTL, cooldown, attempt, rate-limit, or
session behavior. See [scheduled-email-reminders.md](scheduled-email-reminders.md).

## Registration and login flows

Registration endpoints are:

- `POST /api/v1/auth/register/request-otp` with `{ email }`;
- `POST /api/v1/auth/register/verify` with `{ email, requestId, otp, password }`.

An existing normalized account produces `ACCOUNT_ALREADY_EXISTS`. Successful final
verification consumes the code, creates one ACTIVE account with a bcrypt cost-12
password hash and `emailVerifiedAt`, then issues the existing opaque session. The
unique normalized-email index is the final concurrent account-creation guard. No
profile, configuration, baseline, timezone, rules, weight, history, XP, title,
reward, report, notification, or device record is created.

Login-code endpoints are:

- `POST /api/v1/auth/login/otp/request` with `{ email }`;
- `POST /api/v1/auth/login/otp/verify` with `{ email, requestId, otp }`.

Missing and disabled accounts receive the same request response shape as eligible
accounts but no email. A successful code login sets `emailVerifiedAt` only if null and
issues the standard session. Password login remains unchanged and does not set it.
All four OTP mutations require exact same-origin requests, accept no browser user ID,
and return private/no-store envelopes. The validator accepts either Next's exact
request origin or the server-configured `APP_BASE_URL`; it does not trust browser or
forwarded-host headers.

## Email templates

All templates share a dark table-based Winter Arc shell, inline styles, constrained
mobile width, HTML, and plain text. They remain materially distinct:

- registration: `Winter Arc — Verify Your Email`;
- login: `Winter Arc — Login Request`;
- reserved Guild invitation: `Winter Arc — Guild Invitation`.

OTP values never appear in a subject or preheader. The reserved Guild inviter name is
HTML-escaped and its template contains no operational acceptance link.

## Verification

Automated tests mock delivery and cover code/request generation, HMAC isolation,
normalization, duplicate accounts, send failure, expiration, attempts, cooldown,
email/IP limits, one-use consumption, concurrent guards, sessions, templates, and
blank account creation. Run the non-destructive Atlas index check without creating a
user:

```powershell
npm run verify:v2.2:database
```

After a production build is running on loopback port 3211, verify `/login`,
`/register`, and both OTP UI states at 320, 375, 390, 393, 430, 768, and 1024 pixels:

```powershell
npm run verify:v2.2:responsive
```

Live Resend email remains unverified until a new rotated key, authorized sender, and
explicit safe test recipient are configured. Stop after V2.2; V2.3 onboarding work is
not part of this phase.
