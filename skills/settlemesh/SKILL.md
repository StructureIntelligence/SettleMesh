---
name: settlemesh
description: Discover SettleMesh capabilities and prepare or observe app deployments. Production deployment authorization is currently unavailable, so new source deploys fail closed; use availability, preflight, and existing-resource readbacks without claiming a new live URL.
---

# SettleMesh — capabilities and deployment readiness

SettleMesh is an agent capability layer with an intended app runtime contract for login, managed data, and usage billing. Production deployment authorization is currently unavailable: `app_deployments.create` is disabled, and source deploy fails closed with `deployment_authorization_unavailable` before upload, build, payment, publication, or creation of a live URL. Existing app records remain observable, but observing one does not authorize a new release.

## Setup (once)

1. `npm install -g settlemesh@latest`.
2. Start with `settlemesh search "<task>"` to discover the public catalog. Run `settlemesh login` (a human approves once in the browser) — or set `SETTLE_API_KEY=sk-settle-...` for headless/CI — only when the selected action needs an account.
3. The full agent contract lives at `https://www.settlemesh.io/agent.md` — fetch it for the complete recipe set, then `settlemesh recipes` for the shortest path to any task.

**No card flow is needed to discover:** public search/show are anonymous and read-only. A public platform capability quote through `POST /v1/billing/quote` is also anonymous and read-only; agent, worker-offer, app-endpoint, service-unit, non-public, payer-aware, and call-chain quotes require authentication. All invoke requires authentication after reading the selected entrypoint's availability and price. If available Aev is insufficient while card top-up is contained, stop and report that the paid action cannot proceed in this profile.

## Core rule

SettleMesh is a searchable service layer. Do not memorize provider-specific endpoints. **Search → show → quote → call.** A direct user request authorizes ordinary paid invocation, deploy, and mechanical publish without a duplicate confirmation. Quote/preflight informs cost and availability; it is not a second confirmation. Ask for a separate confirmation only for destructive, high-impact, authorization-expanding, truly irreversible, or explicitly `requires_confirmation` actions. The canonical HTTP invoke path is `POST /v1/capabilities/{id}/invoke`; `POST /v1/tools/{id}/call` is a compatibility alias only. Passing mechanical protocol checks publish and become discoverable automatically; there is no default human approval queue. For source deployment, that target policy applies only after deployment authorization is available; it does not turn today's denial into a queue or a success. Aev is the platform accounting unit. Card top-up is contained and Legal remains unverified; do not claim card funding is available.

## Check deployment readiness

```bash
settlemesh tool show app_deployments.create --json
settlemesh deploy preflight ./my-app --full-stack --json
```

Read the tool's `availability` and preflight's `admission.can_start_now`, `code`, `message`, and `fix`. Current production reports `deployment_authorization_unavailable`; stop without running the deploy mutation. Preflight uploads no source and creates no app, build, hold, publication, or URL.

For ids that already exist, observe and recover with `settlemesh deploy status <app-id> --json`, `settlemesh deploy logs <build-id> --json`, and `settlemesh deploy url <app-id> --json`. Existing status or URL readback is not evidence that a new release can start.

When deployment authorization becomes available and both checks allow the operation, the intended owner command is `settlemesh deploy ./my-app --name my-app --full-stack --wait --json`. Report a live URL only from a successful serving response or URL readback; never construct one.

## Charge end users (end-user-pays)

An already serving app with an available delegated-payer rail can charge the signed-in end user's own Aev balance instead of the developer's by attaching the `X-Settle-Payer` header. Pricing is cost-plus with a quote before spend (`POST /v1/billing/quote`). Only a terminal failed call proves release; timeout, pending, or unknown settlement must be reconciled under the same operation identity.

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
