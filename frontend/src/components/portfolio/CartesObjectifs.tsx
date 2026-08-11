"use client";
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

/** Le côté du glyphe. Plus grand qu'avant : sans logement, il porte seul l'identité. */
const COTE_GLYPHE = 24;

/**
 * Le glyphe du genre, gravé dans la carte.
 *
 * ⚠️ **Un creux, pas une pastille posée dessus.** Le logement porte une ombre interne en
 * haut et un filet clair en bas — l'œil lit une lumière venant du haut, donc une matière
 * enfoncée. Le tracé reprend le même principe à son échelle : une copie décalée d'un pixel
 * en blanc translucide passe **sous** le trait coloré, et c'est ce liseré du dessous qui
 * fait le relief.
 *
 * ⚠️ **Deux tracés et non un filtre.** `filter: drop-shadow` aurait donné le même relief,
 * mais un filtre SVG est rastérisé à la taille de sa boîte : sur une carte que la rangée
 * redimensionne, le contour devenait mou. Deux `<path>` restent vectoriels à tout
 * grossissement — et cette application se regarde à fort zoom.
 */
function GlypheGrave({ genre, couleur }: { genre: Objectif["genre"]; couleur: string }) {
  const d = GLYPHE[genre];
  return (
    <svg width={COTE_GLYPHE} height={COTE_GLYPHE} viewBox="0 0 24 24" fill="none"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}>
      {/* La lumière du dessous : c'est elle, et elle seule, qui fait le creux. Décalée d'un
          pixel — au-delà, le tracé se dédouble au lieu de s'enfoncer. */}
      <path d={d} stroke="rgba(255,255,255,0.34)" transform="translate(0 1)" />
      {/* ⚠️ **Le tracé est une version sombre de la couleur, non la couleur pleine.** C'est
          ce qui distingue un trait gravé d'un trait posé : une gravure ne réfléchit pas la
          lumière, elle la retient. Peint dans la teinte vive, le même dessin remontait à la
          surface et l'effet de creux disparaissait — seul le liseré clair du dessous
          subsistait, qu'on lisait alors comme une ombre portée.

          ⚠️ `color-mix` plutôt qu'un mélange calculé à la main : `couleur` peut valoir
          « var(--nv-accent) », dont on ne connaît pas les composantes ici. */}
      <path d={d} stroke={`color-mix(in srgb, ${couleur}, black 58%)`} />
    </svg>
  );
}

/** Combien de barreaux compose la jauge. */
const SEGMENTS = 34;

/**
 * L'avancement en barreaux, valeur à gauche et cible à droite.
 *
 * ⚠️ **Au moins un barreau allumé dès qu'un euro est placé.** Trois pour cent de
 * trente-quatre barreaux font 1,02 : arrondi à l'entier inférieur, un objectif entamé
 * paraîtrait entièrement vide. C'est le même défaut que « 0 % » affiché pour 0,11 %, déjà
 * corrigé dans `pourcentageLisible` — un avancement réel ne doit pas se lire comme un départ
 * non pris. On arrondit donc **vers le haut**, sauf à zéro exact.
 *
 * ⚠️ **Et jamais jusqu'au bout : le dernier barreau n'est réservé qu'à cent pour cent.**
 * Arrondir vers le haut sans borne ferait paraître pleine une jauge à 99 %, ce qui est le
 * symétrique exact du même mensonge.
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
  const allumes = p <= 0 ? 0
    : p >= 100 ? SEGMENTS
      : Math.max(1, Math.min(SEGMENTS - 1, Math.ceil((p / 100) * SEGMENTS)));

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
          const empli = i < allumes;
          return (
            <span key={i} style={{
              flex: 1, borderRadius: 1.5,
              height: empli ? 15 : 11,
              // ⚠️ **Le dégradé court sur les barreaux colorés, d'un bout à l'autre de la
              // part acquise.** Je l'avais d'abord ancré à la barre entière, en me disant
              // qu'une teinte fixe par position se vérifie mieux ; à trois pour cent
              // d'avancement, cela ne montrait qu'une seule extrémité du dégradé, donc aucun
              // dégradé. Et l'argument était creux : ce n'est pas la teinte qui porte
              // l'information — c'est le **nombre** de barreaux allumés. La couleur peut donc
              // servir l'œil sans rien prétendre.
              //
              // Le plus clair est en tête de progression : c'est là que le regard doit aller.
              //
              // ⚠️ `color-mix` et non une concaténation d'alpha : `couleur` peut valoir
              // « var(--nv-accent) », et `${couleur}80` serait une déclaration invalide
              // silencieusement ignorée — le défaut qui privait les cartes de leur teinte.
              background: empli
                // ⚠️ Un seul barreau allumé prend la teinte pleine, pas la plus sombre.
                // Vérifié en tabulant les bornes avant de regarder l'écran : la formule
                // générale donnait 28 % de noir à `i = 0`, or ce barreau unique est aussi la
                // tête de progression. Trois des six objectifs réels sont à un pour cent
                // d'avancement — le cas dégénéré était le cas courant.
                ? (allumes <= 1 ? couleur
                  : `color-mix(in srgb, ${couleur}, black ${
                    (28 * (1 - i / (allumes - 1))).toFixed(0)}%)`)
                : "rgba(255,255,255,0.09)",
              transition: "background 500ms, height 300ms",
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
        <GlypheGrave genre={o.genre} couleur={couleur} />
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
        <span style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(255,255,255,0.38)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {echeance ?? "sans échéance"}
        </span>
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
