import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { parseArgs, formatDate, formatHumanDate } = require('./bump-build');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('scripts/bump-build.js', () => {
  it('parses arguments correctly', () => {
    const args1 = parseArgs(['+1']);
    expect(args1.build).toBe('+1');
    expect(args1.dryRun).toBe(false);

    const args2 = parseArgs(['--build', '56', '--version', '1.6.4', '--dry-run', '--notes', 'Test notes']);
    expect(args2.build).toBe('56');
    expect(args2.version).toBe('1.6.4');
    expect(args2.dryRun).toBe(true);
    expect(args2.notes).toBe('Test notes');

    const args3 = parseArgs(['--check']);
    expect(args3.checkOnly).toBe(true);
  });

  it('formats dates consistently', () => {
    const fixed = new Date(2026, 8, 15); // Sept 15, 2026
    expect(formatDate(fixed)).toBe('2026-09-15');
    expect(formatHumanDate(fixed)).toBe('September 15, 2026');
  });

  it('--check exits cleanly when all versions agree', () => {
    const out = execSync('node scripts/bump-build.js --check', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('All sites agree on version');
    expect(out).toContain('✓ package.json version matches iOS');
    expect(out).toContain('✓ iOS CURRENT_PROJECT_VERSION matches Android versionCode');
    expect(out).toContain('✓ Store release notes file');
  });

  it('--dry-run reports all planned file updates without writing', () => {
    const out = execSync('node scripts/bump-build.js --dry-run', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('[dry-run] Would update: package.json');
    expect(out).toContain('[dry-run] Would update: ios/FiHavenApp/project.yml');
    expect(out).toContain('[dry-run] Would update: android/app/build.gradle.kts');
    expect(out).toContain('[dry-run] Would update: README.md');
    expect(out).toContain('[dry-run] Would update: docs/maintainer/store-listing-copy.md');
    expect(out).toContain('[dry-run] Would update: docs/maintainer/store-launch-checklist.md');
    expect(out).toContain('[dry-run] Would update: docs/release-notes/README.md');
    expect(out).toContain('[dry-run] Would update: CHANGELOG.md');
    expect(out).toContain('[dry-run] Would update: client/changelog.html');
    expect(out).toContain('Dry run complete. No files were modified.');
  });
});
