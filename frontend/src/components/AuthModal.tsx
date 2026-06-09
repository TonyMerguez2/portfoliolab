"use client";
import { useState } from "react";

interface Props {
  onClose: () => void;
  onAuth: (user: any, token: string) => void;
  dark?: boolean;
}

export default function AuthModal({ onClose, onAuth, dark = false }: Props) {
  const [mode, setMode] = useState<"login"|"register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const bg = dark ? "#061226" : "#ffffff";
  const text = dark ? "#F8F9FC" : "#081226";
  const border = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const inputBg = dark ? "rgba(255,255,255,0.05)" : "#F6F8FB";

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const endpoint = mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, username };
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur");
      localStorage.setItem("novac_token", data.token);
      localStorage.setItem("novac_user", JSON.stringify(data.user));
      onAuth(data.user, data.token);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: bg, border: `1px solid ${border}`,
        borderRadius: "16px", padding: "32px", width: "360px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={dark ? "/logob.png" : "/logoa.png"} alt="NOVAC" className="w-10 h-10 object-contain"/>
        </div>

        <h2 style={{ color: text, fontSize: "16px", fontWeight: 700, letterSpacing: "0.1em", textAlign: "center", marginBottom: "24px" }}>
          {mode === "login" ? "Connexion" : "Créer un compte"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {mode === "register" && (
            <input value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Nom d'utilisateur"
              style={{ backgroundColor: inputBg, border: `1px solid ${border}`, borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: text, outline: "none" }}
            />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" type="email"
            style={{ backgroundColor: inputBg, border: `1px solid ${border}`, borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: text, outline: "none" }}
          />
          <input value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Mot de passe" type="password"
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            style={{ backgroundColor: inputBg, border: `1px solid ${border}`, borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: text, outline: "none" }}
          />
        </div>

        {error && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "10px", textAlign: "center" }}>{error}</p>}

        <button onClick={handleSubmit} disabled={loading}
          style={{
            width: "100%", marginTop: "20px",
            backgroundColor: dark ? "#F8F9FC" : "#041124",
            color: dark ? "#041124" : "#F8F9FC",
            padding: "11px", borderRadius: "10px",
            fontSize: "13px", fontWeight: 600, letterSpacing: "0.06em",
            border: "none", cursor: "pointer", opacity: loading ? 0.6 : 1,
          }}>
          {loading ? "..." : mode === "login" ? "Se connecter" : "Créer le compte"}
        </button>

        <p style={{ color: text, opacity: 0.4, fontSize: "12px", textAlign: "center", marginTop: "16px", cursor: "pointer" }}
          onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
        </p>
      </div>
    </div>
  );
}
