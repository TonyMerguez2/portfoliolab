"use client";
import { useEffect } from "react";

export default function ChartError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Chart page error:", error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", background: "#041124", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "monospace", padding: 24 }}>
      <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "20px 28px", maxWidth: 600, width: "100%" }}>
        <div style={{ color: "#ef4444", fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Erreur</div>
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 16, wordBreak: "break-all" }}>{error.message}</div>
        {error.stack && (
          <pre style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, overflow: "auto", maxHeight: 200, margin: 0 }}>{error.stack}</pre>
        )}
        <button onClick={reset} style={{ marginTop: 16, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "white", padding: "8px 16px", cursor: "pointer", fontSize: 12 }}>
          Réessayer
        </button>
      </div>
    </div>
  );
}
