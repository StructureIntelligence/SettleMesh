# Claude Code Starter — agent notes

This is a tiny Next.js app meant to be built by a coding agent and shipped on
SettleMesh (a product of StructureIntelligence Inc.).

## Check deployment readiness

```
settlemesh login
settlemesh tool show app_deployments.create --json
settlemesh deploy preflight . --full-stack --json
```

Production deployment authorization is currently unavailable: `app_deployments.create` is disabled and source deploy fails closed with `deployment_authorization_unavailable`. Do not claim a build, charge, publication, or live URL. When authorization becomes available and both checks allow it, the intended command is `settlemesh deploy . --full-stack --wait --json`; the deployment contract then includes:

- **SettleMesh OAuth login** in `lazy` mode — sign-in only happens when the user
  clicks. Auth endpoints `/__settle/login`, `/__settle/logout`, and `/__settle/me`
  are injected at the edge; you do not implement them.
- **A managed database** (declared under `stack.database`). At runtime the app
  receives `SETTLEMESH_PROJECT_ID` and `SETTLEMESH_PROJECT_SERVER_KEY`; see
  `app/api/hello/route.ts` for a query example.

## Where things live

- `settlemesh.json` — the deploy manifest (framework, auth, database).
- `app/page.tsx` — one page that greets the signed-in user or shows a sign-in prompt.
- `app/api/hello/route.ts` — server route doing a managed-DB roundtrip.
- `components/powered-by-settlemesh.tsx` — optional badge, safe to delete.

## Adding capabilities

To call SettleMesh metered capabilities or payments, read the agent guide at
https://www.settlemesh.io/agent.md for the exact request bodies. Do not invent
endpoints — if unsure of a request shape, leave a TODO and consult agent.md.
