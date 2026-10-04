import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPTS = path.resolve(__dirname);
const ROOT = path.resolve(SCRIPTS, '..');

const matrixSource = fs.readFileSync(path.join(SCRIPTS, 'sweep-matrix.sh'), 'utf8');
const macosSource = fs.readFileSync(path.join(SCRIPTS, 'run-macos.sh'), 'utf8');
const iosSource = fs.readFileSync(path.join(SCRIPTS, 'run-ios.sh'), 'utf8');

/** Run a snippet of bash with the shared matrix sourced, and hand back its output. */
const inBash = (snippet, env = {}) => {
  const r = spawnSync('bash', ['-c', `. "${path.join(SCRIPTS, 'sweep-matrix.sh')}"\n${snippet}`], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { out: r.stdout, err: r.stderr, status: r.status };
};

/** The screen list, as `raw|Title` rows. */
const screens = () => {
  const block = matrixSource.match(/SWEEP_SCREENS=\(([\s\S]*?)\n\)/);
  expect(block, 'SWEEP_SCREENS should still be a literal array').toBeTruthy();
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].split('|'));
};

/** The state table, as five-field rows. */
const states = () => {
  const block = matrixSource.match(/SWEEP_STATES=\(([\s\S]*?)\n\)/);
  expect(block, 'SWEEP_STATES should still be a literal array').toBeTruthy();
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].split('|'));
};

/*
 * The matrix moved out of `run-macos.sh` and into `sweep-matrix.sh` when the
 * iPhone and iPad sweeps started photographing the same seventeen screens in
 * the same five states. The reason to extract it was not tidiness: two lists of
 * screens are two reviews, and the one that drifts is the one nobody notices
 * has stopped covering something. That is a claim about the future, so these
 * tests are the part that holds it — a list that grows in one place has to grow
 * in the other, or the matrix says seventeen and photographs sixteen.
 */

describe('the screen list', () => {
  it('is the same list the Mac sweep used to keep', () => {
    // Seventeen, in TabCatalog's order, plus the three destinations the shells
    // add. The count is the claim a reader checks against the table.
    expect(screens().map(([raw]) => raw)).toEqual([
      'dashboard', 'bills', 'cards', 'loans', 'payoff', 'rewards', 'income',
      'budget', 'spending', 'subscriptions', 'calendar', 'history', 'networth',
      'balances', 'pro', 'settings', 'about',
    ]);
  });

  it('names a screen the app actually has', () => {
    // The list cannot be derived from a Swift enum by a shell, so it is a
    // mirror — and a mirror is only worth reading if something checks it. The
    // fourteen catalog tabs come from `TabItem`; the other three from the
    // Mac's `MacScreen` and the phone's `MoreDest`, which is why the Pro screen
    // is called `pro` here and not `getpro` (the phone's Free-only tab tag).
    const tabCatalog = fs.readFileSync(
      path.join(ROOT, 'ios/FiHavenApp/Sources/Main/TabCatalog.swift'), 'utf8');
    // The enum declares all fourteen on one line, so this reads the declaration
    // rather than the `case` labels of the switches below it.
    const declared = tabCatalog.match(/enum TabItem[\s\S]*?case ([\w, ]+)/);
    expect(declared, 'TabItem should still declare its cases on one line').toBeTruthy();
    const tabs = declared[1].split(',').map((t) => t.trim()).filter(Boolean);
    expect(tabs.length).toBe(14);

    for (const [raw] of screens()) {
      const isTab = tabs.includes(raw);
      const isMoreDest = ['pro', 'settings', 'about'].includes(raw);
      expect(isTab || isMoreDest, `${raw} is neither a TabItem nor a More destination`).toBe(true);
    }
  });

  it('gives every screen a title, and no two screens the same name', () => {
    const titles = screens().map(([, title]) => title);
    for (const t of titles) expect(t.trim()).toBeTruthy();
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('is the Free-only tab tag nowhere, since that tab does not always exist', () => {
    // `getpro` is a bottom tab for a Free account and nothing at all for a Pro
    // one, so a matrix that asked for it photographed a tab bar with a blank
    // screen behind it in the Pro state — and a blank screen is not byte-equal
    // to any other, so nothing flagged it.
    expect(screens().map(([raw]) => raw)).not.toContain('getpro');
  });
});

describe('the state table', () => {
  it('names the five states the sweeps promise', () => {
    expect(states().map(([raw]) => raw)).toEqual(['happy', 'empty', 'free', 'offline', 'error']);
  });

  it('says what each state must prove, and whether it has to look different', () => {
    // The two checks are not the same question and neither answers the other.
    // `happy` and `free` are checked by the log because their pictures are
    // legitimately identical on the screens the paywall does not cover;
    // `empty`, `offline` and `error` have to differ from the same screen's
    // `happy` capture, because an account with no rows and a dead server are
    // different screens whatever the entitlement said.
    const byName = Object.fromEntries(states().map((s) => [s[0], s]));
    expect(byName.happy[3]).toBe('session=signedIn,pro=true');
    expect(byName.free[3]).toBe('session=signedIn,pro=false');
    expect(byName.empty[3]).toBe('session=signedIn');
    for (const name of ['empty', 'offline', 'error']) expect(byName[name][4]).toBe('yes');
    expect(byName.free[4]).toBe('no');
    expect(byName.happy[4]).toBe('baseline');
  });

  it('asks every state for the same first thing: that it signed in', () => {
    // `session=signedIn` was the check that stayed missing longest, and the
    // absence of it is invisible everywhere else: a capture of the sign-in
    // screen is the requested size, carries the right screen name in its log,
    // and every row of the table says `ok`. A whole state of the matrix was
    // photographed that way. An evidence field that only says what a state sets
    // up would let the states with nothing to set up skip the question, which is
    // exactly where it went unanswered.
    for (const row of states()) {
      expect(row[3].split(',')[0], `${row[0]} must require session=signedIn`).toBe('session=signedIn');
    }
  });

  it('signs the empty state in as an account that can be created here', () => {
    // Signup verifies a Turnstile token over the network, so a local run cannot
    // make one; the placeholders are substituted at read time and the defaults
    // are the ones the seeding script creates.
    const row = states().find((s) => s[0] === 'empty')[2];
    expect(row).toContain('FH_DEV_EMAIL=@EMAIL@');
    expect(row).toContain('FH_DEV_PASSWORD=@PASSWORD@');
    const { out } = inBash('sweep_states');
    expect(out).toContain('FH_DEV_EMAIL=fhsweep-empty@fihaven.app');
    expect(out).toContain('FH_DEV_PASSWORD=demopassword11');
  });

  it('substitutes an override verbatim, punctuation and all', () => {
    // `sed` would have treated these as replacement syntax; the parameters are
    // in the row already, which is why they are `@EMAIL@` and not `EMAIL`.
    const { out } = inBash('sweep_states', {
      FH_SWEEP_EMPTY_EMAIL: 'a&b@fihaven.app',
      FH_SWEEP_EMPTY_PASSWORD: 'p|ass&word',
    });
    expect(out).toContain('FH_DEV_EMAIL=a&b@fihaven.app FH_DEV_PASSWORD=p|ass&word');
    expect(out).not.toContain('@EMAIL@');
  });

  it('keeps the fault out of the handshake, so offline is not the auth screen', () => {
    const byName = Object.fromEntries(states().map((s) => [s[0], s]));
    expect(byName.offline[2]).toBe('FH_FAULT=transport');
    expect(byName.error[2]).toBe('FH_FAULT=api');
  });
});

describe('narrowing the matrix', () => {
  it('keeps the screens that were asked for, in list order', () => {
    // Through the environment rather than a quoted string: bash leaves `\n` as
    // two characters inside double quotes, so an interpolated newline arrives
    // as part of one long row instead of a row separator.
    const list = screens().map((s) => s.join('|')).join('\n');
    const { out } = inBash('sweep_choose t --only cards,bills "$LIST"', { LIST: list });
    expect(out.trim().split('\n')).toEqual(['bills|Bills', 'cards|Cards']);
  });

  it('says so when a name is not in the matrix, rather than sweeping the rest', () => {
    // The quiet version of this failure is a sweep that covers less than it
    // says, which is the one failure the table cannot show.
    const { status, err } = inBash('sweep_choose t --states bogus "$(sweep_states)"');
    expect(status).toBe(2);
    expect(err).toContain("--states does not know 'bogus'");
    expect(err).toContain('happy');
  });

  it('counts rows by line, so a title with spaces is one row', () => {
    // Word-splitting this table counted 3 screens as 4 and 3 states as 16, and
    // the progress counter read "[9/64]" for a nine-capture run.
    const { out } = inBash('chosen=$(sweep_choose t --states "" "$(sweep_states)"); grep -c . <<< "$chosen"');
    expect(out.trim()).toBe('5');
  });
});

describe('the two sweeps', () => {
  it('both read this list rather than keeping their own', () => {
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} should source sweep-matrix.sh`).toMatch(/sweep-matrix\.sh/);
      // A local `SWEEP_SCREENS=(` is the drift this file exists to prevent.
      expect(source, `${name} must not define its own screen list`).not.toMatch(/SWEEP_SCREENS=\(/);
      expect(source, `${name} must not define its own state table`).not.toMatch(/SWEEP_STATES=\(/);
    }
  });

  it('both reach the same screens by the same name', () => {
    // `FH_SCREEN` is the one hook the phone and the Mac agree on. The Mac used
    // to take `FH_ROUTE`, which the phone's shell cannot answer for a screen
    // that is a bottom tab rather than a More row — and which of those a screen
    // is depends on the account, so one of the two was always wrong.
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} should aim the sweep with FH_SCREEN`).toMatch(/FH_SCREEN=\$raw/);
    }
  });

  it('both check that a state proved itself, and that it differed where it must', () => {
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} should read the state's evidence out of the log`).toMatch(/state_evidence/);
      expect(source, `${name} should compare against the same screen's happy capture`).toMatch(/same as happy/);
    }
  });

  it('both put the evidence through the multi-part check, not a single grep', () => {
    // The evidence field is a comma-separated list and all of it is required.
    // One `grep -qF "session=signedIn,pro=true"` looks right and can never
    // match, so the check passes for a state that proved nothing at all —
    // failing open on the assertion that exists to catch a wrong capture.
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} should use sweep_evidence_missing`).toMatch(/sweep_evidence_missing/);
      expect(source, `${name} must not grep the whole list as one string`)
        .not.toMatch(/grep -qF "\$state_evidence"/);
    }
  });

  it('both seed into the database the server is actually using', () => {
    // `seed-user-data.js` resolves the path from its own environment while the
    // app signs in against whatever is listening, and when the two disagree
    // every `empty` capture is the sign-in screen. Both sweeps ask the server
    // first and hand that path to the seeder.
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} should ask the server which database it has`).toMatch(/sweep_server_db/);
      expect(source, `${name} should pass that path to the seeder`).toMatch(/FIHAVEN_TEST_DB_PATH="\$server_db"/);
      expect(source, `${name} should leave an explicit FIHAVEN_DB_PATH alone`)
        .toMatch(/\[ -z "\$\{FIHAVEN_DB_PATH:-\}" \]/);
      expect(source, `${name} should prove the account can sign in before capturing`).toMatch(/sweep_can_sign_in/);
    }
  });
});

describe('the two tiers are one review', () => {
  const complete = (want) => inBash(`sweep_tiers_complete ${JSON.stringify(want)}`).out.trim();

  it('adds the missing tier rather than sweeping half the pair', () => {
    // The accident this exists to stop: a `happy` sweep that photographs five
    // paywalls and calls them screens, or a `free` sweep that never says which
    // screens are supposed to be paywalls at all. Either is a complete-looking
    // table with the wrong answer in it.
    expect(complete('free')).toBe('happy');
    expect(complete('happy')).toBe('free');
    expect(complete('empty')).toBe('happy free');
    expect(complete('happy,free')).toBe('');
    expect(complete('free,empty')).toBe('happy');
  });

  it('leaves the default alone, which is already both', () => {
    // No `--states` at all is every state, so adding anything would print a
    // complaint about a run that asked for nothing in particular.
    expect(complete('')).toBe('');
  });

  it('does not mistake a prefix for a tier', () => {
    // `,happy,` with the separators is the whole point of the match: a
    // substring test reads `freely` as `free` and adds a tier that is there.
    expect(complete('happily')).toBe('happy free');
    expect(complete('freebies')).toBe('happy free');
  });

  it('both sweeps refuse to run one tier on its own', () => {
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} should call sweep_tiers_complete`).toMatch(/sweep_tiers_complete/);
    }
  });
});

describe('the Pro gate column', () => {
  const word = (v) => inBash(`sweep_gate_word ${JSON.stringify(v)}`).out;

  it('spells out the three answers a reader has to tell apart', () => {
    // A dash is not `open`. Twelve of the seventeen screens are ungated, and
    // collapsing that into `open` would say the product is reachable when the
    // truth is that there was never a gate to open.
    expect(word('true')).toBe('paywall');
    expect(word('false')).toBe('open');
    expect(word('')).toBe('—');
    expect(word('maybe')).toBe('—');
  });

  it('reads the app\'s own answer rather than a list of gated screens', () => {
    // A hard-coded list would be a fourth copy of `ProGate`'s cases, and the
    // copy that is wrong is the one in the tool.
    const log = ['[ProGate] feature=payoff locked=true', '[ProGate] feature=payoff locked=false'];
    const { out } = inBash(`f=$(mktemp); printf '%s\\n' ${JSON.stringify(log.join('\n'))} > "$f"; sweep_gate "$f"`);
    expect(out.trim()).toBe('false');
  });

  it('takes the last gate line, because the dev override lands after the first render', () => {
    // The app's first pass is locked and its second is not; a `head -1` would
    // report every Pro screen as a paywall and flag seventeen rows.
    const { out } = inBash(`f=$(mktemp); printf 'locked=true\\nlocked=false\\n' > "$f"; sweep_gate "$f"`);
    expect(out.trim()).toBe('false');
  });

  it('flags a paywall on the Pro state, and only there', () => {
    const finding = (state, locked) => inBash(`sweep_gate_finding ${state} ${JSON.stringify(locked)}`).out.trim();
    expect(finding('happy', 'true')).toBe('gated while Pro');
    // The free tier's paywalls are the point of the column, not a finding.
    expect(finding('free', 'true')).toBe('');
    expect(finding('happy', 'false')).toBe('');
    expect(finding('happy', '')).toBe('');
  });

  it('notices the gate that did not close on the free tier', () => {
    // The other half of the accident: `happy` was gated and `free` was not, so
    // the free account got the product. That means the entitlement never landed
    // and the `free` row is a `happy` row wearing a different label.
    const note = (proLocked, state, locked) =>
      inBash(`sweep_gate_missing_note ${JSON.stringify(proLocked)} ${state} ${JSON.stringify(locked)}`).out.trim();
    expect(note('true', 'free', 'false')).toBe('gate did not close');
    expect(note('true', 'free', 'true')).toBe('');
    expect(note('false', 'free', 'false')).toBe('');
    expect(note('', 'free', 'false')).toBe('');
  });
});

describe('what a state has to prove', () => {
  it('names the first part that is missing, rather than only that one was', () => {
    // `happy` needs both `session=signedIn` and `pro=true`. A run that reached
    // the screen signed in but never got the entitlement is the exact case
    // that must not be reported as the product.
    const { out } = inBash(`f=$(mktemp); printf 'session=signedOut\\n' > "$f"; sweep_evidence_missing "$f" 'session=signedIn,pro=true'`);
    expect(out).toBe('session=signedIn');
  });

  it('says nothing when the log proves all of it', () => {
    const { out } = inBash(`f=$(mktemp); printf 'session=signedIn pro=true\\n' > "$f"; sweep_evidence_missing "$f" 'session=signedIn,pro=true'`);
    expect(out).toBe('');
  });

  it('tolerates an empty evidence field rather than grepping for nothing', () => {
    // A state with no evidence is not a failure, and `grep -qF ""` matches
    // everything — which would make the check a no-op that reads as a pass.
    const { out } = inBash(`f=$(mktemp); : > "$f"; sweep_evidence_missing "$f" ''`);
    expect(out).toBe('');
  });

  it('keeps a needle with spaces whole, rather than checking each word', () => {
    // The stalled check's evidence is a phrase. Word-splitting asks the log
    // for `security`, `check`, `hidden`, `->` and `shown` separately, and the
    // arrow — a needle starting with a dash — is read by grep as an option,
    // so it reported missing from a log that had just written
    // `hidden -> shownFresh`.
    const line = '[AuthView] security check hidden -> shownFresh height=0';
    const { out } = inBash(
      `f=$(mktemp); printf '%s\\n' ${JSON.stringify(line)} > "$f"; ` +
      `sweep_evidence_missing "$f" 'security check hidden -> shown'`);
    expect(out).toBe('');
  });

  it('names the whole comma-separated part when it is missing', () => {
    // The unit of failure is the part, not the word: a note that says
    // `->` sends the reader to look for an arrow that is there.
    const { out } = inBash(`f=$(mktemp); : > "$f"; sweep_evidence_missing "$f" 'security check hidden -> shown'`);
    expect(out).toBe('security check hidden -> shown');
  });
});

describe('the local-server check', () => {
  const local = (host) => inBash(`sweep_is_local_host ${JSON.stringify(host)}`).status;

  it('knows every spelling of this machine', () => {
    // `127.0.0.1` is what a bound address prints; `localhost` is what a person
    // types. A check that knows only one of them is a check half the runs walk
    // past.
    for (const host of ['localhost', '127.0.0.1', '[::1]', '::1']) {
      expect(local(host), `${host} is this machine`).toBe(0);
    }
  });

  it('does not call a remote host local, where an empty port proves nothing', () => {
    for (const host of ['fihaven.example.com', '10.0.0.5', '']) {
      expect(local(host), `${host} is not this machine`).not.toBe(0);
    }
  });

  it('is what both sweeps ask before they call the server down', () => {
    // The bug this replaces: the check knew only the word `localhost`, and a
    // run against `http://127.0.0.1:5297` with no server photographed all
    // three signed-out screens and reported them captured. The phone sweep
    // gets the same guard: a remote FH_BASE is not probed, because an empty
    // port there says nothing about the server a sweep needs.
    for (const source of [macosSource, iosSource]) {
      expect(source).toMatch(/sweep_is_local_host "\$BASE_HOST"/);
    }
  });
});

/*
 * Two defects found by running the sweep against a database that had never
 * held a dev account, on 30 September 2026. Neither was visible in a table:
 * one crashed the run's own arithmetic, and the other skipped preparing an
 * account for four of five states while looking entirely correct.
 */
describe('the dev account is prepared when any state needs it', () => {
  it('is needed for the shape that caused the bug: empty among the others', () => {
    // `--states happy,free,empty` is the ordinary two-tier review. A guard
    // written as `! grep -q '^empty|'` reads this as "no, empty is there" and
    // prepares nothing, so the app cannot sign in and every happy/free capture
    // is the sign-in screen with the right size and `ok` beside it.
    const { status } = inBash(`sweep_needs_dev_account "$(printf 'happy\\nfree\\nempty\\n')"`);
    expect(status).toBe(0);
  });

  it('is needed for every single non-empty state', () => {
    for (const state of ['happy', 'free', 'offline', 'error']) {
      const { status } = inBash(`sweep_needs_dev_account "${state}"`);
      expect(status, `${state} signs in as the dev account`).toBe(0);
    }
  });

  it('is not needed for empty alone, which seeds its own account', () => {
    const { status } = inBash(`sweep_needs_dev_account "empty"`);
    expect(status).not.toBe(0);
  });

  it('answers false rather than dying on nothing', () => {
    // `set -u` and an empty argument both turn a `[ ]` test into an error, and
    // an error here reads as "needs it" — which would seed on every no-op run.
    const { status } = inBash(`sweep_needs_dev_account ""`);
    expect(status).toBe(1);
  });

  it('is what both sweeps call, not a grep at either call site', () => {
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} should ask the shared predicate`).toMatch(/sweep_needs_dev_account "\$chosen_states"/);
    }
  });
});

describe('the sweep counters are declared exactly once', () => {
  // `local missing` inside the capture loop shadows the count of captures that
  // never landed, for the rest of the scope. The value it holds is a *string*
  // like `session=signedIn`, so every later `$((missing - before_missing))`
  // reads it as arithmetic, parses `session=signedIn` as an assignment, and
  // dies under `set -u` naming `signedIn`. It failed on exactly the runs that
  // had something to report — the ones worth reading — and the `run-ios.sh`
  // half of the same feature was spelled `missing_evidence` from the start.
  //
  // The rule is counted rather than banned, because `local started=$SECONDS
  // idx=0 missing=0 flagged=0` is the correct declaration of these four and
  // must keep passing. What must not exist is a *second* one.
  const COUNTERS = ['missing', 'flagged', 'total', 'idx'];

  /** How many times a counter is declared, ignoring comments that mention one. */
  const declarations = (source, counter) => {
    const decl = new RegExp(`\\blocal\\s+(?:\\w+=\\S*\\s+)*${counter}\\b`, 'm');
    return source
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .filter((line) => decl.test(line)).length;
  };

  for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
    for (const counter of COUNTERS) {
      it(`${name} declares ${counter} once, in one place`, () => {
        expect(declarations(source, counter),
          `${name}: a second local declaration of ${counter} shadows the counter`).toBe(1);
      });
    }
  }

  it('the fix is in place: the needle has its own name', () => {
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} should name the evidence needle separately`)
        .toMatch(/missing_evidence="\$\(sweep_evidence_missing/);
    }
  });
});

/*
 * The three screens that exist only before there is a session. They are not a
 * sixth state — every state of the matrix signs in, and none of these can —
 * which is why they have their own list, their own tally line, and their own
 * blank threshold. Before 30 September 2026 a sweep could not photograph them
 * at all, and no table said so.
 */
describe('the signed-out samples', () => {
  /** The signed-out list, as `raw|Title|env|evidence|delay` rows. */
  const signedOut = () => {
    const block = matrixSource.match(/SWEEP_SIGNED_OUT=\(([\s\S]*?)\n\)/);
    expect(block, 'SWEEP_SIGNED_OUT should still be a literal array').toBeTruthy();
    return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].split('|'));
  };

  it('is the three screens a signed-out launch can be showing', () => {
    // The tour, the sign-in screen, and that screen with its security check
    // stalled on it — the state the reveal was built for, and the one a
    // reviewer can never reach by hand at will.
    expect(signedOut().map(([raw]) => raw)).toEqual(['intro', 'auth', 'auth-stalled']);
  });

  it('gives each one a title and the log line that proves it happened', () => {
    for (const [raw, title, , evidence] of signedOut()) {
      expect(title.trim(), `${raw} needs a title`).toBeTruthy();
      expect(evidence.trim(), `${raw} needs evidence the capture happened`).toBeTruthy();
    }
  });

  it('collides with no screen name in the other matrix', () => {
    const screenNames = new Set(screens().map(([raw]) => raw));
    for (const [raw] of signedOut()) {
      expect(screenNames.has(raw), `${raw} is both a screen and a signed-out sample`).toBe(false);
    }
  });

  it('stays signed out and picks the right side of the intro flag', () => {
    // `FH_SIGNED_OUT=1` is what makes the launch ignore a token a previous
    // cell left in the keychain — without it the second of the three
    // photographs the shell, because the first signed in. `FH_INTRO_SEEN` is
    // the other half: the intro is a local flag with no in-app reset, so
    // `auth` has to ask for the opposite of what `intro` sets.
    for (const [raw, , env] of signedOut()) {
      expect(env, `${raw} must launch signed out`).toContain('FH_SIGNED_OUT=1');
      expect(env, `${raw} must not aim a signed-in screen`).not.toContain('FH_SCREEN=');
      expect(env, `${raw} must not sign itself in`).not.toContain('FH_AUTOLOGIN=1');
    }
    const byRaw = Object.fromEntries(signedOut().map((r) => [r[0], r]));
    expect(byRaw.intro[2]).toContain('FH_INTRO_SEEN=0');
    expect(byRaw.auth[2]).toContain('FH_INTRO_SEEN=1');
    expect(byRaw['auth-stalled'][2]).toContain('FH_INTRO_SEEN=1');
  });

  it('forces the stalled check on screen instead of waiting for it to stall', () => {
    // A stall is a race against the network, and a scripted capture cannot ask
    // for one to happen. Cloudflare's force-interactive test key never solves
    // without a person, so the widget has to draw itself; if the network keeps
    // it away, the app's 12-second deadline reveals it instead. The sample's
    // own delay is longer than both paths.
    const byRaw = Object.fromEntries(signedOut().map((r) => [r[0], r]));
    expect(byRaw['auth-stalled'][2])
      .toContain('FH_TURNSTILE_SITEKEY=3x00000000000000000000AC');
    expect(byRaw['auth-stalled'][4]).toBe('14');
    // The two plain screens ride the run's `--delay`: nothing to wait for.
    expect(byRaw.intro[4]).toBe('');
    expect(byRaw.auth[4]).toBe('');
  });

  it('reads the evidence out of the app, not out of its own hopes', () => {
    // The evidence strings are a contract with the app: a renamed log line
    // would otherwise turn every capture of that screen into `no '…' in log`,
    // which is the right failure but a bad way to find out.
    const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const introView = read('ios/FiHavenApp/Sources/Auth/IntroView.swift');
    const authView = read('ios/FiHavenApp/Sources/Auth/AuthView.swift');
    expect(introView).toContain('[IntroView] showing step');
    expect(authView).toContain('[AuthView] sign-in screen shown');
    // The stalled sample asks for the reveal transition. This tree's app
    // hides the widget behind `turnstileHidden` and reveals it on the first
    // height report or the 12 s deadline — both funnel through
    // revealSecurityCheck(), which logs the line the sample greps for.
    expect(authView).toContain('turnstileHidden = true');
    expect(authView).toContain('revealSecurityCheck()');
    expect(authView).toContain('security check hidden -> shown');
    // And the flags the env asks for are real hooks.
    expect(read('ios/FiHavenApp/Sources/App/AppEnvironment.swift')).toContain('FH_SIGNED_OUT');
    expect(read('ios/FiHavenApp/Sources/RootView.swift')).toContain('FH_INTRO_SEEN');
    expect(read('ios/FiHavenApp/Sources/App/AppConfig.swift')).toContain('FH_TURNSTILE_SITEKEY');

    const byRaw = Object.fromEntries(signedOut().map((r) => [r[0], r[3]]));
    expect(byRaw.intro).toBe('[IntroView] showing step');
    expect(byRaw.auth).toBe('[AuthView] sign-in screen shown');
    // `hidden -> shownFresh` also contains this, and both mean the widget is
    // finally on screen — which is what the sample is for.
    expect(byRaw['auth-stalled']).toBe('security check hidden -> shown');
  });

  it('is one list --only validates for both halves at once', () => {
    // `--only intro,bills` names one signed-out sample and one screen. The Mac
    // harness builds the union and splits it on `sweep_is_signed_out`; this is
    // that contract, so `--only intro` can never be "an unknown name".
    const snippet = [
      'list="$(printf \'%s\\n\' "${SWEEP_SCREENS[@]}" "${SWEEP_SIGNED_OUT[@]}")"',
      'sweep_choose t --only intro,bills "$list" | while IFS= read -r e; do',
      '  [ -n "$e" ] || continue',
      '  if sweep_is_signed_out "$(sweep_field "$e" 1)"; then echo "sample|$(sweep_field "$e" 1)|$(sweep_field "$e" 2)"; else echo "cell|$e"; fi',
      'done',
    ].join('\n');
    const { out } = inBash(snippet);
    expect(out.trim().split('\n')).toEqual(['cell|bills|Bills', 'sample|intro|Intro — first run']);
  });

  it('is a list the Mac harness uses, and one neither script re-declares', () => {
    expect(macosSource, 'the Mac should split the chosen list on the shared predicate')
      .toMatch(/sweep_is_signed_out/);
    expect(macosSource, 'the Mac should read the signed-out threshold, not the screen one')
      .toMatch(/SWEEP_SIGNED_OUT_BLANK_BYTES/);
    expect(macosSource, 'the Mac should add its tally through the shared helper')
      .toMatch(/sweep_tally_add/);
    for (const [name, source] of [['run-macos.sh', macosSource], ['run-ios.sh', iosSource]]) {
      expect(source, `${name} must not define its own signed-out list`)
        .not.toMatch(/SWEEP_SIGNED_OUT=\(/);
    }
  });

  it('skips the nav-screen check for a launch that has no shell', () => {
    // The signed-out capture has no shell, so the snapshot's `screen=` carries
    // whatever nav value the last session left in UserDefaults — `about` on
    // this machine. The expected screen is empty and the checker skips, rather
    // than inventing `none` and flagging a correct capture.
    const line = macosSource.split('\n')
      .find((l) => l.includes('sweep_record_cell') && l.includes('"signedout"'));
    expect(line, 'the signed-out record call should still exist')
      .toContain('"$out_evidence" "" "" "$SWEEP_SIGNED_OUT_BLANK_BYTES"');
    expect(macosSource).toMatch(/if \[ -n "\$expected_screen" \]; then/);
  });

  it('does not make a signed-out-only run prepare accounts it will never use', () => {
    // `--only intro` has no screen x state cells at all. Requiring the dev
    // account would demand a login the run never performs, and could refuse to
    // start against a database that is perfectly fine for the tour and the
    // sign-in screen.
    expect(macosSource).toMatch(/\[ "\$screens" -gt 0 \] && sweep_needs_dev_account/);
    expect(macosSource).toMatch(/\[ "\$screens" -gt 0 \] && grep -q '\^empty\|'/);
  });
});

describe('the per-state tally', () => {
  /** Run `sweep_tally_add` as the sweeps do, and hand back the raw line(s). */
  const add = (line, key, missing, flagged) => inBash(
    `sweep_tally_add "${line}" ${JSON.stringify(key)} ${missing} ${flagged}`).out;

  it('adds to the counts and carries the fields after them', () => {
    // The five-field line is the signed-out samples'. The update used to
    // assign to `$2`/`$3` and print, and AWK rebuilds `$0` with spaces the
    // moment a field is assigned: the line became `signedout 3 0 signed out —
    // no session 3`, which `read -r a b c d e` sees as one field holding all
    // of it. Three samples then printed as `3/17` — the screen count — under a
    // heading with the counters inside it.
    expect(add('signedout|0|0|signed out — no session|3', 'signedout', 0, 0))
      .toBe('signedout|0|0|signed out — no session|3\n');
    expect(add('signedout|0|0|signed out — no session|3', 'signedout', 1, 2))
      .toBe('signedout|1|2|signed out — no session|3\n');
  });

  it('leaves the other lines alone', () => {
    expect(add('happy|17|0\nsignedout|0|0|signed out — no session|3', 'signedout', 3, 0))
      .toBe('happy|17|0\nsignedout|3|0|signed out — no session|3\n');
  });

  it('keeps a three-field state line three fields', () => {
    // The fallback description and denominator come from the state table and
    // the screen count; adding empty ones to every line would hide a bad row.
    expect(add('happy|0|0', 'happy', 3, 1)).toBe('happy|3|1\n');
  });
});

describe('the per-state line the table prints', () => {
  it('uses the denominator the signed-out line carries', () => {
    const { out } = inBash(`sweep_table t "" "" 'signedout|0|0|signed out — no session|3' 0`);
    expect(out).toMatch(/signedout\s+3\/3\s+captured, 0 flagged\s+signed out — no session/);
  });

  it('falls back to the screen count and the state table for everything else', () => {
    // Seventeen screens and a state description that is a sentence, so the
    // line has to be read line by line — a word-split says "a".
    const { out } = inBash(`sweep_table t "" "" 'happy|1|2' 17`);
    expect(out).toMatch(/happy\s+16\/17 captured, 2 flagged\s+a Pro subscriber with data/);
  });
});
