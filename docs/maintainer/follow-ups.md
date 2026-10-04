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

### The changelog has two `## [1.6.4 build 55]` sections, and the load-bearing one is the empty one

**Where** `CHANGELOG.md`: `## [1.6.4 build 55] — 2026-09-20` (L1419) and
`## [1.6.4 build 55] — 2026-09-15` (L1467).

**What** Two sections for one version and build. The 09-20 one carries 1.6.4's
real payload (Account Balances review, the terminal-4xx sync fix, offline cache
scoping, the SSE leak fix) and a `What made up this version` table — but no link
anywhere points at its heading. The 09-15 one is a four-row status table and a
one-line summary whose text, "Account Balances bank review, security hardening,
memory leak fixes, and public changelog", is **1.6.3 build 54's** payload; it is
also the heading the 09-20 section's own table links to
(`| [55](#164-build-55--2026-09-15) |`), the only inbound link to either. So the
section with the content is the orphan and the section with none is the one the
file treats as canonical. Nothing enforces one section per build:
`scripts/nativeVersions.test.js` only asks that some heading exists for the
version being shipped, and `bump-build.js`'s `sectionRange` takes the first
match it finds.

**Why it was left** It is history in a 7,000-line file, and the collapse is a
content decision — relabel the 09-15 block to the build its text actually
describes, or delete it and repoint the table — not a side effect of drafting the
next train.

**What it would take** Pick the date 55 shipped, then either relabel the 09-15
section to 1.6.3 build 54 or delete it and repoint `| [55](…) |` at the surviving
heading; then check the 1.6.3/54 table below still points at a heading that
exists.

---

### The Mac sweep's window size is not a size the app can prove

**Where** `scripts/run-macos.sh` (`SWEEP_SIZE`, `FH_WINDOW`),
`ios/FiHavenApp/Sources/App/FiHavenApp.swift` (the `FH_SNAPSHOT` pin).

**What** `--size 1280x820` is honoured by the capture only after a second or
two of the run loop re-asserts it, and the sweep reports both numbers — what it
asked for and what the app logged. In a six-capture run that is enough: every
row came back at the size asked for. The limit is that a *first* capture can be
photographed at a size SwiftUI proposed and the guard had not yet put back, and
nothing in the sweep distinguishes "the app refused this size" from "the harness
had not finished arguing with it" beyond the two numbers and a `asked …, got …`
note. The note is deliberately not a flag, because a row flagged for a size the
harness itself landed on is worse than no flag.

**Why it was left** The current behaviour is measured and the floor sweep is
clean at exactly 640x520, so there is no failure to reproduce — this is a known
limit of what the harness can attest to, recorded so a future reader does not
read "the row says the right size" as proof the layout renders at that size. The
real answer is a layout report from the app at the pinned size (a max width the
view actually laid out at), which is a change to the capture path rather than to
the sweep.

**What it would take** Have the app log the size its content settled at
independently of the window frame, and have the sweep compare that against
`--size` and flag a mismatch. Then `asked/got` could be dropped rather than
explained.

---

### The phone sweep cannot photograph a narrow iPad, and no hook can rotate one

**Where** `scripts/run-ios.sh` (no width or orientation axis) and
`ios/FiHavenApp/Sources/App/FiHavenApp.swift` (`FH_VIEWPORT`).

**What** The Mac sweep has a documented second pass at 640x520 — the floor
width, where a second column starves its neighbour — and the iPhone/iPad sweep
has no equivalent. A simulator's screen is its device's screen: `simctl` has no
rotation control, the Simulator's own rotation needs Accessibility permission,
and a window cannot be resized. The iPhone is 393pt wide, so *its* floor is
already in every capture; the iPad is not. An iPad in portrait is 1032pt and in
Split View is about 507pt, with Slide Over narrower still, and those are the
widths at which the iPad's own layouts decide what to drop — the adaptive
`TabView` sidebar, the two-column stacks `MacPaneColumns` grew. Nothing in
`npm run run:ios -- --sweep` photographs any of them.

**Why it was left** The device *is* the width axis on iOS, and picking a narrower
device photographs a different product rather than the same one at another size:
an iPad mini is 744pt, not 507pt, and a layout that is right on it is not proof
about Split View. Making the sweep able to say "iPad at 507pt" means a hook that
lays the app out in a fixed logical window on a device that is physically wider,
which is what `FH_VIEWPORT` does and what it was built for (it lays out at
1376x1032 today, which a portrait iPad never reaches). That is a new piece of
harness work on a sweep that is otherwise answering its question, and it is not
this round's change.

**What it would take** An orientation or width argument on `run-ios.sh` that
sets `FH_VIEWPORT` alongside the device, and a check that the capture came out at
the size asked for — the iOS sweep already reports the pixel size every row
photographed at and knows the device's, so the comparison is half of it. Worth
deciding against, too: `FH_VIEWPORT` on iOS is a debugging hook, and a sweep
that photographs a layout no device ever ran is its own kind of plausible-looking
wrong picture.

---

### A sweep PNG has no sidebar in it, and it is not the app's fault

**Where** `scripts/run-macos.sh` (every `--sweep` capture) and
`ios/FiHavenApp/Sources/App/FiHavenApp.swift` (the `FH_SNAPSHOT` path).

**What** The source list is missing from every sweep PNG: x 0–220pt of a
1280x820 capture is a flat, single-colour `#ffffff` field with no text in it
at all, while the detail column starts at the sidebar's 236pt edge. Observed by
decoding the PNG and scanning it — the whole sidebar region holds exactly one
colour, and a brightness/texture map of the image shows 14 table rows in the
detail column and nothing beside them. The app is fine: `FH_DUMP_VIEWS=1` on
the same launch reports `_NSSplitViewItemViewWrapper 236x860@0,0` with the
sidebar's `ListCoreScrollView 236x800` and its 46pt footer accessory. The rows
are hosted in the AppKit outline-table layer rather than in the SwiftUI content
layer, and the window capture does not composite that layer.

**Why it was left** The capture path is the app photographing its own window;
getting the outline rows into the image is a change to how it rasterizes, and
this work is a documentation change to the release procedure. It is documented
in `ios/README.md` instead, next to the other two things a capture cannot show.

**What it would take** Either capture through a path that composites the AppKit
layer (`CGWindowListCreateImage` on the window's own layer tree, or a
`CALayer` render of `window.contentView.layer` including hosted sublayers), or
compose the sidebar into the PNG from the second `FH_SNAPSHOT_SIDEBAR` capture
and a `view`/`ImageRenderer` pass. Either way the check is the same one that
caught this: a capture whose left 236pt holds exactly one colour is missing
something, and nothing in the sweep's own table notices.

---

### `identical to` fires on a strip at the bottom of the detail column

**Where** `scripts/run-macos.sh`, the `shasum`-based duplicate check in
`sweep_main`.

**What** The `happy` and `free` captures of Bills — a screen the entitlement
does not gate — are sometimes byte-identical and sometimes not. Measured: with
the same binary family, `01-bills__happy.png` and `02-bills__free.png` hashed
equal in one sweep and differed in the next, by exactly **98120 pixels, all of
them in rows 1575–1622 and columns 492–2539** — a flat 24pt strip across the
bottom of the detail column, `#333333` where `happy` had the body's `#292929`,
with no glyphs in it. The same launch's view tree is identical in the two
states (`rows=13 cols=7`, the same `pane` widths, the same 46pt footer
accessory), so the strip is not the entitlement. The only code change between
the two sweeps was re-keying a `#if DEBUG` logging task, which is the kind of
change that moves a layout pass by one turn.

**Why it was left** The check is right to complain about two screens that
photographed the same bytes — that is the failure it exists for — and the
noise is in the *pair* it is comparing, not in the check. Narrowing it would
mean comparing only the detail column or ignoring a band, which is how the
check stops noticing a route that never applied.

**What it would take** Nothing, most likely: the strip is a capture-timing
artifact, and the next sweep decides whether it recurs. If it does, the honest
fix is to say so in the note — `identical to` on a `happy`/`free` pair of a
*paywalled* screen is a finding, and on any other pair it is a question — rather
than to make the comparison smarter.

---



### A window restored shorter than 661pt grows back, and nothing owns the frame

**Where** `Sources/Theme/PlatformStyle.swift` (`FrameGuardView.apply(to:)` on the
restored path) and the `Window("FiHaven", id: "main")` scene in
`Sources/App/FiHavenApp.swift`.

The guard's own claim is that a user who resizes the window gets that window
back ("lets AppKit remember the user's own resize"). **Measured, it does not**,
and this is not a harness artifact — no `FH_WINDOW`, no pin, no watcher, just the
ordinary launch path:

```
[Window] FiHavenWindow frame 640x520 restored=true in 1728x1016 visible
[Snapshot] wrote /tmp/… window=640x661        # six seconds later
```

A saved `1200x520` came back `1200x661`. The width is never touched; the height
is raised to the same 661 whatever width the frame asked for (measured at 640 and
1200), and the same 661 is what all seventeen logs of the pinned floor sweep were
arguing over, so the number is not a property of one screen.

**What asks, measured** The stack under the resize is SwiftUI's:
`NSHostingView.windowDidLayout` → `NSHostingView.updateAnimatedWindowSize`, on
every layout pass. It is not AppKit restoring a frame — `NSWindow Frame main` does
not exist in this app's defaults, and the ordinary path adopts `NSWindow Frame
FiHavenWindow` itself.

**What number it asks with** `FH_DIAG_FRAME=1` prints the proposers at the moment
the guard undoes a resize, and it is not any view's ideal size: every
`fittingSize` in the window measures `0x0`, including the content view and the
`AppKitWindowHostingView` that *is* the SwiftUI tree. What is left is the
window's own **minimum**:

```
[DiagFrame] content=640x520 fit 0x0 | contentMin=140x556 | AppKitWindowHostingView 640x520 fit 0x0
[Window]   … put back from 640x661 (×32 so far)
```

`140x556` is the same on every one of the seventeen screens and at every width, and
661 − 556 is 105pt — this Mac's titlebar and toolbar. So the sequence is arithmetic,
not a mystery: SwiftUI installs a 556pt content minimum, the guard's 640×520 frame
leaves only 415pt of content, and AppKit grows the window to satisfy a minimum the
guard is about to contradict. `MacWindowDefaults.minSize` (640×520) is not a lie
the guard papers over — every 640×520 floor capture is a real screen with a real
table in it, and no table on that sweep settled below 372pt — but it is not the
floor in force, because **SwiftUI replaces the guard's `contentMinSize` with its own
within a second of launch**. A user can drag the window to 140pt wide.

**What is ruled out** Clamping an *ideal* does not touch this. A `GeometryReader`
around the detail column, around the split view, and `maxHeight: .infinity` on the
sidebar were each measured at the floor: the 661 proposal survives all three
unchanged, at 32 corrections per 5s screen run. The same clamp is what fixed the
other, much larger proposal (a rigid-height banner asking for 1440x2984 — see
`MacShellView`), so the two are different problems and only the ideal one is
clampable.

**Why it was left** Two fixes are available and both are riskier than the entry
is worth on its own. (1) Re-assert the restored frame in Release: a bounded
re-assert does not work — the moment it stands down, `updateAnimatedWindowSize`
proposes again on the next layout, so it would have to run for the life of the
window, and then it fights the zoom button, full screen and any programmatic
resize unless each of those is detected and excluded. (2) Get the content's minimum
below the frame's, at the scene: `.windowResizability(.contentMinSize)` asks SwiftUI
to take the minimum from the content instead of declaring one, and whether its
content then reports 415pt or 556pt is the experiment. That changes shipping window
behaviour, so it is a decision, not an edit.

**What it would take** Read the minimum SwiftUI installs and lower it — one build
with `.windowResizability(.contentMinSize)` and a `FH_DIAG_FRAME=1` run at 640x520
says which. Then re-measure the two numbers above: they are the regression test for
whatever the fix is. `scripts/run-macos.sh` now counts frame corrections
(`SWEEP_FRAME_FIGHT_MAX`) so the *next* proposal cannot hide — this one is left
under the threshold on purpose, because it corrects 32 times per screen and every
capture is still exact, while the bug that check was added for corrected 344 times
and captured blank.

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

---

### The phone sweep photographs no signed-out screens

**Where** `scripts/run-ios.sh`; the shared list is `SWEEP_SIGNED_OUT` in
`scripts/sweep-matrix.sh`.

**What** The three screens that exist only before a session — the first-run
tour, the sign-in screen, and that screen with the security check revealed —
are in the shared list and the Mac sweep photographs them. The phone sweep
reads the same list but has no signed-out block, so `run-ios.sh --only intro`
fails as an unknown name while `run-macos.sh --only intro` captures it. The app
hooks the samples need (`FH_SIGNED_OUT`, `FH_INTRO_SEEN`) are in the shared app
code, and iOS `simctl` photographs whatever the simulator shows.

**Why it was left** The Mac block was the one being verified end to end this
round (measured: 3/3 captured, 0 flagged, 49s), and the phone needs its own
path confirmed: the samples launch with no session, `simctl io screenshot`
takes the whole device screen rather than the app's window, and the reveal
timing (`auth-stalled` waits 14s for either the drawn widget or the 12-second
deadline) is worth measuring against the simulator's Turnstile page before it
is called covered. Adding it half-verified puts `ok` rows on screens nobody
opened, which is the failure the matrix exists to prevent.

**What it would take** The split `run-macos.sh` does: choose from the union of
screens and `SWEEP_SIGNED_OUT`, partition on `sweep_is_signed_out`, and run one
`simctl` capture per sample with `FH_SIGNED_OUT=1` and the sample's
`FH_INTRO_SEEN`. The evidence strings (`[IntroView] showing step`,
`[AuthView] sign-in screen shown`, `security check hidden -> shown`) are
already in the app the simulator builds. Then delete this entry.

---

### A signed-out launch's snapshot line reports the last session's nav screen

**Where** `ios/FiHavenApp/Sources/App/FiHavenApp.swift` (the
`[Snapshot] wrote … screen=…` note), read by `scripts/run-macos.sh`.

**What** The note reads `nav.screen?.rawValue ?? "none"`, and `nav` keeps the
value the last signed-in session left in `UserDefaults` even while `RootView`
is showing the intro or the sign-in screen. Every signed-out sample logs
`screen=about` (or whatever that machine last looked at) — a screenshot of the
tour claiming it is About. The Mac sweep now passes no expected screen for
these rows and skips the check, so the table is honest, but the log line is
not.

**Why it was left** The value names state that is not on screen during a
signed-out launch, and deciding what the note *should* say when there is no
shell (probably the view that is actually mounted) is an app change rather than
a harness one. The harness only needed to stop reading it as a fact.

**What it would take** Log `screen=signedout` (or `none`) when the root is not
the shell, or read the mounted view instead of the nav object. Then run a
`--only intro,auth` sweep with the expected-screen check restored for those
rows.
