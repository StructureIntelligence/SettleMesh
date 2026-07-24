# Snippet Vault — SettleMesh integration preview

> **Preview / not production-ready.** This template demonstrates the current auth, managed database,
> and metered-capability surfaces. It is not release evidence for tenant isolation, stable Actor
> identity, database migration, payment responsibility, or end-user billing. Keep the real paid
> capability disabled until those controls pass the platform release gate.

A small full-stack reference app with login, managed database access, and an optional paid AI action.

## Quickstart

```bash
npm i -g settlemesh
git clone <this repo>
settlemesh login
settlemesh deploy
```

`settlemesh deploy` is expected to provision login and database access and return a live URL. Treat
any paid-capability configuration as staging-only until a verified payer is present and PAY-01 is
authorized.

## What you get

- **Login** — SettleMesh OAuth. Sign-in / sign-out work out of the box via the
  injected `/__settle/*` routes. You write no auth code.
- **Database** — a managed SQLite project. The current preview creates its table on first use. A
  production starter must replace this with a versioned migration owned by the deployment artifact.
- **Usage billing** — the "Polish with AI" button calls one metered SettleMesh
  capability only when a payer credential is present; the platform remains the final verifier. A
  missing payer returns `401`, an invalid payer must be rejected by the platform, and the helper
  refuses to fall back to billing the app owner.
- **Payments** — users pay from their prepaid **Aev** balance. *Aev is SettleMesh
  prepaid credit. Funding, refund, dispute, tax, and merchant responsibility remain governed by the
  platform's active payment policy, not by this template.

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

The current snippet namespace is a one-way hash of **unverified** header/cookie material. This
prevents raw bearer-token persistence and removes the shared anonymous namespace, but it is only a
containment mechanism: a caller can choose an arbitrary header value and token rotation can orphan
data. Before production use, resolve the session through the authoritative auth service and store
only a stable internal Actor ID. Add a versioned migration plus a two-actor isolation E2E that proves
actor A cannot read actor B's rows and an invalid payer cannot trigger a charge.

> **Note:** the "Powered by SettleMesh" badge
> (`components/powered-by-settlemesh.tsx`) is optional — delete that file and its
> import in `app/page.tsx` to remove it.

---

© StructureIntelligence Inc.
