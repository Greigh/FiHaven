---
title: "FiHaven — Changelog"
description: "What's new in FiHaven — releases, features, updates, and improvements across Web, iOS, and Android."
url: https://fihaven.app/changelog
---

Releases & Updates

# Changelog

Every notable update, feature addition, security improvement, and bug fix across the FiHaven Web app, iOS, Android, and backend services.

1.6.7 (Build 59) Latest Beta

October 6, 2026

**Pipeline and CI fixes; no user-facing changes since build 58**

- **Same app as build 58** — this build ships release-pipeline repairs; the 1.6.6 train (native Mac app, setup wizard, payoff honesty, surviving sessions, enforced CSP) is unchanged
- **CI green on both remotes** — jobs that can't run on the Forgejo mirror now skip instead of dying at action-clone, and coverage uploads moved to the standalone Codecov CLI
- Android build unpinned from a stale Java-runtime download URL that was failing every CI run at startup

iOS 1.6.7 (59) Android 1.6.7 (59) Web fihaven.app Server API

1.6.7 (Build 58) Beta

October 4, 2026

**The 1.6.6 train — the native Mac app, the seven-step setup wizard, the payoff fix, surviving sessions, enforced CSP — plus a full security and correctness audit across server and clients**

- **FiHaven is a real Mac app** — source-list sidebar, sortable tables with multi-select bulk actions on every list screen, and full keyboard bindings
- **Full security audit landed** — household field allowlists close stored XSS, sign-in survives transient errors, single-use credentials are atomic, and multi-process deploys share rate limits and live sync
- Seven-step setup wizard, the security-check reveal, an honest payoff plan, and an enforced Content-Security-Policy

iOS 1.6.7 (58) Android 1.6.7 (58) Web fihaven.app Server API

1.6.4 (Build 55) Beta

September 15, 2026

**Account Balances bank review, security hardening, memory leak fixes, and public changelog**

- Account Balances bank review, security hardening, memory leak fixes, and public changelog

iOS 1.6.4 (55) Android 1.6.4 (55) Web fihaven.app Server API

1.6.3 (Build 54) Beta

September 15, 2026

**Account Balances Bank Review & Comprehensive Security Hardening** — Review, accept, or decline bank balance updates directly inside the Account Balances tab for checking, savings, and investment accounts, coupled with battery-saving offline sync error handling and multi-account security isolation on shared devices.

- **Account Balances Bank Review:** Checking, savings, and investment accounts linked to an institution now display pending balance changes with one-tap Accept or Decline actions. Custom names, types, and notes are strictly preserved.
- **Sync Error & Battery Protection:** Halts retry loops immediately on terminal 4xx rejections (such as payload size limits or suspended accounts) with a clear status banner, saving battery and data rather than falsely claiming to be "Offline".
- **Multi-Account Shared Device Isolation:** Cold launch offline cache loading now validates authenticated user identity before reading disk snapshots, preventing prior user data exposure on shared phones.
- **Push Token Lifecycle Fix:** Made push token retirement async during sign-out, guaranteeing unregistration before Keychain tokens are deleted. Tokens are automatically cleared upon account deletion.
- **SSE Stream Stability:** Fixed retain cycle memory leak in household live delta streams and added cancellation on view disposal.
- **Expanded Test Coverage:** 108 test files passed in Vitest (1,364 tests), 100% Android unit tests, and 1,602 Swift core checks.

iOS 1.6.3 (54) Android 1.6.3 (54) Web fihaven.app Server API

1.6.3 (Build 53) Beta

September 2, 2026

**Linked Bank Account Picker for Asset Accounts** — Pin checking, savings, or investment accounts to a specific bank institution directly from the account editor.

- **Asset Account Link Picker:** Pick the bank account a row follows so a sync can find it without relying on exact name matching. "Don't link this account" keeps an account manual.
- **Wider Post-Sync Prompt:** The post-link / post-sync prompt now offers bank balance suggestions for asset accounts alongside credit cards.
- **Native Dependencies:** Updated Compose BOM, Firebase BOM, Plaid Link SDK, and Gradle wrapper.

iOS 1.6.3 (53) Android 1.6.3 (53) Web fihaven.app

1.6.2 Stable Release

August 23, 2026

**Asset Accounts Tab & Net Worth Tracking** — Dedicated Balances tab separating checking, savings, and investments from liabilities, complete with net worth computation and bank suggestions.

- **Balances Tab:** Centralized place to track liquid cash, emergency funds, and investments with clear asset-to-debt visualization.
- **Build Counter Alignment:** Aligned iOS and Android build numbers to a single unified counter starting at build 49.
- **Account Proposal Queue:** Backend support for matching depository institution accounts to user-defined balances.

iOS 1.6.2 (49-52) Android 1.6.2 (49-52) Web

Looking for the full technical commit log or earlier version history?

[View Complete Git Changelog →](https://github.com/Greigh/FiHaven/blob/main/CHANGELOG.md)
