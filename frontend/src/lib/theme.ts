"use client";
import { useEffect, useState } from "react";

export type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceSolid: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  positive: string;
  negative: string;
  shadow: string;
  isDark: boolean;
};

export const DARK: ThemeTokens = {
  bg:            "#040F22",
  surface:       "rgba(255,255,255,0.02)",
  surfaceSolid:  "#0a1628",
  border:        "rgba(255,255,255,0.06)",
  borderStrong:  "rgba(255,255,255,0.12)",
  textPrimary:   "#F8F9FC",
  textSecondary: "rgba(248,249,252,0.65)",
  textMuted:     "rgba(248,249,252,0.40)",
  positive:      "#4ade80",
  negative:      "#ef4444",
  shadow:        "0 1px 3px rgba(0,0,0,0.28)",
  isDark:        true,
};

export const LIGHT: ThemeTokens = {
  bg:            "#F5F7FA",
  surface:       "#FFFFFF",
  surfaceSolid:  "#FFFFFF",
  border:        "rgba(16,24,40,0.08)",
  borderStrong:  "rgba(16,24,40,0.14)",
  textPrimary:   "#1A2233",
  textSecondary: "#5A6577",
  textMuted:     "#8B94A3",
  positive:      "#16A34A",
  negative:      "#DC2626",
  shadow:        "0 1px 3px rgba(16,24,40,0.06)",
  isDark:        false,
};

export function useTheme(): ThemeTokens {
  const [isDark, setIsDark] = useState(() =>
    typeof window === "undefined"
      ? true
      : document.documentElement.getAttribute("data-theme") !== "light"
  );

  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") !== "light");
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return isDark ? DARK : LIGHT;
}
