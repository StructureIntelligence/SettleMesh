# SettleMesh Agent Quickstart

Read this before using SettleMesh from Codex, Cursor, Claude Code, CI, or another agent runtime.

## First Time: Localize This Guide (do this once)

If you are an agent reading this for the first time:

1. Save this file into the project as `agent.md` — run `settlemesh agent-md --save`, or fetch `https://api.settlemesh.io/agent.md` (the same `api.` host you call at runtime).
2. Create a skill / rule in your runtime that says: **"For any SettleMesh task, read `./agent.md` first."** (Claude Code: a skill; Cursor: a rule; Codex/CI: a line in your project instructions.)
3. Authenticate once: run `settlemesh login` — a human approves in the browser. The CLI then reuses the stored session; no further login is needed.
4. Print the shortest reliable path for any task with `settlemesh recipes`.

From then on every SettleMesh task starts from your local `agent.md` and an already-authenticated CLI — no re-deriving how the platform works.

## Core Rule

SettleMesh is a searchable service layer. Do not memorize provider-specific endpoints. Search first, inspect the service or tool contract, then call it. Every call is billed in Aev — confirm intent before paid, deploy, publish, or destructive actions.

## No CLI? HTTP-Only Quick Start

If your runtime cannot install npm packages (CI sandbox, restricted agent runtime), the whole search→inspect→call loop is plain HTTP against `https://api.settlemesh.io` with `Authorization: Bearer $SETTLE_API_KEY`:

```bash
# 1. Search the catalog (this IS the discovery endpoint — same index the CLI uses)
curl -H "Authorization: Bearer $SETTLE_API_KEY" "https://api.settlemesh.io/v1/services/search?q=webpage+to+markdown"
curl -H "Authorization: Bearer $SETTLE_API_KEY" "https://api.settlemesh.io/v1/services/search?all=true&category=web-knowledge-services"

# 2. Inspect the contract (inputs, pricing, examples)
curl -H "Authorization: Bearer $SETTLE_API_KEY" "https://api.settlemesh.io/v1/services/webpage.to_markdown"

# 3. Invoke — the canonical prefix is /v1/capabilities/ (NOT /v1/tools/)
curl -X POST -H "Authorization: Bearer $SETTLE_API_KEY" -H "Content-Type: application/json" \
  -d '{"input":{"url":"https://example.com"}}' \
  "https://api.settlemesh.io/v1/capabilities/webpage.to_markdown/invoke"

# 4. Your balance / ledger (developer account — works with an API key)
curl -H "Authorization: Bearer $SETTLE_API_KEY" "https://api.settlemesh.io/v1/credits/balance"

# 5. Connectivity / key check — free, no Aev, no quota
curl -H "Authorization: Bearer $SETTLE_API_KEY" "https://api.settlemesh.io/v1/ping"
# → {"success":true,"data":{"ok":true,"account_id":"..."}}
```

HTTP-only gotchas (each one costs cold agents real time — read them now):

- **There is no `/v1/whoami`.** Verify your key with `GET /v1/ping` (free; 200 = key works, 401 `invalid_api_key` = fix the key first). `whoami` exists only in the CLI; don't call `/v1/credits/balance` just to test connectivity.
- **`/v1/capabilities/<id>/invoke` is the invoke path** for everything search returns; `/v1/tools/...` does not exist and 404s. Use `/v1/dynamic-services/<dsvc_id>/operations/<op>/invoke` ONLY for your own not-yet-approved dynamic service — once a service is in search results, invoke it via `/v1/capabilities/` (a search hit's `entrypoints[].id` is the exact id to use, e.g. `ecosystem.article.summarize` for service `article.summarize`).
- **`GET /v1/wallet/balance` is NOT for API keys** — it is the end-user (payer-session) balance and returns 401 `invalid_payer_token` for a bearer key. Your own balance is `/v1/credits/balance`.
- CLI-only conveniences with no REST equivalent: `recipes`, `doctor`, `tool schema`, deploy (`settlemesh deploy` orchestrates packaging/upload — deploying requires the CLI).

## Install And Auth

Install **globally** so the `settlemesh` command works in any directory (a local `npm install` in an
empty dir with no `package.json` silently no-ops — no binary — so prefer `-g`):

```bash
npm install -g settlemesh@latest
settlemesh doctor --require-latest
settlemesh whoami --json     # ALWAYS check auth first in a fresh env (see auth below)
```

The npm package and primary command are both `settlemesh`. The older `settle`, `settlekit`, and `kit` aliases still work for compatibility.

**Auth — two ways:**
- **Interactive:** `settlemesh login` — a human approves in the browser; the CLI reuses the stored session.
- **Headless / CI / agent runs (no browser):** set an API key, sent as `Authorization: Bearer <key>`:
  ```bash
  export SETTLE_API_KEY="sk-settle-..."
  settlemesh whoami --json   # 200 = authed; 401 invalid_api_key = wrong/missing key, fix it before continuing
  ```
  Create/copy a key from your SettleMesh account dashboard (https://www.settlemesh.io). Run `whoami`
  first to distinguish "no key set" from "key invalid" — never proceed past a 401.

## Use SettleMesh As An MCP Server

If your runtime speaks the Model Context Protocol, expose the whole SettleMesh capability catalog as MCP tools instead of (or alongside) the CLI: run `settlemesh mcp` — a stdio JSON-RPC server. It reuses your `settlemesh login` session or `SETTLE_API_KEY`; the key never touches the protocol stream or logs.

- **Claude Code:** `claude mcp add settlemesh --env SETTLE_API_KEY=sk-settle-... -- npx -y settlemesh mcp`
- **Claude Desktop / Cursor** (`claude_desktop_config.json` / `~/.cursor/mcp.json`):
  ```json
  {"mcpServers":{"settlemesh":{"command":"npx","args":["-y","settlemesh","mcp"],"env":{"SETTLE_API_KEY":"sk-settle-..."}}}}
  ```
- **Codex** (`~/.codex/config.toml`): `[mcp_servers.settlemesh]` with `command = "npx"`, `args = ["-y","settlemesh","mcp"]`, `env = { SETTLE_API_KEY = "sk-settle-..." }`.

The server exposes a capability-invoke tool over the same search→inspect→call loop below: search for a tool, then invoke any catalog capability by id, with a confirm step before paid calls. The same Aev billing, quotes, and error contract apply. Run `settlemesh login` first to omit the key.

## Find A Service

```bash
settlemesh search "image generation" --json
settlemesh search "deploy app with login and database" --json
settlemesh search "upload public agent" --json
settlemesh search "local worker compute" --json
```

Then inspect the selected service:

```bash
settlemesh show <service-id> --json
settlemesh tool show <tool-id> --json
```

A result may carry `availability_reason` (e.g. "not included in the public CLI commercial MVP") — those are index-only and NOT callable from the CLI; pick a result without it. For `web.search` the top web result is at `web.results[0].title` / `.url`. **Platform-managed capability invokes (`web.search`, `web.scrape`, …) return the upstream provider's body verbatim** — over the raw HTTP invoke it is at the TOP level (NOT wrapped in `{data,success}`), so via HTTP the path is `web.results[0]`. **Via the `settlemesh` CLI** (`tool call --json`) the same body is re-wrapped under `data` (the CLI envelope is `{ok, tool_id, data, meta}`), so via the CLI the path is `data.web.results[0]`. Either way, responses vary by provider — parse defensively.

## Call A Tool

```bash
settlemesh tool call web.search --input '{"q":"SettleMesh"}' --json
settlemesh tool call image.gpt-image-2 --input '{"prompt":"a glass city at sunrise"}' --wait --json
settlemesh tool call video.veo-3.1 --input '{"prompt":"a glass city at sunrise, slow aerial push-in"}' --wait --json
```

Use `--wait` for async jobs and `--confirm` for costly or side-effecting calls. Always parse JSON defensively. Result URLs or payloads may appear in `data.result`, `data.results`, `data.output`, `output`, `url`, `urls`, or nested arrays/objects.

### Async jobs — poll the *per-model* detail capability (don't guess it)

Media generation is async: the submit capability returns only a **job id**; the actual result lives behind a separate **detail capability** you poll. The detail id is **per model**, and you must not invent it:

- **Video detail ids are per-model:** `video.veo-3.1` → `video.veo-3.1.detail`, `video.sora2-new` → `video.sora2-new.detail`, `video.doubao-seedance-2.0` → `video.doubao-seedance-2.0.detail`.
- **Images are the exception — one shared `image.task.detail`** for every image model (`image.gpt-image-2`, `image.nanobanana2`, …).
- **Never guess `video.task.detail` — it does not exist.** Generalizing the shared image detail to video is the #1 integration mistake.
- **The authoritative poll id is always in the submit capability's spec at `output.next[0].tool_id`.** Read it with `settlemesh tool show <submit-id> --json` or `GET /v1/tools/<submit-id>`; the poll input key is **`id`** (not `task_id`). Or just add `--wait` and let the CLI poll for you — **if you call over raw HTTP and won't read the spec, prefer `--wait`/server-side waiting over hardcoding a detail id.**

```bash
# One-shot (CLI polls for you):
settlemesh tool call video.veo-3.1 --input '{"prompt":"a glass city, aerial push-in"}' --wait --json

# Manual HTTP: submit → read output.next → poll the detail capability with {"id": <task-id>}
#   POST /v1/capabilities/video.veo-3.1/invoke            → { ...task_id... }
#   GET  /v1/tools/video.veo-3.1                          → output.next[0].tool_id == "video.veo-3.1.detail"
#   POST /v1/capabilities/video.veo-3.1.detail/invoke     {"input":{"id":"<task-id>"}}  → poll until result URLs appear
```

## Aev And Cost

One Aev balance pays for calls. Check it and top up before long runs (`aev` is the current command; older CLI builds use `credits` — both work on a current install):

```bash
settlemesh aev balance --json
settlemesh aev ledger --limit 20 --json
settlemesh aev topup --aev 500 --json    # opens a checkout session
```

**Your first call to each official capability is free** (and refunded if it fails), so you can try the catalog before funding anything — only repeat calls and paid published services draw down your balance. That free first call also returns an `X-Settle-Billing-Notice` header (the CLI prints it to stderr) telling you subsequent calls are billed, so call 2 is never a silent surprise. A failed call never charges you (the hold is released), so retries after a transient error are safe to reason about.

## When A Call Fails (handle these — do not loop blindly)

- **HTTP 401 `invalid_api_key` / `missing_api_key`** — your key is wrong, expired, or unset. Do NOT retry. Set `SETTLE_API_KEY` (headless) or run `settlemesh login`, then `settlemesh whoami --json` to confirm before continuing. Get a key from your dashboard (https://www.settlemesh.io).
- **HTTP 402 `insufficient_credits`** — paid calls are billed *before* they run and your balance is too low. The response includes `required_credits`, `available_credits`, and a `topup_url` that opens the top-up page with the exact shortfall pre-filled and funds the **logged-in account that owns the wallet** (the developer, or the end user behind `X-Settle-Payer`). Run `settlemesh aev balance`, then `settlemesh aev topup --aev <n>` — or hand the user the `topup_url` to click — then retry. Do not retry without topping up.
- **HTTP 402 `credit_limit_exceeded`** — the API key hit its own spend cap; use a key with a higher limit.
- **An async job did not finish under `--wait`** — read progress with `settlemesh tool events <job-id> --json`; for deploys use `settlemesh deploy status <app-id>` and `settlemesh deploy logs <build-id>`.
- **`doctor` reports a stale CLI** — reinstall `npm install settlemesh@latest --prefer-online` before continuing.
- **`search` returns nothing useful** — broaden the query, try `settlemesh search --all --category <category>`, or read `settlemesh recipes`.

## Safe Retries — Idempotency-Key (so a retry charges once, not twice)

The retry guidance above (top up on 402, poll an async job, re-try a transient 502) is only safe if the call is idempotent — otherwise a retried **paid** POST charges again. Send an **`Idempotency-Key`** header (any unique string per logical operation) on retriable paid calls:

```bash
curl -X POST -H "Authorization: Bearer $SETTLE_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"input":{"q":"SettleMesh"}}' \
  "https://api.settlemesh.io/v1/capabilities/web.search/invoke"
```

- **Same key + same body** → the original result is replayed and you are charged **exactly once** (replays carry an `idempotency-replayed: true` response header). Safe to retry blindly on a timeout/502.
- **Same key + a *different* body** → **HTTP 409 `idempotency_key_conflict`**, fail-closed, **no charge** — use a fresh key for a genuinely new operation.
- **No key** → every call is a new charge (the default). Reuse one key per logical operation; mint a new key per new operation.

**Verify a charge by its ledger entry, not a balance read.** Async settlement makes a balance-delta briefly unreliable (it can drift by fractions between two reads). The stable per-call charge record is `GET /v1/credits/balance` for the total and **`GET /v1/credits/ledger?limit=5`** for the itemized entries. Over the raw HTTP invoke, correlate by the `request_id` (the `Idempotency-Key` you sent) to confirm exactly one capture. **Via the `settlemesh` CLI**, `tool call` output does NOT echo the `request_id` — confirm instead by reading the newest `settlemesh aev ledger --limit 5` entry whose `endpoint` matches the capability you just called (and its `amount_credits` matches the quoted price); that single capture row IS the confirmation.

## Build And Deploy An App

SettleMesh is not a template generator — but the managed full-stack build pipeline currently targets **Next.js** (the app is built with OpenNext for Cloudflare). Build a Next.js app, then add generic SettleMesh guardrails:

```bash
settlemesh apps doctor . --fix
settlemesh deploy . --name my-app --full-stack --wait --json
```

### Deploying a plain static site (HTML/CSS/JS, no framework)

The golden path is two files — this exact shape is what the platform's own e2e suite deploys:

```
index.html          (at the project root — works as-is)
settlemesh.json     { "stack": { "runtime": { "prototype": "static" } } }
```

Then `settlemesh deploy . --name my-site --wait --json`. **No `package.json`, no build script, no special directory needed** — `runtime.prototype: "static"` tells the platform to serve the files as-is, bypassing framework auto-detection entirely (without it, a stray `package.json` can route you into the Next.js/OpenNext build, which fails for a non-Next project). No `--full-stack` either — a static site needs no DB/auth stack, and `apps doctor --fix` full-stack wiring is unnecessary for it.

For a bundler-built SPA, run your build first and deploy the OUTPUT directory the same way (its `index.html` at that directory's root + the same `settlemesh.json`), or keep sources and built files separate.

**Naming + URL.** The user picks the app name with `--name` (or `name` in the manifest); it becomes the public subdomain `<name>.run.settlemesh.io`. The name must be **at least 5 letters/digits** (shorter or non-latin names are rejected) so the URL is readable. If that name is already taken, the platform auto-appends a suffix (`name-2`, `name-3`, … then `name-a` …) so you still get a clean, STABLE URL — it never clobbers an existing app. After the first deploy the CLI pins the resolved `app_id` into your manifest, so a plain `settlemesh deploy <dir>` keeps the SAME app + URL on every redeploy (no `--app-id` to remember).

`--full-stack` provisions and injects SettleMesh auth, a database, a runtime API key, and deployment secrets. The free tier caps how many apps you can have (a small number of frontend apps, and fewer backend/full-stack apps) — if a deploy returns `backend_quota_exceeded`/`deploy_quota_exceeded` (HTTP 402), that is an app-COUNT cap, not a balance problem: free a slot with `settlemesh apps delete <app-id>` (list yours with `settlemesh apps list`), redeploy onto an existing app with `--app-id`, or upgrade. Redeploy onto an existing app without changing its public URL by pinning its id:

```bash
settlemesh deploy . --app-id app_123 --full-stack --wait --json
settlemesh deploy status app_123 --json     # if --wait timed out
settlemesh deploy logs build_123 --json      # diagnose a failed build
```

### Getting the live URL (read this — it is the #1 deploy confusion)

The `settlemesh deploy` command returns the public URL in its own JSON output at top level: `data.url` (and `data.public_url`) — **capture it from the deploy output**. If you lost that output, re-fetch it any time with **`settlemesh deploy url <app-id>`** (prints the live URL) or **`settlemesh apps list`** (id, name, status, URL for all your apps). Note: `settlemesh deploy status <app-id> --json` shows the BUILD record (status/artifact), which does NOT contain the url — use it to check the build `status`, not to read the url. **Never use `settlemesh search` to find your own deployed app — search is the capability/service discovery index and does NOT list app deployments; use `apps list`/`deploy url` instead.**

Two normal outcomes that are NOT failures:
- **`--wait` timed out while the build was still running.** Network `npm install` can take several minutes (registry stalls + retries are normal). This is not a failure — poll `settlemesh deploy status <app-id> --json` until the build `status` is `active`/complete, then re-run `settlemesh deploy <dir> --app-id <id>` (or read the url you captured from the original deploy output). Don't conclude it failed.
- **The live URL returns HTTP 302/redirect to a login page.** If you deployed with auth required (`--full-stack` or auth mode `required`), the app root redirects unauthenticated visitors to SettleMesh login — that is the working login gate, not a broken deploy. The app is live; sign in (or set auth mode `lazy`) to see content.

Give the user the `url` from the `deploy` output (`data.url`), or re-fetch it with `settlemesh deploy url <app-id>` — not `deploy status`, which is the build record. `preview` is the default target; promote to production explicitly only when asked.

**Diagnosing a failed deploy:** a build can go green yet the DEPLOYMENT still fail (worker/container provisioning, secret injection, smoke check). `settlemesh deploy status <app-id>` now prints both the build status AND the latest deployment's `status`/`url`/`error` — read the `deployment error:` line for the real reason before retrying.

**Platform-reserved paths.** The edge owns a few paths that never reach your container — notably **`/healthz`** (the Cloud Run health probe answers there with its own 404 page). Don't expose an app route at `/healthz`; every other path (including `/` and `/api/*`) reaches your handler normally.

**Teardown.** `settlemesh apps delete <app-id>` removes the app but does **NOT** cascade-delete a database/project that `--full-stack` auto-provisioned — that project stays `active` and billable. Delete it explicitly with `settlemesh db delete <project-id>` (list your projects with `settlemesh projects list`) or `DELETE /v1/projects/{project-id}`. Note `apps delete` is effectively idempotent at the data layer: re-deleting an already-deleted app returns `404 app_not_found` even though the first delete succeeded — treat a 404 on re-delete as "already gone", not a failure.

### Auth UX: prefer lazy login, don't gate the whole app

SettleMesh auth has two modes — choose deliberately, because it shapes the whole first impression:
- **`lazy` (recommended default for most apps)** — the app is publicly viewable; SettleMesh login is offered but NOT forced. The platform still injects `/__settle/login`, `/__settle/logout`, `/__settle/me`. Wire a **"Sign in" button** to `/__settle/login` and call `/__settle/me` to detect the current user. Trigger login *at the right moment* — when the user clicks sign-in, or right before an action that needs identity or spends Aev — not on page load.
- **`required`** — every route redirects unauthenticated visitors to login. Use this ONLY for an app that must be fully private (an internal tool, a paid-members-only product). For a normal public-facing app this is the wrong default: visitors hit a login wall before they see anything.

`lazy` is the platform default when you don't specify auth. Only set `required` when you actually mean "no page is viewable logged-out". In the deploy stack: `auth: { mode: "lazy" }` vs `auth: { mode: "required" }` (or `--full-stack` defaults you get plus an explicit mode). Don't reach for `required` just because the app "has accounts".

### Charge Aev (monetize the app — unified wallet, cost-plus)

**A static site cannot take money.** Billing — markup *or* merchant checkout — requires a server runtime: deploy a node/container/Next backend declaring `stack.billing` (and `stack.auth` for end-user identity), not a `runtime.prototype: "static"` prototype. A static deploy that also declares a server-side billing stack is rejected.

SettleMesh has ONE per-user Aev wallet (there are no per-app wallets). Your app charges the END USER's
wallet `cost × m` for the platform services it consumes on their behalf; the markup `m−1` is your
revenue. Four concrete steps:

**1. Declare your markup `m` at deploy** — `stack.billing.markup`, discrete `m ∈ {1.0,1.1,1.2,1.3,1.4,1.5}` (cap 1.5×; 1.0 = at-cost pass-through):
```json
{ "stack": { "billing": { "markup": 1.1 } } }
```
Choosing m is a pricing decision: use the owner's specified value; else ask (recommend 1.1); headless with no one to ask → 1.0 (never impose an unapproved markup). An out-of-set value (e.g. 1.05 or 2.0) is **rejected** at deploy, not clamped — use one of the six allowed values. This stamps m on your app's runtime key, so every delegated charge below is `cost × m` with the markup credited to your account.

**2. Charge the end user** — when your SERVER calls a platform service for a logged-in user, forward the user's SettleMesh session as the `X-Settle-Payer` header so THEIR wallet pays (not yours):
```
POST {SETTLEMESH_BASE_URL}/v1/capabilities/<id>/invoke      # or /v1/dynamic-services/<id>/operations/<op>/invoke
Authorization: Bearer {SETTLEMESH_APP_API_KEY}
X-Settle-Payer: <the user's __settle_session cookie>        # prefer __settle_session (durable, 7-day); __settle_access (OAuth token) also accepted
```
The platform charges the user `cost × m` and credits you the markup (a per-app allowance is enforced only if the operator enabled one — see 4; off by default). Read the cookie from the incoming request — the auth gate passes `__settle_*` cookies through to your server. **No header ⇒ your own wallet pays** (use that only for background jobs you fund).

**3. Cost transparency — REQUIRED whenever your app spends the user's Aev.** Never spend a logged-in user's Aev silently. Two obligations, both enforced as product policy:
- **Estimate BEFORE.** Show the user an estimated cost in the UI *before* the action runs. Compute it from the service's published price — `settlemesh show <service>` for per-call services, or `credits_per_second × expected_seconds` for a cloud worker — then multiply by your markup `m`. (**HTTP-only agents:** the REST service-detail payload has no `pricing` field; use **`POST /v1/billing/quote`** — see the quote note below — as the canonical price source.) Display it as "≈ N Aev" (mark it an estimate; the real charge is metered).
- **Actual AFTER.** Show the exact amount actually charged once the action completes. A metered cloud-worker job reports it on the job: `GET /v1/worker-jobs/{id}` → `data.metadata.settlement_cost_credits` (the Aev charged, markup included). For any service you can also show the wallet delta from `GET /v1/wallet/balance` before/after.
- **Viewing entry.** Give the user a link to their full Aev spend — their SettleMesh account/wallet (where every charge across all apps is itemized) — so they can audit what your app cost them. `GET /v1/wallet/balance` (with `X-Settle-Payer`) is the live balance; link the user to the SettleMesh wallet page for history.

**4. (Optional) Per-app spend allowance.** By DEFAULT a logged-in user can spend on any app up to their wallet balance — no separate grant needed. Only if the operator turned the per-app cap back on (`SETTLEMESH_DELEGATED_APP_ALLOWANCE=true`) does a charge without an allowance return **403 `app_allowance_required`**; then the user grants one (revocable blast-radius cap for your app):
```
PUT  /v1/wallet/app-grants/{appID}   { "max_credits": 5000, "per_call_ceiling_credits": 600 }
GET  /v1/wallet/app-grants           # list   ·   DELETE /v1/wallet/app-grants/{appID}  # revoke
```
Unlike `/v1/wallet/balance` (which requires a logged-in payer session), these `app-grants` endpoints DO accept a developer **API key** — they manage the key-owner's own grants — so you can create/list/revoke grants headlessly. `DELETE` is a soft-deactivate (the grant row remains, marked inactive).

**5. Show the user their balance** — `GET /v1/wallet/balance` with `X-Settle-Payer: <user session>` → their unified platform Aev (`data.available_credits`). The header must be a real `__settle_session` cookie from a logged-in user — an API key is NOT a valid payer token, so you cannot exercise this endpoint without a logged-in user. (Your OWN account balance, as the developer, is `settlemesh aev balance` — there is no `/v1/whoami` REST route.) Do not build a per-app balance.

**Billing errors to handle:** `app_allowance_required` (403) / `app_per_call_ceiling` (403) / `app_allowance_exceeded` (402) — user must grant or raise the allowance (only reachable if the operator enabled it); `insufficient_credits` (402, user tops up); `invalid_payer_token` (401, session expired → user re-logs in).

**Quote before charging (optional, recommended for expensive calls):** `POST /v1/billing/quote` with `{"capability_id":"..."}` or `{"agent_id":"..."}` or `{"app_id":"...","endpoint_id":"..."}` → `{base_cost_credits, markup_bps, multiplier, total_credits, markup_deduped, chain:{depth,max_depth}, payer:{delegated, allowance?}}`. Read-only (no hold); agent quotes are the CEILING (usage-priced up to it), same number the hold would use. Show it to the user before a costly action.

**Mandatory:** any deployed unit that consumes paid platform services MUST declare billing — `settlemesh apps doctor` warns otherwise — else the cost silently falls on YOUR wallet.

*Selling a discrete product instead of metered usage?* Merchant checkout: declare `stack.billing.enabled:true` + a `price_credits`, then `POST {BASE}/api/v1/checkout/create` and redirect to the returned `url`. **Do NOT build a per-app wallet/ledger** — the unified wallet replaces it.
- Auth: `Authorization: Bearer {SETTLEMESH_MERCHANT_API_KEY}` (the merchant key, NOT the app/runtime key). No injected app? Mint one yourself with `settlemesh apps register --with-payment` (prints a merchant key + id) — that is the headless way to get a merchant key without deploying.
- Body: `{ "amount": <credits>, "description": "<required, ≤500 chars>", "external_id"?: "...", "return_url"?: "https://...", "cancel_url"?: "https://...", "metadata"?: {} }`. `amount` and `description` are required; response has `url` (hosted checkout) + `id`. (If you get field-validation errors, also double-check the merchant key — an invalid key surfaces after body validation.)

## Use A Managed Database And Auth

`--full-stack` provisions a database + SettleMesh auth + a runtime key. A **custom container manifest gets ONLY what its `stack` declares** — so to get a DB you must declare it:

```json
{ "stack": { "database": { "engine": "postgres" }, "auth": { "provider": "settlemesh", "mode": "lazy" } } }
```

**Engines: `postgres` or `sqlite` — and what you get when you don't choose.** If the deploy doesn't specify `database.engine`, the platform default applies, which is **`sqlite` (Cloudflare D1) unless the operator has a Postgres backend configured** — so don't be surprised when an undeclared full-stack DB behaves like SQLite. Declare `"engine": "postgres"` explicitly if you need real Postgres (`DATABASE_URL` injection, SQL dialect, `$`-free `?` placeholders still apply on the REST path). Check which engine you actually got from the deploy output's project info (or `GET /v1/runtime/config` → `project`). The REST query/migrations endpoints below work identically on both engines; only row-shape quirks differ (D1 rows may also appear under `data.raw[0].results`).

Manage backends from the CLI (dev-time):

```bash
settlemesh projects create --name demo --db postgres --auth email_password,magic_link --json
settlemesh db query <project-id> --sql "select 1" --json
settlemesh db migrate <project-id> --file schema.sql --json
```

At runtime the deployed app reads its DB **server-side only** (browsers use project Auth, never a server key):
- **Postgres** → connect with the injected `DATABASE_URL`.
- **Any engine** → `POST {SETTLEMESH_BASE_URL}/v1/projects/{SETTLEMESH_PROJECT_ID}/database/query` with `Authorization: Bearer {SETTLEMESH_PROJECT_SERVER_KEY}` (and `.../database/migrations` with `{ "name": "...", "sql": "..." }` to create tables on first run). Query body is `{ "sql": "...", "args": [...] }` — the field is **`args`** (not `params`). Placeholders are **engine-specific**: on **D1/sqlite** use **`?`**; on **Postgres** use **`$1, $2, …`** (Postgres reads `?` as a JSON operator, so `?` placeholders raise a syntax error there). The response is `{ "data": { "rows": [ {col: value} ], "columns": [...], "rows_affected": n } }` — read `data.rows`; on the D1 engine the rows may also appear under `data.raw[0].results`. Note: `INSERT … RETURNING` does NOT surface the returned rows on this REST path (you get `rows_affected` only) — run a follow-up `SELECT` if you need the inserted row back.

### Per-user data isolation — don't hand-roll `WHERE user_id` (multi-tenant safety)

The platform isolates **apps** from each other (each app gets its own schema + role). It does **not** isolate your app's **end-users** from each other — that is your job. The naive way (filtering every query with `WHERE user_id = ?`) leaks the moment one query forgets the filter — the classic multi-tenant bug. SettleMesh gives you a database-enforced shortcut so a forgotten filter fails **closed**, not open (postgres engine):

1. **Turn on row-level security for a table once:**
   ```bash
   settlemesh db enable-rls <project-id> --table notes --owner-column user_id --json
   ```
   Postgres itself now filters every read/write on `notes` to the current end-user — even over the direct `DATABASE_URL` connection.

2. **Tell the database who the end-user is, per request.** The user id is the authenticated subject (the `__settle` session / `X-Settle-User-ID`), never something the browser hands you:
   - **Control-plane query:** `settlemesh db query <project-id> --sql "select * from notes" --user <user-sub>` (or `POST .../database/query` with `"user_id": "<user-sub>"`).
   - **Direct `DATABASE_URL` (keep your ORM + transactions):** inside an **explicit transaction**, make its **first statement** `SET LOCAL "settle.user_id" = '<user-sub>'` — bind the value as a parameter or escape it (the sub is the authenticated subject, never a raw browser value). Every ORM exposes a per-transaction hook for this; afterwards ordinary queries see only that user's rows — no `WHERE user_id` needed. (`SET LOCAL` only lasts the transaction; in autocommit mode it is a no-op and the query then fail-closes to zero rows — so wrap it in a transaction.)

3. **Fail-closed:** if `settle.user_id` is never set, an RLS table returns **zero rows** and rejects writes — so a missed bind is a safe empty result, not a cross-user leak.

Read the live operational bounds (query row/byte caps, per-app connection cap + pool math, idle-disconnect window, delete-recoverability, storage-metering rate) from `GET /v1/runtime/config` → `limits` — don't hardcode them.

### Runtime env your app receives (declare it ⇒ get it)

The deploy INJECTS env **based on what your `stack` declares**. If your runtime code reads one of these but you didn't declare the matching block, it is simply **absent at runtime → a silent 500**. So: read it ⇒ declare it.

| Your code reads | Requires declaring |
|---|---|
| `SETTLEMESH_BASE_URL`, `SETTLEMESH_APP_API_KEY`, `SETTLEMESH_STORAGE_API`, `SETTLEMESH_APP_ID` | always injected |
| `DATABASE_URL`, `SETTLEMESH_PROJECT_ID`, `SETTLEMESH_PROJECT_SERVER_KEY` | `stack.database` |
| `SETTLEMESH_MERCHANT_API_KEY`, `SETTLEMESH_MERCHANT_ID` | `stack.billing` |
| `SETTLEMESH_AUTH_*` + the `/__settle/*` routes | `stack.auth` (or `--full-stack`) |

Always call the platform at `SETTLEMESH_BASE_URL` (the `api.` host — it survives long async calls). **Never hardcode `www.`/the apex** — `www` is the Vercel frontend and gateway-502s long calls.

**One-call config (skip reading the non-secret vars individually):** `GET {SETTLEMESH_BASE_URL}/v1/runtime/config` with `Authorization: Bearer {SETTLEMESH_APP_API_KEY}` returns your app's resolved non-secret config — `base_url`, `storage_api`, `capabilities_invoke`, `app_id`, the `/__settle/*` auth routes, and (when declared) `project` (DB query/migrations URLs) and `merchant` (checkout URL). Secrets are never in the response; they stay in env. So an app can read just `SETTLEMESH_APP_API_KEY` + `SETTLEMESH_BASE_URL` and fetch the rest.

**Object storage** (always injected; namespaced per app): all calls use `Authorization: Bearer {SETTLEMESH_APP_API_KEY}`. The namespace is determined by the **authenticating key**, not by any header: the injected runtime key (`SETTLEMESH_APP_API_KEY`) scopes you to `apps/<app_id>/`, so your app only ever sees its own objects. (A plain account/owner key used directly — e.g. while testing from the CLI — is namespaced per-owner under `apps/owner-<owner_id>/` instead; deployed apps always use the runtime key, so this only matters for ad-hoc testing.)
- Write: `PUT {SETTLEMESH_BASE_URL}/v1/storage/objects/<key>` with the file bytes as the body (`Content-Type` sets the stored type).
- **Read: `GET {SETTLEMESH_BASE_URL}/v1/storage/objects/<key>`** — streams the bytes back directly (Bearer-auth). Add `?presign=true` (or `POST /v1/storage/sign {"key":"..."}`) only if you want a short-lived shareable URL instead of the bytes.
- List: `GET {SETTLEMESH_BASE_URL}/v1/storage/objects?prefix=&limit=`. Delete: `DELETE .../objects/<key>`.

### Wire one service to another with `@app:` (don't hardcode sibling URLs)

A multi-service app (e.g. frontend + backend) wires the dependency by reference, not by pasting a URL:

```json
{ "stack": { "runtime": { "env": { "NEXT_PUBLIC_API_BASE_URL": "@app:my-api" } } } }
```

On deploy `@app:my-api` resolves to that app's live URL **before the build** (so it bakes into build-time `NEXT_PUBLIC_*`/`VITE_*`) and keeps working across the sibling's redeploys. Hardcoding the sibling URL breaks the moment it changes.

## Optional App API Or CLI Command

Use App APIs and App Commands only when the app should expose a route or command for other users or agents.

```bash
settlemesh apps api publish <app-id> --file app-api.json --json
settlemesh apps api call <app-id> <endpoint-id> --input '{}' --json

settlemesh apps commands publish <app-id> --file app-commands.json --json
settlemesh run <command-id> --input '{}' --json
```

**Resale-chain contract (App APIs / agent invokes):** each platform-mediated hop is depth-capped (default 5) and owner cycles (A→B→A) are rejected with 403 `chain_depth_exceeded` / `owner_cycle_detected`; markup is earned **once per distinct owner in the whole chain**, so re-wrapping your own layer never double-charges. If your app receives an `X-Settle-Call-Chain` header on an inbound invocation, forward it unchanged on every SettleMesh call you make while serving that request — it is a signed ancestry token; dropping it only shortens your own chain accounting. **Hosted agents** get this automatically: the built-in runtime reads `SETTLEMESH_CALL_CHAIN` from the sandbox env and forwards it on every capability/LLM call, so agent→agent chains are counted end-to-end with no code on your part. A custom agent runtime must forward `SETTLEMESH_CALL_CHAIN` as the `X-Settle-Call-Chain` header itself.

## Hand Off To A Human

When a task needs human judgment (confirm, sign in, pay, review), create a login-gated continuation URL instead of guessing:

```bash
settlemesh handoff create <provider-or-app> <action-id> --input '{...}' --json
settlemesh handoff get <session-id> --json
settlemesh open <command-ref> --input '{...}'   # open an app command's web/handoff page with your CLI identity
```

`<provider-or-app>` is a provider name or your **app id** (`app_...`) — NOT a raw URL; pass the app whose `/api/handoff/sessions` endpoint should receive the session.

Give the returned URL to the user, then poll `handoff get` for the result.

**If the provider is your own endpoint/app, it must speak the handoff webhook contract.** On `handoff create` the platform POSTs the session (JSON body; headers include `X-Settle-Handoff-Session`, `X-Settle-Caller-Account`, and an HMAC `X-Settle-Handoff-Signature: sha256=<hex>`) to the provider — an app provider receives it at `{app base}/api/handoff/sessions`. The endpoint MUST respond with JSON containing **`continuation_url`** (top-level, or nested under `data`) — the human-facing URL the platform hands back to the caller. Any response without `continuation_url` fails the create with `handoff endpoint did not return continuation_url`. A relative `continuation_url` is resolved against the provider's base URL.

## Publish Your Own Service (wrap any API → a searchable, billable SettleMesh service)

Turn an external HTTP API into a SettleMesh service others can discover and call (no platform code change). Init from an OpenAPI spec, validate, set secrets/env, then publish:

```bash
settlemesh services init <openapi.json|url> --json   # derives a service card (operations, pricing)
settlemesh services validate ./service.json --json
settlemesh services secrets set <id> API_KEY=...      # upstream creds, stored encrypted, never exposed
settlemesh services env set <id> BASE_URL=...
settlemesh services upload ./service.json --json
settlemesh services publish <id> --visibility public --json   # then `settlemesh search` finds it
```

Set per-call/per-duration/per-token pricing in the service card so callers pay Aev and you earn owner revenue (platform fee applies). To register an existing website as a Settle-native service, see `settlemesh sites --help`. Run `settlemesh services --help` for the full lifecycle.

**HTTP-only (no CLI):** the same lifecycle is REST — `POST /v1/dynamic-services` (body = the service-card JSON) → returns `{dsvc_id}`; `POST /v1/dynamic-services/{id}/publish` with `{"visibility":"public"}` to enter the approval queue; `GET /v1/dynamic-services` to list, `DELETE /v1/dynamic-services/{id}` to remove. (`PATCH /v1/dynamic-services/{id}` is a **full-replace** — send the entire card, or use `/publish` just to flip visibility.) In the card, `operations[].action` is a closed semantic enum (e.g. `read`) — **not** an HTTP verb; if a value is rejected, derive the card from `settlemesh services init <openapi>` rather than guessing the field shape.

Note on visibility: `--visibility public` enters an **approval queue** (it won't appear in global `search` until approved). Check approval state with `settlemesh services list` (there is no dedicated status command yet). Your own dynamic service is callable by you **right after `upload`, before approval**, but only via the raw HTTP invoke endpoint — the CLI `tool call` / `services show <dsvc_id>` do NOT resolve an unapproved dynamic service. Use the `dsvc_...` id from `upload`:
```
POST {SETTLEMESH_BASE_URL}/v1/dynamic-services/<dsvc_id>/operations/<operation_id>/invoke
Authorization: Bearer {your key}
{ ...operation input... }     # → { "data": { "body": {...}, "upstream_status": 200 } }
```
The `<operation_id>` is **slugified/lowercased** from your OpenAPI `operationId` (e.g. `lookupZip` → `lookupzip`). Use the id shown in the `upload`/`validate` output — not the raw operationId from your spec — or the invoke 404s.

## Publish A Hosted Agent

```bash
settlemesh agents create --name helper --template hermes --public --max-budget 50 --allowed-capabilities web.search,web.scrape,llm.chat --json
settlemesh agents invoke agent_123 --input '{"prompt":"hello"}' --json
settlemesh agents deploy agent_123 --project ./agent-dir --json
```

Templates differ in setup: **`hermes` auto-deploys a version on create** (invokable immediately, as above), while `simple_workflow` needs its own deployed version before the first invoke — if you just want a working agent fast, use `hermes`. Delete a hosted agent you no longer need with `DELETE /v1/agents/{agent_id}` (or `settlemesh agents delete <agent-id>` on a current CLI — older installs lack the subcommand, the HTTP route always works): it stops listing and invoking, while its invocation history stays readable for billing audit.

An invoke returns the invocation in `data`. If the agent ran cleanly but did not finish the task within its step budget, you get **HTTP 200 with `success:false` and `data.output.error: "max_steps_exceeded"`** — that is a graceful stop, not a platform error; read `data.output`/`data.events`, then re-invoke with a higher step budget: pass `--max-steps 20` (CLI) or include `"max_steps": 20` in the invoke input object (the runtime reads `max_steps` from the input, overriding the version default). A genuine infrastructure failure (sandbox crash, timeout) returns 502 — and note a 502 body may be a non-JSON HTML edge page, so treat a non-JSON 502 as a transient infra error to retry, not a readable result.

## Share Local Compute As A Worker

```bash
settlemesh worker start --name local-model --public --model local/model --endpoint http://localhost:11434/v1/chat/completions --credits-per-second 0.05
```

Other users can find approved public worker offers through service search.

Pricing is **fractional per compute-second** (`--credits-per-second`); a job is billed `rate × (completed_at − started_at)`. Inspect a finished job's status, timing, and billed cost with `settlemesh worker job <job-id>` (shows `metadata.settlement_cost_credits`; `tool events` does not resolve `wjob_` ids). Omitting the rate makes the offer **free** (callers run it at 0 Aev) — the CLI prints a stderr note when that happens, so a silent free offer is never an accident. Charges can be sub-1-Aev — a short job at a small rate (e.g. 0.05/s × 4s = 0.2 Aev) may not visibly move an integer balance readout, so verify billing via the job/request cost, not a balance delta. A caller that owns the offer pays the cost normally (no owner-earnings rebate to self); owner earnings only apply when a *different* account calls your offer. The `worker start` process keeps the offer online while it polls; stop it with Ctrl-C, or from another shell run `settlemesh worker stop <worker-id>` — that takes the worker and its offers offline and signals a still-running poller to exit (so it won't re-register itself online).

## Load The Toolset Into Your Own Agent Runtime

Export SettleMesh tools as native function schemas for your SDK, including user-published services:

```bash
settlemesh tool schema --format openai --include-services --json
# --format also supports anthropic | mcp | settle
```
