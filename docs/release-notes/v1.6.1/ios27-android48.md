# Store release notes — 1.6.1 · iOS build 27 / Android versionCode 48

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This build fixes one thing in the apps: loans were being counted as card
debt.** Alongside it ships a web release — making fihaven.app readable by AI
assistants, and reframing the web dashboard to match the rest of the app.

## ⚠️ This build needs a server deploy

The household **Loan debt** split is computed server-side
(`server/household.js`). Until the server is deployed, both apps keep showing a
household card-debt total that includes shared loans — the app-side change is
in place and simply has nothing to read yet. The dashboard and promo-alert
fixes are client-side and work immediately.

**The outstanding server requirements from earlier builds still stand.** Build
25's bill-reminder wording and autopay guard are server-side, and so is
`APPLE_VERIFY_ENABLED` from build 24, without which every Apple purchase is
refused. If either deploy has not gone out, see
[ios25-android46.md](ios25-android46.md) and
[ios24-android45.md](ios24-android45.md) — the requirements do not expire by
being skipped.

Limits: **Google Play "What's new" is 500 characters** per language (hard cap,
the console rejects longer). **TestFlight "What to Test" is 4000.**

---

## Google Play — What's new (en-US)

> 447 / 500 characters (counted with newlines, as the console does).

```
Loans are no longer counted as card debt.

If you track a mortgage or auto loan, it was being added to your card debt total — so "card debt" read far higher than what you actually owe on cards. Loans now stay out of that figure, and a shared household separates loan debt from card debt. Net worth and the payoff planner still include them, as they should.

Also: 0% promo alerts no longer fire for loans.

For support, contact daniel@fihaven.app.
```

---

## TestFlight — What to Test

> 3869 / 4000 characters.

```
WHAT'S NEW IN BUILD 27

Loans were being counted as card debt, and that is fixed everywhere it appeared.

Loans are stored alongside credit cards and told apart internally by type. Several totals forgot to make that distinction, so if you track a mortgage or an auto loan it was being added to "card debt" — a figure that is supposed to mean revolving credit. Anyone with a mortgage saw a card-debt number in the hundreds of thousands.

- Settings > Household now shows Loan debt as its own line, separated from card debt, for the household and for each member. A shared mortgage had been sitting in the household's card total. This part needs the server deploy to take effect.
- 0% promo alerts no longer fire for loans.
- Credit utilization now reads the live balance everywhere it appears. A card charged since its statement closed was warning you based on the older figure, so a card at 90% of its limit could stay silent. Net worth is unchanged and still counts every liability, loans included — that one is correct as it stands.

Net worth and the debt payoff planner deliberately still include loans. A loan is a real liability and the planner exists to plan it; only "card debt" was wrong.

WHAT TO TEST

If you track a loan or mortgage: check that its balance no longer appears in any card-debt figure, and that Net worth and the Payoff tab are unchanged. If you share a household, check Settings > Household for a separate Loan debt row.

If you have a 0% promo card, confirm its alerts still appear — only loans should have stopped alerting.

WHAT ALSO SHIPPED (ON THE WEB)

FiHaven was invisible to AI assistants, and it turned out to be a configuration problem rather than a content one.

Cloudflare was returning "blocked" to every AI crawler that asked for fihaven.app. That included the ones that fire when a real person asks a question — in a single day, 267 requests from ChatGPT on behalf of actual users were refused, along with Perplexity and Claude. Anyone who asked an assistant "what is FiHaven?" was told the site could not be reached. Google and Bing were never affected, so search looked fine the whole time.

WHAT CHANGED

- Assistants and AI search engines are allowed through: ChatGPT, Claude, Perplexity, DuckDuckGo and Mistral can read the site and answer questions about it.
- Crawlers that only exist to collect text for training AI models are still refused. That distinction is the whole point: being answerable is not the same as donating the content.
- fihaven.app/llms.txt is a plain-text summary of what FiHaven is, what the tiers cost, and what is in each — written for assistants to read directly.
- Sharing a FiHaven link shows a preview image again. The old one was an SVG, which every major platform refuses, so links had been posting as bare text for a while.
- Three new pages: a guide to picking a bill tracker, and honest comparisons for people arriving from Mint or Rocket Money. Each says plainly where FiHaven is the wrong tool.
- The site's own navigation is now readable without JavaScript. Most AI crawlers do not run it, and they had been seeing a site with almost no internal links.

ALSO ON THE WEB: THE DASHBOARD

The web dashboard has been reframed to match every other tab. Its sections — the header, the payments bar, alerts, and Upcoming Payments — now each sit in a bordered block with a heading, instead of Upcoming Payments floating loose on the background. This is where the loan bug above was first spotted; signed in on the web, the dashboard should now look like the Budget and Cards tabs.

CHECKING THE WEB WORK

Ask ChatGPT or Claude what FiHaven is and see whether the answer matches reality. Or paste a fihaven.app link into Slack, Discord or iMessage and confirm the preview card appears.

NOTE

Build 27 needs a server deploy for the household Loan debt split, and it still carries build 25's (reminder wording, autopay) and build 24's (Apple purchases). If those deploys have not gone out, those fixes are still inactive.
```

---

## App Store — What's New (if promoting to release)

```
Loans were being counted as card debt. If you track a mortgage or an auto loan,
its balance was added to a figure meant to describe revolving credit — so "card
debt" read far higher than what you owe on cards.

Loans now stay out of every card-debt total, and a shared household shows loan
debt as its own line rather than folding it into card debt. Net worth and the
debt payoff planner still include loans, which is correct — a loan is a real
liability, and the planner exists to plan it.

0% promo alerts no longer fire for loans.

On the web, asking an AI assistant about FiHaven now gets a real answer, links
show a preview image again, and the dashboard has been reframed to match the
rest of the app.
```

---

## Web / server (shipped with the same train)

**No server deploy is needed for this build** beyond the web deploy that has
already gone out. The outstanding deploys from builds 25 and 24 are unaffected
by it — see the note at the top.

The web is where all of this landed:

- **Cloudflare AI bot policy rewritten.** The zone was returning 403 to every AI
  crawler, including the user-triggered fetchers (`ChatGPT-User`, `Claude-User`,
  `Perplexity-User`) that fire when a person asks about FiHaven — 267 refused
  `ChatGPT-User` requests in 24 hours. Answer engines and assistants are now
  allowed; training crawlers (`GPTBot`, `ClaudeBot`, `CCBot`, `Amazonbot`,
  `meta-externalagent`, and friends) stay blocked.
- **Cloudflare's managed robots.txt turned off.** It was prepending a block that
  disallowed `Google-Extended`, which had quietly opted the site out of Gemini's
  answers, and it duplicated nine user-agent groups against the repo's own file.
  `client/public/robots.txt` is the single source of truth again, and carries a
  `Content-Signal: search=yes, ai-input=yes, ai-train=no` declaration.
- **`og:image` was an SVG** on every page — a format X, Facebook, LinkedIn,
  Slack, Discord and iMessage all refuse — so no shared link had rendered a
  preview card. Replaced with real 1200×630 JPEGs generated by
  `scripts/generate-og.js`, plus the `og:image:width` / `height` / `alt` tags
  that were missing.
- **`llms.txt` and `llms-full.txt`** published at the site root.
- **Crawlable internal links.** The nav and footer were injected by JavaScript,
  which most AI crawlers do not run, so the homepage's served HTML linked only to
  `/login` and `/pricing`. The footer is now real markup on every page (11–13
  internal links) and `public-footer.js` became progressive enhancement.
- **Three new public pages** — `/bill-tracker-app`, `/mint-alternative`,
  `/rocket-money-alternative` — each with `FAQPage` schema and a section stating
  where FiHaven is the wrong choice.
- **Structured data** deepened: `SoftwareApplication` with a real `featureList`
  and all four priced offers, `Product` + `AggregateOffer` on `/pricing`,
  breadcrumbs, and an `Organization` with store links and a security contact.
- **The sitemap generates itself** from `scripts/indexnow-urls.js` with `lastmod`
  read from git history, so it can no longer drift from the IndexNow list the way
  it had (it was missing `/refunds` and `/delete-account`).
- **The dashboard is framed like every other tab.** Header, cash-flow bar,
  alerts and Upcoming Payments are each a `.panel-block` now — Budget's
  `.budget-card` chrome promoted out of `budget.css` into `components.css`,
  with `.budget-card` listed alongside every rule so Budget's markup is
  untouched and the two can't drift.
- **Card debt stopped counting loans — everywhere.** `DashboardView.svelte`'s
  `activeCards` filtered on `archived` only, and loans share the `cards` list,
  so a tracked mortgage read as card debt. The same shape was in
  `MainScaffold.kt` (Android's Card debt widget, which also fed `netWorth` —
  now computed separately), in both clients' 0%-promo alerts, and in
  `server/household.js`, where every shared `card` entity's balance landed in
  `cardDebt`.
- **`loanDebt` added to the household rollup.** `GET /api/household/rollup`
  now returns `totals.loanDebt` and `byMember[].loanDebt`; loans are split out
  of `cardDebt` rather than dropped, and both apps render a **Loan debt** row
  when it's non-zero. Optional on iOS (`Double?`) and defaulted on Android so a
  client that reaches an older server still decodes. Covered by
  `tests/integration/householdEntities.server.integration.test.js`.
- **`activeCreditCards`** added beside `activeCards` in `AppStore.swift` and
  `Models.kt` (mirroring the web filter), so "revolving credit only" is stated
  once per codebase. Android Cards/Rewards and iOS Rewards, which had each
  hand-rolled the filter, now read it.
- **Utilization moved behind one helper** — `Schedule.utilization` (iOS,
  Android) and `utilizationOf` (web), returning nil/null for a loan or a card
  with no limit. The row, the dashboard alert and the "highest utilization"
  sort each derived it separately and had drifted onto the statement balance
  on both native platforms.
- **Test suites added.** `swift test` now runs an XCTest target in
  `ios/FiHavenCore` (previously only the custom `FiHavenCoreChecks`
  executable), and Android's `:app` module gained a JVM unit-test source set
  (`:app:testDebugUnitTest`) where it had none. Both, plus `:core:test` and
  `client/js/utils.test.js`, assert the same card-debt and utilization cases.
- **Known, not fixed:** Android's `"debt"` dashboard widget is unreachable —
  the branch exists in `MainScaffold.kt` but the id is missing from
  `DashboardWidgets.catalog`, so `enabled()` filters it out. Web and iOS have
  no such widget. Adding the id to Android alone would be dropped by web's
  settings editor on the next save.
