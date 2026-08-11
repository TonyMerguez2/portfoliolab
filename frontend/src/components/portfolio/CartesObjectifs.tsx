"use client";
import { useState } from "react";

import TileCard from "@/components/TileCard";
import type { Objectif } from "@/lib/objectifs";
import {
  dureeEnClair, echeanceEnClair, ecartAuRythme, euros, libelleCible, montantCible,
  pourcentageLisible,
} from "@/lib/objectifs";
import { JETONS, RAYONS } from "@/lib/palette";
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

/** Le côté de l'icône, aligné sur celui du logo d'une carte d'actif. */
const COTE_ICONE = 28;

/**
 * L'icône du genre, simplement posée.
 *
 * ⚠️ **Deux essais plus élaborés ont été écartés, dans cet ordre.** Un glyphe *gravé* —
 * tracé sombre surmonté d'une copie claire décalée — demande une lumière franche pour se
 * lire : sur une carte translucide dont le fond varie d'un angle à l'autre, il ressemblait à
 * un dessin flou. Puis le même glyphe *semé* en filigrane sur toute la carte : lisible, mais
 * c'était un monogramme, et une carte qui porte déjà quatre chiffres n'a pas besoin d'un
 * motif de plus. Reste une icône.
 *
 * ⚠️ **Le trait est clair, non de la couleur de l'objectif.** Le fond de la carte porte déjà
 * cette couleur : un tracé de la même teinte s'y dissoudrait. La couleur est dite quatre
 * fois ailleurs — fond, liseré, jauge, pourcentage — l'icône n'a qu'à être lisible.
 */
function IconeGenre({ genre }: { genre: Objectif["genre"] }) {
  return (
    <svg width={COTE_ICONE} height={COTE_ICONE} viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.82)" strokeWidth={1.7} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}>
      <path d={GLYPHE[genre]} />
    </svg>
  );
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

      {/* Identité */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <IconeGenre genre={o.genre} />
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

/**
 * La carte vide qui ferme la rangée, et par laquelle on ajoute un objectif.
 *
 * ⚠️ **Une carte de plein format, et non la bande étroite qu'elle était.** Cette bande de
 * 56 pixels répondait à une contrainte de place : avec `flex-wrap`, une ligne se remplit
 * d'après la largeur *souhaitée* des éléments et jamais d'après leur largeur réduite, si
 * bien qu'une tuile large renvoie tout à la ligne dès que la rangée est pleine. Le compromis
 * a été tranché dans l'autre sens : une carte se lit comme un emplacement libre à remplir,
 * une bande se lit comme un bouton de barre d'outils.
 *
 * ⚠️ **Conséquence assumée, et mesurée** : à partir de quatre objectifs sur une rangée de
 * 1 134 pixels, cette carte passe à la ligne suivante et l'onglet se met à défiler. C'est le
 * prix du plein format, et il ne se paie qu'au-delà de quatre objectifs.
 *
 * ⚠️ **Discrète, donc aucune peau de tuile.** Pas de `TileCard` ici : ses lavis de couleur
 * et son liseré dégradé donneraient à un emplacement vide autant de présence qu'à un objectif
 * réel. Un trait pointillé et un signe suffisent — et le pointillé dit à lui seul « rien
 * encore ici ».
 */
function CarteAjout({ vide, onAjouter }: { vide: boolean; onAjouter: () => void }) {
  const [survol, setSurvol] = useState(false);

  return (
    <button type="button" onClick={onAjouter}
      title="Ajouter un objectif" aria-label="Ajouter un objectif"
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 8, cursor: "pointer",
        // Les dimensions d'une carte d'objectif, au pixel près.
        height: 196, flex: "0 0 248px",
        borderRadius: 18, boxSizing: "border-box",
        border: `1px dashed rgba(255,255,255,${survol ? 0.22 : 0.11})`,
        background: survol ? "rgba(255,255,255,0.022)" : "transparent",
        color: "rgba(255,255,255,0.42)", fontFamily: FONT,
        transition: "border-color 200ms, background 200ms",
      }}>
      {/* Un signe tracé plutôt que le caractère « + » : la croix d'une police est calée sur
          une ligne de base et n'est pas centrée dans sa boîte, ce qui la posait deux pixels
          haut. Deux segments sont centrés par construction, et leur épaisseur se règle. */}
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true"
        style={{ opacity: survol ? 1 : 0.72, transition: "opacity 200ms" }}>
        <path d="M12 6v12M6 12h12" />
      </svg>

      {/* ⚠️ Un intitulé au seul écran vide. La demande est « juste un plus », et elle a
          raison dès qu'une carte voisine montre de quoi il s'agit : le signe se comprend par
          contagion. Sans aucun objectif, il n'y a rien alentour dont il puisse tenir son
          sens, et une carte pointillée muette laisserait deviner. */}
      {vide && (
        <span style={{ fontSize: 11.5, letterSpacing: "0.01em" }}>Créer un objectif</span>
      )}
    </button>
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
    <div className="novac-rail" style={{
      // ⚠️ **Une seule rangée, qui se resserre au lieu de passer à la ligne.** Avec
      // `flex-wrap: wrap`, une ligne se remplit d'après la largeur *souhaitée* des éléments
      // et jamais d'après leur largeur réduite : à quatre objectifs plus la tuile
      // « Ajouter », la rangée débordait de trente-quatre pixels et se dédoublait — 402 de
      // haut au lieu de 196, mesuré, soit la moitié de ce qui empêchait l'onglet de tenir
      // sur un écran.
      //
      // En `nowrap`, les cinq restent sur une ligne et se partagent la place : 241 pixels
      // chacun au lieu de 248, un écart qui ne se voit pas. Le défilement horizontal ne sert
      // qu'au-delà de ce que la largeur minimale permet — le même repli que le rail
      // d'actifs, dont cette rangée reprend la classe pour masquer la barre.
      display: "flex", flexWrap: "nowrap", gap: 10, alignItems: "stretch",
      overflowX: "auto", overflowY: "hidden",
    }}>
      {objectifs.map(o => <Carte key={o.id} o={o} onModifier={onModifier} />)}

      {onAjouter && <CarteAjout vide={objectifs.length === 0} onAjouter={onAjouter} />}
    </div>
  );
}
