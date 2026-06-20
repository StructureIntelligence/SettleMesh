# SettleMesh — Cursor plugin

Deploy and monetize an agent-built app in one command: SettleMesh OAuth login, a managed
database, usage-based billing, and end-user payments. Bundles the SettleMesh MCP server so
Cursor can search and invoke the full capability catalog (web search/scrape, LLMs, image/video,
managed SQL, hosted agents) — every call metered, with a cost quote up front.

## What this plugin ships

- **MCP server** (`./mcp.json`) — `npx -y settlemesh mcp`. Authenticated by your `settlemesh login`
  session or `SETTLE_API_KEY`.
- **Rule** (`./rules/settlemesh.mdc`) — teaches the agent the search → inspect → call workflow and
  the deploy / end-user-pays recipes.
- **Skill** (`./skills/settlemesh/SKILL.md`) — model-invoked guidance for when/how to use SettleMesh.

## Setup (once)

```bash
npm install -g settlemesh@latest
settlemesh login        # browser approval — or set SETTLE_API_KEY=sk-settle-... for headless
```

## Install

- **Marketplace:** search "SettleMesh" in the Cursor plugin marketplace once approved.
- **One-click MCP:** see the "Add to Cursor" badge at https://settlemesh.io/docs
- **Local test:** copy this `settlemesh/` dir into `~/.cursor/plugins/local/` and reload Cursor.

---

> **Maintainer note (validate before submitting):** Cursor's `.cursor-plugin/plugin.json` and
> `marketplace.json` schemas evolve. Confirm field names (`mcpServers`/`rules`/`skills`, `owner.email`,
> `category`) against the current docs at https://cursor.com/docs before submitting at
> https://cursor.com/marketplace/publish. `category: "Payments"` matches a category visible in the
> in-app marketplace; adjust if Cursor renames it.
