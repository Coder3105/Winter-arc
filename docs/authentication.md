# Authentication and account lifecycle — V2.2

## Account identity

The existing `owners` document is the user account. V2.1 deliberately keeps its
collection, `_id`, password hash, and relationships; `UserModel` is a compatibility
alias, not a second identity. `normalizeEmail` trims and lowercases the canonical
identity. `emailNormalized` has a database-enforced unique index.

Account status is explicit:

- `ACTIVE` may authenticate and hold sessions;
- `PENDING_VERIFICATION` cannot authenticate;
- `DISABLED` cannot authenticate or receive a newly issued session.

Legacy access is accepted only while a document has no `status` and has
`isActive: true`. The V2.1 migration removes that transitional state. The original
bootstrapped account remains ACTIVE. Its `emailVerifiedAt` is null because V1 did
not record a verification event; V2.1 does not invent a timestamp.

## Passwords, email codes, and sessions

Password hashes remain bcrypt cost 12 and are excluded from normal account queries.
Password login uses the canonical email and returns the same failure result for an
unknown email and an incorrect password. It remains fully supported and does not set
`emailVerifiedAt`; historical password access is not treated as a recorded email
verification event.

Public `/register` keeps email, password, and confirmation only in React memory while
requesting a registration code. Final verification submits email, request ID, code,
and password; only then is the password hashed with the existing bcrypt cost and the
ACTIVE account created. No plaintext password enters MongoDB, storage, cookies, logs,
or the initial request-code payload. The resulting session uses the existing opaque
cookie contract and routes the blank user to `/setup`. Any later password or
email-code login passes through the root setup gate: incomplete accounts return to
setup, while completed accounts continue to `/today`.

`/login` offers password and email-code modes. The code-request response is generic
for missing and disabled accounts; only an eligible ACTIVE account receives mail.
Successful code login sets a previously null `emailVerifiedAt`, updates last login,
and creates the same AuthSession used by password login. See
[email-otp-auth.md](email-otp-auth.md) for lifecycle and abuse controls.

Each `AuthSession` belongs to exactly one `userId`. A raw 256-bit opaque token is
sent only in the HttpOnly, SameSite=Lax cookie, which is Secure in production;
MongoDB stores its SHA-256 hash. Validation checks token form, expiry, revocation,
and the status of that exact account. Revocation hashes and updates only the supplied
token, so one user's session does not revoke another user's session.

## Authorization contract

Personal routes resolve the current account from the session. A route never accepts
`userId`, owner ID, or account ownership from browser input. Services include that
trusted `userId` in reads, writes, upserts, exact-ID operations, calendar/date
lookups, and report-week lookups. Personal API envelopes remain `private, no-store`,
and the service worker bypasses every API response.

Legacy helper names such as `getApiOwner` remain as low-churn compatibility names;
“owner” now means the authenticated user who owns the requested resource, not a
global singleton. New server code may use `getAuthenticatedUser` and
`requireAuthenticatedUser`.

## Boundaries

`createUserAccount` is server-only and has no public route. It can create only the
account credentials and lifecycle metadata. It cannot create a profile, protocol,
baseline, quest, weight, workout, XP event, achievement, reward, report,
notification, push subscription, or personal preference. Registration verification
may create only that identity. V2.3 onboarding accepts the authenticated account only
and never derives display name or personal defaults from the registration email.
Guild invitations remain V2.4.
