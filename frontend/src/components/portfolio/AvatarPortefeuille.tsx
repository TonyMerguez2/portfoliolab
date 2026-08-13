"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import AvatarNovac from "@/components/AvatarNovac";
import PastilleCouleur, { PastillePlus } from "@/components/portfolio/PastilleCouleur";
import { COULEURS_AVATAR } from "@/lib/avatarCouleur";
import { FORMES_AVATAR, type FormeAvatar } from "@/lib/useCouleurAvatar";
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

/** Ce que chaque forme s'appelle, à l'écran comme pour les technologies d'assistance. */
const NOM_FORME: Record<FormeAvatar, string> = {
  sphere: "Ronde",
  carre: "Carrée",
  carre3d: "Carrée qui tourne",
  etoile: "Étoile",
};

/** Le dessin d'une forme, en aplat quand la silhouette est fixe, en trait quand elle tourne. */
function VignetteForme({ forme, couleur }: { forme: FormeAvatar; couleur: string }) {
  const tourne = forme.endsWith("3d");
  const trait = { fill: "none", stroke: couleur, strokeWidth: 2, strokeLinejoin: "round" as const };
  const plein = { fill: couleur };
  if (forme.startsWith("etoile")) {
    // Quatre lobes doux : une étoile arrondie, dessinée en quatre arcs.
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 1.4c1.4 4 3.2 5.8 7.2 7.2-4 1.4-5.8 3.2-7.2 7.2-1.4-4-3.2-5.8-7.2-7.2 4-1.4 5.8-3.2 7.2-7.2z"
          transform="translate(0 1.4)" {...(tourne ? trait : plein)} />
      </svg>
    );
  }
  if (forme === "sphere") {
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx={10} cy={10} r={8.5} fill={couleur} />
      </svg>
    );
  }
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
      {tourne
        ? <path d="M10 1.6 17.6 5.6v8.8L10 18.4 2.4 14.4V5.6z" {...trait} />
        : <rect x={1.5} y={1.5} width={17} height={17} rx={5.4} ry={5.4} fill={couleur} />}
    </svg>
  );
}

export default function AvatarPortefeuille({
  portefeuille, couleur, onCouleur, forme, onForme, taille = 63,
}: {
  portefeuille: { id: string | number; name?: string; color?: string | null };
  /** La couleur portée — celle que la page tient, et donne aussi à la courbe. */
  couleur: string;
  onCouleur: (hex: string) => void;
  /** La silhouette portée : sphère, ou cube aux arêtes arrondies. */
  forme: FormeAvatar;
  onForme: (v: FormeAvatar) => void;
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
          forme={forme}
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

            {/**
              * La silhouette, sous les couleurs et séparée d'un trait.
              *
              * ⚠️ **Des vignettes qui dessinent la forme, et non des mots.** « Sphère »,
              * « carré arrondi » et « vraie 3D » ne se distinguent qu'une fois vus ; et la
              * vignette prend la couleur en cours, ce qui montre du même coup les deux
              * réglages ensemble — c'est bien la même tête qu'on habille.
              *
              * ⚠️ Les deux carrés portent le **même volume** : l'un garde sa silhouette
              * immuable et laisse la surface se tordre en tournant, l'autre fait tourner
              * le solide et laisse la silhouette respirer. Le cube en perspective est là
              * pour signaler cette différence-là, la seule qui compte. L'étoile n'a pas
              * cette variante : mesuré, sa version à silhouette fixe suit déjà la sphère
              * de très près, et la faire tourner n'ajouterait qu'une marque qui enfle.
              */}
            <div style={{
              marginTop: 16, paddingTop: 14,
              borderTop: "1px solid rgba(18,20,28,0.10)",
              display: "flex", gap: 10,
            }}>
              {FORMES_AVATAR.map(cle => {
                const retenue = forme === cle;
                const nom = NOM_FORME[cle];
                return (
                  <button key={cle} type="button" onClick={() => onForme(cle)}
                    aria-pressed={retenue}
                    aria-label={`Silhouette ${nom.toLowerCase()}`}
                    title={nom}
                    style={{
                      width: 34, height: 34, padding: 0, borderRadius: 10, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: retenue ? "rgba(18,20,28,0.06)" : "transparent",
                      borderWidth: 1.5, borderStyle: "solid",
                      borderColor: retenue ? "rgba(20,22,30,0.55)" : "rgba(18,20,28,0.12)",
                      transition: "background 120ms, border-color 120ms",
                    }}>
                    {/* ⚠️ Le trait plutôt que l'aplat dit « ce volume-là tourne » : c'est
                        la seule différence entre les deux vignettes d'une même forme, et
                        aucun mot ne l'aurait montrée dans trente-quatre pixels. */}
                    <VignetteForme forme={cle} couleur={couleur} />
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
