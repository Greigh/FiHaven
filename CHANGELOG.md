# Changelog

All notable changes to FiHaven are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each release below uses two layers:

| Section | Audience |
|---------|----------|
| **Summary** | Testers, app users, release notes — no jargon |
| **Technical changelog** | Developers — APIs, files, flags, build detail |

---

## [1.6.1] Current Pre-Release — 2026-07-21

| | |
|---|---|
| **Status** | Pre-release — testing build (TestFlight / Play) |
| **iOS** | 1.6.1 (27) - no app-facing changes; a web release that made fihaven.app answerable by AI assistants (Cloudflare had been refusing every one of them, including the 267 daily requests ChatGPT made on behalf of real people asking about FiHaven), restored link previews, and added three comparison pages — the build number moves only to stay in step with the web deploy; 26 was a card leads with what to pay this period instead of its statement balance: a 0% promo card that had cleared its statement showed "$0.00" in the settled green while the same row asked for the monthly amount that clears the balance before the promo ends, so the corner figure now follows the payment goal in Settings (with a card's own Recommended payment still overriding it), the statement balance rides along whenever it differs, and wide issuer logos are no longer letterboxed on their white plate; 25 was the ✕ that deleted a purchase in one tap is gone from the Spending list: it sat right beside the edit pencil and was far too easy to hit by accident, so deleting now happens inside the transaction editor where it takes a deliberate second tap; 24 was in-app purchases can be redeemed again: the server was never switched on to accept Apple receipts, so every purchase attempt on builds up to 22 was refused after Apple had already taken it — the fix is a server setting, so this build does nothing until the server is deployed (build 23 was skipped; nothing shipped under it); 22 was a security pass closing 14 findings (sign-in, two-factor, purchases — and Apple/Google accounts can manage their own security at last), plus FiHaven works offline: your data is kept on the device, so it opens and works without a connection, and a change made offline is saved on the phone and synced when you're back — even if the app is force-quit in between; 21 was sign-out ending the session for real (reminders stop, a pending save can't overwrite the next account), archived items no longer driving reminders and totals, and a subscription bought on the web being manageable again; 20 was a reusable paywall body behind both Pro screens, full-color issuer logos, and a Family plan that goes read-only instead of doing nothing when it lapses; 19 was multi-day reminders, branded emails, skips listed in History, the new-month review on iPhone; 18 was the App Review fixes (App Store code redemption, account deletion for Apple/Google sign-ins), 17 the push permission fix, card issuer logos, pay-what's-left; 16 was income vs. spending history, 14 the card↔bank matching pass, 13 the first build with working push, 12 the push-handling pass, 11 added card↔bank linking |
| **Android** | 1.6.1 (versionCode 48) - no app-facing changes; a web release that made fihaven.app answerable by AI assistants (Cloudflare had been refusing every one of them, including the 267 daily requests ChatGPT made on behalf of real people asking about FiHaven), restored link previews, and added three comparison pages — the versionCode moves only to stay in step with the web deploy; 47 was a card leads with what to pay this period instead of its statement balance: a 0% promo card that had cleared its statement showed "$0.00" in the settled green while the same row asked for the monthly amount that clears the balance before the promo ends, so the corner figure now follows the payment goal in Settings (with a card's own Recommended payment still overriding it), the statement balance rides along whenever it differs, and wide issuer logos are no longer letterboxed on their white plate; 46 was the ✕ that deleted a purchase in one tap is gone from the Spending list: it sat right beside the edit pencil and was far too easy to hit by accident, so deleting now happens inside the transaction editor where it takes a deliberate second tap; 45 was a maintenance build: updated libraries and a fix so a Play test purchase can't be recorded as a real subscription; nothing visible changes; 44 was a security pass closing 14 findings (sign-in, two-factor, purchases — and Google/Apple accounts can manage their own security at last), plus FiHaven works offline: your data is kept on the device, so it opens and works without a connection, and a change made offline is saved on the phone and synced when you're back — even if the app is swiped away in between; 43 was sign-out ending the session for real (reminders stop, a pending save can't overwrite the next account), archived items no longer driving reminders and totals, a subscription bought on the web being manageable again, and Export data no longer crashing on a large account; 42 was a reusable paywall body behind both Pro screens, full-color issuer logos, and a Family plan that goes read-only instead of doing nothing when it lapses; 41 was multi-day reminders, branded emails, skips listed in History, the new-month review on Android; 40 was account deletion for Google/Apple sign-ins and Delete account under Settings → Account, 39 the push channel fix, card issuer logos, pay-what's-left; 38 was a resubmission of 37 (identical code; 37 sat in Play review), 37 was income vs. spending history, 36 the card↔bank matching pass, 35 fixed Android push, 34 carried card↔bank linking, 32 the Family SKU fixes |
| **Web** | Everything is Live at [fihaven.app](https://fihaven.app) |

> Want the Pre-Release/Beta builds? Join directly:
> **Android** — [Play Open Testing](https://play.google.com/store/apps/details?id=app.fihaven) ·
> **iOS** — [TestFlight](https://testflight.apple.com/join/SdN4yuuH)

### Summary

> Admin tools you can actually run a product with, a Rewards page that helps you
> pick a card (and keeps your rates when the catalog updates), report wrong rates
> against what FiHaven ships, **manual-first** bank balance suggestions and
> subscription confirms — now reliable across **more than one linked bank**, with
> cards that show which account they matched and a way to say *don't link this
> one* — a clearer debt-payoff planner, safer production auth /
> store webhooks, Android social sign-in that returns into the app after Google /
> Apple (Custom Tab → handoff), native Plaid OAuth that returns to iOS/Android
> instead of the web redirect page, a refreshed post-signup onboarding (Back,
> edit goals in place, delayed Free CTA, archive-by-default), native Spending /
> Family / tab-bar polish, **search on major lists**, a Pro paywall that
> shows plan length, price, and Privacy / Terms links, and a History tab that
> now charts **what you earned against what you spent** — with card payments
> kept out of the spending figure, and months it can't account for left blank
> instead of drawn as zero.

### Changes

**The page no longer scrolls sideways (Aug 9)**

Every page could be dragged a few pixels to the right on a phone, and about
20px on a desktop. The marketing hero's decorative orbs sit at `right`/`left`
-20…-30px and its preview frame is rotated `-.6deg`, so their boxes reach past
the page gutter; below 640px the gutter narrows to 16px and stops absorbing
the bleed. `.page-frame` now carries `overflow-x: clip` — `clip` rather than
`hidden`, because `hidden` would turn it into a scroll container and break the
sticky app bar inside it.

Chasing that turned up a real bug underneath: at 320px the app bar's
burger, wordmark, theme toggle and "Get Started" button don't fit, and the
button ran off the edge. Clipping alone would have hidden a half-visible
button, so the wordmark — the one element carrying no function next to the
logo mark — is dropped below 360px.

Verified with device emulation across 320–1440px on all fourteen public
pages: no horizontal overflow anywhere.

**A check for the AI crawler policy (Aug 9)**

That policy lives in Cloudflare's dashboard, not in this repo, so it can drift
without a commit and nothing in CI would notice — which is precisely how every
AI crawler came to be blocked. `npm run check:crawlers` asserts the matrix
against production: answer engines and user-triggered assistants must get 200,
training crawlers must get 403.

It also reports a Cloudflare gap it can't fix: "Configure block response →
Allowed paths" lists `/llms.txt` and `/llms-full.txt` as reachable by blocked
crawlers, but only `/robots.txt` actually is. A blocked training crawler gets
nothing rather than an accurate summary. The block works, so this is a missing
nicety rather than a policy failure, and it's reported as advisory.

**Asking an AI assistant about FiHaven now gets an answer (Aug 8)**

FiHaven was invisible to every AI assistant, and it was a configuration problem
rather than a content one. Cloudflare was returning 403 to every AI crawler that
asked for fihaven.app — including the *user-triggered* ones that fire when a real
person asks a question. In a single day, **267 requests from `ChatGPT-User` were
refused**, alongside `PerplexityBot` (107), `OAI-SearchBot` (100), `Claude-User`
and `Perplexity-User`. Anyone who asked an assistant "what is FiHaven?" was told
the site could not be reached. Googlebot, Bingbot and Applebot were never
affected, which is why ordinary search looked healthy the whole time.

- **Answer engines and assistants are allowed through** — ChatGPT, Claude,
  Perplexity, DuckDuckGo and Mistral, both their search indexes and the fetchers
  that act on behalf of a person asking a question.
- **Training-only crawlers are still refused** — `GPTBot`, `ClaudeBot`, `CCBot`,
  `Amazonbot`, `meta-externalagent`, `Bytespider` and the rest. Being answerable
  is not the same as donating the corpus.
- **Cloudflare's managed robots.txt is off.** It had been prepending a block that
  disallowed `Google-Extended` — quietly opting FiHaven out of Gemini's answers —
  and duplicated nine user-agent groups against the repo's own file, leaving the
  served policy genuinely ambiguous. `client/public/robots.txt` is authoritative
  again and declares `Content-Signal: search=yes, ai-input=yes, ai-train=no`.
- **`llms.txt` and `llms-full.txt`** are published at the site root: a plain-text
  statement of what FiHaven is, what each tier costs, and what it does not do.

**Shared links show a preview image again (Aug 8)**

Every page pointed `og:image` at an SVG. X, Facebook, LinkedIn, Slack, Discord
and iMessage all refuse SVG for preview cards, so every share of fihaven.app had
been rendering as a bare text link. There are now real 1200×630 JPEG cards
(default, pricing, security) rendered from an HTML template through headless
Chrome so they use the actual brand font, plus the `og:image:width`, `height` and
`alt` tags that were missing entirely. `npm run generate:og` rebuilds them.

**The site is readable without JavaScript (Aug 8)**

The nav and footer were injected by client-side JS, so the homepage's served HTML
linked only to `/login` and `/pricing`. Search engines render JavaScript, but most
AI crawlers do not — they were seeing a site with essentially no link graph. The
footer is now real markup on every public page (11–13 internal links), and
`public-footer.js` became progressive enhancement: it marks the active page when
the links are already there and only renders from scratch when they are not.

**Three new pages for people arriving from somewhere else (Aug 8)**

`/bill-tracker-app` is a guide to choosing a bill tracker; `/mint-alternative`
and `/rocket-money-alternative` are comparisons for the two products people most
often arrive from. Each carries `FAQPage` schema and, deliberately, a section
saying where FiHaven is the wrong tool and naming what to use instead.

**A card leads with what to pay, not with its statement balance (Aug 7)**

The big figure in the corner of a card was the statement balance, whatever your
payment-goal setting said. On a 0% promo card that had just cleared its
statement, that read "$0.00" — in the settled green — while the same row told
you two lines lower to pay $573.95 this month to clear the balance before the
promo ends.

- **"Due" now means what this period asks for**, under the payment goal you
  already choose in Settings (minimum, recommended, or the full balance), with a
  card's own Recommended payment overriding it as it always has.
- **"Due" and "Still owed" come from one number now** — the target, and what's
  left of it after this month's payments — so they can no longer disagree.
- **The statement balance is still on the row**, listed under the corner figure
  whenever what's due this period isn't the same number — a promo card, a card
  on the minimum, one with its own set payment. When they are the same number it
  isn't repeated.
- **"Suggested" is gone where it was a duplicate.** It sat two lines under a
  corner figure that now says the same thing. It stays on the cards where it
  still differs — the minimum and full-balance goals.
- Nothing else moved: the live balance is still on the row, and the setting for
  which amount leads is unchanged.

**Wide issuer logos aren't letterboxed anymore (Aug 7)**

A wordmark-shaped logo — Bilt, Hyatt, US Bank, Capital One — was capped in width
but still drawn on a full-height white plate, so it sat squashed in the middle
with white bands above and below it. The plate now shrinks to the mark it holds,
on the web and in both apps.

**Bilt gets its square logo back.** Cropping its artwork down to the strip its
letters occupy left it reading as a squashed band beside the square marks around
it, however the plate was sized. It now uses the square lockup the brand
publishes — the wordmark inside its own navy tile — so it sits in the row like
Citi's and Amex's do.

**A bill with no amount no longer says it's paid (Aug 6)**

If you saved a bill without filling in the amount, FiHaven treated it as a bill
that costs $0 — and a $0 bill is, by definition, already paid. So it sat there
every month claiming "Paid this month" with no payment behind it, and the Undo
on the row had nothing to remove, so you couldn't clear it even if you noticed.
A mortgage with a blank monthly payment did the same thing.

- **Blank and $0 are now different answers.** A blank amount reads "No amount
  set" and stays in Upcoming until you answer it. An amount you deliberately
  set to $0 reads "Nothing due" and settles.
- **One tap to settle it.** A row with no amount offers "It's $0" where Skip
  used to be — Skip only hid the row for a month and left the real gap. This
  replaces guessing on your behalf.
- **Existing bills are corrected too.** Every editor used to turn a blank field
  into 0, so old data can't tell the two apart. A one-time pass converts those
  back to "not set". If one of them really was $0, the row says so and "It's $0"
  fixes it for good in a tap.
- **Reminders stopped saying "$0.00".** A bill with no amount was emailed and
  pushed as "— $0.00", which read as "this costs nothing" — the opposite of what
  the app now says.
- **Autopay stopped inventing payments.** A bill with autopay on and no amount
  was auto-marked with a $0 payment that never happened. It left a phantom row
  in History and dragged down the average FiHaven uses to pre-fill next month.

**Deleting a purchase on the web asks first (Aug 6)**

The web keeps its ✕ — a pointer doesn't mis-hit a small control the way a thumb
does mid-scroll, which is why it went only from the phone apps. But it deleted
outright, with no confirmation and no undo, from a button sitting beside Edit.
It now names the purchase and asks. For a bank-imported one it reads "Remove",
and it still tells bank sync not to bring it back.

**Your budget period is the same on every device (Aug 6)**

A custom start day outside 1–28 was handled differently on the web than on the
phone — the web reset it to the 1st, the apps clamped it to the 28th. Same
account, two different months, so "due this period" and what counted as paid
disagreed depending on where you looked. All three now agree, and the Android
setting no longer lets an out-of-range day be saved in the first place.

**The one-tap ✕ is gone from the Spending list (Aug 4)**

Every row in Spending carried a ✕ that deleted the purchase immediately, with no
confirmation, sitting a few millimetres from the pencil that opens it for
editing. On a phone that is not a button, it's a trap — a scroll that lands
slightly wrong and the transaction is gone.

- **The ✕ is removed on iPhone and Android.** Tapping a row still opens it for
  editing, exactly as before.
- **Deleting still works, one step further in.** Open the transaction and use
  Delete at the bottom of the editor. For a purchase your bank imported, that
  same button is "Remove bank purchase" and still tells the bank sync not to
  bring it back.
- **The ✓ on a pending bank purchase stays.** It only confirms a purchase, so
  a mis-tap there costs nothing.

**Buying Pro on iPhone works (Aug 4)**

If you tried to buy Pro on iPhone, it failed. Not intermittently — every time,
on every build. Apple took the purchase and handed us the receipt, and we
refused it, because the server was never switched on to accept Apple receipts in
the first place. You'd have watched the purchase succeed in Apple's own sheet and
then seen nothing change in FiHaven.

- **It is on now.** The fix is a single server setting rather than anything in
  the app, which is why no earlier build could have rescued it.
- **If you were charged and never received Pro,** open Settings and tap Restore
  Purchases once you're on this build. The subscription should arrive without
  paying again. Nothing was lost — the purchase has been sitting with Apple the
  whole time.
- **Android was never affected.** Play purchases verify through a different path
  that was already switched on.

Everything else in this release is maintenance and has no visible effect:
updated libraries, a logging fix, and checks that stop a misconfiguration of
exactly this kind from shipping unnoticed again.

**FiHaven works offline now — properly (Aug 3)**

Every version of FiHaven claimed to handle being offline, and none of them
actually did. There was an "Offline" banner, a retry that kept trying, a message
telling you your changes were still being saved — but underneath, nothing was
written to your device. Open the app without a connection and you got an empty
dashboard. Close it while that banner was up and the change was gone.

- **Your data is on your device, so the app opens without a connection.** Bills,
  cards, balances, payment history — all of it is there, exactly as you left it,
  on a plane or in a lift or with a dead signal. Previously the phone apps opened
  to nothing at all and the web app wouldn't load at all, because the page itself
  had to be fetched before it could reach anything it had saved.
- **A change you make offline is kept, and sent when you're back.** It's written
  to your device *before* anything is sent to us, so it survives — you can
  force-quit the app, swipe it away, or close the browser, and it's still there
  and still sent the next time you open FiHaven or your connection returns.
- **Changes made offline are no longer overwritten.** This is the one that
  quietly lost work: a change that never reached us was thrown away the next time
  the app started successfully, because the app took our older copy over the
  newer one on your device. Your device's version now wins, and gets sent up.
- **The offline message tells the truth.** It used to say your changes weren't
  saved anywhere and ask you to keep the app open until it cleared. It now says
  they're saved on your device and will sync when you're back — because they are,
  and they will.
- Signing out still clears everything, on every platform. The copy on your device
  is erased with the rest of it.

One thing worth knowing: a change is synced as a whole snapshot, so if you edit
the *same* account offline on two devices at once, whichever reconnects last is
the one that's kept.

**A security pass over the whole app (Aug 3)**

An audit of the server, the web app and both phone apps. Fourteen things were
fixed; four of them were exploitable as they stood. None of them are known to
have been used against anyone, and none involved data leaving FiHaven — but four
of these are the kind that don't announce themselves, so they're written out
plainly rather than filed under "security improvements".

- **Two-factor codes can no longer be guessed at.** Entering a wrong code left
  that sign-in attempt open for its full five minutes, and someone who already
  had your password could start a fresh attempt as often as they liked — so a
  six-digit code was guessable given enough tries. Five wrong codes now end the
  attempt and send you back to the start, and asking for a new emailed code no
  longer resets the count.
- **Someone can't claim your email before you first use Sign in with Google or
  Apple.** If a stranger signed up with your address and never confirmed it,
  your first federated sign-in was joined to *their* account — and they still
  knew the password to it. Joining now requires that the existing account
  confirmed the address, which an impostor can't do.
- **A subscription can't be moved off the account that bought it.** A receipt is
  a bearer token: presenting someone else's granted you Pro *and silently took it
  away from them*. A purchase now belongs to the account that first redeemed it,
  permanently.
- **Purchases are checked against FiHaven specifically.** Receipt checks
  confirmed only that Apple had issued the receipt, not that it came from this
  app — so a receipt from any other App Store app would have counted.
- **Sign in with Apple or Google? You can manage your own security again.** Those
  accounts have no password, and every confirmation prompt asked for one — which
  meant turning off two-factor, removing a passkey, or clearing your data was
  impossible for you, on every platform. FiHaven now emails you a confirmation
  code instead.
- **Adding a passkey asks you to confirm it's you** unless you've only just
  signed in. A passkey outlives a password change, so anyone who got into an old
  session could previously leave themselves a way back in.
- **Deleting or clearing your data accepts whichever second factor you actually
  have.** It only ever accepted an authenticator code, so an account secured with
  a passkey or emailed codes was protected by the password alone at the one
  moment it mattered most.
- **Spreadsheet exports are safe to open.** A bill named to look like a formula
  could run when the file was opened in Excel or Sheets. Exports are now marked
  as text, and importing one back gives you the original name.
- **On iPhone, your sign-in no longer travels in device backups**, so restoring a
  backup onto a different phone doesn't carry your session with it.
- Also: the calendar feed is no longer stored by shared caches; failed sign-in
  attempts survive a server restart; and the browser is now told to refuse
  anything the app doesn't legitimately load.

**A refreshed fihaven.app (Aug 3)**

- **The site says how to actually get the apps.** Android is in **open testing**
  on Google Play and iPhone/iPad are on **TestFlight** — both open to anyone, no
  invite — but the site still said "closed testing", "not live yet", and to email
  for access. The store buttons weren't even links. They are now, and they go
  straight to the listings.
- **The Family plan is on the pricing page** as a plan you can read about and
  buy, rather than a sentence under FiHaven Pro.
- **New answers in the FAQ** on Family sharing, how reminders reach you, syncing
  between your devices, and working offline. The answer about archiving now
  describes what archiving actually does.
- **The site reads properly.** Body text on the legal, FAQ and pricing pages was
  a different colour and a different width from the lists sitting right next to
  it, so one page looked like two. And the footer stacked every link into its own
  full-width row on a phone, leaving it taller than some of the pages above it.

**Sign-out actually ends the session, and archived things stay archived (Aug 2)**

An audit pass over the Android app, then the same checks run against iOS, the web
app and the server. Most of what follows had been true on more than one platform.

- **Signing out stops your bill reminders.** They were scheduled on the device,
  not in the session, so they kept firing after you signed out — with the bill
  name and amount on the lock screen — and on Android were re-armed after every
  reboot, indefinitely. Deleting your account had the same gap. Both platforms
  now clear every scheduled reminder when the session ends, including when the
  app finds a token the server no longer recognises.
- **Archiving something now actually silences it.** Archived bills and cards are
  soft-deleted — hidden from every list and total — but the **server** never
  checked that flag. It kept emailing and pushing reminders for archived bills,
  counted them in the monthly summary and weekly digest, counted archived cards
  as debt, sent expiry reminders for their card offers, and — worst — **auto-marked
  archived autopay items paid**, writing payments you never made into your data
  and syncing them to every device. Fixed at the source, so all three apps
  benefit; the Android dashboard's trial alerts and Subscriptions total, and both
  phones' local reminders, were fixed alongside it.
- **A subscription you bought somewhere else can be managed again.** If you
  subscribed on the web, the phone apps showed "You're on FiHaven Pro" with no
  Manage button and nothing saying where to cancel — they were still asking the
  server about a payment provider we no longer use. The button is back, and every
  other case (bought on iPhone, bought on Android, promo, complimentary) now says
  in plain words where it's managed. The small print no longer tells an iPhone
  subscriber their money goes through Google Play, or vice versa.
- **Your data can't be lost between signing out and back in.** A save still
  retrying in the background wasn't stopped when you signed out; if it woke up
  during a fresh sign-in it could overwrite the new account with an empty copy.
  Both platforms now cancel it.
- **Signing out of the web clears everything it cached.** Sign-out dropped your
  bills, cards, payments and settings from the browser but left your net-worth
  accounts, savings goals and spending behind — which the offline fallback then
  reads back. On a shared computer the next person could have been shown them.
- **Exporting your data works on a full account.** Android handed the whole export
  to the share sheet inside an intent, which crashes the app once an account is
  large enough (a few years of imported bank rows will do it); it now shares a
  file, like iPhone does. A failed export used to do nothing at all on either
  platform — it now says so.
- **Smaller fixes.** Android: a bank-balance prompt for a single card cut its own
  sentence off mid-way; the transaction editor stamped the device's date rather
  than your time zone, as could the "Due in N days · Aug 12" line; the Family
  screen leaked a background connection each time you left it. Both phones: you
  could remove every tab from the bottom bar and be left with nothing but "More".

**A lapsed Family plan pauses your household instead of quietly doing nothing (Aug 1)**

- **Your shared household is never deleted.** When a Family plan ends, everything
  you and your household shared stays exactly where it is and stays visible to
  everyone in it. What pauses is *changing* it: adding something new, editing a
  shared item, renaming the household, or inviting someone. Settings → Family
  says so plainly, and resubscribing picks up right where you left off.
  Previously an ended Family plan changed almost nothing — the household kept
  working indefinitely, and the one thing that did break said your household was
  "full", which wasn't true.
- **You can still take your own things back out.** Unsharing an item, and leaving
  the household, keep working while a plan is lapsed — nothing of yours is ever
  stuck in a household you're no longer paying for.
- **Pending invites stay listed** so you can revoke links that can no longer be
  accepted.
- **Admin: Family can be given out, not just Pro.** Granting Family to an account
  already worked; promo codes couldn't do it at all, and now can — a code can be
  minted for Pro or for Family (shared household), and the code list says which
  it is. Revoking a granted plan now also pulls a redeemed promo code, and shows
  up even when a paid store subscription is sitting on top of it. Revoking a code
  doesn't let it be redeemed a second time.

**The Pro screen shows the plans, not a button that shows the plans (Aug 1)**

- **FiHaven Pro opens straight onto what you're buying.** On iPhone and Android
  it was a status card and an "Upgrade to Pro" / "Manage Pro" button, and the
  perks, prices, and Family plan only appeared once you pressed it. They're on
  the screen now — along with your current plan, the manage link and restore —
  so nothing about your subscription is a tap away. (The web already worked
  this way.)
- **The small print under the plans sits together**, instead of each line being
  spaced like a card of its own.
- **Promo codes are redeemed on the web.** The "Have a promo code?" box is gone
  from Android; a code you redeem at fihaven.app still applies to your account
  everywhere, and still shows as your Pro source in the app.
- **The Family upsell says what Family costs.** Settings → Family offered "Get
  the Family plan" with no price on it — you had to start the purchase to find
  out. It now shows the store's own price for your account (e.g. $29.99 / year)
  above the button, on iPhone and Android.

**Bank connections are on the Bank screen, not one tap further in (Aug 1)**

- **Settings → Bank is the linked-bank screen now.** On iPhone and Android it
  was a screen holding a single "Bank connections" row, which opened the actual
  thing — two taps to reach the only content there. Your banks, Connect a bank,
  and the import switches are on the Bank screen itself. (The web already worked
  this way: Settings → the Bank tab.)

**U.S. Bank, Bilt and CareCredit show their real marks (Aug 1)**

- **U.S. Bank cards carry the whole logo now, not a blank red shield.** What we
  shipped was the shield on its own — a red pentagon with nothing inside it,
  which next to every other issuer's mark read as something we hadn't finished.
  It's the full **usbank** lockup now, shield and wordmark.
- **Bilt is the current BILT mark**, white on its own dark plate, rather than the
  older wordmark — and it's a squarer lockup, so it renders bigger in the same
  space.
- **CareCredit has a logo at all.** It used to fall back to a "CC" chip; it now
  shows the green fan.

**Pick more than one reminder day, and branded notification emails (Jul 31)**

- **You can be reminded on several days now, not just one.** "Remind me" used to
  be a single choice — 3 days before, say — plus an on/off switch for the due
  day itself. It's now a multi-select: pick up to five days (a week out, three
  days out, *and* the morning it's due, if that's what you want) on the web, on
  iPhone, and on Android. The days you pick drive everything at once — the
  reminder emails, push, and on-device notifications — so there's still one
  place to set them. Whatever you had picked before carries over untouched.
- **Reminder emails now look like FiHaven.** Every email — bill and trial
  reminders, the weekly digest, the monthly summary, and the sign-in ones — is
  headed by the FiHaven logo and now uses the app's own colours, type, and
  spacing instead of a near-miss of them. Amounts line up in the same
  monospaced figures the app uses, and the whole thing reads correctly in a dark
  inbox.

**Code redemption and account deletion, fixed for App Review (Jul 31)**

- **On iPhone, "Redeem an App Store code" opens Apple's own redemption sheet.**
  The typed-in FiHaven promo code box is gone from the iPhone app: App Store
  rules only allow Apple's redemption sheet there, and that's now the single
  button on the Pro screen and the paywall. FiHaven promo codes still work on the
  web and on Android, and a code you redeemed there still shows as your Pro
  source on iPhone.
- **You can delete your account even if you signed in with Apple or Google.**
  You couldn't before: deleting asked for a password, and an account created
  through Sign in with Apple or Google has never had one, so the button could
  never be completed. Those accounts now confirm by typing DELETE ACCOUNT DATA,
  which is all that was ever protecting the button anyway. Deleting still wipes
  the account and every bill, card, payment and linked bank, and signs you out.
- **"Delete account" now sits under Settings → Account**, not only at the bottom
  of Data, on iPhone and Android — it's the first place anyone looks. It's still
  in Data as well.
- **"Change password" is hidden when you don't have one** (Apple / Google
  sign-ins), instead of opening a form that could never be submitted.

**Sign-in errors say what actually went wrong (Aug 1)**

- **Mistype your password and the app now says so.** It used to say "Your
  session expired. Please sign in again" — on the sign-in screen, before you had
  a session. The same wrong message covered a wrong password when deleting your
  account, a bad authenticator code, and a passkey that didn't verify. Each of
  those now says what happened.
- **After deleting your account you get told it worked**: "Your account with
  you@example.com has been deleted. No turning back." — instead of being dropped
  on the sign-in screen with no explanation.
- **A failed Google sign-in tells you why.** If it failed, the app closed the
  Google window and returned you to sign-in with no message at all, which was
  indistinguishable from the button doing nothing.

**Deleting your account now cancels your web subscription (Jul 31)**

- **If you subscribed on fihaven.app, deleting your account stops the billing.**
  It didn't. Your subscription lives at Paddle, our merchant of record, and
  deleting the account only removed our own record of it — so the card kept
  being charged for an account that no longer existed, with no way left to log
  in and cancel. Deletion now cancels the subscription at Paddle first, and
  immediately. If you're ever charged after deleting, email support@fihaven.app
  and we'll refund it.
- **App Store and Play subscriptions still have to be cancelled by you**, in
  Settings → Apple ID → Subscriptions or the Play Store — Apple and Google don't
  let us do it on your behalf. Every delete screen and the deletion page say so.

**Skipped periods show up in History (Aug 1)**

- **Skipping a month is now something you can look back on.** Deciding to skip a
  bill for a period was recorded but never shown anywhere — History listed only
  what you'd paid, so a skipped month simply went missing and there was no way to
  tell "I skipped this" from "I forgot to record it". Skips now list alongside
  payments on the web, iPhone and Android, marked **Skipped** rather than an
  amount.
- **Nothing you skipped counts as money spent.** A skip carries no amount, so it
  stays out of every total: the month header reads "$120.00 paid · 2 skipped"
  instead of folding the skip in, and a month of nothing but skips says so
  instead of claiming "$0.00 paid".
- **Removing a skip is how you undo it**, and the buttons now say that — "Remove
  skip", not "Delete payment", and the item goes back to owing its usual amount
  for that period. There's no Edit on a skip, since there's no amount to edit.
- **Exported history records it too.** The CSV gains a **Status** column, so a
  skip is distinguishable from a payment once the file is out of the app.

**The new-month bill review, fixed everywhere (Aug 1)**

- **The amount boxes look like the rest of the app.** They were unstyled, so on a
  Mac set to dark mode they came out as black boxes with white numbers in the
  middle of a white dialog.
- **Every row now says when the bill lands** — "Due Aug 5", or "Autopays Aug 20"
  if it's on autopay, in red if that date has already passed unpaid — and carries
  an **Edit** button, so a bill whose day or name is wrong can be fixed without
  leaving the review. You come back to the review with everything you'd typed.
- **It's obvious the list keeps going.** The dialog counts the bills, says
  "scroll for all", and fades the last row instead of relying on a hairline
  scrollbar you can barely see.
- **Saving the amounts dismisses the "Welcome to August" banner.** It used to sit
  there afterwards until you dismissed it separately, as though nothing had
  happened.
- **The review now shows up on iPhone and Android**, not only on the web.
  Whichever device you opened first each month was quietly claiming the prompt for
  the whole account, so if you checked the web first the phones never mentioned
  it. The new month now stays open on every device until you actually deal with
  it — and dismissing it, or saving the amounts, clears it everywhere at once.
- **The debt-payoff strategy cards are readable on a dark Mac again.** Avalanche
  and Snowball are buttons, and on an OS set to dark they were drawing white text
  on the planner's light card.

**A public page for deleting your account (Jul 31)**

- **[fihaven.app/delete-account](https://fihaven.app/delete-account) explains how
  to delete your account and exactly what goes with it** — and how to ask us to
  do it if you've already uninstalled the app or can't sign in. Google Play
  requires a deletion route that works from outside the app, and a settings tab
  you can only reach by logging in isn't one. Linked from the site footer, the
  Privacy Policy, and Terms §10.

**Push notifications actually arrive now (Jul 29)**

- **Turning on push asks for permission.** It didn't. iOS hands out a delivery
  token whether or not you've allowed notifications, so the server was sending
  reminders to phones that had never been asked and iOS was throwing every one of
  them away — silently, and indistinguishable from push simply being broken.
  Enabling push now asks first. If you'd already turned it on, the app asks the
  next time you open it; if you've deliberately said no in the past, it doesn't
  pester you.
- **On Android, pushed reminders land in "Bill reminders" like they should.**
  They were going to a channel Android invented on the spot called
  "Miscellaneous", which meant they ignored the sound, importance and mute
  settings you'd chosen for bill reminders — and vanished entirely if you'd
  muted that unfamiliar channel. Both the app and the server now name the right
  channel, so this is fixed for already-installed apps too, not just new ones.
- **When push registration fails, we can now tell why.** The failure used to
  print one useless line and disappear. It's recorded with the underlying reason
  and kept after the app closes, and the server now says when a device is
  registered on a platform it can't currently deliver to, or when it drops a dead
  token — the one failure that previously left no trace anywhere.

**Real logos for 9 more card issuers (Jul 29)**

- **Citi, Capital One, U.S. Bank, Bilt, Fifth Third, T-Mobile, Best Buy, Lowe's
  and Hyatt now show their actual logo.** These are the issuers that had been
  showing initials on a colored chip, because the icon set the other marks come
  from doesn't carry them. They're now drawn in full color — Citi's blue and red,
  Best Buy's yellow tag, Fifth Third's 5/3 shield, T-Mobile's magenta T — in the
  cards list, the calendar, budgets, and what's-coming-up on the home screen, on
  web, iPhone and Android alike.
- **A full-color logo sits on a white tile.** These logos were drawn for a white
  page, so instead of being tinted to fit the theme they get a light plate to sit
  on. That's what keeps Bilt's black wordmark visible in dark mode. The 37 marks
  that were already there are unchanged: still a white mark on a brand-colored
  chip.
- **Wordmarks keep their shape instead of being cropped to a letter.** A logo
  that's wider than it is tall now renders at its real proportions rather than
  being squeezed into a square, up to about twice as wide as tall, so a row's
  text never gets shoved around.
- **"Barclay" and "Barclaycard" find the Barclays logo**, and a Centurion Card
  shows American Express — it's an Amex card, and Centurion is what people call
  it.
- **"Citizens Bank" no longer shows Citi's logo.** A shorter brand name hiding
  inside a longer, unrelated one used to be treated as a match; Citizens is its
  own bank, and now gets its own mark. Same for Capital City Bank, which is not
  Capital One.
- **Care Credit, Mission Lane, Aven, OpenSky, Indigo and LMCU** have no logo we
  can license, so they keep initials on a chip — but now on their own brand
  color, and with the shorthand they use for themselves (ML, OS, LM, CC) rather
  than a single letter.

**What to pay counts what you've already paid (Jul 29)**

- **Paying a card lowers what it asks for.** Pay your card for the month and the
  suggested payment doesn't sit there asking for the same amount again. Every
  figure in the Pay flow — Minimum, Recommended, a loan's monthly payment, a
  bill's full amount — is now what's *left* toward that target this period, and a
  target you've already covered drops off the list instead of offering itself a
  second time. Where a figure has shrunk, it says why: "Minimum payment ·
  $35.00 of $35.00 paid".
- **Open Pay on something already paid and the amount starts empty.** It used to
  helpfully fill in the whole recommendation again, which is how you end up
  recording a payment twice. An extra payment is now an amount you type on
  purpose, and the hint says the item is already fully paid for the period.
- **The "Suggested" figure on a card shrinks as you pay it**, and disappears once
  there's nothing left — it was previously fixed to the card's setup and ignored
  every payment you'd made.
- **On iPhone and Android too**, with the same targets and the same wording.

**Cards lead with the amount you choose (Jul 29)**

- **Utilization is measured against your current balance now.** A card whose
  statement closed at zero but that you've used since read as 0% used — on the
  card itself, in the total at the top, and in the dashboard's high-utilization
  warning. All three now follow the live Current Balance whenever you track one
  (a bank sync fills it in, or you can type it), and fall back to the statement
  balance when you don't.
- **The credit total tells you the two numbers behind the percentage.** The
  utilization tile spells out what you owe against the limits you've entered —
  "$4,318.42 of $21,500.00 used" — instead of a bare percentage.
- **What's due has its own spot: the top-right corner of every card.** The
  amount, its due date, and the color that says how close it is, all in one
  place instead of buried in a row of statistics.
- **You pick which of a card's three amounts gets the big figure.** They answer
  different questions, so there's no single right one: the **amount due** (the
  statement balance, the one with a deadline), the **current balance** (what's
  actually on the card, including charges since the statement closed), or
  **what's still owed** this period (what the Pay button targets — it shrinks as
  you make partial payments). Whichever you choose, the other two stay on the
  card in smaller type, so nothing is hidden. Cards start on the amount due.
- **Set it once, on any device.** Settings → Payments on the web, Settings →
  Preferences on Android, Settings on iPhone. Loans use the same corner, reading
  their scheduled payment and remaining principal.
- **Each amount is one line now, and the issuer logo is bigger.** The corner
  reads label-then-figure on a single line — "DUE AUG 2  $1,204.55" — with the
  other two amounts on their own lines beneath it, and the date rides along with
  the word "due" wherever it appears.
- **The totals above your cards are two things, not five.** Five equal tiles
  read as five equally important numbers and used words your cards don't. Now
  there's **what you owe** — the one figure to act on, with due, current and
  minimums itemized underneath in the same words the cards use — and beside it
  **your credit line**: utilization, what's used of what's available, and the
  bar. The due total is shown for the first time.

**Refund windows: what the stores actually allow (Jul 29)**

- **Our 14-day, no-questions refund is a promise about fihaven.app, and the
  policy now says so plainly.** If you subscribed inside the iPhone or Android
  app, Apple or Google took the payment, and their window applies instead of
  ours. The old wording implied 14 days everywhere, which we can't deliver on a
  store purchase and shouldn't have suggested.
- **Google Play: 48 hours self-service, then come to us.** You can refund it
  yourself for the first 48 hours. After that Google stops handling it and sends
  you to us — and we'll refund it from the Play Console on the same 14-day terms
  as a web purchase.
- **Apple: no fixed window, and Apple's decision.** Apple doesn't publish a
  guaranteed refund period and reviews each request itself; in practice Report a
  Problem only lists the last ~90 days, so ask early. We can't issue, override or
  appeal an App Store refund — Apple doesn't give developers that ability.
- **You won't be worse off for buying through a store.** If Apple refuses a
  refund we think you should have had, we'll make it right with equivalent Pro
  access.
- **EU / EEA / UK:** your 14-day right to withdraw covers store purchases too, but
  it's a right against the store as seller — exercise it through Apple or Google.
- **Sales tax and VAT** on web purchases is collected by Paddle, and Paddle can
  refund the tax portion on its own if you were charged tax you shouldn't have
  paid — within 60 days, with a valid VAT ID or exemption certificate. Paddle's
  Buyer Terms are now linked from the policy, with a note that where our policy
  gives you more, ours applies.

**Security: sign-in redirect hardening (Jul 28)**

- **The page you land on after signing in is now checked at the moment we send
  you there.** FiHaven carries a deep link across sign-in — follow an emailed
  settings link while signed out and you still end up at settings — and that
  destination arrives as part of the URL, so it has always been treated as
  hostile and rebuilt from a fixed list of pages. That check now also runs
  immediately before the browser navigates, so a crafted link can't send you to
  another site or run script through the address bar. Two CodeQL alerts
  (client-side XSS, open redirect) closed; no change for real links.
- **Dependency fix:** a bundled build-time package (`brace-expansion`) could be
  driven to exhaust memory. Updated to a patched release; `npm audit` is clean.

**Income history became income *vs. spending* (Jul 28)**

- **The History tab now draws what you earned against what you spent.** It used
  to be a stack of bars, one per month, each measured against your biggest
  month. Because income barely moves, every bar ran nearly the full width and
  they all looked the same — the chart couldn't show you the one thing you'd
  want from it. It's a line chart now: income and spending as two lines, oldest
  month on the left, with the gap between them shaded. That gap is your net.
- **A new headline number: average net per month.** Income minus spending,
  averaged over the months we actually have records for, in green or red.
  Average income and average spending sit beside it.
- **Card payments no longer count as spending.** Paying your Chase bill isn't
  money leaving your pocket — the purchases already were, when you made them.
  Counting both would have doubled your card spending. Bills and purchases are
  merged into one figure, and a bill you both typed into Spending *and* marked
  paid is counted once, not twice.
- **Months we can't account for are left blank, not drawn as zero.** If you made
  card payments in a month but never logged what you bought, we don't know your
  spending — so the line breaks and the month is shaded rather than plotted at
  $0, which would have read as a fantastic month. The table underneath says
  "not recorded" instead of a number, and those months stay out of your
  averages.
- **The chart starts where your records do.** Your income is worked out from
  your current setup, so it can be projected back years — but your spending only
  exists from when you started logging. Charting the whole range would have
  shown an enormous fake surplus tapering off right where your real data begins.
  It now begins at your first recorded month.
- **The month list is still there**, underneath the chart, with exact figures
  for income, spending and net.
- **On iPhone and Android too**, with the same chart and the same rules.

**Card logos on iPhone and Android (Jul 27)**

- **Your cards show their bank's logo in the app now, not a colored dot.** The
  web has drawn real brand marks for Chase, Amex, Bank of America, Wells Fargo,
  Discover, Visa, Mastercard, Apple, PayPal, Robinhood and Target for a while;
  iPhone and Android showed a stand-in emoji instead. They now draw the same
  marks — in the cards list, the calendar, and what's-coming-up on the home
  screen. Loans keep 🏦.
- **26 more logos, on every platform.** Barclays, Goldman Sachs, HSBC, Diners
  Club and JCB; the airline and hotel cards — American, United, Southwest,
  Delta, JetBlue, Marriott, Hilton; Verizon, IKEA and Shell; and Venmo, Cash
  App, Klarna, Afterpay, Coinbase, Revolut, Wise, Monzo, N26, Nubank and Brex.
  A card named for its rewards program finds its logo too — AAdvantage,
  SkyMiles, MileagePlus, Rapid Rewards, Bonvoy and Hilton Honors.
- **Every other issuer gets its initials on a brand-colored chip.** Citi,
  Capital One, U.S. Bank, Bilt, CareCredit, SoFi, Synchrony, your credit union
  — none of them publish a logo we're able to bundle, so instead of a colored
  dot you get a clean monogram: C1 for Capital One, US for U.S. Bank, NF for
  Navy Federal. Any issuer you type gets one, with the real brand color where
  we know it.
- **"Bilt Mastercard" now shows Bilt, not Mastercard.** Every card is a Visa or
  a Mastercard, so the network says the least about which card you're looking
  at; when you've named the issuer, the issuer wins.
- **Logos stay readable in dark mode.** Apple's black and the Visa / Bank of
  America navies would have disappeared against a dark card, so a mark that's
  too close to its background is lightened just enough to read, keeping its
  color rather than washing out to white.

**Cards ↔ bank accounts, part two (Jul 27)**

- **Every bank's cards get an Accept button now, not just one bank's.** With
  more than one bank linked, each sync overwrote the previous bank's balance
  suggestions, so only the last bank to sync ever had anything to approve.
  Suggestions are now built across every linked bank at once.
- **A suggestion can no longer vanish before you answer it.** Saving anything
  from a device that had loaded before the last sync — a second phone, another
  tab, a settings change — wiped the review queue, and the hourly sync throttle
  meant it could stay empty for an hour.
- **A card FiHaven matched to an account now says so.** Matching by digits was
  invisible and forgotten between syncs, so a matched card got balance
  suggestions while its purchases stayed unattributed and the editor still read
  "Match automatically". A confident match is now written onto the card, where
  you can see it and change it.
- **New "Don't link this card" option** in the same picker, for a card you never
  want matched to a bank. "Match automatically" isn't a refusal — it invites the
  next sync to match again — so this is how a no sticks.
- **Disconnecting a bank no longer breaks the cards that used it.** A card
  pinned to an account from a bank you removed (or relinked, which issues new
  account ids) was quietly barred from ever matching again. Those pins now
  repair themselves.
- **An overpaid card is no longer read as debt.** A $50 credit balance was
  suggested as owing $50. Cards where you're ahead now suggest a zero balance,
  and issuers that report what's owed as a negative are still read correctly.
- **A closed or de-selected account stops making suggestions.** Its last-seen
  balance used to linger and get re-proposed forever.
- **Loan suggestions appear on the Loans tab**, where the loan actually is,
  instead of under Credit Cards.
- Archived cards no longer appear in the review queue, an account whose balance
  the bank didn't report no longer suggests $0.00, and the card editor's account
  list refreshes after you link or disconnect a bank instead of going stale
  until reload.

**Notification emails redesigned + one-click unsubscribe (Jul 27)**

- **The reminder, digest, and summary emails were rebuilt.** Bills are now a
  proper list — name on the left with a "due in 3 days" pill, amount lined up
  on the right — and the totals sit in their own panel instead of trailing off
  the end of a sentence. Bigger heading, roomier spacing, a real button.
- **They finally look right in dark mode.** The templates ship a dark palette
  of their own, so Gmail and Apple Mail stop force-inverting them into the
  half-white, half-black mess they were.
- **Every notification email now has an Unsubscribe link** next to a
  **Manage notification preferences** link, both in the footer. Unsubscribe
  works signed out, straight from the inbox — no password, no app.
- **Your mail app's own Unsubscribe button works too.** Gmail and Apple Mail
  show a built-in unsubscribe control at the top of the message; FiHaven now
  answers it, which is what Gmail and Yahoo require of anyone sending
  recurring mail and what EU rules expect for consent-based email.
- Unsubscribing only turns off the kind of email you clicked from — opting out
  of the weekly digest keeps your bill reminders. **Account security emails
  (password reset, email confirmation, 2FA recovery) have no opt-out** and
  always send.
- **A deep link now survives sign-in.** Following the preferences link while
  signed out used to dump you on the marketing page; now you sign in and land
  on Settings → Notifications, the tab already open.

**Push notifications fixed (Jul 26)**

- **Android push notifications work again.** Every server-sent notification —
  bill reminders included — had been failing to deliver. `firebase-admin` moved
  its messaging entry point in v13, so the send call threw on every attempt
  while push still reported itself as configured. Nothing surfaced it: the
  error was caught, logged to stderr, and the code path had no test coverage.
  Fixed, and covered by tests that fail against the old call.
- **Turning notifications off now takes effect.** Both apps only remembered the
  registered device token in memory, so after restarting the app the switch had
  nothing to unregister — the device stayed subscribed and notifications kept
  arriving. The token is now stored on the device, so switching push off retires
  what the server actually holds.
- **Devices no longer pile up.** The same in-memory gap meant a token reissued
  by the OS (reinstall, restore to a new phone, clearing app data) never
  retired its predecessor; one account had accumulated 12 Android registrations,
  11 of them dead. Old tokens are now retired as they are replaced, and the
  server prunes any the push service reports as gone.
- **iOS can now receive push at all.** The app shipped without the
  `aps-environment` entitlement, so `registerForRemoteNotifications()` failed at
  the OS level, no device token was ever issued, and the server had nothing to
  send to — zero iOS devices had ever registered. Added in build 13, with the
  value tracking the signing profile so debug and release builds each target the
  right APNs environment. Web push was unaffected throughout and is working.

**Web billing moves to Paddle (Jul 26)**

- Web checkout is now handled by **Paddle**, which acts as our **merchant of
  record** — Paddle is the seller for web purchases, takes the payment, and
  handles sales tax and VAT. Stripe is gone from the web entirely.
- Checkout is now an **overlay** instead of a redirect: you stay on the page,
  and Pro activates as soon as the payment confirms.
- Cancelling and changing plan happen in the Paddle customer portal, reached
  from the same **Manage subscription** button as before.
- Prices, plans, and the 7-day trial on monthly and yearly are unchanged.
  Family still bills right away with no trial.
- **App Store and Google Play purchases are untouched** — those still go
  through Apple and Google, and existing native subscriptions keep working.
- Terms, Privacy, Refunds, Security, FAQ and Pricing now name Paddle as the
  merchant of record, replacing every mention of Stripe.

**Refund policy (Jul 26)**

- New **[Refund & Cancellation Policy](https://fihaven.app/refunds)** covering
  cancellation on each platform, refunds on web purchases, and the fact that
  App Store and Google Play purchases can only be refunded by Apple or Google.
  Linked from Terms, Pricing, and the site footer.
- **Every web charge is refundable in full within 14 days** — first purchase or
  renewal, any plan, no conditions and no reason required. This replaces the
  3-day, case-by-case window the policy launched with: Paddle's domain review
  rejected it for carrying qualifiers and for being shorter than Paddle's own
  refund policy, which already gives EU/EEA/UK buyers 14 days regardless of
  what we publish. Billing mistakes are still corrected after the window.
- Statutory-rights and promo-code sections reworded so neither reads as a
  carve-out: complimentary Pro has nothing to refund, but a discounted *paid*
  subscription is refundable on the same 14-day terms as any other.
- Terms section 5 and the Pricing billing panel restated to match.

**Cards ↔ bank accounts (Jul 26)**

- **Link a card to a bank account yourself.** The card editor on web, iOS, and
  Android gained a **Linked bank account** picker. Pick the account a card
  actually is and FiHaven stops guessing — balance suggestions and imported
  charges follow the card you chose. American Express needs this: the account
  number Plaid reports isn't the one printed on the card, so matching by digits
  was never going to connect them.
- **Automatic matching got better too.** Beyond the last 4 digits, FiHaven now
  recognizes the issuer behind a bank's trading name (Amex ↔ American Express,
  Chase ↔ JPMorgan Chase) and matches the product name — "Gold Card" against
  "Amex Gold Card". An account with no digits at all can now be matched, which
  it previously could not.
- It still refuses to guess: two Amex cards and one Amex account means FiHaven
  asks instead of picking, and a card you've pinned somewhere is never claimed
  by something else.
- **Spending knows which card.** Imported charges show the card they belong to,
  and a linked card shows what it's spent this period.

**Ownership & licensing (Jul 25)**

- FiHaven is now owned and operated by **Greigh Studios LLC**. The code moves to
  the **Greigh Studios Source Available License v1.0** (project-specific terms in
  Schedule A of `LICENSE`) — what you may do with the source is unchanged: read
  it, contribute, run it locally; no public hosted copies, no redistributed
  builds, no stripping billing.
- **Terms of Use** and **Privacy Policy** now name Greigh Studios LLC as the
  provider of the Service and the controller of your data. Nothing about what is
  collected, stored, or shared changed.
- Site footers, transactional emails, and the iOS / Android **About** screens
  carry `© 2026 Greigh Studios LLC`. The "Made with ♥ by Daniel Hipskind"
  credit stays — same person, now behind the studio.

**Family plan & trials (Jul 25)**

- Fixed the **Family** plan not appearing on Android — Play Console's product id
  is `app.fihaven.pro.family.yearly`, not `app.fihaven.pro.family`, and product
  ids can't be renamed. The server now honors both ids.
- Fixed paywall pricing that could read **"Free"** and sort a plan to the top
  when a free-trial offer was attached to its base plan.
- Fixed Play purchases that could **charge on day one** despite the advertised
  7-day trial, by explicitly picking the trial offer instead of whichever offer
  Play returned first.
- Family on the web checkout no longer starts a 7-day trial, matching Play and
  the App Store, where Family has never carried a trial offer. Home, Pricing,
  and FAQ copy now say so: the trial is on monthly and yearly Pro, Family bills
  right away.

**Lists spacing (Jul 23)**

- Cards, Loans, and Bills list rows breathe more — summary, search, and meta
  chips are less cramped, and Paid / Skipped badges sit under the account name
  so they no longer overlap titles when action buttons are crowded (#207).

**Category icons (Jul 23)**

- **Category icons in Settings** — Preferences → Category icons: pick a standard
  glyph, add a custom emoji, or upload a small image per bill category (Housing,
  Utilities, etc.). Overrides sync with your encrypted data blob on web, iOS,
  and Android.
- Custom images render on native too (not web-only); emoji fallbacks stay for
  text contexts when an image is set.
- **Card issuer icons** — Cards and upcoming payments show Chase, Amex, Bank of
  America, Wells Fargo, Discover, Visa, Mastercard, Apple, PayPal, Robinhood,
  Target logos on web; Citi, Capital One, Bilt, and others use recognizable
  emoji stand-ins. Native uses the same emoji map.

**Dependencies (Jul 23)**

- Bump `better-sqlite3` to 13.0.1 and `plaid` to 44 (lockfiles synced). Confirm
  production Node is on the engines floor (≥24.18) before deploying — v13 was
  previously pinned back after segfaults on Node 20.

**Lists, paywall & Android Google (Jul 21)**

- Search on **Bills**, **Cards / Loans**, **Subscriptions**, and **Spending** —
  iOS, Android, and web (#200).
- Pro paywall: plan title, subscription length, price (yearly shows $/mo),
  Privacy Policy and Terms of Use (EULA) links, clearer auto-renew copy on iOS
  and Android (#201).
- Maintainer App Store / Play listing notes and 1024×1024 IAP promo images
  (`docs/maintainer/iap-promo/`) for Guideline 2.3 / 3.1.2 (#201).
- Android Google Custom Tab: callback uses form **POST** then **302** to
  `fihaven://oauth/google?code=…` so Chrome hands off without a JS redirect
  after `fetch` (#199). Deploy web/API for the new route before relying on it
  in production.

**Onboarding & tabs (Jul 20)**

- Post-signup flow is now **Goals → Plan → Security → Pro** on web, iOS, and
  Android. Back revisits earlier steps; Plan shows what will sit in your bottom
  bar with **Change goals**; Pro leads with Premium and only reveals
  **Continue with Free** after **Not now** or closing the paywall.
- Plan step offers **Archive instead of delete** (on by default) so retiring a
  bill, card, or loan keeps history instead of hard-deleting.
- Goal picks only reserve bottom-bar slots (up to four); everything else stays
  under More — Customize tabs no longer lists the whole catalog as “bottom bar.”
- Android Customize tabs: changes draft until **Save** (Save was stuck disabled);
  Cancel discards. Oversized saved tab lists are capped so Save can clean them up.
- Android bottom bar: short **Subs** / **Worth** labels so long words don’t wrap
  mid-name; Intro/onboarding Back controls on both platforms.

**Native UI polish (Jul 20)**

- Spending: long merchant names truncate cleanly; bank status sits under the
  title; Edit / Keep / dismiss targets are easier to tap (#197).
- Family: Leave / invite actions stay readable in dark mode; member caps no
  longer show “1 of 0”; household totals use clearer row layout (#197).
- Biometric lock delay persists across toggles and app updates (dedicated prefs
  on Android; preferred key sync on iOS) (#197).

**Auth & bank linking (Jul 20)**

- Android Google (Custom Tab fallback): after account pick, return via
  package-locked `fihaven://oauth/google?code=…` so Chrome Custom Tabs do not
  keep same-host `https://fihaven.app/oauth/…` and stall sign-in; surface handoff /
  CSRF errors instead of a silent signed-out state (#194).
- Native Plaid Link: platform-specific OAuth return — Android `android_package_name`,
  iOS Universal Link `/plaid` + `resumeAfterTermination` — so OAuth banks no longer
  dump users on web `/plaid-oauth` (#195). Web Link still uses `/plaid-oauth`.
- CodeQL ReDoS cleanups + more resilient XcodeGen downloads in CI (#189).

**Auth & security (Jul 18)**

- Android Continue with Google: Credential Manager first; on failure open a
  Custom Tab GIS page, deposit the token under a one-time handoff, and return via
  `https://fihaven.app/oauth/google` (verified App Links) instead of putting a
  JWT on `fihaven://` (#180, #186).
- Apple on Android uses the same handoff + App Link path after the Services ID
  callback (#186).
- App-level MFA now runs after Google/Apple sign-in when the account has a second
  factor (web + iOS + Android) (#185).
- Production: cryptographically verify Apple StoreKit / App Store Server JWS;
  authenticate Google Play RTDN Pub/Sub pushes; refuse `dev-trust` OAuth/IAP and
  missing https `PUBLIC_ORIGIN` at boot; Stripe portal `dev-*` always blocked in
  production; iCal token minting requires Pro; Android `allowBackup="false"`
  (#185).

**Admin console**

- User-management overlay for admins: search users, Grant/Manage Pro with plan
  picker (trial / monthly / 3-month / yearly / family / lifetime) and custom day
  counts, revoke comp Pro, suspend / unsuspend (optional reason), send password
  reset, force logout, delete account (type email to confirm).
- Soft account suspension blocks new logins; suspended clients see a lock state
  via `/me` without wiping open sessions until Force logout.
- Pro source pills (App Store / Play / Web / Admin / Promo) and last-sign-in
  relative timestamps on each user row.
- **Last data sync** — relative time from last synced app-data write
  (`user_data.updated_at`).
- Promo-code panel: mint `free_sub` codes, list active/exhausted/expired, copy,
  deactivate.
- Expanded Rewards catalog (Bilt 2.0 + popular cards) editable in Admin → Rewards;
  mirrored to iOS / Android (#183).
- When admin catalog rates change for a card you already customized, offer
  **Update** or **Keep mine** — never silently overwrite your rates (#183).
- Admin modal tabs cleaned up to a compact underline control (no empty full-width
  track) (#187).

**UX polish (web + native)**

- Web Cards: long card titles no longer stack one character per line when action
  buttons are wide.
- Web app bar: primary tabs share the middle width; refreshed pill active state.
- Landing / dashboard spacing tightened for a denser first view (#184).
- Android More tab: nested routes and system back behave more predictably (#182).
- Play uploads: release name is `version (build)`; deploy no longer auto-bumps
  `versionCode` (#181).
- Admin user rows: **Last sign-in** vs **Last data sync** (not “app open”); null
  login with activity shows “Unknown (pre-tracking)” instead of “Never logged in”.
- iOS / Android: dismissible offline banner when cloud sync fails — changes stay
  on this device.
- Income history: membership-bounded months (default up to 18), 6/12/18/All range
  control, subtler month list (not a dominant bar chart).
- Report wrong rate: toggle **% / × points**, show cash-equivalent value; Pro
  action **Only correct my card** (local fix without emailing FiHaven).
- Debt payoff redesigned: hero debt-free date, Snowball vs Avalanche compare,
  account list under the selected strategy; numeric calculator pad removed
  (estimator + payment splitter kept).
- Mortgages / housing loans excluded from payoff by default; optional
  “Include mortgage (estimate only)” with PMI/escrow caveat.

**Rewards**

- Full Rewards redesign across web, iOS, and Android: “Which card should I use?”,
  wallet at a glance, credits & perks, offer-use suggestions, card-linked offers,
  annual-fee check.
- Rate/link editing moved to the Cards editor; Rewards is for picking and tracking.
- **Report a wrong rate** sheet (web / iOS / Android) → `POST /api/feedback/reward-rate`.
- “Our preset” / reported `ourRate` comes from the **shared preset catalog**
  (`shippedRewardRate` / `Rewards.shippedRewardRate`), not the user’s edited card;
  optional “also correct on my card”; public `ShippedRate` init for iOS module
  boundary.
- Integration test aligned to shipped-preset semantics (#171).

**Cards & payments**

- Recording a payment now lowers **Current Balance** as well as Statement Balance
  and promo balance (web / iOS / Android), so the Cards tab no longer shows a
  stale live figure after you pay.
- Paying a **0% promo** card down to zero asks once whether to remove the promo
  flags; declining remembers that choice until you change the promo in the editor.
- Zero-balance promo cards drop out of dashboard / Cards promo alerts and payoff
  monthly totals.

**Bank sync (Plaid)**

- Balance suggestions are **manual-first**: sync proposes **Current Balance**
  (never overwrites Statement Balance). Accept or Decline each suggestion;
  declined/accepted fingerprints do not reappear until the bank figure changes.
- Settings → Bank: choose **Review queue** (Cards) or **Ask after each sync**.
- Credit-limit suggestions still require an unambiguous last-digits match
  (`plaidBalances.js`); Amex 4↔5-digit masks; typed limits never cleared when
  the bank omits a limit.
- Accept / decline pending bank transactions; declines persist across pending→posted
  id swaps via `settings.plaidHidden`.

**Subscriptions**

- Merchants detected from spending stay **Suggested** until you Accept, Decline,
  or Add (prefilled subscription bill). Declined merchants stay hidden.
- Monthly total counts **tracked** subscription bills only.
- Settings → Bank: **Suggested inbox** vs **Inline with actions**.
- Tighter detection: similar amounts across ≥2 months, or ≥3 distinct months
  (cuts grocery/gas false positives).

**Spending / UI polish**

- Optional per-transaction **Note**; period-scoped spending list; bank rows editable.
- Budget view refresh (iOS / Android).
- Bills / Cards layout polish; suggested payment amount shown on card rows when
  distinct from a bare “not paid” state (promo monthly / recommended payment).

**Store launch & ops**

- Unauthenticated `GET /health` liveness probe (DB `SELECT 1`) with per-IP rate limit.
- Android Play upload automation (`scripts/play-upload.js`): `--build`, track via
  `GOOGLE_PLAY_TRACK`, mapping + native-debug-symbols upload, clearer permission
  errors; release title `versionName (versionCode)` without auto-increment (#181).
- App Links fingerprints + maintainer store-launch docs; OAuth App Links + AASA
  `applinks` for `/oauth/*` (#186); Custom Tab prefers package-locked
  `fihaven://oauth/…?code=` when https would stay in-tab (#194); AASA `/plaid`
  for iOS Plaid Universal Links (#195).
- Marketing/legal copy: native apps rolling out (TestFlight / Play internal).
- Interactive deploy version prompts (`scripts/native-versions.js`): npm-init style
  Version + iOS build; Android versionCode always previous+1; iOS deploy does not
  rewrite Android `versionName`; confirms when package.json / CHANGELOG look stale.

**Security**

- Encrypt `user_data` at rest (AES-256-GCM, same key as TOTP/Plaid); legacy
  plaintext rows read until the next write migrates them.
- Require verified email for Plaid linking (webhook stays open) and account
  export (JSON + CSV).
- Production deploy must set `MFA_ENCRYPTION_KEY`; boot warns if the key still
  lives beside the DB; deploy script locks down `data/` permissions.
- Escape user-named bill/card in pay-goal hint (CodeQL #37).
- Rate-limit `/health`; validate go-live store hrefs (CodeQL #38–#40).
- Remove DOM-attr→`.href` flow on go-live badges entirely (CodeQL #41, #42) —
  store URLs live on markup `<a href>`; script only toggles visibility.
- Apple IAP / notification JWS verification (`server/appleJws.js`); Google Play
  notification OIDC / shared-token auth (`server/googlePubSubAuth.js`); production
  boot guards (`server/securityConfig.js`) (#185).

**Build / packaging**

- Corrected 1.6.0-era iOS Info.plist override that mislabeled TestFlight as 1.5.0;
  `CFBundleShortVersionString` tracks `$(MARKETING_VERSION)`.
- Adopt bun for scripts where applicable; dependency bumps (stripe, svelte, etc.).
- Native builds, and what actually shipped in each:
  - iOS **1.6.1 (11)** / Android **1.6.1 (33)** — Jul 26 card↔account linking.
  - iOS **1.6.1 (10)** / Android **1.6.1 (32)** — Jul 25 ownership / licensing
    + Family SKU and trial fixes. Uploaded before card linking merged.
  - Prior: list spacing, icons, deps, list search, paywall, Google Custom Tab.

### Technical changelog

> **⚠️ Deploy order:** the security pass below changes server and native auth
> paths together, so **the server must be deployed before or alongside iOS 22 /
> Android 44**. The offline work is client-side and needs no deploy of its own.

#### iOS 27 / Android 48

> **Web-only.** No native code changed; the build numbers move to stay in step
> with the web deploy. `securityHeaders.js` gains CSP hashes for the new
> `ld+json` blocks, so the server does need the deploy — which has gone out.

**Discoverability (`client/`, `scripts/`)**

- `client/public/llms.txt`, `client/public/llms-full.txt` — new, served as
  `text/plain` from the Vite `publicDir` passthrough.
- `client/public/robots.txt` — rewritten with a per-class AI crawler policy and a
  `Content-Signal` declaration. Cloudflare's "Manage your robots.txt" was
  disabled at the zone; it had been prepending a managed block that contradicted
  this file on `Google-Extended` and duplicated nine user-agent groups.
- `scripts/generate-og.js` — new. Renders the OG cards to 1200×630 JPEG via
  headless Chrome (webfonts need a real browser; a plain SVG rasterizer falls
  back to a system sans). JPEG over PNG because the card is a large smooth
  gradient — Chrome's PNG is ~400 KB and quantizing it bands the orb, while q92
  JPEG is ~76 KB clean. `npm run generate:og`.
- `client/public/og-image.svg` deleted; `og-image.jpg`, `og-pricing.jpg`,
  `og-security.jpg` added. All ten public pages updated, with `og:image:type`,
  `:width`, `:height`, `:alt` and `twitter:image:alt` added.
- `scripts/generate-sitemap.js` — new. `client/public/sitemap.xml` is now
  generated from `PUBLIC_PAGES` in `scripts/indexnow-urls.js`, with `lastmod`
  from `git log -1 --format=%cs` per source file. `npm run sitemap`;
  `npm run sitemap:check` is wired into `npm run ci`.
- `scripts/indexnow-urls.js` — restructured into the single source of truth for
  public URLs (was drifting from the sitemap: missing `/refunds` and
  `/delete-account`). `PUBLIC_PATHS` is now derived; `PUBLIC_PAGES` carries the
  per-page `file` / `changefreq` / `priority`.
- `client/js/public-footer.js` — now progressive enhancement. `markActive()`
  reads the literal `href` attribute rather than the `a.href` property, which the
  DOM resolves to an absolute URL.
- New pages `bill-tracker-app.html`, `mint-alternative.html`,
  `rocket-money-alternative.html`, registered in `vite.config.js` `rollupOptions
  .input` and in the dev-server `cleanUrls` legacy map.
- Structured data: `home.html` `WebApplication` → `SoftwareApplication` with
  `featureList` and four `Offer`s; `Organization` gains `sameAs` and a security
  `ContactPoint`; `pricing.html` gains `Product` + `AggregateOffer`; the three
  new pages carry `BreadcrumbList` + `FAQPage` (and `Article` on the guide).
- `server/securityHeaders.js` — `INLINE_SCRIPT_HASHES` updated for the six
  `ld+json` blocks. Regenerate with `npm run csp:hashes` (it prints for paste;
  it does not write the file).

#### iOS 26 / Android 47

> **Client-only.** No server change rides with this build. Builds 25 and 24
> still need their deploys — skipping them doesn't retire the requirement.

**A card row's `due` amount is the period's goal, not `card.balance`**

- **`cardAmounts` / `Schedule.amounts` return `due = goalAmount(...)`** on all
  three cores (`utils.js`, `Schedule.swift`, `Schedule.kt`) — the pay target the
  active `settings.paidGoal` policy names, with `card.recommendedPayment` still
  overriding it. `owed` is that same goal less the period's payments, so the two
  are now derived from one number instead of two that could disagree.
- The old `due` was the raw statement balance, which on a 0% promo card with a
  cleared statement rendered `$0.00` in `Theme.green` (the `<= PAID_EPSILON`
  branch) beside a row that was simultaneously suggesting the monthly payoff
  slice. Client-side only — no schema or API change, and the `cardHeadline`
  setting still picks which of the three leads.
- **`CardAmounts.statement`** (nullable) carries the statement balance back onto
  the row now that `due` no longer always is it. The core resolves it to
  null/nil when it's within `PAID_EPSILON` of `due` or `current`, and on loans,
  so the three clients can't drift on when to draw the line. It renders as an
  extra companion line, never as a headline — `cardHeadline` still takes three
  values.
- **The "Suggested" line/tile is suppressed when it matches `due` or `owed`.**
  Under the default recommended policy the goal *is* the suggestion, so the row
  was printing the same figure twice; under the minimum/full policies it still
  differs and still shows. `CardsList.svelte` compares against its net-of-
  payments `payTargetRemaining`, the native rows against the gross target —
  hence the check against both amounts.
- Settings copy on all three clients no longer describes "Due" as the statement
  balance.

**Full-color issuer marks: the plate hugs the mark**

- A mark wider than `MAX_LOGO_ASPECT` (1.75) was capped in width but still laid
  out at full row height, so `ContentScale.Fit` (Compose) / a fixed `height`
  with `object-fit: contain` (CSS) letterboxed it inside its own white plate —
  Bilt (4.02:1), Hyatt, US Bank, Capital One.
- The mark's box now carries the mark's own aspect ratio in all three clients:
  `IconMark.kt` builds the `ImageVector` at `markWidth`/`markHeight`,
  `IssuerLogoView.swift` frames at the same pair, and the CSS derives width from
  a new `--logo-aspect` custom property (set alongside the existing inline
  `aspect-ratio`) with `height: auto`. Corner radius scales with the shorter
  plate.
- **`bilt` is re-authored as a 1:1 mark** in `issuerLogos.js` (regenerated into
  the native tables by `scripts/sync-issuer-logos.js`): the brand's square
  lockup, wordmark centred at 90% of the tile's width on a full-bleed navy
  square, rather than the artwork cropped to its letters. At 4.02:1 the cropped
  version rendered as a ~42x10 strip beside 24x24 marks whatever the plate did.
  The header's "cropped to its artwork bounds" rule now names it as the
  deliberate exception.

#### iOS 25 / Android 46

> **⚠️ Needs a server deploy.** Earlier drafts of this section called the build
> client-only; that stopped being true when the blank-amount work landed. The
> reminder wording (`emails.js`, `push.js`), the autopay guard (`scheduler.js`)
> and the bcrypt-cost change (`util.js` + the three auth routes) are all
> server-side. iOS 25 also still carries the build-24 purchase fix, which needs
> the server deployed regardless.

**Blank vs. zero amounts (`amount`, `minPayment` are now nullable)**

- **`Bill.amount` and `Card.minPayment` are nullable on every platform.** `nil`/
  `null` means "never filled in"; `0` means "deliberately nothing due". A zero
  goal satisfies `remaining <= 0`, so collapsing the two made a blank-amount row
  report `PaidState.full` forever, with an Undo that deletes a payment record
  and therefore found nothing to delete. Arithmetic goes through
  `amountOrZero` / `minPaymentOrZero`; the nullable field itself answers "was
  one ever set?".
- **`Schedule.needsAmount` / `nothingDue` / `isFullyPaid(goal:paid:skipped:needsAmount:)`**
  added to all three cores (`utils.js`, `Schedule.swift`, `Schedule.kt`) with
  matching test sets. Only the field the active goal actually reads counts, so a
  balance-derived goal (recommended/full on a credit card) legitimately reaching
  0 stays "nothing due" rather than "missing setup".
- **`confirmZeroAmount(type:refId:)`** on all three clients writes a real `0` —
  the one thing the data cannot infer, since every editor previously collapsed a
  blank field to `0`.
- **`scripts/migrate-blank-amounts.js`** converts existing `0` values back to
  `null` (bills' `amount`; loans' `minPayment` only — `0` is legitimate on a
  credit card). Dry-run by default; `--backup <path>` is written **before** the
  first mutation so an interrupted run is always recoverable.
- **Editors preserve the distinction.** `amountOrNull` (`modals.js`) and the
  native editors keep a blank field blank instead of `parseFloat(x) || 0`.

**Cross-platform consistency fixes found auditing the above**

- **Dashboard Upcoming (web) had none of it.** `DashboardView.svelte` still
  rendered `$0.00` and a Skip button on a blank-amount row while both native
  `UpcomingRow`s had been updated.
- **The cards hero contradicted its own rows.** `caughtUp`/`owedCount` derive
  from `remaining > 0.005`, which a blank `minPayment` satisfies, so the header
  read "all N cards paid this period" directly above "No minimum payment set".
  Both platforms now exclude `needsAmount` cards and name them in the caption.
- **"Nothing due" wore the paid-green.** `nothingDue` had no colour branch in
  four of five native row types and fell through to `state == .full`.
- **"Nothing due" rows offered a dead Undo.** `state == .full` rendered Undo,
  which removes a payment record — there is none. The branch now precedes the
  `.full` case on both platforms.
- **iOS tinted window-edge rows orange.** `statusColor` checked `needsAmount`
  before the ended/not-started cases; Android checked `windowLabel` first.
- **`autopayMark` was not Pro-gated on either native client**, while
  `autopay.js` (`entitlement.pro`) and `scheduler.js` (`isPro`) both gate it.
- **`setPaid` unmark matched the calendar `monthKey`**, not the active period,
  so on a startDay/rolling period Undo searched a window the row's paid state
  was never computed from and removed nothing.
- **Period config clamping disagreed.** `clampDay`/`clampLen` (`period.js`)
  reset out-of-range values to the default while Kotlin's `coerceIn` and Swift's
  `min(max(…))` clamp to the nearest valid one — day 31 read as the 1st on web
  and the 28th on both apps, moving every period boundary. Web now clamps, and
  the Android period dialog (a free-text field) clamps on save so an
  out-of-range value is not written at all.
- **Reminders formatted a blank amount as `$0.00`** on all four delivery paths
  (`NotificationScheduler.kt`, `NotificationScheduler.swift`, `push.js`,
  `emails.js`). Native and push drop the figure; the email says "no amount set".
- **Autopay auto-marked blank-amount items** with a `$0` payment on all four
  (`scheduler.js`, `autopay.js`, `AppViewModel.kt`, `AppStore.swift`), leaving a
  phantom History row and a `0` in `recentPaymentAverage`, which drives the
  rollover prefill.
- **The web's row ✕ deleted without confirming.** Keeping it on the web is
  deliberate (a pointer does not mis-hit the way a thumb does), but it fired
  `removeTx`/`declineBankTx` outright with no undo. `SpendingPanel.svelte` now
  routes both through `openConfirm`, naming the purchase and its amount. The
  editor also carries Delete / Not mine, matching the native editors.

**Security**

- **`ACTIVE_BCRYPT_COST` no longer keys off `NODE_ENV` alone.** The reduced
  cost (4, for suite runtime) now requires the runner's own `VITEST` marker as
  well. `NODE_ENV` is among the most commonly set variables in a process
  manager, and a stray `NODE_ENV=test` in production would have hashed every new
  password at cost 4 while the `BCRYPT_COST === 12` guard kept passing.
  `util.test.js` pins that exact case.

- **The destructive ✕ is gone from the Spending row on both native apps.**
  `SpendingRow` (`ios/FiHavenApp/Sources/Main/SpendingView.swift`) and
  `SpendingTxRow` (`android/.../ui/SpendingScreen.kt`) each rendered a 44/48pt
  delete button immediately beside the edit pencil, firing `deleteTransaction`
  (or `declineBankTransaction` for imported rows) on a single tap with no
  confirmation and no undo. Both are removed, along with the now-unused
  `onDelete`/`onDecline` closures and the `Icons.Filled.Close` import.
- **Nothing is stranded.** Both transaction editors already carried the same
  destructive action with the same bank/manual branch — `TransactionEditor`
  (`BudgetView.swift`) and the `onDelete` passed to `FormDialog`
  (`BudgetScreen.kt`) — reached by tapping the row or the pencil. The delete
  path is unchanged; only the number of taps to reach it is.
- **The `onKeep` ✓ is untouched.** It is non-destructive and only renders for
  `tx.isBank && tx.pending`.
- **The web list keeps its ✕** (`client/svelte/SpendingPanel.svelte`). A pointer
  doesn't mis-hit a 20px control the way a thumb does.

#### iOS 24 / Android 45

> **iOS 24 is inert without a server deploy.** The purchase fix is entirely
> server-side. Build 23 was skipped; nothing shipped under that number.

- **`APPLE_VERIFY_ENABLED` was never set in production.** `verifyApple()` throws
  `apple-verify-not-configured` before decoding anything when the flag is unset,
  so in `production` verify mode *every* Apple receipt was refused — the purchase
  completed at Apple and was then dropped on arrival. Set now. Android was
  unaffected: `verifyGoogle()` gates on `GOOGLE_VERIFY_ENABLED`, which was on.
- **Sandbox acceptance no longer depends on remembering anything.**
  `APPLE_ALLOW_SANDBOX` was a boolean you flipped for review and unset after;
  forgetting the second step was silent and left sandbox receipts minting real
  Pro indefinitely. It now carries a deadline (`sandboxAllowed()` fails closed on
  anything unparseable), stamped per-deploy by `upload.sh --allow-sandbox` and
  deliberately excluded from the deploy allowlist so a local value can never
  ship.
- **Sandbox is pinned to the build under review, automatically.** The JWS
  transaction says *whether* a purchase is sandbox but not *which build* it came
  from. iOS 24 is the first build to send `AppTransaction.shared` alongside it —
  a second Apple-signed object, verified through the same Root CA G3 chain — and
  the deploy stamps `APPLE_SANDBOX_BUILD` from `project.yml`. Matching is "that
  build or newer": `ios-testflight.sh --build +1` rewrites `project.yml`, so
  exact matching meant deploying web first stamped the old number and failed
  review for reasons nobody would trace to deploy order. It can't be gamed —
  the version arrives inside a signed payload. This pins a *build*, not a
  reviewer; anyone on TestFlight running an accepted build gets sandbox Pro.
- **Play license-tester purchases were granting real Pro, permanently.**
  `verifyGoogle()` stamped every verified purchase `Production`, including ones
  carrying `testPurchase` from `subscriptionsv2.get`. Recorded as `Sandbox` now
  and gated by `GOOGLE_ALLOW_TEST_PURCHASES`. Play exposes no app version on a
  purchase, so there is nothing to pin — the dated window is the only lever.
  Only affects accounts on the Play Console license-tester list.
- **CodeQL #51 — tainted format string (`server/billing.js`).** `console.warn`
  treats its first argument as a format string and the transaction id was
  interpolated into it, so a txn id of `%s` consumed the following argument and
  erased the replaying account's id from the only record of a receipt replay.
  Specifiers moved into the literal.
- **CodeQL #52 — false positive, but it found a real gap.** The rule only
  recognises `lusca`/`csurf` and cannot see `requireCsrf`. Rather than dismiss on
  inspection, `server/csrfCoverage.test.js` walks the real Express router stacks
  and asserts every state-changing route either includes `requireCsrf` *by
  function identity* or is exempted with a reason, validated in both directions.
  Writing it found `POST /api/auth/resend-verification` unprotected — cookie
  authenticated and forgeable into sending verification mail on a signed-in
  user's behalf. Guarded; `verify-email.js` now sends the token it already holds.
- **Node version drift is caught before the deploy swings over.**
  `package.json` demanded `>=24.19.0` while the VPS ran 22.22.1 and the dev
  machine 24.18.1 — a floor matching nothing. npm only warns without
  `engine-strict`, so nothing surfaced it. No dependency needs 24 (highest is
  `better-sqlite3` `>=22`) and no production code uses a Node 24 API, so the
  floor is `>=22.11.0`; `upload.sh` reads `node -v` on the remote and refuses to
  deploy below it; CI matrixes 22 and 24 instead of testing only the version
  production doesn't run.
- **Dependencies.** `googleapis` ^173 → ^174. Android: Compose plugin 2.4.10,
  Kotlin JVM 2.4.10, `plaid:sdk-core` 6.2.0, `firebase-bom` 34.17.0.

- **Security audit: 14 findings across server, web, iOS and Android.** Four were
  independently exploitable.
  - *MFA was brute-forceable.* `mfa_challenges` had no attempt counter and a
    wrong code didn't consume the row, so a token stayed usable for its full
    `MFA_TOKEN_TTL_MS`; worse, `rateLimit.reset()` on a correct password meant an
    attacker holding the password could mint fresh tokens indefinitely. Added
    `attempts`/`sends` columns (+ migration); 5 failures destroy the challenge.
    Both counters are now carried through the delete-and-reinsert that
    `/mfa/email/send` and `/mfa/passkey/start` perform — that reinsert was itself
    resetting the budget.
  - *OAuth account pre-hijacking.* `routes/auth.js` linked a provider identity to
    any local row matching the email, `email_verified` unchecked, so squatting an
    address and waiting for the victim's first federated sign-in captured them
    into an attacker-held account. Linking now requires a verified local address;
    the UNIQUE-race branch applies the same rule. Returns 409
    `email-unverified-conflict`.
  - *Store receipts were transferable.* `upsertSubscription`'s
    `ON CONFLICT(platform, txn_id)` updated `user_id`, so replaying a signed
    transaction moved the subscription and revoked the original owner's Pro.
    `user_id` dropped from the conflict update; `recordPurchase` rejects a txn
    owned by another user with 409 `receipt-already-claimed`.
  - *Apple receipts weren't bound to the app.* Every App Store receipt chains to
    Apple Root CA G3, so signature validity said nothing about origin. Pinned via
    `APPLE_BUNDLE_ID` (enforced on both the client-verify and server-notification
    paths); Sandbox rejected in production unless `APPLE_ALLOW_SANDBOX=1`.
    `verifyGoogle` now requires an exact `productId` match instead of falling
    back to `lineItems[0]`.
  - *Pub/Sub audience failed open.* `googlePubSubAuth` skipped the `aud` check
    when unconfigured; any Google-signed OIDC token would then pass. Fails closed.
    (No behaviour change where `PUBLIC_ORIGIN` is set — the audience already
    derived from it.)
  - *No HTTP security headers at all.* New `server/securityHeaders.js` adds CSP,
    HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy. CSP
    names each inline script by SHA-256 rather than using `'unsafe-inline'`, and
    **ships Report-Only** — promote with `CSP_ENFORCE=1` once sign-in, Paddle
    checkout and Plaid Link are confirmed clean. `npm run ci` fails if a hash
    drifts (`scripts/csp-hashes.js`); that check caught two `client/public/`
    pages the first pass missed.
  - *Credential-adding needed no re-auth.* Passkey enrolment took session + CSRF
    only, so a stolen session could plant a credential surviving the password
    change meant to evict it. Now re-authenticates unless the session is under
    five minutes old — a grace window that keeps already-shipped clients working,
    since they post no body to `register-start`.
  - *Destructive actions honoured only TOTP.* `checkSecondFactor` returned "pass"
    with no TOTP enrolled, so passkey-only and email-only accounts had no second
    factor on delete/clear-data. Now accepts TOTP, backup codes or an emailed
    code.
  - *Password-less accounts couldn't manage MFA at all.* `verifyPassword` compares
    against the `!oauth-no-password` sentinel, so every re-auth prompt was
    unanswerable for Apple/Google accounts — `totp/disable`, `passkey/delete`,
    `backup-codes/regenerate`, `email/enable|disable`, `totp/setup` and
    `clear-data` were permanently unreachable. New `server/reauth.js` accepts a
    password *or* a code from `POST /api/account/mfa/reauth/send` (single-use,
    5-attempt cap, reusing the challenge counters). `GET /mfa/status` now reports
    `hasPassword` so clients know which prompt to render. All three clients grew
    the control: one `reauthFields` snippet in `MfaSection.svelte`, `ReauthField`
    on iOS, `ReauthFields` on Android — each replacing six duplicated password
    prompts.
    For a password-less account **one emailed code satisfies both** the re-auth
    and the second factor on `clear-data` (`confirmDestructive`); codes are
    single-use, so demanding two from the same mailbox would be unanswerable
    rather than stronger. Account deletion deliberately keeps its typed-phrase
    path so it stays reachable without mail (App Store 5.1.1(v)).
  - *iOS Keychain accessibility.* The bearer token used
    `kSecAttrAccessibleAfterFirstUnlock`, so a 30-day credential rode along in
    encrypted device backups. Now `…ThisDeviceOnly`, rewritten on update so
    already-signed-in users get it too.
  - *Lower severity:* CSV formula injection in exports (guarded, with a matching
    strip in the importer so round-trips are unchanged); CR/LF and control
    characters stripped from mail headers in `sendMail`; the iCal feed is
    `Cache-Control: private` with `Referrer-Policy: no-referrer` (the token is in
    the URL); the login throttle persists to SQLite via an injected store, so a
    restart no longer clears failed-attempt counters.
  - *Deploy plumbing.* `upload.sh` builds the production `.env` from an
    allowlist that didn't include the new vars — setting `APPLE_VERIFY_ENABLED=1`
    would have shipped the flag without `APPLE_BUNDLE_ID` and the new boot check
    would have killed the server post-cutover. Allowlist extended and a
    deploy-time guard added mirroring `assertProductionSafe()`, run against the
    *sanitized* file so a var that never reaches the server fails the deploy
    instead.
  - New env: `APPLE_BUNDLE_ID` (required at boot with `APPLE_VERIFY_ENABLED`),
    `APPLE_ALLOW_SANDBOX`, `CSP_ENFORCE`. All documented in `.env.example`.
  - Verified: 797 web tests, 1351 iOS core checks, iOS Release/device archive
    config, Android `:core:test` + `:app:compileDebugKotlin`, plus live runs of
    the re-auth and passkey-grace flows against a booted server.

- **Offline-first is implemented, on all three platforms.** `docs/native-contract.md`
  §1 ("an on-device cache mirrors the blob for offline reads") and §4 rule 1
  ("on network failure, load from the offline cache and surface an Offline
  indicator") had never been built. Both phones carried the *symptoms* —
  `SyncState.Offline`, a dismissible banner, an exponential-backoff retry — over
  nothing: `AppStore.load()` / `loadData()` caught the error, flagged offline and
  kept the in-memory copy, which on a cold launch is `AppData()`. The web had the
  localStorage data cache but `sw.js` cached no assets ("the app is online-first"),
  so the page couldn't boot far enough to read it. Worse than an empty dashboard,
  **an edit made offline was destroyed**: it reached the cache or the retry loop,
  never the server, and the next successful `bootstrapData()` / `load()` adopted
  the server's older snapshot over the top of it.
  The design point: sync is whole-blob last-write-wins and the server keeps no
  version or `updatedAt`, so the outbound queue is not an operation log — it is
  one bit meaning *"the server has not accepted this snapshot"*. That collapses
  the durable queue and the offline copy into one object. Invariants, identical
  on every platform: **write to disk before the network** (the gap between an
  edit and the debounced `PUT` is the gap that lost it); **only a 2xx clears the
  pending flag** (a 5xx, a timeout or a killed process leaves it set to be
  replayed); **a pending snapshot beats the server copy on launch**, but the
  entitlement is always taken from the server so a stale cache can't confer Pro;
  **everything is scoped to an owner**, and a mismatched snapshot is *deleted*
  rather than skipped (otherwise offline edits get pushed into whichever account
  signs in next — the same class of bug as build 21's cross-session save);
  **sign-out and account deletion wipe it.**
  - Native: new `OfflineCache` in the shared core so the existing suites cover it
    ([Swift](ios/FiHavenCore/Sources/FiHavenCore/Storage/OfflineCache.swift),
    [Kotlin](android/core/src/main/kotlin/app/fihaven/core/storage/OfflineCache.kt)),
    persisting an atomic `{owner, data, pendingWrite, savedAt}` envelope — via
    temp-file rename on Android and `.atomic` + `.completeUnlessOpen` file
    protection on iOS (not `.complete`, which would fail a read before first
    unlock; not `Caches`, which the OS may evict, and this file can hold the only
    copy of an edit). Android decodes through the lenient `decodeAppData`, so one
    bad cached row degrades exactly as it would from the server. `mutate()` writes
    the cache then schedules the save; the Android save loop was extracted to
    `scheduleSave()` so `loadData()` can replay a pending snapshot. 9 Kotlin tests
    + 7 Swift check sections, both covering the relaunch case (a second instance
    over the same directory) and the cross-account refusal.
  - Web: new [`pendingSync.js`](client/js/pendingSync.js) marker keyed to
    `fh_data_owner`, set in `scheduleSync()` *before* the debounce, cleared only
    on a 2xx in `pushData()`, honoured by `bootstrapData()`, retried on the
    `online` event, and added to `SESSION_KEYS` so sign-out drops it with the
    cache it points at. `sw.js` gains install/activate/fetch handlers: network-
    first for navigations and same-origin assets, `/api/*` never cached (a stale
    balance that renders as current is worse than an honest failure), non-`basic`
    and non-`ok` responses never stored, plus a standalone `offline.html` with no
    external asset of any kind. Registration moved out of `enableWebPush()` into
    [`swRegister.js`](client/js/swRegister.js) — the shell cache had been gated
    behind an unrelated notifications opt-in — and runs on `load` so it doesn't
    compete with the dashboard's own requests. 4 new tests drive the actual
    data-loss path end to end.
  - Copy corrected in four places that are now false: iOS `SyncState.offline`
    and `SyncOfflineBanner`, Android's `SyncOfflineBanner` and Settings sync
    line all said nothing was stored on the device and asked the user to keep
    the app open until the save cleared.
- **Public pages: availability, body copy, footer.** `.legal-card p` muted every
  paragraph on a legal/FAQ page while the adjacent `<ul>` inherited `--text`,
  and `.hero-shell p`'s `max-width: 58ch` also caught body copy — so a long
  paragraph wrapped at roughly half the width of the list beneath it (visible on
  Privacy §3). The muted rule is now `> p` (the lede only) and `.legal-section
  p/ul/ol` share one treatment, including `ul + p` spacing. `.site-footer` was a
  wrapping flex row whose credit/legal lines claimed `width: 100%`, and below
  600px `.site-footer-links a` was given `width: 100%` too, turning ten links
  into ten full-width rows; it is now a two-column grid collapsing to one
  centered column at 720px, with a new `.site-footer-brand` (needed because
  `pay.html` has a lone legal line that a `:first-child` selector would match).
  Store badges were dead `aria-disabled` `<span>`s and the site claimed closed
  testing / no public listings / email-for-access — Android open testing and the
  public TestFlight link are both joinable, so they are real anchors now, fixed
  across home, pricing, FAQ, contact and security. Family added as a third
  pricing plan (`.marketing-plans-three`; note `.marketing-plan-list li` is a
  flex row, so an inline `<strong>` becomes its own flex item and needs a `<span>`
  wrapper). FAQ gained Family, reminders, sync and offline entries with matching
  JSON-LD.
- **Session teardown is now explicit on both phones.** Sign-out cleared auth
  state but left two things running that outlive it. (1) **Scheduled reminders.**
  They live with the OS, not the session — Android's survived in
  `SharedPreferences` and `BootReceiver.rescheduleFromSaved` re-armed them after
  every reboot, forever; iOS's `UNCalendarNotificationTrigger` requests simply
  persisted. New `NotificationScheduler.cancelAll` on both. (2) **The debounced
  save retry.** `AppViewModel.saveJob` / `AppStore.saveTask` re-read the data on
  every attempt, and a `Task` keeps itself alive regardless of whether anything
  still holds the store — so a loop that woke between a new sign-in storing its
  token and `loadData()` returning would `PUT` an empty `AppData` over that
  account. Both are now torn down by `AppViewModel.endSession()` /
  `AppStore.endSession()`, called from logout, account deletion, and the
  bootstrap path where the server rejects a stored token (which never went
  through `logout()`). The save loop additionally checks the session before each
  attempt, and skips its trailing `refreshNotifications()` when the session
  ended — `onSessionExpired` hands off to `logout()`, which suspends before
  clearing `_session`, so the refresh would otherwise re-arm what `endSession()`
  had just cancelled.
- **`server/scheduler.js` never honoured `archived`.** `grep archived` returned
  nothing: `billActiveOn()` gated on the start/end window only, while every
  client's `billActive` is `!archived && !notStarted && !ended`. Soft-deleted
  records therefore drove bill reminders, trial reminders, the monthly summary
  and the weekly digest, and archived cards leaked into `offersExpiringOn()` and
  both debt totals — and `markAutopay()` **auto-marked them paid**, pushing
  phantom `payments` into `u.data` via `upsertUserData` and out to every device.
  `billActiveOn` now rejects `archived` and a new `activeCards(data)` covers the
  card paths. 7 regression tests, including two positive controls so the filter
  can't over-reach. Clients tightened to match: `AppStore.refreshNotifications`
  and `AppViewModel.refreshNotifications` pass `activeBills`/`activeCards` (bill
  *due* reminders were already safe via `nextDueDate → billActive`; trial and
  offer reminders read the raw lists), and Android's dashboard trial alerts and
  Subscriptions widget switch to `activeBills`.
- **Both native clients were still on the Stripe billing contract.** The server
  moved to Paddle: `GET /api/billing/status` returns `paddlePortal` and
  `POST /api/billing/stripe/portal` no longer exists. `BillingStatusResponse`
  kept decoding `stripePortal` — permanently `false`/`nil` — so `manageButtonLabel`
  returned nil for a web subscriber and the paywall rendered "You're on FiHaven
  Pro" with no button and no explanation. Renamed to `paddlePortal` /
  `createBillingPortal()` against `api/billing/paddle/portal` on both platforms
  (resolving the dev server's site-relative `/dev-portal` against the API base),
  plus `billingNote` cases for every remaining source and a new `storeTerms`
  so the Apple/Play auto-renewal boilerplate is only shown to subscribers it
  applies to. Android surfaces a portal failure as a Toast instead of a button
  that does nothing. **The web was already correct** — it is what got migrated.
- **Web: `clearLocalData()` and `cacheLocally()` had drifted apart.**
  `storage.svelte.js` cached seven keys; `auth.js` and `settings.js` each removed
  a hand-written five, leaving `fh_accounts`, `fh_goals` and `fh_transactions` in
  `localStorage` after sign-out and account deletion — and `bootstrapData()`'s
  offline fallback reads exactly those keys. New `client/js/localCache.js` holds
  the single list; `SYNCED_KEYS` is derived from it so they cannot drift again.
  3 tests.
- **Android `ExportRow` put the whole account in `Intent.EXTRA_TEXT`**, which
  crosses a Binder transaction and throws `TransactionTooLargeException` past
  ~1MB. Now staged to `cacheDir/export/` and shared through a new `FileProvider`
  (`@xml/file_paths`, cache-path only) with `ClipData` so the read grant reaches
  the share sheet — matching iOS, which already wrote a temp file. Both platforms
  now report a failed export instead of silently doing nothing.
- **Smaller Android fixes.** `BankConnections`: `"…for $n card" + if (n == 1) ""
  else "s" + ". …"` — `+` binds tighter than the `if` arms, so the single-card
  branch swallowed the rest of the sentence. `BudgetScreen.TransactionEditorDialog`
  and `MainScaffold.dueLabel` used `LocalDate.now()` instead of
  `DateLogic.today(zone)` (PayDialog and the calendar were already correct).
  `streamHousehold` used `readTimeout = 0` with a non-cancellable `readLine()`,
  stranding an IO thread per visit to Settings → Family; now a 30s timeout plus
  `invokeOnCompletion { conn.disconnect() }`. Both platforms' tab editors let you
  remove the last bottom tab, persisting an empty `tabs` array.
- **CodeQL `js/incomplete-url-substring-sanitization` (#50).** The Paddle fetch
  stub in `accountDelete.server.integration.test.js` matched with
  `startsWith('https://api.paddle.com')`, which also accepts
  `https://api.paddle.com.example.net/`. Replaced with an exported `paddleTarget()`
  that compares the parsed `hostname` (and handles `Request`/`URL` inputs, which
  the old `String(url)` silently failed to match), plus 3 tests covering six
  spoofing shapes. A sweep found no other instance — the remaining
  `startsWith("https://")` calls are scheme checks, and `nextUrl.js` already
  rebuilds redirect targets from an allowlist.

- **A lapsed Family plan now freezes the household instead of doing nothing.**
  Expiry used to have almost no consequence: `capFor()` dropped to 0, but every
  read *and write* path kept working, so an expired Family kept a fully
  functioning shared household forever — the only thing that broke was
  inviting, which failed with a "your household is full" message that was
  simply untrue. Households now go **read-only** when the owner's entitlement
  lapses. `household.js` gains `isActive()` / `requireActive()` (owner's
  `householdMax >= 1`), applied to `shareEntity`, `updateEntity`, `rename`,
  `invite` and `acceptInvite`, all returning a new `household-inactive` → 403.
  Reads are deliberately untouched: `listSharedData`, `computeRollup` and the
  SSE stream keep serving everything, and **nothing is ever deleted**, so
  resubscribing thaws the household exactly as it was. Two paths stay open on
  purpose — `deleteEntity` (unshare), because trapping your own data in a
  household you can't manage is the wrong side to err on, and `leave`. The
  owner's entitlement governs, not the caller's: a member with solo Pro can't
  write to a lapsed owner's household. `viewFor()` now returns `active`, and
  the clients render the state rather than letting writes fail: web gets a
  read-only banner (`.hh-frozen`) with a Resubscribe button, hides the invite
  box and the share picker but keeps Unshare *and the pending-invite list*
  (revoking one still works, and links that can no longer be accepted are
  exactly what a lapsed owner wants to clean up), and the dashboard card's
  "Live" badge becomes "Read-only"; iOS (`HouseholdView.active` + `isFrozen`) and
  Android (`HouseholdView.active`, defaulting true so older payloads decode)
  get the same notice and the same `household-inactive` copy. Covered by
  `tests/integration/householdFrozen…` (6 cases, including the thaw and the
  solo-Pro member) and `client/js/householdFrozen.render.test.js`.
- **Admin can hand out Family, not just Pro — including by promo code.** The
  per-user grant sheet already offered every comp plan; what it didn't say is
  that `family` is the one that unlocks a shared household, so the option now
  reads "Family (shared household)" and the sheet explains the difference when
  it's selected. Promo codes couldn't reach Family at all: `POST
  /api/admin/promo` hardcoded a plain `free_sub` with a null `product_id`, and
  `planFor(null)` resolves to no plan, which means `householdMaxFor()` returns
  0. `billing.createPromoCode` now takes a `plan` and stores it as the same
  `comp:<plan>` product id admin grants use, so redemption flows through
  `planFor` → `computeEntitlement().householdMax` with no new column and no
  change to `redeemPromo`. The Promos tab gets a Plan picker (Pro / Family,
  defaulting the day count to 366 on Family), rows label their tier
  ("366d Family"), and `GET /api/admin/promo` serializes `plan` — null on codes
  minted before this, which keep granting solo Pro. Unknown plans are rejected
  with `bad-plan`.
- **Revoke now reaches promo grants, not just comp rows.** "Revoke comp Pro"
  called `deleteCompSubscription` alone, so a redeemed code was unrevokable —
  and the menu item only appeared for `proSource === 'comp'`, so for a
  promo-entitled user there was no revoke at all. `{ grant: false }` now also
  calls `dbApi.revokePromoGrants(id)`, and the item shows for either
  admin-issued source ("Revoke promo Pro" when that's the live one). Whether
  to offer it is decided by a new row-derived `revocable` flag on the
  serialized user, not by `proSource`: `computeEntitlement` reports only the
  entitlement that *wins*, so a store subscription outlasting a comp grant
  used to hide that grant from the console entirely. Rather
  than delete the redemption, a new `promo_redemptions.revoked_at` column
  (idempotent `PRAGMA table_info` migration, NULL on existing rows) drops it
  out of `activePromoGrants` while leaving it visible to
  `findPromoRedemption` — so a revoked user can't just redeem the same code
  again, and `max_redemptions` accounting stays honest. Store subscriptions
  are still never touched: those get cancelled at Apple/Play/Paddle.
  Covered by `tests/integration/adminFamilyGrant…` (7 cases, including that
  revoking leaves a live Apple subscription intact), which also mounts
  `routes/admin` in the integration harness for the first time.
- **The paywall body is reusable, and the Pro screen is now made of it.** Both
  native Pro screens duplicated the paywall's header and status card and then
  hid the paywall itself behind a button. The scrolling content — perks, plans,
  Family card, active-subscription card, manage, redeem, restore, legal — is
  extracted as `PaywallContent` (iOS `Paywall.swift`, Android `Paywall.kt`),
  with no presentation chrome: `PaywallView` / `PaywallDialog` wrap it in the
  sheet/dialog with the Close affordance for feature gates, and `ProView` /
  `ProScreen` render it directly under their own header. Android's takes the
  scrolling `Modifier` from the caller (`weight(1f).verticalScroll(…)` in the
  dialog, `fillMaxWidth().verticalScroll(…)` in the screen); iOS's carries the
  `billing.message` alert and the `loadProducts()` task so both entry points
  re-fetch — StoreKit can return `[]` at launch. `ProView`'s duplicate status
  card, plan/provider/renewal formatters and second redeem button are gone
  (the active card covers them), as are `ProScreen`'s. Feature gates
  (`ProLockedView` / `ProLockedScreen`), Household, onboarding and the debug
  trigger keep presenting the sheet/dialog — those interrupt something else.
- **Paywall footer is one block; Android drops in-app promo entry.** Restore,
  the store's auto-renew terms and the required 3.1.2 links were separated by
  the same 18dp/22pt that separates the cards, which read as dead space around
  three lines of fine print — they're now a single `Column` / `VStack(spacing:
  6)`. Android's "Have a promo code?" button is gone with its `showRedeem`
  state, and `RedeemCodeDialog` went with it as the only caller (the
  out-of-products copy no longer points at it either). **This leaves no in-app
  promo redemption on Android** — `POST /api/promo/redeem` and
  `AppViewModel.redeemPromo` are untouched, so the web path and the
  `source == "promo"` entitlement display still work, and restoring the button
  is a one-file revert. iOS keeps "Redeem an App Store code": Guideline 3.1.1
  requires Apple's own sheet there and forbids taking a code by hand.
- **The Family upsell prices itself from the store.** `HouseholdScreen`'s
  `familyPriceLabel()` (Compose) and `HouseholdSettingsView.familyPriceLabel`
  (SwiftUI) read the Family SKU out of the live product list and render
  "$29.99 / year" above the button, falling back to nothing before the store
  answers and to a bare price for an unrecognised billing period. Android gains
  `BillingManager.periodUnit` for the bare unit; iOS reads
  `Product.subscription.subscriptionPeriod`. Deliberately not hardcoded: Play
  and the App Store charge $29.99 where the web's Paddle price is $25.99, which
  `household.js` states literally.
- **Bank connections render inline in the Bank settings group.** Both native
  clients put the whole Plaid UI behind one more row: iOS pushed `BankView` from
  a `bankSection` whose only content was that link, Android opened `BankDialog`
  from a `NavRow`. iOS's `groupRow("Bank")` now navigates straight to `BankView`
  (retitled `Bank`, on the branded bar the other detail screens use) and
  `bankSection` is gone; on Android `BankDialog.kt` became `BankConnections.kt`,
  the `FormDialog` wrapper is now a plain `Column` carrying the dialog's own
  16dp/12dp so nothing shifts, and `SettingsScreen` renders
  `Section("BANK") { BankConnections(vm) }` with the `"bank"` dialog route
  dropped. Web was already flat (the `bank` tab panel), so it didn't change.
- **Three issuer marks retraced from the brands' own artwork**
  (`client/js/issuerLogos.js`, then `npm run sync:issuer-logos`). `usbank` was
  the bare 2023 shield (1.21:1, one flat path) and is now the full lockup
  (3.87:1) in three layers — red shield, the "us" knocked out of it, blue
  "bank"; `bilt` replaces the old wordmark (5.72:1) with the current BILT +
  brick lockup (4.02:1), white on a `#010912` plate carried as layer 0 so a
  white-on-dark mark still reads on the light plate the renderers give
  full-color marks; `carecredit` is new (1.26:1, three blades), so CareCredit
  resolves to a logo rather than the `ISSUER_MONOGRAM_COLORS` chip. Each was
  traced from the raster at 4x through a blur-then-threshold — the sources are
  hard-aliased, and tracing them raw spends a path segment per stair-step —
  cropped to its artwork bounds and emitted as relative path data rounded to
  the 0.01 grid, deltas taken between rounded values so nothing drifts. The
  bundled-mark count is **47** (`SVGPathChecks.swift`, `IssuerIconsTest.kt`),
  and the web tests that used CareCredit as the no-logo example now use Mission
  Lane.
- **History renders skips instead of filtering them out.** A skip is a `payments`
  record flagged `skipped` with `amount 0`; all three clients dropped it before
  grouping, so a period of nothing but skips rendered as empty and the flag was
  write-only. The filter is gone from `HistoryList.svelte`, `HistoryView.swift`
  and `HistoryScreen.kt`; rows take a `⏭` icon, a muted "Skipped" in place of the
  amount (`.hist-skipped` in `components.css`), and lose the Edit affordance —
  the pay editor refuses `$0`, so editing a skip could only convert it to a
  payment by accident. Totals key off the **flag, not the amount**
  (`totalFor`), so a malformed record can't inflate a month; `summaryFor` emits
  "$120.00 paid · 2 skipped" and drops either half when empty
  (`.hist-month-total-quiet`). Deleting a skip is the un-skip:
  `deletePayment` in `history.js` branches to a "Remove this skip?" confirm, and
  `confirmClearHistory` now says skips are cleared too. `exportCSV('history')`
  gains a **Status** column (`Skipped`/`Paid`) — otherwise a $0 skip and a $0
  payment are indistinguishable downstream. Empty state re-keys off
  `payments.length` now that the visible list is no longer a subset.
- **`.payoff-strat-card` reclaims `font`/`color` from the UA.** It's a `<button>`,
  so under `color-scheme: light dark` the inherited text was painted white on the
  planner's light surface.
- **Four docs moved to the gitignored `docs/local/`** — `native-contract.md`,
  `push-setup.md`, `social-login-setup.md`, `competitive-roadmap.md`. They carry
  unreleased roadmap detail and setup notes that don't belong in a
  source-available repo. The README links that pointed at them were left
  dangling by the move and would have 404'd on GitHub; they're now unlinked
  prose, in the root, iOS and Android READMEs.
- **`scripts/dev/paddle-webhook-check.js`** (`npm run paddle:webhook`) drives the
  Paddle webhook handler with a genuinely HMAC-signed payload naming a real local
  account. Paddle's dashboard "Send a test" proves reachability and signature
  only — its synthetic payloads carry no `custom_data.userId`, so attribution and
  fulfillment (resolve user → upsert subscription → recompute entitlement) went
  untested. Not wired into the app.
- **The cards summary says whose number the hero is.** "Still owed this period"
  read as a demand from the issuers, but it's the paid-goal policy's figure —
  a promo card contributes `promoBalance / monthsLeft`, a 0%-APR card only its
  minimum — so it can legitimately exceed or undercut the statement total sitting
  right below it, which made the tile look like a broken sum. The hero is now
  **"Your plan this period"**; the `due` row is renamed **`statement due`**,
  dropped entirely when it agrees with the hero (real duplication), and otherwise
  reconciled by a `.cards-summary-hint` line naming the gap in either direction.
  The caption counted every card including $0/skipped/paid ones, describing
  neither figure; it now reads "across N of M cards" (or "all M cards paid this
  period"). Ported to `CardsView.swift` and `CardsScreen.kt`, which mirror the
  web tile.
- **`monthsUntil` / `daysUntilDate` read a stored date as a calendar day.** Both
  passed a bare `YYYY-MM-DD` to `new Date()`, which parses it as **UTC** midnight,
  then read it back with the local getters — so anywhere west of UTC a promo
  ending on the 1st resolved to the month before. `promoNeeded` then divided the
  balance by one month too few, inflating the recommended payment, the "still
  owed" hero and the payoff plan. Both now parse the parts into a local midnight
  via `parseLocalDate`; strings carrying a time still go through `Date` untouched.
  Native was already correct (`DateLogic.monthsUntil` takes an explicit `tz`).
- **A rollover is now account state that outlives being *seen*.** `lastVisitKey`
  is synced and written on every load, so the first platform to open in a new
  month consumed the prompt: every other platform then saw `lastMk == currentMk`
  and the review only ever appeared wherever you logged in first (in practice:
  the web). Detection now *records* the rollover in two new synced settings —
  `rolloverPendingFor` (the month that opened) and `rolloverPrevKey` (the month
  that closed, which the "never marked paid" list is computed against) — and only
  an explicit dismiss or a save clears `rolloverPendingFor`. All three clients
  render the prompt from `rolloverPendingFor == currentMonthKey`, so it shows up
  on every device and goes away on every device.  `lastVisitKey` still tracks the
  last month opened and still drives detection. Ports:
  `Settings.rolloverPendingFor` / `.rolloverPrevKey` (iOS),
  `JsonObject.rolloverPendingFor` / `.rolloverPrevKey` (Android),
  `clearRolloverPending()` in `client/js/rollover.js`.
- **Rollover review UI.** Web `rollover.js` renders class-based rows
  (`.rollover-row` / `.rollover-field` / `.rollover-edit` in `components.css`)
  instead of inline styles with a bare `<input type=number>`, which inherited the
  UA's `color-scheme: dark` chrome inside a light modal. Each row gains the
  reviewed month's due date (`nextBillDueDate` anchored to the 1st, so a bill due
  on the 5th still reads "Aug 5" on the 20th), an autopay/late variant, and an
  Edit button that stashes the typed values, hands off to `editBillById`, and
  reopens the review from a `MutationObserver` on `#bill-modal` — the edited row
  re-prefills from the bill's new amount. The list carries a count, a scroll hint
  and a `has-more` fade toggled by scroll position. `saveRolloverReview` now
  hides `#new-month-banner`, `refreshAll()`s and toasts.
  `AppStore.rolloverDueDate` (iOS) and `AppViewModel.rolloverDueDate` /
  `rolloverIsLate` / `rolloverPrefillText` (Android) are the ports; both native
  reviews gained the date line and a per-row edit sheet/dialog, and both dismiss
  the prompt on save. Covered by `client/js/rollover.render.test.js`.
- **`reminderOffsets`: reminder lead days become a list.** New synced setting —
  `number[]` of `0..14`, deduped, clamped, sorted longest-first, capped at 5
  (`MAX_REMINDER_OFFSETS` / `Settings.maxReminderOffsets`). It supersedes the
  scalar `reminderLeadDays` + boolean `remindOnDueDay`, which every writer still
  mirrors (`max(offsets)` and `offsets.includes(0)`) because `PUT /api/data`
  replaces the whole record — an app build that predates the array would
  otherwise save its stale scalar back over the list. Read order is the same on
  all four platforms: the array wins if present; an **empty** array means "no
  reminders" and deliberately does *not* fall back; absent falls back to the
  legacy pair. `server/scheduler.js` exports `reminderOffsets(settings)` and
  drives bill, trial, and card-offer reminders through it;
  `Settings.reminderOffsets` (iOS, with the mirror in its setter),
  `JsonObject.reminderOffsets` + `withReminderOffsets` (Android), and
  `leadsFromSettings` in `client/js/settings.js` are the ports. Native local
  notifications (`NotificationScheduler.swift` / `.kt`) schedule one request per
  offset, as before — they just read the list now.
- **Reminder-day UI, per platform.** Web: a `.lead-chip` multi-select (real
  checkboxes, visually hidden, `is-active`/`is-disabled` mirrored in JS so the
  styling doesn't depend on `:has()`) replacing the `<select>` and the due-day
  switch. iOS: a new `ReminderDaysView` behind a `NavigationLink`, replacing the
  menu `Picker` + `Toggle`. Android: `LeadDaysDialog` becomes a multi-select
  with a `leadSummary` on the `NavRow`. All three lock the *unpicked* options at
  the cap, so a tap is never silently dropped, and warn when the list is empty.
- **Emails re-skinned onto the product's tokens.** `server/emails.js` swaps its
  hand-rolled palette for the values in `client/css/tokens.css` (light and the
  `prefers-color-scheme: dark` block both), adds Manrope via `@import` with the
  system stack inline as the honest fallback, sets amounts in IBM Plex Mono to
  match `.mono`, and heads every message with `brandBlock()` — the mark as a
  hosted PNG (`client/public/email-logo.png`, rasterized from `icon.svg`;
  no client renders SVG reliably) beside a live-text wordmark, so an inbox with
  images off still shows the brand.
- **Guideline 3.1.1: iOS carries no custom promo-code entry.** `RedeemCodeView`
  (the "e.g. FREEPRO30" text field), both `showRedeem` sheets, and the "Have a
  promo code?" / "Redeem a code" buttons are deleted from `Paywall.swift` and
  `ProView.swift`; the remaining "Redeem an App Store code" button calls
  `StoreManager.presentOfferCodeSheet()` →
  `AppStore.presentOfferCodeRedeemSheet(in:)` directly. The plumbing behind it
  went too — `StoreManager.redeemPromo`/`promoError`, `APIClient.redeemPromo`,
  `PromoResult`, `StoreOffer`, `PromoRedeemBody` — so no in-app redemption path
  ships in the binary at all. `POST /api/billing/promo/redeem` is untouched and
  still serves web + Android; `source == "promo"` still renders as "Promo Code"
  in the Pro status card, since a code redeemed elsewhere is still the account's
  Pro source.
- **Guideline 5.1.1(v): OAuth-only accounts could not delete themselves.**
  `createOAuthUser` stores `OAUTH_SENTINEL_HASH` (`!oauth-no-password`), so the
  `verifyPassword` gate on `POST /api/account/delete` was unsatisfiable for every
  Sign in with Apple / Google account — the in-app delete existed but could not
  complete. The route now branches on the new `dbApi.userHasPassword(row)`:
  password accounts re-enter their password as before, passwordless ones must
  send `confirm: "DELETE ACCOUNT DATA"` (case-insensitive) or get `400
  confirm-required`. TOTP re-confirmation, Plaid item revocation and the cascade
  delete are unchanged and apply to both paths.
- **`hasPassword` on `GET /api/auth/me`** (`dbApi.userHasPassword`) drives the
  client side of that: iOS `DeleteAccountSheet` and Android
  `DeleteAccountDialog` drop the password field when it's false and post the
  typed phrase as `confirm` (`DeleteAccountBody` on both, replacing
  `PasswordCodeBody` for this call only); `client/js/settings.js` hides the
  delete-password field and the whole change-password card. Absent flag decodes
  as `true` on every client, so older payloads keep today's behaviour.
- **Delete-account entry points.** Added to the Account section of iOS
  `SettingsView.accountSection` and Android `SettingsScreen`'s ACCOUNT group,
  alongside the existing Data-section button. "Change password" is now gated on
  `hasPassword` in both, since `POST /api/account/change-password` re-checks a
  password these accounts don't have.
- **`tests/integration/accountDelete.server.integration.test.js`** (5 cases)
  covers `hasPassword` on `/me` for both account kinds, password-account delete
  and wrong-password rejection, and OAuth-account delete with / without the
  confirm phrase. `helpers/testServer.js` now mounts `/api/account` — it wasn't
  mounted before, so nothing in `routes/account.js` had integration coverage.
- **iOS: a 401 no longer means "session expired" unconditionally.**
  `APIClient.send` threw `.unauthenticated` for *every* 401 before reading the
  body, so the twelve distinct 401 codes the server sends — `wrong-password`,
  `invalid-credentials`, `invalid-totp-code`, `passkey-verify-failed` and the
  rest — were all rendered as "Your session expired. Please sign in again." It
  now decodes the code first and only maps a bare 401, or an explicit
  `unauthenticated`, to session loss; the rest keep their code and get their own
  message (several added to `APIError.userMessage`, previously unreachable).
  Android's `ApiClient` already did this — iOS had drifted. Guarded by new
  checks in `APIChecks.swift`.
- **`AppEnvironment.authNotice` + `FormNoticeBanner`** carry the post-deletion
  confirmation ("Your account with <email> has been deleted. No turning back.")
  to the auth screen in green rather than as a red error, since a successful
  deletion isn't a failure. `didDeleteAccount(email:)` captures the address
  before the session is torn down; `runAuth` retires the notice on the next
  sign-in attempt.
- **Google sign-in failures are surfaced.** `AuthView.handleGoogle` discarded
  every `GIDSignIn` error with a bare `guard … else { return }`. It now
  distinguishes a user cancel (silent), an SDK error (on-screen message, domain
  + code logged) and a missing ID token. This is what turned a silent dead
  button into a diagnosable "keychain error" in testing.
- **Paddle cancel: only "already gone" counts as success.** `entity_not_found`,
  `subscription_update_when_canceled` and a bare 404 mean there is nothing left
  to charge; every other 4xx (401/403 on a rotated key, 422 on a bad request)
  leaves the subscription live and is recorded in `failed` instead of being
  swallowed.
- **Paddle subscriptions are cancelled during account deletion.**
  `POST /api/account/delete` now calls
  `billing.cancelPaddleSubscriptionsForUser` (→ new
  `paddle.cancelSubscription(id, 'immediately')`, `POST
  /subscriptions/{id}/cancel`) before `deleteUser`. The `subscriptions` row
  cascade-deletes with the user, but that row is only our bookkeeping — the
  subscription itself lives at Paddle, and an account deletion left it renewing
  against a customer who no longer had a portal to cancel from. Best-effort like
  the Plaid revocation: a 4xx (already cancelled at Paddle) counts as success, a
  5xx is logged with the subscription id and never blocks the deletion. Store
  subscriptions are untouched — Apple and Google only allow the user to cancel.
- **Backup retention is now stated as a number.** `data-retention-policy.md`
  (v1.2), `/delete-account` and the Privacy Policy all say weekly whole-server
  snapshots with the 2 most recent retained (≈14 days), disaster-recovery only
  and never used to restore an individual account — replacing "aged out on a
  defined cycle", which told a user asking "when is my data actually gone?"
  nothing.
- **Public `/delete-account` page** (`client/delete-account.html`, wired into
  `vite.config.js` rollup inputs + both `.html`→clean-URL redirect maps,
  `public-footer.js`, `sitemap.xml`, and linked from `privacy.html` and
  `terms.html#delete-account`). Google Play's account-deletion policy wants an
  in-app path *and* a web link resource, "prominently featured and easily
  discoverable", declared in the Data safety form — Play Console's URL field now
  has something correct to point at. Content is verified against the schema:
  every table claimed as deleted (`user_data`, `households`,
  `household_members`, `push_devices`, `user_totp`, `user_backup_codes`,
  `user_passkeys`, `sessions`, `subscriptions`) is `ON DELETE CASCADE` from
  `users` with `foreign_keys = ON`.
- **Push: authorization is requested where it's enabled, not assumed.**
  `AppStore.setPushNotifications(true)` (`AppStore+Edits.swift`) now awaits
  `NotificationScheduler.requestAuthorization()` before
  `PushRegistrar.setEnabled(true)`. APNs issues a device token without
  authorization but iOS *displays* an alert payload only with it, so the previous
  order produced a device the server sent to and a user who saw nothing —
  specifically anyone who enabled push without first enabling local reminders.
  `syncIfNeeded` adds a catch-up that prompts only on `.notDetermined`, so a
  deliberate "Don't Allow" is never re-asked.
- **Push: APNs registration failures are recorded.**
  `didFailToRegisterForRemoteNotificationsWithError` logs the `NSError` domain +
  code (not just `localizedDescription` — the entitlement failure that kept iOS
  push dead reads only as a bare "no valid 'aps-environment' entitlement string
  found") and persists it to `PushRegistrar.lastFailure` under
  `fh_push_last_failure`, cleared on the next successful token. Diagnostic only;
  nothing branches on it and nothing surfaces it in the UI yet.
  `noteRegistrationFailure` also fires `onRegistrationSettled`, since with no
  token `sync()` returns early and the reschedule would otherwise wait forever on
  a registration that already failed.
- **Push: Android notification channel, three places.** A backgrounded FCM
  notification payload is drawn by the system, and with no channel named FCM
  silently substitutes its own "Miscellaneous" — escaping the user's "Bill
  reminders" settings, and dropped outright if that stray channel was muted.
  Fixed at all three: `default_notification_channel_id` in `AndroidManifest.xml`,
  `android.notification.channelId` on the server payload in `server/push.js` (so
  already-installed clients are covered, not just builds shipping the new
  manifest), and `ensureChannel(context)` moved *above* the `localNotifications`
  gate in `NotificationScheduler` — it backs server push too, so creating it only
  for local reminders left every push-on/reminders-off user in an unnamed channel.
  All three must match `NotificationScheduler.CHANNEL_ID` (`bill-reminders`).
- **Push: `sendToUser` reports what it couldn't do.** A registered device on a
  platform with no configured transport now increments an `unready` count and
  warns, instead of being skipped silently while `configured()` reported healthy
  because *some* transport was up. Stale-token prunes are logged with the
  provider's code/reason before `deletePushDeviceByToken` — that was the one
  failure leaving no trace at all (row gone, send "successful", device quiet
  until it re-registers), which is what made the outage undiagnosable from the
  server. Covered by new cases in `server/push.test.js`.
- **Refund policy rewritten around the store windows** (`client/refunds.html`
  §3–4, with `client/terms.html` and `client/pricing.html` brought in line and all
  three re-dated Jul 29): Play's 48-hour self-service window and the
  post-48-hour handoff to us, Apple's absence of a published window and our
  inability to issue or appeal an App Store refund, the EU/EEA/UK withdrawal
  right sitting against the store as seller, Paddle Buyer Terms + privacy links
  with a "where ours gives you more, ours applies" precedence note, and Paddle's
  60-day tax/VAT-only refund path. Adds the commitment that an Apple refusal we
  disagree with is made good with equivalent Pro access.
- **Dependencies** — `engines.node` `>=24.18.1`, `better-sqlite3` 13.0.2.
- **Issuer marks are layered and can be full color.** `ISSUER_LOGO_PATHS`
  (`client/js/issuerLogos.js`) entries are now one of two shapes: monochrome
  (`{ c, d }` — a single recolorable path, unchanged) or full color
  (`{ c, w, l }`, where `l` is `[fill, d]` layers painted in order and `w` is the
  viewBox width). Every mark is authored 24 tall, so `w / 24` is the aspect ratio;
  `issuerLogoIsFullColor()` and `issuerLogoAspect()` are the accessors, and
  `issuerLogoDataUri(entry, fill)` ignores `fill` for a full-color mark rather
  than flattening it to one color. `issuerIconInfo` / `issuerIconMark` carry
  `fullColor` and `aspect` through to the renderers.
- **`scripts/sync-issuer-logos.js` no longer parses the table line by line** — it
  lifts the object literal and evaluates it, since an entry now spans several
  lines, and validates each one (exactly one of `d`/`l`, `#RRGGBB` fills,
  positive `w`) so a format drift throws instead of silently dropping issuers.
  The generated `IssuerLogo` in `IssuerLogos.swift` / `IssuerLogos.kt` gained
  `width`, `isFullColor`, `layers: [IssuerLogoLayer]` and an `aspect` accessor,
  replacing the single `path`. Run `npm run sync:issuer-logos` after editing the
  web table; `--check` fails the build when the generated files are stale.
- **Renderers stack layers and honor the aspect ratio.** `IssuerLogoShape` takes
  a `viewBoxWidth` and scales uniformly against it; `IssuerLogoView` draws a
  `ZStack` of layers for a full-color mark, and Android's `IssuerLogoMark` adds
  one `addPath` per layer to a single `ImageVector` with `viewportWidth =
  logo.width`. Width is capped at `1.75x` the height on all three platforms
  (`maxAspect` / `MAX_LOGO_ASPECT` / `max-width` in CSS), which is what the web's
  48x32 `.card-row-chip` allows a 24px-tall mark. Full-color marks skip
  `BrandColor.legible` tinting and get a plate instead: `Theme.logoPlate`,
  `CtColors.logoPlate`, and `.card-row-chip.is-plate` / `.icon-mark-plate` —
  white in both themes on purpose.
- **Provenance and licensing.** The 9 new marks come from Wikimedia Commons
  public-domain (PD-textlogo) files, listed per key in the `issuerLogos.js`
  header; the existing 37 are Simple Icons (CC0). Each new mark was flattened to
  plain fill+path layers (no transforms, groups, clips, gradients or CSS),
  **cropped to its measured fill bounds**, then scaled onto the height-24 grid —
  Bilt's source file had padding that left the artwork filling 57% of its box.
- **Substring matching can now be blocked per key.** `LOGO_KEY_CONFLICTS` /
  `logoKeyConflicts` (web, Swift, Kotlin) stops a short key from matching inside
  an unrelated brand: `citi` is skipped when the name contains `citizen`. Only
  the loose substring pass is blocked — an exact key or alias hit still wins. The
  `capital` → `capitalone` alias was dropped for the same reason (`capitalone` is
  now an exact key, and the alias fired on "Capital City Bank"). New aliases:
  `citicards`, `citigroup`, `barclay`, `barclaycard`, `centurion`.
- **Monogram tables shed the issuers that gained logos** (citi, capitalone,
  usbank, bilt, bestbuy, lowes) and gained `missionlane`, `aven`, `opensky`,
  `indigo`, `lmcu` with curated colors, plus `ML` / `LM` / `OS` text overrides.
  Keep overrides to 2–3 characters: the chip is 21px on web and 22pt/dp on
  native, and only iOS shrinks text to fit.
- **Check-suite note** — `SVGPathChecks` now walks every layer, and asserts a
  full-color mark's geometry fills the viewBox it declares (the crop guarantees
  it; hand-authored Simple Icons glyphs legitimately don't touch every edge). Its
  box-containment tolerance is 3 units because `bounds()` includes Bézier control
  points, which sit outside the painted shape by design — Capital One's swoosh
  reaches 2.7 above its own top edge.
- **Pay targets** — new `payTargetAmount(kind, type, refId, mk)` /
  `payTargetRemaining(...)` in `client/js/utils.js`, mirrored as
  `Schedule.payTarget(_:card:paid:tz:)` / `payRemaining(...)` in
  `Schedule.swift` and `Schedule.kt` (three-way mirror, change together).
  Kinds: `full` (a bill's amount) · `minimum` · `recommended` · `monthly` (a
  loan's scheduled payment) · `payoff` (the whole start-of-period balance).
  Balance-derived targets are computed against the card *as it stood at the
  start of the period* (`cardAtPeriodStart` adds this period's payments back to
  `balance`/`promoBalance`, since `applyCardPaymentDelta` decrements both), so
  the target holds still and only the remainder moves. `goalAmountFor` /
  `Schedule.goalAmount` are now thin selectors over these kinds — the
  policy→target mapping (`minimum`→minimum, `full`→payoff,
  `recommended`→recommended, loans→monthly) lives in one place instead of being
  re-derived per platform. Side effect worth knowing: a partially-paid 0% promo
  card's goal is now measured from the start-of-period promo balance, so it no
  longer drifts down mid-period as installments land (matching what the `full`
  policy already did).
- **Pay presets are period-aware** (`buildPayPresets` in `client/js/modals.js`,
  `PayView.presets`, `PayDialog`): each chip's amount is
  `max(0, target - paidThisPeriod)`, a chip whose target is already met is
  dropped, and the sub gets `· $paid of $target paid` when payments have shrunk
  it. The prefill no longer falls back to the full goal once the goal is met (it
  starts empty / 0), and `confirmPay` now refuses a `$0` record — the web save
  button had no amount guard, unlike iOS/Android. `recommendedAmount` is no
  longer called directly by any UI; it's reached through the `recommended`
  target.
- **`CardsList.svelte`**: the "Suggested" stat reads
  `payTargetRemaining('recommended', …)` and hides below a cent, with a
  "still, after $X paid" sub-line. iOS/Android card rows only render their
  suggestion in the `unpaid` state, where paid is 0, so they needed no change.
- Tests: 6 cases in `client/js/utils.test.js`, a `payTarget / payRemaining`
  section in `LogicChecks.swift` (811/811), and
  `payTargetHoldsStillWhileRemainderShrinks` in Android `LogicTest.kt`. Plus a
  new jsdom integration test —
  `tests/integration/payPresets.client.integration.test.js` with a
  `payModalDom.js` fixture — driving the real `openPayModal` / `confirmPay`
  against the modal's markup: chip set, sub text, prefill and the `$0` guard.

- **`go()` in `client/js/auth.js`** (CodeQL #48 `js/xss` high, #49
  `js/client-side-unvalidated-url-redirection` medium — both the same sink,
  `window.location.replace(url)`): `nextUrl.js`'s `safeNextPath()` already
  rebuilt `?next=` from `ALLOWED_PATHS` with a re-encoded query/hash, and that
  logic is sound — but the guarantee sat a module away from the navigation, and
  `go()` is also handed `/verify-email`, a `?household=` hand-off and
  `loginWithNext()` output. CodeQL couldn't carry the sanitizer across
  `URLSearchParams` round-tripping and the cross-module hop, and it was flagging
  a real gap in *locality*: nothing at the sink asserted same-origin. New
  exported `SAFE_NAV_TARGET` regex in `nextUrl.js`, `.test()`ed **inline in
  `go()`** so the guard dominates the sink in the same function (a cross-module
  guard is what failed before). Anchored, single leading slash via `(?!\/)`, no
  `:`/`.`/`\` in the path — `javascript:`, `data:`, `//evil.example`,
  `/\evil.example` and traversal all fail. Rejected targets fall back to `/`.
- Tests: 6 cases in `client/js/nextUrl.test.js` covering every value auth.js
  actually navigates to, both attack halves, and a consistency check that
  everything `safeNextPath()` approves also survives the sink gate — the two
  validators drifting apart would break legitimate deep links on arrival.
- **`brace-expansion`** 2.1.2 → 5.0.8 (Dependabot #3, high — unbounded
  expansion → OOM), pulled up transitively by the new `rimraf: ^6.1.3` entry in
  `package.json` `overrides`. `npm audit` reports 0 vulnerabilities.

- **`cashflowHistory.js`** (+ `CashflowHistory.swift` / `.kt`, three-way mirror,
  change together): merges the two outflow stores into one monthly spending
  figure. `transactions` (purchases, manual + `source:'plaid'`) and `payments`
  (bills / card payments) overlap, so summing them double-counts. Rules:
  **card payments are transfers** and never count — the purchases they settle
  are already transactions on that card — but each month reports
  `cardPaymentsExcluded` so the figure is disclosed rather than silently
  dropped; **bill payments count**, minus any matching a logged transaction via
  `reconcile.js`'s `looksSame` (same amount, containing merchant/name ≥3 chars
  normalized, ±1 day — it under-matches rather than over-matches, and an unnamed
  transaction never absorbs a bill); each transaction backs at most one payment.
- **`blind` months**: a month with card payments but no transactions, or no
  records at all inside the window, carries `blind: true` rather than
  `spending: 0`. A fabricated zero would read as a surplus month. Consumers must
  break the line, exclude it from averages, and label it — all three do.
- **Window clamping**: `monthlyIncomeForMonth()` derives income from *current*
  settings for any month (only `incomeAdjustments` vary), so it projects back as
  far as `membershipMonths` (≤240) while transactions only exist from first use.
  `cashflowSeries()` clamps its start to the first month with an outflow record;
  rows carry `incomeProjected: true` so the UI can caption that income is
  derived, not measured. Flip that flag if income ever gains per-month history.
- **`CashflowChart.svelte` / `CashflowChartView.swift` / `CashflowChart.kt`**:
  two lines on one **zero-based** axis — unusual for a trend line, but the read
  is the *gap*, and cropping the axis would inflate it out of proportion. Two
  series rather than one net line: a net line collapses "earned more" and "spent
  less" into identical movement. Blind months break the spending path (runs of
  consecutive accounted months, one sub-path each) and get a shaded column;
  income stays continuous, being known for every month. The axis ceiling snaps
  to a 1/1.5/2/2.5/3/4/5/6/8/10 ladder — a coarse 1/2/5/10 one strands a $7.3k
  series under a $10k ceiling. The Compose version draws its axis labels inside
  the `Canvas`: laid out as sibling composables they anchor to their own slots
  and drift off the gridlines they label.
- **`--chart-income` / `--chart-spend`** tokens (`tokens.css`, `Theme.swift`,
  `Theme.kt`, documented in `docs/native-contract.md` §8). **Not** green/red:
  validated with the dataviz palette checker, that pair separates by ΔE **2.1**
  under deuteranopia on the dark surface — effectively one color. Blue/orange
  holds ΔE ≥ 26 across both modes and every simulated CVD type. Dark steps are
  chosen against the dark surface, not flipped from light (the light steps sit
  above the dark-mode OKLCH lightness band 0.48–0.67).
- **`IncomeHistory.svelte` / `HistoryView.swift` / `HistoryScreen.kt`** become a
  cash-flow panel when any spending exists, falling back to the income-only
  track list otherwise. The month list survives as the chart's table view
  (income / spending / net, newest first), which is also what keeps the figures
  screen-readable. Averages run over non-`blind` rows only.
- Tests: `client/js/cashflowHistory.test.js` (16), mirrored one-to-one by
  `CashflowHistoryChecks.swift` (26 checks, registered in `main.swift`) and
  `CashflowHistoryTest.kt` (14) so a behavioral drift on any platform fails
  somewhere.

- **Card amounts (due / current / owed)**: a card carries three figures that
  were previously conflated. `balance` is the **statement** balance (what's due;
  `applyCardPaymentDelta` decrements it), `currentBalance` is the optional
  **live** balance including post-statement charges, and the **owed** figure is
  this period's remaining goal under `paidGoal`. Utilization was computed from
  `balance`, so a card with a $0 statement and a live balance read 0%. New
  shared helpers resolve all three together — `liveCardBalance()` (current when
  tracked, statement otherwise; a stored `0` is honored, only null/`''` counts
  as unset) and `cardAmounts(card, mk)` in `client/js/utils.js`, mirrored by
  `Schedule.liveBalance` / `Schedule.amounts` → `CardAmounts` in `Schedule.swift`
  and `Schedule.kt`. Every utilization and debt total now reads `live`:
  `CardsList.svelte` (per-card, the summary tiles, the payoff lump, the
  has-a-balance filter and largest-balance sort), `DashboardView.svelte` (card
  debt tile + the ≥80% alert), `CardsView.swift` and `CardsScreen.kt`.
- **`settings.cardHeadline`**: new key, `"due"` (default) | `"current"` |
  `"owed"`, choosing which amount leads a row. Read via `cardHeadlineMode(s)`
  (`utils.js`), the typed `Settings.cardHeadline` accessor (`Settings.swift`)
  and the `JsonObject.cardHeadline` extension (`Settings.kt`) — all three
  normalize unknown values to `"due"`, so an older client that has never heard
  of the key round-trips it untouched and renders the default.
  `otherAmounts()` returns the two it isn't leading with, in a stable order:
  the preference re-ranks the three, it never hides one.
- **Web card row**: the header is now `.card-row-headline` (identity | corner
  block), with the amounts in `.card-row-duebox` — `.card-row-duebox-head` puts
  the label on the figure's baseline, and each companion is its own
  `.card-row-duebox-alt` row (the separate caption line is gone; `amountLabel()`
  folds the due date into the "due" label instead, since the meta badges carry
  only the countdown). Since every money figure lives there, the stats grid
  dropped its balance stat and keeps the credit line's facts (limit / min /
  suggested / utilization); a loan renders no stats row at all, its two figures
  already being in the corner. The issuer chip went 42×28 → 48×32 (21px inner
  mark), and 20 → 24 pt/dp on iOS/Android.
- **Summary, two zones**: `.cards-summary--zones` replaces the five-tile row on
  the Cards tab with an obligations tile (hero + `.cards-summary-rows` itemizing
  due / current / minimums in the card rows' vocabulary) beside a single credit
  tile (utilization %, used-of-limit, available, bar — `Total credit` and
  `Overall utilization` were two halves of one idea). The bar is pinned with
  `margin-top: auto` so the shorter tile's edge lines up. `CardsSummaryCard` /
  `cardsSummaryHeader` mirror it natively with a `HorizontalDivider` / `Divider`
  between the zones and grouped sub-stacks rather than one even 10dp rhythm.
  Dropped `CARD_AMOUNT_LABELS` (the rows compose their own labels now) and the
  long-dead `promoCount`.
- **Settings UI**: a "Cards" section in the Payments panel
  (`client/settings.html` + `initCardHeadlineSection` in `client/js/settings.js`,
  following the `paidgoal` pattern — the partial snapshot is safe because
  `PUT /api/data` leaves absent lists alone), `CardHeadlinePicker` in
  `SettingsScreen.kt` (→ `AppViewModel.setCardHeadline`), and a segmented picker
  in `SettingsView.swift` (→ `AppStore.setCardHeadline`). `AppStore.cardAmounts`
  / `AppViewModel.cardAmounts` resolve a row's figures against the active period
  and policy.
- **Native layout notes**: `CardsScreen.kt` hoists the due countdown above the
  header — the footer text and the headline's color now read from one
  `daysLeft`, so they can't disagree. The two companion amounts stack one per
  line on iOS and Android: side by side they widened the trailing column enough
  to ellipsize the card's name at 360dp. The `Current: $X` chip left the
  utilization row on both, having moved into the corner.
- Tests: `client/js/utils.test.js` (`liveCardBalance`, `cardHeadlineMode` /
  `otherCardAmounts`, and `cardAmounts` — policy-driven owed, partial payments,
  skips, loans), a `Schedule — liveBalance / cardAmounts` section in
  `LogicChecks.swift`, and `liveBalancePrefersCurrentWhenTracked` /
  `cardAmountsSeparatesDueCurrentAndOwed` in `LogicTest.kt`. Verified on the
  Android emulator: all three headline choices re-rank the corner and persist.

- **Issuer marks, three tiers**: resolution is now **bundled logo → monogram
  chip → emoji** (`issuerIcons.js` ⇄ `IssuerIcons.swift` / `IssuerIcons.kt`),
  with loans keeping 🏦. `issuerLogos.js` carries 37 Simple Icons (CC0) marks —
  banks and networks, airline/hotel co-brands, retail/telecom and fintech —
  regenerated into `IssuerLogos.swift` / `IssuerLogos.kt` by
  `scripts/sync-issuer-logos.js` (CI runs `--check`; edit the web table, never
  the generated files). `ISSUER_ALIASES` grew shorthands (`goldman`) and loyalty
  programs (`aadvantage`, `skymiles`, `mileageplus`, `rapidrewards`, `trueblue`,
  `bonvoy`, `hiltonhonors`), since a card is often named for its program; only
  aliases of `MIN_ALIAS_SUBSTRING` (5) or longer may match inside a longer name,
  so `boa` / `usb` can't fire on an unrelated word. A `NETWORK_KEYS` mark
  (visa / mastercard / dinersclub / jcb) matched from the card's *name* now
  loses to the issuer's monogram — "Bilt Mastercard" is a Bilt card — while an
  issuer that IS the network keeps its logo.
- **Monograms**: new `client/js/issuerMonograms.js` ⇄ `IssuerMonograms.swift` /
  `IssuerMonograms.kt` — `issuerInitials()` derives initials from the issuer
  name (acronyms preserved: "U.S. Bank" → US; company suffixes dropped:
  "Synchrony Bank" → S) with curated overrides in `ISSUER_MONOGRAM_TEXT`
  (Capital One → C1), tinted from `ISSUER_MONOGRAM_COLORS` where we have a
  reading of the brand and a stable hash of `CARD_COLORS` otherwise — so **any**
  issuer a user types gets a mark. Carried as a new `CategoryIcon` case
  (`.monogram(text:color:emoji:)` / `CategoryIcon.Monogram`), keeping the emoji
  as the text-context stand-in, and rendered by `IconMark` on all three
  platforms (`.icon-mark-monogram` in `pages.css`, `IssuerMonogramMark` in
  `IconMark.kt`, `IssuerLogoView.swift`). `Theme.chip()` re-lifts an almost
  black brand color off the dark surface (1.6:1) after `BrandColor.legible`
  has already guaranteed the white initials read against it. Docs:
  `native-contract.md` iconography. Tests: `issuerIcons.test.js`,
  `IssuerIconChecks.swift`, `IssuerIconsTest.kt`.
- **`?next=` hardening**: `safeNextPath()` no longer filters the input — it
  **rebuilds** the target, so nothing an attacker writes reaches
  `window.location` verbatim. The path must equal a literal in `ALLOWED_PATHS`
  (`/dashboard`, `/settings`, `/plaid-oauth`, `/dev-portal`) and the match
  yields the list's copy, not the caller's; the query is re-encoded through
  `URLSearchParams`, dropping any pair failing `SAFE_KEY` / `SAFE_VALUE` and
  capped at `MAX_PARAMS` (8); the fragment must match `SAFE_HASH`. The fragment
  is split before the query, so a `?` inside a hash can't smuggle a parameter.
  Anything else returns `''` and the call site falls back to the dashboard.
- **Deps**: `rimraf` pinned to `^6.1.3` via `overrides` — v6 sheds the v5
  transitive tree (`glob`, `jackspeak`, `@isaacs/cliui`, `cross-spawn`,
  `string-width`, `foreground-child`, …), which is most of the ~400-line
  `package-lock.json` shrink; `bun.lock` synced.

- **Email templates**: `server/emails.js` `layout()` now emits a full document
  with `<meta name="color-scheme">` and a `<style>` block whose
  `prefers-color-scheme: dark` rules re-color by class. Inline styles keep the
  light palette as the base, so a client that strips `<style>` still renders
  the intended design rather than a broken one. New building blocks —
  `itemList()` (label / meta / right-aligned value rows), `statPanel()`
  (tinted totals), `chip()`, `preheaderBlock()` (hidden inbox preview) and a
  table-cell CTA that survives Outlook. Every notification sender takes a
  trailing `userId` (`scheduler.js` passes `u.id`); it is optional, and
  omitting it degrades to the sign-in-required settings link.
- **Unsubscribe**: new `server/unsubscribe.js` mints `<userId>.<kind>.<hmac>`
  tokens — stateless, so nothing has to be stored or swept, and stable for the
  life of the address. `kind` is `reminders|digest|summary|offers|all` and maps
  to the settings flags to clear, so an opt-out is scoped to the email it came
  from. The signing key is HKDF-derived from the master key via the new
  `mfa.deriveKey(label)`, so there is no extra secret to deploy. `apply()`
  rewrites the whole data blob (`upsertUserData` replaces the record — naming
  only `settings` would erase the user's bills).
- **Route**: `server/routes/unsubscribe.js`, mounted public at `/unsubscribe`
  with its own 30/min per-IP limiter. `GET /` serves the confirmation page and
  `GET /info` reports what the link covers; **neither mutates anything** —
  corporate link scanners follow URLs in incoming mail, and a GET that opted
  people out would silently kill their reminders. `POST /` applies it, and
  accepts both the page's JSON and the form-encoded
  `List-Unsubscribe=One-Click` body mail clients send (RFC 8058).
  `mail.sendMail` grew a `listUnsubscribe` option that emits the
  `List-Unsubscribe` / `List-Unsubscribe-Post` header pair.
- **Client**: `client/unsubscribe.html` + `client/js/unsubscribe.js` (new Vite
  entry) — confirm-then-apply, works with no session.
- **`?next=` hand-off**: the private-page gate moved out of `index.js` into
  `server/pageGate.js` (testable without booting the app) and now redirects a
  signed-out visitor to `/login?next=<target>` **when the URL carries a query**
  — a bare `/dashboard` still lands on the marketing page, so the funnel is
  unchanged. `client/js/nextUrl.js` validates the value before anything
  navigates — first by rejecting `//host`, `/\host`, any scheme, control
  characters and over-long input, and now by rebuilding the target from an
  allowlist (see *`?next=` hardening* above) — so `next` can't become an open
  redirect. `auth.js` consumes it in `postAuthHome()` (after the
  existing `?household=` invite path) and `initPrivatePage` mirrors the gate on
  session expiry — the client version can keep the `#hash`, which never
  reaches the server. `settings.js` accepts `?tab=` alongside `#hash` for the
  same reason, and the emailed preferences link carries both.
- Tests: `server/unsubscribe.test.js` (signing, tampering, blob preservation),
  new cases in `emails.test.js` / `mail.test.js`, and
  `tests/integration/unsubscribe.server.integration.test.js`, which walks the
  real loop: scheduler sends → link extracted from the sent body → POST →
  settings flip → next scheduler pass sends nothing.

- **Bank balance review, multi-bank fix**: the review queue lives in one
  settings key (`plaidBalanceProposals`), but `applyPlaidBalances` rebuilt it
  from only the accounts of the item being synced — so with two or more banks
  linked, each sync erased the previous bank's proposals and only the
  last-synced institution's cards ever had an Accept button. Replaced with
  `refreshBalanceProposals(userId)` in `server/routes/plaid.js`, which rebuilds
  across every linked item from the (just-saved) stored accounts, one proposal
  per card. New `storedAccount()` decodes a `plaid_accounts` row back into
  Plaid's own account shape — including `official_name`, which tier-3
  issuer+name matching reads — and `serializeItem` now shares it.
- **Bank balance review, stale-save fix**: `PUT /api/data` took the client's
  `settings` wholesale, so a client saving a snapshot taken before the last
  sync wiped the queue — and the one-hour sync throttle left the Accept buttons
  missing for up to an hour. `keepBalanceProposals` in `server/routes/data.js`
  now treats proposals as server-owned: it keeps the stored list minus whatever
  the client reports in `plaidBalanceResolved` (Accept and Decline both append
  there), and clears it outright when `plaidUpdateBalances` is off.
- **Dead account pins**: disconnecting a bank (or relinking one, which mints
  fresh Plaid account ids) left every card that pointed at it pinned to an
  account that no longer exists — and `matchCardToAccount` treats a pinned card
  as spoken for, so those cards were barred from matching again, permanently and
  invisibly. `matchCardToAccount` / `balanceProposals` now take the set of
  account ids the user actually has (`knownAccountIds`, the union across all
  banks) and ignore a pin that isn't in it. A pin to a live account at another
  bank still blocks auto-claiming, and omitting the set trusts every pin.
- **Stale account rows**: `saveAccounts` only ever upserted, so an account the
  user de-selected or closed kept its last-seen balance in `plaidAccounts`
  forever and went on being proposed. Added `dbApi.prunePlaidAccounts(itemPk,
  keepIds)` (`json_each`, scoped to the item) and a prune at the end of each
  save. An empty keep-list is a no-op, so a transiently empty accounts response
  can't wipe a working item.
- **Archived cards** are no longer proposed: the review queue could name a card
  that isn't on the Cards tab, which the user has no way to judge. An archived
  card also no longer makes its live replacement look ambiguous.
- **Picker cache**: `clearPlaidAccountCache()` existed but was never called, so
  the card editor's "Linked bank account" list was frozen for the life of the
  page — it offered a disconnected bank's accounts, and stayed empty for a bank
  linked after the cache was first filled. `refreshStatus()` now clears it.
- **Auto-matches are now written down**: matching by digits or issuer+name ran
  on every sync but was ephemeral, and only a *pinned* card is any use
  downstream — `cardForTransaction` resolves a bank charge by `plaidAccountId`
  alone, so an auto-matched card showed balance proposals while its purchases
  stayed unattributed, and the editor still read "Match automatically". New
  `autoLinkCards(userId)` writes a confident match onto the card, so spending,
  balances, and the picker all agree on one id. It runs on every sync
  regardless of the balance opt-in (attribution is a separate concern), never
  overwrites a pin the user made, skips archived and ambiguous cards, and
  repairs a pin left behind by a bank that's gone. Paired with
  `refreshBalanceProposals` under one `afterAccountsSaved(userId)` seam —
  pinning first, so proposals are built from the cards it just linked.
- **Overpaid cards were read as debt**: `proposedCurrent` was
  `Math.abs(balances.current)`, so a $50 credit balance (Plaid reports `-50`)
  was proposed as owing $50. New `owedFromBalances()` keeps a positive `current`
  as-is, and reads a negative one as a credit — unless `limit - available`
  (Plaid's own identity for a credit line) shows the issuer flipped the sign,
  in which case the magnitude is owed. Also fixes a `Number(null) === 0` trap
  that proposed "Current → $0.00" for an account whose balance the bank never
  reported (a stored snapshot writes absent figures as explicit nulls).
- **"Don't link this card"**: with matches now written down, "Match
  automatically" stopped being able to express a refusal — clearing the picker
  just invited the next sync to pin the card again, so a card the matcher got
  wrong could only be redirected, never excluded. The picker gains an explicit
  opt-out on all three clients, stored as the sentinel `plaidAccountId: "none"`
  (`NO_LINK` / `Card.noPlaidLink` / `Card.NO_PLAID_LINK`). `cardOptedOut()`
  withholds the card from every tier, and `linkIsLive` counts the sentinel as
  spoken-for so the dead-pin repair can't quietly undo it. It rides in the
  existing field rather than a new `plaidLinkOptOut` flag because native
  Bill/Card are fixed structs that strip unknown keys — a new key would be
  dropped by any client build predating it, reverting the opt-out on that
  device's next save.
- **Loan proposals surfaced on the wrong tab**: all three clients gated the
  review queue on `!isLoanView`, so a matched loan account appeared under Credit
  Cards and never under Loans. `BalanceProposal` carries `isLoan` on iOS and
  Android and the queue filters to the tab that owns the card; the web derives
  the same from the card's type. A proposal whose card is gone stays with Cards
  so it remains answerable.
- Tests: `server/routes/plaidProposals.test.js` (proposals span every linked
  bank, one row per card, resolved figures skipped, dead pin re-matches, live
  pin respected, unreported balance skipped, opt-out clears; plus nine
  `autoLinkCards` cases including the durable opt-out), new `plaidBalances`
  cases for dead/live pins, archived cards, the opt-out sentinel across all
  three tiers, and the full `owedFromBalances` sign matrix, plus a
  stale-settings case in
  `tests/integration/dataPartialSave.server.integration.test.js`.
- **Paddle (web billing)**: new `server/paddle.js` — REST client, webhook
  signature verification, and the notification-IP allowlist. Signature is
  HMAC-SHA256 over `"<ts>:<raw body>"` compared timing-safely against the raw
  bytes (re-serializing the parsed body changes key order and breaks it), with
  a replay window on `ts`. IPs come from `api.paddle.com/ips` and are cached,
  never hard-coded; an unfetchable list returns `null` ("unknown") and falls
  through to the signature rather than dropping real subscription events.
  `server/billing.js` swaps `STRIPE_PLANS`→`PADDLE_PLANS` (`PADDLE_PRICE_*`),
  `planFor` falls back to `paddlePlanForPrice`, and adds
  `recordPaddleSubscription` / `upsertFromPaddleSub` / `handlePaddleWebhook` /
  `createPaddlePortal`. `paddleStatusFor` maps `active|trialing`→active,
  `past_due`→grace, everything else→expired; a mid-period cancel arrives as
  `scheduled_change.action === 'cancel'`, which keeps access to the paid-through
  date while reporting auto-renew off. The Paddle customer id is stored in the
  subscription row's `raw` so `pwCustomer` needs no new column. Routes:
  `/api/billing/paddle/{config,checkout,portal,webhook}` plus the dev-portal
  mocks. `computeEntitlement` was already platform-agnostic and is unchanged.
- **Paddle (client)**: `pro.js` loads `cdn.paddle.com/paddle/v2/paddle.js` on
  demand, calls `Paddle.Initialize({ token, pwCustomer })` — `pwCustomer` is
  the Paddle customer id, which Retain requires — and opens
  `Paddle.Checkout.open({ items, customer, customData })`. The overlay closes
  without navigating, so `checkout.completed` polls entitlement rather than
  trusting the client. `custom_data.userId` is how a payment is attributed back
  to an account. Onboarding hands off to the Pro dialog instead of redirecting,
  since an overlay has no URL.
- **Removed**: the `stripe` dependency, `STRIPE_*` env vars, and every Stripe
  reference across server, client, tests, and docs. `.env.example` documents the
  Paddle set, flagging `PADDLE_API_KEY` as secret and the client token as public.
- Tests: 17 new in `server/paddle.test.js` covering tampered bodies, wrong
  secret, stale and future timestamps, malformed headers, missing secret, IP
  allow/deny, IPv6-mapped addresses, caching, and the deliberate
  fail-open-on-unknown behaviour.

- **Card↔account linking**: new `card.plaidAccountId` (iOS `Card.swift`,
  Android `Models.kt` — fixed structs, so the field had to be added or native
  sync would strip it) and `transaction.accountId` (`plaidMerge.toLocalTx`
  stamps Plaid's `account_id`). `plaidBalances.js` replaces the mask-only
  `cardMatchesMask` gate with `matchCardToAccount`, a three-tier resolver:
  explicit link → digits (`lastDigits`, Amex 4↔5) → `issuerMatchesInstitution`
  + `nameOverlaps` (alias table folds Amex/American Express, Chase/JPMorgan,
  BofA/Bank of America N.A.; stopword list keeps "card"/"credit" from counting
  as a match). The old `if (!m4) return` bail is gone, so a maskless account is
  matchable; a card pinned elsewhere is excluded from auto-claiming and a
  proposal still needs exactly one candidate. `balanceProposals` takes
  `{ institutionName }`, threaded from the item through `applyPlaidBalances`
  at all three call sites. Editors: `client/js/plaidAccounts.js` (cached
  `/api/plaid/status` loader, credit/loan only) + `fillBankAccountPicker` in
  `modals.js`, `CardEditorView.swift`, `CardsScreen.kt` — each keeps a stale id
  as a "previously linked" option so opening an editor can't silently drop a
  link. Attribution is read-time via `cardForTransaction` (`utils.js`), shown
  per-row in `SpendingPanel.svelte` and as a per-period total pill in
  `CardsList.svelte`. Tests: matching tiers, merge attribution, and the web
  helper. Docs: `native-contract.md` §6 Card. Ships in iOS **11** /
  Android **33**.

- **Ownership / licensing**: `LICENSE` is the Greigh Studios Source Available
  License v1.0 (Schedule A: repository, service, holder `Greigh Studios LLC`,
  contact `support@fihaven.app`). Copyright holder propagated to
  `client/*.html` footers, `client/terms.html` (provider, liability, governing
  law, source-code clauses) and `client/privacy.html` (controller),
  `client/contact.html`, `client/faq.html`, `server/emails.js` layout footer,
  iOS `AboutView` + `NSHumanReadableCopyright` (set in `project.yml`, since
  xcodegen regenerates `Sources/Info.plist`), Android Settings → About and the
  licenses sheet, `package.json` (`author`, SPDX `SEE LICENSE IN LICENSE`),
  `README.md`, `.github/CONTRIBUTING.md` (Section 2(d) contribution grant),
  `docs/source-available.md`, and the three compliance policies in `docs/`
  (owner + operating entity rows, bumped to v1.1). Store docs gained an App
  Store `Copyright` field and a seller-of-record pre-submit check.
- **Family SKU**: `BillingManager.FAMILY` = `app.fihaven.pro.family.yearly`
  (Play id is immutable; iOS keeps `app.fihaven.pro.family`); `server/billing.js`
  `DEFAULT_PRODUCTS` maps both ids to plan `family`. `basePhase()` reads the
  **last** pricing phase so a trial-bearing base plan prices/sorts correctly,
  and `launchPurchase` selects the offer with a $0 phase rather than
  `subscriptionOfferDetails.first()`. `createStripeCheckout` omits
  `trial_period_days` for `plan === 'family'`. `FiHaven.storekit` mirrors App
  Store Connect subscription-group levels (Family above Pro) so upgrades switch
  immediately instead of deferring; noted in `StoreManager` and
  `docs/native-contract.md`.
- **Deps**: `plaid` ^45, `svelte` ^5.56.8, `concurrently` ^10.0.4 (lockfiles
  synced).
- **Builds**: iOS `CURRENT_PROJECT_VERSION` 10, Android `versionCode` 32.

- **List spacing**: web `CardsList` / `BillsList` move payment status badges
  under the name (`card-row-status`); looser summary / search / meta gaps in
  `components.css` + `SortFilterBar`; actions column capped so buttons wrap
  instead of overlapping titles (#207). Native store builds: iOS **8**,
  Android **versionCode 31**.
- **Category icons**: `settings.categoryIcons` / `customIcons`; web
  `categoryIcons.js` + Settings picker; `IconMark` (web / iOS / Android);
  native `CategoryIcon` parse + `CTConstants.iconInfo(forCategory:)` /
  `iconInfoForCategory`; upcoming / bills / calendar / budget / dashboard
  resolve overrides; Vitest + FiHavenCoreChecks + Android `CategoryIconTest`
  / `ScheduleTest` coverage. Docs: `native-contract.md` iconography.
- **Issuer icons**: web `issuerIcons.js` + `issuerLogos.js` (Simple Icons SVG
  data URIs); native `IssuerIcons.swift` / `IssuerIcons.kt` (emoji only at this
  point — native gained the vector marks and monograms later in this release,
  see *Issuer marks, three tiers* above); Cards list chips + upcoming card rows;
  Vitest + `IssuerIconChecks` + `IssuerIconsTest`.
- **Deps**: `better-sqlite3` ^13.0.1 (`allowScripts`), `plaid` ^44; sync
  `package-lock.json` / `bun.lock`.
- **List search**: iOS `.searchable` on Bills / Cards / Subscriptions / Spending;
  Android `ListSearchField` + `matchesListSearch` in `SortFilter.kt`; web
  `SortFilterBar` search bind + panel filters (#200).
- **Paywall / store**: iOS `Paywall.swift` + Android `Paywall.kt` /
  `BillingManager` period labels; Privacy + Terms links; maintainer
  `store-listing-copy.md`, `store-launch-checklist.md`, `iap-promo/*` (#201).
- **Google OAuth (Android Custom Tab)**: `POST /api/auth/oauth/google/callback`
  creates handoff and **302**s to `fihaven://oauth/google?code=…`;
  `client/public/oauth-google-android.html` form POST (no fetch + JS intent);
  `docs/social-login-setup.md` updated (#199).
- **Deps / CI**: npm bumps (`better-sqlite3` 13, tailwind 4.3.3, svelte, vite,
  etc.); sync `package-lock.json` for `npm ci`; `allowScripts` for
  `better-sqlite3@13.0.1` (#202).
- **Onboarding**: web `welcome.html` / `welcome.js`; iOS `OnboardingView` /
  `IntroView`; Android `OnboardingScreen` / `IntroScreen` — four-step Goals /
  Plan / Security / Pro; `archiveInsteadOfDelete` on finish; tab ids capped to
  `MAX_BOTTOM_TABS` / `maxBottomTabs`.
- **Tabs**: Android `TabsDialog` draft + Save; short `TabId` nav labels +
  `a11yLabel`; More menu uses full names.
- **UI polish**: Spending / Household / biometric prefs (#197); Kotlin plugins
  pinned at **2.4.0** for CodeQL; AGP remains **9.3.0**.
- **Admin API** (`server/routes/admin.js`): suspend, reset-password, logout, delete,
  expanded `/pro`, `GET|POST /promo`, `POST /promo/:code/deactivate`;
  `users.suspended*` + `listUsers` join `user_data.updated_at`.
- **Billing**: `COMP_DEFAULT_DAYS` / `compDefaultDays()`; `comp:<plan>` product ids;
  Apple JWS verify path; Google Pub/Sub push verify; `requirePro` for iCal token.
- **OAuth**: `oauth_handoffs` table + `server/oauthHandoff.js`; App Link return
  `/oauth/{apple|google}`; `POST /oauth/:provider/handoff`; MFA challenge after
  federated login when enrolled; Custom Tab `appReturnUrl` prefers
  `fihaven://oauth/…?code=` (#194); Google form-POST callback (#199).
- **Plaid Link**: `createLinkToken` platform fields — Android `android_package_name`,
  iOS `/plaid` Universal Link, web `PLAID_REDIRECT_URI`; iOS
  `ActivePlaidLink.resumeAfterTermination` (#195).
- **Rewards**: `client/js/cardPresets.js` `shippedRewardRate` / `presetRateForCategory`;
  FiHavenCore / Android `Rewards.shippedRewardRate`; report UI on all clients;
  report sheet supports %/× unit + Pro-only local-only correct; catalog presets +
  `presetId` / `acceptedPresetUpdatedAt` / `declinedPresetUpdatedAt` for Update /
  Keep mine (#183).
- **Payoff**: `isHousingLoan` + `includeMortgage` on web/iOS/Android engines;
  redesigned Payoff UI (hero / compare / account list); calculator pad removed.
- **Income history**: membership clamp + range picker (web / iOS / Android History).
- **Chrome**: web appbar tab stretch; landing/dashboard spacing (#184); admin
  underline tabs (#187); Android More-tab nested back (#182); native
  `SyncOfflineBanner` / Scaffold topBar on offline sync; Cards title ellipsis +
  container stack fix.
- **Admin UI**: last sign-in / last data sync labels; pre-tracking null login copy;
  Rewards catalog editor + pager.
- **Payments**: `applyCardPaymentDelta` also decrements `currentBalance`; paid-off
  promo clear prompt (`promoPayoffPrompted`); iOS payoff sim prefers `currentBalance`.
- **Plaid balances**: proposals → Accept writes `currentBalance` only
  (`plaidBalances.js`, `plaidBalanceReview.js`); settings `plaidBalanceMode`,
  `plaidBalanceProposals`, `plaidBalanceResolved`; Cards review UI + sync prompt.
- **Subscriptions**: tracked vs candidates; `subscriptionDeclined` /
  `subscriptionDetectMode`; Accept / Decline / Add on web + native;
  tightened `subscriptionsFinder` heuristics + tests.
- **Plaid purchases**: `plaidHidden` merge rules, pending Keep/decline UI.
- **Health**: `server/health.js` + integration test; deploy verify uses `{"ok":true}`.
- **Play track**: `play-upload.js` now defaults to the `beta` track (Play Console
  **Open testing**) instead of `alpha` (Closed testing), takes `--track
  internal|alpha|beta|production` alongside `GOOGLE_PLAY_TRACK`, validates the
  track name before building, and supports `GOOGLE_PLAY_ROLLOUT=<0..1>` for a
  staged rollout (`status: inProgress` + `userFraction`) instead of a full
  `completed` release.
- **Deploy**: `scripts/native-versions.js`, `ios-testflight.sh --build`,
  `play-upload.js --version-code` / release naming; `upload.example.sh` requires
  `MFA_ENCRYPTION_KEY` and `chmod 700/600` on remote `data/`; XcodeGen download
  retries in `ci_post_clone.sh` (#189).
- **Data at rest**: `decodeUserDataBlob` / `encodeUserDataBlob` in `db.js`;
  `mfa.warnIfProductionFileKey()` on boot; `server/userDataCrypto.test.js`.
- **Verification gates**: `requireVerified` on Plaid auth routes and account
  export endpoints.
- **Tests**: reward-rate report client integration; health server integration;
  `appleJws` / `oauthHandoff` unit + handoff HTTP integration; removed obsolete
  rewards-link panel test; `plaidBalances` / subscriptionsFinder unit coverage.
- **Docs**: `docs/native-contract.md` balance field meanings + approval settings;
  `docs/social-login-setup.md` App Links + Custom Tab `fihaven://` return
  (#194, #199); README bank-sync native vs web OAuth paths (#195);
  store listing / IAP promo maintainer docs (#201).
---

## [1.6.0] (Pre-Release) — Last updated: 2026-07-14

| | |
|---|---|
| **Status** | Pre-release — testing build (TestFlight / internal) |
| **iOS** | 1.6.0 (1) |
| **Android** | 1.6.0 (build 20) |
| **Web** | Live at [fihaven.app](https://fihaven.app) |

### Summary

> Bank linking now actually does something, cards tell you *when* they're due
> and let you skip a payment, and your dashboard shows who's really taking the
> money. Under the hood this release fixes **two data-loss bugs** and the reason
> notification emails were quietly going missing.
> [Jump to technical changelog ↓](#160-technical-changelog)

**⚠️ Data loss — fixed**

- **Changing a setting could erase your data.** Changing your currency,
  timezone, or default view — or toggling a bank-import switch — saved only part
  of your account, and the server treated everything missing as deleted. That
  wiped your **Spending transactions, net-worth accounts, and savings goals**.
  Fixed, and covered by a test that reproduces the old behaviour.
- **Autopay auto-marking could erase the same data**, by the same mechanism, on
  a different code path. Also fixed.

**Bank sync (Plaid) — it works now**

- **Linking a bank actually imports something.** Previously linking connected
  the bank and stopped: nothing was ever pulled in unless you found a button
  buried in Settings, and even then two off-by-default switches meant it
  silently imported nothing.
- **We ask what you want** right after linking — import purchases, update card
  balances, or neither. Linking a bank isn't consent to either.
- **Syncs on its own** — when you link, when you open the app, on a webhook, and
  the moment you turn importing on (which backfills your history).
- **Your history is no longer thrown away.** Syncing while importing was off used
  to consume transactions permanently, so turning the switch on later gave you an
  empty Spending tab forever.
- **Accept or decline a pending bank charge.** A pending import used to be stuck
  on the Spending tab with no way to act on it. You can now **Keep** it (it's a
  real purchase) or remove it — and a declined charge never comes back, even
  after it settles under a new id.

**Notification emails**

- **A failed email is retried instead of silently dropped.** Every reminder,
  digest, and summary marked itself as "sent" even when the send *failed*, so a
  single hiccup lost that email for good.
- **The hourly scheduler no longer drifts** past the hour it was supposed to send
  in, which intermittently skipped a whole day's reminders.

**Cards**

- **See when a card is due.** Each card now shows the actual date — *"Due Jul 28
  · in 15 days"*, *"Due today"*, *"Overdue — was due Jul 12"* — instead of only
  telling you it wasn't paid.
- **Skip a payment.** Cards get the Skip action bills have had. Skipping one you
  still owe the minimum on warns you first.
- **"Already paid this month?"** Adding a card now asks. A card added on the 20th
  with a due day of the 3rd used to look overdue, and its 0% payoff plan counted
  a payment you'd already made.
- **Fixed a misleading date** on the dashboard: an overdue item showed *next*
  month's date next to the word "Overdue".

**Rewards**

- **Report a wrong reward rate.** If we say a card earns 3% on gas and it really
  earns 1%, you can now correct it. It fixes your card immediately and tells us,
  so the shared card presets get fixed for everyone.

**Dashboard**

- **Who's actually taking the money.** Upcoming rows now show the business (or a
  card's issuer) under the name, so a bill called "Phone" tells you who bills it.

---

## [1.5.0] (Pre-Release) — Last updated: 2026-07-09

| | |
|---|---|
| **Status** | Pre-release — **launch candidate** (first public tester wave) |
| **iOS** | 1.5.0 (10) |
| **Android** | 1.5.0 (build 18) |
| **Web** | Live at [fihaven.app](https://fihaven.app) |

### Summary

> The 1.5.0 pre-launch build. Budget lenses, household rollup, and push
> notifications land on every platform; bank linking goes live in production;
> subscriptions get real brand logos and manage-links; and bills, cards, and
> loans can now be **archived** instead of deleted. Net worth moves to its own
> tab, sign-in works without a password, and a long tail of reliability and
> layout fixes lands across web, iOS, and Android.
> [Jump to technical changelog ↓](#150-technical-changelog)

**Budget & spending (Tier 3)**

- **Budget lens on native** — pick 50/30/20, envelopes, debt-focus, and more in
  Settings on iOS and Android (not just the web).
- **Envelope editor (Pro)** — assign money to categories from the Budget tab.
- **Spending insights (Pro)** — see how this period compares to last on the
  Spending tab.
- **Household rollup** — couples/families see a shared dashboard card with
  combined upcoming bills and balances.
- **Category → bucket overrides** — map your bill/spending categories to
  needs, wants, or save.

**Net worth & accounts**

- **Net Worth is its own tab** — assets minus debts, with your savings,
  checking, investment, and property accounts, on web, iOS, and Android. It's
  free, not a Pro feature, and no longer buried on the Cards tab.

**Bills, cards & loans**

- **Archive instead of delete** — retire a bill, card, or loan without losing its
  history. Archived items drop out of due dates, totals, the calendar, and
  reminders, and can be restored any time. Turn it on in Settings; each tab has
  a *Show archived* filter. On web, iOS, and Android.
- **Payoff plan for 0% cards** — the Cards tab now shows what to pay off in a
  lump sum (cards with no promo rate) alongside the monthly amount needed to
  clear each 0%-financing card before its promo ends.
- **Two-column cards & loans (web)** — the Cards and Loans pages use the width
  they have instead of one long column.
- **Set a separate autopay day** from the due date so "mark paid" lines up with
  when your bank actually pulls payment.

**Subscriptions**

- **Real brand logos** — recognized services (Netflix, Spotify, YouTube, and
  dozens more) show their actual logo next to the name in Subscriptions and on
  the Dashboard's Upcoming list, with a per-brand emoji fallback. iOS and
  Android show the per-brand emoji.
- **Jump straight to the bill** behind a subscription, and **save a manage or
  cancel link** for it — kept on your own bill, and optionally shared with us so
  we can seed it for everyone. On web, iOS, and Android.
- **Clearer about what sharing a link sends us.** Offering a manage link emails
  the service name, the link, and *your email address* to FiHaven. The old wording
  never said so. Now spelled out in the app and covered in the
  [Privacy Policy](https://fihaven.app/privacy). Saving a link only to your own
  bill still sends us nothing.

**Notifications**

- **Push notifications** — opt in on iOS or Android for bill reminders, weekly
  digests, and monthly summaries (alongside email and on-device reminders).
- **Browser notifications** — the same reminders in Chrome or Firefox, opt in
  from web Settings, no app needed.
- **Clearer notification settings** — iOS and Android split reminders into
  *On this device*, *Email*, and *Reminder timing*.

**Monthly rollover**

- When a new month starts, FiHaven offers to review each bill's amount. A
  dashboard card names anything from last month that was never marked paid, and
  the review pre-fills amounts your way: the average of recent months (default),
  the same as last month, or blank. On web, iOS, and Android.
- **Edit from the Dashboard** — tap-and-hold (or the ⋯ menu) on a dashboard item
  to edit the bill or card right there (iOS and Android).
- **Right words for non-monthly bills** — a quarterly bill now says "Paid this
  quarter" instead of always "this month" (also weekly, bi-weekly, and yearly).

**Smarter credit card rewards**

- See recurring card perks (Uber credits, airline fees, etc.) and log what you've
  used each month — plus an "is this annual fee worth it?" check on the Rewards tab.
- Track activated card offers (Amex/Chase deals) before they expire; mark them
  used when you're done and get a heads-up before they lapse.
- FiHaven can suggest which card to use at a store based on where you're shopping.
- **Save a rewards or offers link per card** — the same flow Subscriptions has.
  Kept on your own card, and optionally shared with us (which emails us the card
  name, the link, and your email address) so we can seed it for everyone. Web,
  iOS, and Android.

**Bank linking (Pro, optional)**

- Connect your bank on **fihaven.app** — live in production, not dev-only.
- If your bank adds accounts later, link them without starting over.
- Spending can flag when a bank import looks like a purchase you already entered
  by hand (you choose what to keep).
- **Bank purchases are opt-in** — importing purchases into Spending is an explicit
  toggle, **off by default**; FiHaven stays manual-entry-first. Updating card
  balances from the bank is separate and also opt-in. The purchases toggle now
  exists on **iOS and Android**, not just the web.
- **Bank linking works again.** Connecting a bank failed at the final step with
  "Could not finish linking." Fixed server-side — no app update needed.
- When Plaid does fail, the app now **tells you what went wrong** instead of
  claiming you cancelled.

**Sign in**

- Sign in with a **passkey** — no password. Your device offers a saved passkey
  right on the login screen (Face ID / Touch ID, iCloud Keychain, Google
  Password Manager, Bitwarden, and friends) on web, iOS, and Android.

**Pricing & plans**

- Real prices on the marketing and pricing pages: **$1.99/mo**, **$14.99/yr**, and
  a **$25.99/yr Family** plan.
- **Family is a shared household of up to 3 people.** Pro is a single account.
- **Family is now its own option, not a Pro perk.** The paywalls used to list
  "Family sharing" under Pro, which was wrong — only the Family plan can create a
  household. Joining one is still free on any tier.
- **You can upgrade to Family.** Previously, once you were on Pro, no screen in
  any app offered it. Existing subscribers now see a Family upgrade card.
- Your plan is named everywhere: **Pro · Family** rather than a bare "Pro".
- iOS gains a **Manage Pro** button, matching Android.

**Reliability & polish**

- **Android layout fixes** — the card name no longer crowds the network and last-4
  digits on the Cards tab; the "Ends in" field stops wrapping onto a second line;
  the two Payoff summary boxes are the same height; and the selected day on the
  Calendar is a rounded cell rather than a tall, narrow pill.
- **Settings are better organized** — Budget period and Budget lens live together
  in a new **Budget** section, and "Hide fully paid on dashboard" moved to
  **Automation**. On iOS and Android.
- **Android's More screen** is grouped into sections, matching iOS.
- **Bank linking failed for everyone** with "Could not start linking" — the server
  was authenticating against Plaid with a stale key. Fixed server-side, so no app
  update is needed.
- Fixed cards, bills, accounts, and goals not showing up on Android (and a
  save bug that could drop accounts/goals/transactions on phones).
- **Android:** the Save button stays reachable on long add/edit screens, and
  Skip/Pay on a bill are large enough to hit without opening the editor by
  mistake. Editors use real date and day pickers instead of free-text fields.
- **iOS:** every money field puts the dollar sign to the left of the amount, and
  amounts no longer render as `300.000`.
- **Redesigned Bills tab (iOS & Android)** — bills use the same clean two-line
  tile as the Cards tab, with pay/skip actions on their own row.
- **App lock on/off (Android)** — a clear switch to require biometric/passcode
  unlock, plus a "Stay unlocked for" duration, under **Settings → Security**.
- **Swipe through the intro** — onboarding screens are swipeable on iOS and Android.
- The login security check no longer "times out" if you leave the sign-in
  screen open for a while — it refreshes itself.
- Android now autofills the 2FA code correctly instead of offering a password,
  and the sign-up screen shows the Terms/Privacy agreement.
- Fixed cards and bills showing "overdue" after you've already paid this period.
- Fixed FiHaven Pro "Manage subscription" for Stripe subscribers; clearer
  messaging for complimentary and promo access.
- Fixed the dashboard **More** menu, the settings tab bar, the squished web Loans
  list, the duplicated Subscriptions title, and Preferences picker alignment.
- Closing a bill/card editor no longer jumps to the GitHub page.
- Refreshed the marketing homepage, pricing page, and FAQ (including dark mode).

---

<a id="160-technical-changelog"></a>

### Technical changelog (1.6.0)

#### Fixed — data loss

- **`PUT /api/data` erased omitted lists.** The route coerced any absent key to
  `[]`, but the web Settings page saves a *partial* snapshot
  (`bills/cards/payments/settings`) for the currency, timezone, landing view, and
  both bank toggles — so each of those saves wiped `transactions`, `accounts`,
  and `goals`. An absent key now means "leave it alone"; an explicit `[]` still
  clears, so deleting everything still works. Reproduced by
  `tests/integration/dataPartialSave.server.integration.test.js`. (#150)
- **The scheduler's autopay auto-mark wiped the same three lists**, calling
  `db.upsertUserData` directly with a 4-key snapshot and bypassing the route
  entirely. (#151)
- **Plaid's sync cursor was advanced even when the merge was skipped.** The
  cursor is destructive, so syncing with `plaidUpdatePurchases` off consumed the
  user's history permanently — enabling the toggle later yielded an empty
  Spending tab forever. Merge logic extracted to a pure `server/plaidMerge.js`
  which returns `merged:false` when the gate is off; no caller advances the
  cursor unless it ran. (#150)

#### Fixed — notifications

- **A failed send was stamped as delivered.** All five notification types
  (bill, trial, offer, digest, summary) caught the send error and then stamped
  the day/week/month anyway — and that stamp is the only thing preventing a
  re-send. New `trySend`/`tryPush` helpers gate the stamp on the send actually
  landing; push failures deliberately don't gate it. Two existing tests asserted
  the old behaviour by name and were rewritten. (#151)
- **`setInterval(tick, 3_600_000)` drifted.** Node re-arms an interval only after
  its callback resolves, so each pass's duration was added to the next delay;
  since every send fires on an exact `lp.hour === notifyHour` match, accumulated
  drift eventually stepped over a whole hour. Now re-arms against the wall clock
  at `:00:30`. (#151)

#### Added

- **Plaid actually syncs.** `link/exchange` now runs an initial sync; a shared
  `syncItem`/`syncAllItems` backs exchange, refresh, and the webhook.
  `POST /api/plaid/refresh` is throttled to 1/hour per item (new
  `plaid_items.last_sync_at`) so clients can call it on app open, with
  `{force:true}` for an explicit "Sync now". `PUT /api/data` detects the
  opt-in gate flipping on and backfills. New post-link opt-in prompt +
  `client/js/bankSync.js` + `pullFromServer()`; `AppStore.syncBanks()` and
  `AppViewModel.syncBanks()` on native. (#150)
- **`POST /api/feedback/reward-rate`** — report a wrong reward rate. Mailed, never
  stored, sender disclosed (same contract as the link routes); no URL. Corrects
  the user's own card first via `setCardRewardRate`. UI in `RewardsView.svelte`,
  `RewardsView.swift`, `RewardsScreen.kt`. (#149)
- **Card due date + skip.** Card rows lead with the real date, derived from the
  same countdown that picks the urgency colour so the two can't disagree.
  `skipped`/`onSkip`/`onUnskip` on the card row, reusing the existing
  `skipMonth`/`unskip`/`cardSkipWarning`. (#148)
- **`UpcomingItem.business`** — a bill's business / a card's issuer, rendered as
  the second line on Dashboard rows across all three clients. (#152)
- **"Already paid this month?"** on card creation — `onCreated` callback on the
  card editor; "yes" opens the existing Pay flow prefilled, so partial vs. full
  and the promo math stay on one code path. (#152)
- **Accept / decline a pending bank transaction.** Bank rows in Spending used to
  be read-only (a dead 🔗), so a pending import couldn't be actioned. A pending
  row now offers **Keep** (clears the `pending` flag) and every bank row a decline
  (✕). Decline records the Plaid id in new `settings.plaidHidden`; the pure
  `plaidMerge.js` never re-imports a hidden id — matched by `transaction_id` *or*
  a posted successor's `pending_transaction_id` — so a decline survives Plaid's
  destructive cursor and the pending→posted id swap. Web `SpendingPanel.svelte`;
  iOS `AppStore.acceptBankTransaction`/`declineBankTransaction` + `Settings.plaidHidden`;
  Android `AppViewModel` + `Settings.plaidHidden`. `settings` is raw-JSON-backed
  on native, so the new key round-trips without a model change. Three new
  `plaidMerge.test.js` cases pin the contract.

#### Fixed

- **`nextDueDate` is forward-looking**, so overdue dashboard items were labelled
  with *next* period's date ("Overdue · Aug 12" for a Jul 12 due date). The date
  is now derived from `days`. Present on all three clients. (#148)

#### Security

- **DOM XSS in the pay-goal hint (CodeQL #37).** `updateGoalHint()` in
  `client/js/modals.js` interpolated `pendingPayName` — the user-named bill/card,
  traced from a DOM read — into `hint.innerHTML` unescaped, so a name with HTML
  meta-characters was reinterpreted as markup (`js/xss-through-dom`, High). The
  name is now escaped through the same `textContent`-encode helper used in
  `rollover.js`. (#160)
- **`/health` had no rate limit (CodeQL #40).** The liveness probe is mounted on
  the root app to bypass the `/api` tiers, which also left its DB ping
  (`SELECT 1`) unthrottled (`js/missing-rate-limiting`). It now carries its own
  lenient per-IP limiter (120/min — ample for monitors and deploy retries).
- **Store go-live links assigned from a DOM attribute (CodeQL #38, #39, #41, #42).**
  The home-page go-live script read `data-ios-href`/`data-android-href` and
  assigned them to `.href` (`js/xss-through-dom`), so a `javascript:` value
  would have executed. Store URLs now live on the badge `<a href>` attributes
  in markup; the script only toggles visibility when `data-store-live="true"`.

#### Chore

- **1.6.0 build numbers corrected.** A hardcoded `CFBundleShortVersionString:
  "1.5.0"` in the iOS Info.plist overrode `MARKETING_VERSION` and shipped 1.6.0's
  build to TestFlight labelled **1.5.0 (11)**. `CFBundleShortVersionString` now
  tracks `$(MARKETING_VERSION)` so it can't drift again, and 1.6.0 starts a fresh
  build train: **iOS 1.6.0 (1)**, **Android versionCode 20** (Play requires a
  monotonic versionCode, so it steps forward rather than resetting to 1).
- Adopt bun (`bun.lock`); Node engine floor → 24.18.0. `package-lock.json` and
  the `npm ci` CI are intentionally untouched. (#153)
- firebase-bom 34.16.0 (#146), junit-jupiter 6.1.2 (#145).

---

<a id="150-technical-changelog"></a>

### Technical changelog

Every change in 1.5.0, grouped by kind. Each entry carries its PR number.

#### Added

- **Rewards links** — `POST /api/feedback/rewards-link`, a sibling of
  `subscription-link` (both now share one `linkHandler(kind)`). New optional
  `Card.rewardsUrl` on web, `Card.swift`, and `Models.kt`; per-card add/change UI
  in `RewardsView.svelte`, `RewardsView.swift`, and `RewardsScreen.kt`. Both
  routes email the name, URL, **and sender address** — disclosed in-app and in
  `privacy.html`. (#140)
- **`settings.plaidUpdatePurchases` on native** — accessor + setter + toggle in
  `BankView.swift` / `BankDialog.kt`. The server already honored it; only the
  native UI was missing. (#140)
- **Family upgrade path** — `app.fihaven.pro.family` added to
  `StoreManager.productIDs` and `BillingManager`'s query list; a dedicated Family
  card on all three paywalls, shown to existing solo-Pro subscribers who
  previously had no way to reach it. Android uses
  `SubscriptionProductReplacementParams` (the *current* per-product API — its
  `ReplacementMode` ints differ from the deprecated one). (#141)
- **`Budget` settings section** on iOS + Android; `hidePaidOnDashboard` moved to
  Automation; Android's More screen grouped like iOS. (#142)

#### Fixed

- **`/link/exchange` returned 502 `INVALID_PRODUCT`** — `plaid.getAccounts` used
  `accountsBalanceGet`, Plaid's paid **Balance** product, which our production
  client id has no entitlement to. Switched to the free `accountsGet` (same
  `AccountsGetResponse` shape; balances cached as of the item's last update).
  Sandbox grants every product, which is why `plaid-sandbox-check.js` passed — it
  also bypassed `plaid.getAccounts` entirely, and now goes through it. (#139)
- **Plaid `onExit` was inverted** — Plaid passes a *null* error when the user
  simply closes Link, so the web handler announced "Linking was cancelled" only
  when a real failure occurred, discarding `error_code`/`display_message`. New
  shared `client/js/plaidLink.js`; same fix on iOS and Android. `/plaid-oauth`
  now reports its outcome via `sessionStorage` (a query param would let a crafted
  link render arbitrary text in FiHaven's voice). (#139)
- **`/link/exchange` conflated upstream and local failures** — Plaid errors stay
  502; a local persistence failure is now 500 and revokes the orphaned Item at
  Plaid rather than leaving one we're billed for. (#139)
- **Paywalls sold Family sharing as a Pro perk.** `billing.householdMaxFor`
  returns `HOUSEHOLD_MAX_PRO` (0) for solo Pro, so `household.js` throws
  `pro-required`. `family` was also missing from the plan-label map on all three
  clients, so Family subscribers saw a bare "Pro". (#141)
- **⚠ `createStripeCheckout` could double-charge.** A Checkout Session always
  *creates* a subscription; there was no guard against an existing one. Now
  `409 already-subscribed`, and the web Family row sends existing Stripe
  subscribers to the Billing Portal instead. (#141)
- **Android layout** — Cards row name/network crowding (unweighted `Row`), the
  wrapping "Ends in" label, unequal Payoff stat boxes (`IntrinsicSize.Min` +
  `fillMaxHeight`), and the Calendar's selected day rendering as a tall pill (a
  `height` with no `width`). (#142)

#### Added (earlier builds)

- **Archive (soft delete) for bills, cards & loans** — new `archived` flag on the
  bill/card models, an `archiveInsteadOfDelete` setting, and a per-tab *Show
  archived* filter. Bills route through the single `billActive()` /
  `billInPeriod()` gate, so archived bills leave due dates, totals, calendar,
  rollover, reminders, and the subscription finder for free; **cards have no such
  gate**, so archived cards are filtered at every consumer. Web `utils.js` ⇄
  `DateLogic.swift` ⇄ `DateLogic.kt`; `activeBills`/`activeCards`/`archivedBills`/
  `archivedCards` on `AppStore` and `AppData`. (#126, #127, #129)
- **Net Worth as its own tab** — moved out of `CardsList.svelte` into
  `client/js/networth.js` + `#tab-networth`; new `NetWorthView.swift`
  (`TabItem.networth`) and `NetWorthScreen.kt` (`TabId.NETWORTH`). Free tier — no
  `PRO_TABS` / `ProGate`. (#131, #132)
- **Subscription manage links** — `POST /api/feedback/subscription-link`
  (`server/routes/feedback.js`, `requireAuth` + `requireVerified` + `requireCsrf`,
  `isHttpUrl()` validation) mails a volunteered link with the sender as reply-to;
  `SUBSCRIPTION_LINK_INBOX` overrides the destination. Saving writes
  `bill.manageUrl` locally **and** offers the link, in that order. Web
  `SubscriptionsPanel.svelte`; iOS `ManageLinkSheet` + `APIClient+Feedback.swift`;
  Android `ManageLinkDialog` + `ApiClient.shareSubscriptionLink`. (#125, #137)
- **Cards payoff plan** — lump-sum total for cards with no promo APR, plus the
  monthly payment needed to clear each 0%-financing card before its promo ends
  (`cardsPayoffPanel`). (#125, #129)
- **iOS `CurrencyField` / `PercentField`** (`Components.swift`) — leading `$`
  against a left-aligned value in a fixed-width box, mirroring the web's
  `.goal-amount` input; percent still trails. Amounts capped at two fraction
  digits. Adopted across the bill, card, payment, budget, and account editors and
  the Payoff calculator. (#135)
- **Subscription brand logos** — `client/js/subscriptionLogos.js` bundles 48
  curated single-path brand marks (Simple Icons, CC0) keyed by normalized name,
  with brand colors and a `logoDataUri()` renderer. `subscriptionIcons.js`
  resolves real logo → per-brand emoji → category/generic; `brandIconInfo()`
  returns `null` on no-match, and `LOGO_ALIASES` maps "HBO Max" / "Amazon Prime
  Video" / etc. to their bundled logo. Wired into the Subscriptions panel and
  the Dashboard **Upcoming** rows (`buildUpcomingItems` in `utils.js`). Native
  mirrors the emoji layer only. Tests: `subscriptionIcons.test.js` (11),
  `SubscriptionIconChecks` (iOS), `SubscriptionIconsTest` (Android). (#122, #127)
- **Native Bills redesign** — `BillsScreen.kt` / `BillsView.swift` bill rows use
  the Cards-tab two-tier tile: emoji + name/business + amount on top, colored
  status + Pay/Skip/Undo quick actions below. (#119)
- **Android editor pickers** — `Form.kt` gains `DateField` (Material date picker,
  ISO storage, clearable) and `DayField` (1–31 picker); replaced free-text
  `YYYY-MM-DD` / due-day fields across the bill, card, budget, pay, and settings
  editors. (#115)
- **Monthly rollover** — new-month detection (reuses `settings.lastVisitKey`)
  surfaces a dashboard prompt naming items never marked paid last month, and a
  review that pre-fills each active bill's amount. New `settings.rolloverPrefill`
  (`average` | `carry` | `blank`). Shared `recentPaymentAverage()` +
  `rolloverAmount()` in `client/js/utils.js` ⇄ `Schedule.kt` / `Schedule.swift`.
  Web `client/js/rollover.js`; native `RolloverReviewView` / `RolloverReviewDialog`. (#110)
- **Dashboard inline edit** — an Edit action on dashboard upcoming rows opens the
  existing `BillEditorView` / `CardEditorView` sheets and `BillEditorDialog` /
  `CardEditorDialog`. (#109)
- **Period-correct labels** — `billPeriodNoun()` / `BillSchedule.periodNoun()`
  (`week` / `cycle` / `quarter` / `year` / `month`) mirrored across `billSchedule.js`,
  `BillSchedule.kt`, `BillSchedule.swift`; threaded through bills lists, dashboard
  rows, skip/un-skip actions, and iOS accessibility labels. (#108)
- **Swipeable onboarding** — iOS paged `TabView`; Android `HorizontalPager`. (#107)
- **Browser web push** — `client/js/webpush.js` (registers `/sw.js`, subscribes
  with the VAPID key from `GET /api/push/config`, `POST /api/push/register` with
  CSRF), service worker `client/public/sw.js`, and Settings enable/disable UI.
  Server: VAPID init + `sendWeb()` (`web-push`), `platform='web'` in `sendToUser`,
  `GET /api/push/config`, 404/410 stale-subscription cleanup. No-op until
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` are set. (#112)
- **Remote push (APNs / FCM)** — `push_devices` table; `POST /api/push/register`
  and `/unregister`; `server/push.js` (env-gated `apns2` + `firebase-admin`);
  scheduler sends push alongside email when `settings.pushNotifications` is on;
  native `PushRegistrar`; `docs/push-setup.md`, `scripts/push-check.js`.
- **Tier 3 native budget lens** — `BudgetRuleSettingsView` (iOS) and Settings →
  Budget lens (Android); mirrors web budget rules.
- **Native envelope editor (Pro)** — assign envelope amounts from the Budget tab.
- **Autopay pull day** — optional `autopayDay` on bills and cards, separate from
  `dueDay`; drives auto-mark timing on web, iOS, and Android.
- **Passwordless passkey sign-in** — log in with a device passkey and no password.
  First-factor endpoints `POST /api/auth/passkey/login/start` + `/finish`
  (`mfa.startPasskeyLogin` / `finishPasskeyLogin`, discoverable credentials,
  user-verification required) resolve the account from the signed credential id.
  The login screen checks automatically: **web** conditional UI
  (`autocomplete="… webauthn"` + `useBrowserAutofill`), **iOS** ASAuthorization
  AutoFill-assisted requests, **Android** Credential Manager
  `GetPublicKeyCredentialOption`. Adds `/.well-known/` association files, the iOS
  `webcredentials:fihaven.app` entitlement, and optional `PASSKEY_ANDROID_ORIGIN`.
- **Google Play receipt verification** — `server/googlePlay.js` calls
  `purchases.subscriptionsv2.get` when `GOOGLE_VERIFY_ENABLED=1`.
- **Android passkey registration** — Settings → Passkeys via Credential Manager
  (`PasskeyRegistration.kt`); `passkeyOrigins(req)` on enroll/finish.
- **`scripts/seed-user-data.js`** — demo/screenshot account seeding CLI.

#### Changed

- **Family plan is a shared household of up to 3; Pro is a single account** —
  `HOUSEHOLD_MAX_PRO` defaults to `0` and `HOUSEHOLD_MAX_FAMILY` to `3`;
  `householdMaxFor(pro, plan)` returns the family cap only for `plan === 'family'`.
  Household integration tests now grant `app.fihaven.pro.family`. (#124)
- **Marketing, pricing & FAQ refresh** — real prices ($1.99/mo, $14.99/yr,
  $25.99/yr Family), an "…and plenty more" feature tile, a "Just shipped" ribbon,
  a live hero month (`client/js/home-hero.js`, replacing a hardcoded one), a
  readable Web-app badge, and accessible FAQ body text. (#124)
- **Two-column cards & loans (web)** — `grid-template-columns: repeat(auto-fit,
  minmax(440px, 1fr))` on the cards/loans grids. (#125)
- **Biometric app lock is an explicit toggle (Android)** — `SettingsScreen.kt`
  replaces the "Require biometric / passcode after" nav row with a `SwitchRow`
  (`biometricEnabled` / `setBiometricEnabled`) plus a conditional "Stay unlocked
  for" duration; `NEVER` dropped from the delay options. Moved under **Security**. (#121)
- **Web Loans layout** — `.card-row-stats.is-loan` uses a 2-column grid capped at
  `520px` so loans (2 stats) no longer stretch across the 4-column card grid. (#120)
- **Web Subscriptions title** — `SubscriptionsPanel.svelte` takes a `kicker` prop;
  the Subscriptions tab mount passes `kicker={false}`. (#116)
- **Android Preferences alignment** — picker rows use `horizontal=16, vertical=12`
  padding so labels and helper text line up. (#117)
- **Bank purchase import is opt-in** — `mergePlaidTransactions` is gated on
  `settings.plaidUpdatePurchases` (off by default) in `server/routes/plaid.js`;
  previously it ran on every sync. (#113)
- **Native notification settings** — regrouped into *On this device* / *Email* /
  *Reminder timing* on iOS (`SettingsView`) and Android (`SettingsScreen`). (#111)
- **Deploy env whitelist** — `upload.sh` and `scripts/examples/upload.example.sh`
  now ship `TOKEN_TTL_DAYS`, `APPLE_VERIFY_ENABLED`, `VAPID_*`, `HOUSEHOLD_MAX_*`,
  and `SUBSCRIPTION_LINK_INBOX`. Web push had been fully built but permanently
  no-op in production because the VAPID keys were stripped from the deployed
  `.env`. (#128)
- **Deploy tooling** — tracked `scripts/play-upload.js` (secret-free Play uploader,
  reads env only), `deploy:ios` / `deploy:android` npm scripts, dev-dependency
  bumps. (#118)
- **Change-email verification gate** — `POST /api/account/change-email` requires
  a verified current email, clears `email_verified`, emails the new address, and
  returns `verificationRequired`; clients hide change-email when unverified.
- **Android release signing** — optional `keystore.properties` + `bundleRelease`,
  R8 minify/shrink + `proguard-rules.pro`, `ndk.debugSymbolLevel = symbol_table`.
- **Stripe web checkout** — 7-day trial on all hosted Checkout plans
  (`trial_period_days`); `app.fihaven.pro.family` product map entry.
- **Android Plaid Link SDK 6** — migrated to 6.0.0; `compileSdk` 37, lifecycle 2.11.0.
- **Plaid production deploy** — `upload.sh` ships sanitized `PLAID_*` production
  keys in the server `.env` (previously every `PLAID_*` key was stripped).
- **Plaid webhooks & item lifecycle** — handle `PENDING_DISCONNECT`,
  `LOGIN_REPAIRED`, and `NEW_ACCOUNTS_AVAILABLE`; **Add accounts** (update mode)
  on web, iOS, and Android; account deletion / bank-data clear calls Plaid
  `/item/remove`.
- **Android auth token storage** — `PrefsTokenStore` migrated to Android Keystore
  AES-256-GCM; removed `androidx.security:security-crypto` (one-time sign-in may
  be required after upgrade).
- **Android create-account consent** — the Terms/Privacy notice now shows on the
  Android sign-up form (parity with web and iOS).

#### Fixed

- **Bank linking failed in production for every client** — `plaidSecret()` picked
  the generic `PLAID_SECRET` ahead of the environment-specific one, the opposite
  of what its own comment described. With `PLAID_ENV=production` and a stale
  sandbox-era `PLAID_SECRET`, every call authenticated with the wrong key: Plaid
  returned `INVALID_API_KEYS`, `POST /api/plaid/link/token` answered `502
  link-token-failed`, and web, iOS, and Android all surfaced "Could not start
  linking. Please try again." The env-specific secret now wins, and secrets never
  cross environments — a sandbox-only secret leaves a production deployment
  reporting `plaid-not-configured` (503) instead of failing every call at the API.
  New `server/plaid.test.js`. One server fix; no app release needed. (#133)
- **Android: Save pushed off the bottom of scrollable dialogs** — `FormDialog`
  capped its content at `maxDialogHeight - 120.dp`, a guess at the header + footer
  height. When they exceeded it (tall forms, large font scale, gesture-nav insets,
  keyboard up) the action row was clipped. The content column now uses
  `weight(1f, fill = false)`, so the unweighted header and footer are measured
  first at their real heights. Every add/edit dialog routes through `FormDialog`. (#136)
- **Android: Skip / Pay were nearly unhittable** — `QuickAction` was a bare 12sp
  `Text` with `.clickable` (~26×16dp, against Material's 48dp minimum) inside a
  card that is itself clickable and opens the editor, so a near-miss edited the
  bill. Now a 56×48dp `Box` with the padding *inside* the `clickable`, a rounded
  ripple, and `Role.Button`. (#136)
- **iOS: money fields had no dollar sign, or a trailing one** — the bill, Pay, and
  Edit-Payment amounts rendered bare; the Payoff calculator trailed `$`; rows that
  did have one let the field expand so it floated mid-row. `format: .number` also
  defaulted to three fraction digits (`300.000`). See `CurrencyField` above. (#135)
- **iOS: archived cards still counted as debt** — `AppStore.liabilities` summed
  `data.cards` rather than `activeCards`, so a soft-deleted card inflated the
  dashboard net-worth card. Android already read `activeCards`. (#129)
- **Web: saving dashboard settings could drop your data** — `client/js/settings.js`
  rebuilt the sync snapshot without `accounts`, `goals`, or `transactions`. Since
  `PUT /api/data` replaces the whole record, saving a dashboard setting cleared
  them server-side. (#126)
- **Native models silently stripped new synced fields** — iOS `Bill`/`Card` are
  `Codable` structs with explicit `CodingKeys` and Android's are `@Serializable`
  data classes, so both drop unknown JSON keys on re-encode. Because
  `PUT /api/data` replaces the whole record, the first native sync after the web
  started writing `archived` / `manageUrl` would have erased them. Both fields
  were added to the native models **before** the web change shipped. (#127)
- **Native data sync — record ids unified to strings** — bill/card/account/goal
  ids were `Int` on iOS (64-bit) and Android (32-bit) but the web mints string
  ids (`genId`); web/iOS records (and any id > 2³¹) silently failed to decode on
  Android, so cards, bills, accounts, and goals didn't appear there. All four
  models now use flexible **string** ids on iOS (`flexibleString`) and Android
  (`FlexStringIdSerializer`), and new records mint web-style string ids.
- **Native data sync — full save payload** — `DataPutBody` on iOS and Android
  omitted `accounts`, `goals`, and `transactions`; since `PUT /api/data` replaces
  the whole record, every native save wiped them. All three lists are now included.
- **Paid items no longer show overdue** — `effectiveDaysUntilDue` /
  `effectiveDaysUntilBillDue` in `utils.js` and native `DateLogic` / `Schedule`;
  Cards, Bills, and Dashboard upcoming on web, iOS, and Android.
- **Login security check timing out** — Cloudflare Turnstile tokens expire after
  ~5 minutes; sitting on the login screen left a stale/empty token and a disabled
  sign-in button. Widgets self-refresh on every platform (`refresh-expired="auto"`
  + `retry="auto"`, an auto-reset `expired-callback` on web), and the native
  `TurnstileView` stays **mounted after it solves** so the held token refreshes
  before it can expire. A submit still resets it (single-use tokens).
- **2FA autofill on Android** — the verification-code field declared no autofill
  type, so the system offered saved passwords. Email, password, and the 2FA code
  field now set Compose `ContentType` (`Username`+`EmailAddress`,
  `Password`/`NewPassword`, `SmsOtpCode`). iOS and web were already correct.
- **Android login 401 mapping** — `ApiClient.send()` only throws `Unauthenticated`
  when the server returns `unauthenticated`, not on `invalid-credentials`
  (`ApiClientTest`).
- **Android auth/form UX** — `authScreen()` IME padding + vertical scroll on
  login/MFA/intro/onboarding; `FormDialog` roots at
  `navigationBarsPadding().imePadding()`.
- **Web modal Cancel/Save navigated to GitHub** — an unclosed footer anchor
  (`GitHub/a>`) left the `<a>` open and swallowed the modals. Closed across all
  14 client pages. (#105)
- **Settings form styling** — excluded checkbox/radio inputs from the
  `.auth-field input` text-field styling, scoped Family-tab input/select styling,
  set the autopay row to `display:flex`. (#106)
- **Pricing page in dark mode** — `.legal-card` / `.public-copy` / `.auth-card` /
  `.public-panel` used a `color-mix(… white)` gradient that washed out under
  `[data-theme="dark"]`. (#124)
- **Subscriptions row layout & category icon** — fixed the wrapping date ("July
  30??") and the broken Subscriptions category icon (`ICONS.Subscriptions`). (#125)
- **Stripe billing portal** — customer lookup via active subscription;
  `stripePortal` flag on `GET /api/billing/status`; the Pro dialog shows manage
  only when applicable.
- **Stripe checkout confirmation** — after `?pro=success` the UI didn't re-check
  entitlement, so it could show Free until reload (the `checkout.session.completed`
  webhook can land after the redirect). The Pro dialog now polls
  `/api/billing/status` until Pro is active.
- **Web More menu** — primary tabs scroll inside `.appbar-nav-scroll`; dropdown
  no longer clipped (`navbar.js`, `components.css`).
- **Settings tab bar** — horizontal scroll wrapper with edge fades.
- **iOS create-account consent** — the notice rendered twice; removed the
  duplicate (and a duplicate `accessibilityHint`).
- **LinkKit dSYM in CI** — post-build `dsymutil` on Plaid's LinkKit framework was
  sandbox-blocked in GitHub Actions / Xcode Cloud. Disabled
  `ENABLE_USER_SCRIPT_SANDBOXING` for the FiHaven target, made generation
  best-effort, and declared script inputs/outputs.
- **iOS Release / TestFlight archives** — the **Archive** and **Profile** schemes
  use the **Release** configuration (Run/Test stay Debug). Release sets
  `SWIFT_ACTIVE_COMPILATION_CONDITIONS` only on Debug and `ENABLE_DEBUG_DYLIB: NO`
  on Release, so `#if DEBUG` tooling (Settings → Developer, `FH_AUTOLOGIN`,
  StoreKit purchase skip) is not compiled into TestFlight or App Store binaries.
  `scripts/ios-testflight.sh` aborts if Release still defines the DEBUG flag.
- **iOS CI** — public `BudgetRuleSplits` initializer for native budget settings.

#### Security

- **The dev subscription override was not gated on being an admin** — the
  Developer settings tab was revealed to admins *or* to anyone with
  `localStorage.fh_dev === '1'`, and the override it controls was applied by
  `refreshEntitlement()` straight from `localStorage` with no role check at all:
  setting `fh_dev_entitlement = 'active'` in devtools flipped the client to Pro
  and unlocked every client-rendered Pro gate. `GET /api/data` and
  `GET /api/billing/status` now return `admin`; `applyEntitlement()` is the single
  choke point where a server payload becomes the live entitlement and honors a
  stored override only when that payload says admin — for everyone else the value
  is ignored *and erased*. `refreshEntitlement()` no longer short-circuits the
  network call, and a failed status fetch leaves the entitlement alone rather than
  applying the override. Server-side Pro gates (Plaid's `requirePro`, household
  caps, billing) were never bypassable this way. (#134)
- **Clear-text logging of a service-account path (CodeQL #36)** — `scripts/play-upload.js`
  echoed `KEY_FILE`, the path to the Google Play service-account credential
  (`js/clear-text-logging`). Split into "env var not set" vs "file not found" so
  the error stays actionable without printing the value. (#130)
- **Android implicit PendingIntents (CodeQL #31, #32, #35)** — inline explicit
  `setClassName` + `setPackage` at each `PendingIntent` construction in
  `NotificationScheduler` / `BillReminderReceiver`; removed the `ExplicitIntents`
  helper CodeQL couldn't trace (`java/android/implicit-pendingintents`). (#104)

#### Documentation

- **README** — Free vs Pro table and Roadmap & gaps; competitive-roadmap
  checklist updated (Tier 1/2 shipped in 1.4.x).
- **`docs/native-contract.md`** — perks, offers, reconcile, `autopayDay`,
  `offerReminders`, and `plaidUpdateBalances`.

---
## [1.4.2] (Latest Release) — 2026-06-26

| | |
|---|---|
| **Status** | Released |
| **iOS** | 1.4.2 (8) |
| **Android** | 1.4.2 (build 8) |

### Summary

> Clearer Pro and Family messaging when you sign up, plus a new source-available
> license. [Jump to technical changelog ↓](#142-technical-changelog)

**Pro & Family**

- Intro and onboarding explain what Pro includes (payoff planner, family
  sharing, calendar, rewards, category budgets).
- Paywall and Family settings spell out that invitees can join a household
  for free; Pro is for creating and managing a family.

**Legal & trust**

- Repo license is now **source available** (not AGPL) — code is public for
  transparency; running a competing hosted copy still requires permission.
- Terms of Use clarify how the license relates to using fihaven.app.

**Reliability**

- iOS builds on GitHub CI use the full Xcode toolchain again (fixes broken
  automated builds).

---

<a id="142-technical-changelog"></a>

### Technical changelog

#### Changed

- **License** — replace AGPL-3.0 with the **FiHaven Source Available
  License** ([`docs/source-available.md`](docs/source-available.md)).
- **Terms of Use** — account sharing, API misuse, Pro circumvention, family
  sharing in Pro, source license vs hosted service.
- **Intro Pro step** — feature highlights on web `/welcome`, iOS `IntroView`,
  and Android `IntroScreen`.
- **Post-signup onboarding** — Pro tour step; **See Premium plans** /
  **Continue with Free** on iOS and Android; StoreKit / Play Billing from
  onboarding on Android.
- **Web welcome Pro step** — **Start free trial** (Stripe Checkout), **Get
  Premium**, **Continue with Free** (`welcome.js`).
- **Paywall copy** — Family sharing as a Pro perk on web, iOS, and Android.
- **Settings → Family (non-Pro)** — upgrade entry points; invitees-join-free
  copy; Pro badge on locked Family row (iOS).
- Android `versionCode` 8; iOS **1.4.2 (8)**; [`scripts/ios-testflight.sh`](../scripts/ios-testflight.sh).

#### Fixed

- **iOS CI** — `ios.yml` uses `maxim-lobanov/setup-xcode@v1` (`latest-stable`)
  instead of `swift-actions/setup-swift@v2` (Swift 6.0.3 / SDK mismatch).

## [1.4.1] — 2026-06-26

| | |
|---|---|
| **Status** | Released |
| **Android** | 1.4.1 (build 6) |

### Summary

> Small security and policy update — safer household invite emails and clearer
> security documentation. [Jump to technical changelog ↓](#141-technical-changelog)

**Security**

- Household invite emails are validated more safely before sending.
- Security policy now documents when automated code scanning runs.

**Android**

- Intro screen icons respect right-to-left languages.

---

<a id="141-technical-changelog"></a>

### Technical changelog

#### Changed

- **Information security policy** — CodeQL on `main` pushes, weekly schedule,
  and manual dispatch (not every PR).
- **Android intro icons** — auto-mirrored Material icons for RTL locales.
- **Android token storage** — document intentional `EncryptedSharedPreferences`
  hold (`@file:Suppress("DEPRECATION")` on `PrefsTokenStore`).
- Android `versionCode` 6.

#### Fixed

- **Household invite email validation** — shared `isValidEmail()` with 254-char
  cap (CodeQL `js/polynomial-redos`, alert #33).

## [1.4.0] — 2026-06-26

| | |
|---|---|
| **Status** | Released |
| **Android** | 1.4.0 (build 4) |

### Summary

> Budget “lenses,” family sharing, smarter dashboard alerts, and subscription
> tools — the big 1.4 feature wave. [Jump to technical changelog ↓](#140-technical-changelog)

**Budget**

- Optional rules like 50/30/20, safe-to-spend, debt-focus, and envelope
  budgeting (Pro) on web, iOS, and Android.
- Dashboard widget shows budget status at a glance.
- Welcome flow can turn on simple 50/30/20 tracking in one tap.

**Family**

- Create or join a household; share bills, cards, and goals; live sync across
  devices.

**Subscriptions & spending**

- Subscription panel: cancel links, duplicate detection, trial countdowns.
- Reminders before free trials end (email + phone).
- Pro spending insights: “up X% on Dining vs last month.”

**Accessibility**

- iOS: Dynamic Type, VoiceOver, reduced motion.

---

<a id="140-technical-changelog"></a>

### Technical changelog

#### Added

- **Budget lenses** — 50/30/20, 80/20, 60/20/20, 70/20/10, custom,
  obligations-first, debt-focus (`debtFocusExtra`), envelope lite (Pro)
  (`budgetRule`, `client/js/budgetRules.js`).
- **Envelope editor & rollover (Pro)** — `envelopeAssign`, `envelopeRollover`.
- **Dashboard budget status widget** — `budgetStatus`, `BudgetStatusPanel.svelte`.
- **Richer dashboard alerts** — credit utilization, trial ending, promo cliffs.
- **Subscription action panel** — `subscriptionLinks.js`, `SubscriptionsFinder`.
- **Trial-ending reminders** — `last_trial_reminder_day`, `sendTrialReminder`.
- **Spending insights (Pro)** — `spendingInsights.js`.
- **Budget onboarding** — welcome toggle for detailed vs 50/30/20 lens.
- **Household sharing** — `/api/household`, `household.js`, `HouseholdView`, SSE.
- **iOS accessibility** — `Accessibility.swift`.
- **354 Vitest tests** (up from 326).

#### Changed

- **Settings → Budget lens** — mode, splits, debt-focus extra, envelope rollover.
- **Settings → Family** — membership, invites, shared-data controls.
- **Entitlements** — `householdMax` on billing responses.
- **`docs/competitive-roadmap.md`**, **`docs/native-contract.md`**.
- **Dependencies** — `stripe` 22.3.0, `@simplewebauthn/server` 13.3.2;
  Android `versionCode` 4.

#### Fixed

- **Contact page dark mode** — sub-panels no longer washed-out gray on dark hero.

## [1.3.0] — 2026-06-23

| | |
|---|---|
| **Status** | Released |
| **Android** | 1.3.0 (build 3) |

### Summary

> Customize your dashboard, get reminders on your phone and by email, and sign
> in with Apple or Google — all platforms. [Jump to technical changelog ↓](#130-technical-changelog)

**Dashboard**

- Switch between classic layout and reorderable widgets (overview, cash flow,
  alerts, upcoming, net worth, spending, goals, subscriptions, income history).

**Income**

- Income history chart and hourly-rate pay (hours per week).

**Reminders**

- Bill reminders by email and optional notifications on your phone.
- Choose how many days ahead, what hour they fire, and a weekly “week ahead”
  email digest.

**Sign-in**

- Branded Sign in with Apple and Google buttons on web, iOS, and Android.

---

<a id="130-technical-changelog"></a>

### Technical changelog

#### Added

- **Customizable dashboard** — Classic vs Widgets; nine widgets (`dashboardLayout`,
  `dashboardWidgets`, `client/js/dashboardWidgets.js`).
- **Income history** — 12-month trend, bonuses, average pay, `hoursPerWeek`
  (`IncomeHistory.svelte`, native History tab).
- **Local bill reminders** — iOS `NotificationScheduler`; Android
  `NotificationScheduler`, `BillReminderReceiver`, `BootReceiver`.
- **Configurable reminders** — `reminderLeadDays`, `notifyHour`, `remindOnDueDay`.
- **Weekly digest email** — `weeklyDigest`, `sendWeeklyDigest`.
- **Branded social sign-in** — Apple/Google logos on all clients.
- **Dev entitlement override** — DEBUG-only Pro simulation.
- **`scripts/mail-check.js`** — SMTP diagnostic.
- **326 Vitest tests** (up from 293).

#### Changed

- **Bill-reminder emails** — lead-time and due-day copy from user settings.
- **Settings → Notifications** — unified section on all clients.
- **Android main scaffold** — widget dashboard, income history widget.
- **`native-contract.md`**, README / platform READMEs.
- **`.gitignore`** — `*.secret.md`, `mail-server-logins.md`.
- **Dependencies** — `stripe` 22.2.3; Android `versionCode` 3.

#### Fixed

- Hourly income without `hoursPerWeek` contributes $0 (not flat monthly rate).

## [1.2.3] — 2026-06-17

| | |
|---|---|
| **Status** | Released |

### Summary

> Public marketing site, social login everywhere, and a more trustworthy
> Android app identity. [Jump to technical changelog ↓](#123-technical-changelog)

**Website**

- FAQ, pricing, security, and contact pages; better SEO and discovery.

**Sign-in**

- Optional Sign in with Apple and Google on web, iOS, and Android.

**Money tracking**

- Rolling budget periods with a custom start date.
- Autopay memory fixes so undone payments aren’t re-marked.
- Clear all your data from settings (with password confirmation).

**Android**

- App package renamed to `app.fihaven` (matches iOS and web).

---

<a id="123-technical-changelog"></a>

### Technical changelog

#### Added

- **Marketing site** — FAQ, pricing, security, contact; refreshed homepage/legal.
- **SEO & discovery** — sitemap, robots, manifest, `security.txt`, JSON-LD,
  IndexNow (`npm run indexnow`).
- **Social sign-in** — `server/oauth.js`, `client/js/social-login.js`.
- **Rolling-period anchor** — `periodAnchor`.
- **Autopay memory** — per-month `autopayDone`; $0 items no longer loop.
- **Clear data** — `POST /api/account/clear-data`.
- **Onboarding goals** — tailor default tab order.
- **Deploy templates** — `upload.example.sh`, `rollback.example.sh`.
- **Billing profile** — “Member since” / “Pro for”.
- **293 Vitest tests** (up from 275).

#### Changed

- **Android package** — `com.danielhipskind.fihaven` → `app.fihaven`.
- **iOS bundle** — `app.fihaven`, StoreKit IDs, intro carousel, Google Sign-In.
- **Card recommendations** — 0% APR non-promo → minimum only.
- **Account deletion** — type `DELETE ACCOUNT DATA`; TOTP when 2FA on.
- **WebAuthn RP origin** — `PUBLIC_ORIGIN` / `https://fihaven.app`.
- **`native-contract.md`** — production base URL, product IDs.
- **Dependencies** — `better-sqlite3` 12.11.1; Vitest 4.1.9.

#### Fixed

- Autopay re-marking after user removes auto-generated payment.
- Rolling periods spanning months reading wrong `autopayDone` buckets.
- Date-less payments in calendar mode placed by `monthKey` only.
- iOS card skip without warning when minimum still due.

## [1.2.2] — 2026-06-15

| | |
|---|---|
| **Status** | Released |

### Summary

> Quality polish: show/hide passwords, more automated tests, refreshed app
> icons, and CI fixes. [Jump to technical changelog ↓](#122-technical-changelog)

**Usability**

- Show/hide password toggle on login and settings (all platforms).

**Quality**

- Many new automated tests (unit + integration) for core flows.
- Refreshed app icons on iOS and Android.

---

<a id="122-technical-changelog"></a>

### Technical changelog

#### Added

- **Password show/hide** — web, iOS `RevealableSecureField`, Android auth/settings.
- **Integration test suite** — nine flows (auth, export, scheduler, etc.).
- **`subscriptionsFinder.js`** — shared recurring-subscription detection.
- **Server unit tests** — emails, mail, scheduler, rate limits, tokens, etc.
- **Expanded client unit tests** — payoff, autopay, rewards, theme, etc.
- **275 Vitest tests** total.

#### Changed

- **App icons** from `client/public/icon.svg`.
- **Android dashboard** — branded `ScreenHeader`, grouped upcoming card.
- **`native-contract.md`** — tab list and Pro-gating matrix.
- **README badges** — Swift 6.3.1, Kotlin 2.3.21.
- **Android dependencies** — Compose BOM 2026.05.01, Plaid 5.5.2, etc.
- **CodeQL Action v4**.

#### Fixed

- **Rolling-period `boundsForKey`** round-trip in `period.js`.
- **Kotlin pinned to 2.3.21** for CodeQL ([github/codeql#21938](https://github.com/github/codeql/issues/21938)).

## [1.2.1] — 2026-06-14

| | |
|---|---|
| **Status** | Released |

### Summary

> Bills on any schedule, a dedicated Spending tab, native app polish, and
> payment-history editing. [Jump to technical changelog ↓](#121-technical-changelog)

**Bills & spending**

- Weekly, bi-weekly, quarterly, and annual bills with real due dates.
- Spending gets its own tab (separate from Budget).
- Subscriptions screens on iOS and Android.

**Native apps**

- FiHaven branding, app icons, and cleaner bill/card interactions.
- Edit or delete payment history entries with a long-press.

**Settings**

- Hide fully paid items on the dashboard.
- Bio-lock grace period (wait before Face ID / fingerprint is required again).

---

<a id="121-technical-changelog"></a>

### Technical changelog

#### Added

- **Bill frequency scheduling** — Weekly through Annually on all clients + server.
- **Bill active windows** — `startDate` / `endDate`; **Next: {date}** labels.
- **Spending tab** — manual spend logging on all clients.
- **Subscriptions screens** — iOS and Android dedicated views.
- **Hide fully paid on dashboard** setting.
- **Bio-lock grace period** — Never through 30 minutes (Android custom 1–60).
- **Payment history edit/delete** — long-press on iOS and Android.
- **Card preset auto-detect** from rewards database.
- **Android Turnstile captcha** on auth.
- **Web navbar “More”** dropdown.
- **Vitest suite** (~92% coverage on core web logic).

#### Changed

- **Dashboard period model** — prorate income; obligations filter by period.
- **Card payments** decrement live balance (`applyCardPaymentDelta`).
- **Rewards** — `pointValue`, rotating 5% pools, expanded presets.
- **Pro paywall perks** aligned across clients.
- **Cards tab (native)** — card-only summary; net worth on Budget.
- **FiHaven branding (native)** — icons, toolbar monogram, segmented paid-goal UI.
- **Android** — production API default, lenient JSON decode, loading gate.
- **iOS project** — Xcode 26 settings, launch screen, deployment 18.6.
- Dependency bumps: nodemailer 9, Android billing/crypto/lifecycle.

#### Fixed

- **Android data load** — legacy numeric payment IDs no longer wipe dataset.
- **Bills UX (native)** — business/name layout; tap status to pay/undo/un-skip.
- **Rolling `shiftPeriod` bug** in web period logic.
- **CI / security** — Codecov, AES-GCM biometric key, HTML sanitization loop.

## [1.2.0] — 2026-06-13

| | |
|---|---|
| **Status** | Released |
| **Version** | 1.2.0 (web, iOS, Android) |

### Summary

> Full budgeting, rewards optimizer, net worth, savings goals, optional bank
> sync (Pro), and Free vs Pro across all platforms.
> [Jump to technical changelog ↓](#120-technical-changelog)

**New capabilities**

- Loans tab, rewards optimizer (“which card for this purchase?”), transaction
  logging, net worth, savings goals, and subscription finder.
- Optional bank linking via Plaid (Pro) — adds transactions, never overwrites
  your manual entries.
- Autopay auto-mark (Pro), skip-this-month, income adjustments.

**Free vs Pro**

- Pro unlocks payoff planner, calendar, history, rewards optimizer,
  subscriptions, category budgets, bank sync, and autopay mark.

**Security**

- Rate limiting, stronger Android app lock, CodeQL fixes.

---

<a id="120-technical-changelog"></a>

### Technical changelog

#### Added

- **Loans tab** — separate from Cards; minimum vs pay-in-full.
- **Rewards optimizer** — `effectiveRate`, 16-card preset DB, promo exclusion.
- **Transactions** — `SpendTransaction` with `source`/`plaidId`/`pending`.
- **Net worth & accounts** — assets minus liabilities.
- **Savings goals** — target, saved, date, suggested monthly contribution.
- **Budget suite** — income, period model, category budgets, cushion runway.
- **Subscription finder** — recurring detection, price hikes, stale subs.
- **Income adjustments** — one-time and recurring.
- **Skip-this-month** — synced, reversible.
- **Bank sync (Plaid, Pro)** — Link, OAuth, `transactionsSync`, webhooks,
  encrypted tokens, reconnect flow.
- **Autopay auto-mark (Pro)** — server scheduler + client back-fill.
- **Per-IP rate limiting** — `express-rate-limit`.
- **Free vs Pro tiering** — `PRO_TABS`, `ProGate`, server `pro` entitlement.
- **Sort + Filter sheet** — Bills and Cards on all platforms.
- iOS **PrivacyInfo.xcprivacy**; in-app Privacy / Terms links.

#### Changed

- **Settings** — Profile / Preferences / Payments; bank linking.
- **Android biometric app lock** — hardware Keystore, Class-3 biometrics,
  fails closed; defaults on when available.
- Node 24 in CI; Actions checkout/setup v5; Tailwind v4 CLI.
- Version **1.2.0** across web, iOS, Android.
- README refresh — Free vs Pro, Plaid API, `/api/data` shape.

#### Fixed

- Web navbar Loans/Rewards icons showing literal `"undefined"`.
- Payment History blank when only skipped items; missing-date records.
- iOS payment-history triplicates (`Payment.id` → `String`).
- Duplicate-key crash from colliding `Date.now()` IDs.
- Loan/cards reference bug.
- ReDoS in Bearer parser; biased backup-code randomness.

#### Security

- CodeQL: rate limiting, ReDoS, biased random, insecure Android local auth.

## [1.1.0] — 2026-06-09

| | |
|---|---|
| **Status** | Released |

### Summary

> Account recovery, email reminders, FiHaven Pro subscriptions, and native app
> onboarding. [Jump to technical changelog ↓](#110-technical-changelog)

**Accounts**

- Password reset, email verification, and recovery flows on web and native.

**Pro**

- Stripe checkout and promo codes; subscription overlay on web.

**Native apps**

- Intro tour, post-signup onboarding, customizable tabs, bank linking screen,
  and about/licensing page on iOS.

**Compliance**

- Data retention and information security policy documents.

---

<a id="110-technical-changelog"></a>

### Technical changelog

#### Added

- **Account recovery / reset / verification** — `tokens.js`, `emails.js`,
  recover/reset/verify/welcome pages.
- **Email reminders & monthly summaries** — `scheduler.js`, user prefs.
- **FiHaven Pro overlay** — `pro.js`, Stripe checkout, promo redemption.
- **Plaid scaffolding** — `server/plaid.js`, `routes/plaid.js`.
- **iOS onboarding & navigation** — IntroView, OnboardingView, VerifyEmailView,
  TabCatalog, TabsEditorView, BankView, AboutView.
- **App-icon generation script.**
- **Compliance docs** — data retention, information security policy;
  `security@fihaven.app`.
- App environment / debugging utilities.

#### Fixed

- `package-lock.json` / Svelte / Tailwind alignment (Tailwind 3.4.17).

## [1.0.0] — 2026-06-05

| | |
|---|---|
| **Status** | Released |

### Summary

> First public release — bills, cards, budget, debt planner, and native apps
> with real accounts and sync. [Jump to technical changelog ↓](#100-technical-changelog)

**Core app**

- Track bills and credit cards (including 0% promo periods), monthly budget,
  payment history, debt-payoff planner, and due-date calendar with iCal feed.

**Accounts & security**

- Sign up with password; optional MFA (authenticator app, passkeys, email codes).
- Data syncs to your account on web, iOS, and Android.

---

<a id="100-technical-changelog"></a>

### Technical changelog

#### Added

- **Core dashboard** — bills, cards, budget, history, payoff planner, calendar
  + iCal feed.
- **Accounts & sync** — Express + SQLite, opaque sessions, CSRF, Turnstile, MFA;
  TOTP secrets AES-256-GCM at rest.
- **Native clients** — iOS/macOS (SwiftUI) and Android (Compose); shared
  `/api/data` model.
- Project setup — FiHaven rename, GitHub docs, workflows, metadata.

[1.6.1]: https://github.com/Greigh/FiHaven/releases/tag/v1.6.1
[1.6.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.6.0
[1.5.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.5.0
[1.4.2]: https://github.com/Greigh/FiHaven/releases/tag/v1.4.2
[1.4.1]: https://github.com/Greigh/FiHaven/releases/tag/v1.4.1
[1.4.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.4.0
[1.3.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.3.0
[1.2.3]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.3
[1.2.2]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.2
[1.2.1]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.1
[1.2.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.2.0
[1.1.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.1.0
[1.0.0]: https://github.com/Greigh/FiHaven/releases/tag/v1.0.0
