# Scripts

| Path | Purpose |
|---|---|
| [`promo.js`](promo.js) | Create and manage FiHaven promo codes (`npm run promo`). Deployed to production. |
| [`submit-indexnow.js`](submit-indexnow.js) | Notify Bing/Yandex after marketing deploys (`npm run indexnow`). |
| [`indexnow-urls.js`](indexnow-urls.js) | Public URL list shared with sitemap (used by submit-indexnow). |
| [`generate-icons.sh`](generate-icons.sh) | Regenerate iOS/Android launcher icons from `client/public/icon.svg` (`npm run generate:icons`). |
| [`examples/upload.example.sh`](examples/upload.example.sh) | Deploy template — copy to gitignored `upload.sh` at repo root. |
| [`examples/rollback.example.sh`](examples/rollback.example.sh) | Restore a pre-deploy backup on the VPS (`npm run rollback`). |
| [`dev/generate-pdfs.js`](dev/generate-pdfs.js) | Export `docs/*.md` policies to PDF (`npm run generate:pdfs`). Local maintainer tool. |
| [`dev/plaid-sandbox-check.js`](dev/plaid-sandbox-check.js) | One-off Plaid sandbox API smoke test (`npm run plaid:sandbox`). |

`examples/` and `dev/` are **not** rsynced to production during deploy.
