# Mobile Install System experience - V2.6

## Boundary

V2.6 adds device-local installation guidance. It does not change authentication,
onboarding, Guild, avatars, tracking, push delivery, service-worker caching, MongoDB,
email, or scheduler behavior. `/install` remains the full cross-platform guide; the
compact prompt is an additional mobile-browser entry point.

## Eligibility

`InstallSystemController` is the single browser event owner. Server rendering always
returns an ineligible snapshot, so no banner flashes before hydration. After mount,
the compact prompt requires all of the following:

- a viewport at or below 64rem plus coarse-pointer or touch capability;
- browser mode rather than installed standalone mode;
- no active seven-day dismissal cooldown; and
- either a captured `beforeinstallprompt` event or conservative iOS/iPadOS detection.

Desktop `beforeinstallprompt` events may still power the explicit button on
`/install`, but never automatically produce the bottom panel. Non-iOS mobile browsers
without a native event remain hidden because the app cannot promise an install flow.
The panel is also suppressed on `/install` to avoid duplicating the full guide.

Standalone detection combines `matchMedia("(display-mode: standalone)")` with
`navigator.standalone === true`. The Apple check recognizes iPhone/iPad/iPod and the
desktop-style `MacIntel` iPad signature only when multiple touch points are present;
it is not a broad user-agent parser. Standalone state always overrides stale local
dismissal data.

## Android and Chromium native flow

The controller captures `beforeinstallprompt`, calls `preventDefault`, and retains
the one event. It never calls `prompt()` during page load. Only an explicit
`INSTALL SYSTEM` action consumes it. The event is cleared before calling the browser,
so it cannot be reused accidentally.

Accepted choice hides the panel for the current runtime but does not claim that
installation completed. Only standalone detection or the browser's `appinstalled`
event marks the install state as installed. Dismissed choice writes the normal
cooldown. An unavailable/failed native prompt is reported without claiming
installation. `appinstalled` immediately clears pending prompt and transient
instruction state, hides the surface without a refresh, and removes obsolete
dismissal storage.

## iPhone and iPad manual flow

iOS/iPadOS does not receive a fake programmatic install. `INSTALL SYSTEM` opens an
accessible System-styled dialog explaining:

1. open the browser Share or menu controls;
2. choose Add to Home Screen; and
3. confirm Add, then launch from the new icon.

The wording is browser-generic because current iOS browsers can expose different UI.
The dialog uses native modal semantics, title/description association, initial title
focus, a trapped Tab sequence, Escape cancellation, a labelled close control, body
scroll locking, focus restoration, and a link to `/install`. `GOT IT` dismisses the
automatic prompt for the normal cooldown; it never displays a false install-success
message.

## Dismissal and device scope

The namespaced local key is:

```text
winter-arc:install-prompt-dismissed-at
```

Its timestamp remains active for seven days. The preference is intentionally shared
by accounts using the same browser because installation is device state, not account
data. A storage exception falls back to an in-memory timestamp for the current app
runtime and never crashes the UI. No value is sent to MongoDB.

## Layout and input safety

The panel measures an optional `[data-mobile-navigation]` element through
`ResizeObserver` and writes `--mobile-navigation-height`. Its bottom offset combines
that measurement, `env(safe-area-inset-bottom)`, and compact spacing. The current
Winter Arc primary navigation is a modal drawer and has no fixed bottom-navigation
element, so the measured value is zero today. This contract prevents overlap if a
fixed mobile navigation is introduced later.

The panel is compact, scrollable under short landscape browser chrome, uses 44px
controls, and stays below modal/top-layer dialogs. It is temporarily removed while an
input, textarea, select, or editable element has focus, preventing interference with
Login, Registration, OTP, and Setup keyboards. Entry motion uses only opacity and
vertical transform and is disabled by `prefers-reduced-motion`.

## PWA and privacy invariants

Manifest identity, icons, maskable icon, Apple touch icon, launch branding, offline
fallback, update flow, and push contracts are unchanged. The service worker still
bypasses `/api/*`, treats navigations as network-only, caches no authenticated HTML,
and stores only the existing public shell/static allowlist. V2.6 adds no service
worker cache entries.

## Verification and physical-device limitation

Unit tests inject browser/media/storage fakes for native acceptance/dismissal,
one-time event use, cooldown expiry, storage failure, iPad detection, standalone
priority, `appinstalled`, cleanup, and accessibility. The responsive verifier uses
disposable Atlas users and simulated iOS/Android capabilities at 320, 360, 375, 390,
393, 412, 430, 768, and 1024 CSS-pixel widths, plus an 844x390 short landscape
viewport. It covers authenticated and public pages, including Setup, and verifies
bounds, touch targets, form suppression, dialog focus, native dismissal storage,
desktop hiding, standalone mode, and fixture cleanup.

Simulation cannot prove a real operating system placed an icon on a Home Screen.
Physical iPhone and Android installation must therefore be reported as **NOT
VERIFIED** unless an actual device is separately tested.

V2.7 owns scheduled Daily Quest email and OTP maintenance work. V2.6 configures no
cron schedule and changes no email template.
