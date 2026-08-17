"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import AvatarNovac, { contourDeForme } from "@/components/AvatarNovac";
import PastilleCouleur, {
  PastilleSkin, PastillePlus,
} from "@/components/portfolio/PastilleCouleur";
import { COULEURS_AVATAR } from "@/lib/avatarCouleur";
import { SKINS, skinParCle, skinPourForme } from "@/lib/avatarSkins";
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
  etoile: "Étoile",
  etoile6: "Étoile à six lobes",
  coussin: "Coussin",
  hexagone: "Hexagone",
  triangle: "Triangle",
  goutte: "Goutte",
};

export default function AvatarPortefeuille({
  portefeuille, couleur, onCouleur, forme, onForme, skin, onSkin, taille = 63,
}: {
  portefeuille: { id: string | number; name?: string; color?: string | null };
  /** La couleur portée — celle que la page tient, et donne aussi à la courbe. */
  couleur: string;
  onCouleur: (hex: string) => void;
  /** La silhouette portée : sphère, ou cube aux arêtes arrondies. */
  forme: FormeAvatar;
  onForme: (v: FormeAvatar) => void;
  /** L'habillage porté — détouré par la silhouette, immobile. */
  skin: string;
  onSkin: (v: string) => void;
  taille?: number;
}) {
  const { expression } = useAvatar();
  const [survole, setSurvole] = useState(false);
  /**
   * Le contour de la forme portée, pour le cerne du survol.
   *
   * ⚠️ **Il suit la silhouette, il ne l'encadre pas.** Un anneau rond autour d'une goutte
   * ou d'un triangle dit « bouton », pas « cet avatar-là ». Le tracé vient du composant
   * de l'avatar, seul endroit qui sache quel volume porte chaque forme.
   */
  const contour = useMemo(() => contourDeForme(forme), [forme]);

  /**
   * ⚠️ **Choisir une couleur retire l'habillage, et c'est ce qui rend la rangée
   * lisible.** Les pastilles et le globe vivent côte à côte, donc ils décrivent une même
   * chose : ce que porte la tête. Sans cela, on cliquerait une couleur sans rien voir
   * changer — le globe la recouvre — et la sélection montrerait deux marques à la fois.
   */
  /**
   * Les habillages proposés pour la silhouette portée, aperçus compris.
   *
   * ⚠️ **Une règle, là où il y avait un cas particulier.** Le globe était écrit en dur —
   * `forme === "sphere" && <PastilleSkin terre>` — ce qui a fait exactement ce qu'un cas
   * particulier fait toujours : le terminal, ajouté ensuite, n'est jamais apparu dans le
   * panneau. Chaque skin dit déjà sur quelles formes il a un sens, dans `formes` ; la
   * rangée n'a plus qu'à le lui demander, et le prochain habillage s'y montrera seul.
   *
   * ⚠️ **Chacun est aperçu dans sa propre palette, pas dans la couleur en cours.** C'est le
   * même raisonnement qu'au banc d'essai : la pastille annonce ce qu'on obtiendra en
   * cliquant, or cliquer *propose* aussi sa couleur — voir `choisirSkin` dans la page. Un
   * aperçu teinté du portefeuille aurait promis autre chose que ce que le clic donne.
   *
   * ⚠️ **Seuls les habillages *plats* entrent ici, et c'est une limite assumée.** Le ballon
   * de basket, le volley et le tennis sont découpés sur la sphère : leurs morceaux sont des
   * points en trois dimensions qu'il faut projeter, ce que seul l'avatar sait faire. La
   * pastille ne pose que des tracés déjà plats ; les admettre sans les projeter les aurait
   * montrés comme trois disques unis, c'est-à-dire trois boutons indiscernables. Mesuré :
   * la première version de ce filtre les laissait passer, et la rangée offrait « Basket »,
   * « Volley » et « Tennis » sous la forme du même rond orange.
   */
  const habillages = useMemo(
    () => SKINS.filter(s => s.cle !== "uni" && s.plats && skinPourForme(s, forme)).map(s => ({
      cle: s.cle,
      libelle: s.libelle,
      fond: s.palette.tete,
      aplats: s.plats ? s.plats(s.palette) : [],
      degrades: s.degrades ? s.degrades(s.palette) : [],
      decoupes: s.decoupes ? s.decoupes(s.palette) : [],
      /* Le carré du terminal garde ses coins ; le globe reste rond. */
      rayon: s.formes && s.formes.indexOf("sphere") < 0 ? "30%" : "50%",
    })),
    [forme],
  );

  const choisirCouleur = useCallback((hex: string) => {
    onCouleur(hex);
    if (skin !== "uni") onSkin("uni");
  }, [onCouleur, onSkin, skin]);
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
        onPointerEnter={() => setSurvole(true)}
        onPointerLeave={() => setSurvole(false)}
        onFocus={() => setSurvole(true)}
        onBlur={() => setSurvole(false)}
        aria-expanded={ouvert}
        aria-label={`Personnaliser l’avatar${portefeuille.name ? ` de ${portefeuille.name}` : ""}`}
        title="Personnaliser l’avatar"
        style={{
          width: taille, height: taille, padding: 0, border: 0, background: "none",
          cursor: "pointer", display: "block", position: "relative",
        }}
      >
        <AvatarNovac
          taille={taille}
          couleur={couleur}
          forme={forme}
          skin={skin}
          etat={expression.cle}
          impulsion={expression.jeton}
          titre={portefeuille.name ?? "Novac"}
        />
        {/**
          * La surcouche de retouche, posée par-dessus l'avatar.
          *
          * ⚠️ **Un débordement visible, parce que le cerne sort du cadre.** L'anneau est
          * tracé un peu plus grand que la silhouette pour la border sans la mordre ; le
          * SVG a exactement la taille de la tête, donc l'anneau serait tranché sans cela.
          *
          * ⚠️ **Ni la souris ni le lecteur d'écran ne la voient.** Elle n'existe que
          * pendant le survol du bouton qui la contient : lui laisser capter les
          * événements ferait clignoter l'état à chaque passage sur elle.
          */}
        <svg
          viewBox="-100 -100 200 200"
          width={taille}
          height={taille}
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, display: "block", overflow: "visible",
            /**
             * ⚠️ **Le survol seul, et surtout pas le panneau ouvert.** La surcouche
             * annonce « on peut retoucher ceci » ; une fois le panneau ouvert, c'est fait
             * — le laisser voilé cache l'avatar au moment précis où l'on regarde ce qu'on
             * lui fait, alors que le curseur est parti dans les réglages. La marque
             * accompagne le geste, elle ne le commente pas après coup.
             */
            pointerEvents: "none", opacity: survole ? 1 : 0,
            transition: "opacity 140ms ease",
          }}
        >
          <path d={contour} transform="scale(1.07)" fill="none"
            stroke="#1C1F26" strokeWidth={13} strokeLinejoin="round" />
          <path d={contour} fill="rgba(12,14,18,0.42)" />
          {/* Le stylo, centré. Le trait est fixé à l'écran : sans cela il s'épaissirait
              avec la taille rendue, et l'icône deviendrait une tache à 63 pixels. */}
          <g transform="translate(-21 -21) scale(1.75)" fill="none" stroke="#FFFFFF"
            strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke">
            <path d="m13.5 6.5 4 4M4 20h4L18.5 9.5a2.828 2.828 0 0 0-4-4L4 16z" />
          </g>
        </svg>
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
                  retenue={skin === "uni" && c.hex.toLowerCase() === couleur.toLowerCase()}
                  onClick={() => choisirCouleur(c.hex)} />
              ))}
              <PastillePlus valeur={couleur} onChange={choisirCouleur} />
              {COULEURS_AVATAR.slice(3).map(c => (
                <PastilleCouleur key={c.hex} couleur={c.hex} titre={c.nom}
                  retenue={skin === "uni" && c.hex.toLowerCase() === couleur.toLowerCase()}
                  onClick={() => choisirCouleur(c.hex)} />
              ))}
              {/**
                * ⚠️ **Les habillages sont des pastilles parmi les couleurs, pas un réglage
                * à part.** C'est une décision d'usage : il n'y a rien à composer entre une
                * couleur et un habillage — l'un recouvre l'autre. Les mettre dans la même
                * rangée dit exactement cela, un choix unique, là où deux réglages séparés
                * auraient laissé croire qu'ils se combinent.
                *
                * ⚠️ Ils ne paraissent que sur les silhouettes qui les portent : le globe
                * détouré par un triangle n'est plus un globe, le terminal détouré par une
                * goutte n'est plus un appareil. Et comme la forme peut changer après, le
                * réglage sait aussi se défaire — voir la page, qui le tient.
                */}
              {habillages.map(h => (
                <PastilleSkin
                  key={h.cle}
                  contour={contourDeForme(forme)}
                  aplats={h.aplats}
                  degrades={h.degrades}
                  decoupes={h.decoupes}
                  fond={h.fond}
                  rayon={h.rayon}
                  retenue={skin === h.cle}
                  titre={h.libelle}
                  onClick={() => onSkin(h.cle)} />
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
              display: "grid", gridTemplateColumns: "repeat(4, 34px)", gap: 10,
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
                    {/**
                      * ⚠️ **La vignette est l'avatar lui-même, plus un pictogramme.** Un
                      * dessin à part ne montre que la silhouette ; il faut ouvrir le
                      * panneau, choisir, puis regarder ailleurs pour savoir ce qu'on a
                      * fait. Ici chaque case porte la couleur, l'habillage et le regard
                      * en cours : on voit les huit résultats possibles avant de choisir.
                      *
                      * ⚠️ **Et elle ne bouge pas.** Huit têtes qui clignent chacune de son
                      * côté attirent l'œil sur le choix qu'on n'a pas encore fait ; un
                      * aperçu est une image de ce qu'on obtiendra, pas une créature.
                      */}
                    {/* ⚠️ L'habillage n'est repris que là où il tient : ailleurs la
                        vignette montre la tête unie, c'est-à-dire ce qu'on obtiendra
                        vraiment en choisissant cette silhouette — la page défait le
                        réglage au même moment. Le test était écrit `cle === "sphere"`,
                        ce qui aurait laissé le terminal hors de son propre carré. */}
                    <AvatarNovac taille={26} forme={cle} couleur={couleur}
                      skin={skinPourForme(skinParCle(skin), cle) ? skin : "uni"}
                      suivi={false} vivant={false} titre={nom} />
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
