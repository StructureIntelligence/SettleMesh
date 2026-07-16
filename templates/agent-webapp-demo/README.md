# Snippet Vault — an agent-built demo app on SettleMesh

A tiny, finished full-stack web app — login, a managed database, and one paid AI action — that **charges your users per use, with no billing code of your own.**

## Quickstart

```bash
npm i -g settlemesh
git clone <this repo>
settlemesh login
settlemesh deploy
```

That's it — `settlemesh deploy` provisions login, the database, and metered
billing, and gives you a live URL.

## What you get

- **Login** — SettleMesh OAuth. Sign-in / sign-out work out of the box via the
  injected `/__settle/*` routes. You write no auth code.
- **Database** — a managed SQLite project. Before any read, table creation, or
  write, the server resolves the browser session through the platform's
  same-origin `/__settle/me` authority. Rows store only the stable, non-sensitive
  principal id; raw payer/session tokens are never persisted, and an unavailable
  identity authority fails closed rather than falling back to shared anonymous rows.
- **Usage billing** — the "Polish with AI" button calls one metered SettleMesh
  capability and bills the **end user**, not you, via `X-Settle-Payer`. You write
  no billing code.
- **Payments** — users pay from their prepaid **Aev** balance. *Aev is SettleMesh
  prepaid credit (1 USD = 100 Aev); funding options remain live availability- and
  Legal-gated rather than being assumed by this template.*

## How it fits together

| Piece | Where |
| --- | --- |
| Auth helpers + DB query + capability call | `lib/settlemesh.ts` |
| Snippet CRUD (managed DB) | `app/api/snippets/route.ts` |
| Metered "polish" capability | `app/api/polish/route.ts` |
| UI | `app/page.tsx` |
| Manifest (`framework`, auth, database, runtime_api) | `settlemesh.json` |

Real keys are injected by `settlemesh deploy`; for local dev copy `.env.example`
to `.env.local`. Never commit real values.

> **Note:** the "Powered by SettleMesh" badge
> (`components/powered-by-settlemesh.tsx`) is optional — delete that file and its
> import in `app/page.tsx` to remove it.

---

© StructureIntelligence Inc.
