# paid-tool-api

Sell one API endpoint, metered per call — **charge your users per use, with no billing code of your own.** SettleMesh handles login, the wallet debit, the ledger, and your payout; you just write the endpoint.

This starter exposes a single paid endpoint (`POST /api/tool`, a text summarizer) that bills the **logged-in caller's** SettleMesh wallet on every successful call. Swap the logic for whatever you want to sell.

> **Aev** is SettleMesh prepaid credit: **1 USD = 100 Aev**, funded via Stripe. Wallets are charged in Aev.

## Quickstart

```bash
npm i -g settlemesh
git clone <this repo>
settlemesh login
settlemesh deploy
```

`settlemesh deploy` ships the app with SettleMesh OAuth login, a metered runtime, and your per-call billing wired up. It also injects the app's runtime key and base URL — you don't manage secrets.

## How a caller hits the paid endpoint

1. The caller signs in once at `/__settle/login` (the platform auth gate; sets a durable `__settle_session` cookie).
2. They POST to your endpoint. The call is billed to **their** Aev wallet — not yours:

```bash
curl -X POST https://YOUR-APP.run.settlemesh.io/api/tool \
  -H "Authorization: Bearer <your-settlemesh-session-token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"Long article here...","style":"bullets"}'
```

```json
{ "ok": true, "summary": "...", "style": "bullets", "cost_aev": 6, "currency": "aev" }
```

The deployed app also serves a small docs/landing page (`public/index.html`) with a "try it" box.

## What you get

- **Login** — SettleMesh OAuth, zero auth code. The auth gate (`/__settle/login`) handles sign-in and sets the payer session.
- **Usage billing** — every successful call to `/api/tool` meters and bills the logged-in user automatically. Your margin is the `billing.markup` field in `settlemesh.json` (default `1.3`). You write no billing code.
- **Payments** — callers fund their Aev wallet via Stripe on SettleMesh; you receive payouts. No payment integration on your side.

### How the billing wiring works (so you can change the tool safely)

`server.js` authenticates to SettleMesh with the injected `SETTLEMESH_APP_API_KEY` and forwards the caller's session as the `X-Settle-Payer` header on the billable call — **that header is what charges the user instead of you.** If it's missing, the route returns `401` and never bills the developer. Keep that wiring and replace only the tool's input/prompt to sell something else.

## Make it yours

- Edit the body of `POST /api/tool` in `server.js`.
- To resell a different SettleMesh capability or cloud-worker offer, change `CAPABILITY` (env `TOOL_CAPABILITY_ID`) and set the invoke **input** to that capability's documented schema — see https://www.settlemesh.io/agent.md. Don't guess the request body.
- Tune your margin via `stack.billing.markup` in `settlemesh.json`.

## The badge is optional

`public/index.html` ends with a small, clearly-commented "Powered by SettleMesh" footer. It's in your code — delete that `<footer>` block to remove it.

---

© StructureIntelligence Inc.
