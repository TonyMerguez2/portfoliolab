"use client";
import { useEffect, useMemo, useState } from "react";

import { FAMILLE_AVATAR } from "@/components/AvatarNovac";
import Cadre from "@/components/ui/Cadre";
import {
  aideALaDecision, confianceEnClair, couperMetrique,
  type Contexte, type Insight,
} from "@/lib/aideDecision";
import {
  COULEUR_PAR_DEFAUT, OMBRES_CREUX, bordCarte, couleurDesYeux, encre, fondCreux,
  refletCarte,
} from "@/lib/avatarCouleur";
import { hexVersRvb } from "@/lib/couleur";
import { ARRONDI_REFERENCE, OEIL_REFERENCE, TAILLE_REFERENCE } from "@/lib/avatarReglages";
import { RAYON_TETE, cheminOeil } from "@/lib/avatarSpherique";
import { solideDepuis } from "@/lib/avatarVolume";

import { type Objectif } from "@/lib/objectifs";
import { type FormeAvatar } from "@/lib/useCouleurAvatar";
import { FONT, NUM } from "@/lib/typography";

/**
 * Des interprétations chiffrées sur l'objectif projeté — jamais des conseils.
 *
 * ⚠️ **Ce panneau occupe l'emplacement des « Recommandations IA » de la maquette**, qui
 * proposait « augmenter votre investissement mensuel à 1 000 € », « réduire l'exposition
 * aux actions à 70 % ». C'est du conseil en investissement personnalisé, que ce logiciel ne
 * produit pas. Ce qui suit est arithmétique, et chaque phrase se recompte à la main.
 *
 * ⚠️ **Le titre nomme la fonction du panneau, pas une parole du logiciel.** « Aide à la
 * décision » est vrai : les lignes servent à trancher — ce que valent cent euros de plus,
 * quel rythme exigerait l'échéance, quel levier commande. « Recommandations » serait faux,
 * puisqu'aucune ne dit quoi faire ; « Insight IA » le serait autrement, puisque rien ici
 * n'est produit par un modèle.
 *
 * ⚠️ **La mention « un calcul que vous pouvez refaire » a été retirée du panneau**, sur
 * demande, l'avertissement de non-conseil devant vivre dans les conditions d'utilisation du
 * site. Ce qui la remplaçait n'était de toute façon pas elle : ce sont le titre — « Aide à la
 * décision », et non « Recommandations » — et la forme conditionnelle des phrases, tenue par
 * un test qui échoue sur tout impératif. Ne pas la remettre ici en croyant combler un oubli.
 *
 * ⚠️ **Une aide à la fois, et non une liste.** Quatre phrases empilées se lisent en diagonale
 * et se valent toutes ; une seule, en grand, se lit. La navigation par points rend le nombre
 * visible sans occuper de place, et laisse l'épargnant parcourir à son rythme. Aucun
 * défilement automatique : un texte qui bouge tout seul se lit deux fois moins bien.
 */

/**
 * La carte porte **exactement** la couleur de l'avatar, et son encre s'en déduit.
 *
 * ⚠️ **Un voile ne suffisait pas.** La teinte à un dixième était invisible : sur la
 * capture, la carte restait bleu nuit comme ses voisines et rien ne la rattachait au
 * portefeuille. Elle prend donc la couleur pleine — c'est la même tête, en grand.
 *
 * ⚠️ **Et cela oblige à recalculer toutes les couleurs de texte.** Un fond quelconque
 * n'est ni clair ni sombre : les jetons du thème, réglés pour le fond des cartes, y
 * deviennent illisibles dès que l'utilisateur choisit une couleur claire — du gris pâle
 * sur de la crème. L'encre se déduit donc du fond par la **même règle que les yeux de
 * l'avatar**, qui garantit trois pour un et bascule du sombre au clair quand la tête est
 * trop foncée. La carte et le visage partagent alors leur contraste : ce qui est lisible
 * sur l'un l'est sur l'autre, par construction.
 */

/** La hauteur des yeux dans le panneau, en pixels. */
const HAUTEUR_YEUX = 26;

/** Le corps du titre d'une aide, et la hauteur morte au-dessus de ses lettres. */
const TAILLE_TITRE_AIDE = 16;
const HAUT_ENCRE_TITRE = +(0.152 * TAILLE_TITRE_AIDE).toFixed(2);

/**
 * La navigation entre les aides, en points.
 *
 * ⚠️ Des boutons et non des pastilles décoratives : chacun porte son intitulé pour un lecteur
 * d'écran, et la tabulation les atteint. Une pagination qu'on ne peut pas atteindre au clavier
 * cache purement et simplement les aides suivantes.
 */
function Points({ nombre, courant, onChoisir, fond }: {
  nombre: number; courant: number; onChoisir: (i: number) => void;
  /** Le fond de la carte : les points s'y encrent comme le reste du texte. */
  fond: string;
}) {
  return (
    <div role="tablist" aria-label="Aides disponibles"
      style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto",
        flexShrink: 0 }}>
      {Array.from({ length: nombre }, (_, i) => {
        const actif = i === courant;
        return (
          <button key={i} type="button" role="tab" aria-selected={actif}
            aria-label={`Aide ${i + 1} sur ${nombre}`}
            onClick={() => onChoisir(i)}
            style={{
              // Le point actif s'allonge au lieu de seulement s'éclaircir : la position se
              // repère alors du coin de l'œil, sans comparer des luminosités.
              width: actif ? 16 : 6, height: 6, borderRadius: 999,
              border: "none", padding: 0, cursor: "pointer",
              background: actif ? encre(fond, 0.95) : encre(fond, 0.3),
              transition: "width 220ms, background 220ms",
            }} />
        );
      })}
    </div>
  );
}

/**
 * ⚠️ **Cette carte ne connaît plus les objectifs — elle ne connaît que des constats.**
 * Elle a été écrite pour eux, puis le portefeuille a demandé « exactement le même style ».
 * Recopier trois cent soixante-dix lignes de mise en page, dont des compensations d'encre
 * mesurées au canevas, les aurait condamnées à diverger au premier ajustement de l'une des
 * deux. Ce qui reste ici est la coquille ; ce qui parle d'un objectif est reparti dans
 * `ConstatsObjectif`.
 */
export default function CarteConstats({
  titre, etiquette, aides, cleReinit, texteVide, apres,
  couleurAvatar, formeAvatar, skinAvatar,
}: {
  /** Ce que la carte annonce — « Aide à la décision », « Constats ». */
  titre: string;
  /** Le sujet dont elle parle, dans une pastille à côté du titre. */
  etiquette?: string;
  /**
   * Les constats à faire défiler.
   *
   * ⚠️ **Un type plus étroit que `Insight`, à dessein.** La carte n'a besoin que de ce
   * qu'elle affiche ; l'exiger entier obligerait tout appelant à se doter d'une famille,
   * d'une priorité et d'un sujet qui ne servent qu'au classement des insights d'objectif.
   * Le typage structurel fait qu'un `Insight[]` reste accepté tel quel.
   */
  aides: {
    titre: string;
    description: string;
    metrique?: { libelle: string; valeur: string };
    /** De 0 à 1 : la complétude des données, jamais une probabilité. */
    confiance: number;
    /** Ce sur quoi le constat s'appuie, montré au survol du pied. */
    motifs: string[];
    /**
     * Les entrées du calcul, écrites sous le constat.
     *
     * ⚠️ **Un chiffre sans ses entrées n'est pas vérifiable** : « atteint en 2043 » ne veut
     * rien dire sans « à 800 €/mois et 7 %/an ». Un constat qui ne repose sur aucune
     * hypothèse — une simple division de chiffres à l'écran — en rend une liste vide, et
     * la ligne disparaît.
     */
    hypotheses: string[];
  }[];
  /**
   * ⚠️ **Ce qui fait revenir à la première page.** Un objectif de capital propose quatre
   * aides, un plafond deux : rester sur la quatrième en changeant de sujet laisserait un
   * panneau vide. La carte ne sait pas ce qui a changé — on le lui dit.
   */
  cleReinit?: string | number | null;
  /** Ce qu'elle dit quand elle n'a rien à dire. Un vide sans motif se lit comme une panne. */
  texteVide: string;
  /**
   * Ce qu'on ajoute sous le pied — des réglages, un lien.
   *
   * ⚠️ **Reçoit l'encre de la carte, et ce n'est pas une commodité.** Cette carte porte la
   * couleur du portefeuille, pas celle du thème : tout ce qu'on y pose avec les jetons
   * habituels — `CLAIR.texte`, `CLAIR.accent` — s'y délave. Vu à l'écran, un pied de
   * réglages devenu illisible sur un fond indigo. La fonction rend la teinte lisible sur ce
   * fond-là, à l'opacité demandée, exactement comme le reste du composant s'en sert.
   */
  apres?: (encreCarte: (alpha: number) => string) => React.ReactNode;
  /**
   * L'apparence de l'avatar du portefeuille — la même que dans l'en-tête.
   *
   * ⚠️ **Passée, et non relue depuis le stockage.** La carte ne connaît pas le
   * portefeuille, et lui donner de quoi le chercher ferait deux sources pour un même
   * réglage : on a déjà vu la couleur et la courbe de performance se désaccorder ainsi.
   */
  couleurAvatar?: string;
  formeAvatar?: FormeAvatar;
  skinAvatar?: string;
}) {
  const fond = couleurAvatar ?? COULEUR_PAR_DEFAUT;
  /**
   * ⚠️ **Les trois anneaux suivent la carte, sinon ils la dénoncent.** C'est la règle des
   * deux thèmes, appliquée telle quelle : le cadre extérieur **est** la couleur de la
   * carte — `--nv-cadre` vaut `--nv-carte` en sombre comme en clair —, son voile est cette
   * couleur à moitié, et seul le liseré intérieur s'en écarte, de sept points de clarté
   * perçue. L'anneau extérieur ne se voit donc jamais : il ne fait que ménager six pixels
   * autour de la carte.
   */
  const anneaux = useMemo(() => {
    const [r, v, b] = hexVersRvb(fond);
    return {
      cadre: fond, voile: `rgba(${r}, ${v}, ${b}, 0.5)`,
      bord: bordCarte(fond), reflet: refletCarte(fond),
    };
  }, [fond]);

  /**
   * Les deux yeux, seuls — sans tête.
   *
   * ⚠️ **Ce sont les vrais yeux, pas un pictogramme qui leur ressemble.** Ils sortent de
   * la même chaîne que ceux de l'avatar : dessinés à plat, transportés sur le volume,
   * reprojetés. Deux capsules écrites à la main auraient l'air juste au repos et
   * dériveraient au premier réglage — l'écartement, l'arrondi et la hauteur de l'œil
   * vivent dans `avatarReglages`, et c'est là qu'ils doivent continuer de vivre.
   *
   * ⚠️ **Et ils prennent la forme du portefeuille.** L'œil d'un cube n'est pas celui
   * d'une sphère : il est peint sur une face plate, donc moins courbé. Le détail est
   * ténu à cette taille, mais le contraire aurait été un second dessin à maintenir.
   */
  const yeux = useMemo(() => {
    const s = solideDepuis(FAMILLE_AVATAR[formeAvatar ?? "sphere"], ARRONDI_REFERENCE);
    const oeil = (cote: -1 | 1) => cheminOeil({
      ecart: OEIL_REFERENCE.ecart * TAILLE_REFERENCE,
      elevation: OEIL_REFERENCE.elevation * TAILLE_REFERENCE,
      largeur: OEIL_REFERENCE.largeur * TAILLE_REFERENCE,
      hauteur: OEIL_REFERENCE.hauteur * TAILLE_REFERENCE,
      inclinaison: 0,
      arrondi: 1,
    }, { lacet: 0, tangage: 0 }, cote, RAYON_TETE, 96, s);
    const traces = [oeil(-1), oeil(1)];
    /**
     * ⚠️ **Le cadre est recalé sur les yeux, pas sur la tête.** Gardé au repère de
     * l'avatar, un carré de deux cents unités, la paire n'en occupe que quatre-vingts de
     * haut : à vingt-six pixels de côté elle en rendait dix, deux traits perdus dans du
     * vide. Recadrée sur son propre encombrement, elle se lit à la taille qu'on lui donne.
     * Le cadre se mesure sur le tracé réel plutôt que sur les réglages, sinon il faudrait
     * refaire le calcul à chaque changement d'écartement ou d'arrondi.
     */
    const n = traces.join(" ").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0, 0];
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    const marge = 2;
    const x = Math.min(...xs) - marge, y = Math.min(...ys) - marge;
    const l = Math.max(...xs) - x + marge, h = Math.max(...ys) - y + marge;
    return { traces, boite: `${x} ${y} ${l} ${h}`, rapport: l / h };
  }, [formeAvatar]);

  const [page, setPage] = useState(0);

  // ⚠️ **Le retour à la première aide au changement d'objectif est indispensable.** Un
  // objectif de capital en propose quatre, un plafond deux : rester sur la quatrième en
  // basculant vers le plafond laisserait un panneau vide. Le `Math.min` ci-dessous couvre le
  // même risque pendant le rendu, avant que l'effet ne s'exécute.
  useEffect(() => { setPage(0); }, [cleReinit]);
  const index = Math.min(page, Math.max(0, aides.length - 1));
  const aide = aides.length > 0 ? aides[index] : null;

  return (
    // ⚠️ **Le cadre commun de la page, liseré sombre compris.** Un rebord de verre a été
    // essayé ici — un anneau conique de gris métalliques, à l'épaisseur exacte du bord
    // composite des voisins — puis retiré : il *remplaçait* le liseré, et singularisait le
    // panneau en permanence. Ce qui court dessus maintenant est un arc court : le bord reste
    // celui des voisins la plus grande partie du temps, et l'éclat ne fait que passer. Voir
    // `.novac-bord-defilant` dans globals.css, où tient toute la mécanique.
    <Cadre classeCadre="novac-verre-defilant" teinte={anneaux} style={{
      /**
       * ⚠️ **`0 0 auto` : il prend sa hauteur, ni plus ni moins — et il grandissait avant.**
       * En `1 0 auto` il absorbait toute la hauteur libre de sa colonne, ce qui avait un
       * sens quand ce vide n'allait nulle part ailleurs. Mesuré sur la page : la carte
       * faisait **593 pixels** pour un contenu qui en réclame 213, soit trois cent quatre-
       * vingts pixels de vide à l'intérieur d'un cadre — signalé à l'usage. La place libre
       * revient désormais à « Progression globale », qui a de quoi l'employer puisqu'elle
       * défile.
       *
       * ⚠️ **Le plancher est remesuré, et il avait vieilli.** Deux cent quarante-quatre
       * pixels dataient d'une typographie plus grosse — paragraphe à 12,5, bloc du chiffre
       * centré. Avec les corps actuels, la plus haute des aides réclame 213 pixels entre
       * 420 et 460 de large, et 230 au cas le plus étroit mesuré, 400 : le texte y enroule
       * d'une ligne de plus. C'est cette valeur-là qui est retenue, puisque le plancher
       * existe pour que le panneau ne saute pas d'une aide à l'autre — il doit donc couvrir
       * la plus haute, pas la moyenne.
       */
      flex: "0 0 auto",
      /**
       * ⚠️ **Le plancher vaut pour la colonne large ; la carte sert aussi une étroite.** Les
       * 230 pixels ont été mesurés sur le panneau des objectifs, entre 400 et 460 de large.
       * Sur la colonne du résumé — 296 —, le texte enroule davantage et la carte dépasse
       * d'elle-même ce plancher : il ne fait alors rien, ce qui est le comportement voulu
       * d'un minimum.
       */
      minHeight: 230,
      display: "flex", flexDirection: "column", gap: 10,
      padding: "13px 15px",
      /**
       * ⚠️ **La carte porte la couleur du portefeuille, pas celle du thème — donc elle ne
       * suit plus le mode clair ni le sombre.** C'est assumé : cette carte-là dit à qui
       * elle appartient, et son encre se déduit du fond pour rester lisible dans les deux
       * modes. Toutes les autres couleurs de ce fichier passent par `encre`, précisément
       * pour que ce choix ne coûte rien ailleurs.
       */
      background: fond,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {/* ⚠️ Même corps et même graisse que tous les titres de carte — 12,5 px, 600 —, seule
            l'encre reste déduite du fond teinté. Il était en 15 px gras, le seul de la page. */}
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, flexShrink: 0, lineHeight: "17px",
          color: encre(fond, 1) }}>
          {titre}
        </span>
        {/**
          * ⚠️ **Le nom de l'objectif dans une pastille, et non en gris à côté du titre.**
          * Posé nu, il se lit comme la suite de la phrase — « Aide à la décision Liberté ».
          * Le fond le détache comme ce qu'il est : une étiquette, le sujet dont la carte
          * parle. Il se teinte de l'encre à un dixième, donc il suit la couleur de la carte
          * sans jamais avoir à être choisi.
          */}
        {etiquette && (
          <span style={{ fontFamily: FONT, fontSize: 10.5, minWidth: 0,
            color: encre(fond, 0.8), background: encre(fond, 0.12),
            padding: "3px 9px", borderRadius: 999, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {etiquette}
          </span>
        )}
        {aides.length > 1 && (
          <Points nombre={aides.length} courant={index} onChoisir={setPage} fond={fond} />
        )}
      </div>

      {aide == null ? (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.55,
          color: encre(fond, 0.78) }}>
          {texteVide}
        </p>
      ) : (
        // ⚠️ **La rangée ne prend que sa hauteur, et reste ancrée sous le titre.** Elle a été
        // centrée verticalement un temps, quand le panneau a gagné 90 pixels : le texte
        // flottait alors au milieu, et sa position bougeait avec le nombre de lignes — une
        // phrase courte se posait plus bas qu'une longue. Ancré en haut, le point de départ ne
        // dépend plus de rien : la phrase commence toujours au même endroit et s'allonge vers
        // le bas. Le vide restant passe sous elle, absorbé par la marge automatique du pied.
        //
        // La hauteur minimale reste : elle tient la rangée quand une aide n'a qu'une ligne.
        <div style={{ display: "flex", gap: 10, minHeight: 84, minWidth: 0 }}>
          {/**
            * La bulle — un essai, pour voir ce que donne une parole attribuée.
            *
            * ⚠️ **La pointe monte vers l'avatar du titre, elle ne part pas d'à côté.** Une
            * bulle sans direction n'est qu'un cadre arrondi : ce qui attribue la phrase,
            * c'est le petit triangle qui désigne le locuteur. Il est donc placé en haut à
            * gauche, à l'aplomb exact de la tête, et non au milieu du bord.
            *
            * ⚠️ **Un fond très pâle plutôt qu'un cadre clair.** Le panneau est un ciel
            * presque noir ; un contour blanc y découperait une fenêtre et couperait le
            * texte du fond étoilé. Six pour cent de blanc suffisent à lever la bulle sans
            * fermer le ciel derrière elle.
            */}
          {/**
            * ⚠️ **Les yeux seuls, sans tête et sans bulle.** L'avatar entier signait le
            * panneau, la bulle lui attribuait la phrase : deux façons de dire que quelqu'un
            * parle, alors que ce panneau ne fait que compter. Les yeux gardent la présence
            * — on sait à qui appartient l'application — sans la promesse de parole que le
            * titre refuse depuis toujours. C'est aussi la version la plus sobre : deux
            * traits contre un cadre, une pointe et un visage.
            *
            * ⚠️ **Ils sont plaqués contre le haut du texte.** Centrés, ils descendaient avec
            * la longueur de la phrase et se retrouvaient au milieu du paragraphe, ce qui se
            * lit comme une décoration posée là ; alignés sur la première ligne, ils
            * regardent le titre de l'aide.
            */}
          {/**
            * ⚠️ **La clé porte l'aide affichée, et c'est elle qui rejoue le clignement.**
            * Une animation CSS ne se relance pas parce qu'on repose la même classe : le
            * navigateur la considère déjà en cours. Changer la clé remonte l'élément, donc
            * l'animation repart à zéro — deux chemins à reconstruire, ce qui ne coûte rien,
            * et surtout aucun état d'animation à tenir dans le composant.
            */}
          <svg key={index} className="novac-clignement"
            viewBox={yeux.boite} height={HAUTEUR_YEUX}
            width={(HAUTEUR_YEUX * yeux.rapport).toFixed(1)} aria-hidden="true"
            // Les yeux se posent sur la même ligne que les lettres du titre.
            style={{ display: "block", flexShrink: 0, marginTop: HAUT_ENCRE_TITRE }}>
            {yeux.traces.map((d, i) => <path key={i} d={d} fill={couleurDesYeux(fond)} />)}
          </svg>
          <div style={{ flex: 1, minWidth: 0, display: "flex",
            flexDirection: "column", gap: 5 }}>
            {/**
              * ⚠️ **Le titre passe à l'encre, et la priorité descend sur le chiffre.** Il
              * portait la couleur d'urgence ; sur la référence il est simplement écrit en
              * grand et en foncé, et c'est plus juste — une phrase entière en rouge se lit
              * comme une alarme quand elle ne fait souvent que constater. La priorité n'est
              * pas perdue pour autant : elle passe sur la métrique, l'élément le plus
              * regardé de la carte, où une couleur se lit sans crier.
              */}
            <span style={{ fontFamily: FONT, fontSize: TAILLE_TITRE_AIDE, fontWeight: 700,
              lineHeight: 1.3, color: encre(fond, 1), letterSpacing: "-0.01em" }}>
              {aide.titre}
            </span>
            {/* ⚠️ Onze et demi, contre douze et demi : le paragraphe pesait autant que le
                titre qu'il explique. Il commente un constat, il ne le répète pas. */}
            <span style={{ fontFamily: FONT, fontSize: 11.5, lineHeight: 1.5,
              color: encre(fond, 0.86) }}>
              {aide.description}
            </span>
          </div>

          {/* ⚠️ **Le chiffre fort, 30 pixels, et les mois à 18.** Il est passé de 17 à 24 puis
              à 30, chaque fois en prenant de la place qui ne servait à rien : d'abord la largeur
              rendue par le paragraphe, ensuite la hauteur qui dormait au bas de la colonne.
              La coupe entre « 14 ans » et « 8 mois » vient de `couperMetrique`, qui explique
              pourquoi « 6 mois » seul, lui, reste entier.

              ⚠️ **Aucun anneau autour de lui.** Il en a porté un, qui tournait ; à cette taille
              de bloc le tour se lisait comme un indicateur de chargement, et une ligne claire à
              huit pixels des chiffres les concurrençait plus qu'elle ne les désignait. L'éclat
              est passé sur le bord du panneau. Ce qui distingue ce nombre est ce qui doit le
              distinguer : sa taille, sa graisse, et le blanc presque pur. */}
          {aide.metrique && (() => {
            const { fort, discret, genre } = couperMetrique(aide.metrique.valeur);
            /**
             * ⚠️ **Seule une durée composée fait rétrécir le nombre.** Elle porte deux
             * membres, donc deux fois plus de signes, et gonflait le bloc jusqu'à réduire
             * le paragraphe voisin à un ruban. Une unité en symbole — « % », « € » —
             * n'ajoute qu'un caractère : le nombre garde ses quarante pixels, et seul le
             * signe se fait menu.
             */
            const taille = genre === "duree" ? 28 : 40;
            const tailleRetrait = genre === "unite" ? Math.round(taille * 0.58) : 15;
            /**
             * ⚠️ **Une marge égale sur les quatre côtés ne donne pas un espace égal à
             * l'œil, et l'écart se mesure.** Une ligne de texte est plus haute que ses
             * lettres : au-dessus des capitales il reste la place des accents, en dessous
             * celle des jambages. Relevé sur Inter au canevas — la seule façon d'obtenir
             * les vraies extrémités d'encre plutôt que celles de la boîte de ligne — le
             * chiffre laisse **6,1 pixels** de vide au-dessus de lui à quarante, et le
             * libellé n'en laisse que **2,4** en dessous. Un rembourrage uniforme donnerait
             * donc 3,7 pixels de plus en haut qu'en bas, ce qui se voit très bien sur un
             * bloc de cette taille.
             *
             * Les deux coefficients viennent de cette mesure et valent pour toute taille :
             * l'encre du chiffre commence à 0,152 fois son corps sous le haut de sa ligne,
             * celle du libellé s'arrête à 0,24 fois le sien au-dessus du bas. On retranche
             * donc ces hauteurs mortes du rembourrage, et l'espace vu devient le même.
             *
             * ⚠️ **Il reste l'approche latérale des glyphes, et elle ne se rattrape pas.**
             * Mesurée de 0,5 à 3,6 pixels selon la chaîne — le « % » en laisse plus à sa
             * droite que le « 9 » à sa gauche —, elle dépend de chaque caractère. Aucun
             * rembourrage ne peut l'égaliser pour toutes les valeurs à la fois ; on retire
             * sa moyenne, et le résidu reste sous deux pixels.
             */
            const VIDE = 14;
            const marge = {
              paddingTop: VIDE - 0.152 * taille,
              paddingBottom: VIDE - 0.24 * 10,
              paddingLeft: VIDE - 0.065 * taille,
              paddingRight: VIDE - 0.065 * taille,
            };
            return (
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "center",
                // ⚠️ **Comprimable, et non figé.** Vu à l'écran sur un panneau resserré à
                // 144 pixels : un bloc de largeur fixe débordait et le chiffre sortait du
                // cadre. `flex: 0 1` lui laisse céder ce qu'il faut sans jamais s'étirer.
                // Le rayon a suivi l'anneau : plus rien n'est peint ici, une valeur d'angle
                // n'y décrirait aucune forme.
                //
                // ⚠️ **La largeur vient du nombre, elle n'est plus imposée — et c'est la
                // correction d'une faute d'agencement.** Une base fixe de 200 pixels donnait
                // ceci, mesuré : bloc du chiffre 200, colonne de texte 198. « 93 % » réservait
                // autant de place que le paragraphe entier, qui enroulait alors sur six lignes
                // pendant que les deux tiers du bloc restaient vides. Le déséquilibre venait
                // de la conjonction des deux réglages : le texte est en `flex: 1`, base zéro,
                // donc il ne prend que ce qui *reste* une fois le chiffre servi.
                //
                // En base automatique, le bloc vaut son contenu : environ 90 pixels pour
                // « 93 % », 176 pour « 14 ans 8 mois ». Le texte récupère la différence.
                // `maxWidth` borne le cas d'une métrique inhabituellement longue, et le
                // `flex-shrink` à 1 reste indispensable — c'est un bloc infusible qui avait
                // fait sortir le chiffre du cadre sur un panneau resserré à 144 pixels.
                /**
                 * ⚠️ **Le maximum suit la largeur disponible depuis que la carte sert deux
                 * colonnes.** Fixé à 170 pixels, le bloc prenait plus de la moitié des 296
                 * du résumé : le paragraphe voisin tombait à une colonne de quelques mots et
                 * se faisait couper — vu à l'écran. En pourcentage, il garde son ampleur sur
                 * le panneau large des objectifs et s'efface là où la place manque.
                 */
                justifyContent: "center", flex: "0 1 auto", maxWidth: "45%", minWidth: 76,
                ...marge, boxSizing: "border-box",
                /**
                 * ⚠️ **Ancré en haut, et non centré sur la rangée.** Centré, le bloc se
                 * déplaçait avec la longueur du paragraphe voisin : une aide en trois
                 * lignes le posait plus bas qu'une aide en cinq, et d'une aide à l'autre le
                 * chiffre sautait. Accroché au haut de la rangée, son bord supérieur ne
                 * dépend plus que du titre, qui ne bouge pas — seule sa hauteur suit son
                 * contenu.
                 */
                alignSelf: "flex-start",
                /**
                 * ⚠️ **Aligné sur le haut des lettres du titre, pas sur le haut de sa
                 * ligne.** Le bloc et le titre commencent à la même hauteur de rangée,
                 * mais le titre est du texte : sa boîte de ligne dépasse ses capitales de
                 * la place réservée aux accents. Sans compensation, le creux paraissait
                 * monter plus haut que le titre qu'il accompagne. Le décalage vaut la même
                 * fraction que partout ailleurs — 0,152 fois le corps —, mesurée sur Inter
                 * au canevas.
                 */
                marginTop: HAUT_ENCRE_TITRE,
                /**
                 * ⚠️ **Le creux, et il a bien failli ne jamais exister.** Ces trois lignes
                 * ont été écrites une première fois, validées sur une maquette que j'avais
                 * composée à la main — et jamais posées sur le composant : le remplacement
                 * n'avait pas trouvé son ancre, et rien ne l'a dit. Le compilateur voyait
                 * deux imports inutilisés, ce qu'il tolère. Signalé à l'usage, capture à
                 * l'appui. Vérifier un rendu sur une reproduction, c'est vérifier la
                 * reproduction.
                 *
                 * ⚠️ **Un creux se fait plus sombre, pas plus contrasté.** L'encre diluée
                 * part vers le blanc sur une carte sombre : le bloc s'y lisait comme une
                 * bosse. La lumière vient d'en haut, donc ce qui s'enfonce s'assombrit,
                 * quelle que soit la couleur — on mélange vers le noir, toujours. Les deux
                 * ombres internes achèvent le relief : une portée depuis le bord haut, un
                 * liseré clair sur le bord bas.
                 */
                background: fondCreux(fond),
                borderRadius: 14,
                boxShadow: OMBRES_CREUX,
                marginLeft: 4 }}>
              {/**
                * ⚠️ **La taille suit la structure de la valeur, elle n'est pas fixe.** À
                * quarante pixels, « 93 % » s'impose comme il faut ; mais « 14 ans 8 mois »
                * porte deux parties, donc deux fois plus de signes, et le bloc gonflait
                * jusqu'à réduire le paragraphe voisin à un ruban de six mots par ligne — vu
                * à l'image. Une valeur en deux temps est longue **par construction** : elle
                * reçoit donc trente pixels, ce qui la laisse tenir sans écraser son voisin.
                */}
              {/**
                * ⚠️ **La partie forte est insécable, et c'est ce qui répare les valeurs
                * longues.** « 16 ans » porte une espace, donc le navigateur y coupait :
                * l'écran affichait « 16 » puis « ans 11 mois » à la ligne, la durée
                * disloquée en deux morceaux qui ne veulent rien dire séparément. Insécable,
                * elle est reportée entière et la coupure remonte là où elle a un sens —
                * « 16 ans » au-dessus, « 11 mois » en dessous. Le retrait portait déjà cette
                * marque ; il manquait au chiffre lui-même.
                *
                * ⚠️ **En noir, et non à la couleur de la priorité.** Une couleur d'urgence
                * sur le nombre le tirait vers l'alerte alors qu'il ne fait que mesurer. La
                * priorité se lit dans les mots du titre, qui la disent mieux qu'une teinte.
                */}
              <span style={{ ...NUM, fontSize: taille, fontWeight: 700,
                lineHeight: 1.06, whiteSpace: discret ? "nowrap" : "normal",
                color: encre(fond, 1), textAlign: "center",
                letterSpacing: "-0.02em" }}>
                {fort}
                {/* ⚠️ **Les mois en retrait, dans le même flux et non sur une ligne à part.**
                    Imbriqués, ils partagent la ligne de base et enroulent d'eux-mêmes quand la
                    largeur manque — « 14 ans » au-dessus, « 8 mois » en dessous. Un second bloc
                    forcerait ce retour même quand tout tient, comme pour « 18,5 % / an ».

                    ⚠️ **`nowrap` sur le retrait, et il a fallu le voir pour le comprendre.** Sans
                    lui, la coupure tombait à l'espace *intérieure* du groupe : l'écran affichait
                    « 14 ans 8 » puis « mois » à la ligne. Insécable, le groupe est reporté
                    entier et la coupure remonte là où elle a un sens. */}
                {discret && (
                  <span style={{ fontSize: tailleRetrait, fontWeight: 650, whiteSpace: "nowrap",
                    color: encre(fond, 0.78), letterSpacing: "-0.01em" }}>
                    {" "}{discret}
                  </span>
                )}
              </span>
              <span style={{ fontFamily: FONT, fontSize: 10, lineHeight: 1.3, marginTop: 3,
                color: encre(fond, 0.74), textAlign: "center" }}>
                {aide.metrique.libelle}
              </span>
            </div>
            );
          })()}
        </div>
      )}

      {/* ⚠️ **Les hypothèses et la confiance, sous chaque aide.** Un chiffre sans ses entrées
          n'est pas vérifiable : « atteint en 2043 » ne veut rien dire sans « à 800 €/mois et
          7 %/an ». Et la confiance s'écrit en mots, non en pourcentage : c'est la complétude
          des données et non une probabilité de réalisation, et un « 0,54 » se lirait comme la
          seconde. Le détail des motifs est au survol, pour ne pas alourdir la carte. */}
      {aide != null && (
        <div aria-label={aide.motifs.join(" · ")}
          style={{ marginTop: "auto", paddingTop: 10, display: "flex", alignItems: "center",
            gap: 7, minWidth: 0, borderTop: `1px solid ${encre(fond, 0.14)}` }}>
          {/**
            * Un bouclier : ce qui suit dit la solidité du calcul, pas son résultat.
            *
            * ⚠️ **Plein plutôt que tracé, et aligné sur la ligne de base du texte.** Un
            * contour à un pixel et demi se perdait à cette taille ; un aplat tient. Le
            * `flex` de la rangée le centre déjà verticalement, mais un glyphe plein paraît
            * toujours un cheveu trop haut à côté d'une capitale : le demi-pixel de
            * décalage le pose sur la ligne.
            */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill={encre(fond, 0.85)}
            aria-hidden="true"
            style={{ display: "block", flexShrink: 0, marginTop: 0.5 }}>
            <path d="m11.999 2.25.115.007.057.008.06.012.108.033a1 1 0 0 1 .212.11l.102.08.248.212a10.75 10.75 0 0 0 7.019 2.474l.334-.01a.98.98 0 0 1 .98.699 12.66 12.66 0 0 1-4.449 13.63 12.7 12.7 0 0 1-4.54 2.214 1 1 0 0 1-.49 0 12.7 12.7 0 0 1-7.855-6.02 12.66 12.66 0 0 1-1.135-9.824.975.975 0 0 1 .981-.699 10.75 10.75 0 0 0 7.352-2.464l.257-.22.094-.072a1 1 0 0 1 .212-.11l.11-.033a1 1 0 0 1 .115-.02zm3.621 7.11a.977.977 0 0 0-1.381 0l-3.215 3.21-1.262-1.26-.092-.08a.977.977 0 0 0-1.573.8c.008.248.11.484.285.66l1.952 1.95.092.08a.976.976 0 0 0 1.288-.08l3.905-3.9.081-.092a.974.974 0 0 0-.08-1.287" />
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, flexShrink: 0,
            color: encre(fond, 0.88) }}>
            {confianceEnClair(aide.confiance)}
          </span>
          {aide.hypotheses.length > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 10.5, lineHeight: 1.45, minWidth: 0,
              color: encre(fond, 0.7), overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap" }}>
              · {aide.hypotheses.join(" · ")}
            </span>
          )}
        </div>
      )}
      {/* ⚠️ **Sous le pied, jamais entre les constats.** Ce que l'appelant ajoute ici — des
          réglages, un lien — n'appartient pas au constat affiché : posé au-dessus, il
          changerait de sens en changeant de page. */}
      {apres?.(a => encre(fond, a))}
    </Cadre>
  );
}
