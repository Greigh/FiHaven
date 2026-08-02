# Store release notes

Paste-ready Google Play and App Store copy, one folder per version.

**Neither upload script reads these.** [`play-upload.js`](../../scripts/play-upload.js)
and [`ios-testflight.sh`](../../scripts/ios-testflight.sh) push the binary only,
so this text goes into the consoles by hand. Keeping it in the repo means the
wording is reviewable in a PR and reusable for the next build.

## Convention

```
docs/release-notes/v<version>/<builds>.md
```

The folder carries the marketing version; the filename carries the build
numbers, so a version that ships several builds can hold several files —
`v1.6.1/ios16-android38.md` sits alongside `v1.6.1/ios17-android39.md`. Where the
changelog never recorded build numbers, the file is `store-notes.md`.

## Character limits

| Field | Limit | Notes |
|---|---|---|
| Google Play — What's new | **500** | Per language. Hard cap; the console rejects longer. Newlines count. |
| App Store — What's New in This Version | 4000 | |
| TestFlight — What to Test | 4000 | |

Each file states its own Play count so you can see the headroom before editing.

## A caveat on the older folders

Everything before 1.6.1 is **reconstructed from [CHANGELOG.md](../../CHANGELOG.md)**.
The text actually submitted to the stores at the time was typed straight into the
consoles and wasn't kept, so these are the release summaries rewritten in store
voice — accurate as to what shipped, but not a record of what was published.
1.6.1 onward is the real copy.

## Index

| Version | Builds | Date | Notes |
|---|---|---|---|
| [1.6.1](v1.6.1/ios21-android43.md) | iOS 21 · Android 43 | 2026-08-02 | Sign-out ends the session (reminders stop), archived items stop driving reminders and totals, web subscriptions manageable again |
| [1.6.1](v1.6.1/ios20-android42.md) | iOS 20 · Android 42 | 2026-08-01 | Pro screen opens on the plans, Bank screen flattened, a lapsed Family plan turns the household read-only |
| [1.6.1](v1.6.1/ios19-android41.md) | iOS 19 · Android 41 | 2026-08-01 | Multi-day reminders, branded emails, skips in History, new-month review on phones |
| [1.6.1](v1.6.1/ios18-android40.md) | iOS 18 · Android 40 | 2026-07-31 | App Review resubmission: App Store code redemption, account deletion for Apple/Google sign-ins |
| [1.6.1](v1.6.1/ios17-android39.md) | iOS 17 · Android 39 | 2026-07-29 | Push actually arrives; pay what's left; 9 full-color issuer logos |
| [1.6.1](v1.6.1/ios16-android38.md) | iOS 16 · Android 38 | 2026-07-28 | Income vs. spending; card amounts & logos (38 resubmits 37) |
| [1.6.0](v1.6.0/ios1-android20.md) | iOS 1 · Android 20 | 2026-07-14 | Bank sync works; two data-loss fixes |
| [1.5.0](v1.5.0/ios10-android18.md) | iOS 10 · Android 18 | 2026-07-09 | Net Worth tab, archive, push |
| [1.4.2](v1.4.2/ios8-android8.md) | iOS 8 · Android 8 | 2026-06-26 | Pro/Family messaging, source-available license |
| [1.4.1](v1.4.1/android6.md) | Android 6 | 2026-06-26 | Security & policy update |
| [1.4.0](v1.4.0/android4.md) | Android 4 | 2026-06-26 | Budget lenses, family sharing |
| [1.3.0](v1.3.0/android3.md) | Android 3 | 2026-06-23 | Widget dashboard, reminders, social sign-in |
| [1.2.3](v1.2.3/store-notes.md) | not recorded | 2026-06-17 | Public site, social login |
| [1.2.2](v1.2.2/store-notes.md) | not recorded | 2026-06-15 | Quality polish |
| [1.2.1](v1.2.1/store-notes.md) | not recorded | 2026-06-14 | Bill schedules, Spending tab |
| [1.2.0](v1.2.0/store-notes.md) | not recorded | 2026-06-13 | Loans, rewards optimizer, Free vs Pro |
| [1.1.0](v1.1.0/store-notes.md) | not recorded | 2026-06-09 | Account recovery, Pro subscriptions |
| [1.0.0](v1.0.0/store-notes.md) | not recorded | 2026-06-05 | First public release |

iOS build numbers are missing for 1.4.1 down to 1.0.0 because the changelog's
version block never recorded them, not because those releases were Android-only —
their summaries describe iOS changes.
