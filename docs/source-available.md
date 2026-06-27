# FiHaven source available (not open source)

FiHaven publishes its source on GitHub for **transparency and trust** —
especially for a personal-finance app — but it is **not** open source in
the “use it however you want” sense.

| | **Open source (e.g. MIT, AGPL)** | **FiHaven (source available)** |
|---|----------------------------------|--------------------------------|
| Inspect code | Yes | Yes |
| Contribute fixes | Yes | Yes (PRs welcome) |
| Run a public hosted copy for others | Often yes (AGPL with conditions) | **No** without written permission |
| Strip Pro / billing and redistribute | Varies | **No** |
| Commercial reuse | Often yes | **No** without written permission |

## What protects the product

1. **This license** ([`LICENSE`](../LICENSE)) — no production hosting or
   commercial redistribution without permission.
2. **Terms of Use** ([`client/terms.html`](../client/terms.html)) —
   account abuse, API misuse, and circumventing Pro on the hosted service.
3. **Server-side entitlements** — Pro features that matter (Plaid, household
   owner caps, billing verification) are enforced on `fihaven.app`, not only
   in client UI.

## Allowed without asking

- Reading the code
- Security research and responsible disclosure
- Local dev / personal evaluation (not exposed to other users)
- Bug reports and pull requests

## Requires written permission

- Operating FiHaven (or a fork) as a service for others
- Commercial use of the codebase
- Redistribution of modified builds

Contact: **security@fihaven.app**

## For app users

Downloading FiHaven from the App Store, Google Play, or using
**fihaven.app** is governed by the **Terms of Use** and store terms —
not by this repository license. The apps are free to use; **FiHaven Pro**
is an optional subscription.
