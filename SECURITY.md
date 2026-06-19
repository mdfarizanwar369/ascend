# Ascend Security

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Email `security@getascend.fit` with a clear description, reproduction steps, and the affected page or API endpoint.

We will acknowledge a complete report as soon as practical, investigate it privately, and coordinate a fix before public disclosure.

## Secret handling

- Never commit `.env` files, Firebase service-account files, API keys, private keys, database URLs, or webhook secrets.
- Store production secrets in Railway variables and rotate a secret immediately if it is shared publicly.
- Use separate credentials for development and production.
- Keep Firebase, Railway, Cloudflare, GitHub, Lemon Squeezy, Gemini, and storage accounts protected with multi-factor authentication.

## Supported version

Security fixes are applied to the current production version on the `main` branch.

