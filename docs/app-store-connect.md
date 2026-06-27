# App Store Connect — FiHaven (iOS)

Copy-paste values for **App Store** and **TestFlight**.

## Two different “license” fields

Apple uses **two** places that sound similar:

| Where | Field | What to put |
|-------|--------|-------------|
| **App Information** (General) | Privacy Policy URL | `https://fihaven.app/privacy` |
| **App Information** (General) | License Agreement (EULA) | **Apple’s Standard EULA** — leave custom **empty** |
| **TestFlight → Test Information** | License Agreement (big text box) | **Full plain-text Terms** — paste from [`testflight-license-agreement.txt`](./testflight-license-agreement.txt) |

The TestFlight box is **not** a URL field. External testers see this text when joining the beta. Use your **Terms of Use**, not the GitHub source license.

## Recommended legal setup

| Field | Value | Notes |
|-------|--------|--------|
| **Privacy Policy URL** | `https://fihaven.app/privacy` | Required. App Store Connect → **App Information** → Privacy Policy URL. |
| **License Agreement (EULA)** | **Apple’s Standard EULA** | Leave the custom EULA field **empty**. FiHaven’s [Terms of Use](https://fihaven.app/terms) still apply in-app and on the web; section 6 says store terms apply in addition. |
| **Terms of Use (in product)** | `https://fihaven.app/terms` | Not pasted into ASC for EULA when using Apple’s standard license. Linked from **More → About** and sign-up on iOS. |

Do **not** use the GitHub LICENSE as the App Store EULA — that is the **source-code** license, not the end-user license for the App Store binary.

## Where to set this in App Store Connect

1. **App Store Connect** → **Apps** → **FiHaven**
2. **App Information** (left sidebar under *General*)
   - **Privacy Policy URL:** `https://fihaven.app/privacy`
   - **License Agreement:** default (Apple Standard EULA) — do not upload a custom EULA unless legal counsel asks you to use `https://fihaven.app/terms` instead.
3. **App Privacy** — complete the privacy questionnaire to match [privacy.html](../client/privacy.html) (account, financial info you enter, optional Plaid, purchases, etc.).

## TestFlight

### Upload a build

From the repo root (requires full Xcode, team **365KR8NF53** signed in):

```sh
./scripts/ios-testflight.sh              # archive + upload to App Store Connect
./scripts/ios-testflight.sh --archive-only   # archive only; upload via Xcode Organizer
```

The script runs XcodeGen, resolves SPM packages, archives **Release** for generic iOS,
and exports with [`ios/FiHavenApp/ExportOptions.plist`](../ios/FiHavenApp/ExportOptions.plist).
Version/build come from `project.yml` (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`).

Optional API-key auth instead of an interactive Apple ID:

```sh
export APP_STORE_CONNECT_API_KEY_ID=...
export APP_STORE_CONNECT_API_ISSUER_ID=...
export APP_STORE_CONNECT_API_KEY_PATH=~/path/to/AuthKey_XXXX.p8
./scripts/ios-testflight.sh
```

After upload, processing in App Store Connect usually takes 5–15 minutes.

### Internal testing

- Upload a build from Xcode or CI → **TestFlight** → **Internal Testing** → add testers (no Beta App Review).

### External testing (optional)

Requires **Beta App Review** once per version (or when Apple requests re-review).

| Field | Suggestion |
|-------|------------|
| **License Agreement** | Paste entire contents of [`testflight-license-agreement.txt`](./testflight-license-agreement.txt) |
| **Beta App Description** | Short tester-facing summary: bills, cards, 0% promo tracking, optional Pro payoff planner. |
| **Feedback Email** | Your support address (e.g. `security@fihaven.app` or contact from the site). |
| **Demo account** | Verified test user + password if login is required; note 2FA off for review. |
| **Notes for reviewer** | “Terms: More → About → Terms of Use. Privacy: More → About → Privacy Policy. Pro features can be tested with [demo / promo / sandbox subscription].” |

Privacy Policy URL on the app record must be set before external testing is approved.

## In-app parity (already wired)

- **About → Privacy Policy** → `https://fihaven.app/privacy`
- **About → Terms of Use** → `https://fihaven.app/terms`
- **Sign up** on iOS shows consent copy linking to the same URLs.

## StoreKit products

Must match App Store Connect and the server:

- `app.fihaven.pro.monthly`
- `app.fihaven.pro.yearly`

See [native-contract.md](./native-contract.md) and `ios/FiHavenApp/FiHaven.storekit`.
