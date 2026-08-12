"use client";
import {
  type ReactNode, createContext, useCallback, useContext, useEffect, useMemo,
  useRef, useState,
} from "react";

import { etatParCle } from "@/lib/avatarEtats";

/**
 * Ce qui décide de l'humeur de l'avatar du bandeau.
 *
 * ⚠️ **Le répertoire dit *à quoi ressemble* chaque état ; ce module dit *quand*.** La
 * séparation est celle qui rend l'avatar réutilisable : la géométrie ne connaît pas
 * l'application, et l'application ne connaît pas la géométrie. Entre les deux, une clé
 * de caractère.
 *
 * ⚠️ **Trois déclencheurs ne demandent aucun câblage**, et c'est ce qui fait que
 * l'avatar réagit partout au lieu de réagir sur les deux pages où l'on aurait pensé à
 * l'appeler :
 *
 * 1. **Le survol**, par l'attribut `data-avatar` posé sur n'importe quel élément. Un
 *    écouteur unique sur le document suffit — aucun composant n'a à s'abonner.
 * 2. **Le chargement**, en comptant les requêtes en vol. L'avatar se concentre pendant
 *    que l'application calcule, sur toutes les pages à la fois.
 * 3. **L'inactivité**, qui l'endort puis le réveille.
 *
 * ⚠️ **Les états ponctuels passent par un jeton, pas par la clé seule.** Deux erreurs
 * de suite portent la même clé : sans compteur, la seconde ne déclencherait rien, parce
 * que rien n'aurait changé. C'est le défaut classique des animations pilotées par un
 * état React.
 */

type Expression = { cle: string; jeton: number };

type AvatarContexte = {
  /** L'état à jouer, avec son jeton de relance. */
  expression: Expression;
  /** Demande un état — soutenu ou ponctuel, le répertoire décide. */
  exprimer: (cle: string) => void;
  /** Déclare un travail en cours ; rend la fonction qui le termine. */
  travaille: () => () => void;
};

const RIEN: AvatarContexte = {
  expression: { cle: "neutre", jeton: 0 },
  exprimer: () => {},
  travaille: () => () => {},
};

const Contexte = createContext<AvatarContexte>(RIEN);

export function useAvatar() {
  return useContext(Contexte);
}

/** Au-delà de ce silence, l'avatar s'endort. */
const AVANT_SOMMEIL = 45000;
/**
 * Garde-fou du compteur de requêtes.
 *
 * ⚠️ Sans lui, une requête qui ne se termine jamais — un serveur muet, un onglet mis en
 * veille au mauvais moment — laisserait l'avatar concentré pour toujours. Le symptôme
 * serait un visage figé sans que rien n'explique pourquoi.
 */
const CHARGEMENT_MAX = 20000;

export function AvatarProvider({ children }: { children: ReactNode }) {
  const [ponctuel, setPonctuel] = useState<Expression | null>(null);
  const [survole, setSurvole] = useState<string | null>(null);
  const [travaux, setTravaux] = useState(0);
  const [endormi, setEndormi] = useState(false);
  const jeton = useRef(0);

  const exprimer = useCallback((cle: string) => {
    const etat = etatParCle(cle);
    jeton.current += 1;
    if (etat.nature === "ponctuel") setPonctuel({ cle: etat.cle, jeton: jeton.current });
    else setSurvole(etat.cle === "neutre" ? null : etat.cle);
  }, []);

  const travaille = useCallback(() => {
    setTravaux(n => n + 1);
    let fini = false;
    const finir = () => {
      if (fini) return;
      fini = true;
      setTravaux(n => Math.max(0, n - 1));
    };
    const secours = setTimeout(finir, CHARGEMENT_MAX);
    return () => { clearTimeout(secours); finir(); };
  }, []);

  // ── Le survol, par attribut ─────────────────────────────────────────────────
  /**
   * ⚠️ **Un seul écouteur sur le document, et non un par élément.** Poser des
   * `onMouseEnter` un peu partout aurait demandé de toucher chaque composant, et
   * l'avatar n'aurait réagi que là où on y aurait pensé. Ici, un attribut suffit :
   * `data-avatar="curieux"`, et l'élément devient expressif.
   */
  useEffect(() => {
    const survol = (e: PointerEvent) => {
      const cible = e.target as Element | null;
      const porteur = cible?.closest?.("[data-avatar]") as HTMLElement | null;
      const cle = porteur?.dataset?.avatar ?? null;
      setSurvole(precedent => (precedent === cle ? precedent : cle));
    };
    document.addEventListener("pointerover", survol, { passive: true });
    return () => document.removeEventListener("pointerover", survol);
  }, []);

  // ── Le chargement, en comptant les requêtes ─────────────────────────────────
  /**
   * ⚠️ **`fetch` est enveloppé, et c'est le compromis à connaître.** L'alternative était
   * d'appeler `travaille()` à chaque endroit qui charge : une trentaine de points à
   * modifier, dont on en aurait oublié la moitié, et l'avatar n'aurait été concentré
   * que sur les pages traitées. Ici il l'est partout, sans une ligne dans les pages.
   *
   * Le compteur ne regarde que les routes de l'application : les images, les polices et
   * les appels de tiers ne sont pas du calcul, et les faire compter aurait rendu
   * l'avatar concentré en permanence — donc jamais.
   */
  useEffect(() => {
    if (typeof window.fetch !== "function") return;
    const origine = window.fetch;
    window.fetch = ((...args: Parameters<typeof fetch>) => {
      const url = String(typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url ?? "");
      if (!url.includes("/api/")) return origine(...args);
      setTravaux(n => n + 1);
      let fini = false;
      const finir = () => { if (!fini) { fini = true; setTravaux(n => Math.max(0, n - 1)); } };
      const secours = setTimeout(finir, CHARGEMENT_MAX);
      return origine(...args).then(
        r => { clearTimeout(secours); finir(); return r; },
        // Un échec **réseau** est une action impossible ; un code 404 n'en est pas un,
        // il arrive en fonctionnement normal et ne doit pas faire sursauter le visage.
        e => {
          clearTimeout(secours); finir();
          jeton.current += 1;
          setPonctuel({ cle: "erreur", jeton: jeton.current });
          throw e;
        },
      );
    }) as typeof fetch;
    return () => { window.fetch = origine; };
  }, []);

  // ── L'endormissement ────────────────────────────────────────────────────────
  useEffect(() => {
    let minuteur = 0;
    const reveiller = () => {
      window.clearTimeout(minuteur);
      setEndormi(dormait => {
        if (dormait) {
          jeton.current += 1;
          setPonctuel({ cle: "reveil", jeton: jeton.current });
        }
        return false;
      });
      minuteur = window.setTimeout(() => setEndormi(true), AVANT_SOMMEIL);
    };
    for (const type of ["pointermove", "keydown", "pointerdown", "wheel"]) {
      window.addEventListener(type, reveiller, { passive: true });
    }
    reveiller();
    return () => {
      window.clearTimeout(minuteur);
      for (const type of ["pointermove", "keydown", "pointerdown", "wheel"]) {
        window.removeEventListener(type, reveiller);
      }
    };
  }, []);

  /**
   * L'arbitrage.
   *
   * ⚠️ **Un ordre de priorité explicite, sinon le dernier événement gagne.** Plusieurs
   * sources veulent parler en même temps : la souris survole une carte pendant que la
   * page charge, et une erreur tombe par-dessus. Sans règle écrite, l'affichage
   * dépendrait de l'ordre d'arrivée — donc du hasard. Le ponctuel passe devant parce
   * qu'il est bref et qu'il annonce un fait ; le survol devant le chargement parce
   * qu'il traduit une intention de l'utilisateur, plus fraîche que l'état de la machine.
   */
  const expression = useMemo<Expression>(() => {
    if (ponctuel) return ponctuel;
    if (survole) return { cle: survole, jeton: 0 };
    if (travaux > 0) return { cle: "focus", jeton: 0 };
    if (endormi) return { cle: "somnolent", jeton: 0 };
    return { cle: "neutre", jeton: 0 };
  }, [ponctuel, survole, travaux, endormi]);

  /**
   * Un ponctuel se retire de lui-même une fois joué.
   *
   * Sa durée est celle du répertoire, plus une marge : sans elle, l'état de fond
   * reprendrait la main pendant que la mimique s'achève encore.
   */
  useEffect(() => {
    if (!ponctuel) return;
    const duree = (etatParCle(ponctuel.cle).duree ?? 1000) + 250;
    const t = window.setTimeout(() => setPonctuel(null), duree);
    return () => window.clearTimeout(t);
  }, [ponctuel]);

  const valeur = useMemo(
    () => ({ expression, exprimer, travaille }), [expression, exprimer, travaille]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
