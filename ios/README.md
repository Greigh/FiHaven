# FiHaven — Native (iOS / macOS)

Native SwiftUI client over the existing FiHaven API, using token/Bearer
auth. See [`docs/native-contract.md`](../docs/native-contract.md) for the
full API + data + design + billing contract both this app and the Android
app follow.

## Layout

- **`FiHavenCore/`** — platform-agnostic Swift package: models, the
  ported business logic (income / dates / payoff / schedule), and the
  `APIClient` (auth, data sync, account/MFA, **billing/entitlement**). No
  third-party deps; compiles and self-tests with just the Command Line
  Tools.
- **`FiHavenApp/`** — the SwiftUI iOS/macOS app (XcodeGen-generated),
  depending on `FiHavenCore`: auth + Turnstile, all feature screens,
  Settings/MFA, **StoreKit 2 subscriptions + paywall**, **dark-mode
  toggle**, and bundled fonts.

## Verify the core (no Xcode needed)

```sh
cd ios/FiHavenCore
swift run FiHavenCoreChecks            # hermetic: models, settings, logic, API (mocked)
```

Optional live round-trip against a running dev server
(`node server/index.js`), using a seeded token-mode session id:

```sh
FH_LIVE_TOKEN=<session id> FH_BASE=http://localhost:5222/fihaven \
  swift run FiHavenCoreChecks
```

## Build the app (needs full Xcode)

```sh
brew install xcodegen          # one-time
cd ios/FiHavenApp
xcodegen generate              # writes FiHaven.xcodeproj (git-ignored)
open FiHaven.xcodeproj
```

- **Run target:** an iOS Simulator, or **My Mac (Designed for iPad)** for
  the macOS build.
- **Dev server:** debug builds point at `http://localhost:5222/fihaven`
  (ATS permits localhost via `NSAllowsLocalNetworking`). Start it with
  `node server/index.js` from the repo root; release builds use production
  over HTTPS.

## Configuration & dev overrides

Read at launch (Xcode scheme → Run → Arguments), so no rebuild of the
project settings is needed to flip them:

| Env var | Effect |
|---|---|
| `FH_BASE` | Override the API base URL (e.g. point a debug build at production). |
| `FH_TURNSTILE_SITEKEY` | Override the Turnstile sitekey (the build ships Cloudflare's always-pass **test** key). |
| `FH_AUTOLOGIN=1` | Auto-login the dev demo account (DEBUG only). |
| `FH_TAB` / `FH_ROUTE` / `FH_SCREEN` | Jump to a tab / More route / present the paywall — screenshot helpers (DEBUG). |

To run a dev build against **production** with a real account, set both
`FH_BASE=https://fihaven.app` and `FH_TURNSTILE_SITEKEY`
to your real public sitekey.

## FiHaven Pro (StoreKit 2)

- Auto-renewing subscription; products `app.fihaven.pro.monthly`
  / `.yearly` (match App Store Connect + the server product map).
- `FiHaven.storekit` is wired into the generated scheme, so plans resolve
  in the **Simulator when run from Xcode** (a raw `simctl launch` can't
  inject it — the paywall then shows its graceful empty state).
- The **server is the source of truth**: a verified transaction is sent to
  `/api/billing/apple/verify`; the app reads entitlement back. Promo codes
  redeem via `/api/billing/promo/redeem` (free grants) or hand off to
  Apple's offer-code sheet (`store_offer`).
- **Pro-gated** features: Payoff, Calendar, History. Everything else is free.
- **Dev override (DEBUG only):** Settings → Developer can simulate the
  entitlement — Off (use the server), Free, or a synthetic active / expired /
  grace / canceled state — to exercise Pro gating and expiry UI without a real
  purchase. Compiled out of release builds (`#if DEBUG`).

**TestFlight / App Store:** always archive with **Release** (`./scripts/ios-testflight.sh`
does this explicitly). Debug builds include the Developer screen and other
`#if DEBUG` tooling; Release does not.

## Notifications

Three channels share the same reminder settings (§6 in the contract):

1. **Local** — `localNotifications` schedules on-device reminders (`NotificationScheduler`).
2. **Email** — server scheduler to your verified address.
3. **Push** — `pushNotifications` registers an APNs device token with the server (Settings → Push notifications). Requires the Push Notifications capability on `app.fihaven` and server APNs credentials (`APNS_*` in `.env`).

Enable **Push Notifications** on the App ID in the Apple Developer portal and use a provisioning profile that includes the `aps-environment` entitlement.

## Dashboard layouts

The Dashboard supports **Classic** (fixed) and **Widgets** (reorderable,
toggleable cards). The nine-widget catalog (`DashboardWidget`) and its defaults
match web and Android — see [`docs/native-contract.md`](../docs/native-contract.md) §6/§9.

## Dark mode & fonts

- Appearance toggle (System / Light / Dark) in Settings, persisted locally
  (`fh_theme`, mirroring the web) and applied via `.preferredColorScheme`.
- Bundled OFL fonts: **Manrope** (variable, UI) + **IBM Plex Mono**
  (numbers), in `Sources/Resources/Fonts/` and registered via `UIAppFonts`.

## Toolchain notes

- `xcodebuild -version` must succeed (full Xcode, not just Command Line
  Tools). If `xcode-select -p` points at `CommandLineTools`, run
  `sudo xcode-select -s /Applications/Xcode.app` after installing Xcode.

## App Store Connect & TestFlight

Legal URLs and TestFlight checklist: `docs/local/app-store-connect.md` (maintainer-local,
gitignored — see `docs/maintainer/README.md`).

**Upload:** `./scripts/ios-testflight.sh` from the repo root (see the doc for auth and ASC setup).

**Quick copy-paste:** Privacy Policy `https://fihaven.app/privacy` · EULA: **Apple Standard** (not `/terms`) · Terms in-app: `https://fihaven.app/terms`.
