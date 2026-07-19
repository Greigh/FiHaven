# FiHaven — Android

Native Jetpack Compose client over the FiHaven API, sharing the contract
in [`docs/native-contract.md`](../docs/native-contract.md) with the iOS app.

## Layout

- **`core/`** — pure-Kotlin/JVM library: models, the ported business logic
  (Income / DateLogic / Schedule / Payoff), and the `ApiClient` (auth, data
  sync, account/MFA, **billing/entitlement**). No Android dependencies, so
  it compiles and unit-tests with just a JDK — no SDK required.
- **`app/`** — the Jetpack Compose UI on top of `:core`: auth + Turnstile,
  all feature screens, Settings/MFA, **Play Billing subscriptions +
  paywall**, **dark-mode toggle**, encrypted token storage, and bundled
  fonts.

## Verify the core (no Android SDK needed)

```sh
cd android
./gradlew :core:test
```

Runs the logic/model/settings tests — the Kotlin equivalents of the Swift
`FiHavenCoreChecks`, asserting the same expected values for
cross-platform parity.

## Build the app (needs Android Studio + SDK)

```sh
# create android/local.properties with: sdk.dir=/Users/<you>/Library/Android/sdk
./gradlew :app:assembleDebug
```

### Release signing (Play Store upload)

1. Generate an upload keystore once (back it up safely):
   ```sh
   keytool -genkey -v -keystore ~/fihaven-upload-key.jks -alias fihaven \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Copy `android/keystore.properties.example` → `android/keystore.properties`
   (gitignored) and point `storeFile` at your `.jks` with passwords.
3. Build a signed bundle:
   ```sh
   ./gradlew :app:bundleRelease
   ```
   Output: `app/build/outputs/bundle/release/app-release.aab`

   Play Console may warn about missing crash-debug assets. After each
   `bundleRelease`, upload these for the matching `versionCode` (they must
   come from the **same** Gradle build as the `.aab`):

   | File | Path | When |
   |------|------|------|
   | Native debug symbols | `app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip` | When AGP can extract them (`ndk.debugSymbolLevel`). Many deps ship pre-stripped `.so` files — then this zip is absent and Play’s “upload debug symbols” warning is **safe to ignore**. `bun run deploy:android` uploads the zip automatically when it exists. |
   | Deobfuscation (R8) | `app/build/outputs/mapping/release/mapping.txt` | Only when `isMinifyEnabled = true` |

   In Play Console: **Release** → **App bundle explorer** → select the
   version → **Downloads** → upload native debug symbols (and mapping when
   R8 is on). If R8 is off, the deobfuscation warning is informational —
   there is no mapping file to upload.

Bump `versionCode` in `app/build.gradle.kts` before each Play upload (or pass
`--version-code +1`). `deploy:android` does **not** auto-bump — it uploads
whatever code is already in the Gradle file. The Play release is named
`versionName (versionCode)` (e.g. `1.6.1 (27)`).

**One-shot upload** (from repo root; builds then uploads):

```sh
# Closed testing (“alpha” track) — default; uses current versionCode
bun run deploy:android

# Bump versionCode, then build + upload
bun run deploy:android -- --version-code +1

# Internal testing
GOOGLE_PLAY_TRACK=internal bun run deploy:android
```

Needs `keystore.properties` + `GOOGLE_PLAY_SA_LOCAL` in `.env`. Track names:
`internal` | `alpha` (Closed testing) | `beta` (Open testing) | `production`.

- **API:** debug and release builds both point at `https://fihaven.app`.
  For local server work, change `API_BASE` in `app/build.gradle.kts` or
  run JVM tests against `ApiConfig.localhost`.
- **Run/screenshot helpers** (DEBUG intent extras):
  ```sh
  adb shell am start -n app.fihaven/.MainActivity \
    --ez autologin true --es tab payoff --es theme dark
  ```
  `tab` (home/bills/cards/payoff/more), `route` (budget/calendar/history/settings),
  `theme` (system/light/dark).

## FiHaven Pro (Play Billing)

- Auto-renewing subscription; products `app.fihaven.pro.monthly`
  / `.yearly` (match the Play Console + the server product map).
- The **server is the source of truth**: a verified purchase token is sent
  to `/api/billing/google/verify`; the app reads entitlement back. Promo
  codes redeem via `/api/billing/promo/redeem`.
- Play Billing only returns products on a real device / a Play-enabled
  emulator with a Console listing; otherwise the paywall shows its graceful
  empty state and the promo path still works.
- **Pro-gated** features: Payoff, Calendar, History. Everything else is free.
- **Dev override (DEBUG only):** Settings → Developer can simulate the
  entitlement — Off (use the server), Free, or a synthetic active / expired /
  grace / canceled state — to exercise Pro gating and expiry UI without a real
  purchase. Gated by `BuildConfig.DEBUG`, so it's absent from release builds.

## Notifications

Three channels share the same reminder settings (§6 in the contract):

1. **Local** — `localNotifications` schedules on-device alarms (`NotificationScheduler`).
2. **Email** — server scheduler to your verified address.
3. **Push** — `pushNotifications` registers an FCM token with the server (Settings → Push notifications). Requires `android/app/google-services.json` from the Firebase console (see `google-services.json.example`) plus server `FCM_SERVICE_ACCOUNT_JSON`.

Local reminders need `POST_NOTIFICATIONS` (API 33+). A `BootReceiver` re-arms local alarms after reboot.

## Dashboard layouts

The Dashboard supports **Classic** (fixed) and **Widgets** (reorderable,
toggleable cards). The nine-widget catalog (`DashboardWidgets`) and its defaults
match web and iOS — see [`docs/native-contract.md`](../docs/native-contract.md) §6/§9.

## Hardening, dark mode & fonts

- **Token storage:** Android Keystore AES-256-GCM (`PrefsTokenStore`) — the
  Bearer token is encrypted at rest; upgrading from older builds may require
  signing in again once.
- **Cleartext:** release forbids it (`res/xml/network_security_config.xml`);
  a debug override allows only `10.0.2.2` / `localhost`.
- **Appearance:** System / Light / Dark toggle in Settings, persisted
  locally (`fh_theme`) and applied in `FiHavenTheme`.
- **Fonts:** bundled OFL **Manrope** (variable, UI) + **IBM Plex Mono**
  (numbers) in `res/font/`.

## Toolchain

- Wrapper **Gradle 8.14.4**, AGP **8.11.1**, Kotlin **2.1.20**; both modules
  on JVM toolchain 17. compileSdk 36, minSdk 26.
