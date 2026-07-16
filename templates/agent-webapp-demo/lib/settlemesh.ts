// SettleMesh integration helpers.
//
// These wrap the three things SettleMesh injects into a deployed app:
//   1. Auth        — the /__settle/* edge routes (login / logout / me).
//   2. Database    — a managed SQLite project, queried server-side with a server key.
//   3. Capability  — one metered, end-user-billed tool invocation.
//
// Nothing here is secret. Real values arrive as environment variables that
// `settlemesh deploy` injects at deploy time. See .env.example for the names.

import { captureEvidence, isValidIdempotencyKey } from "./settlement.mjs";

export { isValidIdempotencyKey };

const SETTLEMESH_BASE_URL = (
  process.env.SETTLEMESH_BASE_URL || "https://api.settlemesh.io"
).replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// 1. Auth — client-visible edge routes. No SDK needed; just links + a fetch.
// ---------------------------------------------------------------------------

export function settleLoginPath(returnTo = "/") {
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return "/__settle/login?return_to=" + encodeURIComponent(safe);
}

export function settleLogoutPath() {
  return "/__settle/logout";
}

export type SettleUser = { id?: string; sub?: string; email?: string; name?: string };

// Call from the browser. Returns the signed-in user, or null when anonymous.
export async function currentSettleUser(): Promise<SettleUser | null> {
  const res = await fetch("/__settle/me", { cache: "no-store" });
  if (!res.ok) return null;
  const payload = await res.json();
  return payload.authenticated ? (payload.user as SettleUser) : null;
}

export type PrincipalResolution =
  | { ok: true; principalId: string }
  | {
      ok: false;
      status: 401 | 503;
      code: "authentication_required" | "identity_authority_unavailable";
      message: string;
    };

function settleAuthorityCookie(req: Request): string {
  const accepted: string[] = [];
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    if (
      (name === "__settle_session" || name === "__settle_access") &&
      value.length > 0 &&
      value.length <= 8192 &&
      !/[\u0000-\u001f\u007f]/.test(value)
    ) {
      accepted.push(name + "=" + value);
    }
  }
  return accepted.join("; ");
}

// Resolve the browser session through the platform's same-origin auth authority. A payer/session
// token is an authorization secret, not a database identity: never decode it, hash it into an owner,
// or persist it. Only the authority's stable user id/sub is safe to use for row ownership.
export async function resolveSettlePrincipal(req: Request): Promise<PrincipalResolution> {
  const cookie = settleAuthorityCookie(req);
  if (!cookie) {
    return {
      ok: false,
      status: 401,
      code: "authentication_required",
      message: "Sign in with SettleMesh before accessing snippets.",
    };
  }

  let authorityURL: URL;
  try {
    authorityURL = new URL("/__settle/me", req.url);
    if (authorityURL.protocol !== "https:" && authorityURL.protocol !== "http:") {
      throw new Error("unsupported request origin");
    }
  } catch {
    return {
      ok: false,
      status: 503,
      code: "identity_authority_unavailable",
      message: "SettleMesh identity could not be verified; no database operation was attempted.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(authorityURL, {
      method: "GET",
      headers: { cookie },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: 401,
        code: "authentication_required",
        message: "Your SettleMesh session is invalid or expired. Sign in again.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: 503,
        code: "identity_authority_unavailable",
        message: "SettleMesh identity could not be verified; no database operation was attempted.",
      };
    }

    const payload = (await response.json()) as {
      authenticated?: boolean;
      user?: SettleUser;
    };
    const rawPrincipal = payload.user?.id || payload.user?.sub || "";
    if (
      payload.authenticated !== true ||
      typeof rawPrincipal !== "string" ||
      rawPrincipal.length === 0 ||
      rawPrincipal.length > 512 ||
      rawPrincipal !== rawPrincipal.trim() ||
      /[\u0000-\u001f\u007f]/.test(rawPrincipal)
    ) {
      return {
        ok: false,
        status: 503,
        code: "identity_authority_unavailable",
        message: "SettleMesh identity returned no valid stable principal; no database operation was attempted.",
      };
    }
    return { ok: true, principalId: "settle:" + rawPrincipal };
  } catch {
    return {
      ok: false,
      status: 503,
      code: "identity_authority_unavailable",
      message: "SettleMesh identity could not be verified; no database operation was attempted.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// 2. Database — managed SQLite. Server-side only (uses the server key).
// ---------------------------------------------------------------------------

export type DbResult = {
  status: number;
  payload: unknown;
  error?: string;
};

export async function dbQuery(sql: string, params: unknown[] = []): Promise<DbResult> {
  const projectId = process.env.SETTLEMESH_PROJECT_ID;
  const serverKey = process.env.SETTLEMESH_PROJECT_SERVER_KEY;
  if (!projectId || !serverKey) {
    return {
      status: 0,
      payload: null,
      error:
        "database env not injected (SETTLEMESH_PROJECT_ID / SETTLEMESH_PROJECT_SERVER_KEY missing). Deploy with `settlemesh deploy`.",
    };
  }
  const res = await fetch(
    `${SETTLEMESH_BASE_URL}/v1/projects/${projectId}/database/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${serverKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const text = await res.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    return {
      status: res.status,
      payload,
      error: `managed database query failed with HTTP ${res.status}`,
    };
  }
  return { status: res.status, payload };
}

// ---------------------------------------------------------------------------
// 3. Metered capability — one paid tool call with delegated-payer admission.
// ---------------------------------------------------------------------------
//
// `payerToken` carries the end user's SettleMesh session. It is required: this helper never omits the
// delegated payer header and therefore never silently falls back to the app-owner wallet. Provider
// output remains separate from settlement evidence.

export type InvokeOptions = {
  timeoutMs?: number;
  payerToken: string;
  idempotencyKey: string;
};

export type CapabilityCallResult<T> = {
  ok: boolean;
  status: number;
  payload: T;
  settlement_status: "captured" | "unknown";
  captured_aev: number | null;
};

export async function callCapability<T = unknown>(
  toolId: string,
  input: unknown,
  options: InvokeOptions
): Promise<CapabilityCallResult<T>> {
  const apiKey = process.env.SETTLEMESH_APP_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SETTLEMESH_APP_API_KEY is not configured. Deploy with `settlemesh deploy`."
    );
  }
  const payerToken = String(options.payerToken || "").trim();
  if (!payerToken || payerToken.length > 8192 || /[\u0000-\u001f\u007f]/.test(payerToken)) {
    throw new Error("A valid delegated payer session is required; app-owner fallback is disabled.");
  }
  const idempotencyKey = String(options.idempotencyKey || "").trim();
  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new Error("A stable Idempotency-Key is required for this logical operation.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);

  const headers: Record<string, string> = {
    authorization: "Bearer " + apiKey,
    "content-type": "application/json",
    "X-Settle-Payer": payerToken,
    "Idempotency-Key": idempotencyKey,
  };

  try {
    const response = await fetch(
      SETTLEMESH_BASE_URL + "/v1/capabilities/" + encodeURIComponent(toolId) + "/invoke",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ input }),
        signal: controller.signal,
      }
    );
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {}
    const settlement = captureEvidence(response.headers);
    return {
      ok: response.ok,
      status: response.status,
      payload: payload as T,
      settlement_status: settlement.settlement_status,
      captured_aev: settlement.captured_aev,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Pull the end user's SettleMesh session token out of an incoming request so a
// downstream capability call can bill them. SettleMesh sets the __settle_session
// cookie on authenticated requests; we also accept an explicit header.
export function extractPayerToken(req: Request): string | null {
  const header = (req.headers.get("x-settle-payer") || "").trim();
  if (header && header.length <= 8192 && !/[\u0000-\u001f\u007f]/.test(header)) return header;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)__settle_(?:session|access)=([^;]+)/);
  if (!match) return null;
  try {
    const token = decodeURIComponent(match[1]).trim();
    return token && token.length <= 8192 && !/[\u0000-\u001f\u007f]/.test(token) ? token : null;
  } catch {
    return null;
  }
}
