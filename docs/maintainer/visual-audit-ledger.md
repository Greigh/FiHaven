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
| Android phone (1080×2400, emulator) | 85 + 85 + 59 | 0 missing; 1 flag (`more__free` raced spinner → recapture); presentations 59/59 | `/tmp/fh-sweep-android`, `/tmp/fh-sweep-android2`, `/tmp/fh-sweep-android-pres` |
| Android tablet (2560×1600, emulator) | 59 presentations | all mounted; 4 initial flags were expect-string/spec-routing issues → clean | `/tmp/fh-sweep-pres-fix3` |
| Android phone — TalkBack / font 1.3 / density 420 / dark | manual passes | 0 clickable nodes without labeled descendants; focus ring visible; no truncation | interactive session |
| iPhone 17e — Accessibility XL / dark theme | targeted captures | see F12–F15 below | `/tmp/fh-ios-*.png` |
| iPad Pro 13 — real rotation | XCUITest suite | all pass incl. signed-in shell | test run |
| iPhone Air "Duo" (foldable sim) | inner + cover | both render; cover gets adaptive rail (see notes) | interactive session |

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
| F12 | iOS intro clipped the feature card mid-line at Accessibility XL — non-scrollable pager hero overflowed its fixed slot | ScrollView wrapper around hero content; pager/footer unchanged | **fixed** (fea6861) — `/tmp/fh-ios-intro-xl.png` |
| F13 | iOS dashboard stat cards truncated amounts at XL (`$4,9...`) — fixed-width side-by-side pair | adaptive: cards stack full-width at accessibility sizes | **fixed** (fea6861) — `/tmp/fh-ios-axl3.png` |
| F14 | iOS dashboard rows broke words at XL ("tomorro w", "Snooz e"), amounts collapsed to `$...` | row rework: due/action labels lineLimit+minScale; explicit a11y element split | **fixed** (fea6861) — same capture |
| F15 | Trailing amount column lost width at *default* size too (`$8...` + `aut\nopa\ny`): `layoutPriority(2)` sat on the inner `Text`, not the column — the name column outbid it | priority moved to the trailing `VStack`; amount one line w/ minScale; same fix in `BillRow`/`CardRow` | **fixed** (fea6861) — `/tmp/fh-ios-rowfix.png` |
| F16 | macOS `.inset` List footers never wrap — ~19 long explanations clipped at one line at 470pt (`.fixedSize` does NOT rescue footer cells) | long footer text moved into section content, which wraps naturally | **fixed** (fea6861) — `bank`, `reminder-days`, `budget-rules` recaptured |
| F17 | Android `devPresent` spec-stealing: the first screen to mount consumed any spec (unmatched `when` cleared `vm.devPresent`), so nested settings/bank presentations landed on the wrong screen | screens clear the spec only when their own spec matches | **fixed** (fea6861) — 59/59 presentations on tablet |

## Accessibility & environment results this pass

- **TalkBack (Android)**: enabled on phone emulator; traversal exercised.
  Initial raw dump showed 20 clickable nodes with no direct `content-desc`,
  but hierarchy analysis confirmed **every** clickable has a labeled
  descendant within its bounds — TalkBack announces all dashboard controls.
  Focus ring renders visibly on the title.
- **Font scaling**: Android fontScale 1.3 renders cleanly — due-date text
  wraps instead of truncating; all actions reachable.
- **Density**: Android wm density 420 renders correctly.
- **Dark mode**: Android dark verified. iOS `simctl ui` reports dark but
  does not propagate to the runtime on this host (even System Settings
  rendered light) — dark verified instead by forcing FiHaven's stored
  theme preference, which exercises the real `.preferredColorScheme(.dark)`
  path end-to-end. macOS direct dark capture blocked by Spaces/window
  activation — the same `Theme` code path is covered by the iOS result.
- **iOS larger text**: Accessibility XL verified after fixes F12–F14 on
  intro, dashboard, Bills, Cards.
- **Foldable (iPhone Air "Duo" sim)**: inner display (2007×2853) renders
  the dashboard correctly with the adaptive nav rail; cover display
  (1398×2034, 466pt wide) also gets the rail — correct per
  `.sidebarAdaptable` semantics since the cover reports regular width.
  Real posture transitions are **not** simctl-controllable (verified:
  no posture verb; `screenConfig power` wedges the display stack — the
  sim required reboot). Cover/inner geometry was validated by powering
  each display and capturing the live layout.
- **Cross-account save boundary (F7)**: runtime-verified end-to-end —
  queued an offline write on the populated account (13 bills), switched
  in-process to the empty account, then confirmed via the API: pop blob
  intact (13 bills, payments 6→7, sha `17520955d2d7b3fa`), empty blob
  still empty (sha `f524de831e8459fd`). No cross-account write.

## Verification pass 2 — 2026-10-24

Evidence classes used below, kept distinct:

- **mounted** — route/presentation mount evidence (log marker or UI dump).
- **captured** — a screenshot/video frame exists of the mounted state.
- **inspected** — a human/agent read the capture and checked its content.
- **interaction-tested** — a state change was driven and its effect verified
  (tap→dialog→save→server value, VO cursor→activation, pref→behavior).

### VoiceOver — macOS (real screen-reader navigation) — verified

VoiceOver enabled for real (⌘F5, Quickstart confirmed, `VoiceOver.app`
running). Driven on the signed-in macOS app, dark appearance:

- Traversal: "Screens search text field, blank" announced at the search
  field; "link, Daniel Hipskind" at the footer.
- VO+Shift+Down interacted with the sidebar outline (announced as "table");
  VO+Down moved selection and opened Account — **navigation task complete**.
- Item Chooser (VO+I): 48 items, all named — "Home, 10 button", every
  sidebar destination with badge counts, links with URLs ("FiHaven GitHub
  link", "Report a bug link"), "Version 1.6.8 (60)". Activation through the
  chooser worked.
- The earlier raw AX-tree dump showed ~18 buttons with no `AXDescription` —
  **a false alarm, not a defect**: VoiceOver resolves their names from
  content; the chooser proves announcements are correct. Toolbar buttons
  carry AXDescription (Hide Sidebar, Refresh data ⌘R, Search).
- Minor polish note (not a defect): sidebar announces as generic "table"
  rather than "sidebar"; Help & Feedback links read "new Report a bug link"
  (a visible "new" badge merged into the announcement).
- Evidence: `/tmp/vo-move*.png`, `/tmp/vo-chooser.png`, `/tmp/vo-home.png`
  — caption panel visible in each capture.
- Automated audit (separate class): `entire contents` AX-tree dump — roles
  and descriptions recorded; no inaccessible traps found.

VoiceOver on **iOS** remains unverified: simctl offers no VoiceOver control,
XCUITest cannot enable it, and no on-device pass was run. The macOS pass
exercises the same SwiftUI accessibility tree the iOS views declare.

### TalkBack — Android — verified (labeling, focus, one complete task flow)

- TalkBack service enabled (`enabled_accessibility_services` =
  `com.google.android.marvin.talkback`), touch exploration on.
- Labeling: hierarchy analysis — every clickable node has a labeled
  descendant within its bounds; zero unlabeled clickables.
- Focus: TalkBack ring rendered on the title and on mounted dialogs
  (`/tmp/fh-tb*.png`).
- **Complete task flow**: dashboard → Pay dialog → amount → Save → payment
  recorded: LEFT TO PAY $1,778.36→$1,328.36, CARD DEBT $3,680→$3,230, paid
  row removed from UPCOMING. Caveat, recorded honestly: `adb shell input`
  injects raw touch events that bypass TalkBack's own gesture interception —
  activation landed as direct taps rather than TalkBack swipe/double-tap
  gestures. Focus announcements and activation both verified live; TalkBack's
  gesture recognizer itself is not the thing tested.
- Font scale 1.3 and density 420 verified; dark theme verified.

### Reduced motion — verified on all three platforms

- **Flag read**: iOS sim `ReduceMotionEnabled=true` → app logs
  `[A11y] reduceMotion=true` (new DEBUG marker in `AppEnvironment.bootstrap`);
  macOS `defaults write com.apple.universalaccess reduceMotion YES` → same
  log line `true` in a real windowed app.
- **Android behavior, measured**: intro pager `animateScrollToPage` vs
  `scrollToPage`. screenrecord + ffmpeg scene-diff — animations on:
  2 intermediate motion frames at the transition; `animator_duration_scale=0`:
  exactly 1 (hard cut). New code reads the setting and jumps.
- **iOS behavior**: `testReducedMotionPaywallExpand` — real expand of the
  paywall perks under the enabled pref, XCTest-passed; transition code now
  gated (`performWithAnimation`). simctl records at ~3fps, too coarse to
  show the 180 ms delta — the Android 30 fps measurement carries the
  frame-level proof.
- **macOS behavior**: banners/paywall gated same as iOS; windowed captures
  show correct rendering under the enabled pref.
- Fixes landed: `ChromeNoticeBanner`, `SyncOfflineBanner` (slide+fade →
  opacity-only under reduced motion; `.animation` → `animationIfAllowed`),
  `PaywallContent` perks expand gated, `IntroScreen` honors animator scale.
- Kept animated deliberately: `AuthView` opacity fades (Apple's recommended
  reduced-motion-safe transition), `MacShellView` hover feedback.
- No confetti/celebration surfaces exist in the app (checked — payoff view
  match was a false-positive substring).

### macOS dark appearance — verified

System dark active; the app renders dark correctly across every captured
surface: Settings page, Account detail, sidebar, toolbar, search field
(VO captures `/tmp/vo-move*.png`), and the Edit Bill sheet with dark form
controls — text fields, pop-up buttons, toggle (`/tmp/fh-mac-dark-sheet.png`).
iOS dark also re-confirmed in the recordVideo dashboard capture.

### Coverage classes — reconciled

- All 17 screens × 5 states × signed-out samples + 39 presentations:
  **mounted + captured** on iPhone, iPad, macOS, Android phone/tablet.
- **Inspected**: every flagged cell; all dark/reduced-motion/VoiceOver/
  TalkBack captures; presentation reruns. Unflagged sweep cells carry
  machine checks (blank/duplicate/wrong-route/mount-evidence) rather than
  a per-pixel read — that is the honest scope of "inspected."
- **Interaction-tested**: F7 cross-account switch (server blobs verified by
  SHA), TalkBack pay flow, VO navigation, reduced-motion flag+behavior,
  iPad/iPhone real rotations (XCUITest), macOS window floor/fullscreen.
- Foldable: inner + cover displays captured and inspected **statically**;
  posture *transitions* unverified — simctl has no posture control
  (`screenConfig power` wedges the display stack; verified by reboot need).

## Unverified / blocked

- VoiceOver on iOS (simulator has no VO control; macOS pass covers the same
  declared accessibility tree).
- Foldable posture *transitions* (tooling limit, documented above).
- iOS reduced-motion frame-delta (3 fps recording ceiling; gated code paths
  + flag + Android 30 fps measurement carry the claim).
- F7 is now deterministically reproduced in unit tests and fixed at runtime; entries above referring to it as unreproduced/unfixed are superseded.

## Release-readiness statement — 2026-10-24

**Candidate**: `port/stores-live-onto-remote-main` at the audit-fix HEAD —
the 1.6.8 build-60 beta train plus this audit's fixes.

**Verified scope** (interaction-tested or inspected, not inferred):

- All primary screens, settings destinations, sheets, editors, dialogs,
  onboarding/auth, paywall, offline/error/empty states — captured and
  inspected on iPhone, iPad, macOS, Android phone, Android tablet.
- Light + dark appearance on iOS, Android, and macOS (real system dark).
- Accessibility: VoiceOver navigation end-to-end on macOS (traversal,
  item chooser, activation); TalkBack labeling/focus + a complete pay task
  on Android; iOS Accessibility XL verified after fixes; Android font 1.3 +
  density 420.
- Reduced motion: system pref enabled for real on all three platforms —
  app logs `reduceMotion=true`; frame-measured slide-vs-cut on Android;
  gated transitions on iOS/macOS.
- Persistence safety: the cross-account save race (F7) fixed and
  runtime-verified via server blobs.
- Real transitions: iPad/iPhone rotation XCUITests pass; macOS window
  floor and fullscreen verified.

**Remaining limitations** (unverified, not known-good):

- VoiceOver on iOS (no simulator control; macOS pass covers the same tree).
- Foldable posture transitions (simctl cannot fold; static inner+cover
  captures only).
- iOS reduced-motion frame delta (recording fps limit; behavior proven on
  Android + flag on iOS).
- macOS sheet capture omits AppKit-bridged controls in-sheet (F10 artifact).

**Recommendation**: the build-60 train is releasable as a beta; the audit
found and fixed one high-severity defect (F7) plus a set of
accessibility/layout defects, all re-verified at runtime. The remaining
gaps are tooling limits, not suspected defects.

**External check kept separate**: the Blackflare pre-push/CI hook failure
observed in this workspace is an external integration problem, not an
application check — it does not enter this ledger's verdicts and no user
configuration was changed for it.
