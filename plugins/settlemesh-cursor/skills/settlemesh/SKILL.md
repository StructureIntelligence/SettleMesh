---
name: settlemesh
description: Deploy and monetize an agent-built app with SettleMesh — SettleMesh OAuth login, a managed database, usage-based billing, and end-user payments in one command. Use when the user wants to ship or deploy an app, add auth or a database, charge users per use, or build an AI/API app that bills its end users (end-user-pays).
---

# SettleMesh — deploy and monetize an app

SettleMesh turns an app into a paid product in one command: SettleMesh OAuth login, a managed database, usage-based billing, and end-user payments — no auth/billing/deploy glue to write. It is also an agent capability layer: one key calls web search/scrape, LLMs, image/video generation, a managed SQL database, and hosted agents — every call metered, with a cost quote up front.

## Setup (once)

1. `npm install -g settlemesh@latest`.
2. Start with `settlemesh search "<task>"` to discover the public catalog. Run `settlemesh login` (a human approves once in the browser) — or set `SETTLE_API_KEY=sk-settle-...` for headless/CI — only when the selected action needs an account.
3. The full agent contract lives at `https://www.settlemesh.io/agent.md` — fetch it for the complete recipe set, then `settlemesh recipes` for the shortest path to any task.

**No card flow is needed to discover and quote:** public search/show and quote are read-only. Invoke only after reading the selected entrypoint's availability and price. If available Aev is insufficient while card top-up is contained, stop and report that the paid action cannot proceed in this profile.

## Core rule

SettleMesh is a searchable service layer. Do not memorize provider-specific endpoints. **Search → show → quote → call.** A direct user request authorizes ordinary paid invocation, deploy, and mechanical publish without a duplicate confirmation. Quote/preflight informs cost and availability; it is not a second confirmation. Ask for a separate confirmation only for destructive, high-impact, authorization-expanding, truly irreversible, or explicitly `requires_confirmation` actions. The canonical HTTP invoke path is `POST /v1/capabilities/{id}/invoke`; `POST /v1/tools/{id}/call` is a compatibility alias only. Passing mechanical protocol checks publish and become discoverable automatically; there is no default human approval queue. Aev is the platform accounting unit. Card top-up is contained and Legal remains unverified; do not claim card funding is available.

## Deploy an app

```bash
settlemesh deploy ./my-app --name my-app --full-stack --wait --json
```

Returns a live `*.run.settlemesh.io` URL — read it from the deploy output (the #1 source of confusion). Add `--auth required` to gate the whole app behind SettleMesh login, or leave auth lazy.

## Charge end users (end-user-pays)

An app can charge the signed-in end user's own Aev balance instead of the developer's by attaching the `X-Settle-Payer` header. Pricing is cost-plus with a quote before spend (`POST /v1/billing/quote`); a failed metered call releases the hold and charges nothing.

## Use any capability

```bash
settlemesh search "<task>" --json
settlemesh show <service-or-operation-id> --json
settlemesh quote <entrypoint-id> --input '{...}' --json
settlemesh call <entrypoint-id> --input '{...}' --json  # --wait for async; --confirm only when the confirmation boundary above applies
```

Billing unit: **Aev** (1 USD = 100 Aev accounting conversion). Check available Aev with `settlemesh credits balance --json`; do not offer card top-up while its release gate is contained.

## MCP

This plugin also registers the `settlemesh` MCP server (`npx -y settlemesh mcp`), so the same capability catalog is callable as MCP tools. It authenticates with your `settlemesh login` session or `SETTLE_API_KEY`.
