"use client";
import {
  BASE_PAROLE, PLACE_PAROLE, type Morceau, parolePour, tailleMorceau, texteDe,
} from "@/lib/avatarDialogue";
import { tonFranc, tonRetenu } from "@/lib/avatarCouleur";
import { pourFond } from "@/lib/couleur";

/**
 * La parole du personnage, partout où il en a une.
 *
 * ⚠️ **Sorti du banc parce qu'ils sont deux à s'en servir.** Le banc la fait flotter au flanc
 * d'un dessin de 390 pixels ; le bandeau du portefeuille la range dans une rangée, à côté
 * d'un avatar de 63. Deux copies auraient divergé au premier réglage de la hiérarchie — et
 * cette divergence-là ne se voit pas, elle s'entend : le personnage n'aurait plus la même
 * voix selon la page.
 *
 * ⚠️ **Le composant ne se place pas lui-même.** Il rend un bloc, l'appelant décide où. Une
 * position absolue écrite ici aurait obligé le bandeau à la défaire, et un jour l'un des deux
 * aurait gagné contre l'autre.
 */

/** Ce que le composant reçoit. Voir chaque champ : aucun n'a de valeur évidente. */
export type ProprietesParole = {
  /** La clé d'état : c'est elle qui choisit la réplique. */
  etat: string;
  /** Le nom de l'épargnant, s'il y en a un. */
  pseudo?: string | null;
  /** La couleur du personnage — celle que la parole reprend. */
  couleur: string;
  /** Le fond sur lequel la parole se pose, pour mesurer que le ton retenu s'y lit. */
  fond: string;
  /** Le thème actif : la même teinte ne se corrige pas dans les deux sens. */
  clair: boolean;
  /** Le registre : ample au banc, compact dans une interface dense. */
  base?: number;
  /**
   * La largeur pour laquelle la parole est dessinée, en pixels.
   *
   * ⚠️ **C'est elle qui décide des tailles, et elle est un nombre.** Un mot trop long pour
   * cette largeur est rapetissé jusqu'à y tenir ; sans elle, le calcul se faisait sur la
   * largeur du banc — 132 pixels — alors que le bandeau n'en offre que 104, et déclarait donc
   * que tout tenait dans une place qui n'existait pas.
   */
  largeur?: number;
  /**
   * La borne CSS de l'enroulement, si le contenant en veut une autre.
   *
   * ⚠️ **Séparée de la largeur de dessin, parce que les deux répondent à des questions
   * différentes.** Celle-ci dit ce que le contenant *permet* — au banc, un `clamp` qui suit la
   * fenêtre ; l'autre dit ce pour quoi le texte est *dessiné*. Les confondre, c'était rendre
   * les tailles dépendantes de la largeur de la fenêtre, donc casser la règle même qui veut
   * que le corps ne suive pas le contenant.
   */
  place?: string;
  /** Le placement, qui n'appartient qu'à l'appelant. */
  style?: React.CSSProperties;
};

/**
 * Le décalage entre deux entrées, en millisecondes.
 *
 * ⚠️ Réglé à vue, puis borné par le plus long : trois morceaux à 90 ms font 180 ms d'attente
 * pour le dernier, ce qui se perçoit comme un enchaînement. À 150 on entend les morceaux se
 * détacher, et la parole traîne ; à 40 tout arrive ensemble et le décalage ne sert plus.
 */
const RETARD_MORCEAU = 90;

/**
 * Les trois traits d'éclat de la maquette.
 *
 * ⚠️ **Dessinés en SVG et non écrits en caractères.** Un « ✨ » dépend de la police d'émojis
 * du système : il change de dessin d'une machine à l'autre, arrive en couleurs imposées et
 * ne peut donc pas prendre celle du personnage. Trois traits tracés obéissent, et se
 * teintent comme le reste.
 *
 * ⚠️ **Trois longueurs inégales, en éventail.** Trois traits identiques se lisent comme un
 * symbole ; inégaux, ils se lisent comme un éclat. Le plus long au milieu, comme sur la
 * maquette.
 */
function Eclat({ couleur, retard, taille }: {
  couleur: string; retard: number; taille: number;
}) {
  return (
    <svg
      className="av-eclat" viewBox="0 0 40 40" width={taille} height={taille}
      aria-hidden style={{ position: "absolute", top: -6, right: 0, animationDelay: `${retard}ms` }}
    >
      <g stroke={couleur} strokeWidth={4.6} strokeLinecap="round" fill="none">
        <path d="M8 26 L12 8" />
        <path d="M21 24 L34 6" />
        <path d="M26 36 L38 30" />
      </g>
    </svg>
  );
}

/**
 * La parole du personnage : des morceaux typographiés, et rien autour.
 *
 * ⚠️ **Une bulle blanche à liseré, c'est de l'interface — pas une voix.** La première version
 * en portait une, avec sa pointe et son ombre : elle se lisait comme une infobulle du
 * logiciel posée à côté du dessin, alors qu'on veut ce que le personnage dit. Signalé à
 * l'usage. Le texte seul, en gras et **dans la couleur de la tête**, appartient au
 * personnage au lieu de le commenter — c'est la convention de la bande dessinée pour un
 * « zzZ », qui n'a jamais eu besoin d'un cadre pour se comprendre.
 *
 * ⚠️ **Deux tons de la même couleur, aucun blanc.** La maquette posait l'amorce en blanc ;
 * refusé à l'usage, et à raison — un blanc n'appartient à personne. `tonRetenu` garde la
 * teinte et retire de la présence, en mesurant qu'il reste lisible.
 *
 * ⚠️ **La clé porte le texte, ce qui rejoue toute la mise en scène.** Une animation CSS ne
 * repart pas parce qu'on repose la même classe ; remonter l'élément la relance. C'est ce qui
 * fait qu'un « zzZ » *arrive* au moment où la tête s'endort, au lieu d'être là depuis
 * toujours. Deux états qui disent la même chose — le focus et l'observation disent tous deux
 * « Je regarde » — ne la rejouent donc pas : rien n'a changé pour qui regarde.
 */
export default function AvatarParole({
  etat, pseudo, couleur, fond, clair, base = BASE_PAROLE,
  largeur = PLACE_PAROLE, place = `${largeur}px`, style,
}: ProprietesParole) {
  const parole = parolePour(etat, pseudo);
  /**
   * ⚠️ **La correction dépend du thème, pas seulement de la teinte.** `pourFondSombre` seul
   * convenait au banc, dont le panneau est noir en toute circonstance ; le bandeau, lui,
   * devient blanc en thème clair, et la même teinte doit alors s'assombrir au lieu de
   * s'éclaircir. `pourFond` porte les deux sens.
   *
   * ⚠️ **Mais `pourFond` ne vise aucun contraste, et cela ne se voyait pas depuis le banc.**
   * Il ramène une teinte dans une plage jugée lisible ; mesuré sur une carte blanche, le pire
   * des onze avatars y tombait tout de même à 1,87 pour un. `tonFranc` mesure et corrige
   * jusqu'au seuil — sans rien toucher sur fond sombre, où aucune des onze n'en a besoin.
   */
  const plein = tonFranc(pourFond(couleur, clair), fond);
  const sourd = tonRetenu(plein, fond);
  const envol = parole.genre === "envol";
  const taille = (m: Morceau) => tailleMorceau(m, base, largeur);
  /**
   * Les traits d'éclat ne paraissent que si la parole leur laisse un coin.
   *
   * ⚠️ **Ils se posent au coin haut-droit du bloc, qui n'est libre que sur deux lignes.**
   * C'est la disposition de la maquette : une amorce courte en haut, l'appui en dessous, et
   * l'éclat dans le vide que laisse la première ligne. Sur une seule ligne, ce vide n'existe
   * pas — le texte va jusqu'au bord — et les traits retombent **sur les dernières lettres**.
   * Vu à l'écran dans le bandeau : « Bonjour ! » sans pseudonyme tient sur une ligne, et son
   * point d'exclamation disparaissait sous l'éclat.
   *
   * ⚠️ **On les retire plutôt que de leur réserver une gouttière.** Réduire la largeur de
   * dessin de leur encombrement ferait rapetissier le texte sous la taille de lecture dans le
   * registre compact — mesuré, « Bonjour ! » y tomberait à quinze pixels. Un ornement ne
   * justifie pas qu'on abîme ce qu'il orne.
   */
  const orne = parole.eclat && parole.morceaux.some(m => m.saut);

  return (
    <div
      key={texteDe(parole)}
      style={{
        /**
         * ⚠️ **Un bloc, et l'appelant décide du reste.** Ce qui est écrit ici est ce qui ne
         * dépend d'aucun contexte : la graisse, l'interlignage, la façon dont un mot trop
         * long se coupe. Tout ce qui relève de la page — où la parole se pose, si elle
         * flotte ou prend son rang dans une rangée — arrive par `style` et passe après.
         *
         * ⚠️ **Sauf le `relative`, qui n'est pas un placement mais un ancrage.** Les traits
         * d'éclat sont posés en absolu sur le coin de ce bloc ; sans repère, ils
         * s'accrocheraient au premier ancêtre positionné venu et partiraient à l'autre bout
         * de la page. Il reste surchargeable — le banc y met un `absolute`.
         */
        position: "relative",
        width: "max-content", maxWidth: place,
        fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.015em",
        /**
         * ⚠️ Le pseudonyme est le seul morceau dont on ignore la longueur. Il se coupe
         * plutôt qu'il ne s'échappe : une césure moche reste lisible, un mot qui sort du
         * cadre ne l'est plus.
         */
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      {orne && (
        <Eclat couleur={plein} taille={base * 1.3}
          retard={parole.morceaux.length * RETARD_MORCEAU + 90} />
      )}
      {parole.morceaux.map((m, i) => (
        <span key={i}>
          {m.saut && <br />}
          <span
            className={envol ? "av-envol" : undefined}
            style={{
              display: "inline-block",
              // Le repos de l'envol : sa hauteur et son pivot, que le flottement reprend.
              ["--av-monte" as string]: `${-(m.monte ?? 0) * base}px`,
              ["--av-pivot" as string]: `${m.pivot ?? 0}deg`,
              // Les flottements se déphasent, sinon les trois « z » se balancent en bloc.
              animationDelay: `${i * RETARD_MORCEAU}ms`,
              /**
               * Une espace là où le texte brut en met une, et nulle part ailleurs.
               *
               * ⚠️ **Sauf l'envol, qui s'écarte sans que le texte change.** Trois « z »
               * posés à la seule chasse des glyphes se touchent presque, et leur diagonale
               * ne se lit plus ; un dixième de cadratin les détache. C'est un écart
               * *optique* — le texte brut reste « zzZ », sans espace, parce qu'un souffle
               * n'est pas trois mots.
               */
              marginLeft: i === 0 ? 0 : envol ? "0.1em" : m.saut || m.colle ? 0 : "0.26em",
            }}
          >
            <span
              className={envol ? "av-souffle" : "av-mot"}
              style={{
                fontSize: taille(m),
                color: m.sourd ? sourd : plein,
                animationDelay: `${i * RETARD_MORCEAU}ms`,
              }}
            >
              {m.texte}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
