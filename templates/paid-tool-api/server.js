// paid-tool-api — sell ONE API endpoint, metered per call, on SettleMesh.
//
// THE WHOLE POINT (pay-per-call, no billing code of your own):
//   A caller signs in with their SettleMesh account (the platform auth gate at /__settle/login sets a
//   durable __settle_session cookie). This server then bills THAT logged-in user — not you, the app
//   developer — for every successful call to /api/tool, by:
//     1. authenticating to SettleMesh with the app's injected runtime key (SETTLEMESH_APP_API_KEY), and
//     2. forwarding the user's session token as the `X-Settle-Payer` header on the billable invoke.
//   `X-Settle-Payer` is what charges the LOGGED-IN USER's Aev wallet instead of yours. If it is absent,
//   the route returns 401 — we never silently bill the developer for a user's call. The markup you set in
//   settlemesh.json ("billing.markup") is your margin on top of the underlying cost; the platform handles
//   the wallet debit, the ledger, and your payout. You write zero billing code.
//
//   Aev = SettleMesh prepaid credit. 1 USD = 100 Aev. Wallets are topped up via Stripe.
//
//   No secret ever reaches the browser: RUNTIME_KEY stays server-side; callers only touch /api/*.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const BASE = (process.env.SETTLEMESH_BASE_URL || process.env.SETTLE_BASE_URL || "https://api.settlemesh.io").replace(/\/+$/, "");
const RUNTIME_KEY = process.env.SETTLEMESH_APP_API_KEY || process.env.SETTLE_API_KEY || "";

// ---------------------------------------------------------------------------------------------------
// The capability this endpoint resells. `llm.chat` is a documented SettleMesh capability (text in/out).
//
// TODO (make it yours): swap this for whatever you want to sell — another capability id, a cloud-worker
// offer ("wof_..."), or your own logic. If you call a different SettleMesh capability/offer and are
// unsure of the exact request body, check the agent guide at https://www.settlemesh.io/agent.md before
// changing `invokeTool` below — do not guess the shape.
// ---------------------------------------------------------------------------------------------------
const CAPABILITY = process.env.TOOL_CAPABILITY_ID || "llm.chat";

// Per-request ceiling so a slow upstream never hangs the caller.
const REQUEST_TIMEOUT_MS = 60 * 1000;

// ---------------------------------------------------------------------------------------------------
// Payer extraction: the logged-in user's delegated-payer token. Bearer header (for API callers), else
// the durable __settle_session cookie (set by the auth gate at login), else short-lived __settle_access.
// "" when none — and "" means "not logged in", which we refuse to bill.
// ---------------------------------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------------------------------
// SettleMesh call helper. RUNTIME_KEY authenticates the app; X-Settle-Payer bills the logged-in user.
// ---------------------------------------------------------------------------------------------------
async function settleFetch(method, p, payer, body) {
  const headers = { Authorization: "Bearer " + RUNTIME_KEY };
  if (payer) headers["X-Settle-Payer"] = payer; // <-- charges the USER's wallet, not the developer's
  if (body) headers["Content-Type"] = "application/json";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(BASE + p, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

// Invoke a capability: POST /v1/capabilities/{id}/invoke with {input}. (See agent.md for the contract.)
function invokeTool(input, payer) {
  return settleFetch("POST", `/v1/capabilities/${encodeURIComponent(CAPABILITY)}/invoke`, payer, { input: input || {} });
}

// Defensively unwrap a possibly-{success,data,meta}-wrapped response down to its payload.
function unwrap(json) {
  if (json && typeof json === "object" && json.data && typeof json.data === "object") return json.data;
  return json || {};
}

// Search a response for the ACTUAL charge so we can echo it back to the caller. Aev.
function extractCost(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 5) return null;
  const keys = ["aev", "cost", "cost_credits", "total_credits", "credits", "billed", "billed_aev", "amount", "charged"];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && isFinite(v) && v > 0) return v;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const found = extractCost(v, depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

// Pull plain text out of the capability result, trying the common shapes.
function extractText(json) {
  const d = unwrap(json);
  const probe = (o) => {
    if (!o || typeof o !== "object") return null;
    for (const k of ["text", "output", "result", "content", "message", "completion"]) {
      if (typeof o[k] === "string" && o[k].trim()) return o[k];
    }
    return null;
  };
  return probe(d) || probe(json) || "";
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

const CTYPE = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, "http://localhost"); } catch { return sendJSON(res, 400, { error: "bad_request" }); }

  if (u.pathname === "/healthz") return sendJSON(res, 200, { ok: true });

  // Is the current caller logged in? (drives the docs page's "sign in" branch)
  if (u.pathname === "/api/me" && req.method === "GET") {
    return sendJSON(res, 200, { logged_in: !!payerToken(req) });
  }

  // -------------------------------------------------------------------------------------------------
  // THE PAID ENDPOINT. Every successful call bills the logged-in user's Aev wallet.
  //
  // This example: summarize text. POST { "text": "...", "style": "tldr" | "bullets" } -> { summary }.
  // Replace the prompt/body with your own tool — the billing wiring (payer + runtime key) stays as-is.
  // -------------------------------------------------------------------------------------------------
  if (u.pathname === "/api/tool" && req.method === "POST") {
    const payer = payerToken(req);
    if (!payer) return sendJSON(res, 401, { error: "login_required", login: "/__settle/login", message: "Sign in with SettleMesh to call this paid endpoint." });
    if (!RUNTIME_KEY) return sendJSON(res, 500, { error: "app_not_configured", message: "SETTLEMESH_APP_API_KEY is missing." });

    let raw = "";
    for await (const c of req) raw += c;
    let input = {};
    try { input = JSON.parse(raw || "{}"); } catch { return sendJSON(res, 400, { error: "invalid_json" }); }

    const text = String(input.text || "").trim();
    if (!text) return sendJSON(res, 400, { error: "text_required", message: "Provide a non-empty 'text' field." });
    if (text.length > 12000) return sendJSON(res, 413, { error: "text_too_long", message: "Limit input to 12000 characters." });

    const style = String(input.style || "tldr").toLowerCase();
    const instruction = style === "bullets"
      ? "Summarize the following text as 3-5 concise bullet points. Output only the bullets."
      : "Summarize the following text in 2-3 sentences. Output only the summary.";

    try {
      // The billable call. X-Settle-Payer (set inside settleFetch) bills the logged-in user.
      const r = await invokeTool(
        {
          // TODO: this {messages:[...]} shape matches the llm.chat capability. If you switch CAPABILITY
          // to a different capability/offer, set the input to ITS documented schema (see agent.md).
          messages: [
            { role: "system", content: instruction },
            { role: "user", content: text },
          ],
        },
        payer
      );

      if (r.status >= 400) {
        // No successful result -> nothing useful to return. The platform does not charge for a failed
        // invoke, so the caller is not billed here.
        return sendJSON(res, r.status, { error: "tool_failed", detail: r.json });
      }

      const summary = extractText(r.json);
      const cost = extractCost(r.json);
      return sendJSON(res, 200, {
        ok: true,
        summary,
        style,
        cost_aev: cost != null ? cost : null, // the actual amount billed to the caller, in Aev
        currency: "aev",
      });
    } catch (e) {
      return sendJSON(res, 502, { error: "tool_error", message: String((e && e.message) || e) });
    }
  }

  // Static assets (the docs/landing page).
  const rel = u.pathname === "/" ? "/index.html" : u.pathname;
  const fp = path.join(__dirname, "public", path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ""));
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": CTYPE[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log("paid-tool-api listening on :" + PORT + " (base " + BASE + ")"));
