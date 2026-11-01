# Changelog

## 0.3.0

- Requests time out after 10 s and come back as a labelled error ("timed out", "rate limited", "no route") instead of hanging.
- Each tool is defined once: its zod input is both the MCP schema and the validation.
- Tools split into `keyless.ts` and `keyed.ts`; issuer names read from the last " - " of the token name.
- Quotes are cached for 15 s, so agents repeating a question do not hit Jupiter again.
- Token list refreshed weekly by a GitHub Action that opens a pull request.

## 0.2.2

- `compare_issuers` shows each token against the real share price when a key is set.

## 0.2.1

- Keyless mode: `list_tokens`, `compare_issuers`, `quote_sizes` work without an API key.
- First release published from CI with npm provenance.

The `v0.2.0` tag exists but was never published to npm (trusted publishing was not set up yet).

## 0.1.0

- `search_stocks`, `quote_buy`, `risk_score` with a tokens.xyz key.
