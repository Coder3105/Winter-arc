# New-user onboarding and routine selection — V2.3

## Boundary

V2.3 evolves `/setup` into the only new-user System initialization flow. It adds no
Guild, friends, avatar, install banner, scheduled email, personal reward, or
post-activation protocol editor. A completed account is redirected to `/today` and
the activation service refuses to rewrite any existing ACTIVE protocol.

## Blank-account policy

Registration still creates identity and credentials only. The wizard starts with a
blank display name and blank optional height, current weight, goal weight, age, and
sex. Missing physical values persist as null, never zero. Activation does not create
an InBody or other body-composition assessment. Analytics that lack source inputs
remain unavailable.

The verified email may be displayed read-only but is never transformed into a
display name. Display name is trimmed and must contain 2–40 characters at activation.

## Six initialization steps

1. System Identity — display name and read-only verified email.
2. Profile — optional physical/demographic inputs.
3. Daily Protocol — selected rules and explicit numeric targets.
4. Training — explicit 1–7 distinct-day weekly workout target.
5. Winter Arc — explicit IANA timezone and start date; duration is fixed at 90 days.
6. Activate — final read-only confirmation and explicit activation action.

The browser timezone is displayed as a suggestion only. It enters wizard state only
after **Use This Timezone** is pressed and reaches MongoDB only on draft save or
activation. **Start Today** is likewise an explicit button; a supported future date
is allowed.

## Draft and activation lifecycle

`OnboardingDraft` stores only explicitly saved temporary wizard values under unique
`userId`. It is separate from active source documents so closing the browser cannot
create a partial protocol or require fake dates and metrics. Drafts are private,
resumable, and do not create history, XP, assessments, or Daily Quest records.

Final activation is centralized and owner-scoped. It validates all required fields,
resolves catalogue metadata on the server, creates the existing `UserProfile` and
fixed 90-day ACTIVE `WinterArcConfig`, updates the account display name, and removes
the draft. A unique partial active-protocol index and atomic upsert prevent duplicate
ACTIVE configurations. Repeating activation returns the already active protocol
without changing it.

## Daily Quest catalogue and selection

The shared catalogue contains 11 rules: Morning Weight, Sleep, Hydration, Steps,
Nutrition, No Junk Food, No Fap, Reading, Meditation, Journaling, and Stretching.
Global labels, descriptions, types, ordering, privacy, suggested placeholders, and
technical target bounds live in code rather than being duplicated per user.

Sleep, Hydration, Steps, and Nutrition are visually preselected for a brand-new
unsaved wizard. Their numeric targets are deliberately blank; a placeholder is not
persisted and the user must enter each target. All other rules are unchecked. No Fap
is marked private, uses neutral copy, and is never preselected. Activation requires
at least one selected rule.

Technical target ranges are Sleep 1–24 hours, Hydration 0.1–20 litres, Steps
1–100,000 whole steps, and Reading/Meditation/Stretching 1–1,440 whole minutes.
Nutrition, No Junk Food, No Fap, and Journaling use generic binary state. Morning
Weight is optional and remains derived exclusively from the canonical `WeightRecord`.

Selected metadata and targets enter the user's configuration; future Daily Quest
records take immutable snapshots. Historical snapshots are never changed. Completion
and Perfect Day use all applicable selected rules, regardless of whether that count
is 1, 4, 7, or 11. Calendar, streak, weekly report, and generic reminder projections
read those same snapshots.

## XP policy V2 and privacy

New Reading, Meditation, Journaling, and Stretching PASS events award 10 XP each.
`PROGRESSION_RULE_VERSION` is 2 for newly inserted events. All legacy rule amounts,
Perfect Day (25), workout day (30), and secured weekly mission (100) remain unchanged.
Existing V1 ledger events keep their stored XP and version across revocation and
reactivation. Daily potential XP is derived from the actual snapshot.

No specialized reminder category is added for the four new rules. The external
Daily Quest push body reports only aggregate completion counts; it does not expose No
Fap or another rule name. Detailed actionable names remain inside the authenticated
private inbox and Today screen.

## Existing-owner preservation and next boundary

The original completed account never enters this wizard. V2.3 does not alter its
profile, body data, start date, targets, selected rules, history, XP, achievements,
reports, UI theme, or animation system.

V2.4 remains additive to onboarding. Guild invitations require an existing ACTIVE
account and never create an account, profile, protocol, or onboarding draft.
