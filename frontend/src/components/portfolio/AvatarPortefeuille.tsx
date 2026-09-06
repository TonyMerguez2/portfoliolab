"use client";
import { useCallback, useMemo, useRef, useState } from "react";

import AvatarNovac, { contourDeForme } from "@/components/AvatarNovac";
import FenetreModale from "@/components/ui/FenetreModale";
import { CLAIR, RAYONS } from "@/lib/palette";
import { FONT } from "@/lib/typography";
import { PastilleSkin } from "@/components/portfolio/PastilleCouleur";
import {
  ChoixCouleur, ChoixSilhouette, Reglage,
} from "@/components/portfolio/ChoixApparence";
import { SKINS, skinPourForme } from "@/lib/avatarSkins";
import { type FormeAvatar } from "@/lib/useCouleurAvatar";
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



  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert(o => !o)}
        onPointerEnter={() => setSurvole(true)}
        onPointerLeave={() => setSurvole(false)}
        onFocus={() => setSurvole(true)}
        onBlur={() => setSurvole(false)}
        aria-expanded={ouvert}
        aria-label={`Personnaliser l’avatar${portefeuille.name ? ` de ${portefeuille.name}` : ""}`}
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

      {ouvert && (
        /**
          * ⚠️ **Une fenêtre de l'application, plus un panneau accroché au bouton.** Le
          * réglage vivait dans une carte claire posée sous l'avatar, à sa propre largeur, à
          * son propre rayon, et *quel que soit le thème* — l'unique surface de la page à
          * rester blanche en mode sombre. Elle se refermait aussi au moindre défilement,
          * faute de savoir suivre son ancre. Passée dans `FenetreModale`, elle prend le
          * cadre double, le ressort d'entrée et la fermeture par Échap que partagent la
          * déclaration d'un compte et la saisie d'une opération : trois fenêtres, un seul
          * système.
          *
          * ⚠️ **L'avatar est montré en grand, au centre, au-dessus des réglages.** Sur le
          * panneau accroché, il restait à trente-huit pixels dans le coin de l'écran
          * pendant qu'on lui choisissait une couleur : on réglait à l'aveugle, en vérifiant
          * ailleurs. Un écran de personnalisation doit montrer ce qu'on personnalise.
          */
        <FenetreModale onFermer={() => setOuvert(false)} largeur={400}
          etiquette="Personnaliser l’avatar">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: CLAIR.texte }}>
              Personnaliser l’avatar
            </span>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer"
              style={{ background: "none", border: "none", cursor: "pointer",
                color: CLAIR.texteFaible, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>

          {/**
            * ⚠️ **Vivant, et suivant la souris comme partout ailleurs.** Un aperçu figé
            * aurait montré une autre créature que celle qu'on obtient — c'est précisément
            * le reproche fait au banc d'essai quand il peignait les yeux autrement. Les
            * vignettes de silhouette plus bas restent immobiles, elles, parce qu'elles sont
            * huit : huit têtes qui clignent chacune de son côté attirent l'œil sur le choix
            * qu'on n'a pas encore fait.
            */}
          <div style={{
            display: "flex", justifyContent: "center", padding: "10px 0 4px",
          }}>
            <AvatarNovac taille={132} couleur={couleur} forme={forme} skin={skin}
              etat={expression.cle} impulsion={expression.jeton}
              titre={portefeuille.name ?? "Novac"} />
          </div>

          <Reglage titre="Couleur">
            <ChoixCouleur couleur={couleur} onChoisir={choisirCouleur} skin={skin} />
          </Reglage>

          {/**
            * ⚠️ **Les habillages ont leur propre rubrique, alors qu'ils partageaient la
            * rangée des couleurs.** Les mêler disait « un choix unique », ce qui était vrai
            * du globe seul. À trois habillages et onze couleurs, la rangée devenait un
            * fourre-tout où l'on cherchait le terminal parmi les teintes. Et la question a
            * changé : ce n'est plus « de quelle couleur » mais « couleur *ou* habillage »,
            * ce que deux rubriques disent mieux qu'une grille.
            */}
          {habillages.length > 0 && (
            <Reglage titre="Habillage">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {habillages.map(h => (
                  <PastilleSkin
                    key={h.cle}
                    contour={contourDeForme(forme)}
                    aplats={h.aplats}
                    degrades={h.degrades}
                    decoupes={h.decoupes}
                    fond={h.fond}
                    rayon={h.rayon}
                    taille={32}
                    retenue={skin === h.cle}
                    titre={h.libelle}
                    onClick={() => onSkin(h.cle)} />
                ))}
              </div>
            </Reglage>
          )}

          <Reglage titre="Silhouette">
            {/* ⚠️ L'habillage n'est plus passé : la vignette est un masque teinté, pas un
                avatar rendu. Elle montre la silhouette et la couleur — la seule question que
                cette rubrique pose. Voir `ChoixSilhouette`. */}
            <ChoixSilhouette forme={forme} onChoisir={onForme} couleur={couleur} />
          </Reglage>

        </FenetreModale>
      )}
    </div>
  );
}
