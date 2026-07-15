---
description: Deploy the current app to a live URL with SettleMesh (login + database + usage billing)
---

Deploy the app in the current directory to a live, paid-ready URL using SettleMesh.

Steps:

1. Confirm auth: run `settlemesh whoami --json`. If it returns 401, tell the user to run `settlemesh login` (or set `SETTLE_API_KEY`) and stop — never proceed past a 401.
2. Inspect the project to pick the right deploy shape (static site vs full-stack container). For a full-stack app with login + managed database:
   ```bash
   settlemesh deploy . --name "$(basename "$PWD")" --full-stack --wait --json
   ```
   For a plain static site (HTML/CSS/JS), drop `--full-stack`.
3. Read the live `*.run.settlemesh.io` URL from the deploy output and report it to the user.
4. If the user wants the app to charge its end users, explain end-user-pays: the app attaches `X-Settle-Payer` so each call is billed to the signed-in user's Aev balance, with a quote before spend.

A direct user request authorizes ordinary paid invocation, deploy, and mechanical publish without a duplicate confirmation. Quote/preflight informs cost and availability; it is not a second confirmation. Ask for a separate confirmation only for destructive, high-impact, authorization-expanding, truly irreversible, or explicitly `requires_confirmation` actions. Mechanical protocol checks publish automatically after they pass. If `--wait` times out, the build may still be running — poll `settlemesh deploy status <app-id> --json` rather than concluding failure.
