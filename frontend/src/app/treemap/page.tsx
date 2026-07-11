"use client";
import LiquidGlassTreemap from "@/components/charts/LiquidGlassTreemap";

export default function TreemapPage() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "var(--novac-bg, #040F22)" }}>
      <LiquidGlassTreemap />
    </div>
  );
}
