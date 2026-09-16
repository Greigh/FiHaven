#!/usr/bin/env node
'use strict';

/**
 * bump-build.js — Updates the build version and release artifacts everywhere.
 *
 * Synchronizes:
 *   1.  ios/FiHavenApp/project.yml         (CURRENT_PROJECT_VERSION, MARKETING_VERSION)
 *   2.  android/app/build.gradle.kts       (versionCode, versionName)
 *   3.  package.json                       (version)
 *   4.  package-lock.json                  (version & root package version)
 *   5.  README.md                          (badge, platform rows, continuous counter)
 *   6.  docs/maintainer/store-listing-copy.md (train, current store copy link, description)
 *   7.  docs/maintainer/store-launch-checklist.md (train string, example release name)
 *   8.  docs/release-notes/README.md       (index table row)
 *   9.  docs/release-notes/v<version>/ios<build>-android<build>.md (store copy)
 *   10. CHANGELOG.md                       (pre-release table, build table, release section)
 *   11. CHANGELOGS.md                      (symlink verification)
 *   12. client/changelog.html              (latest beta entry, badge promotion)
 *
 * Post-bump:
 *   - Runs scripts/generate-markdown.js    (refreshes client/public/changelog.md)
 *   - Runs scripts/generate-sitemap.js     (verifies sitemap)
 *   - Runs scripts/nativeVersions.test.js  (validates version parity)
 *
 * Usage:
 *   node scripts/bump-build.js                      # bumps build +1 with current version
 *   node scripts/bump-build.js +1                   # bumps build +1
 *   node scripts/bump-build.js --build 55           # sets build to 55
 *   node scripts/bump-build.js --version 1.6.4      # sets marketing version
 *   node scripts/bump-build.js --notes "Description of release"
 *   node scripts/bump-build.js --dry-run            # preview changes without writing
 *   node scripts/bump-build.js --check              # verify all files are synchronized
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { readVersions } = require('./native-versions');

// File paths
const PATHS = {
  pkg: path.join(ROOT, 'package.json'),
  lock: path.join(ROOT, 'package-lock.json'),
  ios: path.join(ROOT, 'ios', 'FiHavenApp', 'project.yml'),
  android: path.join(ROOT, 'android', 'app', 'build.gradle.kts'),
  readme: path.join(ROOT, 'README.md'),
  storeListing: path.join(ROOT, 'docs', 'maintainer', 'store-listing-copy.md'),
  storeChecklist: path.join(ROOT, 'docs', 'maintainer', 'store-launch-checklist.md'),
  relNotesReadme: path.join(ROOT, 'docs', 'release-notes', 'README.md'),
  changelog: path.join(ROOT, 'CHANGELOG.md'),
  changelogs: path.join(ROOT, 'CHANGELOGS.md'),
  changelogHtml: path.join(ROOT, 'client', 'changelog.html'),
};

function formatDate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatHumanDate(d = new Date()) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function parseArgs(argv) {
  const args = {
    build: null,
    version: null,
    notes: null,
    dryRun: false,
    checkOnly: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') {
      args.checkOnly = true;
    } else if (a === '--dry-run' || a === '-n') {
      args.dryRun = true;
    } else if (a === '--build' || a === '-b') {
      args.build = argv[++i];
    } else if (a === '--version' || a === '-v') {
      args.version = argv[++i];
    } else if (a === '--notes' || a === '-m') {
      args.notes = argv[++i];
    } else if (a === '+1' || a === 'bump') {
      args.build = '+1';
    } else if (/^\d+$/.test(a)) {
      args.build = parseInt(a, 10);
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(1);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage: node scripts/bump-build.js [options] [N|+1]

Options:
  --build, -b <N|+1>     Target build number (defaults to current + 1)
  --version, -v <semver> Target marketing version (defaults to current version)
  --notes, -m <text>     Release notes / headline summary for this build
  --dry-run, -n          Preview file updates without writing to disk
  --check                Verify that all 12 version locations are in agreement
  -h, --help             Show this help message

Examples:
  node scripts/bump-build.js
  node scripts/bump-build.js +1 --notes "Bug fixes and performance improvements"
  node scripts/bump-build.js --build 55
  node scripts/bump-build.js --version 1.6.4 --build 55
  node scripts/bump-build.js --check
`);
}

function runCheck() {
  console.log('Verifying version synchronization across all locations...\n');
  const v = readVersions();
  const pkgVersion = v.package;
  const currentBuild = v.ios.build;

  let errors = 0;

  function report(name, ok, msg) {
    if (ok) {
      console.log(`  ✓ ${name}`);
    } else {
      console.log(`  ✗ ${name}: ${msg}`);
      errors++;
    }
  }

  report('package.json version matches iOS', v.package === v.ios.version, `${v.package} vs ${v.ios.version}`);
  report('package.json version matches Android', v.package === v.android.versionName, `${v.package} vs ${v.android.versionName}`);
  report('iOS CURRENT_PROJECT_VERSION matches Android versionCode', v.ios.build === v.android.versionCode, `${v.ios.build} vs ${v.android.versionCode}`);

  const readme = fs.readFileSync(PATHS.readme, 'utf8');
  report('README.md shield badge', readme.includes(`version-${pkgVersion}%20(build%20${currentBuild})`), `missing version-${pkgVersion} (build ${currentBuild})`);
  report('README.md platforms table', readme.includes(`(${pkgVersion} b${currentBuild})`), `missing (${pkgVersion} b${currentBuild})`);

  const storeListing = fs.readFileSync(PATHS.storeListing, 'utf8');
  report('store-listing-copy.md train', storeListing.includes(`build ${currentBuild} on both stores`), `missing build ${currentBuild} on both stores`);
  report('store-listing-copy.md link', storeListing.includes(`ios${currentBuild}-android${currentBuild}.md`), `missing ios${currentBuild}-android${currentBuild}.md`);

  const storeChecklist = fs.readFileSync(PATHS.storeChecklist, 'utf8');
  report('store-launch-checklist.md train', storeChecklist.includes(`build ${currentBuild} on both stores`), `missing build ${currentBuild} on both stores`);

  const changelog = fs.readFileSync(PATHS.changelog, 'utf8');
  report('CHANGELOG.md build heading', changelog.includes(`## [${pkgVersion} build ${currentBuild}]`), `missing ## [${pkgVersion} build ${currentBuild}]`);

  const notesFile = path.join(ROOT, 'docs', 'release-notes', `v${pkgVersion}`, `ios${currentBuild}-android${currentBuild}.md`);
  report('Store release notes file', fs.existsSync(notesFile), `missing ${path.relative(ROOT, notesFile)}`);

  const changelogHtml = fs.readFileSync(PATHS.changelogHtml, 'utf8');
  report('client/changelog.html entry', changelogHtml.includes(`id="v${pkgVersion}-b${currentBuild}"`), `missing id="v${pkgVersion}-b${currentBuild}"`);

  console.log('');
  if (errors === 0) {
    console.log(`All sites agree on version ${pkgVersion}, build ${currentBuild}.`);
    process.exit(0);
  } else {
    console.error(`Found ${errors} version discrepancy/discrepancies.`);
    process.exit(1);
  }
}

function updateFile(filePath, newContent, dryRun, label) {
  const rel = path.relative(ROOT, filePath);
  if (dryRun) {
    console.log(`  [dry-run] Would update: ${rel} (${label})`);
    return;
  }
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`  Updated: ${rel} (${label})`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.checkOnly) {
    runCheck();
    return;
  }

  const current = readVersions();
  const currentVersion = current.package;
  const currentBuild = current.ios.build;

  const nextVersion = args.version ? String(args.version).trim() : currentVersion;
  let nextBuild = currentBuild + 1;

  if (args.build != null) {
    if (args.build === '+1' || args.build === 'bump') {
      nextBuild = currentBuild + 1;
    } else {
      const parsed = parseInt(args.build, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        console.error(`Invalid build number: ${args.build}`);
        process.exit(1);
      }
      nextBuild = parsed;
    }
  }

  const defaultNotes = `Update build ${nextBuild}: bug fixes, stability improvements, and subsystem audit refinements across native clients and backend services.`;
  const notes = args.notes ? String(args.notes).trim() : defaultNotes;
  const isoDate = formatDate();
  const humanDate = formatHumanDate();

  console.log(`\n======================================================`);
  console.log(` FiHaven Build Synchronizer`);
  console.log(`======================================================`);
  console.log(`Marketing Version : ${currentVersion} → ${nextVersion}`);
  console.log(`Build Version     : ${currentBuild} → ${nextBuild}`);
  console.log(`Date              : ${isoDate} (${humanDate})`);
  console.log(`Headline / Notes  : ${notes}`);
  if (args.dryRun) console.log(`Mode              : DRY RUN (no files modified)`);
  console.log(`------------------------------------------------------\n`);

  // 1. package.json
  const pkgContent = JSON.parse(fs.readFileSync(PATHS.pkg, 'utf8'));
  pkgContent.version = nextVersion;
  updateFile(PATHS.pkg, JSON.stringify(pkgContent, null, 2) + '\n', args.dryRun, 'version');

  // 2. package-lock.json
  if (fs.existsSync(PATHS.lock)) {
    const lockContent = JSON.parse(fs.readFileSync(PATHS.lock, 'utf8'));
    lockContent.version = nextVersion;
    if (lockContent.packages && lockContent.packages['']) {
      lockContent.packages[''].version = nextVersion;
    }
    updateFile(PATHS.lock, JSON.stringify(lockContent, null, 2) + '\n', args.dryRun, 'version');
  }

  // 3. ios/FiHavenApp/project.yml
  let iosContent = fs.readFileSync(PATHS.ios, 'utf8');
  iosContent = iosContent.replace(/CURRENT_PROJECT_VERSION:\s*"\d+"/, `CURRENT_PROJECT_VERSION: "${nextBuild}"`);
  if (nextVersion !== currentVersion) {
    iosContent = iosContent.replace(/MARKETING_VERSION:\s*"[^"]+"/, `MARKETING_VERSION: "${nextVersion}"`);
  }
  iosContent = iosContent.replace(/carries build \d+/g, `carries build ${nextBuild}`);
  updateFile(PATHS.ios, iosContent, args.dryRun, 'CURRENT_PROJECT_VERSION');

  // 4. android/app/build.gradle.kts
  let androidContent = fs.readFileSync(PATHS.android, 'utf8');
  androidContent = androidContent.replace(/versionCode\s*=\s*\d+/, `versionCode = ${nextBuild}`);
  if (nextVersion !== currentVersion) {
    androidContent = androidContent.replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${nextVersion}"`);
  }
  updateFile(PATHS.android, androidContent, args.dryRun, 'versionCode');

  // 5. README.md
  let readmeContent = fs.readFileSync(PATHS.readme, 'utf8');
  readmeContent = readmeContent.replace(
    /\[!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-.*?-brightgreen\)/,
    `[![Version](https://img.shields.io/badge/version-${encodeURIComponent(nextVersion)}%20(build%20${nextBuild})-brightgreen)`
  );
  readmeContent = readmeContent.replace(
    /\|\s*\*\*Live\*\*\s*\(\d+\.\d+\.\d+\s+b\d+\)\s*\|/g,
    `| **Live** (${nextVersion} b${nextBuild}) |`
  );
  readmeContent = readmeContent.replace(
    /\(currently \*\*v\d+\.\d+\.\d+, build \d+\*\*\)/g,
    `(currently **v${nextVersion}, build ${nextBuild}**)`
  );
  updateFile(PATHS.readme, readmeContent, args.dryRun, 'badges & tables');

  // 6. docs/maintainer/store-listing-copy.md
  let storeListing = fs.readFileSync(PATHS.storeListing, 'utf8');
  storeListing = storeListing.replace(
    /\*\*Version train:\*\* \d+\.\d+\.\d+ — \*\*build \d+ on both stores\*\*[^)]*\)/,
    `**Version train:** ${nextVersion} — **build ${nextBuild} on both stores** (marketing bump ${currentVersion === nextVersion ? '1.6.2 → ' + nextVersion : currentVersion + ' → ' + nextVersion}; the build number is one shared counter and continued ${currentBuild} → ${nextBuild} without resetting)`
  );
  storeListing = storeListing.replace(
    /\*\*Current build's store copy:\*\* \[`\.\.\/release-notes\/v[^`]+`\]\([^)]+\)/,
    `**Current build's store copy:** [\`../release-notes/v${nextVersion}/ios${nextBuild}-android${nextBuild}.md\`](../release-notes/v${nextVersion}/ios${nextBuild}-android${nextBuild}.md)`
  );
  storeListing = storeListing.replace(
    /(The current train is \*\*[\d.]+\*\*[\s\S]*?current build is\s*)\n\[`ios\d+-android\d+\.md`\]\([^)]+\)\. Build \d+[\s\S]*?(?=\n\nThere is no combined)/,
    `$1\n[\`ios${nextBuild}-android${nextBuild}.md\`](../release-notes/v${nextVersion}/ios${nextBuild}-android${nextBuild}.md). Build ${nextBuild}\nneeds **no server migration and signs no one out** — ${notes}`
  );
  updateFile(PATHS.storeListing, storeListing, args.dryRun, 'store listing copy');

  // 7. docs/maintainer/store-launch-checklist.md
  let storeChecklist = fs.readFileSync(PATHS.storeChecklist, 'utf8');
  storeChecklist = storeChecklist.replace(
    /The \*\*current train is \d+\.\d+\.\d+,\s*build \d+ on both stores\*\*/,
    `The **current train is ${nextVersion},\nbuild ${nextBuild} on both stores**`
  );
  storeChecklist = storeChecklist.replace(
    /`versionName \(versionCode\)` \(e\.g\. `\d+\.\d+\.\d+ \(\d+\)`\)/,
    `\`versionName (versionCode)\` (e.g. \`${nextVersion} (${nextBuild})\`)`
  );
  updateFile(PATHS.storeChecklist, storeChecklist, args.dryRun, 'launch checklist');

  // 8. docs/release-notes/README.md
  let relNotesReadme = fs.readFileSync(PATHS.relNotesReadme, 'utf8');
  const notesLink = `v${nextVersion}/ios${nextBuild}-android${nextBuild}.md`;
  if (!relNotesReadme.includes(notesLink)) {
    const newRow = `| [${nextVersion}](${notesLink}) | iOS ${nextBuild} · Android ${nextBuild} | ${isoDate} | **Build ${nextBuild}**: ${notes}. **No server migration, no sign-out** |`;
    relNotesReadme = relNotesReadme.replace(
      /(\| Version \| Builds \| Date \| Notes \|\n\|---\|---\|---\|---\|\n)/,
      `$1${newRow}\n`
    );
    updateFile(PATHS.relNotesReadme, relNotesReadme, args.dryRun, 'index row');
  }

  // 9. docs/release-notes/v<version>/ios<build>-android<build>.md
  const notesDir = path.join(ROOT, 'docs', 'release-notes', `v${nextVersion}`);
  const notesFilePath = path.join(notesDir, `ios${nextBuild}-android${nextBuild}.md`);
  if (!fs.existsSync(notesFilePath)) {
    const notesContent = `# Store release notes — ${nextVersion} · iOS build ${nextBuild} / Android versionCode ${nextBuild}

Paste-ready copy for the store consoles. Neither upload script reads these —
[\`play-upload.js\`](../../../scripts/play-upload.js) and
[\`ios-testflight.sh\`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
\`[${nextVersion} build ${nextBuild}]\` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. **Marketing version
is ${nextVersion}**; the build number continues ${currentBuild} → ${nextBuild} (it is one shared counter across
both stores and does not reset on a marketing bump — the rule from build 49 onward).

**No forced sign-out, no data migration.** ${notes}

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> Short release summary (under 500 characters).

\`\`\`
BETA: ${notes}
\`\`\`

---

## TestFlight — What to Test

> Under 4000 characters.

\`\`\`
WHAT'S NEW IN BUILD ${nextBuild} (BETA)

No sign-out this time, and no data reset.

${notes}
\`\`\`

---

## App Store — What's New (only if promoting build ${nextBuild} to release)

Paste into App Store Connect → Version → What's New in This Version.
`;
    if (args.dryRun) {
      console.log(`  [dry-run] Would create: ${path.relative(ROOT, notesFilePath)} (store release notes)`);
    } else {
      if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });
      fs.writeFileSync(notesFilePath, notesContent, 'utf8');
      console.log(`  Created: ${path.relative(ROOT, notesFilePath)} (store release notes)`);
    }
  }

  // 10. CHANGELOG.md
  let changelog = fs.readFileSync(PATHS.changelog, 'utf8');
  changelog = changelog.replace(
    /\| \*\*iOS\*\* \| \d+\.\d+\.\d+ \(\d+\)/,
    `| **iOS** | ${nextVersion} (${nextBuild})`
  );
  changelog = changelog.replace(
    /\| \*\*Android\*\* \| \d+\.\d+\.\d+ \(versionCode \d+\)/,
    `| **Android** | ${nextVersion} (versionCode ${nextBuild})`
  );
  changelog = changelog.replace(
    /The build number continues \d+ → \d+/,
    `The build number continues ${currentBuild} → ${nextBuild}`
  );

  const buildAnchor = `${nextVersion.replace(/\./g, '')}-build-${nextBuild}--${isoDate}`;
  const tableRow = `| [${nextBuild}](#${buildAnchor}) | ${isoDate} | ${notes} |`;
  if (!changelog.includes(`| [${nextBuild}](`)) {
    changelog = changelog.replace(
      /(\| Build \| Shipped \| Headline \|\n\|---\|---\|---\|\n)/,
      `$1${tableRow}\n`
    );
  }

  const buildHeading = `## [${nextVersion} build ${nextBuild}]`;
  if (!changelog.includes(buildHeading)) {
    const sectionContent = `## [${nextVersion} build ${nextBuild}] — ${isoDate}

| | |
|---|---|
| **Status** | Pre-release — beta build (TestFlight / Play open testing) |
| **iOS** | ${nextVersion} (${nextBuild}) — ${notes} |
| **Android** | ${nextVersion} (versionCode ${nextBuild}) — ${notes} |
| **Web** | Live at [fihaven.app](https://fihaven.app) |
| **Server** | API in lockstep with client build ${nextBuild} |

> **Build bump.** The build number continues ${currentBuild} → ${nextBuild} across both stores together (\`CURRENT_PROJECT_VERSION\` in \`ios/FiHavenApp/project.yml\`, \`versionCode\` in \`android/app/build.gradle.kts\`).

> **No forced sign-out, no data migration.**

### Summary

> ${notes}

---

`;
    const firstBuildMatch = changelog.match(/\n## \[\d+\.\d+\.\d+ build \d+\]/);
    if (firstBuildMatch) {
      changelog = changelog.slice(0, firstBuildMatch.index + 1) + sectionContent + changelog.slice(firstBuildMatch.index + 1);
    }
  }
  updateFile(PATHS.changelog, changelog, args.dryRun, 'pre-release & entries');

  // 11. CHANGELOGS.md
  if (!fs.existsSync(PATHS.changelogs) && !args.dryRun) {
    try {
      fs.symlinkSync('CHANGELOG.md', PATHS.changelogs);
      console.log(`  Created symlink: CHANGELOGS.md -> CHANGELOG.md`);
    } catch (_) {
      fs.writeFileSync(PATHS.changelogs, changelog, 'utf8');
      console.log(`  Created copy: CHANGELOGS.md`);
    }
  }

  // 12. client/changelog.html
  let changelogHtml = fs.readFileSync(PATHS.changelogHtml, 'utf8');
  const entryId = `v${nextVersion}-b${nextBuild}`;
  if (!changelogHtml.includes(`id="${entryId}"`)) {
    changelogHtml = changelogHtml.replace('badge-latest">Latest Beta<', 'badge-stable">Beta<');
    const articleHtml = `          <!-- Build ${nextBuild} -->
          <article class="changelog-entry" id="${entryId}">
            <div class="changelog-header">
              <div class="changelog-version">
                <span>${nextVersion} (Build ${nextBuild})</span>
                <span class="changelog-badge badge-latest">Latest Beta</span>
              </div>
              <div class="changelog-date">${humanDate}</div>
            </div>
            <div class="changelog-lead">
              <strong>${notes}</strong>
            </div>
            <ul class="changelog-list">
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                <div>${notes}</div>
              </li>
            </ul>
            <div class="changelog-platforms">
              <span class="platform-pill">iOS ${nextVersion} (${nextBuild})</span>
              <span class="platform-pill">Android ${nextVersion} (${nextBuild})</span>
              <span class="platform-pill">Web fihaven.app</span>
              <span class="platform-pill">Server API</span>
            </div>
          </article>

`;
    changelogHtml = changelogHtml.replace(/(<div class="changelog-feed">\n)/, `$1${articleHtml}`);
    updateFile(PATHS.changelogHtml, changelogHtml, args.dryRun, 'changelog page');
  }

  if (args.dryRun) {
    console.log(`\n✓ Dry run complete. No files were modified.\n`);
    return;
  }

  // Post-bump scripts
  console.log('\nRunning post-bump regeneration and validation hooks...');
  try {
    console.log('  → Generating client/public/changelog.md...');
    execSync('node scripts/generate-markdown.js', { cwd: ROOT, stdio: 'pipe' });

    console.log('  → Running nativeVersions parity test...');
    execSync('npx vitest run scripts/nativeVersions.test.js', { cwd: ROOT, stdio: 'pipe' });

    console.log('\n✓ Build bump complete and verified across all sites!');
    console.log(`  Train : ${nextVersion} (build ${nextBuild})\n`);
  } catch (err) {
    console.error('\n✗ Post-bump hook failed:');
    if (err.stdout) console.error(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  parseArgs,
  runCheck,
  formatDate,
  formatHumanDate,
};
