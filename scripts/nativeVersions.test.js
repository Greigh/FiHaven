import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { readVersions } = require('./native-versions');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * The store launch checklist carries this as a manual checkbox:
 *
 *   "Versions match across all four sites: package.json version, iOS
 *    MARKETING_VERSION and CURRENT_PROJECT_VERSION, Android versionName and
 *    versionCode. The two marketing versions must be equal, and since 1.6.2
 *    the two build numbers must be equal too."
 *
 * A checkbox is the wrong mechanism for it, because getting it wrong is
 * asymmetric and one half is unrecoverable. App Store Connect refuses a
 * CFBundleVersion at or below one already uploaded, so if iOS is ever bumped
 * past Android by accident, iOS can never be walked back down to meet it —
 * the alignment that started at build 49 is simply lost, permanently.
 *
 * Cheap to check, so check it.
 */
describe('release versions agree across all four sites', () => {
  const v = readVersions();

  it('reads a version from every site', () => {
    // A parse failure must fail loudly rather than comparing undefined to
    // undefined and passing.
    expect(v.package).toMatch(/^\d+\.\d+\.\d+/);
    expect(v.ios.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(v.android.versionName).toMatch(/^\d+\.\d+\.\d+/);
    expect(Number.isInteger(v.ios.build)).toBe(true);
    expect(Number.isInteger(v.android.versionCode)).toBe(true);
  });

  it('uses one marketing version everywhere', () => {
    expect(v.ios.version).toBe(v.package);
    expect(v.android.versionName).toBe(v.package);
  });

  it('uses one build number on both stores', () => {
    // Equal since 1.6.2 (iOS jumped 27 → 49 to meet Play's versionCode), so
    // one number identifies a release on both stores.
    expect(v.ios.build).toBe(v.android.versionCode);
  });

  it('has a CHANGELOG entry for the build being shipped', () => {
    // Uploading a build whose notes nobody wrote is how a release goes out
    // with last build's description attached to it.
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const heading = `## [${v.package} build ${v.ios.build}]`;
    expect(
      changelog.includes(heading),
      `CHANGELOG.md has no "${heading}" section`,
    ).toBe(true);
  });

  it('has store release notes for the build being shipped', () => {
    const notes = path.join(
      ROOT, 'docs', 'release-notes', `v${v.package}`,
      `ios${v.ios.build}-android${v.android.versionCode}.md`,
    );
    expect(fs.existsSync(notes), `missing ${path.relative(ROOT, notes)}`).toBe(true);
  });
});
