"use client";
import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard error:", error.message, error.stack);
  }, [error]);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", background: "#f8fafc", padding: 24 }}>
      <div style={{ background: "white", border: "1px solid #fecaca", borderRadius: 12, padding: "20px 28px", maxWidth: 640, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ color: "#ef4444", fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Erreur dashboard</div>
        <div style={{ color: "#334155", fontSize: 13, marginBottom: 12, wordBreak: "break-all" }}>{error.message}</div>
        {error.stack && <pre style={{ color: "#94a3b8", fontSize: 11, overflow: "auto", maxHeight: 200, margin: "0 0 12px", background: "#f8fafc", padding: 8, borderRadius: 6 }}>{error.stack}</pre>}
        <button onClick={reset} style={{ background: "#ef4444", border: "none", borderRadius: 8, color: "white", padding: "8px 16px", cursor: "pointer", fontSize: 12 }}>Réessayer</button>
      </div>
    </div>
  );
}
