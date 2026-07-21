# Social sign-in (Sign in with Apple / Google) — setup guide

This is the step-by-step for turning on "Continue with Google" and "Sign in
with Apple". The code is already wired and **inert until you set the env
vars below** — exactly like the Plaid/Stripe integrations.

## What's already built

| Layer | Status |
|---|---|
| **Server** | `POST /api/auth/oauth/:provider` (verifies the OIDC ID token, auto-links by verified email, else creates a verified no-password account, issues a session) and `GET /api/auth/oauth/config`. OIDC verification in `server/oauth.js`; `oauth_identities` table in `server/db.js`. ✅ built + tested |
| **Web** | "Continue with Google/Apple" buttons on `/login`, hidden until a provider is configured (`client/js/social-login.js`). ✅ built |
| **iOS** | Native **Sign in with Apple** (no SDK) **and Continue with Google** (GoogleSignIn SDK) on the auth screen. ✅ built. |
| **Android** | **Continue with Google** (Credential Manager) **and Continue with Apple** (Custom Tab → one-time handoff → package-locked `fihaven://oauth/…`, with https App Link as fallback). ✅ built. |

**Design notes**
- Auto-linking: if the provider's *verified* email matches an existing
  account, the social identity is attached to it and the user is signed in.
- A federated provider is itself the auth factor, so OAuth sign-in completes
  directly and does **not** run app-level TOTP/email MFA.
- OAuth-only accounts get a sentinel password hash (password login can't match);
  the user can set a real password later via the normal reset flow.

---

## 1. Server env (`.env`)

```ini
OAUTH_VERIFY_MODE=production            # verify signatures (default in prod)
GOOGLE_OAUTH_CLIENT_ID=<web-id>,<ios-id>,<android-id>
APPLE_CLIENT_ID=<services-id>,<ios-bundle-id>
```
- These are **allowed audiences** (the `aud` claim). List every client ID
  that may mint a token for FiHaven, comma-separated.
- Leave a line blank to keep that provider's buttons hidden.
- For local testing without real keys: set `OAUTH_VERIFY_MODE=dev-trust` and
  put any value in the audience var; the server will trust hand-made tokens.

> **Deploy note:** `upload.sh` uploads a *sanitized* `.env` (it strips
> `SSH_*` / `DEV_USER_*`). The OAuth vars above are in its passthrough
> allowlist, so they reach production — if buttons say "not set up yet" in prod,
> confirm the deployed `.env` actually contains them (a stale deploy script that
> didn't allowlist them was the original cause).

## 2. Google (Google Cloud Console)

1. Console → **APIs & Services → Credentials → Create OAuth client ID**.
   Configure the OAuth consent screen first if prompted.
2. Create the OAuth clients:
   - **Web application** — Authorized JavaScript origins: `https://fihaven.app`
     (and `http://localhost:5222` for dev). Used by the web button.
   - **iOS** — bundle id `app.fihaven`. Used by the iOS app.
   - **Android** — package name `app.fihaven` + SHA-1 of your signing cert.
     This authorizes the app, but see the note below — its id is **not** used
     as a token audience.
3. Put **only the Web + iOS** ids in `GOOGLE_OAUTH_CLIENT_ID` (comma-separated).
   Android Credential Manager uses the **Web** client id as its `serverClientId`,
   so Android ID tokens carry the Web `aud` — already covered. The Android OAuth
   client just needs to exist (package + SHA-1); you never reference its id.
4. Web button needs the **Web** client id surfaced to the page — it already is,
   via `GET /api/auth/oauth/config`.

## 3. Apple (Apple Developer)  — configured: Services ID `app.fihaven.web`

1. **Certificates, Identifiers & Profiles → Identifiers**:
   - Your **App ID** (`app.fihaven`): enable the **Sign in with Apple**
     capability. (Done — it's the primary App ID below.)
   - Create a **Services ID** (`app.fihaven.web`) for web/Android. Enable
     **Sign in with Apple → Configure**: primary App ID `app.fihaven`, domain
     `fihaven.app`, **Return URL** `https://fihaven.app/login`, then **Save**.
2. `APPLE_CLIENT_ID=app.fihaven.web,app.fihaven` — the Services ID first (the
   web button uses the first entry as its client id) then the iOS bundle id
   (the native token's `aud`). Both are trusted audiences server-side.
3. **No client secret and no domain-association file** are needed. The current
   portal flow registers the domain + Return URL inline (no
   `apple-developer-domain-association.txt` download), and we verify the
   identity token against Apple's public JWKS rather than the token endpoint.
   *If* web sign-in ever errors with an unverified-domain message, that's when
   you'd host the file — the server already serves `client/public/.well-known/`.

## 4. iOS app

**Both buttons are built** in `AuthView`. To make them work:
- **Google (built — GoogleSignIn SDK):** wired in `project.yml` — the SDK
  package, the `GIDClientID` (iOS client id), and the reversed-client-id URL
  scheme are all set. After pulling, run `cd ios/FiHavenApp && xcodegen generate`
  so the `.xcodeproj` picks them up. The button calls
  `GIDSignIn.sharedInstance.signIn(...)` → `env.oauthSignIn(provider:"google", …)`;
  `FiHavenApp` completes the redirect via `.onOpenURL`.
- **Sign in with Apple (built):** add the **"Sign in with Apple" capability** to
  the FiHaven target (Xcode → Signing & Capabilities → + Capability) so the
  entitlement is present, and put the bundle id `app.fihaven` in
  `APPLE_CLIENT_ID` server-side.

## 5. Android app

- **Google (built — Credential Manager + web fallback):** wired in
  `app/build.gradle.kts` (`androidx.credentials*` + `googleid` deps, and
  `BuildConfig.GOOGLE_WEB_CLIENT_ID`). The auth button tries
  **`GetSignInWithGoogleOption`**, then One Tap (`GetGoogleIdOption`). If
  Credential Manager still fails (typical `DEVELOPER_ERROR` on Play builds
  missing the App Signing SHA-1), it opens a Custom Tab to
  `/oauth-google-android.html` (Google Identity Services). That page deposits
  a one-time handoff via `POST /api/auth/oauth/google/handoff` and returns through
  package-locked `fihaven://oauth/google?code=…` (Custom Tabs often keep
  same-host `https://fihaven.app/oauth/…` in the tab). The https App Link page
  remains a fallback with an “Open FiHaven” control. Failed / expired handoffs
  show an on-screen error instead of a silent signed-out state.
  **Optional but recommended in Google Cloud:** create an **Android** OAuth
  client with package `app.fihaven` and every signing SHA-1 (debug, upload/
  release, and **Play App Signing** from Play Console → App integrity). Its
  client id is never referenced in code; without it, native CM fails and the
  web fallback is used. Play App Signing SHA-256 for current releases:
  `B3:45:72:79:EF:EF:BA:9C:ED:60:D8:20:E9:32:FC:69:99:32:67:E9:9E:74:41:6E:EF:72:2D:AE:0F:91:8F:AB`
  (copy the matching SHA-1 from Play Console). Upload-key SHA-1:
  `DB:2E:A1:76:F5:FB:A8:30:AC:7D:73:A6:44:BC:E6:3D:3B:04:05:12`.
- **Apple on Android (built — Custom Tab web flow):** the "Continue with Apple"
  button (`AppleWebSignIn`) opens Apple's authorize page in a Custom Tab using
  `BuildConfig.APPLE_SERVICES_ID` (`app.fihaven.web`) and redirect
  `…/api/auth/oauth/apple/callback`. Apple form-posts there; the server stores
  the id_token under a one-time handoff and returns via package-locked
  `fihaven://oauth/apple?code=…` (same Custom Tab reason as Google); https
  `https://fihaven.app/oauth/apple?code=…` remains available. `MainActivity`
  finishes via `vm.oauthSignInHandoff("apple", …)`.
  **One portal step required:** add this exact **Return URL** to the Services ID
  (alongside `/login`): `https://fihaven.app/api/auth/oauth/apple/callback`.

### 5b. App Links / Digital Asset Links (required for production)

`assetlinks.json` already lists package `app.fihaven` with debug / upload /
Play App Signing SHA-256 fingerprints and
`delegate_permission/common.handle_all_urls`. AASA includes `applinks` for
`/oauth/*`. After deploying those files, iOS Associated Domains also cover
`/plaid` for native Plaid OAuth Universal Links (see Plaid Dashboard allow-list).

1. Confirm live files:
   - `https://fihaven.app/.well-known/assetlinks.json`
   - `https://fihaven.app/.well-known/apple-app-site-association` (JSON,
     `Content-Type: application/json`, no redirect)
2. Android Studio → App Links Assistant **or**:
   `adb shell pm get-app-links app.fihaven` — domain `fihaven.app` should
   show `verified`.
3. Statement list tester:
   https://developers.google.com/digital-asset-links/tools/generator
4. iOS: Associated Domains already includes `applinks:fihaven.app` (Universal
   Links for `/oauth/*` and `/plaid`; native Apple/Google SDKs do not use the
   OAuth https path when Custom Tab returns via `fihaven://`).
5. Set `PUBLIC_ORIGIN=https://fihaven.app` in production so https App Link
   handoff URLs and iOS Plaid `/plaid` defaults resolve correctly. Custom Tab
   Android returns prefer `fihaven://oauth/…?code=` so the tab can leave Chrome.

Apple Services ID return URL does **not** change — only the post-callback
bounce into the app. Prefer `fihaven://oauth/…?code=` from Custom Tabs; keep
https App Links verified as a fallback.

## 6. Verify

- Local (no real keys): `OAUTH_VERIFY_MODE=dev-trust`,
  `GOOGLE_OAUTH_CLIENT_ID=test`, then
  `curl -XPOST localhost:5222/api/auth/oauth/google -H 'content-type: application/json' -d '{"idToken":"<hand-made JWT>"}'`.
- Handoff round-trip (dev): create via
  `curl -XPOST localhost:5222/api/auth/oauth/google/handoff -H 'content-type: application/json' -d '{"idToken":"<jwt>","state":"s"}'`
  then complete with `{"handoffCode":"<code>","state":"s"}` on `/oauth/google`.
- Production: set real audiences, `OAUTH_VERIFY_MODE=production`, click the
  buttons on `/login`. The button block stays hidden if config is empty, so a
  missing var fails safe.
- Android: after a Play build, Google / Apple Custom Tab fallback should open
  FiHaven on `fihaven://oauth/…?code=…` (or the https App Link fallback) without
  stalling in Chrome after account selection.
