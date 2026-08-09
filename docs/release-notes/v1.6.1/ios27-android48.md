# Store release notes — 1.6.1 · iOS build 27 / Android versionCode 48

Paste-ready copy for the store consoles. Neither upload script reads these —
[`play-upload.js`](../../../scripts/play-upload.js) and
[`ios-testflight.sh`](../../../scripts/ios-testflight.sh) push the binary only,
so the text below goes in by hand.

This is **the copy actually being shipped**, not a reconstruction. Source: the
`[1.6.1]` section of [CHANGELOG.md](../../../CHANGELOG.md).

**This build has no app-facing changes.** The work this round was entirely on
the web: making fihaven.app discoverable by search engines and readable by AI
assistants. Builds 27 / 48 exist so the native version numbers stay in step with
the web deploy — there is nothing new to look at in the apps.

## This build is client-only

Nothing here is server-side beyond the ordinary web deploy, which has already
gone out.

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

> 395 / 500 characters (counted with newlines, as the console does).

```
No app-facing changes in this build — this round of work was on the web.

Ask ChatGPT, Claude or Perplexity about FiHaven and they can now reach the site and answer accurately. Cloudflare had been refusing every AI assistant, so those questions went unanswered. Training crawlers are still refused.

Links to fihaven.app also show a preview image again.

For support, contact daniel@fihaven.app.
```

---

## TestFlight — What to Test

> 2296 / 4000 characters.

```
WHAT'S NEW IN BUILD 27

Nothing in the app. This build exists to keep the iOS build number in step with a web release, and carries no app-facing changes.

WHAT ACTUALLY SHIPPED (ON THE WEB)

FiHaven was invisible to AI assistants, and it turned out to be a configuration problem rather than a content one.

Cloudflare was returning "blocked" to every AI crawler that asked for fihaven.app. That included the ones that fire when a real person asks a question — in a single day, 267 requests from ChatGPT on behalf of actual users were refused, along with Perplexity and Claude. Anyone who asked an assistant "what is FiHaven?" was told the site could not be reached. Google and Bing were never affected, so search looked fine the whole time.

WHAT CHANGED

- Assistants and AI search engines are allowed through: ChatGPT, Claude, Perplexity, DuckDuckGo and Mistral can read the site and answer questions about it.
- Crawlers that only exist to collect text for training AI models are still refused. That distinction is the whole point: being answerable is not the same as donating the content.
- fihaven.app/llms.txt is a plain-text summary of what FiHaven is, what the tiers cost, and what is in each — written for assistants to read directly.
- Sharing a FiHaven link shows a preview image again. The old one was an SVG, which every major platform refuses, so links had been posting as bare text for a while.
- Three new pages: a guide to picking a bill tracker, and honest comparisons for people arriving from Mint or Rocket Money. Each says plainly where FiHaven is the wrong tool.
- The site's own navigation is now readable without JavaScript. Most AI crawlers do not run it, and they had been seeing a site with almost no internal links.

WHAT TO TEST

Nothing in the app — please test as normal and report anything that looks off, but no behaviour has changed.

If you want to check the web work: ask ChatGPT or Claude what FiHaven is and see whether the answer matches reality. Or paste a fihaven.app link into Slack, Discord or iMessage and confirm the preview card appears.

NOTE

Build 27 needs no server deploy of its own, but it still carries build 25's (reminder wording, autopay) and build 24's (Apple purchases). If those deploys have not gone out, those fixes are still inactive.
```

---

## App Store — What's New (if promoting to release)

```
No app-facing changes in this build. The work this round was on the web.

Asking an AI assistant about FiHaven now gets a real answer. Cloudflare had been
refusing every AI assistant that tried to read fihaven.app, so questions about
the app went unanswered while ordinary search worked fine. Assistants and AI
search engines can now reach the site; crawlers that exist only to collect text
for model training are still refused.

Links to fihaven.app also show a preview image again, and the site has new
guides comparing FiHaven to the tools people arrive from.
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
