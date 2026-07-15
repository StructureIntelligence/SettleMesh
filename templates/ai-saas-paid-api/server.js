// ai-saas-paid-api — a pay-per-use AI app on SettleMesh (end-user-pays / "G2").
//
// THE WHOLE POINT (read this first):
//   A signed-in end user triggers an AI call, and *that user* — not you, the developer — is billed for
//   it against their own Aev balance. We never write any billing code. The platform does the charge.
//   The only two things this server does to make that happen:
//     1. Authenticate to SettleMesh with the app's injected runtime key (SETTLEMESH_APP_API_KEY).
//     2. Forward the logged-in user's session as the `X-Settle-Payer` header on each billable call.
//   That header is what charges the END USER's Aev wallet instead of yours. We ALWAYS forward it on
//   user-triggered billable calls. If it's missing, we return 401 and the UI shows a Sign-in button —
//   we never silently bill the developer for a user action.
//
//   No secret ever reaches the browser. The runtime key stays server-side; the browser talks only to
//   this server's /api/* routes.
//
//   Aev is SettleMesh prepaid credit: 1 USD = 100 Aev, funded by the user via Stripe.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const BASE = (process.env.SETTLEMESH_BASE_URL || process.env.SETTLE_BASE_URL || "https://api.settlemesh.io").replace(/\/+$/, "");
// Injected automatically by `settlemesh deploy`. Authenticates this app to SettleMesh.
const RUNTIME_KEY = process.env.SETTLEMESH_APP_API_KEY || process.env.SETTLE_API_KEY || "";

// ---------------------------------------------------------------------------------------------------
// The AI capability this app charges for.
//
// TODO(confirm against https://www.settlemesh.io/agent.md): verify the capability id and the exact `input`
// body before going live. The INVOKE MECHANICS below are correct (POST /v1/capabilities/{id}/invoke
// with a JSON `{ input: {...} }` body, Bearer runtime key, X-Settle-Payer = end-user session). What you
// must confirm is (a) the capability id string and (b) the field names inside `input` for that model.
// `llm.chat` and a `{ messages: [...] }` input are the common shape, but DO NOT guess — check agent.md.
const CAPABILITY_ID = process.env.SETTLEMESH_CAPABILITY_ID || "llm.chat";
const MAX_PROMPT_CHARS = 2000;

// A display-only price floor (Aev) so the UI can show "you pay per use" before the call returns.
// The REAL charge is computed by the platform (upstream cost × your manifest markup) and echoed back
// in the invoke response; we surface that actual number when present. This is just a pre-call estimate.
const PRICE_ESTIMATE_AEV = Number(process.env.PRICE_ESTIMATE_AEV || 2);

// ---------------------------------------------------------------------------------------------------
// Payer extraction: the logged-in user's delegated-payer token. Bearer header, else the durable
// __settle_session cookie (7-day, set by the platform auth gate at login), else the short-lived
// __settle_access cookie. "" when nobody is signed in.
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
  if (payer) headers["X-Settle-Payer"] = payer; // <- this is what makes the END USER pay.
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

// Invoke a capability for the paying user.
function invokeCapability(capabilityId, input, payer) {
  return settleFetch("POST", `/v1/capabilities/${encodeURIComponent(capabilityId)}/invoke`, payer, { input: input || {} });
}

// Defensively unwrap a possibly-{success,data,meta}-wrapped response down to its payload.
function unwrap(json) {
  if (json && typeof json === "object" && json.data && typeof json.data === "object") return json.data;
  return json || {};
}

// Pull the model's text answer out of the response, trying the common shapes. Adjust to the capability
// you wired (see the TODO above) — different models name the output field differently.
function extractText(json) {
  const d = unwrap(json);
  const probe = (o) => {
    if (!o || typeof o !== "object") return "";
    if (typeof o.text === "string") return o.text;
    if (typeof o.output === "string") return o.output;
    if (typeof o.content === "string") return o.content;
    if (typeof o.completion === "string") return o.completion;
    if (typeof o.message === "string") return o.message;
    if (o.message && typeof o.message.content === "string") return o.message.content;
    if (Array.isArray(o.choices) && o.choices[0]) {
      const c = o.choices[0];
      if (typeof c.text === "string") return c.text;
      if (c.message && typeof c.message.content === "string") return c.message.content;
    }
    return "";
  };
  return probe(d) || probe(json) || "";
}

// Search the response for the actual amount billed, so the UI can show the real charge (not a guess).
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

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

const CTYPE = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, "http://localhost"); } catch { return sendJSON(res, 400, { error: "bad_request" }); }

  if (u.pathname === "/healthz") return sendJSON(res, 200, { ok: true });

  // Is the current browser signed in? Drives the UI's sign-in branch and shows the per-use price.
  if (u.pathname === "/api/me" && req.method === "GET") {
    return sendJSON(res, 200, {
      logged_in: !!payerToken(req),
      estimate_aev: PRICE_ESTIMATE_AEV,
      currency: "aev",
    });
  }

  // Run the AI call. BILLABLE -> charges the logged-in user (X-Settle-Payer = their session).
  if (u.pathname === "/api/run" && req.method === "POST") {
    const payer = payerToken(req);
    // Never bill the developer for a user action: no signed-in user => 401, UI shows "Sign in".
    if (!payer) return sendJSON(res, 401, { error: "login_required", login: "/__settle/login" });
    if (!RUNTIME_KEY) return sendJSON(res, 500, { error: "app_not_configured", message: "SETTLEMESH_APP_API_KEY is missing" });

    let raw = "";
    for await (const c of req) raw += c;
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch {}
    const prompt = String(body.prompt || "").trim().slice(0, MAX_PROMPT_CHARS);
    if (!prompt) return sendJSON(res, 400, { error: "prompt_required" });

    try {
      // TODO(confirm against agent.md): the shape of `input` for your chosen capability. The line below
      // uses a generic chat shape — replace with the exact fields the capability documents.
      const input = { messages: [{ role: "user", content: prompt }] };
      const r = await invokeCapability(CAPABILITY_ID, input, payer);

      // Surface the platform's billing errors plainly (e.g. insufficient balance -> prompt a top-up).
      if (r.status === 402) {
        return sendJSON(res, 402, {
          error: "insufficient_balance",
          message: "Not enough Aev. Add credit and try again.",
          // The platform serves a hosted Stripe checkout at this gate; sending the user here lets them
          // top up their Aev balance, then return and run again.
          topup: "/__settle/billing",
        });
      }
      if (r.status >= 400) {
        return sendJSON(res, r.status, { error: "capability_failed", message: "The AI call failed — you were not charged.", detail: r.json });
      }

      const text = extractText(r.json);
      const cost = extractCost(r.json);
      return sendJSON(res, 200, {
        ok: true,
        text,
        // The ACTUAL Aev charged to the user, when the response carries it; else the pre-call estimate.
        cost_aev: cost != null ? cost : null,
        estimate_aev: PRICE_ESTIMATE_AEV,
        currency: "aev",
      });
    } catch (e) {
      return sendJSON(res, 502, { error: "run_failed", message: String((e && e.message) || e) });
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

server.listen(PORT, () => console.log("ai-saas-paid-api listening on :" + PORT + " (base " + BASE + ")"));
