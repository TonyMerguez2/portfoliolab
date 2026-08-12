"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import AvatarNovac from "@/components/AvatarNovac";
import PastilleCouleur, { PastillePlus } from "@/components/portfolio/PastilleCouleur";
import { COULEURS_AVATAR } from "@/lib/avatarCouleur";
import { useAvatar } from "@/lib/AvatarContext";

/**
 * Le visage d'un portefeuille — son analyste, si l'on veut.
 *
 * ⚠️ **Ce n'est pas le logo du portefeuille, c'est celui qui le regarde.** La nuance
 * décide de tout le reste : un logo identifie une chose, un visage peut dire dans quel
 * état elle se trouve. C'est ce qui rend l'avatar utile ici alors qu'il ne l'était pas
 * dans le bandeau — là-bas, une seule tête pour toute l'application ne pouvait que
 * répéter ce que l'écran montrait déjà ; ici, chaque portefeuille a le sien.
 *
 * ⚠️ **La couleur ne vit plus ici, elle est passée en propriété.** Elle habillait sa
 * tête ; elle habille désormais aussi la courbe de performance. La garder dans ce
 * composant aurait obligé à la faire remonter jusqu'à la page puis redescendre vers le
 * graphique — le chemin sûr pour finir avec deux valeurs qui ne coïncident plus. Voir
 * `useCouleurAvatar`, que la page appelle une fois pour les deux.
 *
 * ⚠️ **Ce qu'on perd en le posant ici.** La vignette qu'il remplace, `ImagePortefeuille`,
 * était aussi le téléverseur d'image du portefeuille, recadrage compris. Ce composant
 * n'est pas supprimé — il reste entier dans le code — mais plus rien ne l'appelle sur
 * cette page. Poser une image de portefeuille n'est donc, pour l'instant, plus possible.
 */

export default function AvatarPortefeuille({
  portefeuille, couleur, onCouleur, taille = 63,
}: {
  portefeuille: { id: string | number; name?: string; color?: string | null };
  /** La couleur portée — celle que la page tient, et donne aussi à la courbe. */
  couleur: string;
  onCouleur: (hex: string) => void;
  taille?: number;
}) {
  const { expression } = useAvatar();
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement | null>(null);
  /** Où poser le panneau, relevé sur le bouton au moment de l'ouverture. */
  const [ancre, setAncre] = useState<{ x: number; y: number } | null>(null);

  /**
   * ⚠️ **Le panneau est monté dans le corps du document, pas à côté du bouton.**
   * Vu à l'écran : posé dans le flux, il passait *sous* la carte du graphique — il ne
   * s'agissait pas d'un débordement mais d'un empilement, le `z-index` du panneau
   * n'ayant cours que dans le contexte de son parent. Un portail le sort de ce contexte
   * et le met hors d'atteinte de tout ce que la page empile ou rogne au-dessus de lui.
   *
   * La contrepartie est qu'il faut lui donner sa position à la main, et la reprendre
   * quand la page bouge — d'où la fermeture au défilement, plus honnête qu'un panneau
   * qui resterait accroché dans le vide.
   */
  const ouvrir = useCallback(() => {
    const b = bouton.current?.getBoundingClientRect();
    if (!b) return;
    setAncre({ x: b.left, y: b.bottom + 10 });
    setOuvert(true);
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = () => setOuvert(false);
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);
    return () => {
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
    };
  }, [ouvert]);


  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={bouton}
        type="button"
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        aria-expanded={ouvert}
        aria-label={`Couleur de l’avatar${portefeuille.name ? ` de ${portefeuille.name}` : ""}`}
        title="Changer sa couleur"
        style={{
          width: taille, height: taille, padding: 0, border: 0, background: "none",
          cursor: "pointer", display: "block", borderRadius: "50%",
          transition: "opacity 150ms", opacity: ouvert ? 0.86 : 1,
        }}
      >
        <AvatarNovac
          taille={taille}
          couleur={couleur}
          etat={expression.cle}
          impulsion={expression.jeton}
          titre={portefeuille.name ?? "Novac"}
        />
      </button>

      {ouvert && ancre && createPortal(
        <>
          {/* Le voile de fermeture, sous le panneau : sans lui, il faut viser le
              bouton pour refermer, ce qui se remarque immédiatement à l'usage. */}
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }}
            onClick={() => setOuvert(false)} />
          {/**
            * ⚠️ **Une carte claire, quel que soit le thème de l'application.** C'est la
            * référence fournie, et elle tient debout : les pastilles bombées tirent leur
            * relief d'une lumière qui vient d'en haut et d'un halo coloré — sur un fond
            * sombre, le halo se confond avec l'ombre portée et l'objet retombe à plat.
            * Le raccord aux jetons du thème viendra après, s'il doit venir.
            */}
          <div style={{
            position: "fixed", top: ancre.y, left: ancre.x, zIndex: 60,
            padding: 18, borderRadius: 24,
            background: "linear-gradient(160deg, #FDFDFE 0%, #F4F4F6 100%)",
            boxShadow: "0 18px 50px rgba(12,16,28,0.28), 0 2px 6px rgba(12,16,28,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 34px)", gap: 14,
              // Le « + » occupe le coin haut droit, comme sur la référence : il ouvre la
              // couleur libre, qui est la vraie raison d'être de ce panneau.
              gridAutoFlow: "row dense",
            }}>
              {COULEURS_AVATAR.slice(0, 3).map(c => (
                <PastilleCouleur key={c.hex} couleur={c.hex} titre={c.nom}
                  retenue={c.hex.toLowerCase() === couleur.toLowerCase()}
                  onClick={() => onCouleur(c.hex)} />
              ))}
              <PastillePlus valeur={couleur} onChange={onCouleur} />
              {COULEURS_AVATAR.slice(3).map(c => (
                <PastilleCouleur key={c.hex} couleur={c.hex} titre={c.nom}
                  retenue={c.hex.toLowerCase() === couleur.toLowerCase()}
                  onClick={() => onCouleur(c.hex)} />
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
