// Tiny client. Talks ONLY to this app's /api/* — never to SettleMesh directly, never sees a key.
const $ = (id) => document.getElementById(id);
let spent = 0;
const OPERATION_STORAGE_KEY = "settlemesh.auth-payments-minimal.pending-operation.v1";
const OPERATION_ID = /^[A-Za-z0-9._:-]{8,200}$/;

function loadOperation() {
  try {
    const value = JSON.parse(sessionStorage.getItem(OPERATION_STORAGE_KEY) || "null");
    if (value && OPERATION_ID.test(value.id) && value.input && typeof value.input === "object" && !Array.isArray(value.input)) {
      return {
        id: value.id,
        input: value.input,
        // Old stored records predate this marker, so preserve them conservatively as possible effects.
        effect_may_have_started: value.effect_may_have_started !== false,
      };
    }
    sessionStorage.removeItem(OPERATION_STORAGE_KEY);
  } catch { /* storage unavailable or stale: keep the in-memory safety path */ }
  return null;
}

function storeOperation(value) {
  try {
    if (value) sessionStorage.setItem(OPERATION_STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(OPERATION_STORAGE_KEY);
  } catch { /* storage unavailable: the current page still preserves the operation */ }
}

let operation = loadOperation();
let quotedInput = null;

// One edit point for the example action body. The displayed quote and a new operation both snapshot
// this object; every /api/action request is quoted again server-side with that same stored snapshot.
function defaultActionInput() {
  // TODO(you): return whatever your chosen capability needs in the body.
  return {};
}

function copyInput(value) {
  return JSON.parse(JSON.stringify(value));
}

function operationAfterKnownPreEffect(currentOperation, hadPriorPossibleEffect) {
  return hadPriorPossibleEffect ? currentOperation : null;
}

function newOperationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return "web-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function updateOperationUI() {
  // Preserve the original input snapshot and key until capture; the button can only replay that pair.
  $("runlabel").textContent = operation ? "Retry same operation" : "Run paid action";
  $("run").title = operation ? "Retries the same request body with the same Idempotency-Key" : "";
}

function fmtAev(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return String(n);
}

// Render live quote truth: exact price vs representative floor vs usage hold ceiling.
// Never labels a floor/ceiling as a final capture charge.
function formatQuote(quote) {
  if (!quote || typeof quote !== "object") return "";
  const kind = quote.quote_kind;
  const total = quote.total_credits;
  const ceiling =
    (typeof quote.hold_ceiling_credits === "number" && quote.hold_ceiling_credits) ||
    (typeof quote.ceiling_credits === "number" && quote.ceiling_credits) ||
    (typeof quote.preauthorization_credits === "number" && quote.preauthorization_credits) ||
    (typeof quote.capture_ceiling_credits === "number" && quote.capture_ceiling_credits) ||
    total;
  const label = typeof quote.price_label === "string" && quote.price_label.trim() ? quote.price_label.trim() : "";

  if (kind === "exact" && typeof total === "number") {
    return label ? `${fmtAev(total)} Aev exact · ${label}` : `${fmtAev(total)} Aev exact`;
  }
  if (kind === "representative_floor" && typeof total === "number") {
    return label
      ? `from ${fmtAev(total)} Aev floor · ${label} (not final charge)`
      : `from ${fmtAev(total)} Aev representative floor (not final charge)`;
  }
  if (kind === "hold_ceiling" && typeof ceiling === "number") {
    return label
      ? `up to ${fmtAev(ceiling)} Aev hold ceiling · actual usage · ${label}`
      : `up to ${fmtAev(ceiling)} Aev hold ceiling (actual usage, not a final charge)`;
  }
  if (label) return label;
  if (typeof total === "number") return `${fmtAev(total)} Aev (live quote)`;
  return "";
}

function formatQuoteError(err) {
  if (!err || typeof err !== "object") return "Live quote failed; no price is assumed and the action will not run.";
  const parts = [];
  if (err.code) parts.push(`code ${err.code}`);
  if (err.message) parts.push(err.message);
  if (err.fix) parts.push(`fix: ${err.fix}`);
  if (err.trace_id) parts.push(`trace ${err.trace_id}`);
  if (typeof err.retryable === "boolean") parts.push(err.retryable ? "retryable" : "not retryable");
  if (err.availability && typeof err.availability === "object") {
    if (err.availability.status) parts.push(`availability: ${err.availability.status}`);
    const explanation = err.availability.message || err.availability.reason;
    if (explanation && explanation !== err.message) parts.push(String(explanation));
  }
  parts.push("Quote failure prevents invoke; no price is assumed.");
  return parts.join(" · ");
}

function formatMachineError(err, fallback) {
  if (!err || typeof err !== "object") return fallback;
  const parts = [];
  if (err.code) parts.push(`code ${err.code}`);
  if (err.message) parts.push(err.message);
  if (err.fix) parts.push(`fix: ${err.fix}`);
  if (err.trace_id) parts.push(`trace ${err.trace_id}`);
  return parts.length ? parts.join(" · ") : fallback;
}

function formatQuoteDetails(quote) {
  if (!quote || typeof quote !== "object") return "";
  const parts = [];
  if (typeof quote.note === "string" && quote.note.trim()) parts.push(quote.note.trim());
  if (Array.isArray(quote.required_fields) && quote.required_fields.length) {
    parts.push(`required input: ${quote.required_fields.join(", ")}`);
  }
  const availability = quote.availability;
  if (availability && typeof availability === "object") {
    if (availability.status) parts.push(`availability: ${availability.status}`);
    const explanation = availability.message || availability.reason;
    if (explanation) parts.push(String(explanation));
    if (availability.fix) parts.push(`fix: ${availability.fix}`);
  }
  return parts.join(" · ");
}

function showQuoteFailure(error, quote) {
  $("price").textContent = "";
  $("price").title = "";
  $("quotedetail").textContent = formatQuoteDetails(quote);
  $("quotedetail").hidden = !$("quotedetail").textContent;
  $("quoteerr").textContent = formatQuoteError(error);
  $("quoteerr").hidden = false;
  $("retryquote").hidden = false;
  $("retryquote").disabled = false;
  $("run").disabled = true;
  quotedInput = null;
}

async function refresh() {
  $("run").disabled = true;
  $("retryquote").disabled = true;
  let me;
  try {
    const response = await fetch("/api/me");
    me = await response.json();
  } catch {
    $("signin").hidden = true;
    $("app").hidden = false;
    showQuoteFailure({
      code: "quote_ui_backend_unavailable",
      message: "This app could not read its authentication state.",
      fix: "Check the app/backend connection, then retry. The paid action has not run.",
      retryable: true,
    });
    return;
  }
  $("signin").hidden = !!me.logged_in;
  $("app").hidden = !me.logged_in;
  if (!me.logged_in) return;

  const input = copyInput(operation ? operation.input : defaultActionInput());
  let result;
  try {
    const response = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    result = await response.json();
    if (response.status === 401 && result.login) {
      location.href = result.login;
      return;
    }
  } catch {
    showQuoteFailure({
      code: "quote_ui_backend_unavailable",
      message: "This app could not reach its read-only quote endpoint.",
      fix: "Check the app/backend connection, then retry the quote. The paid action has not run.",
      retryable: true,
    });
    return;
  }

  if (!result.ok || !result.quote) {
    showQuoteFailure(result.error, result.quote);
    return;
  }

  $("quoteerr").hidden = true;
  $("retryquote").hidden = true;
  $("price").textContent = formatQuote(result.quote);
  $("quotedetail").textContent = formatQuoteDetails(result.quote);
  $("quotedetail").hidden = !$("quotedetail").textContent;
  quotedInput = input;
  $("run").disabled = false;
  if (result.quote.note) {
    $("price").title = result.quote.note;
  } else {
    $("price").title = "";
  }
}

async function run() {
  $("run").disabled = true;
  $("err").hidden = true;
  $("out").hidden = true;
  operation = operation || {
    id: newOperationId(),
    input: copyInput(quotedInput || defaultActionInput()),
    effect_may_have_started: false,
  };
  const currentOperation = operation;
  const hadPriorPossibleEffect = currentOperation.effect_may_have_started === true;
  // Once the app request leaves the browser, a transport failure cannot prove where it stopped.
  currentOperation.effect_may_have_started = true;
  storeOperation(currentOperation);
  let quoteBlocked = false;
  updateOperationUI();
  try {
    const r = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": currentOperation.id },
      // TODO(you): send whatever your chosen capability needs in the body.
      body: JSON.stringify(currentOperation.input),
    });
    const data = await r.json();

    // Quote failure is pre-invoke: surface machine code / fix / trace; do not treat as settlement.
    if (data.phase === "quote" && data.effect_started === false && data.error && typeof data.error === "object") {
      showQuoteFailure(data.error, data.quote);
      operation = operationAfterKnownPreEffect(currentOperation, hadPriorPossibleEffect);
      storeOperation(operation);
      quoteBlocked = true;
      return;
    }

    if (r.status === 401) {
      // Session expired or never signed in — show the sign-in branch again.
      if (!hadPriorPossibleEffect && data.effect_started === false) {
        operation = null;
        storeOperation(null);
      }
      location.href = data.login || "/__settle/login";
      return;
    }

    if (data.error && typeof data.error === "object") {
      $("err").textContent = formatMachineError(data.error, "The action request was rejected.");
      $("err").hidden = false;
      if (data.effect_started === false) {
        operation = operationAfterKnownPreEffect(currentOperation, hadPriorPossibleEffect);
        storeOperation(operation);
        $("retryquote").hidden = false;
        $("retryquote").disabled = false;
      }
      quoteBlocked = data.effect_started === false;
      return;
    }

    if (!r.ok || !data.ok) {
      const id = data.idempotency_key || currentOperation.id;
      if (data.quote) {
        $("price").textContent = formatQuote(data.quote);
        $("quotedetail").textContent = formatQuoteDetails(data.quote);
        $("quotedetail").hidden = !$("quotedetail").textContent;
        $("price").title = data.quote.note || "";
      }
      const captured = data.settlement_status === "captured" &&
        typeof data.captured_aev === "number" && Number.isFinite(data.captured_aev) && data.captured_aev >= 0;
      $("err").textContent = captured
        ? `${data.message || data.error || "Action did not complete."} Trusted evidence reports ${data.captured_aev} Aev captured for operation ${id}; inspect it before retrying.`
        : `${data.message || data.error || "Action did not complete."} Settlement is unknown; reconcile operation ${id} before retrying.`;
      $("err").hidden = false;
      return;
    }

    $("out").textContent = JSON.stringify(data.result, null, 2);
    $("out").hidden = false;
    if (data.quote) {
      $("price").textContent = formatQuote(data.quote);
      $("quotedetail").textContent = formatQuoteDetails(data.quote);
      $("quotedetail").hidden = !$("quotedetail").textContent;
      if (data.quote.note) $("price").title = data.quote.note;
    }
    const captured = data.settlement_status === "captured" &&
      typeof data.captured_aev === "number" && Number.isFinite(data.captured_aev) && data.captured_aev >= 0;
    if (captured) {
      spent += data.captured_aev;
      $("spentval").textContent = String(spent);
      $("spent").hidden = false;
      operation = null;
      storeOperation(null);
    } else {
      const id = data.idempotency_key || currentOperation.id;
      $("err").textContent = `Result received, but settlement is unknown. Reconcile operation ${id} before starting another.`;
      $("err").hidden = false;
    }
  } catch (e) {
    $("err").textContent = `Network outcome is unknown. Reconcile operation ${currentOperation.id} before starting another. ${e && e.message ? e.message : ""}`;
    $("err").hidden = false;
  } finally {
    $("run").disabled = quoteBlocked;
    updateOperationUI();
  }
}

if (typeof document !== "undefined") {
  $("run").addEventListener("click", run);
  $("retryquote").addEventListener("click", refresh);
  updateOperationUI();
  refresh();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    formatQuote,
    formatQuoteDetails,
    operationAfterKnownPreEffect,
  };
}
