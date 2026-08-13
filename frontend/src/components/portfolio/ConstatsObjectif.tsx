"use client";
import { useEffect, useMemo, useState } from "react";

import { FAMILLE_AVATAR } from "@/components/AvatarNovac";
import Cadre from "@/components/ui/Cadre";
import {
  aideALaDecision, confianceEnClair, couperMetrique,
  type Contexte, type Insight, type Priorite,
} from "@/lib/aideDecision";
import {
  COULEUR_PAR_DEFAUT, OMBRES_CREUX, bordCarte, couleurDesYeux, encre, fondCreux,
  lisible,
} from "@/lib/avatarCouleur";
import { hexVersRvb } from "@/lib/couleur";
import { ARRONDI_REFERENCE, OEIL_REFERENCE, TAILLE_REFERENCE } from "@/lib/avatarReglages";
import { RAYON_TETE, cheminOeil } from "@/lib/avatarSpherique";
import { solideDepuis } from "@/lib/avatarVolume";

import { type Objectif } from "@/lib/objectifs";
import { type FormeAvatar } from "@/lib/useCouleurAvatar";
import { JETONS } from "@/lib/palette";
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

/**
 * La couleur d'une priorité.
 *
 * ⚠️ Discrète, et appliquée au seul titre. La priorité se lit d'abord dans les mots : un
 * panneau qui crie en rouge à chaque visite finit par n'être plus lu du tout.
 */
const TEINTE_PRIORITE: Record<Priorite, string> = {
  critique: JETONS.negatif,
  warning: JETONS.attention,
  positive: JETONS.positif,
  info: JETONS.accent,
};

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
            title={`Aide ${i + 1} sur ${nombre}`}
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

export default function ConstatsObjectif({
  objectif, valeurPortefeuille, medianeProjection, tousLesObjectifs,
  sommeDesParts, volatilite, volatiliteSource, seancesMesurees,
  couleurAvatar, formeAvatar, skinAvatar,
}: {
  objectif: Objectif | null;
  /**
   * L'apparence de l'avatar du portefeuille — la même que dans l'en-tête.
   *
   * ⚠️ **Passée, et non relue depuis le stockage.** Le panneau ne connaît pas le
   * portefeuille, et lui donner de quoi le chercher ferait deux sources pour un même
   * réglage : on a déjà vu la couleur et la courbe de performance se désaccorder ainsi.
   * La page tient l'apparence, elle la donne à qui l'affiche.
   */
  couleurAvatar?: string;
  formeAvatar?: FormeAvatar;
  skinAvatar?: string;
  valeurPortefeuille: number | null;
  /**
   * La médiane que le panneau de projection affiche.
   *
   * ⚠️ Transmise pour que les deux panneaux citent le **même** nombre. Sans elle, les
   * constats retombent sur la capitalisation déterministe du serveur, et l'écran montre
   * 373 261 € d'un côté et 362 986 € de l'autre pour la même grandeur.
   */
  medianeProjection?: number | null;
  /**
   * Les autres objectifs du portefeuille.
   *
   * ⚠️ Nécessaires à la seule interprétation qui ne tient pas dans un objectif : un plafond
   * de versements qui saturerait avant que les objectifs qu'il finance n'aboutissent. Ce
   * fait naît de la rencontre de deux cartes, donc aucune ne peut le porter seule.
   */
  tousLesObjectifs?: Objectif[];
  /** La somme des parts affectées, qui décide de l'insight de chevauchement. */
  sommeDesParts?: number | null;
  /** La volatilité mesurée du portefeuille, qui décide des insights de risque. */
  volatilite?: number | null;
  volatiliteSource?: string | null;
  seancesMesurees?: number | null;
}) {
  const contexte: Contexte = {
    valeurPortefeuille, sommeDesParts, autres: tousLesObjectifs,
    volatilite, volatiliteSource, seancesMesurees, mediane: medianeProjection,
  };
  const aides: Insight[] = aideALaDecision(objectif, contexte);

  /**
   * Le fond de la carte et son encre.
   *
   * ⚠️ **Les couleurs de priorité sont vérifiées contre le fond réel, pas supposées.**
   * Voir `lisible` : elles sont réglées pour le fond sombre des cartes et tombent sous la
   * barre sur dix des onze couleurs proposées.
   */
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
    return { cadre: fond, voile: `rgba(${r}, ${v}, ${b}, 0.5)`, bord: bordCarte(fond) };
  }, [fond]);
  const teintePriorite = (p: Priorite) => lisible(fond, TEINTE_PRIORITE[p]);

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
  useEffect(() => { setPage(0); }, [objectif?.id]);
  const index = Math.min(page, Math.max(0, aides.length - 1));
  const aide = aides.length > 0 ? aides[index] : null;

  return (
    // ⚠️ **Le cadre commun de la page, liseré sombre compris.** Un rebord de verre a été
    // essayé ici — un anneau conique de gris métalliques, à l'épaisseur exacte du bord
    // composite des voisins — puis retiré : il *remplaçait* le liseré, et singularisait le
    // panneau en permanence. Ce qui court dessus maintenant est un arc court : le bord reste
    // celui des voisins la plus grande partie du temps, et l'éclat ne fait que passer. Voir
    // `.novac-bord-defilant` dans globals.css, où tient toute la mécanique.
    <Cadre classeCarte="novac-bord-defilant" teinte={anneaux} style={{
      // ⚠️ **`1 0 auto` : il grandit, il ne rétrécit jamais.** Les trois termes comptent.
      // *Grandir* prend la place laissée libre au bas de la colonne — mesurée à 70 pixels
      // avant même le retrait de la mise en garde voisine, donc du vide qui ne servait à
      // personne. *Ne pas rétrécir* garde le comportement documenté d'à côté : sur une
      // fenêtre courte, c'est « Progression globale » qui absorbe, pas l'aide qu'on vient
      // lire. Et *base automatique* laisse le contenu décider du plancher.
      //
      // ⚠️ C'est aussi ce qui fixe la hauteur d'une aide à l'autre : dès lors qu'elle est
      // dictée par la colonne et non par le texte, elle ne dépend plus de la longueur de
      // la phrase affichée. Une hauteur en dur ferait la même chose au prix d'un débordement
      // sur les fenêtres courtes.
      flex: "1 0 auto",
      // ⚠️ **Un plancher mesuré, parce que « grandir » ne suffisait pas.** Sur une fenêtre
      // assez haute, la croissance fixe la hauteur et la longueur de la phrase n'y change
      // rien : 274 pixels pour les quatorze combinaisons d'objectif et d'aide, vérifié une à
      // une. Mais sur une fenêtre courte il n'y a plus de place à prendre, la hauteur retombe
      // sur le contenu — et le contenu, lui, varie : la rangée fait de 84 à 142 pixels selon
      // que la description tient en une ligne ou en cinq. Un panneau qui change de taille quand
      // on passe d'une aide à la suivante est exactement ce qu'on cherchait à éviter.
      //
      // 244 vient d'une addition, pas d'un tâtonnement : 101 pixels de partie fixe — les deux
      // rembourrages, les deux liserés, l'en-tête, le pied, les deux interlignes — plus la
      // rangée la plus haute, 142. Soit 243, et un pixel au-dessus. **C'est bien la hauteur du
      // cadre extérieur**, non celle de la carte : `minHeight` est une clé de placement, que
      // `Cadre` pose sur l'anneau, lequel ajoute 7 pixels de chaque côté. Un plancher de 232
      // pris sur la carte laissait le panneau grandir jusqu'à 243, et le saut restait — vu à
      // l'écran avant d'être corrigé.
      //
      // ⚠️ **Il valait 264, et l'élargissement de la colonne de texte l'a fait baisser.** Ce
      // n'est pas un ajustement cosmétique : chaque pixel de plancher est un pixel pris à
      // « Progression globale », qui défile déjà sur une fenêtre de 854. Le laisser à 264 aurait
      // gardé vingt pixels d'air ici pendant que la voisine rognait son contenu. Un plancher
      // doit valoir le contenu le plus haut, jamais davantage — donc il se recalcule chaque
      // fois que la mise en page du contenu change.
      //
      // ⚠️ **La rangée la plus haute dépend de la largeur de la carte**, puisque le texte
      // enroule : 123 pixels à 446 de large, 142 à 439. La valeur retenue est celle du cas le
      // plus étroit mesuré. Sur une carte plus étroite encore, le contenu passera au-dessus du
      // plancher et le panneau grandira : la progression absorbe, rien n'est rogné, on perd
      // seulement la constance.
      //
      // ⚠️ **Ce plancher a un prix, et il faut le connaître.** Sous 870 pixels de fenêtre
      // environ, la colonne n'a plus de quoi le payer sans rogner sa voisine : « Progression
      // globale » défile alors. C'est l'arbitrage déjà inscrit à côté — l'aide qu'on vient lire
      // reste entière, la progression cède — poussé à son terme. Si l'on préférait l'inverse,
      // c'est ce nombre qu'il faut baisser, au prix d'un saut d'une aide à l'autre.
      minHeight: 244,
      display: "flex", flexDirection: "column", gap: 10,
      padding: "14px 16px",
      /**
       * ⚠️ **La teinte se pose *par-dessus* le fond de la carte, elle ne le remplace pas.**
       * Écrite en `background`, elle effacerait le fond du thème et la carte cesserait de
       * suivre le mode clair ou sombre — un aplat opaque ne s'adapte à rien. Superposée en
       * dégradé plat sur `JETONS.carte`, elle teinte les deux modes sans qu'aucun ne soit
       * traité à part.
       */
      background: fond,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, flexShrink: 0,
          color: encre(fond, 1), letterSpacing: "-0.01em" }}>
          Aide à la décision
        </span>
        {/**
          * ⚠️ **Le nom de l'objectif dans une pastille, et non en gris à côté du titre.**
          * Posé nu, il se lit comme la suite de la phrase — « Aide à la décision Liberté ».
          * Le fond le détache comme ce qu'il est : une étiquette, le sujet dont la carte
          * parle. Il se teinte de l'encre à un dixième, donc il suit la couleur de la carte
          * sans jamais avoir à être choisi.
          */}
        {objectif && (
          <span style={{ fontFamily: FONT, fontSize: 10.5, minWidth: 0,
            color: encre(fond, 0.8), background: encre(fond, 0.12),
            padding: "3px 9px", borderRadius: 999, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {objectif.nom}
          </span>
        )}
        {aides.length > 1 && (
          <Points nombre={aides.length} courant={index} onChoisir={setPage} fond={fond} />
        )}
      </div>

      {aide == null ? (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.55,
          color: encre(fond, 0.78) }}>
          {objectif
            ? "Rien à interpréter sans échéance ni hypothèse de rendement : ce panneau ne "
              + "calcule que ce que vos paramètres permettent."
            : "Choisissez un objectif pour voir ce que vos chiffres impliquent."}
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
          <svg viewBox={yeux.boite} height={HAUTEUR_YEUX}
            width={(HAUTEUR_YEUX * yeux.rapport).toFixed(1)} aria-hidden="true"
            style={{ display: "block", flexShrink: 0, marginTop: 3 }}>
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
            <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700,
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
            const { fort, discret } = couperMetrique(aide.metrique.valeur);
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
                justifyContent: "center", flex: "0 1 auto", maxWidth: 170, minWidth: 76,
                padding: "10px 14px", boxSizing: "border-box", alignSelf: "center",
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
              <span style={{ ...NUM, fontSize: discret ? 30 : 40, fontWeight: 700,
                lineHeight: 1.04,
                color: teintePriorite(aide.priorite), textAlign: "center",
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
                  <span style={{ fontSize: 19, fontWeight: 650, whiteSpace: "nowrap",
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
        <div title={aide.motifs.join(" · ")}
          style={{ marginTop: "auto", paddingTop: 10, display: "flex", alignItems: "center",
            gap: 7, minWidth: 0, borderTop: `1px solid ${encre(fond, 0.14)}` }}>
          {/* Un bouclier : ce qui suit dit la solidité du calcul, pas son résultat. */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            stroke={encre(fond, 0.85)} strokeWidth={1.8} strokeLinecap="round"
            strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
            <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 8.5 4.1-.9 7-4.3 7-8.5V6z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, flexShrink: 0,
            color: encre(fond, 0.88) }}>
            {confianceEnClair(aide.confiance)}
          </span>
          {aide.hypotheses.length > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 9.5, lineHeight: 1.45, minWidth: 0,
              color: encre(fond, 0.7), overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap" }}>
              · {aide.hypotheses.join(" · ")}
            </span>
          )}
        </div>
      )}

    </Cadre>
  );
}
