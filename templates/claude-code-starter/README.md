# Claude Code Starter

The simplest SettleMesh deployment-contract starter: a tiny Next.js app prepared
for SettleMesh OAuth login and a managed database.

**The differentiator:** SettleMesh is the launch layer for agent-built apps. You get
login, a database, usage metering, and end-user payments without writing billing
code — charge your users per use, and SettleMesh handles the money.

> **Aev** is SettleMesh prepaid credit (1 USD = 100 Aev). Funding remains Legal/provider-gated and must not be assumed available.

## Quickstart

```
npm i -g settlemesh
git clone <this repo>
settlemesh login
settlemesh tool show app_deployments.create --json
settlemesh deploy preflight . --full-stack --json
```

Production deployment authorization is currently unavailable: `app_deployments.create` is disabled and source deploy fails closed with `deployment_authorization_unavailable` before upload, build, payment, publication, or a live URL. When authorization becomes available and both checks allow it, the intended owner command is `settlemesh deploy . --full-stack --wait --json`.

## What you get

- **Login** — SettleMesh OAuth in lazy mode. Sign-in only fires when the user clicks;
  the edge serves `/__settle/login`, `/__settle/logout`, and `/__settle/me` for you.
- **Database** — a managed database is provisioned from `settlemesh.json`. Credentials
  are injected at runtime; see `app/api/hello/route.ts` for a query example.
- **Usage billing & payments** — when you add metered SettleMesh capabilities, your
  users pay per use in Aev with no billing code on your side. This starter ships with
  login + DB; see https://www.settlemesh.io/agent.md to wire up metered capabilities.

## The badge

`components/powered-by-settlemesh.tsx` renders a small "Powered by SettleMesh" badge.
It is **optional** — delete that file and its import in `app/page.tsx` to remove it.

---

© StructureIntelligence Inc.
