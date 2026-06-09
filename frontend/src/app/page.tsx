"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import ProfileModal from "@/components/ProfileModal";

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const [dark, setDark] = useState(false);
  const darkRef = useRef(dark);
  const [phase, setPhase] = useState<"assembling"|"assembled"|"ready">("assembling");
  const [exiting, setExiting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem("novac_user");
    if (u) setUser(JSON.parse(u));
  }, []);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const targetMouse = useRef({ x: 0, y: 0 });
  const smoothMouse = useRef({ x: 0, y: 0 });
  const convergingRef = useRef(false);
  const haloRef = useRef(0);

  useEffect(() => { darkRef.current = dark; }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
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

    const N = 140;
    const trajs = Array.from({ length: N }, (_, i) => {
      const isOptimal = i === Math.floor(N / 2);
      const convergesToCenter = isOptimal || Math.random() < 0.65;
      const depth = isOptimal ? 1 : Math.random();
      const layer = depth < 0.33 ? 0 : depth < 0.66 ? 1 : depth < 0.88 ? 2 : 3;

      // Distance from center — reduce density near center
      const distFactor = isOptimal ? 1 : 0.3 + Math.random() * 0.7;

      const fromEdge = Math.floor(Math.random() * 4);
      let sx = 0, sy = 0;
      if (fromEdge === 0) { sx = Math.random() * w; sy = -5; }
      else if (fromEdge === 1) { sx = w + 5; sy = Math.random() * h; }
      else if (fromEdge === 2) { sx = Math.random() * w; sy = h + 5; }
      else { sx = -5; sy = Math.random() * h; }

      let ex = 0, ey = 0;
      if (convergesToCenter && !isOptimal) {
        const spread = 0.1 + Math.random() * 0.25;
        ex = w * 0.5 + (Math.random() - 0.5) * w * spread;
        ey = h * 0.5 + (Math.random() - 0.5) * h * spread;
      } else {
        const toEdge = (fromEdge + 1 + Math.floor(Math.random() * 3)) % 4;
        if (toEdge === 0) { ex = Math.random() * w; ey = -5; }
        else if (toEdge === 1) { ex = w + 5; ey = Math.random() * h; }
        else if (toEdge === 2) { ex = Math.random() * w; ey = h + 5; }
        else { ex = -5; ey = Math.random() * h; }
      }

      const cpSpread = isOptimal ? 0.06 : 0.2 + Math.random() * 0.3;
      return {
        isOptimal, depth, layer, convergesToCenter, distFactor,
        sx, sy, ex, ey,
        origCp1x: w * 0.5 + (Math.random() - 0.5) * w * cpSpread,
        origCp1y: h * 0.5 + (Math.random() - 0.5) * h * cpSpread,
        origCp2x: w * 0.5 + (Math.random() - 0.5) * w * cpSpread,
        origCp2y: h * 0.5 + (Math.random() - 0.5) * h * cpSpread,
        cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0,
        vy1: (Math.random() - 0.5) * 0.05,
        vy2: (Math.random() - 0.5) * 0.05,
        vx1: (Math.random() - 0.5) * 0.04,
        vx2: (Math.random() - 0.5) * 0.04,
        flashTimer: Math.floor(Math.random() * 600),
        flashAt: 480 + Math.floor(Math.random() * 240),
        flashDur: 50,
        isHighlighted: false,
      };
    });

    // Init cp values
    trajs.forEach(tr => { tr.cp1x = tr.origCp1x; tr.cp1y = tr.origCp1y; tr.cp2x = tr.origCp2x; tr.cp2y = tr.origCp2y; });

    let t = 0;
    let convergeFactor = 0;
    let raf: number;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      t++;
      const isDark = darkRef.current;
      const ox = (mouseRef.current.x - 0.5) * 8;
      const oy = (mouseRef.current.y - 0.5) * 4;

      if (convergingRef.current) {
        convergeFactor = Math.min(1, convergeFactor + 0.015);
        haloRef.current = Math.min(1, haloRef.current + 0.03);
      }

      [...trajs].sort((a, b) => a.depth - b.depth).forEach(tr => {
        tr.cp1x += tr.vx1; tr.cp1y += tr.vy1;
        tr.cp2x += tr.vx2; tr.cp2y += tr.vy2;
        if (tr.cp1x < -w * 0.2 || tr.cp1x > w * 1.2) tr.vx1 *= -1;
        if (tr.cp1y < -h * 0.2 || tr.cp1y > h * 1.2) tr.vy1 *= -1;
        if (tr.cp2x < -w * 0.2 || tr.cp2x > w * 1.2) tr.vx2 *= -1;
        if (tr.cp2y < -h * 0.2 || tr.cp2y > h * 1.2) tr.vy2 *= -1;

        // Flash effet
        tr.flashTimer++;
        const isFlashing = tr.flashTimer > tr.flashAt && tr.flashTimer < tr.flashAt + tr.flashDur;
        if (tr.flashTimer > tr.flashAt + tr.flashDur + 300) {
          tr.flashTimer = 0;
          tr.flashAt = 480 + Math.floor(Math.random() * 240);
        }
        const flashBoost = isFlashing ? Math.sin((tr.flashTimer - tr.flashAt) / tr.flashDur * Math.PI) * 0.07 : 0;

        // Convergence vers centre au click
        const cx = tr.cp1x + (w * 0.5 - tr.cp1x) * convergeFactor;
        const cy = tr.cp1y + (h * 0.5 - tr.cp1y) * convergeFactor;
        const cx2 = tr.cp2x + (w * 0.5 - tr.cp2x) * convergeFactor;
        const cy2 = tr.cp2y + (h * 0.5 - tr.cp2y) * convergeFactor;
        const exC = tr.ex + (w * 0.5 - tr.ex) * convergeFactor * 0.7;
        const eyC = tr.ey + (h * 0.5 - tr.ey) * convergeFactor * 0.7;

        ctx.beginPath();
        ctx.moveTo(tr.sx + ox * 0.1 * tr.depth, tr.sy + oy * 0.1 * tr.depth);
        ctx.bezierCurveTo(
          cx + ox * 0.35 * tr.depth, cy + oy * 0.35 * tr.depth,
          cx2 + ox * 0.65 * tr.depth, cy2 + oy * 0.65 * tr.depth,
          exC + ox * tr.depth, eyC + oy * tr.depth
        );

        if (tr.isOptimal) {
          ctx.shadowBlur = 4;
          ctx.shadowColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(30,55,105,0.12)";
          const optOp = isDark ? 0.14 + convergeFactor * 0.1 : 0.12 + convergeFactor * 0.08;
          ctx.strokeStyle = isDark ? `rgba(255,255,255,${optOp})` : `rgba(30,55,105,${optOp})`;
          ctx.lineWidth = 1.0;
        } else {
          ctx.shadowBlur = 0;
          const layerOps = isDark ? [0.02, 0.04, 0.07, 0.12] : [0.045, 0.075, 0.11, 0.17];
          const base = (layerOps[tr.layer] || 0.02) + flashBoost + (tr.isHighlighted ? 0.05 : 0);
          ctx.strokeStyle = isDark ? `rgba(255,255,255,${base})` : `rgba(30,55,105,${base})`;
          ctx.lineWidth = [0.35, 0.5, 0.7, 0.9][tr.layer] || 0.35;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

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

  const bg = dark ? "#041124" : "#F5F8FC";
  const text = dark ? "#F8F9FC" : "#041124";
  const btnBg = dark ? "#F8F9FC" : "#041124";
  const btnText = dark ? "#041124" : "#F8F9FC";
  const suffix = dark ? "white" : "black";

  const blocks = [
    { src: `/logo-top-${suffix}.png`, from: "translateY(-150px)", label: "top", delay: 0, px: -1.5, py: -2.5 },
    { src: `/logo-right-${suffix}.png`, from: "translateX(150px)", label: "right", delay: 120, px: 2.5, py: -1.5 },
    { src: `/logo-bottom-${suffix}.png`, from: "translateY(150px)", label: "bottom", delay: 240, px: 1.5, py: 2.5 },
    { src: `/logo-left-${suffix}.png`, from: "translateX(-150px)", label: "left", delay: 360, px: -2.5, py: 1.5 },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: bg, opacity: exiting ? 0 : 1, transition: "opacity 0.5s ease, background-color 0.4s ease" }}>

      {/* Radial bg */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: dark
          ? "radial-gradient(ellipse 55% 55% at 50% 50%, #0B1C3F 0%, #041124 100%)"
          : "radial-gradient(ellipse 55% 55% at 50% 50%, #FFFFFF 0%, #EEF2F7 100%)",
        transition: "background 0.4s ease",
      }}/>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none"/>

      {/* Halo logo */}
      <div className="absolute pointer-events-none" style={{
        width: "480px", height: "480px",
        background: dark
          ? "radial-gradient(circle, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 35%, transparent 70%)"
          : "radial-gradient(circle, rgba(30,55,105,0.035) 0%, transparent 65%)",
        top: "50%", left: "50%", transform: "translate(-50%,-52%)" ,
        transition: "background 0.4s ease",
      }}/>

      <div className="relative z-10 flex flex-col items-center" style={{ gap: "30px" }}>

        {/* Logo */}
        <div className="relative w-40 h-40" style={{
          animation: phase === "ready" ? "breathe 7s ease-in-out infinite" : "none",
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

        {/* Texte */}
        <div className="text-center" style={{
          opacity: phase === "ready" ? 1 : 0,
          transform: phase === "ready" ? "translateY(0)" : "translateY(14px)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}>
          <h1 style={{ color: text, fontSize: "17px", fontWeight: 700, letterSpacing: "0.35em", transition: "color 0.4s ease" }}>
            NOVAC
          </h1>
          <p style={{ color: text, opacity: 0.32, fontSize: "11px", fontWeight: 300, letterSpacing: "0.2em", marginTop: "12px", transition: "color 0.4s ease" }}>
            Find the optimal path.
          </p>
        </div>

        {/* Salutation */}
        {user && (
          <p style={{
            color: text, opacity: phase === "ready" ? 0.45 : 0,
            fontSize: "12px", fontWeight: 300, letterSpacing: "0.15em",
            transition: "opacity 0.7s ease 0.1s, color 0.4s ease",
            textAlign: "center",
          }}>
            {getGreeting()}, {user.username}.
          </p>
        )}

        {/* Bouton */}
        <div style={{
          opacity: phase === "ready" ? 1 : 0,
          transform: phase === "ready" ? "translateY(0)" : "translateY(14px)",
          transition: "opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s",
        }}>
          <button onClick={handleStart}
            style={{
              position: "relative", overflow: "hidden",
              padding: "12px 44px",

              borderRadius: "8px 2px 8px 8px",
              fontSize: "12px", fontWeight: 600, letterSpacing: "0.1em",
              cursor: "pointer",
              background: dark
                ? "rgba(255,255,255,0.08)"
                : "rgba(4,17,36,0.06)",
              border: dark
                ? "1px solid rgba(255,255,255,0.18)"
                : "1px solid rgba(4,17,36,0.15)",
              color: text,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: dark
                ? "0 0 0 1px rgba(255,255,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.4)"
                : "0 0 0 1px rgba(255,255,255,0.8) inset, 0 8px 24px rgba(4,17,36,0.08)",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "scale(1.03) translateY(-1px)";
              el.style.background = dark ? "rgba(255,255,255,0.13)" : "rgba(4,17,36,0.1)";
              el.style.border = dark ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(4,17,36,0.25)";
              el.style.boxShadow = dark
                ? "0 0 0 1px rgba(255,255,255,0.1) inset, 0 12px 40px rgba(0,0,0,0.5)"
                : "0 0 0 1px rgba(255,255,255,0.9) inset, 0 12px 32px rgba(4,17,36,0.14)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "scale(1) translateY(0)";
              el.style.background = dark ? "rgba(255,255,255,0.08)" : "rgba(4,17,36,0.06)";
              el.style.border = dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(4,17,36,0.15)";
              el.style.boxShadow = dark
                ? "0 0 0 1px rgba(255,255,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.4)"
                : "0 0 0 1px rgba(255,255,255,0.8) inset, 0 8px 24px rgba(4,17,36,0.08)";
            }}
          >
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

        {/* Tags */}
        <p style={{
          color: text, opacity: phase === "ready" ? 0.12 : 0,
          fontSize: "10px", letterSpacing: "0.12em",
          transition: "opacity 0.7s ease 0.3s, color 0.4s ease",
        }}>
          Actions • ETF • Crypto • Benchmarks • Monte Carlo • Frontière efficiente
        </p>
      </div>

      {/* Toggle dark */}
      <button onClick={() => user ? setShowProfile(true) : setShowAuth(true)}
        className="fixed top-5 right-16 w-8 h-8 flex items-center justify-center rounded-full overflow-hidden"
        style={{ border: `1px solid ${text}`, opacity: 0.25, backgroundColor: "transparent", cursor: "pointer" }}>
        {user?.avatar_url
          ? <img src={user.avatar_url.startsWith("/uploads") ? `http://localhost:8000${user.avatar_url}` : user.avatar_url} className="w-full h-full object-cover"/>
          : <span style={{ fontSize: "11px", fontWeight: 700, color: text }}>{user ? user.username?.charAt(0).toUpperCase() : "?"}</span>
        }
      </button>
      <button onClick={() => setDark(d => !d)}
        className="fixed top-5 right-6 w-8 h-8 flex items-center justify-center rounded-lg"
        style={{ border: `1px solid ${text}`, opacity: 0.17, backgroundColor: "transparent", cursor: "pointer", transition: "opacity 0.2s, border-color 0.4s" }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.38")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.17")}>
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
