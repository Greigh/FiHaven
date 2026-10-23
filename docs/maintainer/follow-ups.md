# Follow-ups

Things that were **noticed and deliberately not fixed** — so they can be found
again instead of being rediscovered. This is a ledger, not a backlog: an entry
earns its place by naming something a future reader would otherwise have to
re-derive, and it leaves when someone fixes it.

Convention: one `###` per item, each with **Where**, **What**, **Why it was left**,
and **What it would take**. Add to the top. Delete the entry when it is fixed,
and put the fix in [CHANGELOG.md](../../CHANGELOG.md) instead.

> **A finding must be measured, not inferred.** Two entries drafted for this file
> have been withdrawn because the mechanism in them was reasoned out from a
> symptom rather than observed — Budget's lens was blamed on `StoreManager`
> missing the dev entitlement until `applyDevEntitlement` turned out to be called
> and logging `pro=true` (the real cause was the seed script, now fixed), and the
> summary strip was blamed for truncating at 640pt until a pixel scan showed its
> text running 252→623pt across the whole 404pt pane. Both times the cause was
> somewhere else. If an entry's **What** is a mechanism, say how it was observed;
> if it cannot be observed yet, say that instead. The same thing happened a third
> time with the pinned window: "AppKit is restoring an autosaved frame" and "520pt
> is below the content's honest minimum" were both wrong, and a stack sample off
> the resize notification (`NSHostingView.updateAnimatedWindowSize`) is what
> replaced them.

---

### A macOS window cannot enter full screen from a session that cannot activate the app

**Where** `ios/FiHavenApp/Sources/App/FiHavenApp.swift` (`FH_WIN_TEST`
exercise path) and any full-screen verification attempted from a shell —
`scripts/run-macos.sh` or a manual launch.

**What** `toggleFullScreen(_:)` is delivered — the window fires
`windowWillEnterFullScreen` and then `windowDidFailToEnterFullScreen`,
with the frame untouched. Measured twice on the same build: launched
directly (`FH_WIN_TEST=1 "$BIN"`) and through LaunchServices
(`launchctl setenv` + `open`), with `NSApp.activate` called first both
times. The diagnostic reads `active=false key=false onScreen=true` at the
moment of the attempt: the window server shows the window but never gives
the process foreground status, and AppKit refuses a full-screen
transition for an app that is not active. The window itself permits it —
`styleMask` carries `fullSizeContentView` and `collectionBehavior` is
`.fullScreenPrimary` — so the refusal is the session's, not the app's.
The same constraint is presumably why AppleScript `set bounds` requests
time out: this shell owns no Accessibility or Automation rights either.

**Why it was left** There is nothing in the code to fix — the transition
needs an activation the window server will not grant a process launched
from this environment. Everything else the resize path owns was verified
through the same hook: autosave restore at 640×520 and 1200×520, the
640×520 floor holding at settle (`contentMinSize` re-asserted by the
floor watcher), programmatic resize, and zoom to the full visible area
(`1728x1016 zoomed=true`).

**What it would take** A run from a context that can foreground apps —
an interactive GUI session, or a runner with the window-server rights this
one lacks — then `FH_WIN_TEST=1` reports `fullScreen=true/false` as
evidence either way. Until then, treat a full-screen refusal logged next
to `active=false` as environmental and do not touch the window code for it.

---

### The iPhone Duo's cover display keeps the inner window's geometry until the posture is cycled

**Where** The `iPhone Duo` simulator (`iPhone19,4`, productClass V68 — Apple's
foldable-iPhone profile, two displays: 466×678pt cover, 951×669pt inner).
Driven by `npx hinge` (read angle) and `npx duoctl` (set posture:
`open`/`close`/`book`/`tent`); `simctl` has no fold control, and
`screenConfig geometry` only accepts each display's native mode.

**What** After `duoctl close` — and again after `duoctl open` in the same
session — every app on the cover display renders at the *inner* display's
window geometry, clipped into the 466pt canvas. Observed on FiHaven and on
the system Settings app identically, so it is a simulator runtime bug, not
app code: a capture taken right after a fold looks like the app forgot to
relayout, and it did not. Rebooting the sim, or cycling `duoctl open` →
`close`, restores correct geometry. Separately: with the iOS 18
`Tab`/`TabSection` + `sidebarAdaptable` shell, iOS 27.1 still presents the
compact-width experience as a **right-edge icon rail** on both postures —
no bottom bar on the cover, no labeled sidebar on the inner display. That
is this runtime's own chrome choice (the same API gives iPad its top bar +
sidebar toggle); a Duo capture showing the rail is not evidence the tab
conversion failed. Re-verified on the installed runtime during the October
audit: cover (466×678) and inner (951×669) both compose FiHaven's shell
cleanly, Settings shows the same system strip on the cover, and a
cover→inner refold restores landscape geometry with state preserved.

**Why it was left** Both are the simulator's behavior, not the app's — the
rail is iOS's adaptive `TabView` presentation, and the stale geometry
affects every app including the OS's own. Nothing in the codebase can
correct either.

**What it would take** Nothing in the app. For captures: after any posture
change, either reboot the sim or verify with a control (e.g. Settings) that
the window geometry matches the active display before photographing; and
treat the rail as the Duo's expected chrome until a seed renders
differently. Re-check on a newer iOS seed — both look like early-foldable-
sim bugs that plausibly get fixed.

---

### The dev account is seeded, so empty states are no longer the default

**Where** `/tmp/fh-ipad/fh.db`, the DB the dev server on port 5222 runs against
(`FIHAVEN_TEST_DB_PATH`, visible in `ps eww`).

**What** The dev account `ipad@example.com` used to have no accounts, bills or
cards — every capture was an empty state, and a Mac review had to be a review of
`ContentUnavailableView`. It now holds **13 bills, 3 cards, 2 goals, 2 accounts,
4 transactions** from `scripts/seed-user-data.js --force --pro --onboard`, and its
`settings.budgetRule` is `50-30-20` and `dashboardLayout` is `widgets`. Screens
look different from older screenshots.

**Why it was left** Being able to see a populated table is the point. This is
recorded as *state*, not as a defect — there is nothing here to fix.

**What it would take** Nothing. Delete `/tmp/fh-ipad/fh.db` and re-seed to get the
empty states back; to photograph a specific empty state, seed a second account
rather than emptying this one. `user_data.data` is encrypted, so SQLite edits do
not work directly — if a screen needs a setting the seeder does not write, add it
to the seeder's `settings` block rather than patching the row.
