// Tiny client. Talks ONLY to this app's /api/* — never to SettleMesh directly, never sees a key.
const $ = (id) => document.getElementById(id);
let spent = 0;
const OPERATION_STORAGE_KEY = "settlemesh.auth-payments-minimal.pending-operation.v1";
const OPERATION_ID = /^[A-Za-z0-9._:-]{8,200}$/;

function loadOperation() {
  try {
    const value = JSON.parse(sessionStorage.getItem(OPERATION_STORAGE_KEY) || "null");
    if (value && OPERATION_ID.test(value.id) && value.input && typeof value.input === "object" && !Array.isArray(value.input)) return value;
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

function newOperationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return "web-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function updateOperationUI() {
  // Preserve the original empty input and key until capture; the button can only replay that pair.
  $("runlabel").textContent = operation ? "Retry same operation" : "Run paid action";
  $("run").title = operation ? "Retries the same request body with the same Idempotency-Key" : "";
}

async function refresh() {
  const me = await fetch("/api/me").then((r) => r.json()).catch(() => ({ logged_in: false }));
  $("price").textContent = me.estimate_aev != null ? `≈ ${me.estimate_aev} Aev` : "";
  $("signin").hidden = !!me.logged_in;
  $("app").hidden = !me.logged_in;
}

async function run() {
  $("run").disabled = true;
  $("err").hidden = true;
  $("out").hidden = true;
  operation = operation || { id: newOperationId(), input: {} };
  storeOperation(operation);
  const currentOperation = operation;
  updateOperationUI();
  try {
    const r = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": currentOperation.id },
      // TODO(you): send whatever your chosen capability needs in the body.
      body: JSON.stringify(currentOperation.input),
    });
    const data = await r.json();

    if (r.status === 401) {
      // Session expired or never signed in — show the sign-in branch again.
      location.href = data.login || "/__settle/login";
      return;
    }
    if (!r.ok || !data.ok) {
      const id = data.idempotency_key || currentOperation.id;
      $("err").textContent = `${data.message || data.error || "Action did not complete."} Settlement is ${data.settlement_status || "unknown"}; reconcile operation ${id} before starting another.`;
      $("err").hidden = false;
      return;
    }

    $("out").textContent = JSON.stringify(data.result, null, 2);
    $("out").hidden = false;
    const captured = data.settlement_status === "captured" &&
      typeof data.captured_aev === "number" && Number.isFinite(data.captured_aev) && data.captured_aev >= 0;
    if (captured) {
      spent += data.captured_aev;
      $("spentval").textContent = (Math.round(spent * 100) / 100).toString();
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
    $("run").disabled = false;
    updateOperationUI();
  }
}

$("run").addEventListener("click", run);
updateOperationUI();
refresh();
