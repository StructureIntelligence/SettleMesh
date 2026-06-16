# Installing the SettleMesh MCP server (for Cline and other MCP clients)

The SettleMesh MCP server is a published npm package that runs over **stdio** — no build step, no clone. To install it, add this entry to your MCP settings (for Cline: `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "settlemesh": {
      "command": "npx",
      "args": ["-y", "settlemesh", "mcp"],
      "env": {
        "SETTLE_API_KEY": "<your SettleMesh API key>"
      }
    }
  }
}
```

## Auth
- Get a SettleMesh API key at https://www.settlemesh.io, set it as `SETTLE_API_KEY`.
- Or, instead of the env var, run `npm i -g settlemesh && settlemesh login` once (browser approval); the server reuses the stored session.

## What it does
`npx -y settlemesh mcp` runs the SettleMesh capability-invoke MCP server: search the SettleMesh catalog and invoke any tool (web search/scrape, LLMs, image/video generation, managed SQL, hosted agents), with a confirm step before any paid call. One key also lets an agent deploy + monetize an app (login, database, usage billing, end-user-pays).

## Verify
- The package is published on npm as `settlemesh` and listed in the official MCP Registry as `io.settlemesh/cli`.
- `npx -y settlemesh mcp` starts a newline-delimited JSON-RPC 2.0 stdio server; an `initialize` request returns `serverInfo.name = "settlemesh"`.
