# PWA startup screen

The manifest keeps the existing app identity (`id: /`) and uses `/launch.html` as
its launch URL. This public, data-free HTML shell shows SYSTEM LOADING, a cyan orbit,
glow and indeterminate progress bar without character images, web fonts, React,
authentication or database requests. The bar represents waiting, not a fabricated
completion percentage. Reduced-motion mode disables the animation.

The launch script gives the browser a paint opportunity, then replaces the current
history entry with `/`. Existing authentication and setup routing still decide the
destination. There is no artificial minimum delay or persistent startup flag.
Explicitly offline launches go to the existing offline page. A normal Enter System
link also works if JavaScript is unavailable or navigation stalls.

The service worker precaches only the three public boot assets alongside existing
safe assets. Those exact same-origin paths are cache-first; authenticated HTML,
APIs and tracking data remain network-only with the existing offline fallback.
Cache version v12-2 updates the asset set through the existing user-approved UPDATE
NOW flow. The Next root loading boundary provides matching image-free feedback
while the home route checks the session and configuration. Other route loaders keep
their existing design.

## Platform limits and rollout

### Centered update dialog

A waiting service worker opens a centered native modal instead of a top banner.
Its dimmed, 9px-blurred backdrop covers the entire app, including the header. Native
modal inertness blocks background interaction; keyboard focus is contained and body
scrolling is locked. Focus and scrolling are restored on dismissal. UPDATE NOW is
still the only action that sends SKIP_WAITING; LATER (or Escape before activation)
defers the prompt for the current visit so unfinished entries can be saved.

Offline mode disables installation but leaves LATER usable. During activation,
buttons are disabled and an updating indicator is announced. Synchronous failures
and a 15-second wait timeout restore retry/defer actions. The existing controllerchange
handler still performs the reload. Reduced motion removes entrance/spinner animation.

Production Chrome verification covers centered layouts at 320/390/768/1280px,
computed backdrop blur, native modal state, background focus blocking, keyboard
containment/restoration, offline dismissal, update message delivery, failure/retry,
timeout recovery and reduced motion, using a simulated waiting worker and no owner
login. `tests/update-dialog.test.tsx` covers labels and offline controls.

The browser/OS owns the native splash displayed before HTML can render; an animated
web loader cannot replace that first native frame. See the [web app manifest guide](https://web.dev/learn/pwa/web-app-manifest).
After deployment, apply SYSTEM UPDATE AVAILABLE / UPDATE NOW and reopen the PWA.
Existing installations may retain the old launch URL until the browser refreshes
the manifest; reinstalling the shortcut may be needed on some platforms. The root
loading boundary still covers the old `/` launch path once server HTML arrives.

## Verification

`tests/pwa-launch.test.ts` covers image-free markup, indeterminate accessibility,
paint-before-navigation, offline routing and reduced motion. Service-worker runtime
tests verify precaching, cache-first boot assets, missing-cache fallback, origin
isolation and that authenticated responses are not cached.

Production-mode headless Chrome checks cover widths 320, 390, 430, 768 and 1280,
the animated bar, reduced-motion styles, navigation handoff, actual service-worker
precaching and offline fallback. No browser errors were reported. A fresh isolated
browser profile was used; no owner login or private records were accessed.
