#!/usr/bin/env node
'use strict';

/**
 * Upload a release AAB (+ optional ProGuard mapping) to Google Play internal track.
 * Usage: node scripts/play-upload.js [path/to/app-release.aab]
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const PACKAGE = process.env.GOOGLE_PLAY_PACKAGE || 'app.fihaven';
const KEY_FILE = process.env.GOOGLE_PLAY_SA_LOCAL || process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
const TRACK = process.env.GOOGLE_PLAY_TRACK || 'internal';
const AAB = process.argv[2] || path.join(__dirname, '../android/app/build/outputs/bundle/release/app-release.aab');
const MAPPING = process.env.GOOGLE_PLAY_MAPPING
  || path.join(path.dirname(AAB), '../../mapping/release/mapping.txt');

async function main() {
  if (!KEY_FILE || !fs.existsSync(KEY_FILE)) {
    console.error('Missing GOOGLE_PLAY_SA_LOCAL or key file:', KEY_FILE);
    process.exit(1);
  }
  if (!fs.existsSync(AAB)) {
    console.error('AAB not found:', AAB);
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const publisher = google.androidpublisher({ version: 'v3', auth: await auth.getClient() });

  const { data: edit } = await publisher.edits.insert({ packageName: PACKAGE });
  const editId = edit.id;
  console.log('Edit id:', editId);

  const versionCode = await readVersionCode(AAB);

  console.log('Uploading AAB…', AAB);
  await publisher.edits.bundles.upload({
    packageName: PACKAGE,
    editId,
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(AAB) },
  });

  if (fs.existsSync(MAPPING)) {
    console.log('Uploading deobfuscation mapping…', MAPPING);
    await publisher.edits.deobfuscationfiles.upload({
      packageName: PACKAGE,
      editId,
      apkVersionCode: versionCode,
      deobfuscationFileType: 'proguard',
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(MAPPING) },
    });
  } else {
    console.warn('No mapping file at', MAPPING);
  }

  await publisher.edits.tracks.update({
    packageName: PACKAGE,
    editId,
    track: TRACK,
    requestBody: {
      track: TRACK,
      releases: [{ status: 'completed', versionCodes: [versionCode] }],
    },
  });

  console.log('Committing edit…');
  await publisher.edits.commit({ packageName: PACKAGE, editId });
  console.log(`✅ Uploaded to ${TRACK} track for`, PACKAGE);
}

async function readVersionCode(aabPath) {
  // Parse versionCode from build.gradle.kts — simpler than unzipping the AAB.
  const gradle = fs.readFileSync(path.join(__dirname, '../android/app/build.gradle.kts'), 'utf8');
  const m = gradle.match(/versionCode\s*=\s*(\d+)/);
  if (!m) throw new Error('versionCode not found in build.gradle.kts');
  return Number(m[1]);
}

main().catch((e) => {
  console.error('Play upload failed:', e.message || e);
  process.exit(1);
});
