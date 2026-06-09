"use client";
import { useState, useRef } from "react";

interface Props {
  user: any;
  onClose: () => void;
  onUpdate: (user: any) => void;
  dark?: boolean;
}

export default function ProfileModal({ user, onClose, onUpdate, dark = false }: Props) {
  const [username, setUsername] = useState(user?.username || "");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const bg = dark ? "#061226" : "#ffffff";
  const text = dark ? "#F8F9FC" : "#081226";
  const border = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const inputBg = dark ? "rgba(255,255,255,0.05)" : "#F6F8FB";

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const token = localStorage.getItem("novac_token");

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/v1/auth/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      const updated = { ...user, avatar_url: data.avatar_url };
      localStorage.setItem("novac_user", JSON.stringify(updated));
      onUpdate(updated);
    } catch {
      setError("Erreur upload");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      localStorage.setItem("novac_user", JSON.stringify(data));
      onUpdate(data);
      onClose();
    } catch {
      setError("Erreur");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("novac_token");
    localStorage.removeItem("novac_user");
    onUpdate(null);
    onClose();
  };

  const avatarSrc = user?.avatar_url
    ? (user.avatar_url.startsWith("/uploads") ? `${API_URL}${user.avatar_url}` : user.avatar_url)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: bg, border: `1px solid ${border}`,
        borderRadius: "16px", padding: "32px", width: "340px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}>
            <div style={{
              width: "72px", height: "72px", borderRadius: "50%",
              backgroundColor: dark ? "rgba(255,255,255,0.1)" : "#e2e8f0",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", border: `2px solid ${border}`,
            }}>
              {avatarSrc
                ? <img src={avatarSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                : <span style={{ fontSize: "24px", fontWeight: 700, color: text }}>{user?.username?.charAt(0).toUpperCase()}</span>
              }
            </div>
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: "22px", height: "22px", borderRadius: "50%",
              backgroundColor: dark ? "#F8F9FC" : "#041124",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke={dark ? "#041124" : "#F8F9FC"} strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload}/>
          {uploading && <p style={{ color: text, opacity: 0.4, fontSize: "11px", marginTop: "6px" }}>Upload...</p>}
        </div>

        {/* Username */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ color: text, opacity: 0.4, fontSize: "11px", letterSpacing: "0.08em", display: "block", marginBottom: "6px" }}>NOM D'UTILISATEUR</label>
          <input value={username} onChange={e => setUsername(e.target.value)}
            style={{ width: "100%", backgroundColor: inputBg, border: `1px solid ${border}`, borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: text, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ color: text, opacity: 0.3, fontSize: "11px", marginBottom: "20px" }}>
          {user?.email}
        </div>

        {error && <p style={{ color: "#ef4444", fontSize: "12px", marginBottom: "10px" }}>{error}</p>}

        <button onClick={handleSave} disabled={loading}
          style={{
            width: "100%", padding: "11px", borderRadius: "10px",
            backgroundColor: dark ? "#F8F9FC" : "#041124",
            color: dark ? "#041124" : "#F8F9FC",
            fontSize: "13px", fontWeight: 600, letterSpacing: "0.06em",
            border: "none", cursor: "pointer", marginBottom: "10px",
          }}>
          {loading ? "..." : "Enregistrer"}
        </button>

        <button onClick={handleLogout}
          style={{
            width: "100%", padding: "10px", borderRadius: "10px",
            backgroundColor: "transparent", border: `1px solid ${border}`,
            color: text, opacity: 0.5, fontSize: "12px", cursor: "pointer",
          }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
