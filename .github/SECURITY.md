# Security Policy

## Supported versions

Security fixes are applied to the active mainline branch and current release line, when one exists.

## Reporting a vulnerability

Please do not open a public issue for security problems.

Use GitHub's private vulnerability reporting / security advisory flow for this repository instead.

Include as much detail as possible:

- What you found
- The affected area
- How to reproduce it
- Any proof-of-concept details
- Whether the issue is already public

## What to expect

We will review the report, confirm the impact, and coordinate a fix before public disclosure when appropriate.

## Information security policy

FiHaven's documented information security policy — covering risk management, data handling, encryption, access control, incident response, third-party processors, and Plaid data handling — is maintained at [`docs/information-security-policy.md`](../docs/information-security-policy.md).

PDF exports for auditors (optional) live in `docs/pdf/` and are generated from that markdown via `npm run generate:pdfs`; they are not committed to the repository.
