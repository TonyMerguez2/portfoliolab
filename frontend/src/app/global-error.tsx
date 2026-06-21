"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global error:", error.message, error.stack);
  }, [error]);
  return (
    <html>
      <body style={{ margin: 0, background: "#041124", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "20px 28px", maxWidth: 640, color: "white" }}>
          <div style={{ color: "#ef4444", fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Erreur globale</div>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 12, wordBreak: "break-all" }}>{error.message}</div>
          {error.stack && <pre style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, overflow: "auto", maxHeight: 200, margin: "0 0 12px" }}>{error.stack}</pre>}
          <button onClick={reset} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "white", padding: "8px 16px", cursor: "pointer", fontSize: 12 }}>Réessayer</button>
        </div>
      </body>
    </html>
  );
}
