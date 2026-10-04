#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   install-hooks.js — put the generated-artifact check in front
   of `git commit`.

     npm run hooks:install      # install
     npm run hooks:uninstall    # remove what this installed

   `.git/hooks` is not committed, so the hook is installed rather
   than versioned — the same reason a developer's own hooks are not
   in the repository. What *is* versioned is the script it calls, so
   a clone gets the current behaviour on the next install.

   Two things it refuses to do: overwrite a hook someone else
   installed, and install when `core.hooksPath` points somewhere
   else (writing to `.git/hooks` would then be a no-op that looks
   like it worked).
═════════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { ROOT } = require('./worktree');

const MARKER = '# fihaven:precommit-artifacts';
const HOOK = `#!/bin/sh
${MARKER}
# Installed by scripts/install-hooks.js (npm run hooks:install).
# Checks the generated artifacts against the *staged* state, where
# the "still being edited" exemption cannot apply. Remove with:
#   npm run hooks:uninstall
exec node "$(git rev-parse --show-toplevel)/scripts/precommit-artifacts.js"
`;

function hookPath({ root = ROOT } = {}) {
  return path.join(root, '.git', 'hooks', 'pre-commit');
}

function hooksPathSetting({ root = ROOT } = {}) {
  try {
    return execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function install({ root = ROOT, log = console.log, error = console.error } = {}) {
  const configured = hooksPathSetting({ root });
  if (configured) {
    error(`core.hooksPath is "${configured}", so .git/hooks is not used.`);
    error(`Add this to ${configured}/pre-commit instead:`);
    error(HOOK.trimEnd());
    return 1;
  }

  const target = hookPath({ root });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, 'utf8');
    if (current.includes(MARKER)) {
      // Already ours, and the script it calls is the repository's, so
      // there is nothing to refresh.
      log(`pre-commit hook already installed (${path.relative(root, target)}).`);
      return 0;
    }
    const backup = `${target}.local`;
    if (fs.existsSync(backup)) {
      error(`A pre-commit hook is already installed at ${path.relative(root, target)},`);
      error(`and a copy of it is at ${path.relative(root, backup)}. Not touching either:`);
      error('merge what you want into the hook by hand.');
      return 1;
    }
    fs.copyFileSync(target, backup);
    log(`Kept your existing hook as ${path.relative(root, backup)}.`);
  }

  fs.writeFileSync(target, HOOK, { mode: 0o755 });
  fs.chmodSync(target, 0o755);
  log(`Installed ${path.relative(root, target)}.`);
  log('It runs the CSP, sitemap and Markdown checks against the staged state');
  log('and refuses the commit if the artifacts do not match it.');
  return 0;
}

function uninstall({ root = ROOT, log = console.log, error = console.error } = {}) {
  const target = hookPath({ root });
  if (!fs.existsSync(target)) {
    log('No pre-commit hook installed.');
    return 0;
  }
  if (!fs.readFileSync(target, 'utf8').includes(MARKER)) {
    error(`${path.relative(root, target)} is not ours — leaving it alone.`);
    return 1;
  }
  fs.rmSync(target);
  log(`Removed ${path.relative(root, target)}.`);
  return 0;
}

function main() {
  const action = process.argv[2];
  if (action === '--uninstall') return uninstall();
  if (action) {
    console.error(`Unknown option "${action}". Use --uninstall, or nothing to install.`);
    return 2;
  }
  return install();
}

if (require.main === module) process.exit(main());

module.exports = { install, uninstall, hookPath, HOOK, MARKER };
