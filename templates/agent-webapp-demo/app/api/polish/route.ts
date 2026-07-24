// The one METERED capability call in this demo.
//
// POST /api/polish { body } -> { polished }
//
// This forwards the snippet text to a SettleMesh capability (an LLM helper that
// cleans up / rewrites text) and bills the END USER for it via X-Settle-Payer,
// not you. That is the whole pitch: you write zero billing code, and the person
// who clicks "Polish" pays the metered cost out of their own Aev balance.

import { callCapability, extractPayerToken } from "@/lib/settlemesh";

export const dynamic = "force-dynamic";

// TODO: set this to the capability/tool ID you want to meter. SettleMesh exposes
// a catalog of capabilities; pick the one that matches (e.g. a text-rewrite /
// LLM helper) and put its ID here or in the SETTLEMESH_POLISH_CAPABILITY env var.
// The agent guide at https://www.settlemesh.io/agent.md lists available capability
// IDs and their exact input contracts — confirm the input shape there before
// going live. Until you set this, the route returns a local fallback so the demo
// still runs end-to-end without charging anyone.
const POLISH_CAPABILITY = process.env.SETTLEMESH_POLISH_CAPABILITY || "";

export async function POST(req: Request) {
  let parsed: { body?: string };
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const text = (parsed.body || "").trim().slice(0, 10000);
  if (!text) {
    return Response.json({ error: "body is required" }, { status: 400 });
  }

  // No capability configured yet -> safe local fallback (no charge).
  if (!POLISH_CAPABILITY) {
    return Response.json({
      polished: localTidy(text),
      metered: false,
      note: "Set SETTLEMESH_POLISH_CAPABILITY to bill a real metered capability.",
    });
  }

  // Bill the end user: forward their SettleMesh session as the payer.
  const payerToken = extractPayerToken(req);
  if (!payerToken) {
    return Response.json(
      { error: "login_required", login: "/__settle/login" },
      { status: 401 }
    );
  }
  try {
    // NOTE: confirm the exact `input` field names for your chosen capability in
    // https://www.settlemesh.io/agent.md — they vary per tool.
    const result = await callCapability<{ output?: string; text?: string }>(
      POLISH_CAPABILITY,
      { text, instruction: "Tidy and clarify this snippet; keep its meaning." },
      { payerToken }
    );
    const polished =
      (result && (result.output || result.text)) || JSON.stringify(result);
    return Response.json({ polished, metered: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}

// Trivial offline cleanup so the template is runnable before a capability is wired.
function localTidy(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
