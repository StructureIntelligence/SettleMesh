#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

policy='A direct user request authorizes ordinary paid invocation, deploy, and mechanical publish without a duplicate confirmation.'
quote_boundary='Quote/preflight informs cost and availability; it is not a second confirmation.'
confirmation_boundary='Ask for a separate confirmation only for destructive, high-impact, authorization-expanding, truly irreversible, or explicitly `requires_confirmation` actions.'
canonical_invoke='The canonical HTTP invoke path is `POST /v1/capabilities/{id}/invoke`; `POST /v1/tools/{id}/call` is a compatibility alias only.'
automatic_publication='Passing mechanical protocol checks publish and become discoverable automatically; there is no default human approval queue.'
card_containment='Aev is the platform accounting unit. Card top-up is contained and Legal remains unverified; do not claim card funding is available.'

projections=(
  agent.md
  llms.txt
  llms-install.md
  commands/deploy.md
  plugins/settlemesh/commands/deploy.md
  rules/settlemesh.mdc
  cursor/settlemesh.mdc
  plugins/settlemesh-cursor/rules/settlemesh.mdc
  skills/settlemesh/SKILL.md
  plugins/settlemesh/SKILL.md
  plugins/settlemesh-cursor/skills/settlemesh/SKILL.md
  plugins/settlemesh-codex/skills/settlemesh/SKILL.md
)

journey_projections=(
  rules/settlemesh.mdc
  cursor/settlemesh.mdc
  plugins/settlemesh-cursor/rules/settlemesh.mdc
  skills/settlemesh/SKILL.md
  plugins/settlemesh/SKILL.md
  plugins/settlemesh-cursor/skills/settlemesh/SKILL.md
  plugins/settlemesh-codex/skills/settlemesh/SKILL.md
)

contract_projections=(
  llms.txt
  llms-install.md
  "${journey_projections[@]}"
)

failed=0

require_text() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq -- "$expected" "$file"; then
    printf 'missing required confirmation policy in %s: %s\n' "$file" "$expected" >&2
    failed=1
  fi
}

for file in "${projections[@]}"; do
  require_text "$file" "$policy"
  require_text "$file" "$quote_boundary"
  require_text "$file" "$confirmation_boundary"
done

for file in "${journey_projections[@]}"; do
  require_text "$file" 'settlemesh search "<task>" --json'
  require_text "$file" 'settlemesh show <service-or-operation-id> --json'
  require_text "$file" 'settlemesh quote <entrypoint-id> --input '\''{...}'\'' --json'
  require_text "$file" 'settlemesh call <entrypoint-id> --input '\''{...}'\'' --json'
done

for file in "${contract_projections[@]}"; do
  require_text "$file" "$canonical_invoke"
  require_text "$file" "$automatic_publication"
  require_text "$file" "$card_containment"
done

for forbidden in \
  'Confirm before any paid / deploy / destructive action' \
  '--confirm for paid' \
  'Confirm intent before any paid, deploy, publish, or destructive action' \
  'with a confirm step before any paid call' \
  'costly, side-effecting, or destructive calls' \
  'funded via Stripe' \
  'wait for human approval by default' \
  'enters a human approval queue by default' \
  'settlemesh tool call <tool-id>'; do
  if rg -n -F -- "$forbidden" "${projections[@]}"; then
    printf 'deprecated confirmation wording remains: %s\n' "$forbidden" >&2
    failed=1
  fi
done

for pair in \
  'rules/settlemesh.mdc:cursor/settlemesh.mdc' \
  'rules/settlemesh.mdc:plugins/settlemesh-cursor/rules/settlemesh.mdc' \
  'skills/settlemesh/SKILL.md:plugins/settlemesh/SKILL.md' \
  'skills/settlemesh/SKILL.md:plugins/settlemesh-cursor/skills/settlemesh/SKILL.md' \
  'skills/settlemesh/SKILL.md:plugins/settlemesh-codex/skills/settlemesh/SKILL.md' \
  'commands/deploy.md:plugins/settlemesh/commands/deploy.md'; do
  left="${pair%%:*}"
  right="${pair#*:}"
  if ! cmp -s "$left" "$right"; then
    printf 'mirrored public projections differ: %s != %s\n' "$left" "$right" >&2
    failed=1
  fi
done

require_text agent.md 'settlemesh apps delete <app-id> --confirm'
require_text agent.md '428 confirmation_required'
require_text agent.md 'agent must STOP here — never auto-pay'

if (( failed )); then
  exit 1
fi

printf 'confirmation-language guard: PASS\n'
