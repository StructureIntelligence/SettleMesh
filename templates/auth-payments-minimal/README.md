# auth-payments-minimal

The "hello world" of paid apps — login plus one paid action, billed straight to the logged-in user's wallet. **Charge your users per use, with no billing code:** SettleMesh handles OAuth login, the wallet, metering, and the end-user charge. You write the action.

> **Aev** is SettleMesh prepaid credit: **1 USD = 100 Aev**. Card funding is offered only when the live
> server reports its Legal/provider gates available; this template does not assume live funding.

## Quickstart

```bash
npm i -g settlemesh
git clone <this repo>
settlemesh login
settlemesh tool show app_deployments.create --json
settlemesh deploy preflight . --full-stack --json
```

Production deployment authorization is currently unavailable: `app_deployments.create` is disabled and source deploy fails closed with `deployment_authorization_unavailable` before upload, build, payment, publication, or a live URL. When authorization becomes available and both checks allow it, the intended command is `settlemesh deploy . --full-stack --wait --json`; a successful authorized deployment injects `SETTLEMESH_APP_API_KEY` server-side so the runtime key never touches the browser.

## What you get

- **Login** — SettleMesh OAuth at `/__settle/login`. `auth.mode: lazy` lets anyone see the page;
  the paid action requires sign-in.
- **Usage billing** — the one paid action calls a metered capability via
  `POST /v1/capabilities/{id}/invoke`. The user's session is forwarded as the `X-Settle-Payer`
  header, so the **logged-in user's** Aev wallet is charged — not yours. Configure the markup in
  `settlemesh.json` (`billing.markup`).
- **Payments** — the only price authority is a read-only live `POST /v1/billing/quote` for the
  exact same input that will be invoked. The browser posts its pending input snapshot to the local
  `/api/quote` adapter; `/api/action` quotes that same stored object again immediately before invoke.
  **No price is assumed:** there is no static or hardcoded
  amount fallback. **Quote failure prevents invoke** — transport, backend, provider, availability,
  or contract failures are projected as a machine-readable
  `{code,message,fix,retryable,trace_id?}` object and the paid action does not run. The UI renders
  `quote_kind` truthfully (`exact` vs `representative_floor` vs `hold_ceiling`) and never labels a
  floor or hold ceiling as a final capture charge. Captured money afterward is shown only from the
  explicit platform `x-settle-charged-aev` header; an HTTP/network failure or missing capture
  evidence remains unknown and keeps the same operation identity for reconciliation. This minimal
  template does not fabricate a funding path; add one only when the live server reports its
  Legal/provider gates available and returns the path.

The whole loop lives in `server.js` (`/api/action`) and `public/` (a single page). No npm install —
pure Node 18+ builtins, zero dependencies.

```bash
npm test
```

## Make it yours

Open `server.js` and set `CAPABILITY_ID` to the capability you want to bill for, then shape the
request `input` to match it. The capability catalogue and exact request bodies are in the agent
guide at <https://www.settlemesh.io/agent.md>. (There's a `TODO(you)` marker at the spot to edit.)

## The badge is optional

A small "Powered by SettleMesh" badge sits in `public/index.html`. It's yours to keep or remove —
delete that clearly-commented footer block to take it out.

---
© StructureIntelligence Inc.
