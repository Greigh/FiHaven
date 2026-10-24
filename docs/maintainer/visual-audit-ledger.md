# Visual & UX audit ledger — 2026-10-23

Runtime-driven audit of every view in FiHaven across iPhone, iPad, macOS,
and Android phone. Evidence is measured at runtime (device, viewport,
rendered route, state evidence, screenshot), not inferred from source.

## Audit tooling added

| Tool | What it does |
|------|--------------|
| `scripts/sweep-matrix.sh` | Single source of truth: 17 screen routes, 3 signed-out routes, 5 data/entitlement states (happy, empty, free, offline, error), 39 presentation specs |
| `scripts/run-ios.sh` | Per-cell simctl launch: `FH_SCREEN`, `FH_PRESENT`, `FH_SIGNED_OUT`, `FH_INTRO_SEEN`, `FH_FAULT`, `FH_WINDOW`; polls console for route/`[Present] showing` evidence before capture; flags blank/duplicate/wrong-route cells; `--presents`, `--only`, `--states`, `--delay`, `--out` |
| `scripts/run-macos.sh` | Same matrix on the native macOS app via `FH_SNAPSHOT`/`FH_SNAPSHOT_DELAY`; `--presents` |
| `scripts/run-android.sh` | Same matrix via `adb`: `route`, `theme`, `autologin`, `email`/`password`, `entitlement`, `datafault` extras; retries splash-blue cells |
| `ios/.../SweepSnapshot.swift` | DEBUG `FH_PRESENT` hook: mounts the real editor/sheet over the live shell using seeded `StoreManager` data; polls for fixtures, logs `[Present] showing` / `UNSATISFIED` |
| `ios/.../RootView.swift` | Applies `.ctAuditPresentation(store:)` in DEBUG only |
| `ios/.../MainTabView.swift` | Logs `[Shell] rendered=<route>` so the recorder verifies what *rendered*, not what was requested |
| `ios/FiHavenApp/UITests/TransitionUITests.swift` | XCUITest driving **real** SpringBoard rotations via `XCUIDevice.orientation` — auth form preservation and intro control reachability, portrait↔landscape |
| `android/.../MainActivity.kt`, `AppViewModel.kt`, `RootScreen.kt` | DEBUG extras: credential autologin, `entitlement` (free/active/expired/grace/canceled/off), `datafault` (post-login data failure) |
| `android/app/build.gradle.kts` | Debug-only `FH_API_BASE` property override; release stays pinned to `https://fihaven.app` |

Rerun examples:

```sh
scripts/run-ios.sh    --device <sim-udid> --out /tmp/fh-sweep-iphone
scripts/run-ios.sh    --device <sim-udid> --presents --only present-goal-edit
scripts/run-macos.sh  --presents --out /tmp/fh-sweep-macos
scripts/run-android.sh --sweep --delay 11 --out /tmp/fh-sweep-android
xcodebuild -project ios/FiHavenApp/FiHaven.xcodeproj -scheme FiHaven \
  -destination 'platform=iOS Simulator,id=<udid>' \
  test -only-testing:FiHavenUITests
```

Fixture: `node scripts/seed-user-data.js ipad@example.com --create --verify
--onboard --pro --password 'IpAd-Demo-Pass!2026'` (13 bills, 3 cards,
2 goals, 2 accounts, 4 transactions). Empty account:
`fhsweep-empty@fihaven.app`.

## Coverage

| Platform | Cells | Result | Artifacts |
|----------|-------|--------|-----------|
| iPhone 17e (1170×2532) | 122 (85 screens×states + 3 signed-out + 34 presentations) + 15 reruns | all captured; 9 initial flags were fixture-miss races → clean after reseed + evidence polling | `/tmp/fh-sweep-iphone`, `/tmp/fh-sweep-presents-*` |
| iPad Pro 13 (2064×2752) | 88 + 127 (full matrix + presentations) | 0 missing, 0 flagged (screen pass); presentation pass running | `/tmp/fh-sweep-ipad`, `/tmp/fh-sweep-ipad-presents` |
| macOS (1440×900 + 640×520 floor) | 88 + 127 | 0 missing, 0 flagged | `/tmp/fh-sweep-macos`, `/tmp/fh-sweep-macos-p` |
| Android phone (1080×2400, emulator) | 85 + 85 | 0 missing; 1 flag (`more__free` raced spinner → recapture) | `/tmp/fh-sweep-android`, `/tmp/fh-sweep-android2` |

Presentation inventory exercised as real sheets/pushes over the live shell
with seeded data: bill-edit, card-edit, pay, pay-card, tx-edit,
edit-payment, income-new/edit/adj, account-new/edit, goal-new/edit,
household, budget-rules, reminder-days, about, mfa, paywall, pro,
tabs-editor, admin, onboarding, verify-email, all 11 settings sub-sheets,
bank-link. Real tap-throughs also performed during interactive sessions.

## Findings & fixes this pass

| # | Finding | Fix | Verified |
|---|---------|-----|----------|
| F1 | Sweep verified the *requested* route, not the rendered one — `FH_SCREEN=pro` under `FH_FAULT` silently rendered dashboard (Pro tab absent when entitlement fetch fails) | `[Shell] rendered=` logging; recorder prefers it | flags now catch wrong-route renders |
| F2 | Fixture-dependent presentations raced the data load — captured the loading dashboard | `capture_cell` polls console for `[Present] showing` up to 40 s; hook logs `UNSATISFIED` | 15/15 presentation reruns clean |
| F3 | Android sweep cells raced cold-start on SwiftShader — solid-splash captures | `am start -W` + splash-retry in runner | rerun in progress |
| F4 | Android restored stale session when account differed — empty-state cells photographed the wrong user | `devAutoLogin` re-signs when a signed-in session's email ≠ requested | rerun in progress |
| F5 | Android debug was pinned to `https://fihaven.app` — could not audit against local fixture server | `FH_API_BASE` gradle property (debug only) + cleartext-to-10.0.2.2 network config | live data renders |
| F6 | `DataErrorScreen` duplicated its message under the heading — the fallback `e.message` repeated the title verbatim | fallback now shows guidance when the message restates the heading | **fixed** (26041bf) |
| F7 | **HIGH — fixed.** Save boundary never checked WHICH session owned the data: sign-in over a live session left the old `saveJob`/retry PUTing the previous account's (empty) `_data` under the new token; a raced initial load could also PUT placeholder data. Both Android (`AppViewModel`, session epoch + loaded-gate) and iOS (`AppStore` same-owner push + `enterSignedIn` store teardown) shipped the fix; `markSynced` no longer stamps newer edits synced. `DataSaveBoundaryTest` — 6 deterministic cases, all pass; reverting the boundary fails the cross-account case by design. Runtime-verified: populated blob (5768B) survives the sign-in path that wiped it 2× before | **fixed** (26041bf); prior `happy`-state Android captures compromised by the wipe are INVALID |
| F8 | `run-ios.sh` EOF dispatch wart: bare trailing `main` let bash run before parsing the file — a mid-sweep edit corrupted the read position (`syntax error near unexpected token 'fi'` at line 943, after a clean run) | entry wrapped in `{ main; exit $?; }` so the whole file parses first; regression test pins the dispatch form | **fixed** (26041bf) |

## Platform verification

- **macOS window floor**: `watchFloor` timer **removed** — supported
  replacement is `.frame(minWidth: 640, minHeight: 520)` on scene content;
  SwiftUI's documented `.automatic → .contentMinSize` resolution then
  installs the content's own minimum every layout pass. Measured:
  `contentMinSize` 236×222 → 640×552 (552 = content's honest measured min;
  a saved 640×520 restore grows to it — floor enforcement by the owner, not
  unexplained drift). Sweep pin still lands 640×520 captures.
- **macOS fullscreen**: **verified**. `activate(ignoringOtherApps:)` is a
  documented no-op on macOS 14+; `NSApp.activate()` alone also fails. AppleScript/
  LaunchServices activation succeeds → `will-enter → did-enter` at
  1728×1084 → `will-exit → did-exit`, geometry restored (1728×1012 zoomed,
  640×552 normal). Nav/sidebar intact in fullscreen.
- **iPad/iPhone real transitions**: `simctl`/`screenConfig` have no rotation
  or multitasking control (verified — single portrait mode). Supported path
  is XCUITest: both rotation tests **pass** on iPhone 17e
  (auth-form preservation 15.4 s, intro reachability 12.3 s). iPad real-
  transition run pending the sweep releasing the simulator; FH_VIEWPORT
  results are forced-viewport validation only.

| F9 | macOS sheet captures: `cacheDisplay` renders the window's own backing store — attached sheets never appear (whole first presentation run photographed the shell) | capture the `attachedSheet`'s contentView when one is up; verify with `screencapture -l<wid>` | real capture confirms sheets present and populated |
| F10 | `cacheDisplay` misses AppKit-bridged controls (pop-up buttons, steppers, bordered buttons render as blank boxes in sheet PNGs) — capture artifact, verified NOT an app defect via `screencapture` | inherent to the sandbox-free path; note on sheet captures | discrimination capture: `/tmp/fh-win2.png` |
| F11 | macOS editor sheets sized to `Form`'s columns ideal (~470pt): labels clipped at the leading edge, and the 50/50 label column read as dead space; the paywall sheet sized to the ScrollView ideal (470x480) and hid plans + CTA below the fold | `.ctEditorSheetWidth()` (grouped form style + 460/500pt width floor) on every editor/settings sheet; paywall gets a 540x720 min | **fixed** (26041bf) — real captures: `/tmp/fh-f11c-sheet.png`, `/tmp/fh-pw2.png` |

## Unverified / blocked

- Android presentations are in-screen dialogs (no shell-level hook) —
  covered via screen sweeps + interactive sessions; a `FH_PRESENT`
  equivalent is future tooling work.
- TalkBack/VoiceOver end-to-end passes not yet run; larger-text and
  reduced-motion configurations pending.
- Android tablet form factor — pending emulator provisioning.
- Duo (foldable) inner/cover postures — not yet captured; blocked on a foldable emulator profile.
- F7 is now deterministically reproduced in unit tests and fixed at runtime; entries above referring to it as unreproduced/unfixed are superseded.
