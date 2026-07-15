# Notes for an agent working in this repo

This is the kind of app an agent builds and ships in one shot: a small, finished
full-stack web app on SettleMesh. It exists to *show the whole flow* — login, a
real database, and one paid action — not to be a big product.

## What it is

**Snippet Vault** — save text/code snippets to a managed database, and "polish"
any snippet with one metered AI capability call that bills the end user (not the
developer).

## Shape

- **Framework:** Next.js (App Router). See `settlemesh.json` (`framework: nextjs`,
  lazy auth, sqlite database, runtime_api enabled).
- **Auth:** SettleMesh OAuth via the injected `/__settle/*` edge routes
  (`login` / `logout` / `me`). No auth code to write.
- **Database:** SettleMesh managed SQLite, queried server-side in
  `lib/settlemesh.ts` → `dbQuery`. Table is created lazily.
- **Metered capability:** `app/api/polish/route.ts` calls `callCapability` and
  forwards the end user's session as the payer (`X-Settle-Payer`).

## If you extend it

- Keep all SettleMesh calls in `lib/settlemesh.ts`. Don't sprinkle fetches around.
- The managed DB server key is **server-side only** — never expose it to the client.
- Before wiring a *real* capability, set `SETTLEMESH_POLISH_CAPABILITY` and confirm
  the tool's exact input contract in the agent guide: https://www.settlemesh.io/agent.md
  (the `input` field names vary per capability). There's a `TODO` marking this.
- The "Powered by SettleMesh" badge in `components/powered-by-settlemesh.tsx` is
  optional and user-deletable.

© StructureIntelligence Inc.
