#!/usr/bin/env node
'use strict';

/**
 * Read / write native + package marketing versions and store build numbers.
 *
 *   package.json              version
 *   ios/.../project.yml       MARKETING_VERSION + CURRENT_PROJECT_VERSION
 *   android/.../build.gradle  versionName + versionCode
 *
 * Usage:
 *   node scripts/native-versions.js
 *   node scripts/native-versions.js --prompt-ios
 *   node scripts/native-versions.js --prompt-android
 *   node scripts/native-versions.js --version 1.6.1 --ios-build 1
 *   node scripts/native-versions.js --version 1.6.1 --android-code 22
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
const PKG_JSON = path.join(ROOT, 'package.json');
const IOS_YML = path.join(ROOT, 'ios', 'FiHavenApp', 'project.yml');
const ANDROID_GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle.kts');

const VERSION_RE = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
  return String(pkg.version || '');
}

function readIos() {
  const text = fs.readFileSync(IOS_YML, 'utf8');
  const ver = (text.match(/MARKETING_VERSION:\s*"([^"]+)"/) || [])[1] || null;
  const build = (text.match(/CURRENT_PROJECT_VERSION:\s*"(\d+)"/) || [])[1];
  if (!build) throw new Error('CURRENT_PROJECT_VERSION not found in project.yml');
  return { version: ver, build: parseInt(build, 10) };
}

function readAndroid() {
  const text = fs.readFileSync(ANDROID_GRADLE, 'utf8');
  const code = (text.match(/versionCode\s*=\s*(\d+)/) || [])[1];
  const name = (text.match(/versionName\s*=\s*"([^"]+)"/) || [])[1] || null;
  if (!code) throw new Error('versionCode not found in build.gradle.kts');
  return { versionName: name, versionCode: parseInt(code, 10) };
}

function readVersions() {
  return {
    package: readPackageVersion(),
    ios: readIos(),
    android: readAndroid(),
  };
}

function normalizeVersion(raw, fallback) {
  const s = String(raw == null ? '' : raw).trim();
  const v = s === '' ? String(fallback || '') : s;
  if (!VERSION_RE.test(v)) {
    throw new Error('bad-version: expected semver like 1.6.1 (got ' + JSON.stringify(raw) + ')');
  }
  return v;
}

function suggestPatchBump(version) {
  const m = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return version;
  return m[1] + '.' + m[2] + '.' + (parseInt(m[3], 10) + 1);
}

function resolveBuild(current, raw, fallbackWhenEmpty) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return fallbackWhenEmpty != null ? fallbackWhenEmpty : current + 1;
  if (s === '+1' || s.toLowerCase() === 'bump') return current + 1;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) throw new Error('bad-build: ' + raw);
  return n;
}

/**
 * Update marketing version in the chosen sources.
 * opts.ios / opts.android / opts.package default true when omitted for CLI
 * `--version`; deploy prompts pass an explicit platform set so iOS deploy
 * does not touch Android (and vice versa).
 */
function setMarketingVersion(raw, opts) {
  const touchPkg = !opts || opts.package !== false;
  const touchIos = !opts || opts.ios !== false;
  const touchAndroid = !opts || opts.android !== false;

  const previous = {
    package: readPackageVersion(),
    ios: readIos().version,
    android: readAndroid().versionName,
  };
  const next = normalizeVersion(
    raw,
    previous.package || previous.ios || previous.android,
  );

  if (touchPkg) {
    const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
    if (pkg.version !== next) {
      pkg.version = next;
      fs.writeFileSync(PKG_JSON, JSON.stringify(pkg, null, 2) + '\n');
    }
  }

  if (touchIos) {
    const iosText = fs.readFileSync(IOS_YML, 'utf8');
    if (!/MARKETING_VERSION:\s*"[^"]+"/.test(iosText)) {
      throw new Error('MARKETING_VERSION not found in project.yml');
    }
    const iosUpdated = iosText.replace(
      /MARKETING_VERSION:\s*"[^"]+"/,
      'MARKETING_VERSION: "' + next + '"',
    );
    if (iosUpdated !== iosText) fs.writeFileSync(IOS_YML, iosUpdated);
  }

  if (touchAndroid) {
    const andText = fs.readFileSync(ANDROID_GRADLE, 'utf8');
    if (!/versionName\s*=\s*"[^"]+"/.test(andText)) {
      throw new Error('versionName not found in build.gradle.kts');
    }
    const andUpdated = andText.replace(
      /versionName\s*=\s*"[^"]+"/,
      'versionName = "' + next + '"',
    );
    if (andUpdated !== andText) fs.writeFileSync(ANDROID_GRADLE, andUpdated);
  }

  return {
    previous,
    version: next,
    changed:
      (touchPkg && previous.package !== next) ||
      (touchIos && previous.ios !== next) ||
      (touchAndroid && previous.android !== next),
  };
}

function setIosBuild(raw, opts) {
  const cur = readIos();
  const fallback = opts && opts.fallback != null ? opts.fallback : cur.build + 1;
  const next = resolveBuild(cur.build, raw, fallback);
  const text = fs.readFileSync(IOS_YML, 'utf8');
  const updated = text.replace(
    /CURRENT_PROJECT_VERSION:\s*"\d+"/,
    'CURRENT_PROJECT_VERSION: "' + next + '"',
  );
  if (updated === text && next !== cur.build) {
    throw new Error('failed to rewrite CURRENT_PROJECT_VERSION');
  }
  if (updated !== text) fs.writeFileSync(IOS_YML, updated);
  return { previous: cur.build, build: next, version: readIos().version };
}

function setAndroidVersionCode(raw, opts) {
  const cur = readAndroid();
  const fallback = opts && opts.fallback != null ? opts.fallback : cur.versionCode + 1;
  const next = resolveBuild(cur.versionCode, raw, fallback);
  const text = fs.readFileSync(ANDROID_GRADLE, 'utf8');
  const updated = text.replace(/versionCode\s*=\s*\d+/, 'versionCode = ' + next);
  if (updated === text && next !== cur.versionCode) {
    throw new Error('failed to rewrite versionCode');
  }
  if (updated !== text) fs.writeFileSync(ANDROID_GRADLE, updated);
  return {
    previous: cur.versionCode,
    versionCode: next,
    versionName: readAndroid().versionName,
  };
}

/**
 * npm-init style: `label (currently X): (default) ` — Enter accepts default.
 */
function promptLine(label, currently, defaultValue) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('non-interactive (no TTY) — pass flags explicitly'));
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const q = `${label} (currently ${currently}): (${defaultValue}) `;
    rl.question(q, (answer) => {
      rl.close();
      const t = String(answer || '').trim();
      resolve(t === '' ? String(defaultValue) : t);
    });
  });
}

/** Yes/no confirm. Default is no unless `defaultYes` is true. */
function promptConfirm(question, defaultYes) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('non-interactive (no TTY) — pass flags explicitly'));
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const hint = defaultYes ? 'Y/n' : 'y/N';
    rl.question(`${question} (${hint}) `, (answer) => {
      rl.close();
      const t = String(answer || '').trim().toLowerCase();
      if (t === '') {
        resolve(!!defaultYes);
        return;
      }
      resolve(t === 'y' || t === 'yes');
    });
  });
}

function printVersionSources() {
  const v = readVersions();
  console.log('Version sources:');
  console.log(`  package.json          ${v.package}`);
  console.log(`  iOS MARKETING_VERSION ${v.ios.version}`);
  console.log(`  Android versionName   ${v.android.versionName}`);
  const set = new Set([v.package, v.ios.version, v.android.versionName].filter(Boolean));
  if (set.size > 1) {
    console.log('⚠ Marketing versions disagree across package.json / iOS / Android.');
  }
  return v;
}

function changelogMentions(version) {
  try {
    const text = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    // Headings like ## [1.6.1] or ## 1.6.1 —
    const re = new RegExp(
      '(^|\\n)##\\s*\\[?' + version.replace(/\./g, '\\.') + '\\]?\\b',
    );
    return re.test(text);
  } catch (_) {
    return true; // don't block if CHANGELOG missing
  }
}

/**
 * After the user picks a marketing version, warn if package.json (or the
 * platform files / CHANGELOG) still look like they haven't been updated.
 * `scope`: { package?, ios?, android? } — only those sources are considered
 * for sync prompts (iOS deploy does not offer to rewrite Android).
 * Returns false if the user aborts.
 */
async function confirmVersionUpdate(chosen, scope) {
  const next = normalizeVersion(chosen);
  const doPkg = !scope || scope.package !== false;
  const doIos = !scope || scope.ios !== false;
  const doAndroid = !scope || scope.android !== false;

  const pkg = readPackageVersion();
  const ios = readIos().version;
  const android = readAndroid().versionName;
  const stale = [];
  if (doPkg && pkg !== next) stale.push(`package.json is still ${pkg}`);
  if (doIos && ios !== next) stale.push(`iOS MARKETING_VERSION is still ${ios}`);
  if (doAndroid && android !== next) stale.push(`Android versionName is still ${android}`);
  const changelogMissing = !changelogMentions(next);
  if (changelogMissing) {
    stale.push(`CHANGELOG.md has no ${next} section yet`);
  }

  if (!stale.length) {
    console.log(`✓ Checked version sources already at ${next}`);
    return true;
  }

  const syncable =
    (doPkg && pkg !== next ? 1 : 0) +
    (doIos && ios !== next ? 1 : 0) +
    (doAndroid && android !== next ? 1 : 0);

  console.log('');
  console.log(`You chose ${next}, but:`);
  for (const line of stale) console.log(`  • ${line}`);
  console.log('');

  // Only CHANGELOG is behind — version files in scope are already set.
  if (syncable === 0) {
    console.log(
      `ℹ CHANGELOG.md still needs a ${next} section — update that by hand.`,
    );
    return true;
  }

  if (doPkg && pkg !== next) {
    const sure = await promptConfirm(
      `Are you sure? You haven't updated package.json (still ${pkg}).`,
      false,
    );
    if (!sure) {
      console.log('Aborted — update package.json first, then rerun.');
      return false;
    }
  } else {
    const sure = await promptConfirm(
      `Are you sure? Some version sources still aren't on ${next}.`,
      false,
    );
    if (!sure) {
      console.log('Aborted.');
      return false;
    }
  }

  const parts = [];
  if (doPkg) parts.push('package.json');
  if (doIos) parts.push('iOS');
  if (doAndroid) parts.push('Android');
  const update = await promptConfirm(
    `Do you want me to update them (${parts.join(' + ')}) to ${next}?`,
    true,
  );
  if (!update) {
    console.log('Aborted — update the version files yourself, then rerun.');
    return false;
  }

  if (changelogMissing) {
    console.log(
      `ℹ CHANGELOG.md still needs a ${next} section — update that by hand.`,
    );
  }

  return true;
}

async function promptMarketingVersion(scope) {
  const sources = printVersionSources();
  const current =
    (scope && scope.ios && sources.ios.version) ||
    (scope && scope.android && sources.android.versionName) ||
    sources.package ||
    sources.ios.version ||
    sources.android.versionName;
  const suggested = suggestPatchBump(current);
  const versionRaw = await promptLine('Version', current, suggested);
  const next = normalizeVersion(versionRaw, current);
  if (!(await confirmVersionUpdate(next, scope))) {
    const err = new Error('aborted');
    err.code = 'aborted';
    throw err;
  }
  return setMarketingVersion(next, scope);
}

async function promptIosRelease() {
  const cur = readIos();
  // iOS deploy updates package.json + iOS only — leave Android alone.
  const ver = await promptMarketingVersion({ package: true, ios: true, android: false });
  // New marketing version → fresh App Store build train; same version → +1.
  const suggestedBuild = ver.changed ? 1 : cur.build + 1;
  const buildRaw = await promptLine('iOS build', cur.build, suggestedBuild);
  const build = setIosBuild(buildRaw, { fallback: suggestedBuild });
  console.log(`→ ${ver.previous.ios} (${cur.build}) → ${ver.version} (${build.build})`);
  return { version: ver, build };
}

async function promptAndroidRelease() {
  const cur = readAndroid();
  // Android deploy updates package.json + Android only — leave iOS alone.
  const ver = await promptMarketingVersion({ package: true, ios: false, android: true });
  // Play Store versionCode is always monotonic — never reset when the
  // marketing version (versionName) changes. Always ship previous + 1.
  const nextCode = cur.versionCode + 1;
  console.log(
    `→ Android versionCode ${cur.versionCode} → ${nextCode} (+1; Play requires a monotonic code)`,
  );
  const code = setAndroidVersionCode(nextCode, { fallback: nextCode });
  console.log(
    `→ ${ver.previous.android} (${cur.versionCode}) → ${ver.version} (${code.versionCode})`,
  );
  return { version: ver, versionCode: code };
}

// Back-compat aliases used by deploy scripts.
const promptIosBuild = promptIosRelease;
const promptAndroidVersionCode = promptAndroidRelease;

function parseArgs(argv) {
  let version = null;
  let iosBuild = null;
  let androidCode = null;
  let promptIos = false;
  let promptAndroid = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prompt-ios') promptIos = true;
    else if (a === '--prompt-android') promptAndroid = true;
    else if (a === '--version' || a === '--marketing-version') {
      version = argv[++i];
      if (version == null) throw new Error('missing value for ' + a);
    } else if (a === '--ios' || a === '--ios-build' || a === '--build') {
      iosBuild = argv[++i];
      if (iosBuild == null) throw new Error('missing value for ' + a);
    } else if (a === '--android' || a === '--android-code' || a === '--version-code') {
      androidCode = argv[++i];
      if (androidCode == null) throw new Error('missing value for ' + a);
    } else if (a === '-h' || a === '--help') {
      console.log(`Usage: node scripts/native-versions.js [options]

  --prompt-ios / --prompt-android   npm-init prompts (version + build)
  --version 1.6.1                   sync package.json + iOS + Android names
  --ios-build N|+1
  --android-code N|+1`);
      process.exit(0);
    } else {
      throw new Error('unknown arg: ' + a);
    }
  }
  return { version, iosBuild, androidCode, promptIos, promptAndroid };
}

async function main() {
  const { version, iosBuild, androidCode, promptIos, promptAndroid } = parseArgs(
    process.argv.slice(2),
  );
  const out = {};
  if (promptIos) out.ios = await promptIosRelease();
  if (promptAndroid) out.android = await promptAndroidRelease();
  if (version != null) out.version = setMarketingVersion(version);
  if (iosBuild != null) out.iosBuild = setIosBuild(iosBuild);
  if (androidCode != null) out.androidCode = setAndroidVersionCode(androidCode);
  if (
    !promptIos &&
    !promptAndroid &&
    version == null &&
    iosBuild == null &&
    androidCode == null
  ) {
    Object.assign(out, readVersions());
  }
  if (!promptIos && !promptAndroid) console.log(JSON.stringify(out, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    if (err && err.code === 'aborted') process.exit(1);
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  readVersions,
  readIos,
  readAndroid,
  readPackageVersion,
  setMarketingVersion,
  setIosBuild,
  setAndroidVersionCode,
  promptIosRelease,
  promptAndroidRelease,
  promptIosBuild,
  promptAndroidVersionCode,
  suggestPatchBump,
};
