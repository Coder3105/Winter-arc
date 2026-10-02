# Guild / Friends and privacy-controlled sharing — V2.4

## Boundary

V2.4 implements private bilateral friend connections inside the user-facing Guild
section. It is not a group-guild, chat, activity feed, leaderboard, or notification
system. The current five-item primary navigation remains unchanged; Guild is
available through the authenticated System drawer and Profile. V2.5 adds selectable
character avatars without changing Guild authorization or sharing ownership.

## Invitation lifecycle

`GuildInvite` stores the authenticated inviter, normalized target email, optional
resolved invitee account, status, seven-day expiration, current OTP request ID, and
auditable lifecycle timestamps. Status is `PENDING`, `ACCEPTED`, `DECLINED`,
`CANCELLED`, or `EXPIRED`. Expired invitation history is retained. A partial unique
index permits only one pending invitation from an inviter to one normalized target.

The centralized email normalizer is the only email identity implementation. Self
invites fail with `CANNOT_INVITE_SELF`. The target must resolve to an existing ACTIVE
account; otherwise the request fails with `GUILD_ACCOUNT_NOT_FOUND` before an invite
or OTP is created. A reciprocal pending invite is surfaced as an existing request
rather than creating a conflicting relationship.

Initial sending and inviter-initiated resend use the existing `EmailProvider`.
Confirmed delivery failure removes a newly reserved pending invite and the OTP service
invalidates the unusable code. Automated verification uses a mocked provider; a live
Guild email is not sent without a separately authorized test target.

## Invite-specific OTP security

Guild acceptance uses the V2.2 cryptographically random six-digit OTP, HMAC with
`OTP_PEPPER`, opaque 43-character request ID, ten-minute expiry, five-attempt limit,
60-second cooldown, and Mongo-backed rate limiting. Guild email limits are 10 sends
per inviter per hour, five per normalized target per hour, plus the shared IP ceiling.

`EmailOtp.contextKey` is the Guild invite ID. The unique identity is now
`{ emailNormalized, purpose, contextKey }`. REGISTER and LOGIN store a null context and
retain their original HMAC payload exactly; existing auth behavior is unchanged. A
Guild code hash includes its non-null invite context, so one email receiving multiple
requests has isolated codes and one invite can never validate another. Run
`npm run migrate:v2.4` once before deploying V2.4 to replace the legacy two-field
unique index safely without rewriting OTP or source documents.

The code is delivered to the existing target account. The target shares it with the
named inviter only when approving the connection, and the authenticated inviter enters
it from the outgoing request. Only the inviter may verify, resend, or cancel a pending
outgoing request. The authenticated target may decline without an OTP. Successful
verification consumes the OTP, activates the deterministic connection pair, and marks
the invite accepted. The connection upsert, consumed-code lookup, and accepted-invite
reconciliation are idempotent: concurrent valid requests converge on one pair and
retries can complete a write interrupted after code consumption.

## Bilateral connection

`GuildConnection` stores sorted `userAId` / `userBId`, unique `pairKey`, lifecycle
status, acceptance/removal time, and optional blocker. `pairKey` is the two normalized
ObjectId strings sorted and joined with a colon. Therefore A→B and B→A are one logical
relationship. Pending state belongs only to `GuildInvite`.

`ACTIVE` permits Guild projections. `REMOVED` immediately denies both directions but
allows a future verified invite to reactivate the same pair record. `BLOCKED`
immediately denies both directions, cancels pair invitations, records the blocker, and
cannot be reactivated by a new invite. No relationship is hard-deleted.

## Sharing preferences

`GuildSharingPreferences` is unique per owner. Missing documents resolve in memory to
these safe defaults; a document is written only when the owner saves settings:

| Setting          | Default |
| ---------------- | ------- |
| Profile summary  | ON      |
| Calendar         | ON      |
| Weekly reports   | ON      |
| Progression      | ON      |
| Workout summary  | ON      |
| Exact weight     | OFF     |
| Body composition | OFF     |
| Private habits   | OFF     |

Only the authenticated owner can update the complete strict settings object. Every
friend request reads current settings, so turning a setting off takes effect on the
next request without reconnecting or signing in again.

## Friend-safe projections

Guild endpoints never return an owner Profile, Calendar, Report, or Progression API
response directly. `guild-projection-service.ts` first requires an ACTIVE canonical
pair, then constructs a dedicated whitelist:

- member profile: display name, privacy-filtered avatar key, optional title, challenge
  summary, permitted streaks, and permitted level/rank/XP summary;
- Calendar: date, challenge day/week, display state, perfect/completion summary, with
  optional workout counts and optional weight fields;
- Weekly Reports: period, Arc Score, System label, discipline summary, catalogue-safe
  rule compliance, and only enabled workout/progression/weight/body sections.

Raw Daily Quest responses, notes, workout notes, recovery protocols, progression
events, sessions, OTP data, notification records, push subscriptions, email metadata,
password metadata, and owner-only profile fields never enter these projections.
System evaluation prose is not shared because it can embed private rule names,
recovery, or weight observations.

V2.5 treats the selected avatar as part of Profile summary sharing. When
`shareProfileSummary` is on, the normalized key may appear in the member list,
profile, Calendar header, report list, and report detail. When it is off, every one
of those server projections returns `avatarKey: null`, which renders the generic
System default. The selected key is not sent to React and merely hidden with CSS.
Removed, blocked, and unconnected members fail the same ACTIVE-pair gate before any
identity lookup.

Private rule filtering uses `DAILY_RULE_CATALOGUE.private`. Unknown future rule keys
are private by default. `no_fap` is absent from every default Guild profile, Calendar,
and Report response even when Calendar and Reports are enabled. It appears only as an
appropriate report-level compliance row after the owner explicitly enables private
habit sharing; raw values are never shared.

## API and cache policy

All routes require the opaque authenticated session, accept no browser ownership ID,
and return `Cache-Control: private, no-store`:

- `GET|POST /api/v1/guild/invites`
- `POST /api/v1/guild/invites/[inviteId]/resend`
- `POST /api/v1/guild/invites/[inviteId]/accept`
- `POST /api/v1/guild/invites/[inviteId]/decline`
- `DELETE /api/v1/guild/invites/[inviteId]`
- `GET /api/v1/guild/members`
- `DELETE /api/v1/guild/members/[memberId]`
- `POST /api/v1/guild/members/[memberId]/block`
- `GET /api/v1/guild/members/[memberId]/profile`
- `GET /api/v1/guild/members/[memberId]/calendar?month=YYYY-MM`
- `GET /api/v1/guild/members/[memberId]/reports`
- `GET /api/v1/guild/members/[memberId]/reports/week/[week]`
- `GET|PUT /api/v1/guild/sharing`

A `memberId` chooses a view target; it never grants access. Every view rechecks the
requester-to-target ACTIVE pair, preventing cross-user IDOR. Mutations require the
same-origin policy.

## Verification

The automated suite covers normalization, self/duplicate/reverse invites,
existing-active-account lookup, send failure, expiration, inviter-only resend and
verification, target decline, attempt limits, wrong context, concurrent verification,
canonical pairs, removal, block, re-invite, defaults, projection omission,
private-rule filtering, and authenticated API boundaries.

Run `npm run migrate:v2.4`, then `npm run verify:v2.4:database`. The verifier checks
the Guild and contextual OTP indexes, creates no fixture or account, and fingerprints
the original owner's profile, protocol, assessments, Daily Quests, progression, and
reports before and after verification.
