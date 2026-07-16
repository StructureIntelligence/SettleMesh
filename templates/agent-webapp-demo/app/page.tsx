"use client";

import { useCallback, useEffect, useState } from "react";
import { currentSettleUser, settleLoginPath, settleLogoutPath } from "@/lib/settlemesh";
import { PoweredBySettleMesh } from "@/components/powered-by-settlemesh";

type Snippet = { id: number; title: string; body: string; created_at: string };

function apiErrorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const error = value as { message?: unknown; code?: unknown };
    if (typeof error.message === "string") return error.message;
    if (typeof error.code === "string") return error.code;
  }
  return "The request could not be completed.";
}

export default function Home() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [snippetsLoaded, setSnippetsLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [note, setNote] = useState<string>("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/snippets", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) {
      setNote(apiErrorMessage(json.error));
      return;
    }
    setSnippets(Array.isArray(json.snippets) ? json.snippets : []);
    setSnippetsLoaded(true);
  }, []);

  useEffect(() => {
    currentSettleUser().then((u) => {
      setUser(u);
      setAuthChecked(true);
    });
    refresh();
  }, [refresh]);

  async function save() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/snippets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const json = await res.json();
      if (json.error) setNote(apiErrorMessage(json.error));
      else {
        setTitle("");
        setBody("");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  // The metered capability call. The end user pays for this out of their own
  // Aev balance — the app writes no billing code.
  async function polish() {
    if (!body.trim()) return;
    setPolishing(true);
    setNote("");
    try {
      const res = await fetch("/api/polish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (json.error) setNote(apiErrorMessage(json.error));
      else {
        setBody(json.polished || body);
        setNote(json.metered ? "Polished (metered to you)." : json.note || "Polished.");
      }
    } finally {
      setPolishing(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 64px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.5 }}>Snippet Vault</h1>
          <p style={{ margin: "4px 0 0", color: "#9aa3b2", fontSize: 14 }}>
            Save snippets, polish them with one paid AI call. Shipped by an agent on SettleMesh.
          </p>
        </div>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          {!authChecked ? (
            <span style={{ color: "#9aa3b2" }}>…</span>
          ) : user ? (
            <>
              <div style={{ color: "#9aa3b2" }}>{user.email || "signed in"}</div>
              <a href={settleLogoutPath()} style={linkStyle}>Sign out</a>
            </>
          ) : (
            <a href={settleLoginPath("/")} style={{ ...linkStyle, ...primaryLinkStyle }}>
              Sign in
            </a>
          )}
        </div>
      </header>

      <section style={cardStyle}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          style={inputStyle}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Paste a snippet or note…"
          rows={5}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={save} disabled={busy} style={buttonStyle}>
            {busy ? "Saving…" : "Save snippet"}
          </button>
          <button onClick={polish} disabled={polishing} style={ghostButtonStyle}>
            {polishing ? "Polishing…" : "Polish with AI (metered)"}
          </button>
        </div>
        {note && <p style={{ margin: 0, fontSize: 13, color: "#9aa3b2" }}>{note}</p>}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 15, color: "#9aa3b2", fontWeight: 600, margin: "0 0 12px" }}>
          Your snippets {snippets.length ? `(${snippets.length})` : ""}
        </h2>
        {!snippetsLoaded ? (
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            {note ? "Snippets are unavailable; the previous list was not replaced with an empty result." : "Loading snippets…"}
          </p>
        ) : snippets.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: 14 }}>Nothing saved yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {snippets.map((s) => (
              <li key={s.id} style={cardStyle}>
                <strong style={{ fontSize: 15 }}>{s.title}</strong>
                <pre style={preStyle}>{s.body}</pre>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{s.created_at}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer style={{ marginTop: 40, textAlign: "center" }}>
        {/* Optional badge — delete the import and this line to remove. */}
        <PoweredBySettleMesh />
      </footer>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#141822",
  border: "1px solid #232a37",
  borderRadius: 12,
  padding: 16,
  marginTop: 20,
  display: "grid",
  gap: 12,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0b0d12",
  border: "1px solid #2a3240",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#e7e9ee",
  fontSize: 14,
};
const buttonStyle: React.CSSProperties = {
  background: "#6366f1",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const ghostButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "transparent",
  border: "1px solid #2a3240",
  color: "#c7cdda",
};
const preStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
  color: "#c7cdda",
};
const linkStyle: React.CSSProperties = { color: "#9aa3b2", textDecoration: "none" };
const primaryLinkStyle: React.CSSProperties = {
  color: "#fff",
  background: "#6366f1",
  padding: "8px 14px",
  borderRadius: 8,
  fontWeight: 600,
};
