"use client";
import type { CSSProperties } from "react";

import TileCard from "@/components/TileCard";
import type { Objectif } from "@/lib/objectifs";
import {
  dureeEnClair, echeanceEnClair, ecartAuRythme, euros, libelleCible, montantCible,
  pourcentageLisible,
} from "@/lib/objectifs";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * La rangée de cartes d'objectifs.
 *
 * ⚠️ **Remplace trois objectifs écrits dans le code.** L'onglet affichait « Retraite
 * 2035 », « Achat immobilier » et « Indépendance financière » avec des cibles choisies
 * au hasard et un montant courant calculé en multipliant la valeur du portefeuille par
 * 0,42 et 0,28. Ici, aucune carte n'existe si l'épargnant n'a pas saisi l'objectif, et
 * chaque chiffre vient du serveur.
 *
 * ⚠️ **L'habillage est celui des cartes d'actifs de la vue générale, et non une
 * imitation.** Même composant `TileCard`, même rayon de 18, même hauteur de 196, même
 * grain, même bord dégradé. Réécrire cette peau à côté l'aurait fait diverger : c'est
 * exactement ce qui était arrivé à `Cadre`, recopié trois fois avec trois rayons et trois
 * liserés différents. La seule différence assumée est la **couleur** : un actif prend celle
 * de sa marque, un objectif celle que l'épargnant a choisie.
 *
 * ⚠️ **Aucun conseil.** La carte dit où l'on en est et, quand les hypothèses le
 * permettent, si le rythme actuel tient l'échéance. Elle ne dit jamais quoi faire.
 */

/** Un pictogramme par sorte d'objectif — le genre est connu, l'icône ne l'invente pas. */
const GLYPHE: Record<Objectif["genre"], string> = {
  // Une cible : un capital à atteindre.
  capital: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l7-7m0 0V3m0 2h2",
  // Un sablier : un capital à une date de vie.
  capital_age: "M7 3h10M7 21h10M8 3v3.5L12 11l4-4.5V3M8 21v-3.5L12 13l4 4.5V21",
  // Une maison : un achat précis.
  achat: "M4 11.5 12 4l8 7.5M6 10.5V20h12v-9.5M10 20v-5h4v5",
  // Une flèche qui revient : un revenu qui tombe chaque mois.
  revenu_mensuel: "M4 9h10a4 4 0 0 1 0 8H8m0 0 3-3m-3 3 3 3M4 9l3-3M4 9l3 3",
  // Un plafond, et une flèche qui monte vers lui : ce qui le remplit vient d'en bas — les
  // versements — et non de la valeur du portefeuille.
  plafond_versements: "M4 4h16M12 20V8m0 0-4 4m4-4 4 4",
};

/** Le pas du semis, en pixels. Assez large pour que le motif se lise, assez serré pour
 *  qu'il couvre la carte sans faire de vide. */
const PAS_SEMIS = 52;

/**
 * Le glyphe du genre, semé en fond de carte.
 *
 * ⚠️ **Remplace un glyphe gravé dans l'en-tête, qui ne rendait pas.** L'effet de creux —
 * un tracé sombre surmonté d'une copie claire décalée — demande une lumière franche pour se
 * lire. Sur une carte translucide dont le fond varie d'un angle à l'autre, il ressemblait
 * surtout à un dessin flou. Semé et discret, le même glyphe habille la surface au lieu de
 * réclamer une lecture.
 *
 * ⚠️ **Blanc et non de la couleur de l'objectif, pour une raison technique et non
 * esthétique.** Le motif est une image `data:` — un document SVG autonome — et une image ne
 * voit pas les variables CSS de la page. Or la couleur d'un objectif vaut souvent
 * « var(--nv-accent) », qui resterait littéral dans l'URL et ne donnerait aucun tracé. Le
 * blanc à très faible opacité prend la teinte de ce qu'il couvre : sur une carte déjà
 * colorée, le résultat est le même que si le glyphe portait la couleur.
 *
 * ⚠️ **Deux couches décalées d'un demi-pas**, et non une grille droite. Un semis aligné en
 * colonnes se lit comme un tableau et attire l'œil sur ses alignements ; en quinconce, il
 * redevient une texture.
 */
function fondSeme(genre: Objectif["genre"]): CSSProperties {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAS_SEMIS}" `
    + `height="${PAS_SEMIS}" viewBox="-6 -6 36 36" fill="none" stroke="white" `
    + `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="${GLYPHE[genre]}"/></svg>`;
  const image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return {
    backgroundImage: `${image}, ${image}`,
    backgroundSize: `${PAS_SEMIS}px ${PAS_SEMIS}px`,
    backgroundPosition: `0 0, ${PAS_SEMIS / 2}px ${PAS_SEMIS / 2}px`,
    backgroundRepeat: "repeat, repeat",
  };
}

/** Combien de barreaux compose la jauge. */
const SEGMENTS = 34;

/** Sous cette opacité, un barreau coloré ne se distingue plus du fond de la carte. */
const OPACITE_MINIMALE = 0.28;

/** De combien l'opacité décroît de gauche à droite sur la part acquise. */
const DECROISSANCE = 0.2;

/**
 * L'avancement en barreaux, valeur à gauche et cible à droite.
 *
 * ⚠️ **Le remplissage est fractionnaire, et la fraction devient l'opacité du barreau de
 * tête.** Trois pour cent de trente-quatre barreaux font 1,02 : un barreau plein, puis un
 * second à deux pour cent d'opacité. Un pour cent en fait 0,34 : **un seul** barreau coloré,
 * et à un tiers d'opacité — parce que ce n'est qu'un pour cent.
 *
 * C'est ce qui remplace l'arrondi vers le haut que j'avais posé ici. Il partait d'une
 * intuition juste — un objectif entamé ne doit pas paraître vide, le défaut du « 0 % »
 * affiché pour 0,11 % — mais il la payait cher : à un pour cent comme à trois, la jauge
 * montrait un barreau pleinement opaque, donc le même dessin pour un triple d'avancement.
 * La fraction dit les deux choses à la fois, sans arrondi et sans cas particulier : combien
 * de barreaux, et à quel point le suivant est entamé.
 *
 * ⚠️ **Un plancher d'opacité, tout de même, quand le barreau de tête est le seul coloré.**
 * Un dixième de pour cent donnerait 0,034 d'opacité, soit rien de visible : l'objectif
 * paraîtrait intouché alors qu'un versement a bien eu lieu. C'est le principe de
 * `pourcentageLisible` — « < 1 % » plutôt que « 0 % » — appliqué à la couleur.
 *
 * ⚠️ **Près de cent pour cent, en revanche, la jauge ne distingue plus rien — et c'est le
 * chiffre qui rattrape.** Tabulé avant de regarder l'écran : à 99,9 % le dernier barreau sort
 * à 0,77 d'opacité contre 0,80 à cent pour cent. Arithmétiquement distinct, visuellement
 * identique. Prétendre que la jauge « réserve » son dernier barreau à cent pour cent serait
 * donc surestimer ce qu'elle montre. Ce qui tient la promesse est ailleurs :
 * `pourcentageLisible` écrit « > 99 % » et non « 100 % » tant qu'il reste quelques euros.
 */
function Jauge({
  part, couleur, valeur, cible,
}: {
  part: number | null;
  couleur: string;
  valeur: string;
  cible: string;
}) {
  const p = Math.max(0, Math.min(100, part ?? 0));
  // Le remplissage exact, en barreaux : 0,34 pour 1 %, 20,4 pour 60 %, 34 pour 100 %.
  const exact = (p / 100) * SEGMENTS;
  const pleins = Math.floor(exact);
  const fraction = exact - pleins;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "baseline",
        justifyContent: "space-between", gap: 8 }}>
        <span style={{ ...NUM, fontSize: 12, fontWeight: 700,
          color: "rgba(255,255,255,0.88)", whiteSpace: "nowrap" }}>
          {valeur}
        </span>
        <span style={{ ...NUM, fontSize: 12, fontWeight: 600,
          color: "rgba(255,255,255,0.42)", whiteSpace: "nowrap" }}>
          {cible}
        </span>
      </div>
      {/* ⚠️ Les barreaux emplis **dépassent** de deux pixels en haut et en bas. Deux hauteurs
          plutôt qu'un simple changement de couleur : la partie acquise se distingue alors même
          à couleur pâlie ou à faible contraste, et la limite se repère sans compter les
          barreaux. Le conteneur garde la hauteur du plus grand, donc rien ne se déplace quand
          l'avancement change. */}
      <div style={{ display: "flex", gap: 2.5, height: 15, alignItems: "center" }}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          // ⚠️ **Le dégradé est une affaire d'opacité, du plus opaque au moins opaque, et
          // il décroît de gauche à droite sur toute la jauge.** J'avais d'abord assombri la
          // couleur avec du noir : sur un fond de carte lui-même teinté, cela donnait une
          // couleur *différente* plutôt qu'une même couleur plus discrète.
          const rampe = 1 - DECROISSANCE * (i / (SEGMENTS - 1));

          // ⚠️ Le barreau de tête reçoit la **fraction** de remplissage. C'est ce qui fait
          // qu'un pour cent se lit comme un pour cent : un seul barreau, et pâle.
          let opacite = 0;
          if (i < pleins) opacite = rampe;
          else if (i === pleins && fraction > 0) {
            opacite = fraction * rampe;
            // Le plancher ne vaut que si ce barreau est le seul coloré. Une traînée de fin
            // de remplissage, elle, a le droit de s'éteindre complètement — c'est le fondu.
            if (pleins === 0) opacite = Math.max(OPACITE_MINIMALE, opacite);
          }

          const colore = opacite > 0;
          return (
            <span key={i} style={{
              flex: 1, borderRadius: 1.5,
              // Le barreau de tête se dresse dès qu'il est coloré : la limite se repère alors
              // à la silhouette, sans avoir à juger d'une opacité.
              height: colore ? 15 : 11,
              // ⚠️ La couleur reste **la même** partout ; seule l'opacité varie. Et elle
              // varie par `opacity` plutôt que par une concaténation d'alpha : `couleur` peut
              // valoir « var(--nv-accent) », et `${couleur}80` serait une déclaration
              // invalide silencieusement ignorée — le défaut qui privait les cartes de leur
              // teinte.
              background: colore ? couleur : "rgba(255,255,255,0.09)",
              opacity: colore ? opacite : 1,
              transition: "opacity 500ms, height 300ms",
            }} />
          );
        })}
      </div>
    </div>
  );
}

function Carte({ o, onModifier }: { o: Objectif; onModifier?: (o: Objectif) => void }) {
  const couleur = o.couleur || JETONS.accent;
  const rythme = ecartAuRythme(o);
  const echeance = echeanceEnClair(o.mois_restants);
  // ⚠️ **Le temps restant au rythme actuel, qui est la réponse qu'on vient chercher.** Le
  // serveur le calcule déjà pour les deux familles d'objectifs : par capitalisation au
  // rendement attendu pour un capital, par division pour un plafond de versements. La carte
  // n'affichait que l'échéance *saisie* — donc rien du tout sur un objectif sans date, alors
  // que la durée était disponible.
  const reste = dureeEnClair(o.mois_pour_atteindre);

  return (
    <TileCard
      ticker={o.id}
      radius={18}
      // ⚠️ Zéro, comme sur les cartes d'actifs. Les halos flous de `TileCard` sont peints
      // depuis la couleur du *ticker*, qui n'existe pas pour un objectif : les couper évite
      // d'en inventer une, et la teinte vient déjà des lavis d'angle de `colorHex`.
      glowStrength={0}
      className="novac-tile"
      colorHex={couleur}
      onClick={onModifier ? () => onModifier(o) : undefined}
      containerStyle={{
        height: 196,
        // ⚠️ **248 comme borne haute, non comme largeur figée.** C'est la largeur exacte
        // d'une carte d'actif — mais celles-ci vivent dans un rail qui défile, là où les
        // objectifs vivent dans une rangée qui doit tenir en un écran. Une largeur figée
        // renvoyait la tuile « Ajouter » à la ligne dès le quatrième objectif, et l'onglet
        // recommençait à défiler. Les cartes peuvent donc se resserrer, jamais s'étirer :
        // à l'aise elles font 248 comme les actifs, à l'étroit elles rétrécissent au lieu
        // de pousser la rangée.
        flex: "0 1 248px", minWidth: 186,
        // C'est `currentColor` que lit le bord dégradé de `.novac-tile` — voir globals.css.
        // Le poser ici est ce qui donne à chaque carte le bord de sa propre couleur.
        color: couleur,
      }}
      style={{ height: "100%", display: "flex", flexDirection: "column",
        padding: "14px 15px", boxSizing: "border-box" }}>

      {/* ⚠️ Le semis de fond, sous le contenu. `zIndex: -1` et non `0` : dans un contexte
          d'empilement, une couche à zéro se peint **au-dessus** du contenu en flux, et le
          motif passait alors devant le texte. À moins un, il se glisse entre le fond de la
          tuile et ses écritures — exactement la place d'un filigrane. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none",
        // Très faible : le motif doit se deviner, pas se lire. Au-delà de huit centièmes il
        // entre en concurrence avec les chiffres, qui sont ce que la carte a à dire.
        opacity: 0.055,
        ...fondSeme(o.genre),
      }} />

      {/* Identité */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700,
          color: "rgba(255,255,255,0.94)", minWidth: 0, flex: 1, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {o.nom}
        </span>
        {/* ⚠️ **Plus de pastille lumineuse ici.** Elle datait d'un temps où la carte était
            gris uni : le point était alors le seul porteur de la couleur de l'objectif.
            Depuis que le fond, le liseré et la jauge la portent tous, il ne redit rien — et
            son halo était le seul élément franchement brillant de la carte. */}
      </div>

      {/* ⚠️ La cible est **centrée** dans la hauteur restante, non collée sous le nom. À
          196 pixels — la hauteur d'une carte d'actif, où une courbe occupe le milieu — un
          bloc aligné en haut laissait un vide franc au centre de la carte, qui se lisait
          comme un contenu manquant. Un ressort de part et d'autre fait du blanc une
          respiration voulue. */}
      <div style={{ flex: 1, minHeight: 0 }} />

      {/* La cible, au corps du cours d'un actif : c'est le chiffre qu'on vient lire. */}
      <div>
        <div style={{ ...NUM, fontSize: 20, fontWeight: 700, lineHeight: 1.1,
          color: "rgba(255,255,255,0.94)" }}>
          {montantCible(o)}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 550, lineHeight: 1.2,
          color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap" }}>
          {libelleCible(o)}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }} />

      {/* ⚠️ Sans avancement, pas de jauge : le serveur rend `null` quand la valeur du
          portefeuille est inconnue — cours indisponibles. Une jauge à zéro se lirait
          comme un objectif intouché, ce qui est faux et découragerait pour rien. */}
      {o.avancement != null && o.montant_actuel != null && o.capital_requis != null ? (
        <Jauge part={o.avancement} couleur={couleur}
          valeur={euros(o.montant_actuel)} cible={euros(o.capital_requis)} />
      ) : (
        <span style={{ fontFamily: FONT, fontSize: 10.5,
          color: "rgba(255,255,255,0.38)" }}>
          Avancement indisponible
        </span>
      )}

      {/* ⚠️ Le versement et le temps restant, côte à côte : l'un est la cause de l'autre.
          Séparés, le lecteur devait ouvrir le formulaire pour savoir à quel rythme la durée
          affichée correspondait — et une durée sans son rythme n'est pas vérifiable. */}
      <div style={{ display: "flex", alignItems: "baseline",
        justifyContent: "space-between", gap: 8, marginTop: 6, minWidth: 0 }}>
        <span style={{ ...NUM, fontSize: 10.5, color: "rgba(255,255,255,0.52)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {o.versement_mensuel
            ? `${euros(o.versement_mensuel)} / mois`
            : "sans versement"}
        </span>
        {/* ⚠️ Une durée absente se dit, plutôt que de laisser un blanc : elle manque toujours
            pour une raison — pas de versement, ou pas de rendement attendu sur un objectif de
            capital — et c'est cette raison que l'épargnant doit pouvoir corriger. */}
        <span style={{ ...NUM, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
          color: reste ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.38)" }}
          title={reste ? undefined
            : "Renseignez un versement mensuel — et un rendement attendu pour un objectif de capital."}>
          {reste === "atteint" ? "atteint" : reste ? `reste ${reste}` : "durée inconnue"}
        </span>
      </div>

      {/* Le pied : l'avancement, l'échéance, le constat de rythme. Jamais une consigne. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7,
        paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.07)", minWidth: 0 }}>
        {o.avancement != null && (
          <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: couleur,
            flexShrink: 0 }}>
            {pourcentageLisible(o.avancement)}
          </span>
        )}
        {/* ⚠️ Plus de repli « sans échéance ». L'absence d'échéance n'apprend rien — c'est
            un état, pas une information — et la carte dit désormais le temps restant au
            rythme actuel, qui répond à la question que l'échéance servait à approcher. Une
            échéance réellement saisie, elle, continue de s'afficher : elle est ce à quoi le
            constat de rythme se compare. */}
        {echeance && (
          <span style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(255,255,255,0.38)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {echeance}
          </span>
        )}
        {rythme && (
          <span style={{
            marginLeft: "auto", flexShrink: 0,
            fontFamily: FONT, fontSize: 9, fontWeight: 600,
            padding: "2px 6px", borderRadius: RAYONS.xs,
            color: rythme.tenable ? JETONS.positif : JETONS.attention,
            // ⚠️ **Un jeton voilé, jamais une concaténation d'alpha.** `JETONS.attention`
            // vaut la chaîne « var(--nv-attention) » : y coller « 22 » produit
            // « var(--nv-attention)22 », déclaration invalide que le navigateur ignore en
            // silence — le badge se retrouvait sans fond. C'est le même défaut qui privait
            // les cartes de leur lavis de couleur, et il ne se voit jamais en console.
            background: rythme.tenable ? JETONS.positifDoux : JETONS.attentionDoux,
          }}>
            {rythme.texte}
          </span>
        )}
      </div>
    </TileCard>
  );
}

export default function CartesObjectifs({
  objectifs, onAjouter, onModifier,
}: {
  objectifs: Objectif[];
  onAjouter?: () => void;
  onModifier?: (o: Objectif) => void;
}) {
  return (
    <div style={{
      // ⚠️ **Une rangée en flex et non une grille, et ce choix vient d'une mesure.** Avec
      // `grid-template-columns: repeat(auto-fill, …)`, toutes les colonnes ont la même
      // largeur : la tuile « Ajouter » occupait donc une pleine colonne de carte, et le
      // quatrième objectif la renvoyait à la ligne — 136 pixels de plus, et l'onglet
      // recommençait à défiler. En flex, elle prend la largeur qu'elle mérite.
      display: "flex", flexWrap: "wrap", gap: 10, alignItems: "stretch",
    }}>
      {objectifs.map(o => <Carte key={o.id} o={o} onModifier={onModifier} />)}

      {/* ⚠️ **Mince quand la rangée est peuplée, large quand elle est vide.** Ce n'est pas
          une coquetterie : avec `flex-wrap`, une ligne se remplit d'après la largeur
          *souhaitée* des éléments, jamais d'après leur largeur réduite. Une tuile de 132
          pixels débordait donc de trente pixels à quatre objectifs et passait à la ligne
          entière — 206 pixels de plus, et l'onglet recommençait à défiler. À 56 pixels,
          quatre cartes de 248 et la tuile tiennent sur une ligne. Sans aucun objectif, la
          place ne manque pas et la tuile reprend sa taille pleine, avec son texte : c'est
          alors le seul élément de l'écran, il doit se dire. */}
      {onAjouter && (
        <button type="button" onClick={onAjouter}
          title="Ajouter un objectif" aria-label="Ajouter un objectif"
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 5, cursor: "pointer",
            height: 196,
            flex: objectifs.length === 0 ? "0 0 248px" : "0 0 56px",
            borderRadius: 18, border: `1px dashed ${CLAIR.bord}`,
            background: "transparent", color: CLAIR.texteFaible, fontFamily: FONT,
            boxSizing: "border-box",
          }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          {objectifs.length === 0 && (
            <span style={{ fontSize: 11, textAlign: "center", padding: "0 10px" }}>
              Créer un objectif
            </span>
          )}
        </button>
      )}
    </div>
  );
}
