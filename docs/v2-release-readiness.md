# Winter Arc V2  final Vercel release readiness

## Release boundary

V2.8 is an audit and deployment-readiness phase. It adds no product feature, does
not redesign the interface, and does not deploy. The verified application remains a
single Next.js App Router project with MongoDB Atlas, Gmail SMTP through the existing
`EmailProvider`, optional Web Push, and the protected hourly notification scheduler.

## Vercel project configuration

No `vercel.json` is required. Vercel can detect the Next.js framework, install with
the lockfile, run `npm run build`, and deploy the framework output without a custom
output directory. Keeping vendor configuration absent also avoids committing a cron
cadence that may not be supported by the selected Vercel plan.

The project declares Node.js 24.x and all database, Nodemailer, scheduler, and push
routes use the Node.js runtime. MongoDB connections and in-progress connection
promises are cached on `globalThis` for warm serverless reuse. Production application
code does not write to a local filesystem; filesystem use is limited to development,
asset-generation, test, and verification scripts.

The scheduler remains externally callable at
`GET /api/internal/notifications/cron` with
`Authorization: Bearer <CRON_SECRET>`. Configure an hourly Vercel Cron only after
confirming plan support. Otherwise use any external HTTPS scheduler with the same
header. If a response includes `nextCursor`, continue with
`?cursor=<returned-cursor>` until it is null. Do not place the secret in the URL.

## Production environment variables

Set these private values in Vercel Project Settings. None may use a `NEXT_PUBLIC_`
prefix:

| Variable                     | Requirement                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| `MONGODB_URI`                | Required Atlas connection string                                 |
| `MONGODB_DB_NAME`            | Required database name                                           |
| `EMAIL_PROVIDER`             | Required for email; set to `gmail` for the active adapter        |
| `GMAIL_USER`                 | Required in Gmail mode                                           |
| `GMAIL_APP_PASSWORD`         | Required in Gmail mode; server-only App Password                 |
| `EMAIL_FROM`                 | Required in Gmail mode                                           |
| `APP_BASE_URL`               | Required deployed HTTPS origin for canonical links/origin checks |
| `OTP_PEPPER`                 | Required private random value, at least 32 characters            |
| `CRON_SECRET`                | Required for scheduler calls, at least 16 characters             |
| `WEB_PUSH_VAPID_PUBLIC_KEY`  | Optional as a set; required when Web Push is enabled             |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Optional as a set; server-only, required with push               |
| `WEB_PUSH_SUBJECT`           | Optional as a set; required with push                            |

`OWNER_EMAIL`, `OWNER_PASSWORD`, and `OWNER_DISPLAY_NAME` remain bootstrap-only
values for an empty database. They are not required by ordinary requests after the
original owner exists. Resend remains isolated optional compatibility code;
`RESEND_API_KEY` is not required when `EMAIL_PROVIDER=gmail`.

Missing Web Push configuration safely returns unavailable status while retaining
in-app notifications. Missing Gmail or OTP configuration fails closed at the email
boundary. Builds and automated tests mock delivery and never send email or push.

## Security and persistence audit

- API ownership comes from the opaque persisted session; routes accept no browser
  `userId`.
- Owner-scoped services and Guild sharing checks prevent cross-user/IDOR reads.
- Passwords use bcrypt cost 12; session cookies are HttpOnly/SameSite and only a
  SHA-256 token hash is stored.
- OTP HMAC identity includes purpose/context, replay is blocked by atomic consume,
  and distributed limits use hashed subjects.
- MongoDB TTL remains authoritative for OTP and rate-limit cleanup; no nightly cron
  is required.
- Scheduler access uses constant-time Bearer-secret comparison and Node runtime.
- Daily reminder claims use a unique database identity and bounded retry policy.
  Ambiguous SENDING records are not reclaimed, preferring a missed reminder over a
  duplicate email.
- Private APIs and authenticated data use `private, no-store`; the service worker
  bypasses all APIs and never caches authenticated navigation HTML.
- Scheduled email exposes only generic completion counts and never private habits,
  weight/body composition, OTPs, or credentials.
- `.env.local` is ignored and untracked. The release scanner reads only tracked or
  non-ignored worktree text and prints no matched values.

## Exact deployment checklist

1. Import the GitHub repository into Vercel with the Next.js framework preset.
2. Set all required Environment Variables listed above for Production (and Preview
   only when preview access to the same services is intentionally allowed).
3. Set `APP_BASE_URL` to the final deployed HTTPS origin, without a route suffix.
4. Configure an hourly scheduler: Vercel Cron when the plan supports it, otherwise
   an external HTTPS scheduler using the protected endpoint and Bearer header.
5. Deploy and confirm the production build and `/api/v1/health` response.
6. Test registration OTP delivery and verification with an authorized real mailbox.
7. Test password login and OTP login, including logout/session expiry.
8. Test a Guild invitation, code handoff, acceptance, and privacy-sharing controls.
9. Enable the separate email preference and test one incomplete Daily Quest reminder
   during the recipient's local 18:0018:59 window; confirm no duplicate.
10. Test PWA installation, launch, update prompt, and offline-safe fallback on target
    devices.
11. If Web Push is enabled, test permission, subscription, delivery, click routing,
    logout/different-user privacy fallback, and unsubscribe on real devices.

## Final verification commands

```powershell
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
npm audit
npm run verify:v2.8:secrets
npm run verify:v2.8:database
npm run verify:v2.8:responsive
npm run verify:v2.7:email-template
```

The responsive audit covers 320, 360, 375, 390, 393, 412, 430, 768, 1024, and
1280 pixels. The database audit is read-only. The email-template audit renders
locally and does not send.

## Physical and external verification still required

The code and automated architecture are release-ready, but the following cannot be
claimed until explicitly exercised after deployment:

- live Gmail SMTP delivery from Vercel;
- physical-device Web Push delivery;
- iPhone/iPad Add to Home Screen and native launch behavior;
- Android install prompt and standalone launch behavior;
- plan-specific Vercel Cron execution and continuation handling;
- production Atlas/Vercel network behavior under real serverless concurrency.

Stop here. Commit, push, Vercel import, environment entry, scheduler configuration,
and deployment require explicit user approval.
