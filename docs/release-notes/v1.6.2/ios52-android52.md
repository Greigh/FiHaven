# Store release notes — 1.6.2 · iOS build 52 / Android versionCode 52

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.2 build 52]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This is a beta build** — TestFlight and Play open testing. Marketing version
is unchanged at **1.6.2**; only the build number moves, 51 → 52, on both stores
together. That is the rule from build 49 onward.

The tester-visible change is that **a credit-card payment stops being counted
as spending**, which moves real numbers on the Budget, Spending and Rewards
screens — that is the thing worth checking. Transaction names imported from a
bank are also readable now, and the issuer logos are finally uniform.

## ⚠️ Everyone is signed out once, and this migrates the database

Ship the server **before** promoting the builds.

Session ids used to sit in the database in plaintext. They are now stored as a
SHA-256 hash, so a copy of the database is no longer a set of working logins.
The existing rows cannot be converted — hashing needs the raw id, which is
exactly what we are refusing to keep — so the migration drops them. **Every
signed-in device is signed out once**, web and native alike. The apps handle it:
their next request gets a 401 and they route to the login screen. It happens
once per database, not on every restart.

Tell testers this is expected, or the first report will be "the app logged me
out". `upload.sh` backs up the remote deploy directory (including `data/`)
before rsyncing, so the rollback path is that backup.

The web release also carries a **stored XSS fix** that is reachable across a
Family plan — one household member could put script in a card name and have it
run in another member's browser. Deploy the web with the server.

**One more thing the server deploy repairs, and it is an iOS one.**
`https://fihaven.app/.well-known/apple-app-site-association` had been returning
**500 in production** — `res.sendFile` refuses any path containing a dot
segment unless told otherwise, and `.well-known` is one. That file is what
**Universal Links** and **passkey `webcredentials:`** resolve against, and
neither fails anywhere a person would look: a fihaven.app link just opens
Safari instead of the app, and the passkey prompt just never appears. If you
have been wondering why either of those was flaky on a build that should have
supported them, this is why. Fixed and verified live; no new binary needed,
only the deploy.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 453 / 500 characters (counted with newlines, as the console does).

```
BETA: Paying your credit card is no longer counted as spending.

That payment settles purchases already counted when they posted, so counting it again double-counted them. Budgets, rewards and the spending charts now skip transfers.

Transaction names imported from your bank arrive readable, and every issuer logo now sits on the same tile.

This build also carries security fixes. You will be signed out once.

For support, contact daniel@fihaven.app.
```

---

## TestFlight — What to Test

> 3569 / 4000 characters.

```
WHAT'S NEW IN BUILD 52 (BETA)

YOU WILL BE SIGNED OUT ONCE. THIS IS EXPECTED.

Session records are now stored hashed rather than in the clear, so a copy of our database is no longer a set of working logins. The existing sessions could not be converted, so they were dropped. Sign in again and it will not happen a second time.

PAYING YOUR CARD IS NOT SPENDING

This is the one to check. When you pay a credit card, the purchases that payment settles were already counted when they posted. FiHaven was counting the payment as well, so on a card you clear every month your spending totals held close to a second copy of everything you bought.

Transfers are now excluded from your budget, your per-category totals, the spending charts, the rewards estimate and the cashflow history. Expect your numbers to drop, and expect them to be right.

If your bank labels a payment too vaguely for us to tell, we read the descriptor instead. That check needs both a card word and a payment word, so a "PAYMENT" to a utility, or a purchase at a shop with "CARD" in its name, is not swept up by accident.

A card payment also no longer fires the "looks like you used this offer" prompt. "AMEX PAYMENT" was close enough to an Amex offer to trigger it.

BANK TRANSACTION NAMES ARE READABLE

"BILT CARD PMT~Future Amount: 4070.00~REF 90210" now arrives as "Bilt Card Payment". The bank's own bookkeeping is dropped, processor prefixes like "SQ *" and trailing reference numbers go, and an all-caps descriptor stops shouting — while genuine acronyms like ATM and CVS are left alone.

If you re-file a transaction into a different category, that now sticks. A later sync used to be able to put it back.

ISSUER LOGOS, PROPERLY THIS TIME

Build 51 put logos on a plate. That helped the square ones and did nothing for the wide ones, because the tile was still being sized to the logo — so a wordmark like US Bank's pushed its row's name further right than every other row.

Every logo now sits in the same tile at the same size, scaled to fit inside it and never stretched. Initials get the same tile, and they are no longer always white — an orange or yellow brand gets dark initials, because white ones were unreadable.

WHAT TO TEST

Sign in. You will have to; see above.

Log a transaction in the Transfer category, or let a card payment import from your bank. Confirm it does NOT appear in your budget's category totals, in the Spending charts, or in your rewards estimate. It should still be visible in the transaction list.

Compare your Budget screen against the previous build if you can. Spending should be lower on any account where you pay a credit card, and the difference should be roughly the size of those payments.

Check a normal purchase still counts. Groceries, dining, anything — those must be unaffected. A false transfer would silently hide real spending, which is the worst way this could go wrong.

If you have a bank connected, look at the transaction names. They should read like merchant names, not like bank descriptors. Report anything cleaned so aggressively that you cannot tell what it was.

Re-file an imported transaction into a different category, then sync. Your choice must survive.

Look at a list of cards with a mix of logo shapes — a wide one like US Bank or Bilt beside a square one. Every card name should start at the same horizontal position, and no logo should look stretched or squashed. Check both Light and Dark.

Find a card with no bundled logo (Mission Lane, Navy Federal, PNC). Its initials should be readable against the tile colour.
```

---

## App Store — What's New (if promoting to release)

```
Paying a credit card is no longer counted as spending. That payment settles
purchases FiHaven already counted when they posted, so counting it again
double-counted them — on a card you clear each month, that was close to a second
copy of everything you bought. Budgets, category totals, the spending charts and
your rewards estimate now all skip transfers.

Transaction names imported from your bank arrive readable. "BILT CARD
PMT~Future Amount: 4070.00~REF 90210" becomes "Bilt Card Payment", and if you
re-file a transaction into a different category, that choice now sticks.

Every issuer logo sits in the same tile, scaled to fit rather than stretched, so
a list of cards lines up whatever shape the logos are.

This release also carries security fixes, including one on the web dashboard.
You will be signed out once when it lands.
```

---

## Web / server (shipped with the same train)

The web build ships with this train and the server deploy is required — see the
warning above.

**Security**

- **Stored XSS on the dashboard** (`client/svelte/DashboardView.svelte`). The
  "Needs attention" alerts were built as HTML strings with card and bill names
  interpolated raw, then rendered with `{@html}`. Names are free text, and
  `householdMerge.js` folds another member's cards and bills into the same
  lists — so on a Family plan one member could run script in another member's
  browser, on the page holding that person's whole dataset and a live session.
  The attacker controlled the trigger too: their own balance and limit decide
  whether the utilization alert fires. Alerts now carry data, not markup, and
  `client/js/htmlSinks.test.js` bans `{@html}` across every component so it
  cannot return quietly.
- **Session ids are hashed at rest** (`server/db.js`, `server/session.js`).
  `sessions` is rekeyed from the raw id to `id_hash`, matching
  `email_tokens.token_hash` and `oauth_handoffs.code_hash`. **The release's only
  schema change**, and the one that signs everyone out.
  `tests/integration/sessionAtRest.server.integration.test.js` proves the claim
  against a real SQLite file — the raw id appears in no column and nowhere in
  the file bytes, and the stored hash is rejected as a credential.
- **Both bank-balance proposal queues are server-owned**
  (`server/routes/data.js`). `keepBalanceProposals` returned early on an empty
  server copy, which left whatever the client sent — so `plaidAccountProposals`
  was wiped by the next save, and a client could seed a queue the server never
  wrote.
- **`Object.assign` into a null-prototype target** (`server/routes/data.js`), so
  a `__proto__` key in a settings body cannot swap the merge target's prototype
  mid-request.
- **`cleanMerchant` cannot backtrack** (`server/plaidMerge.js`) — whitespace is
  collapsed before the anchored patterns run, and the reference-number pattern
  uses one character class instead of `\s*#?\s*`.

**Data**

- **Transfers excluded from every spend total** (`client/js/budgetRules.js` and
  its callers) via one `countsAsSpending(t)` gate, mirrored in both native
  cores. `Transfer` is deliberately absent from `SPENDING_BUCKET` — a budget
  line for it would be meaningless.
- **`autoCategory`** (`server/plaidMerge.js`, `Transaction.swift`, `Models.kt`)
  records what the importer chose, separately from the live category, so
  `retidyStored` can tell its own guess from the user's correction and leave the
  correction alone.
- **`spentByCategory` had two byte-identical copies** and now has one, in
  `budgetRules.js`, re-exported from `spendingInsights.js`.

**The machine-readable web** (shipped with this train, no app change)

- **`/.well-known/apple-app-site-association` returned 500 in production** and
  now returns 200 — see the iOS note above. A source guard in the test suite
  asserts every hand-written `sendFile` into `.well-known` carries
  `dotfiles: 'allow'`, which is the option whose absence caused it.
- **Every public page has a Markdown rendition** — append `.md`, or send
  `Accept: text/markdown` to the normal URL. Generated by
  `scripts/generate-markdown.js` off the same page list the sitemap uses;
  `npm run markdown:check` gates staleness in `npm run ci`. Negotiation is
  strict: a wildcard `Accept` keeps the HTML.
- **`/.well-known/api-catalog`** (RFC 9727) says which APIs exist and that all
  but two are authenticated; **`/.well-known/auth.md`** says there is no agent
  login, why, and that an assistant must never ask a customer for their
  password when Settings → Account → Export data exists.
- **`Link:` headers** on public pages point at `llms.txt`, the sitemap, the API
  catalog and the page's own Markdown alternate. None of this touches `/api/`
  or the signed-in app.
- The Cloudflare WAF path guard was widened to match, so a blocked training
  crawler still reaches the files that exist to describe FiHaven to it.

**Native**

- `IssuerTile` in `IssuerLogoView.swift` and `IconMark.kt` — one tile at 3:2
  with a fixed content box, the mark fitted by `ContentScale.Fit` / a hand-rolled
  uniform scale, and a two-ring edge (the brand's own colour over a neutral
  floor) so a pale brand still has an edge in Light and a near-black one still
  has an edge in Dark.
- `BrandColor.ink(on:)` picks the knockout colour by WCAG contrast rather than a
  hand-maintained list, and now colours monogram initials too.
- `CtCard`'s slot was a `Box` (`android/…/ui/theme/Theme.kt`), so a card with
  more than one child stacked them. It is a `ColumnScope` now.
