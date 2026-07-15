# Maintainer docs



## Layout

| Path | Tracked? | Purpose |
|------|----------|---------|
| `docs/maintainer/` | Yes | Shared maintainer notes (this file). |
| [`store-launch-checklist.md`](store-launch-checklist.md) | Yes | Public App Store + Play launch: demo account, review notes, Data safety, go-live flip, ops. |
| [`store-listing-copy.md`](store-listing-copy.md) | Yes | Paste-ready App Store Connect + Play listing, keywords, Data safety, IAP product IDs. |
| `docs/local/` | **No** (gitignored) | Your App Store Connect copy-paste notes, draft listing text, API key paths. Start with `docs/local/app-store-connect.md`. |
| `docs/testflight-license-agreement.txt` | Yes | Plain-text Terms for TestFlight external testers. Keep in sync with `client/terms.html` + beta notice at top. |
| `docs/*.md` (policy markdown) | Yes | Source for compliance policies. |
| `docs/pdf/` | **No** (gitignored) | PDF exports — run `npm run generate:pdfs` after policy changes. |
| `*.p8`, `AuthKey_*.p8` | **No** | App Store Connect API keys — never commit. |

## Already tracked but should be ignored?

`.gitignore` only affects **untracked** files. If something still appears in `git status` after you add a rule, untrack once (keeps your local copy):

```sh
git rm --cached -- docs/local/app-store-connect.md   # example
git rm --cached -- docs/pdf/*.pdf
```

Then commit the removal. New clones will not receive those paths.

## Regenerate PDFs

From repo root (requires Chrome/Chromium):

```sh
npm run generate:pdfs
```

Output: `docs/pdf/*.pdf` from `docs/*-policy.md`.

## Local runtime data (`data/`)

The `/data/` directory is gitignored. On first `npm run dev` the server creates:

- `cleartab.db` — SQLite (legacy filename; see `server/db.js`)
- `mfa.key` — optional auto-generated TOTP encryption key

Nothing here ships with releases. Delete `cleartab.db*` for a clean local DB. Tests can set `FIHAVEN_TEST_DB_PATH`.

## TestFlight license text

When `client/terms.html` changes:

1. Update the “Last updated” line and body to match the live Terms (sections 1–14).
2. Keep the **BETA NOTICE** block at the top for TestFlight builds.
3. Paste the full file into App Store Connect → TestFlight → Test Information → License Agreement.

Do **not** paste the GitHub `LICENSE` (source-available code license) into TestFlight.
