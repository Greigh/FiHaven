#!/usr/bin/env node
'use strict';

/**
 * Build (optional) + upload a release AAB to Google Play.
 *
 * Usage:
 *   node scripts/play-upload.js --build
 *     → builds & uploads the versionCode already in build.gradle.kts
 *       (TTY: may prompt for marketing version / optional code change)
 *   node scripts/play-upload.js --version-code +1 --build   # bump then upload
 *   node scripts/play-upload.js --version-code 28 --build   # set then upload
 *   node scripts/play-upload.js --track alpha --build       # closed testing instead
 *   node scripts/play-upload.js path/to.aab
 *
 * Env:
 *   GOOGLE_PLAY_SA_LOCAL or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON — service-account JSON path
 *   GOOGLE_PLAY_PACKAGE — default app.fihaven
 *   GOOGLE_PLAY_TRACK — internal | alpha | beta | production (default: beta)
 *                       "beta" is Play Console Open testing, "alpha" is Closed testing
 *   GOOGLE_PLAY_ROLLOUT — staged rollout fraction for the release, e.g. 0.1 for 10%
 *                         (default: full release, status "completed")
 *   GOOGLE_PLAY_MAPPING — override R8 mapping.txt path
 *   GOOGLE_PLAY_NATIVE_SYMBOLS — override native-debug-symbols.zip path
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { google } = require('googleapis');
const nativeVersions = require('./native-versions');

const ROOT = path.join(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const PACKAGE = process.env.GOOGLE_PLAY_PACKAGE || 'app.fihaven';
const KEY_FILE = process.env.GOOGLE_PLAY_SA_LOCAL || process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
const TRACK = process.env.GOOGLE_PLAY_TRACK || 'beta';
const TRACKS = ['internal', 'alpha', 'beta', 'production'];
const TRACK_LABELS = {
  internal: 'Internal testing',
  alpha: 'Closed testing',
  beta: 'Open testing',
  production: 'Production',
};
const DEFAULT_AAB = path.join(ANDROID, 'app/build/outputs/bundle/release/app-release.aab');
const DEFAULT_MAPPING = path.join(ANDROID, 'app/build/outputs/mapping/release/mapping.txt');
const DEFAULT_NATIVE = path.join(
  ANDROID,
  'app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip',
);

function parseArgs(argv) {
  let build = false;
  let aab = null;
  let versionCode = null;
  let track = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--build' || arg === '-b') build = true;
    else if (arg === '--version-code' || arg === '--build-number') {
      versionCode = argv[++i];
      if (versionCode == null) throw new Error('--version-code requires a value (N or +1)');
    } else if (arg.startsWith('--version-code=')) {
      versionCode = arg.slice('--version-code='.length);
    } else if (arg === '--track') {
      track = argv[++i];
      if (track == null) throw new Error(`--track requires a value (${TRACKS.join(' | ')})`);
    } else if (arg.startsWith('--track=')) {
      track = arg.slice('--track='.length);
    } else if (arg === '-h' || arg === '--help') {
      console.log(`Usage: node scripts/play-upload.js [--build] [--version-code N|+1] [--track NAME] [path/to/app-release.aab]

Tracks (--track, or GOOGLE_PLAY_TRACK) — default: beta
${TRACKS.map((t) => `  ${t.padEnd(11)}Play Console: ${TRACK_LABELS[t]}`).join('\n')}

Open testing (beta) is public: anyone with the Play listing link can join, and
each release goes through Google review before testers get it.

Also uploads R8 mapping.txt and native-debug-symbols.zip when present.

By default the versionCode already in android/app/build.gradle.kts is used.
Pass --version-code +1 (or an absolute N) to bump before building.
With --build and a TTY, you can also confirm marketing version interactively.
Release name on Play is always "versionName (versionCode)", e.g. "1.6.2 (49)".
Set GOOGLE_PLAY_ROLLOUT=0.1 to release to 10% of testers instead of everyone.`);
      process.exit(0);
    } else if (!arg.startsWith('-')) aab = arg;
  }
  if (track != null && !TRACKS.includes(track)) {
    throw new Error(`Unknown --track "${track}" (expected ${TRACKS.join(' | ')})`);
  }
  return { build, aab: aab || DEFAULT_AAB, versionCode, track };
}

function loadEnvFile() {
  // Soft-load repo-root .env so GOOGLE_PLAY_* work without exporting by hand.
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] != null && process.env[key] !== '') continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function bundleRelease() {
  console.log('→ Building signed release AAB (./gradlew :app:bundleRelease)');
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const r = spawnSync(gradlew, [':app:bundleRelease'], {
    cwd: ANDROID,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error('bundleRelease failed');
    process.exit(r.status || 1);
  }
}

async function main() {
  loadEnvFile();
  const keyFile = process.env.GOOGLE_PLAY_SA_LOCAL || process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const { build, aab, versionCode: versionCodeArg, track: trackArg } = parseArgs(
    process.argv.slice(2),
  );
  const track = trackArg || process.env.GOOGLE_PLAY_TRACK || TRACK;
  if (!TRACKS.includes(track)) {
    console.error(`Unknown GOOGLE_PLAY_TRACK "${track}" (expected ${TRACKS.join(' | ')})`);
    process.exit(1);
  }
  const rollout = process.env.GOOGLE_PLAY_ROLLOUT ? Number(process.env.GOOGLE_PLAY_ROLLOUT) : null;
  if (rollout != null && !(rollout > 0 && rollout < 1)) {
    console.error(
      `GOOGLE_PLAY_ROLLOUT must be a fraction between 0 and 1 (got "${process.env.GOOGLE_PLAY_ROLLOUT}").`,
    );
    process.exit(1);
  }
  const mapping = process.env.GOOGLE_PLAY_MAPPING || DEFAULT_MAPPING;
  const nativeSymbols = process.env.GOOGLE_PLAY_NATIVE_SYMBOLS || DEFAULT_NATIVE;

  if (versionCodeArg != null) {
    const current = nativeVersions.readAndroid().versionCode;
    console.log(`→ Android versionCode (currently ${current}) → setting to ${versionCodeArg}`);
    nativeVersions.setAndroidVersionCode(versionCodeArg);
  } else if (build && process.stdin.isTTY) {
    // Interactive: confirm marketing version; versionCode defaults to current
    // (Enter keeps it — pass +1 or N to change).
    await nativeVersions.promptAndroidVersionCode();
  } else {
    const current = nativeVersions.readAndroid().versionCode;
    console.log(
      `→ Android versionCode ${current} (unchanged; pass --version-code +1 to bump)`,
    );
  }

  if (!keyFile) {
    console.error(
      'Missing service-account key: set GOOGLE_PLAY_SA_LOCAL (or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON).',
    );
    process.exit(1);
  }
  if (!fs.existsSync(keyFile)) {
    console.error(
      'Service-account key file not found at the path given by GOOGLE_PLAY_SA_LOCAL ' +
        '(or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON).',
    );
    process.exit(1);
  }

  if (build || !fs.existsSync(aab)) {
    if (!build && !fs.existsSync(aab)) {
      console.log('No AAB at default path — running bundleRelease first.');
    }
    bundleRelease();
  }
  if (!fs.existsSync(aab)) {
    console.error('AAB not found:', aab);
    process.exit(1);
  }

  const { versionName, versionCode } = nativeVersions.readAndroid();
  const releaseName = `${versionName || 'unknown'} (${versionCode})`;
  console.log(`Package ${PACKAGE}  ${releaseName}  track ${track} (${TRACK_LABELS[track]})`);
  console.log('AAB:', aab);

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const publisher = google.androidpublisher({ version: 'v3', auth: await auth.getClient() });

  const { data: edit } = await publisher.edits.insert({ packageName: PACKAGE });
  const editId = edit.id;
  console.log('Edit id:', editId);

  console.log('Uploading AAB…');
  await publisher.edits.bundles.upload({
    packageName: PACKAGE,
    editId,
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(aab) },
  });

  if (fs.existsSync(mapping)) {
    console.log('Uploading R8 deobfuscation mapping…');
    await publisher.edits.deobfuscationfiles.upload({
      packageName: PACKAGE,
      editId,
      apkVersionCode: versionCode,
      deobfuscationFileType: 'proguard',
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(mapping) },
    });
  } else {
    console.warn('No mapping.txt at', mapping, '— Play Vitals stack traces will be obfuscated.');
  }

  if (fs.existsSync(nativeSymbols)) {
    console.log('Uploading native debug symbols…');
    await publisher.edits.deobfuscationfiles.upload({
      packageName: PACKAGE,
      editId,
      apkVersionCode: versionCode,
      deobfuscationFileType: 'nativeCode',
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(nativeSymbols) },
    });
  } else {
    console.warn(
      'No native-debug-symbols.zip (AGP had nothing to extract).\n' +
        '  Third-party .so libs in this AAB ship already stripped, so Play may still\n' +
        '  show “upload debug symbols” — that warning is safe to ignore and does not\n' +
        '  block Closed/Internal/Production releases. R8 mapping.txt is what matters\n' +
        '  for our Kotlin/Compose crashes.',
    );
  }

  const release = {
    name: releaseName,
    versionCodes: [String(versionCode)],
    ...(rollout != null
      ? { status: 'inProgress', userFraction: rollout }
      : { status: 'completed' }),
  };
  await publisher.edits.tracks.update({
    packageName: PACKAGE,
    editId,
    track,
    requestBody: { track, releases: [release] },
  });

  console.log('Committing edit…');
  await publisher.edits.commit({ packageName: PACKAGE, editId });
  console.log(
    `✅ Uploaded ${releaseName} to Play track "${track}" — ${TRACK_LABELS[track]} (${PACKAGE})`,
  );
  if (rollout != null) {
    console.log(`  → Staged rollout at ${Math.round(rollout * 100)}% — increase it in Play Console`);
  }
  if (track === 'beta') {
    console.log('  → Play Console: Testing → Open testing → Releases');
    console.log('  → Open testing releases are reviewed by Google first (can take a day or two);');
    console.log('    testers see the update only once review completes.');
    console.log('  → Testers join themselves from the store listing or the opt-in link under');
    console.log('    Testing → Open testing → Testers.');
  } else if (track === 'alpha') {
    console.log('  → Play Console: Testing → Closed testing (alpha) → manage testers / copy link');
  } else if (track === 'internal') {
    console.log('  → Play Console: Testing → Internal testing');
  } else if (track === 'production') {
    console.log('  → Play Console: Production — submit for review if required');
  }
}

main().catch((e) => {
  const msg = e && (e.message || String(e));
  console.error('Play upload failed:', msg);
  if (/permission|forbidden|403/i.test(msg || '')) {
    console.error(`
The service account can often create an edit / upload an AAB but still fail on
commit if it is not granted release access on this app in Play Console.

Fix:
  1. Play Console → Users and permissions
  2. Invite (or open) the service-account email from GOOGLE_PLAY_SA_LOCAL
     (JSON field "client_email", ends in .iam.gserviceaccount.com)
  3. App permissions for app.fihaven — enable at least:
       • View app information and download bulk reports
       • Manage testing track releases  (needed for beta / open testing)
       • Manage production releases     (only if you use GOOGLE_PLAY_TRACK=production)
  4. Wait a few minutes, then re-run: bun run deploy:android

Also confirm Play Console → Setup → API access has this Cloud project linked.
`);
  }
  process.exit(1);
});