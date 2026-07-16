#!/usr/bin/env bash
set -euo pipefail

if ! command -v rg >/dev/null 2>&1; then
  printf 'money-settlement truth guard requires ripgrep (rg)\n' >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

sources=(
  agent.md
  templates/ai-saas-paid-api/server.js
  templates/ai-saas-paid-api/public/app.js
  templates/ai-saas-paid-api/public/index.html
  templates/ai-saas-paid-api/README.md
  templates/auth-payments-minimal/server.js
  templates/auth-payments-minimal/public/app.js
  templates/auth-payments-minimal/public/index.html
  templates/auth-payments-minimal/README.md
)

failed=0

blind_retry_pattern='(?:(?<!not )(?<!never )retry\s+blindly.{0,120}(?:timeout|502)|(?:timeout|502).{0,120}(?<!not )(?<!never )retry\s+blindly)'
failure_no_charge_pattern='(?:(?:http|network|timeout|502|call|action).{0,100}(?:fail(?:ed|ure)?|error).{0,100}(?:not|nothing|no\s+amount\s+was)\s+(?:was\s+)?charged|(?:not|nothing)\s+(?:was\s+)?charged.{0,120}(?:http|network|timeout|502|call|action).{0,60}(?:fail(?:ed|ure)?|error))'
recursive_cost_pattern='(?:function\s+extractCost\s*\(|const\s+keys\s*=\s*\[[^]]*(?:cost|amount|charged)[^]]*\].{0,500}extractCost\s*\()'
estimate_as_charge_pattern='(?:charged\s*=.{0,160}(?:estimate|PRICE_)|actual\s*=.{0,160}(?:estimate|PRICE_)|(?:≈|approx(?:imate)?).{0,80}charged|estimate.{0,160}(?:charged|captured))'
success_as_capture_pattern='(?:charged.{0,80}(?:on|after)\s+(?:provider\s+|http\s+)?success|(?:provider\s+|http\s+)?success.{0,80}(?:charged|captured))'

reject_pattern() {
  local label="$1"
  local pattern="$2"
  shift 2
  if rg -n -i -U --pcre2 -- "$pattern" "$@"; then
    printf 'money-settlement truth violation: %s\n' "$label" >&2
    failed=1
  fi
}

require_pattern() {
  local file="$1"
  local label="$2"
  local pattern="$3"
  if ! rg -q -i -U --pcre2 -- "$pattern" "$file"; then
    printf 'money-settlement truth contract missing in %s: %s\n' "$file" "$label" >&2
    failed=1
  fi
}

require_text() {
  local file="$1"
  local label="$2"
  local expected="$3"
  if ! grep -Fq -- "$expected" "$file"; then
    printf 'money-settlement truth contract missing in %s: %s\n' "$file" "$label" >&2
    failed=1
  fi
}

run_self_tests() {
  local self_failed=0

  assert_rejects() {
    local label="$1"
    local pattern="$2"
    local text="$3"
    if ! printf '%s\n' "$text" | rg -q -i -U --pcre2 -- "$pattern"; then
      printf 'money-settlement self-test FAIL (expected reject): %s\n' "$label" >&2
      self_failed=1
    fi
  }

  assert_allows() {
    local label="$1"
    local pattern="$2"
    local text="$3"
    if printf '%s\n' "$text" | rg -q -i -U --pcre2 -- "$pattern"; then
      printf 'money-settlement self-test FAIL (expected allow): %s\n' "$label" >&2
      self_failed=1
    fi
  }

  assert_rejects 'blind timeout retry' "$blind_retry_pattern" \
    'Safe to retry blindly on a timeout/502.'
  assert_allows 'explicitly prohibits blind retry' "$blind_retry_pattern" \
    'On timeout/502, do not retry blindly; reconcile the same operation.'
  assert_rejects 'network error claims no capture' "$failure_no_charge_pattern" \
    'Network error — you were not charged.'
  assert_allows 'network error stays unknown' "$failure_no_charge_pattern" \
    'Network error — settlement is unknown; reconcile the same operation.'
  assert_rejects 'recursive cost miner' "$recursive_cost_pattern" \
    'function extractCost(value) { return value.children.map(extractCost); }'
  assert_rejects 'estimate labelled charged' "$estimate_as_charge_pattern" \
    'const charged = response.cost_aev || response.estimate_aev;'
  assert_allows 'estimate remains pre-call information' "$estimate_as_charge_pattern" \
    'The estimate is read-only pre-call information; settlement remains unknown.'
  assert_rejects 'provider success labelled charged' "$success_as_capture_pattern" \
    'The user is charged on success only.'
  assert_allows 'capture evidence remains authoritative' "$success_as_capture_pattern" \
    'Provider success is output only; final charge requires trusted capture evidence.'

  if (( self_failed )); then
    return 1
  fi
  printf 'money-settlement truth self-test: PASS\n'
}

if ! run_self_tests; then
  failed=1
fi

run_safe_funding_url_tests() {
  node <<'NODE'
const assert = require("node:assert/strict");
const { safeFundingURL } = require("./templates/ai-saas-paid-api/server.js");

for (const rejected of [
  "javascript:alert(1)",
  "data:text/html,unsafe",
  "http://example.com/topup",
  "//example.com/topup",
  "https://user@example.com/topup",
  "https://user:secret@example.com/topup",
  "/safe\nunsafe",
  "/\\example.com/topup",
]) {
  assert.equal(safeFundingURL(rejected), null, `expected rejection: ${JSON.stringify(rejected)}`);
}

assert.equal(safeFundingURL("/__settle/billing?return=wallet"), "/__settle/billing?return=wallet");
assert.equal(safeFundingURL("https://billing.example.com/topup?return=wallet"), "https://billing.example.com/topup?return=wallet");
NODE
}

if ! run_safe_funding_url_tests; then
  printf 'safe funding URL contract: FAIL\n' >&2
  failed=1
else
  printf 'safe funding URL contract: PASS\n'
fi

# A transport result alone cannot prove whether a paid effect was captured.
reject_pattern \
  'timeout/502 guidance says to retry blindly' \
  "$blind_retry_pattern" \
  agent.md
reject_pattern \
  'HTTP/network failure is presented as proof that no charge happened' \
  "$failure_no_charge_pattern" \
  "${sources[@]}"

# Provider payloads are capability output, not settlement authority.  Mining
# arbitrary nested cost/amount/charged-like fields must never drive the UI.
reject_pattern \
  'recursive arbitrary response-field cost mining remains' \
  "$recursive_cost_pattern" \
  templates/ai-saas-paid-api/server.js \
  templates/auth-payments-minimal/server.js

# An estimate may be shown before/alongside an operation, but never relabelled
# or accumulated as captured money when trusted capture evidence is absent.
reject_pattern \
  'estimate or approximation is presented/accumulated as charged' \
  "$estimate_as_charge_pattern" \
  templates/ai-saas-paid-api/server.js \
  templates/ai-saas-paid-api/public/app.js \
  templates/auth-payments-minimal/server.js \
  templates/auth-payments-minimal/public/app.js
reject_pattern \
  'provider/HTTP success is presented as capture proof' \
  "$success_as_capture_pattern" \
  templates/ai-saas-paid-api/public/index.html \
  templates/auth-payments-minimal/public/index.html
reject_pattern \
  'live Stripe/card funding is claimed without Legal/provider availability' \
  '(?:funded\s+(?:by|via).{0,40}Stripe|(?:Stripe|card)\s+(?:top-?up|funding)\s+is\s+available|top-?up\s+with\s+Stripe)' \
  templates/ai-saas-paid-api/server.js \
  templates/ai-saas-paid-api/README.md \
  templates/auth-payments-minimal/server.js \
  templates/auth-payments-minimal/README.md
reject_pattern \
  'template fabricates a fixed hosted funding path instead of consuming live availability' \
  '(?:topup|topup_url)\s*:\s*"\/__settle\/billing"' \
  templates/ai-saas-paid-api/server.js \
  templates/auth-payments-minimal/server.js

for server in \
  templates/ai-saas-paid-api/server.js \
  templates/auth-payments-minimal/server.js; do
  require_pattern "$server" 'explicit trusted capture header' 'x-settle-charged-aev'
  require_pattern "$server" 'settlement state is explicit' 'settlement_status'
  require_pattern "$server" 'logical operation identity is forwarded' 'Idempotency-Key'
done
require_pattern templates/ai-saas-paid-api/server.js \
  'funding navigation validates the live URL before exposing it' 'const\s+topup\s*=\s*safeFundingURL\(detail\.topup_url\)'

for client in \
  templates/ai-saas-paid-api/public/app.js \
  templates/auth-payments-minimal/public/app.js; do
  require_pattern "$client" 'browser creates/preserves a logical operation identity' 'Idempotency-Key'
  require_pattern "$client" 'unknown settlement tells the user to reconcile' 'reconcil'
  require_pattern "$client" 'unknown settlement exposes an exact same-operation retry' 'Retry same operation'
  require_pattern "$client" 'same-operation retry survives navigation/reload' 'sessionStorage'
done
require_pattern templates/ai-saas-paid-api/public/app.js \
  'AI retry preserves the original request body' 'state\.operation\s*=\s*\{[^}]*prompt:[\s\S]{0,800}operation\.prompt'
require_pattern templates/auth-payments-minimal/public/app.js \
  'minimal retry preserves the original request body' 'operation\s*=\s*operation\s*\|\|[\s\S]{0,200}input:[\s\S]{0,800}currentOperation\.input'

require_pattern agent.md \
  'unknown outcomes preserve the same logical operation identity' \
  'same (?:idempotency key|logical operation identity).{0,200}reconcil'
require_text agent.md \
  'transport failure remains unknown and replays only exact body/key' \
  "A transport failure such as HTTP 502 leaves a paid call's outcome unknown. Preserve the original request and reconcile it; only resend when the server supports replay, using the exact same body and **\`Idempotency-Key\`** for that logical operation. A fresh key creates a fresh paid operation. Send an **\`Idempotency-Key\`** on retriable paid calls:"
require_pattern agent.md \
  'only trusted capture evidence may be called charged' \
  '(?:captured ledger.{0,160}x-settle-charged-aev|x-settle-charged-aev.{0,160}captured ledger)'
require_text agent.md \
  'publish fee requirement is distinct from current charge admission' \
  '`fee_required` is separate from `will_charge`'
require_text agent.md \
  'paid publish admission reports its stable unavailable code' \
  '`publish_settlement_unavailable`'
require_text agent.md \
  'paid publish admission exposes its stable recovery field' \
  '`admission.fix`'
require_text agent.md \
  'positive-quota recovery has exact count, list, reversible visibility command, and target readback' \
  'run `settlemesh services list --json`; make at least 1 existing shared service entry private with `settlemesh services publish <existing-service-id> --visibility private --json`; then rerun `settlemesh services config-status <id> --json`'
require_text agent.md \
  'zero-quota recovery remains unable and private until settlement admission exists' \
  'With a zero free quota, shared publish is currently `UNABLE`, the service stays private, and the fix gives the exact config-status readback to run after atomic settlement admission is enabled.'
require_text agent.md \
  '503 is conditional on earlier gates and unchanged admission' \
  'if the earlier mechanical gates pass and the admission state is unchanged'
require_text agent.md \
  'conditional 503 keeps recovery fields and precedes effects' \
  'the publish returns HTTP 503 with the same recovery fields before any hold, capture, or publication'
require_pattern agent.md \
  'copyable publish flow branches before mutation and reads search after publish' \
  'settlemesh services upload ./service\.json --json\s+settlemesh services config-status <id> --json\s+# continue only when publish_fee\.admission\.can_start_now is true:\s+settlemesh services publish <id> --visibility public --json\s+settlemesh search <service-id>'
reject_pattern \
  'generic publish recovery hides quota-specific actions' \
  'publish within the free quota or wait until atomic publish settlement admission is available' \
  agent.md
reject_pattern \
  'will_charge false is falsely presented as proof of a free publish' \
  '`will_charge:false` means you are still inside the free publish quota or the fee is disabled' \
  agent.md
reject_pattern \
  'paid publish is falsely described as an insufficient-balance 402' \
  'insufficient balance returns 402 without publishing' \
  agent.md

if (( failed )); then
  printf 'money-settlement truth guard: FAIL\n' >&2
  exit 1
fi

printf 'money-settlement truth guard: PASS\n'
