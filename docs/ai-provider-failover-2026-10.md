# AI Assistant: Gemini primary, Grok fallback (2026-10-16)

Local only; not deployed. No Prisma change: everything lives in the existing `AppSetting` table (`AI_PROVIDER_CONFIG`, `AI_PROVIDER_STATUS`, new `AI_PROVIDER_RUNTIME`) and `AdminAuditLog`.

## Before you deploy
1. **`AI_SECRET_ENCRYPTION_KEY` must be set in Coolify as a persistent environment secret** (`openssl rand -base64 32`) and must never change. It encrypts the saved API keys. If it changes, saved keys become unreadable (the Admin screen says so, Gemini falls back to `GEMINI_API_KEY`, Grok shows "Not configured"). The server does not generate a key, and logs a warning at startup in production if it is missing. I could not check Coolify from here.
2. Keep `GEMINI_API_KEY` in the environment as the safety net. Optional: `GROK_API_KEY` (or `XAI_API_KEY`).

## How a question is answered
local reply? → quota check → mask PII → build the shared conversation → **primary** (one attempt, 8 s) → if it fails, **fallback** (one attempt, 10 s) → else "temporarily unavailable". Total ceiling 18 s. Sequential, never both at once. The allowance counts saved answers, so a failure costs nothing and a fallback answer costs one.

Env knobs: `AI_ASSISTANT_TIMEOUT_MS` (8000), `AI_ASSISTANT_FALLBACK_TIMEOUT_MS` (10000), `AI_ASSISTANT_TOTAL_TIMEOUT_MS` (18000), `AI_CIRCUIT_FAILURES` (3), `AI_CIRCUIT_COOLDOWN_SECONDS` (120), `AI_CIRCUIT_CONFIG_COOLDOWN_SECONDS` (600), `AI_CIRCUIT_MAX_COOLDOWN_SECONDS` (900), `AI_GROK_MODELS` (adds model names to the allowlist).

## Circuit breaker (per provider)
3 transient failures in a row open it; a rejected key, missing model, bad request or no credit opens it at once. Rest 2 min (10 min for configuration errors), doubling on each failed return up to 15 min. When the rest ends ONE request is the probe; success closes it. A passing "Test connection" never clears it.

## Keys
Hidden by default (last four only). **Show** = one POST to `/api/admin/ai-assistant/providers/:provider/reveal-key` (Super Admin only, rate-limited, `no-store`, audited as `AI_PROVIDER_KEY_REVEALED` with the provider and whether it came from `admin` or `environment`). It returns the key in use: the Admin-saved key if there is one, else the server-environment key. The browser keeps it in memory for 60 s and drops it on Hide, tab hide, reload or navigation. A blank key on Save keeps the saved key. **Remove** is a separate button and affects one provider.

## Local setup
`AI_SECRET_ENCRYPTION_KEY` has been added to the (gitignored) local `.env`; restart `npm run dev` to pick it up. Production needs its own value, set once in Coolify and never changed. Tests that start a server with "no master key" must set the variable to an empty string, not remove it, because the server loads `.env`.

## Grok
xAI Responses API (`POST https://api.x.ai/v1/responses`), fixed host. Default model `grok-4.20-0309-non-reasoning`; allowlist from xAI's model list. **Not exercised against the live API** (no key available here): the adapter was tested against a scripted stand-in built from xAI's documentation. Use "Test connection" with a real key before relying on it.

## Connection-test wording (xAI)
401 "Invalid or rejected xAI API key." · 403 "API key is valid but does not have permission for this endpoint/model. Check xAI API-key ACL permissions." · 404 "Selected xAI model or endpoint was not found." · 429 "xAI rate/billing limit reached. Check API credits and rate limits." · 5xx "xAI provider is temporarily unavailable." The screen and the audit row also record the HTTP status, the category, the model and the endpoint (`POST /v1/responses`) — never the key or the Authorization header. For xAI every 403 is reported as a permission (ACL) problem, as specified; if xAI ever uses 403 for "no credits", that case will read as an ACL problem too.

Save is offered only after a successful test of exactly the typed key (or the key in use) and the selected model, on the inference endpoint; changing either afterwards disables Save until it is tested again. The server repeats the test before it changes anything.
