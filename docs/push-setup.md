# Push notifications setup (APNs + FCM)

FiHaven push needs **three** one-time setups: Apple (iOS), Firebase (Android app + server), and server `.env`.

Your project constants:

| Item | Value |
|------|-------|
| Apple Team ID | `365KR8NF53` |
| iOS bundle ID | `app.fihaven` |
| Android package | `app.fihaven` |
| Production server | `https://fihaven.app` (`/var/www/fihaven.app` on VPS) |

Run the interactive helper when you have the downloaded files:

```bash
bash scripts/push-setup.sh
```

---

## 1. Apple — Push Notifications (iOS)

### A. Enable capability on the App ID

1. Open [Identifiers → app.fihaven](https://developer.apple.com/account/resources/identifiers/bundleId/edit/app.fihaven).
2. Under **Capabilities**, check **Push Notifications**.
3. Click **Save**.

### B. Create an APNs key (.p8)

1. Open [Keys](https://developer.apple.com/account/resources/authkeys/list).
2. **+** → name it e.g. `FiHaven APNs`.
3. Enable **Apple Push Notifications service (APNs)** → **Continue** → **Register**.
4. **Download** the `.p8` file (only once). Note the **Key ID** (also in the filename: `AuthKey_<KEYID>.p8`).

You may already have `.p8` files in `~/Downloads`. Use one that was created with **APNs** enabled, or create a fresh key above.

### C. Xcode / provisioning

1. Xcode → **Settings → Accounts** → team **365KR8NF53** → **Download Manual Profiles** (or let Automatic signing refresh).
2. Archive/TestFlight builds need a profile that includes **Push Notifications**.
3. If signing fails after enabling push, open the FiHaven target → **Signing & Capabilities** → confirm **Push Notifications** appears (add if missing) → clean build folder.

**Sandbox vs production:** Debug/simulator builds use the APNs **sandbox**; TestFlight/App Store use **production**. The server uses `APNS_PRODUCTION=1` on fihaven.app.

---

## 2. Firebase — Android app + server

The `google-services.json` in Downloads for **BlueBubbles** (`com.bluebubbles.messaging`) is **not** FiHaven. Create a Firebase project for FiHaven (can share the same Google Cloud org as Play: `platinum-goods-499723-h2`).

### A. Create project + Android app

1. [Firebase console](https://console.firebase.google.com/) → **Add project** (e.g. `FiHaven`) or **Add app** to an existing GCP project.
2. **Add app** → **Android**.
3. Package name: **`app.fihaven`** (must match exactly).
4. Download **`google-services.json`** → save as:

   ```
   android/app/google-services.json
   ```

   (Gitignored — never commit.)

5. Rebuild Android: `BuildConfig.FCM_ENABLED` becomes `true` when that file exists.

### B. Server service account (FCM send API)

1. Firebase → **Project settings** (gear) → **Service accounts**.
2. **Generate new private key** → save JSON locally (e.g. `~/Downloads/fihaven-firebase-sa.json`).
3. This file is what the **server** uses to send push (`FCM_SERVICE_ACCOUNT_JSON`).

Optional: add an **Apple app** in the same Firebase project (bundle `app.fihaven`) if you later want FCM-as-proxy for iOS — FiHaven uses **direct APNs** today, so this is not required.

---

## 3. Server `.env` + deploy

Add to your **local** `.env` (repo root):

```env
# APNs — Key ID from Apple; Team ID from Xcode / project.yml
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=365KR8NF53
APNS_BUNDLE_ID=app.fihaven
APNS_PRODUCTION=1

# Local paths (upload.sh copies these to the VPS on deploy)
APNS_SA_LOCAL=/Users/you/Downloads/AuthKey_XXXXXXXXXX.p8
APNS_KEY_PATH=/var/www/fihaven.app/data/apns-key.p8

FCM_SA_LOCAL=/Users/you/Downloads/fihaven-firebase-sa.json
FCM_SERVICE_ACCOUNT_JSON=/var/www/fihaven.app/data/firebase-sa.json
```

`upload.sh` uploads the JSON/key files and includes `APNS_*` / `FCM_*` in the production `.env` on deploy.

After deploy, restart PM2:

```bash
ssh root@82.25.91.225 'cd /var/www/fihaven.app && pm2 restart fihaven --update-env'
```

---

## 4. Verify

### Server configured?

```bash
node scripts/push-check.js
```

Expect `APNs: configured` and `FCM: configured` when env + files are set.

### End-to-end

1. **iOS:** Settings → Notifications → **Push notifications** ON (physical device; simulator push is limited).
2. **Android:** Same toggle; needs `google-services.json` + POST_NOTIFICATIONS granted.
3. On server, confirm token registered:

   ```bash
   ssh root@82.25.91.225 'sqlite3 /var/www/fihaven.app/data/cleartab.db "SELECT platform, substr(token,1,16) FROM push_devices;"'
   ```

4. Trigger a reminder (bill due in N days matching `reminderLeadDays`) or temporarily test with scheduler helpers in dev.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| iOS never gets token | Push capability on App ID; physical device; `aps-environment` in entitlements |
| Android `FCM_ENABLED=false` | `android/app/google-services.json` missing or wrong package name |
| Server `skipped: unconfigured` | `APNS_*` / `FCM_*` missing on VPS `.env` or key files not uploaded |
| TestFlight works, debug doesn't | Server `APNS_PRODUCTION=1` only talks to production APNs; use release/TestFlight or set `APNS_PRODUCTION=0` for dev |
| Token in DB but no push | User `pushNotifications` + matching email reminder setting (e.g. `billReminders`) |
