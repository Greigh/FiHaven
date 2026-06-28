# Contributing to FiHaven

Thanks for helping improve FiHaven.

## Before you start

- Read the main [README](../README.md) and the native contract in [docs/native-contract.md](../docs/native-contract.md) if your change touches the web, iOS, Android, or shared API behavior.
- FiHaven is **source available** — see [LICENSE](../LICENSE) and [docs/source-available.md](../docs/source-available.md). Contributions are welcome; operating a competing hosted instance is not.
- Keep changes focused. Small, well-scoped pull requests are easier to review and ship.

## Maintainer-only files

Do not commit personal notes or generated artifacts:

- `docs/local/` — App Store Connect copy-paste notes (see [docs/maintainer/README.md](../docs/maintainer/README.md))
- `docs/pdf/` — policy PDFs (`npm run generate:pdfs`)
- `.env`, `*upload.sh`, `*.p8` signing keys

## Setup

```bash
npm install
npm run dev
```

That starts the local web app and server. For native work, follow the platform-specific instructions in the iOS and Android READMEs.

## What to include

- Clear description of the problem and the fix.
- Screenshots or short screen recordings for UI changes when helpful.
- Notes about any schema, API, or contract changes.

## Code quality

- Match the existing style and naming in the surrounding files.
- Avoid unrelated refactors.
- Update docs when behavior changes.

## Pull requests

- Link related issues when possible.
- Mention any manual testing you performed.
- Call out breaking changes clearly.

## Reporting bugs

If you find a bug, open an issue with the steps to reproduce, expected behavior, and actual behavior.
