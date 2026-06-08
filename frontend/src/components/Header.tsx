"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function Header() {
  const router = useRouter();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 bg-transparent">
      <button onClick={() => router.push("/")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <img src={dark ? "/logob.png" : "/logoa.png"} alt="NOVAC" className="w-10 h-10 object-contain"/>
        <span className={`font-black text-2xl tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>NOVAC</span>
      </button>
      <button onClick={() => setDark(d => !d)}
        className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${dark ? "border-slate-600 bg-slate-800 text-yellow-400" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
        {dark ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
          </svg>
        )}
      </button>
    </header>
  );
}
