# OpenAI Plugin Submission Packet

This packet is the source of truth for the public SettleMesh plugin submission. Keep reviewer credentials out of this repository and enter them only in the OpenAI Platform submission portal.

## Submission Type

Submit SettleMesh as a skills-plus-local-MCP plugin for Codex. The bundled skill installs the public `settlemesh` CLI and the bundled MCP configuration starts `npx -y settlemesh mcp` on the user's machine.

Do not submit this release as an MCP-backed ChatGPT app. The current MCP server is a local stdio command, not a publicly hosted HTTPS MCP endpoint. A future app-plus-skills release needs a public production MCP URL, domain verification, and remote authentication review.

## Listing Details

| Field | Value |
| --- | --- |
| Plugin name | SettleMesh |
| Publisher | StructureIntelligence Inc. |
| Category | Developer Tools |
| Short description | Deploy and monetize agent-built apps: login, database, usage billing, end-user payments. |
| Website | https://www.settlemesh.io/ |
| Support | https://www.settlemesh.io/support |
| Privacy policy | https://www.settlemesh.io/privacy |
| Terms of service | https://www.settlemesh.io/terms |
| Repository | https://github.com/StructureIntelligence/SettleMesh |

Long description:

> SettleMesh turns an agent-written app into a live, paid product in one command: managed OAuth login, a managed database, usage-based billing, and end-user payments. It also gives coding agents a searchable capability catalog over the SettleMesh CLI and local MCP server. The plugin requires the user's SettleMesh login or API key. It asks for confirmation before paid, deploy, publish, or destructive actions.

## Starter Prompts

1. Deploy this app with SettleMesh, including login, a database, and usage billing.
2. Show me the SettleMesh capabilities for this task and quote any paid action first.
3. Turn this agent-built app into a paid product with end-user billing.

## Reviewer Access

Before submission, create a dedicated reviewer account with a non-expiring test API key and enough Aev credit for the test cases below. The reviewer flow must not require MFA, SMS, email confirmation, a private network, or a paid card. Enter the credential only in the OpenAI Platform portal; never commit it to Git.

## Positive Test Cases

1. **Capability discovery**
   - Prompt: `Show me which SettleMesh capability can search the web for a topic.`
   - Expected behavior: The plugin uses `settlemesh search` and `settlemesh tool show` to identify the relevant capability, without completing a paid action.
   - Expected result: A tool identifier, plain-language capability summary, and any price/quote information available before execution.

2. **Deploy a prepared app**
   - Prompt: `Deploy the provided sample app with SettleMesh and wait for the live URL.`
   - Expected behavior: The plugin checks the target folder, explains the deployment scope, requests confirmation, then runs `settlemesh deploy ./sample-app --name reviewer-sample --full-stack --wait --json`.
   - Expected result: A `*.run.settlemesh.io` URL and structured deployment result.

3. **Add a managed database**
   - Prompt: `Prepare this app for persistent user data with SettleMesh.`
   - Expected behavior: The plugin identifies the relevant deploy or database recipe and explains the data impact before proceeding.
   - Expected result: A production deployment plan or an executed deployment only after confirmation.

4. **Quoted capability call**
   - Prompt: `Find a SettleMesh tool for image generation and show the quote before using it.`
   - Expected behavior: The plugin discovers the tool, presents quote information, and waits for an explicit confirmation before the metered call.
   - Expected result: No paid request occurs before approval; after approval, the result contains the generation output or job reference.

5. **MCP availability**
   - Prompt: `Use the SettleMesh MCP tools to list available capabilities.`
   - Expected behavior: The bundled MCP process starts with `npx -y settlemesh mcp` and authenticates using the reviewer account.
   - Expected result: The capability catalog is discoverable as MCP tools.

## Negative Test Cases

1. **No confirmation for a paid action**
   - Scenario: The user asks to run a metered image or model capability without approving the displayed cost.
   - Expected behavior: The plugin stops at the quote and requests confirmation; it does not use `--confirm` or charge the account.

2. **No confirmation for deployment**
   - Scenario: The user asks to deploy a local project but does not confirm the production action.
   - Expected behavior: The plugin explains the target, auth, database, and billing scope and asks for confirmation before invoking `settlemesh deploy`.

3. **Invalid or missing credentials**
   - Scenario: No SettleMesh login session or API key exists.
   - Expected behavior: The plugin explains how to run `settlemesh login` or set `SETTLE_API_KEY`; it does not fabricate credentials or attempt a paid action.

## Release Notes

Initial public submission. SettleMesh provides a Codex workflow for deploying agent-built apps with login, a managed database, usage-based billing, and end-user payments. The plugin also bundles the public SettleMesh CLI/MCP capability catalog. Paid, deployment, publishing, and destructive actions require explicit user confirmation.

## Submission Gate

Submit only after all of the following are true:

- The OpenAI Platform organization has Apps Management write access for the submitter.
- StructureIntelligence Inc. has a verified business identity in the same OpenAI Platform organization.
- `https://www.settlemesh.io/support` is live and contains a public support path.
- A reviewer credential and sample app are available through the portal without MFA or private-network access.
- The plugin passes local validation and a clean-environment install test.
