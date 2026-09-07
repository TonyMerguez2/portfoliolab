"use client";
import { useEffect, useState } from "react";

/**
 * Le thème : lecture, écriture, et le pont vers le canevas.
 *
 * L'essentiel de l'habillage ne passe pas par ici. Les styles en ligne
 * consomment directement les variables CSS via @/lib/palette, et la bascule
 * d'un thème à l'autre n'est qu'un attribut écrit sur <html> — sans état React,
 * donc sans rendu. Ce module sert aux trois cas qui ne peuvent pas s'en
 * contenter : régler le thème, savoir lequel est actif, et donner de vraies
 * couleurs aux bibliothèques qui peignent sur un canevas.
 */

export type ModeTheme = "clair" | "sombre";

const CLE = "novac-theme";

/** Le mode réellement appliqué au document. */
export function modeCourant(): ModeTheme {
  if (typeof document === "undefined") return "sombre";
  return document.documentElement.getAttribute("data-theme") === "clair"
    ? "clair"
    : "sombre";
}

/**
 * Applique un mode et le retient.
 *
 * L'écriture dans localStorage peut échouer — navigation privée, stockage
 * plein, cookies tiers bloqués dans une iframe. Ce n'est pas une raison pour
 * que le thème ne change pas à l'écran, d'où le try/catch.
 */
export function definirMode(mode: ModeTheme): void {
  document.documentElement.setAttribute("data-theme", mode);
  /**
   * ⚠️ **La classe `dark` est celle d'Appica, et elle doit suivre le même interrupteur.**
   * Leurs composants ne connaissent pas `data-theme` : leur variante sombre s'écrit
   * `&:is(.dark *)`, donc elle ne s'applique qu'en présence de cette classe sur la racine.
   * Sans elle, un bouton ou un champ d'Appica se rend **en clair sur un site sombre** — vu sur
   * la porte de l'alpha, dont la pastille de version sortait blanche alors que la même
   * pastille est sombre sur l'accueil. La différence tenait à ce que l'accueil posait la
   * classe pour son propre compte, et lui seul.
   */
  document.documentElement.classList.toggle("dark", mode === "sombre");
  try {
    localStorage.setItem(CLE, mode);
  } catch {
    /* Le thème s'applique quand même, il ne survivra simplement pas au rechargement. */
  }
}

export function basculerMode(): ModeTheme {
  const suivant: ModeTheme = modeCourant() === "clair" ? "sombre" : "clair";
  definirMode(suivant);
  return suivant;
}

/**
 * Le mode actif, en réactif.
 *
 * Observe l'attribut plutôt que de tenir l'état en React : le thème peut aussi
 * être posé par le script anti-scintillement du layout, avant que le moindre
 * composant ne soit monté. Observer la seule source de vérité évite d'avoir à
 * les synchroniser.
 */
export function useModeTheme(): ModeTheme {
  const [mode, setMode] = useState<ModeTheme>("sombre");

  useEffect(() => {
    const lire = () => setMode(modeCourant());
    lire();
    const obs = new MutationObserver(lire);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return mode;
}

/**
 * Résout un jeton en couleur véritable.
 *
 * lightweight-charts peint sur un canevas : il lui faut « #0F172A », il ne sait
 * rien faire de « var(--nv-texte) ». On demande donc au navigateur la valeur
 * calculée, ce qui garde globals.css comme source unique — recopier les
 * hexadécimaux ici les aurait fatalement laissés diverger.
 *
 * `secours` sert au rendu serveur et au tout premier rendu, où getComputedStyle
 * n'a rien à lire.
 */
export function resoudreJeton(nom: string, secours = "#000000"): string {
  if (typeof window === "undefined") return secours;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
  return v || secours;
}

// ── Compatibilité ───────────────────────────────────────────────────────────
// Deux pages consomment encore des jetons en JavaScript (la simulation et
// l'en-tête global). Elles continuent de fonctionner, mais les valeurs sont
// désormais résolues depuis les variables CSS au lieu d'être écrites deux fois.

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

function jetonsDepuisCss(sombre: boolean): ThemeTokens {
  const j = (nom: string, secours: string) => resoudreJeton(nom, secours);
  return {
    bg:            j("--nv-fond",             sombre ? "#040F22" : "#FAFBFC"),
    surface:       j("--nv-carte-creuse",     sombre ? "rgba(255,255,255,0.04)" : "#F4F7FB"),
    surfaceSolid:  j("--nv-carte",            sombre ? "#0A1628" : "#FFFFFF"),
    border:        j("--nv-bord",             sombre ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"),
    borderStrong:  j("--nv-bord-fort",        sombre ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.16)"),
    textPrimary:   j("--nv-texte",            sombre ? "#F8F9FC" : "#0F172A"),
    textSecondary: j("--nv-texte-secondaire", sombre ? "rgba(248,249,252,0.65)" : "rgba(15,23,42,0.62)"),
    textMuted:     j("--nv-texte-attenue",    sombre ? "rgba(248,249,252,0.42)" : "rgba(15,23,42,0.45)"),
    positive:      j("--nv-positif",          sombre ? "#4ade80" : "#0F7B3D"),
    negative:      j("--nv-negatif",          sombre ? "#f87171" : "#C81E1E"),
    shadow:        j("--nv-ombre",            sombre ? "0 1px 3px rgba(0,0,0,0.28)" : "0 1px 2px rgba(11,32,74,0.06)"),
    isDark:        sombre,
  };
}

export function useTheme(): ThemeTokens {
  const mode = useModeTheme();
  const [jetons, setJetons] = useState<ThemeTokens>(() => jetonsDepuisCss(true));

  useEffect(() => {
    setJetons(jetonsDepuisCss(mode === "sombre"));
  }, [mode]);

  return jetons;
}
