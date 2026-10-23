import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

/*
 * `run-macos.sh --sign` is the one flag that cannot be exercised for real in a
 * test — a real signature wants an Apple certificate in the login keychain and
 * a provisioning profile Xcode fetches. What a test CAN pin is everything up
 * to the signature: the settings the script passes xcodebuild, the derived-data
 * path a signed build lands in, and the --sign --sweep refusal.
 *
 * The method is stub binaries on PATH: `xcodebuild` records its arguments and
 * lays down a fake .app, `codesign`/`security`/`spctl`/`plutil` answer the
 * report's questions, and `defaults` is neutralised so the run cannot touch
 * this machine's real `app.fihaven` window-frame keys.
 */

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'run-macos.sh');
const PROJECT_YML = path.join(ROOT, 'ios', 'FiHavenApp', 'project.yml');

const run = (args, env = {}) =>
  spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, ...env },
  });

const darwin = process.platform === 'darwin';

describe('run-macos.sh --sign', () => {
  it('refuses --sign --sweep before touching anything', () => {
    const res = run(['--sign', '--sweep']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--sign and --sweep are different builds');
  });

  // Everything below stubs Apple tooling; only meaningful where it exists.
  const describeMac = darwin ? describe : describe.skip;

  describeMac('the signed build plumbing', () => {
    let stub, derived, capture;
    let createdDefaultDerived = false;

    const writeStub = (name, body) => {
      const p = path.join(stub, name);
      fs.writeFileSync(p, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    };

    beforeAll(() => {
      stub = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-sign-stub-'));
      derived = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-sign-derived-'));
      capture = path.join(stub, 'xcodebuild.args');

      // Records argv one-per-line, then produces the .app the script expects
      // from -derivedDataPath / -configuration.
      writeStub('xcodebuild', `
printf '%s\\n' "$@" > "${process.env.STUB_CAPTURE || capture}"
derived=""; config="Debug"
prev=""
for a in "$@"; do
  case "$prev" in
    -derivedDataPath) derived="$a" ;;
    -configuration) config="$a" ;;
  esac
  prev="$a"
done
app="$derived/Build/Products/$config/FiHaven.app"
mkdir -p "$app/Contents/MacOS"
printf '#!/bin/bash\\nexit 0\\n' > "$app/Contents/MacOS/FiHaven"
chmod +x "$app/Contents/MacOS/FiHaven"
: > "$app/Contents/embedded.provisionprofile"
echo "BUILD SUCCEEDED"
`);

      // The report asks four questions: who signed it (-dv), what the
      // entitlements are (-d --entitlements -), does it verify (--verify),
      // and -dv again on the install path (not exercised here).
      writeStub('codesign', `
case " $* " in
  *" --verify "*) exit 0 ;;
  *" --entitlements "*)
    printf '<plist><dict><key>[Key] com.apple.security.app-sandbox</key></dict></plist>\\n'
    ;;
  *" -dv "*|*" -d "*)
    printf 'Identifier=app.fihaven\\nAuthority=Apple Development: Test (XXYYZZ)\\nTeamIdentifier=%s\\n' "$FH_FAKE_TEAM" >&2
    ;;
esac
`);

      // `security cms -D -i profile` decodes the profile; hand it a plist the
      // real plutil can read back.
      writeStub('security', `
cat <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Name</key><string>Mac Team Provisioning Profile: app.fihaven</string>
<key>ExpirationDate</key><date>2030-01-01T00:00:00Z</date>
<key>Entitlements</key><dict><key>keychain-access-groups</key><array><string>365KR8NF53.*</string></array></dict>
</dict></plist>
EOF
`);

      writeStub('spctl', 'echo "rejected (Apple Development)"');
      writeStub('xcodegen', 'exit 0');
      // The launch path reads and restores the user's own NSWindow Frame keys
      // on domain app.fihaven — stubbed so the test leaves nothing behind.
      writeStub('defaults', 'exit 0');
    });

    afterAll(() => {
      fs.rmSync(stub, { recursive: true, force: true });
      fs.rmSync(derived, { recursive: true, force: true });
      if (createdDefaultDerived) fs.rmSync('/tmp/fh-mac-signed', { recursive: true, force: true });
    });

    const stubEnv = (extra = {}) => ({
      ...extra,
      PATH: `${stub}${path.delimiter}${process.env.PATH}`,
      FH_BASE: 'http://127.0.0.1:59999',
      FH_SKIP_STOREKIT: '1',
    });

    it('passes the signing settings xcodebuild expects', () => {
      const res = run(['--sign'], stubEnv({ FH_MAC_SIGNED_DERIVED_DATA: derived, FH_FAKE_TEAM: '365KR8NF53' }));
      expect(res.status).toBe(0);
      expect(res.stderr + res.stdout).not.toContain('build failed');

      const args = fs.readFileSync(capture, 'utf8');
      expect(args).toContain('-allowProvisioningUpdates');
      expect(args).toContain('CODE_SIGN_STYLE=Automatic');
      // The team comes from project.yml, not a constant — same source the
      // script reads.
      const team = /DEVELOPMENT_TEAM:\s*(\S+)/.exec(fs.readFileSync(PROJECT_YML, 'utf8'))[1];
      expect(args).toContain(`DEVELOPMENT_TEAM=${team}`);
      expect(args).toContain(`-derivedDataPath\n${derived}`);
      expect(res.stdout).toContain('TeamIdentifier 365KR8NF53');
      expect(res.stdout).toContain('codesign --verify --deep --strict: ok');
    });

    it('uses /tmp/fh-mac-signed as the default derived data', () => {
      // The default is asserted only when the path is not already a real
      // signed build — otherwise the stub would be writing over one.
      if (fs.existsSync('/tmp/fh-mac-signed')) return;
      createdDefaultDerived = true;
      const res = run(['--sign'], stubEnv({ FH_FAKE_TEAM: '365KR8NF53' }));
      expect(res.status).toBe(0);
      expect(fs.readFileSync(capture, 'utf8')).toContain('-derivedDataPath\n/tmp/fh-mac-signed');
    });
  });
});
