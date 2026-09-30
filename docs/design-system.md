# Winter Arc Design System

## Reference and intent

The primary visual reference is
`A:\Winter-arc\ChatGPT Image Sep 30, 2026, 04_13_21 AM.png`. It is used only for
layout direction, hierarchy, atmosphere, and system-window styling. Winter Arc uses
original assets and does not reproduce the characters, logos, illustrations, or
screens shown in that reference.

This private development reference stays local and is excluded from Git. No runtime
asset or build step depends on it.

The governing visual rule is black glass + light-blue border + white text + restrained
ice-cyan glow. **Purple is not the primary theme.**

## Tokens

Global tokens in `src/app/globals.css` are the source of truth:

- Background: `--background`, `--background-deep`, `--background-elevated`
- Surfaces: `--surface`, `--surface-hover`, `--surface-active`
- System accents: `--system-blue`, `--system-blue-light`,
  `--system-blue-bright`, `--system-blue-muted`, `--system-cyan`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`
- Status: `--success`, `--warning`, `--danger`, `--neutral`
- Edges: `--border`, `--border-muted`, `--border-system`
- Effects: `--glow-system`, `--glow-strong`, `--shadow-system`

Radius, spacing, typography, transitions, and surface opacity are centralized beside
the color tokens. Components should consume variables rather than introduce local
color literals.

## Typography

Major titles use a restrained cinematic serif stack; body, status, and control copy
use a highly readable system sans-serif stack. Display typography is reserved for
identity and panel headings. Compact uppercase labels use deliberate tracking but
remain large enough for iPhone viewing.

## SystemPanel

`SystemPanel` is a logic-free presentation primitive with optional eyebrow, title,
semantic element, custom class, and glow. It provides the thin ice-blue boundary,
corner accents, dark translucent surface, compact header, and consistent internal
spacing required by future system windows.

Glows are ambient cues, not primary boundaries. Text never relies on glow for
contrast. Panels use minimal radii and avoid the rounded-card language of generic
dashboards.

## Spacing and responsive behavior

The foundation screen is mobile-first at 320px and scales through 375px, 390px,
393px, 430px, tablet, and desktop widths. Content uses fluid type and spacing with a
500px readable maximum. Desktop adds a subtle device-like frame without changing the
information hierarchy.

The shell uses `100dvh`, prevents horizontal overflow, and applies iOS safe-area
insets on every edge. Controls maintain a touch-friendly height.

## Status and accessibility

Connected, checking, unavailable, and neutral states combine explicit text with a
small indicator; color is never the only signal. Focus rings use a high-contrast ice
blue. Semantic headings, definition lists, live status text, accessible button names,
and reduced-motion preferences are supported. Status colors must remain sparing and
must not displace the black/light-blue identity.

## Application surfaces and release states

Login, setup, profile, and the authenticated placeholder reuse the same token and
`SystemPanel` foundations. Forms use square dark fields, thin cyan focus boundaries,
compact uppercase labels, and explicit error text rather than generic rounded cards.
The five-step setup progress control remains keyboard-operable and collapses labels
on narrow phones while retaining numbered steps.

Measured source data, editable configuration, and calculated projections receive
different labels so the interface never presents an InBody-reported value as a new
application calculation. Disabled rules remain readable and are not communicated by
color alone.

Phase 13 adds one restrained System skeleton, consistent error/not-found surfaces,
and a reusable transient event for XP, level, rank, achievement, and weekly-mission
feedback. Motion uses opacity and transform only. `prefers-reduced-motion` collapses
all animations to a static state without hiding information. Calendar states include
text in every cell, and modal history detail follows focus-entry, Escape, containment,
and focus-return behavior.
