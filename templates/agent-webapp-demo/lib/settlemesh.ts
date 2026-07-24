// SettleMesh integration helpers.
//
// These wrap the three things SettleMesh injects into a deployed app:
//   1. Auth        — the /__settle/* edge routes (login / logout / me).
//   2. Database    — a managed SQLite project, queried server-side with a server key.
//   3. Capability  — one metered, end-user-billed tool invocation.
//
// Nothing here is secret. Real values arrive as environment variables that
// `settlemesh deploy` injects at deploy time. See .env.example for the names.

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

export type SettleUser = { id?: string; email?: string; name?: string };

// Call from the browser. Returns the signed-in user, or null when anonymous.
export async function currentSettleUser(): Promise<SettleUser | null> {
  const res = await fetch("/__settle/me", { cache: "no-store" });
  if (!res.ok) return null;
  const payload = await res.json();
  return payload.authenticated ? (payload.user as SettleUser) : null;
}

// ---------------------------------------------------------------------------
// 2. Database — managed SQLite. Server-side only (uses the server key).
// ---------------------------------------------------------------------------

export type DbPayload = {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rows_affected?: number;
  provider?: string;
  duration_ms?: number;
  raw?: unknown;
  truncated?: boolean;
};

export type DbResult<T = DbPayload> = {
  status: number;
  payload: T | null;
  error?: string;
};

export async function dbQuery<T = DbPayload>(sql: string, args: unknown[] = []): Promise<DbResult<T>> {
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
      body: JSON.stringify({ sql, args }),
    }
  );
  const text = await res.text();
  let envelope: unknown = text;
  try {
    envelope = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    return { status: res.status, payload: null, error: apiErrorMessage(envelope, text) };
  }
  if (!isRecord(envelope) || envelope.success !== true || !("data" in envelope)) {
    return {
      status: res.status,
      payload: null,
      error: "database response did not match the { success, data } contract",
    };
  }
  return { status: res.status, payload: envelope.data as T };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    const error = payload.error;
    if (typeof error === "string" && error.trim()) return error;
    if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
  }
  return fallback.trim() || "database request failed";
}

// ---------------------------------------------------------------------------
// 3. Metered capability — one paid tool call, billed to the end user.
// ---------------------------------------------------------------------------
//
// `payerToken` carries the end user's SettleMesh session candidate. The platform is the final
// verifier. This starter refuses to call without it so a missing credential can never fall back
// to billing the app owner.

export type InvokeOptions = {
  timeoutMs?: number;
  payerToken?: string | null;
};

export async function callCapability<T = unknown>(
  toolId: string,
  input: unknown,
  options: InvokeOptions = {}
): Promise<T> {
  const apiKey = process.env.SETTLEMESH_APP_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SETTLEMESH_APP_API_KEY is not configured. Deploy with `settlemesh deploy`."
    );
  }
  if (!options.payerToken) {
    throw new Error("a payer credential is required; owner-billed fallback is disabled");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);

  const headers: Record<string, string> = {
    authorization: "Bearer " + apiKey,
    "content-type": "application/json",
  };
  // End-user-pays: the platform must authenticate this credential and reject an invalid payer.
  headers["X-Settle-Payer"] = options.payerToken;

  try {
    const res = await fetch(
      SETTLEMESH_BASE_URL + "/v1/capabilities/" + encodeURIComponent(toolId) + "/invoke",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ input }),
        signal: controller.signal,
      }
    );
    const text = await res.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) {
      throw new Error("capability " + toolId + " failed: " + res.status + " " + text);
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

// Pull the end user's SettleMesh session token out of an incoming request so a
// downstream capability call can bill them. SettleMesh sets the __settle_session
// cookie on authenticated requests; we also accept an explicit header.
export function extractPayerToken(req: Request): string | null {
  const header = req.headers.get("x-settle-payer");
  if (header) return header;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)__settle_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
