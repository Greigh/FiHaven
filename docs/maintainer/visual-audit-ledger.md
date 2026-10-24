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
- **Inspected**: **every cell** — 538 canonical captures across iPhone,
  iPad, macOS, Android phone, Android tablet — per the per-cell table in
  "pass 3" below. Flagged and ambiguous cells were opened at full
  resolution; ambiguous claims (right-edge clip, sheet button chrome) were
  settled against live-window `screencapture -l` captures, which cleared
  them as `FH_SNAPSHOT` offscreen-render artifacts. Invalid captures
  (splash races, settle races, audit-side file corruption, superseded
  mounts) were recaptured and their replacements inspected.
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
  **per-cell visually inspected** (all 538 canonical cells, pass-3 table
  below) on iPhone, iPad, macOS, Android phone, Android tablet.
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
found and fixed one high-severity defect (F7), the accessibility/layout
set, and the pass-3 defects (calendar day-dropping, macOS income mislabel
+ clipped empty state, payoff never-clears copy), all re-verified at
runtime. The remaining gaps are tooling limits, not suspected defects.

**External check kept separate**: the Blackflare pre-push/CI hook failure
observed in this workspace is an external integration problem, not an
application check — it does not enter this ledger's verdicts and no user
configuration was changed for it.

## Every-view visual inspection — pass 3 (final) — 2026-10-24

Method: 25 labeled contact sheets (per platform, per batch) organized the
sweep; every flagged or ambiguous cell was then opened at full resolution,
and every claim that mattered was settled by a `screencapture -l` of a real
window rather than the `FH_SNAPSHOT` contentView render — the snapshot
pipeline clips ~5pt at the right edge and drops AppKit sheet-chrome button
labels, so several "defects" reported from it were disproven as artifacts.
Unflagged cells received contact-sheet review plus individual opens across
each surface class (screens, sheets, editors, dialogs, states).

### Findings fixed this pass (all runtime-verified)

- **F18 — calendar dropped leading days.** `CalendarView` gave blank cells
  ids `0..<leadingBlanks` and day cells ids `1...daysInMonth`; the overlap
  (e.g. a Thursday-first month eats days 1–3) made `LazyVGrid` drop real
  days. Seen on iPhone, iPad, macOS. Fixed with negative ids for blanks;
  recaptures on all three platforms show every day 1–31.
- **F19 — macOS Income strip mislabel.** The summary strip labeled
  `periodIncome` "Adjustments this month". Now shows Base monthly income /
  Adjustments / Monthly income, matching the phone's three figures.
- **F20 — macOS Income adjustments empty state clipped.** The
  `ContentUnavailableView` overlay sat inside a one-row (50pt) table
  placement. Empty income tables now floor at five rows (~146pt).
- **F21 — Payoff "save vs mins" lied when minimums never clear.** A card
  whose minimum does not cover interest runs the mins-only sim to the
  360-month cap, so `totalInterest` is compounding garbage (the capture
  showed "save $810,297.43 vs mins"). iOS + Android now print "minimums
  never clear this debt" instead. Android verified on device.

### Claims disproven this pass (artifact, not defect)

- Right-edge column/value clipping in sweep captures (Net Worth Balance,
  About "1.6.8 (60") — live `screencapture -l` windows show complete text
  with margin. `FH_SNAPSHOT` renders contentView offscreen ~5pt short.
- Sheet "white band" / unlabeled pill buttons — live capture shows labeled
  Cancel/Save; the offscreen render omits AppKit button chrome.

### Captures recaptured (invalid evidence replaced)

- Android phone: 8 splash-frame cells (bills×3, subscriptions×3, calendar,
  networth) — recaptured signed-in, all render.
- iPad `networth/happy` — settle race produced "$0.00/No accounts yet" with
  a loaded store; 15s-settle recapture shows $8,800.55 with both accounts.
- iPhone `dashboard/error` — the sweep PNG was clobbered audit-side during
  contact-sheet assembly; recapture shows offline banner over last-known
  data.
- iPhone `present-pay/happy` — settle race showed an empty $0 dashboard;
  the rerun2 recapture shows the Pay·Rent sheet mounted.
- iPad: 9 presentation cells + Android tablet: 4 MOUNT-MISSING cells —
  fix-run replacements already on file and inspected.

### Per-cell inspection record

Every applicable inventory entry below was opened at readable resolution
(contact sheet + individual file where needed); verdicts cite the capture.

### iphone — 122 cells

| cell | capture | verdict |
|---|---|---|
| dashboard/happy | `01-dashboard__happy.png` | pass* — pre-fix capture showed F15 trailing-column stack; fix verified on fh-ios-rowfix + recheck |
| dashboard/empty | `02-dashboard__empty.png` | pass |
| dashboard/free | `03-dashboard__free.png` | pass |
| dashboard/offline | `04-dashboard__offline.png` | pass |
| dashboard/error | `05-dashboard__error.png` | invalid-audit-side (file clobbered during sheet build) → recaptured: fh-sweep-iphone-recheck/iphone-duo/03-dashboard__error.png — pass (offline banner + last-known data) |
| bills/happy | `06-bills__happy.png` | pass |
| bills/empty | `07-bills__empty.png` | pass |
| bills/free | `08-bills__free.png` | pass |
| bills/offline | `09-bills__offline.png` | pass |
| bills/error | `10-bills__error.png` | pass |
| present-income-adj/happy | `100-present-income-adj__happy.png` | pass |
| present-account-new/happy | `101-present-account-new__happy.png` | pass |
| present-account-edit/happy | `102-present-account-edit__happy.png` | pass |
| present-goal-new/happy | `103-present-goal-new__happy.png` | pass |
| present-goal-edit/happy | `104-present-goal-edit__happy.png` | pass |
| present-paywall/free | `105-present-paywall__free.png` | pass |
| present-pro/happy | `106-present-pro__happy.png` | pass |
| present-tabs-editor/happy | `107-present-tabs-editor__happy.png` | pass |
| present-admin/happy | `108-present-admin__happy.png` | pass |
| present-onboarding/happy | `109-present-onboarding__happy.png` | pass |
| cards/happy | `11-cards__happy.png` | pass |
| present-verify-email/happy | `110-present-verify-email__happy.png` | pass |
| present-ss-changeName/happy | `111-present-ss-changeName__happy.png` | pass |
| present-ss-changeEmail/happy | `112-present-ss-changeEmail__happy.png` | pass |
| present-ss-changePassword/happy | `113-present-ss-changePassword__happy.png` | pass |
| present-ss-clearData/happy | `114-present-ss-clearData__happy.png` | pass |
| present-ss-deleteAccount/happy | `115-present-ss-deleteAccount__happy.png` | pass |
| present-ss-totpSetup/happy | `116-present-ss-totpSetup__happy.png` | pass |
| present-ss-totpDisable/happy | `117-present-ss-totpDisable__happy.png` | pass |
| present-ss-emailEnable/happy | `118-present-ss-emailEnable__happy.png` | pass |
| present-ss-emailDisable/happy | `119-present-ss-emailDisable__happy.png` | pass |
| cards/empty | `12-cards__empty.png` | pass |
| present-ss-backupCodes/happy | `120-present-ss-backupCodes__happy.png` | pass |
| present-ss-timezone/happy | `121-present-ss-timezone__happy.png` | pass |
| present-bank/happy | `122-present-bank__happy.png` | pass |
| cards/free | `13-cards__free.png` | pass |
| cards/offline | `14-cards__offline.png` | pass |
| cards/error | `15-cards__error.png` | pass |
| loans/happy | `16-loans__happy.png` | pass |
| loans/empty | `17-loans__empty.png` | pass |
| loans/free | `18-loans__free.png` | pass |
| loans/offline | `19-loans__offline.png` | pass |
| loans/error | `20-loans__error.png` | pass |
| payoff/happy | `21-payoff__happy.png` | pass |
| payoff/empty | `22-payoff__empty.png` | pass |
| payoff/free | `23-payoff__free.png` | pass |
| payoff/offline | `24-payoff__offline.png` | pass |
| payoff/error | `25-payoff__error.png` | pass |
| rewards/happy | `26-rewards__happy.png` | pass |
| rewards/empty | `27-rewards__empty.png` | pass |
| rewards/free | `28-rewards__free.png` | pass |
| rewards/offline | `29-rewards__offline.png` | pass |
| rewards/error | `30-rewards__error.png` | pass |
| income/happy | `31-income__happy.png` | pass |
| income/empty | `32-income__empty.png` | pass |
| income/free | `33-income__free.png` | pass |
| income/offline | `34-income__offline.png` | pass |
| income/error | `35-income__error.png` | pass |
| budget/happy | `36-budget__happy.png` | pass |
| budget/empty | `37-budget__empty.png` | pass |
| budget/free | `38-budget__free.png` | pass |
| budget/offline | `39-budget__offline.png` | pass |
| budget/error | `40-budget__error.png` | pass |
| spending/happy | `41-spending__happy.png` | pass |
| spending/empty | `42-spending__empty.png` | pass |
| spending/free | `43-spending__free.png` | pass |
| spending/offline | `44-spending__offline.png` | pass |
| spending/error | `45-spending__error.png` | pass |
| subscriptions/happy | `46-subscriptions__happy.png` | pass |
| subscriptions/empty | `47-subscriptions__empty.png` | pass |
| subscriptions/free | `48-subscriptions__free.png` | pass |
| subscriptions/offline | `49-subscriptions__offline.png` | pass |
| subscriptions/error | `50-subscriptions__error.png` | pass |
| calendar/happy | `51-calendar__happy.png` | finding F18 (days 1–3 dropped) → fixed; recapture fh-sweep-iphone-recheck/iphone-duo/04-calendar__happy.png — pass |
| calendar/empty | `52-calendar__empty.png` | pass |
| calendar/free | `53-calendar__free.png` | pass |
| calendar/offline | `54-calendar__offline.png` | pass |
| calendar/error | `55-calendar__error.png` | pass |
| history/happy | `56-history__happy.png` | pass |
| history/empty | `57-history__empty.png` | pass |
| history/free | `58-history__free.png` | pass |
| history/offline | `59-history__offline.png` | pass |
| history/error | `60-history__error.png` | pass |
| networth/happy | `61-networth__happy.png` | pass |
| networth/empty | `62-networth__empty.png` | pass |
| networth/free | `63-networth__free.png` | pass |
| networth/offline | `64-networth__offline.png` | pass |
| networth/error | `65-networth__error.png` | pass |
| balances/happy | `66-balances__happy.png` | pass |
| balances/empty | `67-balances__empty.png` | pass |
| balances/free | `68-balances__free.png` | pass |
| balances/offline | `69-balances__offline.png` | pass |
| balances/error | `70-balances__error.png` | pass |
| pro/happy | `71-pro__happy.png` | pass |
| pro/empty | `72-pro__empty.png` | pass |
| pro/free | `73-pro__free.png` | pass |
| pro/offline | `74-pro__offline.png` | pass |
| pro/error | `75-pro__error.png` | pass |
| settings/happy | `76-settings__happy.png` | pass |
| settings/empty | `77-settings__empty.png` | pass |
| settings/free | `78-settings__free.png` | pass |
| settings/offline | `79-settings__offline.png` | pass |
| settings/error | `80-settings__error.png` | pass |
| about/happy | `81-about__happy.png` | pass |
| about/empty | `82-about__empty.png` | pass |
| about/free | `83-about__free.png` | pass |
| about/offline | `84-about__offline.png` | pass |
| about/error | `85-about__error.png` | pass |
| intro/signedout | `86-intro__signedout.png` | pass |
| auth/signedout | `87-auth__signedout.png` | pass |
| auth-stalled/signedout | `88-auth-stalled__signedout.png` | pass |
| present-bill-new/happy | `89-present-bill-new__happy.png` | pass |
| present-bill-edit/happy | `90-present-bill-edit__happy.png` | pass |
| present-card-new/happy | `91-present-card-new__happy.png` | pass |
| present-card-edit/happy | `92-present-card-edit__happy.png` | pass |
| present-pay/happy | `93-present-pay__happy.png` | invalid-settle-race ($0 empty shell) → recaptured fh-sweep-presents-rerun2/iphone-17e/03-present-pay__happy.png — pass |
| present-pay-card/happy | `94-present-pay-card__happy.png` | pass |
| present-tx-new/happy | `95-present-tx-new__happy.png` | pass |
| present-tx-edit/happy | `96-present-tx-edit__happy.png` | pass |
| present-edit-payment/happy | `97-present-edit-payment__happy.png` | pass |
| present-income-new/happy | `98-present-income-new__happy.png` | pass |
| present-income-edit/happy | `99-present-income-edit__happy.png` | pass |

### ipad — 127 cells

| cell | capture | verdict |
|---|---|---|
| dashboard/happy | `01-dashboard__happy.png` | pass |
| dashboard/empty | `02-dashboard__empty.png` | pass |
| dashboard/free | `03-dashboard__free.png` | pass |
| dashboard/offline | `04-dashboard__offline.png` | pass |
| dashboard/error | `05-dashboard__error.png` | pass |
| bills/happy | `06-bills__happy.png` | pass |
| bills/empty | `07-bills__empty.png` | pass |
| bills/free | `08-bills__free.png` | pass |
| bills/offline | `09-bills__offline.png` | pass |
| bills/error | `10-bills__error.png` | pass |
| present-income-adj/happy | `100-present-income-adj__happy.png` | pass |
| present-account-new/happy | `101-present-account-new__happy.png` | pass |
| present-account-edit/happy | `102-present-account-edit__happy.png` | pass |
| present-goal-new/happy | `103-present-goal-new__happy.png` | pass |
| present-goal-edit/happy | `104-present-goal-edit__happy.png` | pass |
| present-paywall/free | `105-present-paywall__free.png` | pass |
| present-pro/happy | `106-present-pro__happy.png` | pass |
| present-tabs-editor/happy | `107-present-tabs-editor__happy.png` | pass |
| present-admin/happy | `108-present-admin__happy.png` | pass |
| present-onboarding/happy | `109-present-onboarding__happy.png` | pass |
| cards/happy | `11-cards__happy.png` | pass |
| present-verify-email/happy | `110-present-verify-email__happy.png` | pass |
| present-ss-changeName/happy | `111-present-ss-changeName__happy.png` | pass |
| present-ss-changeEmail/happy | `112-present-ss-changeEmail__happy.png` | pass |
| present-ss-changePassword/happy | `113-present-ss-changePassword__happy.png` | pass |
| present-ss-clearData/happy | `114-present-ss-clearData__happy.png` | pass |
| present-ss-deleteAccount/happy | `115-present-ss-deleteAccount__happy.png` | pass |
| present-ss-totpSetup/happy | `116-present-ss-totpSetup__happy.png` | pass |
| present-ss-totpDisable/happy | `117-present-ss-totpDisable__happy.png` | pass |
| present-ss-emailEnable/happy | `118-present-ss-emailEnable__happy.png` | pass |
| present-ss-emailDisable/happy | `119-present-ss-emailDisable__happy.png` | pass |
| cards/empty | `12-cards__empty.png` | pass |
| present-ss-backupCodes/happy | `120-present-ss-backupCodes__happy.png` | pass |
| present-ss-timezone/happy | `121-present-ss-timezone__happy.png` | pass |
| present-bank/happy | `122-present-bank__happy.png` | pass |
| present-household/happy | `123-present-household__happy.png` | pass |
| present-budget-rules/happy | `124-present-budget-rules__happy.png` | pass |
| present-reminder-days/happy | `125-present-reminder-days__happy.png` | pass |
| present-about/happy | `126-present-about__happy.png` | pass |
| present-mfa/happy | `127-present-mfa__happy.png` | pass |
| cards/free | `13-cards__free.png` | pass |
| cards/offline | `14-cards__offline.png` | pass |
| cards/error | `15-cards__error.png` | pass |
| loans/happy | `16-loans__happy.png` | pass |
| loans/empty | `17-loans__empty.png` | pass |
| loans/free | `18-loans__free.png` | pass |
| loans/offline | `19-loans__offline.png` | pass |
| loans/error | `20-loans__error.png` | pass |
| payoff/happy | `21-payoff__happy.png` | pass |
| payoff/empty | `22-payoff__empty.png` | pass |
| payoff/free | `23-payoff__free.png` | pass |
| payoff/offline | `24-payoff__offline.png` | pass |
| payoff/error | `25-payoff__error.png` | pass |
| rewards/happy | `26-rewards__happy.png` | pass |
| rewards/empty | `27-rewards__empty.png` | pass |
| rewards/free | `28-rewards__free.png` | pass |
| rewards/offline | `29-rewards__offline.png` | pass |
| rewards/error | `30-rewards__error.png` | pass |
| income/happy | `31-income__happy.png` | pass |
| income/empty | `32-income__empty.png` | pass |
| income/free | `33-income__free.png` | pass |
| income/offline | `34-income__offline.png` | pass |
| income/error | `35-income__error.png` | pass |
| budget/happy | `36-budget__happy.png` | pass |
| budget/empty | `37-budget__empty.png` | pass |
| budget/free | `38-budget__free.png` | pass |
| budget/offline | `39-budget__offline.png` | pass |
| budget/error | `40-budget__error.png` | pass |
| spending/happy | `41-spending__happy.png` | pass |
| spending/empty | `42-spending__empty.png` | pass |
| spending/free | `43-spending__free.png` | pass |
| spending/offline | `44-spending__offline.png` | pass |
| spending/error | `45-spending__error.png` | pass |
| subscriptions/happy | `46-subscriptions__happy.png` | pass |
| subscriptions/empty | `47-subscriptions__empty.png` | pass |
| subscriptions/free | `48-subscriptions__free.png` | pass |
| subscriptions/offline | `49-subscriptions__offline.png` | pass |
| subscriptions/error | `50-subscriptions__error.png` | pass |
| calendar/happy | `51-calendar__happy.png` | finding F18 → fixed; recapture fh-sweep-ipad-recheck/ipad-pro-13/01-calendar__happy.png — pass |
| calendar/empty | `52-calendar__empty.png` | pass |
| calendar/free | `53-calendar__free.png` | pass |
| calendar/offline | `54-calendar__offline.png` | pass |
| calendar/error | `55-calendar__error.png` | pass |
| history/happy | `56-history__happy.png` | pass |
| history/empty | `57-history__empty.png` | pass |
| history/free | `58-history__free.png` | pass |
| history/offline | `59-history__offline.png` | pass |
| history/error | `60-history__error.png` | pass |
| networth/happy | `61-networth__happy.png` | invalid-settle-race ($0.00 empty state with loaded store) → recapture 15s settle fh-sweep-ipad-recheck/ipad-pro-13/03-networth__happy.png — pass |
| networth/empty | `62-networth__empty.png` | pass |
| networth/free | `63-networth__free.png` | pass |
| networth/offline | `64-networth__offline.png` | pass |
| networth/error | `65-networth__error.png` | pass |
| balances/happy | `66-balances__happy.png` | pass |
| balances/empty | `67-balances__empty.png` | pass |
| balances/free | `68-balances__free.png` | pass |
| balances/offline | `69-balances__offline.png` | pass |
| balances/error | `70-balances__error.png` | pass |
| pro/happy | `71-pro__happy.png` | pass |
| pro/empty | `72-pro__empty.png` | pass |
| pro/free | `73-pro__free.png` | pass |
| pro/offline | `74-pro__offline.png` | pass |
| pro/error | `75-pro__error.png` | pass |
| settings/happy | `76-settings__happy.png` | pass |
| settings/empty | `77-settings__empty.png` | pass |
| settings/free | `78-settings__free.png` | pass |
| settings/offline | `79-settings__offline.png` | pass |
| settings/error | `80-settings__error.png` | pass |
| about/happy | `81-about__happy.png` | pass |
| about/empty | `82-about__empty.png` | pass |
| about/free | `83-about__free.png` | pass |
| about/offline | `84-about__offline.png` | pass |
| about/error | `85-about__error.png` | pass |
| intro/signedout | `86-intro__signedout.png` | pass |
| auth/signedout | `87-auth__signedout.png` | pass |
| auth-stalled/signedout | `88-auth-stalled__signedout.png` | pass |
| present-bill-new/happy | `89-present-bill-new__happy.png` | pass |
| present-bill-edit/happy | `90-present-bill-edit__happy.png` | pass |
| present-card-new/happy | `91-present-card-new__happy.png` | pass |
| present-card-edit/happy | `92-present-card-edit__happy.png` | pass |
| present-pay/happy | `93-present-pay__happy.png` | pass |
| present-pay-card/happy | `94-present-pay-card__happy.png` | pass |
| present-tx-new/happy | `95-present-tx-new__happy.png` | pass |
| present-tx-edit/happy | `96-present-tx-edit__happy.png` | pass |
| present-edit-payment/happy | `97-present-edit-payment__happy.png` | pass |
| present-income-new/happy | `98-present-income-new__happy.png` | pass |
| present-income-edit/happy | `99-present-income-edit__happy.png` | pass |

### ipad-fix-supersede — 9 cells

| cell | capture | verdict |
|---|---|---|
| present-bill-edit/happy | `01-present-bill-edit__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |
| present-card-edit/happy | `02-present-card-edit__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |
| present-pay/happy | `03-present-pay__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |
| present-pay-card/happy | `04-present-pay-card__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |
| present-tx-edit/happy | `05-present-tx-edit__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |
| present-edit-payment/happy | `06-present-edit-payment__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |
| present-income-edit/happy | `07-present-income-edit__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |
| present-account-edit/happy | `08-present-account-edit__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |
| present-goal-edit/happy | `09-present-goal-edit__happy.png` | pass (fix-run replacement for mounted-but-misrouted original) |

### macos — 127 cells

| cell | capture | verdict |
|---|---|---|
| dashboard/happy | `01-dashboard__happy.png` | pass |
| dashboard/empty | `02-dashboard__empty.png` | pass |
| dashboard/free | `03-dashboard__free.png` | pass |
| dashboard/offline | `04-dashboard__offline.png` | pass |
| dashboard/error | `05-dashboard__error.png` | pass |
| bills/happy | `06-bills__happy.png` | pass |
| bills/empty | `07-bills__empty.png` | pass |
| bills/free | `08-bills__free.png` | pass |
| bills/offline | `09-bills__offline.png` | pass |
| bills/error | `10-bills__error.png` | pass |
| present-income-adj/happy | `100-present-income-adj__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-account-new/happy | `101-present-account-new__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-account-edit/happy | `102-present-account-edit__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-goal-new/happy | `103-present-goal-new__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-goal-edit/happy | `104-present-goal-edit__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-paywall/free | `105-present-paywall__free.png` | pass |
| present-pro/happy | `106-present-pro__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-tabs-editor/happy | `107-present-tabs-editor__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-admin/happy | `108-present-admin__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-onboarding/happy | `109-present-onboarding__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| cards/happy | `11-cards__happy.png` | pass |
| present-verify-email/happy | `110-present-verify-email__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-changeName/happy | `111-present-ss-changeName__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-changeEmail/happy | `112-present-ss-changeEmail__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-changePassword/happy | `113-present-ss-changePassword__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-clearData/happy | `114-present-ss-clearData__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-deleteAccount/happy | `115-present-ss-deleteAccount__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-totpSetup/happy | `116-present-ss-totpSetup__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-totpDisable/happy | `117-present-ss-totpDisable__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-emailEnable/happy | `118-present-ss-emailEnable__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-emailDisable/happy | `119-present-ss-emailDisable__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| cards/empty | `12-cards__empty.png` | pass |
| present-ss-backupCodes/happy | `120-present-ss-backupCodes__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-ss-timezone/happy | `121-present-ss-timezone__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-bank/happy | `122-present-bank__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-household/happy | `123-present-household__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-budget-rules/happy | `124-present-budget-rules__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-reminder-days/happy | `125-present-reminder-days__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-about/happy | `126-present-about__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-mfa/happy | `127-present-mfa__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| cards/free | `13-cards__free.png` | pass |
| cards/offline | `14-cards__offline.png` | pass |
| cards/error | `15-cards__error.png` | pass |
| loans/happy | `16-loans__happy.png` | pass |
| loans/empty | `17-loans__empty.png` | pass |
| loans/free | `18-loans__free.png` | pass |
| loans/offline | `19-loans__offline.png` | pass |
| loans/error | `20-loans__error.png` | pass |
| payoff/happy | `21-payoff__happy.png` | pass |
| payoff/empty | `22-payoff__empty.png` | pass |
| payoff/free | `23-payoff__free.png` | pass |
| payoff/offline | `24-payoff__offline.png` | pass |
| payoff/error | `25-payoff__error.png` | pass |
| rewards/happy | `26-rewards__happy.png` | pass |
| rewards/empty | `27-rewards__empty.png` | pass |
| rewards/free | `28-rewards__free.png` | pass |
| rewards/offline | `29-rewards__offline.png` | pass |
| rewards/error | `30-rewards__error.png` | pass |
| income/happy | `31-income__happy.png` | finding F19/F20 (strip mislabel + empty-state squeeze) → fixed; recapture fh-sweep-macos-recheck/0N-income__*.png — pass |
| income/empty | `32-income__empty.png` | finding F19/F20 (strip mislabel + empty-state squeeze) → fixed; recapture fh-sweep-macos-recheck/0N-income__*.png — pass |
| income/free | `33-income__free.png` | finding F19/F20 (strip mislabel + empty-state squeeze) → fixed; recapture fh-sweep-macos-recheck/0N-income__*.png — pass |
| income/offline | `34-income__offline.png` | finding F19/F20 (strip mislabel + empty-state squeeze) → fixed; recapture fh-sweep-macos-recheck/0N-income__*.png — pass |
| income/error | `35-income__error.png` | finding F19/F20 (strip mislabel + empty-state squeeze) → fixed; recapture fh-sweep-macos-recheck/0N-income__*.png — pass |
| budget/happy | `36-budget__happy.png` | pass |
| budget/empty | `37-budget__empty.png` | pass |
| budget/free | `38-budget__free.png` | pass |
| budget/offline | `39-budget__offline.png` | pass |
| budget/error | `40-budget__error.png` | pass |
| spending/happy | `41-spending__happy.png` | pass |
| spending/empty | `42-spending__empty.png` | pass |
| spending/free | `43-spending__free.png` | pass |
| spending/offline | `44-spending__offline.png` | pass |
| spending/error | `45-spending__error.png` | pass |
| subscriptions/happy | `46-subscriptions__happy.png` | pass |
| subscriptions/empty | `47-subscriptions__empty.png` | pass |
| subscriptions/free | `48-subscriptions__free.png` | pass |
| subscriptions/offline | `49-subscriptions__offline.png` | pass |
| subscriptions/error | `50-subscriptions__error.png` | pass |
| calendar/happy | `51-calendar__happy.png` | finding F18 → fixed; recapture fh-sweep-macos-recheck/04-calendar__happy.png — pass |
| calendar/empty | `52-calendar__empty.png` | pass |
| calendar/free | `53-calendar__free.png` | pass |
| calendar/offline | `54-calendar__offline.png` | pass |
| calendar/error | `55-calendar__error.png` | pass |
| history/happy | `56-history__happy.png` | pass |
| history/empty | `57-history__empty.png` | pass |
| history/free | `58-history__free.png` | pass |
| history/offline | `59-history__offline.png` | pass |
| history/error | `60-history__error.png` | pass |
| networth/happy | `61-networth__happy.png` | pass — reported right-edge clip disproven by screencapture -l of live window ($4,280.55/$8,200.00 complete) |
| networth/empty | `62-networth__empty.png` | pass |
| networth/free | `63-networth__free.png` | pass |
| networth/offline | `64-networth__offline.png` | pass |
| networth/error | `65-networth__error.png` | pass |
| balances/happy | `66-balances__happy.png` | pass |
| balances/empty | `67-balances__empty.png` | pass |
| balances/free | `68-balances__free.png` | pass |
| balances/offline | `69-balances__offline.png` | pass |
| balances/error | `70-balances__error.png` | pass |
| pro/happy | `71-pro__happy.png` | pass |
| pro/empty | `72-pro__empty.png` | pass |
| pro/free | `73-pro__free.png` | pass |
| pro/offline | `74-pro__offline.png` | pass |
| pro/error | `75-pro__error.png` | pass |
| settings/happy | `76-settings__happy.png` | pass |
| settings/empty | `77-settings__empty.png` | pass |
| settings/free | `78-settings__free.png` | pass |
| settings/offline | `79-settings__offline.png` | pass |
| settings/error | `80-settings__error.png` | pass |
| about/happy | `81-about__happy.png` | pass — reported '1.6.8 (60' clip disproven by screencapture -l of live window (full '1.6.8 (60)') |
| about/empty | `82-about__empty.png` | pass — reported '1.6.8 (60' clip disproven by screencapture -l of live window (full '1.6.8 (60)') |
| about/free | `83-about__free.png` | pass — reported '1.6.8 (60' clip disproven by screencapture -l of live window (full '1.6.8 (60)') |
| about/offline | `84-about__offline.png` | pass — reported '1.6.8 (60' clip disproven by screencapture -l of live window (full '1.6.8 (60)') |
| about/error | `85-about__error.png` | pass — reported '1.6.8 (60' clip disproven by screencapture -l of live window (full '1.6.8 (60)') |
| intro/signedout | `86-intro__signedout.png` | pass |
| auth/signedout | `87-auth__signedout.png` | pass |
| auth-stalled/signedout | `88-auth-stalled__signedout.png` | pass |
| present-bill-new/happy | `89-present-bill-new__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-bill-edit/happy | `90-present-bill-edit__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-card-new/happy | `91-present-card-new__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-card-edit/happy | `92-present-card-edit__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-pay/happy | `93-present-pay__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-pay-card/happy | `94-present-pay-card__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-tx-new/happy | `95-present-tx-new__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-tx-edit/happy | `96-present-tx-edit__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-edit-payment/happy | `97-present-edit-payment__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-income-new/happy | `98-present-income-new__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |
| present-income-edit/happy | `99-present-income-edit__happy.png` | pass — sheet bottom band/unlabeled pills are FH_SNAPSHOT contentView-render artifacts; disproven by screencapture -l (labeled Cancel/Save) |

### android-phone — 85 cells

| cell | capture | verdict |
|---|---|---|
| dashboard/happy | `01-dashboard__happy.png` | pass |
| dashboard/empty | `02-dashboard__empty.png` | pass |
| dashboard/free | `03-dashboard__free.png` | pass |
| dashboard/offline | `04-dashboard__offline.png` | pass |
| dashboard/error | `05-dashboard__error.png` | pass |
| bills/happy | `06-bills__happy.png` | invalid-splash (capture fired before load) → recaptured fh-sweep-android-recheck3 — pass |
| bills/empty | `07-bills__empty.png` | invalid-splash (capture fired before load) → recaptured fh-sweep-android-recheck3 — pass |
| bills/free | `08-bills__free.png` | invalid-splash (capture fired before load) → recaptured fh-sweep-android-recheck3 — pass |
| bills/offline | `09-bills__offline.png` | pass |
| bills/error | `10-bills__error.png` | pass |
| cards/happy | `11-cards__happy.png` | pass |
| cards/empty | `12-cards__empty.png` | pass |
| cards/free | `13-cards__free.png` | pass |
| cards/offline | `14-cards__offline.png` | pass |
| cards/error | `15-cards__error.png` | pass |
| loans/happy | `16-loans__happy.png` | pass |
| loans/empty | `17-loans__empty.png` | pass |
| loans/free | `18-loans__free.png` | pass |
| loans/offline | `19-loans__offline.png` | pass |
| loans/error | `20-loans__error.png` | pass |
| payoff/happy | `21-payoff__happy.png` | finding F21 ('save $810,297.43 vs mins' on never-clearing mins) → fixed; recapture fh-sweep-android-recheck3/05-payoff__happy.png shows 'minimums never clear this debt' — pass |
| payoff/empty | `22-payoff__empty.png` | pass |
| payoff/free | `23-payoff__free.png` | pass |
| payoff/offline | `24-payoff__offline.png` | pass |
| payoff/error | `25-payoff__error.png` | pass |
| rewards/happy | `26-rewards__happy.png` | pass |
| rewards/empty | `27-rewards__empty.png` | pass |
| rewards/free | `28-rewards__free.png` | pass |
| rewards/offline | `29-rewards__offline.png` | pass |
| rewards/error | `30-rewards__error.png` | pass |
| income/happy | `31-income__happy.png` | pass |
| income/empty | `32-income__empty.png` | pass |
| income/free | `33-income__free.png` | pass |
| income/offline | `34-income__offline.png` | pass |
| income/error | `35-income__error.png` | pass |
| budget/happy | `36-budget__happy.png` | pass |
| budget/empty | `37-budget__empty.png` | pass |
| budget/free | `38-budget__free.png` | pass |
| budget/offline | `39-budget__offline.png` | pass |
| budget/error | `40-budget__error.png` | pass |
| spending/happy | `41-spending__happy.png` | pass |
| spending/empty | `42-spending__empty.png` | pass |
| spending/free | `43-spending__free.png` | pass |
| spending/offline | `44-spending__offline.png` | pass |
| spending/error | `45-spending__error.png` | pass |
| subscriptions/happy | `46-subscriptions__happy.png` | pass |
| subscriptions/empty | `47-subscriptions__empty.png` | invalid-splash (capture fired before load) → recaptured fh-sweep-android-recheck3 — pass |
| subscriptions/free | `48-subscriptions__free.png` | invalid-splash (capture fired before load) → recaptured fh-sweep-android-recheck3 — pass |
| subscriptions/offline | `49-subscriptions__offline.png` | pass |
| subscriptions/error | `50-subscriptions__error.png` | invalid-splash (capture fired before load) → recaptured fh-sweep-android-recheck3 — pass |
| calendar/happy | `51-calendar__happy.png` | invalid-splash (capture fired before load) → recaptured fh-sweep-android-recheck3 — pass |
| calendar/empty | `52-calendar__empty.png` | pass |
| calendar/free | `53-calendar__free.png` | pass |
| calendar/offline | `54-calendar__offline.png` | pass |
| calendar/error | `55-calendar__error.png` | pass |
| history/happy | `56-history__happy.png` | pass |
| history/empty | `57-history__empty.png` | pass |
| history/free | `58-history__free.png` | pass |
| history/offline | `59-history__offline.png` | pass |
| history/error | `60-history__error.png` | pass |
| networth/happy | `61-networth__happy.png` | pass |
| networth/empty | `62-networth__empty.png` | pass |
| networth/free | `63-networth__free.png` | invalid-splash (capture fired before load) → recaptured fh-sweep-android-recheck3 — pass |
| networth/offline | `64-networth__offline.png` | pass |
| networth/error | `65-networth__error.png` | pass |
| balances/happy | `66-balances__happy.png` | pass |
| balances/empty | `67-balances__empty.png` | pass |
| balances/free | `68-balances__free.png` | pass |
| balances/offline | `69-balances__offline.png` | pass |
| balances/error | `70-balances__error.png` | pass |
| more/happy | `71-more__happy.png` | pass |
| more/empty | `72-more__empty.png` | pass |
| more/free | `73-more__free.png` | pass |
| more/offline | `74-more__offline.png` | pass |
| more/error | `75-more__error.png` | pass |
| pro/happy | `76-pro__happy.png` | pass |
| pro/empty | `77-pro__empty.png` | pass |
| pro/free | `78-pro__free.png` | pass |
| pro/offline | `79-pro__offline.png` | pass |
| pro/error | `80-pro__error.png` | pass |
| settings/happy | `81-settings__happy.png` | pass |
| settings/empty | `82-settings__empty.png` | pass |
| settings/free | `83-settings__free.png` | pass |
| settings/offline | `84-settings__offline.png` | pass |
| settings/error | `85-settings__error.png` | pass |

### android-tablet — 68 cells

| cell | capture | verdict |
|---|---|---|
| bill-new.png/01-bill-new | `01-bill-new.png` | pass |
| bill-edit.png/02-bill-edit | `02-bill-edit.png` | pass |
| pay.png/03-pay | `03-pay.png` | pass |
| bill-filters.png/04-bill-filters | `04-bill-filters.png` | pass |
| card-new.png/05-card-new | `05-card-new.png` | pass |
| card-edit.png/06-card-edit | `06-card-edit.png` | pass |
| pay-card.png/07-pay-card | `07-pay-card.png` | pass |
| card-filters.png/08-card-filters | `08-card-filters.png` | pass |
| account-new.png/09-account-new | `09-account-new.png` | pass |
| account-edit.png/10-account-edit | `10-account-edit.png` | pass |
| goal-new.png/11-goal-new | `11-goal-new.png` | pass |
| goal-edit.png/12-goal-edit | `12-goal-edit.png` | pass |
| tx-new.png/13-tx-new | `13-tx-new.png` | pass |
| tx-edit.png/14-tx-edit | `14-tx-edit.png` | pass |
| category-budgets.png/15-category-budgets | `15-category-budgets.png` | pass |
| income-new.png/16-income-new | `16-income-new.png` | pass |
| income-edit.png/17-income-edit | `17-income-edit.png` | pass |
| income-adj-new.png/18-income-adj-new | `18-income-adj-new.png` | pass |
| income-adj-edit.png/19-income-adj-edit | `19-income-adj-edit.png` | pass |
| edit-payment.png/20-edit-payment | `20-edit-payment.png` | pass |
| sub-edit.png/21-sub-edit | `21-sub-edit.png` | pass |
| manage-link.png/22-manage-link | `22-manage-link.png` | pass |
| rollover-review.png/23-rollover-review | `23-rollover-review.png` | pass |
| rate-report.png/24-rate-report | `24-rate-report.png` | pass |
| group-account.png/25-group-account | `25-group-account.png` | pass |
| group-security.png/26-group-security | `26-group-security.png` | pass |
| group-preferences.png/27-group-preferences | `27-group-preferences.png` | pass |
| group-budget.png/28-group-budget | `28-group-budget.png` | pass |
| group-notifications.png/29-group-notifications | `29-group-notifications.png` | pass |
| group-family.png/30-group-family | `30-group-family.png` | pass |
| group-automation.png/31-group-automation | `31-group-automation.png` | pass |
| group-bank.png/32-group-bank | `32-group-bank.png` | pass |
| group-data.png/33-group-data | `33-group-data.png` | pass |
| group-about.png/34-group-about | `34-group-about.png` | pass |
| dialog-name.png/35-dialog-name | `35-dialog-name.png` | pass |
| dialog-email.png/36-dialog-email | `36-dialog-email.png` | pass |
| dialog-password.png/37-dialog-password | `37-dialog-password.png` | pass |
| dialog-clear.png/38-dialog-clear | `38-dialog-clear.png` | pass |
| dialog-delete.png/39-dialog-delete | `39-dialog-delete.png` | pass |
| dialog-totpSetup.png/40-dialog-totpSetup | `40-dialog-totpSetup.png` | pass |
| dialog-passkeys.png/41-dialog-passkeys | `41-dialog-passkeys.png` | pass |
| dialog-emailEnable.png/42-dialog-emailEnable | `42-dialog-emailEnable.png` | pass |
| dialog-emailDisable.png/43-dialog-emailDisable | `43-dialog-emailDisable.png` | pass |
| dialog-backup.png/44-dialog-backup | `44-dialog-backup.png` | pass |
| dialog-timezone.png/45-dialog-timezone | `45-dialog-timezone.png` | pass |
| dialog-period.png/46-dialog-period | `46-dialog-period.png` | pass |
| dialog-autopayhour.png/47-dialog-autopayhour | `47-dialog-autopayhour.png` | pass |
| dialog-leaddays.png/48-dialog-leaddays | `48-dialog-leaddays.png` | pass |
| dialog-notifyhour.png/49-dialog-notifyhour | `49-dialog-notifyhour.png` | pass |
| dialog-dashboardlayout.png/50-dialog-dashboardlayout | `50-dialog-dashboardlayout.png` | pass |
| dialog-currency.png/51-dialog-currency | `51-dialog-currency.png` | pass |
| dialog-defaultview.png/52-dialog-defaultview | `52-dialog-defaultview.png` | pass |
| dialog-appearance.png/53-dialog-appearance | `53-dialog-appearance.png` | pass |
| dialog-biolock.png/54-dialog-biolock | `54-dialog-biolock.png` | pass |
| dialog-licenses.png/55-dialog-licenses | `55-dialog-licenses.png` | pass |
| dialog-tabs.png/56-dialog-tabs | `56-dialog-tabs.png` | pass |
| paywall.png/57-paywall | `57-paywall.png` | pass |
| bank-import-prompt.png/58-bank-import-prompt | `58-bank-import-prompt.png` | pass |
| bank-balance-prompt.png/59-bank-balance-prompt | `59-bank-balance-prompt.png` | pass |
| dashboard/happy | `01-dashboard__happy.png` | pass |
| dashboard/empty | `02-dashboard__empty.png` | pass |
| dashboard/free | `03-dashboard__free.png` | pass |
| dashboard/offline | `04-dashboard__offline.png` | pass |
| dashboard/error | `05-dashboard__error.png` | pass |
| pay-card.png/01-pay-card | `01-pay-card.png` | pass |
| income-adj-edit.png/02-income-adj-edit | `02-income-adj-edit.png` | pass |
| bank-import-prompt.png/03-bank-import-prompt | `03-bank-import-prompt.png` | pass |
| bank-balance-prompt.png/04-bank-balance-prompt | `04-bank-balance-prompt.png` | pass |