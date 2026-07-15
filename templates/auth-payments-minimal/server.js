// auth-payments-minimal — the "hello world" of paid apps on SettleMesh.
//
// THE WHOLE POINT (the G2 end-user-pays loop):
//   The user signs in with their SettleMesh account at the platform auth gate (/__settle/login).
//   This server then bills THAT logged-in user — not you, the developer — for one paid action, by:
//     1. authenticating to SettleMesh with the app's injected runtime key (SETTLEMESH_APP_API_KEY), and
//     2. forwarding the user's session token as the `X-Settle-Payer` header on the billable call.
//   `X-Settle-Payer` is what charges the LOGGED-IN USER's Aev wallet instead of yours. We ALWAYS send
//   it on user-triggered billable calls. If it's absent, the route returns 401 and the UI shows a
//   "Sign in with SettleMesh" button — we never silently bill the developer for a user action.
//
//   THE RUNTIME KEY NEVER REACHES THE BROWSER. It stays server-side; the browser only talks to /api/*.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const BASE = (process.env.SETTLEMESH_BASE_URL || process.env.SETTLE_BASE_URL || "https://api.settlemesh.io").replace(/\/+$/, "");
// Injected by the platform at deploy time. Locally, export it yourself (see README).
const RUNTIME_KEY = process.env.SETTLEMESH_APP_API_KEY || process.env.SETTLE_API_KEY || "";

// -------------------------------------------------------------------------------------------------
// CONFIGURE YOUR PAID ACTION HERE.
//
// A "capability" is a metered SettleMesh action invoked at POST /v1/capabilities/{id}/invoke.
// Pick the capability your app charges for, set its ID below, and shape `input` to match it.
//
// TODO(you): set CAPABILITY_ID to the capability you want to bill for, and confirm the exact
//            `input` body for it. The capability catalogue + per-capability request shapes are in
//            the agent guide at https://www.settlemesh.io/agent.md — do NOT guess the ID or body.
//            (Example real capability used by other templates: "image.gpt-image-2".)
const CAPABILITY_ID = "REPLACE_WITH_A_REAL_CAPABILITY_ID"; // e.g. "image.gpt-image-2"

// Static price floor (Aev) shown in the UI if /v1/billing/quote is unavailable.
// 1 USD = 100 Aev. Replace with your action's real price.
const PRICE_AEV = 1.5;

// -------------------------------------------------------------------------------------------------
// Payer extraction: the logged-in user's token. Bearer header, else the durable __settle_session
// cookie (7-day), else the short-lived __settle_access cookie. "" when nobody is logged in.
// -------------------------------------------------------------------------------------------------
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function payerToken(req) {
  const auth = String(req.headers["authorization"] || "");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const c = parseCookies(req.headers["cookie"]);
  return c["__settle_session"] || c["__settle_access"] || "";
}

// -------------------------------------------------------------------------------------------------
// SettleMesh call helper. RUNTIME_KEY authenticates the app; X-Settle-Payer bills the logged-in user.
// -------------------------------------------------------------------------------------------------
async function settleFetch(method, p, payer, body, idempotencyKey) {
  const headers = { Authorization: "Bearer " + RUNTIME_KEY };
  if (payer) headers["X-Settle-Payer"] = payer; // <-- this header makes the USER pay
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json, headers: res.headers };
}

// Invoke a metered capability: POST /v1/capabilities/{id}/invoke with {input}.
function invokeCapability(capabilityId, input, payer, idempotencyKey) {
  return settleFetch("POST", `/v1/capabilities/${encodeURIComponent(capabilityId)}/invoke`, payer, { input: input || {} }, idempotencyKey);
}

// Unwrap a possibly-{success,data,meta}-wrapped response down to its payload object.
function unwrap(json) {
  if (json && typeof json === "object" && json.data && typeof json.data === "object") return json.data;
  return json || {};
}

// Only the explicit SettleMesh post-capture header is authoritative here. Provider output may contain
// arbitrary cost/amount-like business fields and is never billing evidence.
function captureEvidence(headers) {
  const raw = headers && headers.get("x-settle-charged-aev");
  if (raw == null || String(raw).trim() === "") return { settlement_status: "unknown", captured_aev: null };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return { settlement_status: "unknown", captured_aev: null };
  return { settlement_status: "captured", captured_aev: amount };
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;

// Optional read-only pre-estimate. Never charges; falls back to the static price.
async function quotePrice(payer) {
  try {
    const r = await settleFetch("POST", "/v1/billing/quote", payer, { capability_id: CAPABILITY_ID });
    if (r.status < 400) {
      const d = unwrap(r.json);
      const c = (typeof d.total_credits === "number" && d.total_credits) ||
                (typeof d.base_cost_credits === "number" && d.base_cost_credits);
      if (typeof c === "number" && c > 0) return c;
    }
  } catch { /* fall through */ }
  return PRICE_AEV;
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

const CTYPE = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, "http://localhost"); } catch { return sendJSON(res, 400, { error: "bad_request" }); }

  if (u.pathname === "/healthz") return sendJSON(res, 200, { ok: true });

  // Is the current browser logged in, and what does the action cost? Drives the UI.
  if (u.pathname === "/api/me" && req.method === "GET") {
    const payer = payerToken(req);
    const estimate = await quotePrice(payer); // read-only; never charges
    return sendJSON(res, 200, { logged_in: !!payer, estimate_aev: estimate, currency: "aev" });
  }

  // THE PAID ACTION. Billable -> bills the logged-in user (X-Settle-Payer = their session).
  if (u.pathname === "/api/action" && req.method === "POST") {
    const payer = payerToken(req);
    if (!payer) return sendJSON(res, 401, { error: "login_required", login: "/__settle/login" });
    if (!RUNTIME_KEY) return sendJSON(res, 500, { error: "app_not_configured", message: "SETTLEMESH_APP_API_KEY is missing" });

    let raw = "";
    for await (const c of req) raw += c;
    let input = {};
    try { input = JSON.parse(raw || "{}"); } catch {}
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return sendJSON(res, 400, { error: "idempotency_key_required", message: "Send one stable Idempotency-Key per logical operation." });
    }

    // TODO(you): shape `input` to match your chosen CAPABILITY_ID (see https://www.settlemesh.io/agent.md).
    try {
      const r = await invokeCapability(CAPABILITY_ID, input, payer, idempotencyKey);
      if (r.status >= 400) {
        return sendJSON(res, r.status, {
          error: "action_failed",
          detail: r.json,
          settlement_status: "unknown",
          idempotency_key: idempotencyKey,
          message: "The action did not complete here. Reconcile this operation before starting another.",
        });
      }
      const data = unwrap(r.json);
      const capture = captureEvidence(r.headers);
      return sendJSON(res, 200, {
        ok: true,
        result: data,
        captured_aev: capture.captured_aev,
        settlement_status: capture.settlement_status,
        idempotency_key: idempotencyKey,
        estimate_aev: PRICE_AEV,
        currency: "aev",
      });
    } catch (e) {
      return sendJSON(res, 502, {
        error: "action_error",
        message: "Network/provider outcome is unknown. Reconcile this operation before starting another. " + String((e && e.message) || e),
        settlement_status: "unknown",
        idempotency_key: idempotencyKey,
      });
    }
  }

  // Static assets.
  const rel = u.pathname === "/" ? "/index.html" : u.pathname;
  const fp = path.join(__dirname, "public", path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ""));
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": CTYPE[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log("auth-payments-minimal listening on :" + PORT + " (base " + BASE + ")"));
