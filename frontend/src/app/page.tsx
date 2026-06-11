"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import ProfileModal from "@/components/ProfileModal";

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const [dark, setDark] = useState(true);
  const darkRef = useRef(dark);
  const [phase, setPhase] = useState<"assembling"|"assembled"|"ready">("assembling");
  const [exiting, setExiting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [tickerData, setTickerData] = useState<{symbol: string, price: number, change: number}[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerPosRef = useRef(0);

  useEffect(() => {
    const u = localStorage.getItem("novac_user");
    if (u) setUser(JSON.parse(u));
  }, []);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const targetMouse = useRef({ x: 0, y: 0 });
  const smoothMouse = useRef({ x: 0, y: 0 });
  const convergingRef = useRef(false);
  const [typedText, setTypedText] = useState("");
  const fullTagline = "Find the optimal path.";
  const haloRef = useRef(0);

  useEffect(() => { darkRef.current = dark; }, [dark]);

  useEffect(() => {
    if (!tickerRef.current || tickerData.length === 0) return;
    let raf: number;
    const el = tickerRef.current;
    const speed = 0.5;
    // Mesurer après rendu complet
    const timeout = setTimeout(() => {
      const singleWidth = el.scrollWidth / 2;
      const animate = () => {
        tickerPosRef.current -= speed;
        if (tickerPosRef.current <= -singleWidth) {
          tickerPosRef.current += singleWidth;
        }
        el.style.transform = `translateX(${Math.round(tickerPosRef.current)}px)`;
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);
    }, 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout); };
  }, [tickerData]);

  useEffect(() => {
    const fetch_prices = async () => {
      try {
        const res = await fetch("http://localhost:8000/ticker");
        const data = await res.json();
        if (Array.isArray(data)) setTickerData(data);
      } catch {}
    };
    fetch_prices();
    const iv = setInterval(fetch_prices, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    setTypedText("");
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTypedText(fullTagline.slice(0, i));
      if (i >= fullTagline.length) clearInterval(iv);
    }, 55);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") setDark(false);
    else setDark(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("assembled"), 1000);
    const t2 = setTimeout(() => setPhase("ready"), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
      targetMouse.current = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 };
    };
    window.addEventListener("mousemove", h);
    let raf: number;
    const smooth = () => {
      smoothMouse.current.x += (targetMouse.current.x - smoothMouse.current.x) * 0.06;
      smoothMouse.current.y += (targetMouse.current.y - smoothMouse.current.y) * 0.06;
      setMousePos({ x: smoothMouse.current.x, y: smoothMouse.current.y });
      raf = requestAnimationFrame(smooth);
    };
    smooth();
    return () => { window.removeEventListener("mousemove", h); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    window.addEventListener("resize", resize);

    const N_LINES = 9;
    const OPTIMAL = 4;
    let t = 0;
    let pulseT = 0;
    let convergeFactor = 0;
    let raf: number;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      t++;
      pulseT += 0.018;
      const isDark = darkRef.current;
      if (convergingRef.current) convergeFactor = Math.min(1, convergeFactor + 0.018);

      const vpx = w * 1.35;
      const vpy = h * 0.28;
      const laneWidth = h * 0.048;
      const baseLine = h * 0.92;
      const baseX = w * -0.15;

      // Shared control point Y values (same for all lanes — perspective)
      const sharedCp1y = h * 0.58;
      const sharedCp2y = h * 0.22;

      for (let i = 0; i < N_LINES; i++) {
        const isOptimal = i === OPTIMAL;
        const distFromOptimal = Math.abs(i - OPTIMAL);
        const laneOffset = (i - OPTIMAL) * laneWidth;

        const bx = baseX + (i - OPTIMAL) * w * 0.018;
        const by = baseLine + laneOffset * 0.5;
        const tx = vpx;
        const ty2 = vpy + (i - OPTIMAL) * laneWidth * 0.02;
        const ty = vpy;

        const cp1x = w * 0.18 + laneOffset * 0.7;
        const cp1y = sharedCp1y;
        const cp2x = w * 0.78 + laneOffset * 0.1;
        const cp2y = sharedCp2y;

        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tx, ty);

        if (isOptimal) {
          const pulse = 0.65 + Math.sin(pulseT * 1.1) * 0.2 + convergeFactor * 0.15;
          // Stroke segmenté — s'affine avec la perspective
          const SEGS = 40;
          for (let s = 0; s < SEGS; s++) {
            const t0 = s / SEGS;
            const t1 = (s + 1) / SEGS;
            const progress = 1 - t0; // 1 en bas (proche), 0 en haut (loin)
            const lw = 0.4 + progress * 3.1; // 3.5 en bas → 0.4 en haut
            const op = pulse * (0.3 + progress * 0.7);
            const glowOp = pulse * 0.6 * progress;

            const mt0 = t0, mt02 = mt0*mt0, mt03 = mt02*mt0;
            const it0 = 1-mt0, it02 = it0*it0, it03 = it02*it0;
            const mt1 = t1, mt12 = mt1*mt1, mt13 = mt12*mt1;
            const it1 = 1-mt1, it12 = it1*it1, it13 = it12*it1;

            const x0s = it03*bx + 3*it02*mt0*cp1x + 3*it0*mt02*cp2x + mt03*tx;
            const y0s = it03*by + 3*it02*mt0*cp1y + 3*it0*mt02*cp2y + mt03*ty2;
            const x1s = it13*bx + 3*it12*mt1*cp1x + 3*it1*mt12*cp2x + mt13*tx;
            const y1s = it13*by + 3*it12*mt1*cp1y + 3*it1*mt12*cp2y + mt13*ty2;

            ctx.beginPath();
            ctx.moveTo(x0s, y0s);
            ctx.lineTo(x1s, y1s);
            ctx.shadowBlur = progress * 18;
            ctx.shadowColor = isDark ? `rgba(120,185,255,${glowOp})` : `rgba(155,185,255,0.2)`;
            ctx.strokeStyle = isDark ? `rgba(175,218,255,${op})` : `rgba(155,185,255,0.45)`;
            ctx.lineWidth = lw;
            ctx.stroke();
          }
          ctx.shadowBlur = 0;

          const dp = (t * 0.0018) % 1;
          const mt = dp, mt2 = mt*mt, mt3 = mt2*mt;
          const it = 1-mt, it2 = it*it, it3 = it2*it;
          const dotX = it3*bx + 3*it2*mt*cp1x + 3*it*mt2*cp2x + mt3*tx;
          const dotY = it3*by + 3*it2*mt*cp1y + 3*it*mt2*cp2y + mt3*ty2;
          const dotOp = Math.sin(dp * Math.PI) * 0.95;
          ctx.beginPath();
          const dotSize = 5.5 * (1 - dp * 0.82);
          ctx.arc(dotX, dotY, Math.max(0.4, dotSize), 0, Math.PI * 2);
          ctx.fillStyle = isDark ? `rgba(220,240,255,${dotOp})` : `rgba(155,185,255,${dotOp * 0.45})`;
          ctx.shadowBlur = 14;
          ctx.shadowColor = isDark ? `rgba(180,225,255,0.9)` : `rgba(155,185,255,0.2)`;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          const fade = Math.max(0, 1 - distFromOptimal * 0.17);
          const op = isDark
            ? (0.12 + fade * 0.16) * (1 - convergeFactor * 0.5)
            : (0.14 + fade * 0.18) * (1 - convergeFactor * 0.5);
          ctx.strokeStyle = isDark ? `rgba(255,255,255,${op})` : `rgba(175,198,255,0.35)`;
          ctx.lineWidth = 0.25 + fade * 0.5;
          ctx.stroke();
        }
      }

      // Cross lines — calculées sur les lanes extrêmes
      const N_CROSS = 16;
      const lLeft = -(OPTIMAL) * laneWidth;
      const lRight = (N_LINES - 1 - OPTIMAL) * laneWidth;
      const bxL = baseX, bxR = baseX;
      const byL = baseLine + lLeft * 0.6, byR = baseLine + lRight * 0.6;
      const cp1xL = w * 0.62 + lLeft * 0.1, cp1xR = w * 0.62 + lRight * 0.1;
      const cp1yL = h * 0.85 + lLeft * 0.5, cp1yR = h * 0.85 + lRight * 0.5;
      const cp2xL = w * 0.95 + lLeft * 0.05, cp2xR = w * 0.95 + lRight * 0.05;
      const cp2yL = h * 0.55 + lLeft * 0.15, cp2yR = h * 0.55 + lRight * 0.15;
      const txL = vpx, txR = vpx;
      const tyL = vpy + lLeft * 0.02, tyR = vpy + lRight * 0.02;

      for (let j = 1; j < N_CROSS; j++) {
        const prog = Math.pow(j / N_CROSS, 1.8);
        const mt = prog, mt2 = mt*mt, mt3 = mt2*mt;
        const it = 1-mt, it2 = it*it, it3 = it2*it;

        const xL = it3*bxL + 3*it2*mt*cp1xL + 3*it*mt2*cp2xL + mt3*txL;
        const yL2 = it3*byL + 3*it2*mt*cp1yL + 3*it*mt2*cp2yL + mt3*tyL;
        const xR = it3*bxR + 3*it2*mt*cp1xR + 3*it*mt2*cp2xR + mt3*txR;
        const yR2 = it3*byR + 3*it2*mt*cp1yR + 3*it*mt2*cp2yR + mt3*tyR;

        const cop = isDark
          ? (0.015 + prog * 0.04) * (1 - convergeFactor * 0.5)
          : (0.025 + prog * 0.055) * (1 - convergeFactor * 0.5);
        ctx.beginPath();
        ctx.moveTo(xL, yL2);
        ctx.lineTo(xR, yR2);
        ctx.strokeStyle = isDark ? `rgba(255,255,255,${cop})` : `rgba(175,198,255,0.35)`;
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);









  const getGreeting = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Bonjour";
    if (h >= 12 && h < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const handleStart = () => {
    convergingRef.current = true;
    setExiting(true);
    setTimeout(() => router.push("/build"), 600);
  };

  const bg = dark ? "#041124" : "#F3F6FC";
  const text = dark ? "#F8F9FC" : "#0B1A33";
  const btnBg = dark ? "#F8F9FC" : "#041124";
  const btnText = dark ? "#041124" : "#F8F9FC";
  const suffix = dark ? "white" : "light";

  const blocks = [
    { src: `/logo-top-${suffix}.png`, from: "translateY(-150px)", label: "top", delay: 0, px: -0.6, py: -1.0 },
    { src: `/logo-right-${suffix}.png`, from: "translateX(150px)", label: "right", delay: 120, px: 1.0, py: -0.6 },
    { src: `/logo-bottom-${suffix}.png`, from: "translateY(150px)", label: "bottom", delay: 240, px: 0.6, py: 1.0 },
    { src: `/logo-left-${suffix}.png`, from: "translateX(-150px)", label: "left", delay: 360, px: -1.0, py: 0.6 },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: bg, opacity: exiting ? 0 : 1, transition: "opacity 0.5s ease, background-color 0.4s ease" }}>

      <div className="absolute inset-0 pointer-events-none" style={{
        background: dark
          ? "radial-gradient(ellipse 55% 55% at 50% 50%, #0B1C3F 0%, #041124 100%)"
          : "radial-gradient(circle at center, rgba(74,111,165,0.10) 0%, rgba(74,111,165,0.04) 32%, transparent 70%)",
        transition: "background 0.4s ease",
      }}/>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none"/>

      <div className="absolute pointer-events-none" style={{
        width: "520px", height: "520px",
        background: dark
          ? "radial-gradient(circle, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 35%, transparent 70%)"
          : "radial-gradient(circle, rgba(30,55,105,0.03) 0%, transparent 65%)",
        top: "50%", left: "50%", transform: "translate(-50%, -58%)",
        transition: "background 0.4s ease",
      }}/>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center" style={{ gap: "0px" }}>

        {/* Logo + NOVAC */}
        <div style={{
          display: "flex", alignItems: "center", gap: "32px",
          opacity: phase === "assembling" ? 0 : 1,
          transition: "opacity 0.5s ease",
        }}>
          <div className="relative" style={{
            width: "168px", height: "168px",
            animation: phase === "ready" ? "breathe 7s ease-in-out infinite" : "none",
            flexShrink: 0,
          }}>
            <style>{`
              @keyframes breathe {
                0%, 100% { transform: translateY(0px) scale(1) rotate(0deg); }
                50% { transform: translateY(-4px) scale(1.012) rotate(0.15deg); }
              }
            `}</style>
            {blocks.map(b => (
              <div key={b.label} className="absolute inset-0"
                style={{
                  transform: phase === "assembling" ? b.from : "translate(0,0)",
                  opacity: phase === "assembling" ? 0 : 1,
                  transition: `transform 0.9s cubic-bezier(0.16,1,0.3,1) ${b.delay}ms, opacity 0.6s ease ${b.delay}ms`,
                }}>
                <img src={b.src} alt="" className="absolute inset-0 w-full h-full object-contain"
                  style={{
                    transform: phase !== "assembling" ? `translate(${mousePos.x * b.px}px, ${mousePos.y * b.py}px)` : "translate(0,0)",
                    transition: phase !== "assembling" ? "transform 0.15s ease-out" : "none",
                  }}
                />
              </div>
            ))}
          </div>



          <div style={{
            opacity: phase === "ready" ? 1 : 0,
            transform: phase === "ready" ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.6s ease 0.3s, transform 0.6s ease 0.3s",
          }}>
            <h1 style={{ color: text, fontSize: "36px", fontWeight: 700, letterSpacing: "0.35em", transition: "color 0.4s ease", margin: 0 }}>
              NOVAC
            </h1>
            <p style={{ color: text, opacity: 0.7, fontSize: "12px", fontWeight: 300, letterSpacing: "0.22em", marginTop: "10px", transition: "color 0.4s ease" }}>
              {typedText}<span style={{ opacity: typedText.length < fullTagline.length ? 1 : 0, transition: "opacity 0.2s" }}>▎</span>
            </p>
          </div>
        </div>

        <div style={{ height: "32px" }}/>

        {/* Bonsoir + avatar */}
        <div style={{
          opacity: phase === "ready" ? 1 : 0,
          transform: phase === "ready" ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.7s ease 0.35s, transform 0.7s ease 0.35s",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <p style={{ color: text, fontSize: "14px", fontWeight: 300, letterSpacing: "0.15em", opacity: 0.45, transition: "color 0.4s ease" }}>
            {getGreeting()}{user ? `, ${user.username}` : ""}
          </p>
          {user && (
            <button onClick={() => setShowProfile(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full overflow-hidden flex-shrink-0"
              style={{
                border: dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(4,17,36,0.14)",
                backgroundColor: dark ? "rgba(255,255,255,0.07)" : "rgba(4,17,36,0.05)",
                cursor: "pointer",
              }}>
              {user?.avatar_url
                ? <img src={user.avatar_url.startsWith("/uploads") ? `http://localhost:8000${user.avatar_url}` : user.avatar_url} className="w-full h-full object-cover"/>
                : <span style={{ fontSize: "11px", fontWeight: 700, color: text, opacity: 0.7 }}>{user.username?.charAt(0).toUpperCase()}</span>
              }
            </button>
          )}
          {!user && (
            <button onClick={() => setShowAuth(true)}
              style={{
                fontSize: "10px", letterSpacing: "0.1em", color: text, opacity: 0.25,
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
                transition: "opacity 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.55")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0.25")}>
              Se connecter →
            </button>
          )}
        </div>

        <div style={{ height: "24px" }}/>

        {/* Bouton */}
        <div style={{
          opacity: phase === "ready" ? 1 : 0,
          transform: phase === "ready" ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.7s ease 0.45s, transform 0.7s ease 0.45s",
        }}>
          <button onClick={handleStart}
            style={{
              position: "relative", overflow: "hidden",
              padding: "13px 40px",
              borderRadius: "5px",
              backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
              fontSize: "12px", fontWeight: 600, letterSpacing: "0.12em",
              cursor: "pointer",
              background: dark ? "rgba(255,255,255,0.08)" : "rgba(11,26,51,0.07)",
              border: dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(11,26,51,0.18)",
              color: text,
              boxShadow: dark
                ? "0 0 0 1px rgba(255,255,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.4)"
                : "0 14px 40px rgba(11,26,51,0.16)",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "scale(1.03) translateY(-1px)";
              el.style.background = dark ? "rgba(255,255,255,0.13)" : "rgba(4,17,36,0.1)";
              el.style.boxShadow = dark
                ? "0 0 0 1px rgba(255,255,255,0.1) inset, 0 12px 40px rgba(0,0,0,0.5)"
                : "0 0 0 1px rgba(255,255,255,0.9) inset, 0 12px 32px rgba(4,17,36,0.14)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "scale(1) translateY(0)";
              el.style.background = dark ? "rgba(255,255,255,0.08)" : "rgba(4,17,36,0.06)";
              el.style.boxShadow = dark
                ? "0 0 0 1px rgba(255,255,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.4)"
                : "0 0 0 1px rgba(255,255,255,0.8) inset, 0 8px 24px rgba(4,17,36,0.08)";
            }}>
            <span style={{ position: "relative", zIndex: 1 }}>Commencer</span>
            <span style={{
              position: "absolute", top: 0, left: "-100%", width: "60%", height: "100%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
              transform: "skewX(-20deg)",
              animation: "shimmer 3s ease-in-out infinite",
              pointerEvents: "none",
            }}/>
            <style>{`@keyframes shimmer { 0%,100% { left: -100% } 50% { left: 150% } }`}</style>
          </button>
        </div>
      </div>

      {/* Search bar */}
      {/* Header top-right */}
      <div style={{
        position: "fixed", top: "16px", right: "64px",
        zIndex: 30, display: "flex", alignItems: "center", gap: "8px",
        opacity: phase === "ready" ? 1 : 0,
        transition: "opacity 0.7s ease 0.5s",
      }}>
        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center",
          background: dark ? "rgba(255,255,255,0.06)" : "rgba(11,26,51,0.05)",
          border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(11,26,51,0.1)",
          borderRadius: "9px",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          padding: "0 12px", width: "220px", height: "36px",
        }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2} style={{ opacity: 0.35, flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher un actif, ETF, crypto..."
            style={{
              background: "transparent", border: "none", outline: "none",
              color: text, fontSize: "12px", letterSpacing: "0.04em",
              padding: "0 10px", width: "100%", height: "36px",
              opacity: searchQuery ? 1 : 0.45,
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 0.4 }}>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        {/* Bouton Outils */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowTools(t => !t)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: dark ? "rgba(255,255,255,0.06)" : "rgba(11,26,51,0.05)",
              border: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(11,26,51,0.1)",
              borderRadius: "9px", padding: "0 14px", height: "36px",
              backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
              color: text, fontSize: "12px", letterSpacing: "0.06em", opacity: 0.7,
              cursor: "pointer", transition: "opacity 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
            Outils
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}
              style={{ transform: showTools ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {showTools && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0, left: "auto",
              background: dark ? "rgba(4,17,36,0.92)" : "rgba(243,246,252,0.95)",
              border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(11,26,51,0.1)",
              borderRadius: "10px", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              padding: "6px", minWidth: "200px",
              boxShadow: dark ? "0 16px 40px rgba(0,0,0,0.4)" : "0 16px 40px rgba(11,26,51,0.12)",
            }}>
              {[
                { icon: "◈", label: "Créer un portefeuille" },
                { icon: "◎", label: "Analyse de marché" },
                { icon: "⬡", label: "ETF Map", href: "/map" },
                { icon: "⟁", label: "Monte Carlo" },
                { icon: "◆", label: "Optimisation Markowitz" },
              ].map((item: any) => (
                <button key={item.label}
                  onClick={() => item.href && router.push(item.href)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    width: "100%", padding: "9px 12px", borderRadius: "7px",
                    background: "transparent", border: "none",
                    color: text, fontSize: "12px", letterSpacing: "0.04em",
                    cursor: item.href ? "pointer" : "default", textAlign: "left", opacity: 0.7,
                    transition: "background 0.15s, opacity 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = dark ? "rgba(255,255,255,0.07)" : "rgba(11,26,51,0.06)";
                    e.currentTarget.style.opacity = "1";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.opacity = "0.7";
                  }}>
                  <span style={{ opacity: 0.5, fontSize: "14px" }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>



      {/* Ticker */}
      {tickerData.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
          background: dark ? "rgba(4,17,36,0.85)" : "rgba(243,246,252,0.85)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          borderTop: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(11,26,51,0.08)",
          padding: "8px 0", overflow: "hidden",
        }}>
          <div ref={tickerRef} style={{
            display: "flex", gap: "80px", whiteSpace: "nowrap",
            willChange: "transform",
          }}>
            {[...tickerData, ...tickerData].map((d, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: text, fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", opacity: 0.7 }}>{d.symbol}</span>
                <span style={{ color: text, fontSize: "11px", opacity: 0.5 }}>{d.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: d.change >= 0 ? "#22c55e" : "#ef4444" }}>
                  {d.change >= 0 ? "+" : ""}{d.change.toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Toggle dark */}
      <button onClick={() => setDark(d => !d)}
        style={{
          position: "fixed", top: "16px", right: "20px", zIndex: 40,
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "36px", height: "36px",
          background: dark ? "rgba(255,255,255,0.06)" : "rgba(11,26,51,0.05)",
          border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(11,26,51,0.1)",
          borderRadius: "9px",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          cursor: "pointer",
          opacity: phase === "ready" ? 1 : 0,
          transition: "opacity 0.7s ease 0.5s",
        }}>
        <span style={{ position: "absolute", transition: "opacity 0.2s ease, transform 0.2s ease", opacity: dark ? 1 : 0, transform: dark ? "scale(1)" : "scale(0.6)" }}>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z"/>
          </svg>
        </span>
        <span style={{ position: "absolute", transition: "opacity 0.2s ease, transform 0.2s ease", opacity: dark ? 0 : 1, transform: dark ? "scale(0.6)" : "scale(1)" }}>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
          </svg>
        </span>
      </button>

      {showAuth && <AuthModal dark={dark} onClose={() => setShowAuth(false)} onAuth={(u: any) => setUser(u)}/>}
      {showProfile && user && <ProfileModal dark={dark} user={user} onClose={() => setShowProfile(false)} onUpdate={(u: any) => setUser(u)}/>}
    </div>
  );
}
