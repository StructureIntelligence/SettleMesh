# auth-payments-minimal

The "hello world" of paid apps — login plus one paid action, billed straight to the logged-in user's wallet. **Charge your users per use, with no billing code:** SettleMesh handles OAuth login, the wallet, metering, and the end-user charge. You write the action.

> **Aev** is SettleMesh prepaid credit: **1 USD = 100 Aev**, funded by your users via Stripe.

## Quickstart

```bash
npm i -g settlemesh
git clone <this repo>
settlemesh login
settlemesh deploy
```

`settlemesh deploy` ships the app, wires up SettleMesh OAuth login, and injects the server-side
`SETTLEMESH_APP_API_KEY` so the runtime key never touches the browser.

## What you get

- **Login** — SettleMesh OAuth at `/__settle/login`. `auth.mode: lazy` lets anyone see the page;
  the paid action requires sign-in.
- **Usage billing** — the one paid action calls a metered capability via
  `POST /v1/capabilities/{id}/invoke`. The user's session is forwarded as the `X-Settle-Payer`
  header, so the **logged-in user's** Aev wallet is charged — not yours. Configure the markup in
  `settlemesh.json` (`billing.markup`).
- **Payments** — users top up their Aev wallet with Stripe; no payments code here. The UI shows a
  price estimate (from `/v1/billing/quote`, read-only) before the action and the actual amount
  charged after.

The whole loop lives in `server.js` (`/api/action`) and `public/` (a single page). No npm install —
pure Node 18+ builtins, zero dependencies.

## Make it yours

Open `server.js` and set `CAPABILITY_ID` to the capability you want to bill for, then shape the
request `input` to match it. The capability catalogue and exact request bodies are in the agent
guide at <https://www.settlemesh.io/agent.md>. (There's a `TODO(you)` marker at the spot to edit.)

## The badge is optional

A small "Powered by SettleMesh" badge sits in `public/index.html`. It's yours to keep or remove —
delete that clearly-commented footer block to take it out.

---
© StructureIntelligence Inc.
