# Security Policy

## Supported versions

Only the latest version on `main` (the version shown bottom-right on the live site) is supported. Fixes are made there.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.**

Report it privately using GitHub's **Report a vulnerability** option on this repository's **Security** tab (private vulnerability reporting). If that isn't available, contact the maintainer through their GitHub profile and ask for a private way to send details.

Please include what you found, how to reproduce it, and the impact you think it has. Don't include real people's personal data in your report.

This is a hobby project run by one person. We'll aim to acknowledge reports within a week and to fix real issues as quickly as is reasonable, but there are no guarantees or bounties.

## Scope

In scope: the live site at `wheresmcgraeballs.co.uk`, its `/api/*` endpoints, and the code in this repository. For example: injection or XSS, bypassing Turnstile, rate limiting or input validation, reading hidden sightings, or abusing the admin endpoints.

Out of scope:

- denial-of-service, load or spam testing, and automated scanners that generate heavy traffic (the site runs on a free plan with hard limits);
- social engineering and physical attacks;
- issues in Cloudflare, OpenStreetMap, Leaflet or other third-party services themselves. Report those to them.

Please test only against your own data, don't access or modify other people's data, and stop once you've shown the problem.

## Privacy and secrets

- IP addresses are stored only as salted SHA-256 hashes, for rate limiting. Raw IPs are not stored.
- Secrets (`TURNSTILE_SECRET`, `ADMIN_TOKEN`, `IP_HASH_SALT`) are Cloudflare Worker secrets and must never be committed. If you find one in the repository or its history, report it privately as above.
