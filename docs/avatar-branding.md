# Avatar identity and Winter Arc branding - V2.5

## Boundary

V2.5 adds an optional cosmetic identity to an existing Winter Arc profile and aligns
the original Winter Arc mark across browser, PWA, authentication, and loading
surfaces. An avatar has no effect on XP, levels, rank, Arc Score, Daily Quests,
workouts, achievements, rewards, reports, or recovery. It is not an onboarding or
protocol-activation requirement.

## Controlled catalogue

`src/lib/avatar-catalogue.ts` is the browser-safe source of truth. It defines ten
stable character keys plus `SYSTEM_DEFAULT`, display names, descriptions, order, and
local image paths. Keys are persisted identifiers and must never be silently renamed
or reused. `SYSTEM_DEFAULT` is a projection only: persistence uses `avatarKey: null`.

`normalizeAvatarKey` accepts only a known character key. Unknown, missing, legacy, or
non-string values normalize to null. `getAvatar` then resolves null to
`SYSTEM_DEFAULT`. Paths are controlled application paths under
`/images/avatars/*.webp`; arbitrary URLs, path values, and browser-provided ownership
fields are never accepted.

The catalogue artwork is original Winter Arc material. New assets must not copy a
copyrighted character, logo, fan-art composition, or screenshot. Each shipped asset
is a square 512x512 WebP with a distinct silhouette and a coherent dark navy, ice
blue, cyan, and white palette. `scripts/prepare-avatar-assets.mjs` performs the
deterministic resize/optimization step. The source artwork is not required at
runtime.

## Persistence and API

`UserProfile.avatarKey` is nullable, defaults to null, and is constrained to the ten
stable keys. Existing MongoDB documents without the field remain compatible and are
projected as `SYSTEM_DEFAULT`; no migration auto-assigns a character.

`PUT /api/v1/profile/avatar` accepts exactly `{ avatarKey: KNOWN_KEY | null }`. It:

- requires the opaque authenticated session;
- derives `userId` exclusively from that session;
- applies the existing same-origin mutation policy;
- rejects unknown keys, URLs, paths, extra fields, and oversized bodies;
- updates only `UserProfile.avatarKey`, without upserting a missing profile; and
- returns a private, no-store response.

The picker at `/profile/avatar` loads the current server value, exposes native button
keyboard behavior and visible focus, communicates selection with text and
`aria-pressed`, and changes persistence only after explicit Save. Reset selects null
and also requires Save. A failed request leaves the saved-state label unchanged; the
server response is authoritative after success.

## Guild privacy

Guild projections apply avatar privacy on the server. When the viewed member has
`shareProfileSummary: true`, the normalized selected key may appear in the member
list, profile, Calendar header, report list, and report detail. When false, every one
of those projections returns `avatarKey: null`; React receives no private key to
hide. The null value renders the generic `SYSTEM_DEFAULT` mark.

Every projection still requires an ACTIVE bilateral Guild connection. Unconnected,
removed, and blocked users cannot read the member profile, avatar, Calendar, or
Reports. A selected key grants no access and accepts no cross-user mutation path.

## Brand and splash layers

The app icon remains the original geometric Winter Arc brand mark, never a user
avatar. The same mark is used for favicon, 192/512 manifest icons, the maskable icon,
Apple touch icon, Login/Register headers, and app-controlled loading screens.

Installed-PWA operating-system launch presentation is controlled by the manifest,
icons, theme/background colors, and platform-specific Apple metadata. Once web code
runs, `/launch.html` provides a short branded paint and hands off on the next paint
opportunity; App Router `loading.tsx` represents real route initialization. Neither
layer uses a timer or artificial minimum duration. Motion is limited to opacity,
transform, and restrained glow, and is disabled under `prefers-reduced-motion`.

The static launch page intentionally keeps visible `WINTER ARC` text, so branding
does not depend on image loading. Registration, Login, and Guild invitation email
templates likewise remain text-sufficient and do not load the logo from an external
host.

V2.6 reuses this brand mark and System palette for the compact mobile install prompt
and its manual instruction dialog. It never substitutes a selected avatar for the
app icon, splash, or install identity. Installation behavior and the operating-system
versus app-controlled boundary are documented in
[install-system.md](install-system.md).

## Expansion policy

Future avatar additions require a new stable catalogue key, an original optimized
asset, validation/schema inclusion, asset and privacy tests, and responsive review.
Removing a shipped key requires a documented compatibility mapping; do not allow
free-form uploads or external image URLs without a separate storage, moderation,
privacy, and content-security design.

## Verification

`tests/avatar-*.test.ts` validates the catalogue, files, fallback behavior, API,
ownership, reset, and gameplay isolation. `tests/guild-avatar-privacy.test.ts`
validates sharing and access revocation. `npm run verify:v2.5:database` is read-only
and fingerprints all profiles before/after. `npm run verify:v2.5:responsive` creates
isolated fixture users, checks seven viewport widths, and removes every fixture in
`finally`.
