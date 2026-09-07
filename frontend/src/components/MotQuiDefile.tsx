"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Un mot qui se remplace par le suivant, en place, sans bousculer la phrase autour.
 *
 * ⚠️ **Le problème n'est pas le fondu, c'est la largeur.** « résister » et « performer » ne
 * mesurent pas la même chose : remplacer l'un par l'autre dans un texte centré recale toute la
 * ligne, et la phrase entière tressaute à chaque changement. Deux façons d'éviter ça, une
 * mauvaise et une bonne. La mauvaise fige la boîte sur le mot le plus long — après « grandir »
 * il reste alors un trou que rien n'explique. La bonne mesure chaque mot et **anime la
 * largeur** en même temps que le fondu : la phrase se resserre et s'étire au rythme du mot,
 * ce qui se lit comme un mouvement voulu plutôt que comme un défaut de calage.
 *
 * ⚠️ **Les largeurs se mesurent, elles ne se devinent pas.** Le corps du titre est en `clamp`,
 * donc il change avec la fenêtre ; une largeur calculée une fois serait fausse au premier
 * redimensionnement. Un exemplaire invisible de chaque mot est donc rendu dans le flux, à côté,
 * et un `ResizeObserver` relève les mesures à chaque changement de gabarit.
 *
 * ⚠️ **Rien ne bouge tant que la police n'est pas là.** Mesurée avec la police de secours, la
 * largeur est fausse de plusieurs pour cent, et le premier changement de mot se ferait avec un
 * décalage visible. `document.fonts.ready` attend Geist avant la première mesure.
 */
export default function MotQuiDefile({ mots, intervalle = 2600, transition = 420, style }: {
  mots: string[];
  /** Durée d'affichage d'un mot, transition comprise. */
  intervalle?: number;
  /** Durée du fondu et du glissement, en millisecondes. */
  transition?: number;
  style?: React.CSSProperties;
}) {
  const [index, setIndex] = useState(0);
  const [sortant, setSortant] = useState(false);
  const [largeurs, setLargeurs] = useState<number[]>([]);
  const mesures = useRef<(HTMLSpanElement | null)[]>([]);

  /**
   * ⚠️ **Le réglage système l'emporte sur l'effet.** Qui a demandé moins d'animations ne veut
   * pas d'un mot qui change tout seul toutes les deux secondes et demie — c'est exactement le
   * genre de mouvement périphérique que ce réglage vise. La phrase garde alors son premier
   * mot, et le sens ne dépend d'aucun des cinq autres.
   */
  const [anime, setAnime] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lire = () => setAnime(!mq.matches);
    lire();
    mq.addEventListener("change", lire);
    return () => mq.removeEventListener("change", lire);
  }, []);

  useEffect(() => {
    const relever = () => {
      const l = mesures.current.map(n => (n ? n.getBoundingClientRect().width : 0));
      if (l.every(v => v > 0)) setLargeurs(l);
    };
    let obs: ResizeObserver | undefined;
    document.fonts.ready.then(() => {
      relever();
      obs = new ResizeObserver(relever);
      mesures.current.forEach(n => n && obs!.observe(n));
    });
    return () => obs?.disconnect();
  }, [mots]);

  useEffect(() => {
    if (!anime || mots.length < 2) return;
    /**
     * ⚠️ **Deux temps et non un.** Le mot sortant s'efface d'abord, le suivant entre ensuite :
     * les croiser ferait se superposer deux textes à mi-course, illisibles l'un sur l'autre.
     * Le second temps dure le même laps que le premier, d'où l'intervalle amputé de la
     * transition avant de relancer le cycle.
     */
    const t1 = setTimeout(() => {
      setSortant(true);
      const t2 = setTimeout(() => {
        setIndex(i => (i + 1) % mots.length);
        setSortant(false);
      }, transition);
      return () => clearTimeout(t2);
    }, intervalle);
    return () => clearTimeout(t1);
  }, [index, anime, mots.length, intervalle, transition]);

  const largeur = largeurs[index];

  return (
    <>
      <span style={{
        display: "inline-block", verticalAlign: "bottom", overflow: "visible",
        /* Tant que rien n'est mesuré, la boîte s'ajuste au contenu : la phrase est juste dès
           le premier rendu, avant même que la police soit arrivée. */
        width: largeur ? `${largeur}px` : "auto",
        transition: anime ? `width ${transition}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none",
        ...style,
      }}>
        <span style={{
          display: "inline-block", whiteSpace: "nowrap",
          opacity: sortant ? 0 : 1,
          transform: sortant ? "translateY(-0.16em)" : "translateY(0)",
          transition: anime
            ? `opacity ${transition}ms ease, transform ${transition}ms cubic-bezier(0.4, 0, 0.2, 1)`
            : "none",
        }}>
          {mots[index]}
        </span>
      </span>

      {/**
        * Les exemplaires qui servent à mesurer.
        *
        * ⚠️ **Ils sont dans le flux, pas en `position: absolute`.** Un élément sorti du flux
        * n'hérite pas de la largeur disponible et se mesure sur une ligne infinie — ce qui
        * conviendrait ici, mais casserait dès qu'un mot devrait se couper. Ils sont donc posés
        * dans un conteneur de hauteur nulle, invisible et hors de l'arbre d'accessibilité.
        */}
      <span aria-hidden="true" style={{
        position: "absolute", visibility: "hidden", height: 0, overflow: "hidden",
        whiteSpace: "nowrap", pointerEvents: "none",
      }}>
        {mots.map((m, i) => (
          <span key={m} ref={n => { mesures.current[i] = n; }}>{m}</span>
        ))}
      </span>
    </>
  );
}
