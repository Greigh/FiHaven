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

Runs the logic/model tests — the Kotlin equivalents of the Swift
`FiHavenCoreChecks`, asserting the same expected values for
cross-platform parity.

## Build the app (needs Android Studio + SDK)

```sh
# create android/local.properties with: sdk.dir=/Users/<you>/Library/Android/sdk
./gradlew :app:assembleDebug
```

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

## Hardening, dark mode & fonts

- **Token storage:** `EncryptedSharedPreferences` (AES-256, key in the
  Android Keystore), with a one-time migration from the old plain store.
- **Cleartext:** release forbids it (`res/xml/network_security_config.xml`);
  a debug override allows only `10.0.2.2` / `localhost`.
- **Appearance:** System / Light / Dark toggle in Settings, persisted
  locally (`fh_theme`) and applied in `FiHavenTheme`.
- **Fonts:** bundled OFL **Manrope** (variable, UI) + **IBM Plex Mono**
  (numbers) in `res/font/`.

## Toolchain

- Wrapper **Gradle 8.14.4**, AGP **8.11.1**, Kotlin **2.1.20**; both modules
  on JVM toolchain 17. compileSdk 36, minSdk 26.
