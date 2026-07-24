// Managed-database CRUD for snippets.
// GET  /api/snippets        -> list the signed-in user's snippets
// POST /api/snippets        -> create a snippet { title, body }
//
// The table is created lazily on first call. SettleMesh's managed SQLite is
// reached server-side via lib/settlemesh.ts (dbQuery), never from the browser.

import { dbQuery, extractPayerToken } from "@/lib/settlemesh";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

// Containment for this starter: never persist the bearer credential and never share an
// "anonymous" namespace. The target contract is a verified, stable Actor ID obtained from
// SettleMesh auth; the token-derived digest is intentionally only a transition profile.
function ownerKey(req: Request): string | null {
  const token = extractPayerToken(req);
  if (!token) return null;
  const namespace = process.env.SETTLEMESH_APP_ID || process.env.SETTLEMESH_PROJECT_ID || "starter";
  return createHash("sha256").update(namespace).update("\0").update(token).digest("hex");
}

async function ensureTable() {
  const result = await dbQuery(
    `create table if not exists snippets (
       id integer primary key autoincrement,
       owner text not null,
       title text not null,
       body text not null,
       created_at text not null default (datetime('now'))
     )`
  );
  if (result.error) throw new Error(result.error);
}

type SnippetRow = { id: number; title: string; body: string; created_at: string };

export async function GET(req: Request) {
  const owner = ownerKey(req);
  if (!owner) {
    return Response.json({ error: "login_required", snippets: [] }, { status: 401 });
  }
  try {
    await ensureTable();
  } catch (error) {
    return Response.json({ error: String(error), snippets: [] }, { status: 502 });
  }
  const result = await dbQuery<{ rows?: SnippetRow[] }>(
    "select id, title, body, created_at from snippets where owner = ? order by id desc limit 100",
    [owner]
  );
  if (result.error) {
    return Response.json({ error: result.error, snippets: [] }, { status: 502 });
  }
  return Response.json({ snippets: Array.isArray(result.payload?.rows) ? result.payload.rows : [] });
}

export async function POST(req: Request) {
  const owner = ownerKey(req);
  if (!owner) {
    return Response.json({ error: "login_required" }, { status: 401 });
  }
  try {
    await ensureTable();
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 502 });
  }
  let body: { title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const title = (body.title || "").trim().slice(0, 200);
  const text = (body.body || "").trim().slice(0, 10000);
  if (!title || !text) {
    return Response.json({ error: "title and body are required" }, { status: 400 });
  }
  const result = await dbQuery(
    "insert into snippets (owner, title, body) values (?, ?, ?)",
    [owner, title, text]
  );
  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return Response.json({ ok: true });
}
