#!/usr/bin/env bash
#
# The visual review matrix: which screens, in which states, and the table both
# sweeps print at the end. Sourced, never run.
#
#   run-macos.sh   the Mac window, 17 screens x 5 states plus the three
#                  signed-out samples below, one launch each
#   run-ios.sh     the same seventeen screens x 5 states on an iPhone and an
#                  iPad, one launch each — no signed-out samples yet
#
# One list, because the two sweeps answer the same question and a list that
# drifts is a review that quietly covers less than it says. The screen list is
# the Mac's (its shell has all seventeen as first-class routes) and the iPhone
# sweep reaches the same seventeen through `FH_SCREEN`, which lands on a
# destination by name whether it is a bottom tab or a More row — the difference
# being the account's own tab layout and its entitlement, so a sweep that picked
# one route for every state photographed a real screen in the wrong one.
#
# Nothing here launches anything: each sweep owns its own per-cell run, because
# the two differ in every particular that matters (a window the app photographs
# itself, a simulator `simctl` photographs for it).

# The screen list: `raw|Title`, in `TabCatalog.swift`'s order plus the three
# destinations the shells add (FiHaven Pro, Settings, About & licenses).
# A new screen belongs here; nothing derives it, because the two sources of it
# are a Swift enum and a SwiftUI view and neither is readable from a shell.
SWEEP_SCREENS=(
  "dashboard|Home"
  "bills|Bills"
  "cards|Cards"
  "loans|Loans"
  "payoff|Payoff"
  "rewards|Rewards"
  "income|Income"
  "budget|Budget"
  "spending|Spending"
  "subscriptions|Subscriptions"
  "calendar|Calendar"
  "history|History"
  "networth|Net Worth"
  "balances|Account Balances"
  "pro|FiHaven Pro"
  "settings|Settings"
  "about|About & licenses"
)

# The other half of the matrix: what each screen is showing, rather than which
# screen it is. A sweep of populated screens photographs the state the fixtures
# were built to produce and nothing else — and the states a screen has to
# survive are the ones with the least data in them. An empty list, a paywall, a
# dead server and a broken one each lay a screen out differently, and each of
# them is the state most likely to be shipped without anyone looking at it,
# because it is not the state anyone develops in.
#
# The happy path is one of the states rather than the implicit default, so a
# sweep that photographs only `empty` is as cheap as one that photographs only
# `happy`, and the table says which is which.
#
# Five fields, and the last two are the ones that catch a state that did not
# happen:
#
#   raw|what it shows|env|evidence|differs
#
# `evidence` is a comma-separated list of substrings the capture's own log must
# *all* contain — a state that sets itself up has to say so, because the
# alternative is a sweep that photographed the happy path and labelled it
# `error`. That is not hypothetical: `FH_FAULT` was compiled out of the app it
# existed for (see CHANGELOG.md) and the only reason it was caught was that two
# states came out byte-identical.
#
# `session=signedIn` is in all five, and it is the one that was missing longest.
# A state that fails to sign in photographs the **sign-in screen** — once per
# screen, at the right size, with the right screen name in the log, and every
# other check passing. It happened here: the seeder wrote an account into
# `data/cleartab.db` while the dev server on :5222 was running against
# `/tmp/fh-ipad/fh.db`, so all seventeen `empty` captures were the auth screen
# and the table said `ok` seventeen times. Two modules resolving "the database"
# is the actual defect; this line is what stops it being invisible while it
# happens.
#
# `differs` says whether this state must *look* different from the same screen's
# `happy` capture. It is not the same question as `evidence` and neither answers
# the other: an account with no rows and one with eleven bills are different
# screens, and a dead server is a different screen, whatever the entitlement
# said. `free` is the one state that does not differ everywhere — the paywall
# only replaces the five Pro-gated screens, and on the rest the two tiers are
# the same picture — so it is checked by its log line instead.
#
# `offline` and `error` are both `FH_FAULT`, deliberately. Pointing `FH_BASE` at
# a dead port would be the obvious way to be offline, and it is useless here:
# that breaks sign-in too, so every photograph would be the same auth screen.
# The fault hook fails the data calls and leaves the handshake alone, so the run
# gets *in* and then cannot load anything — which is the state a user is in when
# the network is gone, not the state a user is in before they have signed in.
SWEEP_STATES=(
  "happy|a Pro subscriber with data|FH_DEV_ENTITLEMENT=active|session=signedIn,pro=true|baseline"
  "empty|a verified account with no rows|FH_DEV_EMAIL=@EMAIL@ FH_DEV_PASSWORD=@PASSWORD@|session=signedIn|yes"
  "free|the same account on the free tier|FH_DEV_ENTITLEMENT=free|session=signedIn,pro=false|no"
  "offline|the server is unreachable|FH_FAULT=transport|session=signedIn|yes"
  "error|the server answers 503|FH_FAULT=api|session=signedIn|yes"
)

# ── the signed-out screens ───────────────────────────────────────────────
#
# Three screens exist only before there is a session: the first-run tour, the
# sign-in screen, and that screen with its security check stalled on the page.
# They are not a cell of the matrix above — every state there signs in, and
# none of these three can — so they are their own list, one launch each, with
# the setup each one needs instead of a shared state.
#
# Rows are `raw|Title|env|evidence|delay`:
#
#   raw       the screen half of the filename; the state half is `signedout`
#   env       KEY=VALUE pairs for that launch. `FH_SIGNED_OUT=1` is what makes
#             the launch ignore a session a previous cell left in the
#             keychain; see `AppEnvironment.bootstrap()`
#   evidence  substrings the capture log must carry, the same all-of-them rule
#             as a state's evidence
#   delay     seconds before the capture when the screen needs longer than the
#             run's `--delay`. The stalled check needs 14: Cloudflare draws the
#             widget (the height signal) when it can be reached, and at 12
#             seconds the deadline reveals it when it cannot — so 14 covers
#             both ways the reveal happens.
#
# `FH_TURNSTILE_SITEKEY=3x00000000000000000000AC` is Cloudflare's
# force-an-interactive-challenge test key: it never solves without a person,
# which is the point — a check that quietly passes is not the screen a reviewer
# needs to see when the thing being checked is the stalled state.
SWEEP_SIGNED_OUT=(
  "intro|Intro — first run|FH_SIGNED_OUT=1 FH_INTRO_SEEN=0|[IntroView] showing step|"
  "auth|Sign in|FH_SIGNED_OUT=1 FH_INTRO_SEEN=1|[AuthView] sign-in screen shown|"
  "auth-stalled|Sign in — stalled security check|FH_SIGNED_OUT=1 FH_INTRO_SEEN=1 FH_TURNSTILE_SITEKEY=3x00000000000000000000AC|security check hidden -> shown|14"
)

# Below this, a 2x window capture is a flat colour rather than a screen. A real
# one is hundreds of KB. No dependency needed to notice: a blank image is the
# one thing PNG compression is good at.
SWEEP_BLANK_BYTES=40000

# The same check for the signed-out samples, which are a card on a mostly flat
# background rather than a table of rows and so compress far below a signed-in
# screen's hundreds of KB. This threshold still tells a rendered one from a
# blank capture: a genuinely empty 1440x900 PNG is single-digit KB.
SWEEP_SIGNED_OUT_BLANK_BYTES=8000

# Field n (1-based) of a `|`-separated row, tolerating a short row — so a state
# that has no `evidence` can leave it empty and the reader does not have to
# count the separators.
sweep_field() {
  printf '%s' "$1" | cut -d'|' -f"$2"
}

# The first thing a capture's log does not say that it had to say, or nothing.
# Prints the substring so the note can name what was missing rather than only
# that something was.
sweep_evidence_missing() {
  local log="$1" list="$2" want
  # `IFS=,` and not an unquoted `${list//,/ }`: a needle is a substring, and
  # spaces are part of it. Word-splitting it checked each word separately, so
  # the stalled check's `security check hidden -> shown` asked the log for
  # `security`, `check`, `hidden`, `->`, `shown` — and `grep -qF '->'` read a
  # leading dash as an option, failed, and reported the arrow missing from a
  # log that had just written `hidden -> shownFresh`. `--` makes a needle that
  # starts with a dash a pattern rather than a flag.
  local IFS=','
  for want in $list; do
    [ -n "$want" ] || continue
    grep -qF -- "$want" "$log" 2>/dev/null || { printf '%s' "$want"; return 0; }
  done
  return 0
}

# Is this host the machine the sweep runs on? Only a local server can be
# probed for liveness, and only a local server is the one whose absence turns
# a sweep into a table of `offline` screens that all say `ok`.
#
# Both spellings of loopback count. The Mac's check knew the word `localhost`,
# and a run against `http://127.0.0.1:5297` — the same machine, spelled the way
# a bound address prints — walked straight past it with no server running and
# photographed every screen anyway.
sweep_is_local_host() {
  case "${1:-}" in
    localhost|127.0.0.1|::1|'[::1]') return 0 ;;
    *) return 1 ;;
  esac
}

# The list of states, with the two account-dependent values filled in. Kept as a
# function because the values are the caller's to override and the table is not.
sweep_states() {
  local email="${FH_SWEEP_EMPTY_EMAIL:-fhsweep-empty@fihaven.app}"
  local password="${FH_SWEEP_EMPTY_PASSWORD:-demopassword11}"
  local entry row
  for entry in "${SWEEP_STATES[@]}"; do
    # Parameter expansion rather than `sed`, so a password with a `&` or a `|`
    # in it is substituted literally instead of meaning something to the
    # pattern that replaces it. The placeholders are `@EMAIL@` / `@PASSWORD@`
    # rather than bare words because the words themselves are in the row
    # already — `FH_DEV_EMAIL=EMAIL` replaced the key along with the value.
    row="${entry//@EMAIL@/$email}"
    printf '%s\n' "${row//@PASSWORD@/$password}"
  done
}

# The signed-out samples, one row per line — the same shape `sweep_states`
# prints, so a reader that walks either list walks them the same way.
sweep_signed_out() {
  local entry
  for entry in "${SWEEP_SIGNED_OUT[@]}"; do
    printf '%s\n' "$entry"
  done
}

# Is this raw name one of the signed-out samples rather than a screen?
# `--only` names both kinds, and the Mac sweep splits the chosen list on this.
sweep_is_signed_out() {
  local want="$1" entry
  for entry in "${SWEEP_SIGNED_OUT[@]}"; do
    [ "$(sweep_field "$entry" 1)" = "$want" ] && return 0
  done
  return 1
}

# The two tiers are one review, so they cannot be half-swept.
#
# `happy` is a Pro subscriber and `free` is the same account one tier down, and
# the pair is the only way to see both halves of a gated screen: the product, and
# the gate that keeps a free account out of it. Sweep one without the other and
# a paywall is either the whole answer — seventeen captures, all of them `ok`,
# five of them upsells nobody was looking for — or not in it at all.
#
# So asking for either one asks for both. `sweep_choose` emits the state table in
# its own order whatever order `--states` lists, so `happy` is always captured
# first and the baseline a `free` row is checked against is always there.
# True when the chosen states include anything other than `empty` — that is,
# when the run signs in as the dev account and so needs it to exist.
#
# This is a function and not a `! grep -q '^empty|'` at the call site because
# the two are not the same test. `! grep -q` asks "is `empty` absent?", which is
# false for the ordinary case `--states happy,free,empty`, so the dev account
# went unprepared for four of five states in exactly the sweep shape this
# function exists to serve. The question is "is any state *not* empty".
sweep_needs_dev_account() {
  local states="${1:-}" line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      empty) continue ;;
      *) return 0 ;;
    esac
  done <<< "$states"
  return 1
}

sweep_tiers_complete() {
  local want="${1:-}" needs=""
  # No `--states` at all is the default, which is every state already.
  if [ -z "$want" ]; then return 0; fi
  case ",$want," in
    *,happy,*) ;;
    *) needs="happy" ;;
  esac
  case ",$want," in
    *,free,*) ;;
    *) needs="${needs:+$needs }free" ;;
  esac
  printf '%s' "$needs"
}

# Validate a `--only`/`--states` choice and print the entries that survive, one
# per line. An unknown name is a typo and says so rather than quietly sweeping
# the rest of the list — the failure this guards is a sweep that quietly covers
# less than it says it does.
#
#   sweep_choose <label> <flag> <want> <newline-joined entries>
#
# The list is one string rather than `"$@"` because half of it is titles with
# spaces in them ("Account Balances", "a Pro subscriber with data"), and an
# unquoted `$(sweep_states)` would hand every word of those to the function as a
# separate row.
sweep_choose() {
  local label="$1" flag="$2" want="$3" list="$4"
  local entry name known names=""
  if [ -n "$want" ]; then
    for name in $(printf '%s' "$want" | tr ',' ' '); do
      known=0
      while IFS= read -r entry; do
        [ -n "$entry" ] || continue
        names="$names $(sweep_field "$entry" 1)"
        [ "$(sweep_field "$entry" 1)" = "$name" ] && known=1
      done <<< "$list"
      if [ "$known" = "0" ]; then
        echo "$label: $flag does not know '$name' — try:$names" >&2
        return 2
      fi
    done
  fi
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    if [ -n "$want" ]; then
      case ",$want," in *",$(sweep_field "$entry" 1),"*) ;; *) continue ;; esac
    fi
    printf '%s\n' "$entry"
  done <<< "$list"
}

# Which database is the server at <base url> actually using? Prints the path, or
# nothing when it will not say.
#
#   sweep_server_db <base url>
#
# `seed-user-data.js` resolves the database from its own environment and the app
# signs in against whatever server is listening, so the two can disagree — and
# the sweep is what needs them to agree. The failure they produce is the worst
# kind: the seeded account does not exist to the server, so every `empty`
# capture is the sign-in screen, at the requested size, with the right screen
# name in its log and `ok` in the table. Nothing in the sweep's own output looks
# wrong, which is why the sweep asks rather than assumes.
#
# The server names its database on `/health` when it is running on a test
# override (see `server/health.js`). Production never sets that variable, so a
# production server answers `{"ok":true}` and nothing is disclosed — and this
# returns empty rather than guessing, leaving the seeder on its own default.
sweep_server_db() {
  node -e '
    const base = process.argv[1].replace(/\/$/, "");
    fetch(`${base}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => process.stdout.write((b && typeof b.db === "string" ? b.db : "") + "\n"))
      .catch(() => process.stdout.write("\n"));
  ' "$1" 2>/dev/null
}

# Prove an account can sign in, before spending 17 launches finding out it
# cannot.
#
#   sweep_can_sign_in <base url> <email> <password>
#
# The sweep seeds its own accounts through `seed-user-data.js`, which resolves
# the database from its own environment — and the app signs in against whatever
# server is listening, which may be using a different one. When the two disagree
# the account does not exist as far as the app is concerned, every capture is the
# sign-in screen, and nothing in a table of capture sizes looks wrong. Asking the
# server the one question that settles it costs one request.
#
# `loginStartedAt` is not optional: the login route runs an anti-bot gate that
# refuses a request whose client-sent start time is too recent, so a preflight
# that left it out would report every account as unable to sign in. The app sends
# the same thing, three seconds ago, and the gate is what stops a script from
# being one.
sweep_can_sign_in() {
  local base="$1" email="$2" password="$3"
  node -e '
    const [base, email, password] = process.argv.slice(1);
    const startedAt = Date.now() - 3000; // the anti-bot gate wants a human pause
    fetch(`${base.replace(/\/$/, "")}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, captchaToken: "dev-bypass-token", loginStartedAt: startedAt }),
    }).then((r) => r.json().then((b) => ({ status: r.status, body: b })))
      .then(({ status, body }) => {
        if (status === 200 && body && body.user) process.exit(0);
        process.stderr.write(`${status} ${(body && body.error) || "no user"}\n`);
        process.exit(1);
      })
      .catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
  ' "$base" "$email" "$password"
}

# Compare what this sweep just captured against an earlier one, and say which
# screens moved. Both sweeps call this so the wording and the exit code are the
# same on either platform.
#
#   sweep_diff <label> <script dir> <old out dir> <new out dir>
#
# The diff's own exit code (0 nothing moved, 1 something did, 2 could not tell)
# is reported and then dropped: a sweep's exit status means "every capture
# landed", and a sweep that landed every capture is not a failed sweep because a
# screen looks different — that is the answer, not an error. Run
# `node scripts/sweep-diff.js` directly when you want the status for a loop.
sweep_diff() {
  local label="$1" script_dir="$2" old="$3" new="$4" status
  echo
  echo "$label: comparing this sweep against $old"
  node "$script_dir/sweep-diff.js" "$old" "$new" || status=$?
  case "${status:-0}" in
    0) echo "$label: diff — nothing above the threshold" ;;
    1) echo "$label: diff — something changed; the sheet says where" ;;
    *) echo "$label: diff could not run (exit $status)" ;;
  esac
  return 0
}

# ── the Pro gate ────────────────────────────────────────────────────────────
#
# Whether a capture shows the product or the upsell is a fact about the app, not
# about the pixels, and the app says it: `ProGate` logs
# `[ProGate] feature=payoff locked=true|false` under the screen's own name. So
# this file has no list of gated screens in it. That matters — a hard-coded list
# would be a fourth copy of `ProGate`'s cases (the web client has one too) and it
# would be the copy that is wrong.
#
# Three outcomes, and all three are in the table because a reader needs to tell
# them apart: a screen photographed as a paywall, a screen photographed as the
# product, and a screen that is not gated at all.
sweep_gate() {
  grep -o 'locked=[a-z]*' "$1" 2>/dev/null | tail -1 | cut -d= -f2
}

# The column's word. `—` means the screen has no gate, which is the honest answer
# for twelve of the seventeen and is not the same as "open".
sweep_gate_word() {
  case "${1:-}" in
    true) printf 'paywall' ;;
    false) printf 'open' ;;
    *) printf '—' ;;
  esac
}

# A paywall where the product should be. This is the accident the column and
# this check exist for, and it is invisible in every other number a sweep
# prints: the capture is the right size, the screen was confirmed, the state
# logged its evidence, and the row still says the product has a paywall on it.
#
# Takes the log's own value (`true`/`false`) rather than the column's word, so
# both gate checks are called with what `sweep_gate` returned.
sweep_gate_finding() {
  [ "${2:-}" = "true" ] || return 0
  case "${1:-}" in
    happy) printf 'gated while Pro' ;;
    *) return 0 ;;
  esac
}

# The other half: a screen the Pro run showed as a paywall and the free run
# showed open has no gate at all. Checked against the Pro run's own answer rather
# than against a list, so it cannot name the wrong five screens.
sweep_gate_missing_note() {
  [ "${1:-}" = "true" ] || return 0
  [ "${2:-}" = "free" ] || return 0
  [ "${3:-}" = "false" ] || return 0
  printf 'gate did not close'
}

# Pixels of a PNG, through `sips` — it ships with macOS, and the table is not
# worth a dependency on ImageMagick.
file_pixels() {
  sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null \
    | awk '/pixelWidth:/ {w=$2} /pixelHeight:/ {h=$2} END { if (w && h) print w"x"h; else print "?" }'
}

file_size() {
  awk -v b="${1:-0}" 'BEGIN { if (b >= 1048576) printf "%.1f MB", b/1048576; else printf "%.0f KB", b/1024 }'
}

# Append a flag to a row's note, or start one.
note_join() {
  if [ -n "$1" ]; then printf '%s; %s' "$1" "$2"; else printf '%s' "$2"; fi
}

# Add one capture's outcome to the line of the per-state tally for its key,
# keeping everything after the first three fields.
#
# The signed-out samples' line carries its own description and denominator in
# fields 4 and 5 (`signedout|0|0|signed out — no session|3`), because it is not
# a state of the matrix and there are three samples rather than seventeen
# screens. AWK rebuilds `$0` with spaces — not the input's `|` — the moment a
# field is assigned, so the obvious `$2 += m; $3 += f; print` wrote
# `signedout 3 0 signed out — no session 3`. The table then read that whole
# string as the state name and fell back to the screen count for a denominator:
# three signed-out samples reported as `3/17`, under a heading that was the
# description with the counters inside it.
sweep_tally_add() {
  local per_state="$1" key="$2" missing="$3" flagged="$4"
  printf '%s\n' "$per_state" | awk -F'|' -v k="$key" -v m="$missing" -v f="$flagged" '
    $1 == k {
      out = $1 "|" $2 + m "|" $3 + f
      for (i = 4; i <= NF; i++) out = out "|" $i
      print out; next
    }
    { print }'
}

# The end of a sweep: the table, then the per-state tally.
#
#   sweep_table <label> <context header or ""> <rows> <per_state> <screens>
#
# `rows` are `idx|state|screen|shot|context|pixels|size|gate|note`. The context
# column is the Mac's window — what the app says it made the window, which is
# the one number a PNG cannot report and the one a resize can get wrong. iOS has
# no equivalent (a simulator's screen is whatever the device is) and passes an
# empty header rather than a column of dashes.
#
# `gate` is `paywall`, `open` or `—`, and it is the column that makes a sweep of
# the free tier readable: without it, five upsells and twelve products are
# seventeen rows that all say `ok`.
#
# The tally is here and not in either script because it is the part that is
# easy to get wrong in a hurry: a run where every screen captured in `happy` and
# none captured in `error` has the same total as a run that worked.
sweep_table() {
  local label="$1" context_header="$2" rows="$3" per_state="$4" screens="$5"
  echo
  if [ -n "$context_header" ]; then
    printf '  %-3s %-8s %-19s %-30s %-10s %-15s %-8s %-7s %s\n' "#" "State" "Screen" "Shot" "$context_header" "Pixels" "Size" "Gate" "Result"
    printf '  %-3s %-8s %-19s %-30s %-10s %-15s %-8s %-7s %s\n' "---" "--------" "-------------------" "------------------------------" "----------" "---------------" "--------" "------" "------"
  else
    printf '  %-3s %-8s %-19s %-30s %-15s %-8s %-7s %s\n' "#" "State" "Screen" "Shot" "Pixels" "Size" "Gate" "Result"
    printf '  %-3s %-8s %-19s %-30s %-15s %-8s %-7s %s\n' "---" "--------" "-------------------" "------------------------------" "---------------" "--------" "------" "------"
  fi
  local row
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    if [ -n "$context_header" ]; then
      printf '  %-3s %-8s %-19s %-30s %-10s %-15s %-8s %-7s %s\n' \
        "$(sweep_field "$row" 1)" "$(sweep_field "$row" 2)" "$(sweep_field "$row" 3)" \
        "$(sweep_field "$row" 4)" "$(sweep_field "$row" 5)" "$(sweep_field "$row" 6)" \
        "$(sweep_field "$row" 7)" "$(sweep_field "$row" 8)" "$(sweep_field "$row" 9)"
    else
      printf '  %-3s %-8s %-19s %-30s %-15s %-8s %-7s %s\n' \
        "$(sweep_field "$row" 1)" "$(sweep_field "$row" 2)" "$(sweep_field "$row" 3)" \
        "$(sweep_field "$row" 4)" "$(sweep_field "$row" 6)" "$(sweep_field "$row" 7)" \
        "$(sweep_field "$row" 8)" "$(sweep_field "$row" 9)"
    fi
  done <<< "$rows"

  echo
  # Read line by line for the same reason `sweep_choose` takes a string: a
  # state's description is a sentence, and an unquoted expansion of the state
  # table printed the first word of it ("a Pro subscriber with data" as "a").
  # A per-state row may carry its own description and denominator — the Mac's
  # signed-out tally does, because `signedout` is not a state in the table
  # above and there are three samples rather than seventeen screens. Without
  # them the description comes from the state table and the denominator is the
  # screen count, which is what every other caller passes.
  local ps desc rest state_rows denom; state_rows="$(sweep_states)"
  while IFS='|' read -r ps ps_missing ps_flagged desc denom; do
    [ -n "$ps" ] || continue
    if [ -z "$desc" ]; then
      while IFS= read -r rest; do
        [ -n "$rest" ] || continue
        [ "$(sweep_field "$rest" 1)" = "$ps" ] || continue
        desc="$(sweep_field "$rest" 2)"
        break
      done <<< "$state_rows"
    fi
    [ -n "$denom" ] || denom="$screens"
    printf '  %-8s %2d/%-2d captured, %d flagged  %s\n' \
      "$ps" "$((denom - ps_missing))" "$denom" "$ps_flagged" "$desc"
  done <<< "$per_state"
  echo
}
