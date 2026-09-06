"use client";
import TitreDeCarte from "@/components/ui/TitreDeCarte";
import { useEffect, useMemo, useRef, useState } from "react";
import { FONT, NUM } from "@/lib/typography";
import { type Analyse, type EtatAnalyse } from "@/lib/analyse";
import { BANDES as SEUILS_BANDES } from "@/lib/portfolio-score/types";
import Cadre from "@/components/ui/Cadre";
import DrapeauPays from "@/components/DrapeauPays";
import { JETONS, RAYONS } from "@/lib/palette";
import Segments from "@/components/ui/Segments";
import Mosaique from "@/components/portfolio/Mosaique";


/**
 * Analyse du portefeuille.
 *
 * Chaque score s'accompagne de la mesure qui le fonde : « 42 » ne veut rien
 * dire, « corrélation 0,58 en moyenne » se vérifie. Un indicateur sans données
 * l'annonce au lieu d'afficher un zéro qu'on prendrait pour une mesure.
 *
 * Rien n'est produit par un modèle de langage. Les observations sont des règles
 * sur des mesures, et les panneaux portent des noms qui le disent.
 */

const MARGE = 10;
const GOUTTIERE = 8;

/**
 * ⚠️ Le radar a été **retiré** de l'onglet, avec sa table d'abrégés.
 *
 * Il doublait l'information des cinq barres, qui portent en plus les chiffres, les
 * noms entiers et les poids — un radar dont les étiquettes ne tiennent pas ne dit rien
 * qu'une barre ne dise mieux. Et sa colonne fixe étouffait la mise en page : mesuré à
 * 800 px de large, elle faisait disparaître les cinq piliers du cadre.
 *
 * Le code est supprimé plutôt que laissé de côté : un composant gardé « au cas où »
 * cesse d'être maintenu tout en restant compilé.
 */


/**
 * Les cinq bandes du score.
 *
 * Elles servent d'encre — sur le chiffre, sur la pastille de légende — donc
 * elles se prennent au cran `fort`, seul cran garanti au-dessus de 4,5:1 dans
 * les deux thèmes. « Faible » était un orange Tailwind (#fb923c) sans rapport
 * avec la rampe ; les deux premières bandes partageaient la même valeur, ce
 * qui rendait « Très bon » et « Bon » indiscernables.
 */
/**
 * ⚠️ Les seuils et les noms viennent de `lib/analyse.ts`, cette liste n'y ajoute
 * que l'encre. Ils étaient écrits en dur ici : c'était la deuxième des **trois**
 * copies divergentes que portait l'application, et une divergence colorait un
 * « Bon » du vert de « Très bon » sans changer le mot — un désaccord discret entre
 * la couleur et le texte, que rien n'aurait signalé.
 *
 * L'ordre des couleurs suit celui des bandes, de la meilleure à la pire.
 */
// ⚠️ **Six** couleurs pour six bandes. La table en portait cinq, donc la dernière
// recevait `undefined` : tout score inférieur à quarante s'affichait sans couleur, en
// blanc, comme une note neutre. Vu à l'écran sur un « 24 » qui devait alerter.
//
// L'échelle suit le §18 : vert pour ce qui va, orange pour ce qui mérite attention,
// rouge pour ce qui pose problème. Deux crans de vert et deux d'orange pour que six
// bandes se distinguent sans arc-en-ciel.
// ⚠️ **Plus de cran *intense* dans l'échelle.** « Correct » — une note de 68 — prenait
// l'orange intense, un brun sur fond sombre : dans la rangée des piliers, la barre du
// risque paraissait éteinte à côté des autres, signalé comme « bizarre ». L'orange
// ordinaire et l'orange fort suffisent à séparer « Bon » de « Correct » sans quitter la
// lumière. Six bandes, six couleurs, toutes lisibles sur la carte.
const COULEURS_BANDES = [
  JETONS.positifFort,       // Excellent
  JETONS.positif,           // Très bon
  JETONS.attention,         // Bon
  JETONS.attentionFort,     // Correct
  JETONS.negatif,           // À améliorer
  JETONS.negatifFort,       // Fragile
];
const BANDES = SEUILS_BANDES.map((b, i) => ({ ...b, couleur: COULEURS_BANDES[i] }));

const couleurScore = (s: number | null) =>
  s == null ? JETONS.texteFaible : (BANDES.find(b => s >= b.min) ?? BANDES[BANDES.length - 1]).couleur;

/**
 * Le ton d'une observation, en fond et en encre.
 *
 * Trois de ces quatre couleurs étaient des hexadécimaux relevés sur le thème
 * sombre : la pastille gardait donc son vert vif et son glyphe sombre en thème
 * clair, où le glyphe disparaissait. Le motif de l'échelle règle les deux d'un
 * coup — un fond `voile` et une encre `fort`, qui se retournent ensemble.
 */
const TON: Record<string, { fond: string; encre: string; signe: string }> = {
  alerte:    { fond: JETONS.negatifVoile,    encre: JETONS.negatifFort,    signe: "!" },
  attention: { fond: JETONS.attentionVoile,  encre: JETONS.attentionFort,  signe: "!" },
  favorable: { fond: JETONS.positifVoile,    encre: JETONS.positifFort,    signe: "✓" },
  info:      { fond: JETONS.accentVoile,     encre: JETONS.accentFort,     signe: "i" },
};

/**
 * La bande de fond d'une note — le voile de la même couleur que son encre.
 *
 * ⚠️ Même découpage que `couleurScore` : deux bandes vertes, deux orange, deux rouges.
 */
const voileScore = (s: number | null) => {
  if (s == null) return JETONS.carteCreuse;
  const i = BANDES.findIndex(b => s >= b.min);
  return i <= 1 ? JETONS.positifVoile : i <= 3 ? JETONS.attentionVoile : JETONS.negatifVoile;
};

/**
 * L'icône de chaque pilier, sur une boîte de 24 — les cinq dessins fournis par l'utilisateur.
 */
/**
 * ⚠️ **Les tracés sont ceux fournis, tels quels** — trois en trait, deux en aplat. Deux
 * familles dans une même rangée seraient un défaut si on les redessinait ; ici c'est le
 * choix du dessinateur, et le composant sait rendre les deux : un aplat prend la couleur en
 * remplissage, un trait la prend en contour.
 */
const ICONE_PILIER: Record<string, { d: string; plein?: boolean }> = {
  diversification: { d: "M16 3h5m0 0v5m0-5-7.536 7.536A5 5 0 0 0 12 14.07M8 3H3m0 0v5m0-5 7.536 7.536A5 5 0 0 1 12 14.07m0 0V21m0-6.93V15" },
  risque: { plein: true, d: "M12 2.5c.955 0 1.845.46 2.39 1.226l.105.157 8.115 13.32a2.83 2.83 0 0 1 .052 2.771c-.23.429-.568.793-.98 1.058a2.95 2.95 0 0 1-1.38.46l-.195.008H3.881a2.95 2.95 0 0 1-1.403-.372 2.9 2.9 0 0 1-1.046-.992 2.83 2.83 0 0 1-.133-2.765l.1-.182 8.11-13.31c.26-.42.625-.769 1.061-1.01A2.95 2.95 0 0 1 12 2.5m.01 13.105-.127.007a1 1 0 0 0-.63.323.974.974 0 0 0 0 1.306c.163.18.387.295.63.323l.117.007.127-.007c.243-.028.467-.143.63-.323a.973.973 0 0 0 0-1.306 1 1 0 0 0-.63-.323zM12 8.723a1 1 0 0 0-.665.249c-.183.16-.3.38-.328.62L11 9.705v3.933l.007.115c.029.239.146.46.329.619a1.01 1.01 0 0 0 1.328 0c.183-.16.3-.38.329-.62L13 13.64V9.706l-.007-.115a.98.98 0 0 0-.329-.62A1 1 0 0 0 12 8.724" },
  construction: { d: "M3 11h18m-6 8v-2a3 3 0 0 0-6 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5h4v3h3V5h4v3h3V5h4v14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1" },
  qualite: { plein: true, d: "M16.999 21.744c-1.24-.066-2.862-.835-4.963-2.289l-.039-.026-.036.026c-2.101 1.455-3.723 2.224-4.964 2.29l-.174.005c-2.688 0-3.03-2.566-1.681-7.041l.053-.173-.098-.073c-5.926-4.508-4.938-7.628 2.5-7.84l.197-.005.113-.317c1.158-3.236 2.374-4.942 3.94-5.046L12 1.25c1.638 0 2.894 1.71 4.093 5.051l.111.317.2.005c7.437.212 8.426 3.332 2.498 7.84l-.1.072.054.173c1.321 4.386 1.018 6.937-1.523 7.037l-.159.003z" },
  adequation: { plein: true, d: "M12 2.25c.954 0 1.886.286 2.679.822a4.86 4.86 0 0 1 1.775 2.187c.365.891.46 1.871.275 2.817a4.9 4.9 0 0 1-1.32 2.496 4.8 4.8 0 0 1-2.468 1.334 4.77 4.77 0 0 1-2.786-.277A4.83 4.83 0 0 1 7.99 9.833a4.9 4.9 0 0 1-.812-2.708l.004-.212a4.9 4.9 0 0 1 1.483-3.31A4.8 4.8 0 0 1 12 2.25M13.929 13.95c1.278 0 2.505.514 3.409 1.428a4.9 4.9 0 0 1 1.412 3.447v.975c0 .517-.203 1.013-.565 1.379a1.92 1.92 0 0 1-1.364.571H7.18a1.92 1.92 0 0 1-1.364-.571A1.96 1.96 0 0 1 5.25 19.8v-.975c0-1.293.508-2.533 1.412-3.447a4.8 4.8 0 0 1 3.41-1.428z" },
};

function IconePilier({ cle, taille = 18, couleur }: { cle: string; taille?: number; couleur: string }) {
  const ic = ICONE_PILIER[cle];
  if (!ic) {
    return (
      <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={1.5}
        aria-hidden="true" style={{ display: "block", flexShrink: 0 }}><circle cx="12" cy="12" r="8" /></svg>
    );
  }
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24"
      fill={ic.plein ? couleur : "none"} stroke={ic.plein ? "none" : couleur}
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}>
      <path d={ic.d} />
    </svg>
  );
}

/**
 * Les cinq piliers en barres horizontales sur un axe de 0 à 100 : pastille d'icône, nom,
 * ce que le pilier mesure, barre lumineuse, note en bout de ligne.
 *
 * ⚠️ **Horizontal, parce que les noms sont longs et les critères peu nombreux.** La version
 * verticale empilait l'icône, un nom sur deux lignes et la note au-dessus dans soixante
 * pixels de large. Ici le nom et sa description se lisent dans le sens de la barre, la note
 * tombe en bout, et l'axe gradué en fait un graphique qu'on lit sans effort — c'est la
 * maquette retenue, sans son anneau ni sa bascule vers le radar.
 *
 * ⚠️ **Les barres apparaissent en s'allongeant depuis zéro, l'une après l'autre.** Demandé.
 * La largeur part de zéro et prend sa valeur à l'image suivante, portée par une transition ;
 * chaque barre part quatre-vingts millisecondes après la précédente, pour que l'œil les voie
 * se dresser dans l'ordre. C'est `pret`, passé à vrai dans un effet, qui fait la différence
 * entre les deux rendus — et qui retombe quand l'onglet se cache, voir plus bas.
 *
 * ⚠️ **Couleur par bande de note, pas par pilier.** La maquette teinte chaque pilier de sa
 * propre couleur — un violet pour 79, un rouge pour 56 —, ce qui est joli mais ne dit rien :
 * partout ailleurs dans l'application, le vert va bien et le rouge alerte. On garde ce sens.
 */
type PilierBarres = {
  cle: string; libelle: string; score: number | null; explication: string; poids_effectif: number;
  metriques: { cle: string; libelle: string; score: number | null; poids: number; poids_effectif: number;
               lecture: string; explication: string; statut: string; couverture: number }[];
};

/**
 * Une barre — un pilier, ou une métrique de ce pilier — dans le même style : nom à gauche,
 * pondération accolée au nom, note à droite, barre dessous.
 *
 * ⚠️ **La pondération a remplacé la lecture chiffrée à droite du nom.** Cette place portait
 * la mesure qui fonde la note — « un seul actif », « 1.0 secteur », « 34 points d'écart » —,
 * retirée à la demande. Elle disait la même chose que la note d'à côté, en plus long et
 * tronquée dès que la carte se resserre ; le poids, lui, ne se déduit d'aucun autre chiffre
 * de la carte et explique pourquoi une note de 0 pèse plus qu'une autre.
 */
function LigneBarre({ nom, score, col, pret, delai, petite, part }: {
  nom: string; score: number | null; col: string; pret: boolean; delai: number; petite?: boolean; part?: string;
}) {
  const mesure = score != null;
  return (
    <span style={{ minWidth: 0, display: "block" }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
                     marginBottom: petite ? 3 : 5 }}>
        <span style={{ fontFamily: FONT, fontSize: petite ? 11.5 : 13, fontWeight: 600,
                       color: petite ? JETONS.texteSecondaire : JETONS.texte, lineHeight: 1.2,
                       minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nom}
          {part && (
            <span style={{ ...NUM, marginLeft: 6, fontSize: 11, fontWeight: 500, color: JETONS.texteFaible }}>
              {part}
            </span>
          )}
        </span>
        <span style={{ ...NUM, fontSize: petite ? 11.5 : 13, fontWeight: 700, color: mesure ? col : JETONS.texteFaible,
                       whiteSpace: "nowrap" }}>
          {mesure ? score : "\u2014"}
        </span>
      </span>
      {/* ⚠️ Le vide de la barre est celui de l'anneau du bandeau — `bordFort`, ce que trace
          `CircleScore` derrière son arc. Deux jauges de la même note sur le même écran ne
          peuvent pas avoir deux gris. La piste des pastilles, plus claire, servait avant. */}
      <span style={{ display: "block", position: "relative", height: petite ? 5 : 8, borderRadius: 4,
                     background: JETONS.bordFort, overflow: "hidden" }}>
        {mesure && (
          <span style={{ position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 4, background: col,
                         width: pret ? `${score}%` : "0%",
                         transition: `width 900ms cubic-bezier(.22,.8,.3,1) ${delai}ms` }} />
        )}
      </span>
    </span>
  );
}

/**
 * La page d'un pilier, dans la carte du score : le pilier en tête avec un retour, puis ses
 * métriques dans le style des barres.
 */
function DetailPilier({ pilier: pil, onRetour }: {
  pilier: PilierBarres; onRetour: () => void;
}) {
  const [pret, setPret] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPret(true));
    return () => cancelAnimationFrame(id);
  }, [pil.cle]);
  const col = couleurScore(pil.score);
  /* ⚠️ De la meilleure note à la pire, les non mesurées en queue — le tri des piliers, un
     niveau plus bas. L'ordre de déclaration côté serveur est celui du poids, qui ne veut rien
     dire pour l'œil quand la hauteur des barres, elle, se lit d'un coup. `sort` est stable :
     deux métriques à égalité gardent leur ordre d'origine. */
  const metriques = pil.metriques.filter(m => m.poids > 0)
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  return (
    /* ⚠️ Colonne pleine hauteur : la zone au-dessus impose la hauteur des cinq barres, et le
       bloc des métriques prend ce qui reste. C'est ce qui permet à la carte de ne pas bouger
       — voir `ZoneFixe`. */
    <div style={{ paddingTop: 2, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* ⚠️ `marginBottom: 6` et non zéro : ajouté aux 6 px de la première métrique, l'en-tête
          se détache de douze — le même écart qu'entre deux barres. La phrase d'explication
          portait cet air avant d'être retirée. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        {/**
          * ⚠️ **Le retour est le bouton d'outil du graphique, à l'envers.** Demandé : même
          * rayon et même taille que « Couleur de la courbe » (`BoutonOutil`, 26 px, `RAYONS.sm`),
          * mais en pastille blanche avec la flèche de la couleur du fond de carte.
          *
          * ⚠️ La flèche prend `segmentEncre` et non `carte` : en thème sombre les deux sont le
          * même noir — `#000000` contre `#030712` —, mais en thème clair la carte est blanche
          * et la flèche disparaîtrait sur son propre fond. C'est la paire blanc/noir qu'emploie
          * déjà toute pastille active de l'application.
          */}
        <button type="button" onClick={onRetour} aria-label="Retour aux piliers"
          style={{ width: 26, height: 26, borderRadius: RAYONS.sm, border: "none", cursor: "pointer",
                   background: JETONS.segmentActif, color: JETONS.segmentEncre, display: "flex",
                   alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <IconePilier cle={pil.cle} taille={22} couleur={pil.score != null ? col : JETONS.texteFaible} />
        <span style={{ flex: 1, minWidth: 0, fontFamily: FONT, fontSize: 13, fontWeight: 600,
                       color: JETONS.texte, overflow: "hidden", textOverflow: "ellipsis",
                       whiteSpace: "nowrap" }}>
          {pil.libelle}
          {/**
            * ⚠️ **La note du pilier, à la place de sa pondération.** Le poids a vécu ici une
            * version — d'abord « 56 % du score », puis « 56 % » —, retiré à la demande : la
            * liste qu'on vient de quitter le donne déjà à côté du même nom, et on n'entre dans
            * un pilier que depuis elle. La note, elle, est ce qu'on vient chercher.
            *
            * ⚠️ Et une seule fois : le « 40 / 100 » en bout de ligne disparaît avec le poids.
            * Deux fois la même note sur une ligne de quatre éléments, c'était le défaut qu'on
            * corrige. Elle prend la couleur de sa bande, comme toutes les notes de la carte.
            */}
          <span style={{ ...NUM, marginLeft: 8, fontSize: 13, fontWeight: 700,
                         color: pil.score != null ? col : JETONS.texteFaible }}>
            {pil.score ?? "\u2014"}
          </span>
        </span>
      </div>
      {/* ⚠️ **Plus de phrase d'explication sous le pilier.** Elle a été rétrécie puis passée
          pleine largeur avant d'être retirée, à la demande : trois lignes de gris pour redire
          ce que le nom du pilier annonce déjà, au-dessus des métriques qui le prouvent. Le
          texte reste porté par la ligne des piliers, en `aria-label`, pour les lecteurs
          d'écran. */}
      {/* ⚠️ **Espacement fixe, calé en haut, quitte à laisser du vide en bas.** Les métriques
          se répartissaient dans la hauteur imposée par `ZoneFixe` : Qualité n'en a qu'une, elle
          flottait au milieu, et Risque en écartait deux de quarante pixels quand les piliers se
          suivent à douze. Douze partout — le `padding: 6px 0` des piliers —, et le reste de la
          carte demeure vide : c'est le prix d'une carte qui ne bouge pas. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
                    justifyContent: "flex-start" }}>
        {metriques.map((m, k) => (
          /* ⚠️ Plus de colonne de 32 px à gauche pour le poids : il est passé à droite du nom,
             comme pour les piliers. La barre d'une métrique prend donc toute la largeur, là où
             celle d'un pilier est décalée par son icône — la hiérarchie se lit à ça. */
          <div key={m.cle} aria-label={m.explication} style={{ padding: "6px 0", minWidth: 0 }}>
            <LigneBarre nom={m.libelle} score={m.score} col={couleurScore(m.score)} pret={pret} delai={120 + k * 80}
              part={`${m.poids_effectif.toFixed(0)} %`} />
          </div>
        ))}
        {metriques.length === 0 && (
          <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: JETONS.texteFaible }}>
            Aucune métrique notée pour ce pilier.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Une zone dont la hauteur est celle de son contenu de référence, quoi qu'on y mette ensuite.
 *
 * ⚠️ **La carte du score ne doit pas changer de taille quand on ouvre le détail d'un pilier.**
 * Demandé. Les deux vues n'ont aucune raison de faire la même hauteur — cinq barres d'un côté,
 * un en-tête et une à quatre métriques de l'autre — et la carte sautait de plusieurs dizaines
 * de pixels à chaque aller-retour, en poussant « Exposition » à côté.
 *
 * La hauteur est mesurée sur la liste des piliers, jamais sur le détail : c'est la vue par
 * défaut, celle qu'on voit en arrivant, donc celle qui doit fixer la référence. Elle est
 * relevée par un `ResizeObserver` pour suivre les changements de largeur de la carte.
 *
 * ⚠️ La mesure porte sur un enfant, pas sur l'élément qui reçoit `minHeight` : observer celui-ci
 * ferait boucler l'observateur sur sa propre écriture.
 */
function ZoneFixe({ mesurer, children }: { mesurer: boolean; children: React.ReactNode }) {
  const contenu = useRef<HTMLDivElement>(null);
  const [hauteur, setHauteur] = useState<number>();
  useEffect(() => {
    const el = contenu.current;
    if (!mesurer || !el) return;
    const relever = () => setHauteur(h => (h === el.offsetHeight ? h : el.offsetHeight));
    relever();
    const ro = new ResizeObserver(relever);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mesurer]);
  return (
    <div style={{ minHeight: hauteur, display: "flex", flexDirection: "column" }}>
      <div ref={contenu} style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function BarresPiliers({ piliers, onChoisir, visible }: {
  piliers: PilierBarres[];
  onChoisir: (cle: string) => void;
  visible: boolean;
}) {
  const [survole, setSurvole] = useState<string | null>(null);
  /**
   * ⚠️ **L'animation rejoue à chaque arrivée sur l'onglet, pas seulement au premier rendu.**
   * L'onglet reste monté quand on le quitte ; au retour, les barres étaient déjà à leur
   * valeur et rien ne bougeait. Quand l'onglet se cache, `pret` retombe à faux — les barres
   * se replient hors écran, sans qu'on le voie — et l'image suivante après le retour les
   * relance depuis zéro.
   *
   * ⚠️ **Sans repères ni axe**, retirés à la demande : la barre et sa note suffisent, la
   * graduation faisait un fond chargé pour cinq valeurs qu'on lit en bout de ligne.
   */
  const [pret, setPret] = useState(false);
  useEffect(() => {
    if (!visible) { setPret(false); return; }
    const id = requestAnimationFrame(() => setPret(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);
  return (
    <div style={{ position: "relative", paddingTop: 2 }}>
      {/* ⚠️ Du meilleur au pire, les non mesurés en queue — demandé. L'ordre des piliers
          dans le score n'a pas de sens pour l'œil ; la hauteur des barres, si. */}
      {[...piliers].sort((x, y) => (y.score ?? -1) - (x.score ?? -1)).map((pil, i) => {
        const col = couleurScore(pil.score);
        const mesure = pil.score != null;
        return (
          <div key={pil.cle}
            /**
             * ⚠️ **Au survol, un fond plein et arrondi, sans liseré** — le survol d'un élément
             * de menu, montré en modèle. Le liseré d'une version précédente se lisait comme un
             * cadre ; un fond dit « ceci est une ligne qu'on peut choisir ».
             */
            style={{ borderRadius: 10, margin: "0 -8px", padding: "0 8px",
                     background: survole === pil.cle ? JETONS.carteCreuse : "transparent",
                     opacity: pret ? 1 : 0, transitionProperty: "opacity, background-color",
                     transitionDuration: "400ms, 150ms", transitionDelay: `${i * 80}ms, 0ms` }}
            onMouseEnter={() => setSurvole(pil.cle)}
            onMouseLeave={() => setSurvole(s => (s === pil.cle ? null : s))}>
            <button type="button" aria-label={pil.explication} onClick={() => onChoisir(pil.cle)}
              style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", columnGap: 12,
                       alignItems: "center", width: "100%", textAlign: "left", background: "none", border: "none",
                       padding: "6px 0", cursor: "pointer" }}>
              <span style={{ width: 32, height: 32, display: "flex", alignItems: "center",
                             justifyContent: "center", alignSelf: "center" }}>
                <IconePilier cle={pil.cle} taille={22} couleur={mesure ? col : JETONS.texteFaible} />
              </span>
              {/* ⚠️ La pondération à droite du nom, la note en bout de ligne — la forme exacte
                  des métriques du détail, un niveau plus haut. Un pilier écarté du calcul n'a
                  pas de poids à montrer : sa note dit déjà « — ». */}
              <LigneBarre nom={pil.libelle} score={pil.score} col={col} pret={pret} delai={120 + i * 80}
                part={pil.poids_effectif > 0 ? `${pil.poids_effectif.toFixed(0)} %` : undefined} />
            </button>
          </div>
        );
      })}
    </div>
  );
}


/** Une ligne pour dire ce que chaque pilier mesure, sous son nom. */
const DESCRIPTION_PILIER: Record<string, string> = {
  diversification: "Répartition entre classes d'actifs et secteurs",
  risque: "Volatilité, perte maximale, exposition",
  construction: "Cohérence, pondérations, efficacité",
  qualite: "Solidité financière, avantages compétitifs",
  adequation: "Alignement avec vos objectifs et horizon",
};

const COULEURS_PART = ["#50A2FF", "#a78bfa", "#FF8904", "#00D492", JETONS.negatif, "#22d3ee", "#94a3b8"];

function Carte({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    // ⚠️ L'attribut est posé sur la carte, pas sur chaque ligne : `closest` remonte
    // l'arbre, donc un seul suffit à rendre tout le panneau expressif. Un attribut par
    // ligne aurait été autant d'occasions d'en oublier une.
    <Cadre data-avatar="curieux"
      style={{ padding: "13px 15px", display: "flex", flexDirection: "column", minHeight: 0, ...style }}>
      {children}
    </Cadre>
  );
}

/** L'en-tête commun à toutes les cartes — voir `TitreDeCarte`. */
function Titre({ children, action, sous }: { children: React.ReactNode; action?: React.ReactNode; sous?: React.ReactNode }) {
  return <TitreDeCarte action={action} sous={sous}>{children}</TitreDeCarte>;
}

/**
 * L'onglet Analyse.
 *
 * ⚠️ L'analyse arrive en propriété et n'est plus chargée ici. Elle alimente
 * aussi le score du bandeau : la charger deux fois aurait doublé les appels à une
 * route qui télécharge un an d'historique et les fiches sectorielles, et surtout
 * rien n'aurait garanti que les deux réponses concordent.
 */
/* ⚠️ `ancreDe` — qui ancrait un panneau sous l'élément cliqué — est partie avec le dernier
   bouton qui l'appelait. Le type reste : les deux props d'ouverture de panneau le portent
   encore dans leur signature. */
type Ancre = { droite: number; haut: number };

export default function AnalyseView({ analyse: a, etat, visible = true }: {
  analyse: Analyse | null; etat: EtatAnalyse;
  /**
   * L'onglet est-il à l'écran ? Il reste monté quand on en change — la page le cache — et
   * l'animation des barres doit rejouer à chaque fois qu'on y revient, pas au seul premier
   * rendu.
   */
  visible?: boolean;
  /** Ouvre le panneau du profil de risque, ancré sous l'élément cliqué. */
  onProfil?: (ancre: Ancre) => void;
  /**
   * Ouvre le panneau des frais des fonds, ancré sous l'élément cliqué.
   *
   * ⚠️ **Plus personne ne l'appelle.** Son seul déclencheur était le lien bleu « Modifier les
   * frais des fonds », sous la métrique du même nom dans le détail de Construction ; il est
   * retiré à la demande. La prop reste acceptée pour que la page qui la passe compile sans
   * changement, mais le panneau des frais n'a plus de porte — comme celui du profil.
   */
  onFrais?: (ancre: Ancre) => void;
}) {
  // ⚠️ « devises » a été retiré des onglets. La ventilation venait de la devise de
  // **cotation** : elle annonçait « EUR 100 % » pour un portefeuille de trackers
  // S&P 500 cotés à Paris, dont l'exposition au dollar est totale. C'était faux, et
  // aucune donnée disponible ne permet de la corriger — les poids par devise des
  // sous-jacents ne sont pas publiés.
  const [ongletExpo, setOngletExpo] = useState<"secteurs" | "zones" | "classes">("secteurs");
  // Un seul pilier déplié à la fois : la carte ne peut pas porter vingt-cinq lignes.
  const [pilierOuvert, setPilierOuvert] = useState<string | null>(null);

  /**
   * Le radar ne porte que les facteurs qui **notent**.
   *
   * ⚠️ Il représente visuellement la note : y placer un facteur indicatif — la
   * perte maximale, hors du score — laisserait croire qu'il y pèse. Elle reste dans
   * la liste en dessous, marquée comme telle.
   */
  // ⚠️ Mémorisé : `?? []` crée un tableau neuf à chaque rendu, ce qui invaliderait
  // le `useMemo` du radar en permanence — il recalculerait à chaque frappe ailleurs
  // dans la page.
  const piliers = useMemo(() => a?.novac?.piliers ?? [], [a]);

  if (etat === "charge") {
    return <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, fontSize: 12,
                         color: JETONS.texteFaible }}>Analyse en cours…</div>;
  }
  if (etat === "vide" || !a) {
    return (
      <div style={{ padding: `8px ${MARGE}px 0`, height: "100%" }}>
        <Carte style={{ alignItems: "center", justifyContent: "center", padding: 48 }}>
          <p style={{ fontFamily: FONT, fontSize: 13, color: JETONS.texteAttenue, margin: "0 0 6px" }}>
            Rien à analyser pour l&apos;instant
          </p>
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: JETONS.texteFaible,
                      margin: 0, textAlign: "center", lineHeight: 1.6 }}>
            L&apos;analyse porte sur les positions réelles. Ajoutez des transactions
            pour que le portefeuille ait quelque chose à mesurer.
          </p>
        </Carte>
      </div>
    );
  }

  const expo = a.expositions[ongletExpo] ?? [];

  const GRAVITE: Record<string, number> = { alerte: 0, attention: 1, favorable: 2, info: 3 };
  const saillantes = [...a.observations]
    .sort((x, y) => (GRAVITE[x.ton] ?? 9) - (GRAVITE[y.ton] ?? 9))
    .slice(0, 3);

  return (
    /**
     * ⚠️ **L'onglet prend la hauteur de son contenu et défile, il ne rogne plus.** Les deux
     * rangées se partageaient une hauteur fixe, et chaque carte coupait ce qui dépassait :
     * mesuré dans le navigateur, la carte du score faisait 321 px pour 430 de contenu — le
     * premier et le dernier pilier invisibles, le bandeau du bas posé sur la toile. Aucun
     * réglage de taille ne tient à toutes les hauteurs d'écran ; une page qui défile, si.
     */
    <div style={{ display: "flex", flexDirection: "column", gap: GOUTTIERE,
                  padding: `8px ${MARGE}px 12px`, height: "100%", minHeight: 0,
                  overflowY: "auto", overflowX: "hidden" }}>

      {/* ── Rangée haute ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)",
                    gap: GOUTTIERE, flexShrink: 0 }}>

        {/**
          * ⚠️ **Ce qui reste de la maquette fournie : les cinq piliers, rien d'autre.** Elle
          * portait aussi une toile d'araignée à gauche, des encadrés teintés, un bandeau
          * profil-confiance-mise à jour et un bouton d'aide — tous essayés, tous retirés
          * l'un après l'autre. Le détail d'un pilier remplace la liste, sans faire défiler.
          */}
        <Carte>
          {/* ⚠️ **Plus de bouton « Comment ça marche ? ».** Il ouvrait la légende des six
              bandes de note en panneau flottant ; retiré à la demande, avec la légende. Les
              couleurs se lisent sur les barres elles-mêmes, et l'anneau du bandeau porte déjà
              la mention de la bande — « Fragile », « Solide ». L'en-tête redevient un titre
              nu, comme « Répartition ». */}
          <Titre>NOVAC Score</Titre>

          {/**
            * ⚠️ **Plus de radar : les cinq lignes sont le graphique.** Il a été introduit, puis
            * agrandi, puis jugé rapporté — à raison. Sa forme ne disait rien que les cinq
            * barres ne disent, il coûtait un tiers de la carte et un vocabulaire visuel que
            * rien d'autre dans l'application n'emploie. Les lignes prennent toute la largeur,
            * avec des barres plus épaisses : c'est le même langage qu'« Exposition ».
            */}
          {/* ⚠️ Le verdict de gauche a vécu une version, retiré à la demande : la carte n'a
              plus que les barres, en pleine largeur. */}
          {/**
            * ⚠️ **Le détail d'un pilier remplace la carte, comme une page : le pilier en tête
            * avec un retour, ses métriques dessous dans le style des barres.** Le dépliage
            * sous la ligne a vécu une version, puis la carte à part ; demandé finalement comme
            * une page dans la carte. Les métriques gardent exactement la forme des piliers —
            * nom, note, barre — pour qu'on lise la même chose à un niveau de plus.
            */}
          <ZoneFixe mesurer={!pilierOuvert}>
            {pilierOuvert && piliers.find(p => p.cle === pilierOuvert)
              ? <DetailPilier pilier={piliers.find(p => p.cle === pilierOuvert)!}
                  onRetour={() => setPilierOuvert(null)} />
              : <BarresPiliers piliers={piliers} onChoisir={setPilierOuvert} visible={visible} />}
          </ZoneFixe>

          {/**
            * ⚠️ **Plus de bandeau profil / confiance / mise à jour.** Il prenait un tiers de la
            * carte pour trois mentions dont une seule compte, le profil — et celle-là est une
            * information de bandeau de page, pas de carte d'analyse : elle vit maintenant sous
            * « NOVAC Score » du bandeau, avec la note qu'elle pondère. La confiance et l'heure
            * disparaissent avec lui.
            */}
        </Carte>

        {/* Exposition */}
        <Carte>
          <Titre action={
            <Segments taille="sm" ariaLabel="Axe d'exposition" valeur={ongletExpo} onChange={setOngletExpo}
              options={[
                { valeur: "secteurs" as const, libelle: "Secteurs" },
                { valeur: "zones" as const, libelle: "Zones" },
                /* ⚠️ « Sous-jacents » et non « Classes » : la répartition de la vue générale a
                   déjà un mode « Classe », qui est le *type de la ligne* — action, fonds, crypto.
                   Celui-ci est la composition interne des fonds, actions et obligations en
                   transparence. Deux cartes affichant « Classes » avec des chiffres différents
                   et rien pour l'expliquer. */
                { valeur: "classes" as const, libelle: "Sous-jacents" },
              ]} />
          }>Exposition</Titre>

          {/**
            * ⚠️ **Une carte en arbre, comme « Répartition » — et non cinq barres.** Les barres
            * étaient la forme des cinq piliers du score, juste à gauche : deux cartes voisines
            * disaient la même chose de deux natures différentes. Les piliers sont cinq notes
            * indépendantes sur cent ; l'exposition est un tout découpé, dont les parts font
            * cent ensemble. La mosaïque le dit d'un coup, et remplit la hauteur de la carte
            * là où cinq barres laissaient le reste vide.
            */}
          <Mosaique
            blocs={expo.map((e, i) => ({
              cle: e.libelle, nom: e.libelle, valeur: e.part,
              couleur: COULEURS_PART[i % COULEURS_PART.length],
            }))}
            invite="Touchez un bloc pour le détail"
            vide="Ventilation indisponible pour ces titres."
            /**
             * ⚠️ Le libellé arrive en deux vocabulaires : la zone d'un fonds se déduit de son
             * mandat, en français, quand le pays d'une action vient du fournisseur en anglais.
             * `DrapeauPays` accepte les deux langues. Les agrégats — « Marchés émergents » —
             * n'ont aucun pavillon : leur prêter celui du pays dominant ferait lire une
             * exposition qui n'est pas celle des chiffres.
             */
            dessin={ongletExpo === "zones"
              ? (b, cote) => <DrapeauPays pays={b.nom} taille={cote} />
              : undefined}
          />
          {/* ⚠️ Les deux paragraphes gris qui expliquaient la transparence des fonds et la
              déduction des zones sont retirés, à la demande : ils prenaient trois lignes sous
              l'image pour une règle de calcul qu'on ne relit pas. Elle reste écrite dans le
              code, là où elle sert. */}
        </Carte>
      </div>

      {/* ── Rangée basse ─────────────────────────────────────────────────── */}
      {/**
        * ⚠️ **La projection à un an est retirée.** Un cône de projection se lit comme une
        * prévision quel que soit son libellé, et la page Simulation fait déjà ce travail avec
        * des hypothèses qu'on choisit. Un lien y mène depuis l'en-tête des observations.
        */}
      {/* ⚠️ Une carte « Détail par pilier » a vécu une version ici, refusée : « pas un
          conteneur en plus ». Le détail se déplie sous le pilier, dans la carte du score. */}
      <div style={{ display: "flex", flexShrink: 0 }}>
        <Carte style={{ flex: 1 }}>
          <Titre sous="Les trois constats les plus saillants, calculés sur vos positions — pas un conseil en investissement."
            action={
              <a href="/simulation" style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500,
                                            color: JETONS.accent, textDecoration: "none", whiteSpace: "nowrap" }}>
                Projeter dans Simulation →
              </a>
            }>Ce que disent vos chiffres</Titre>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* ⚠️ Trois au plus, les plus graves d'abord : au-delà, une liste de constats devient
                une liste de généralités qu'on ne lit plus. */}
            {saillantes.length ? saillantes.map((o, i) => {
              const t = TON[o.ton] ?? TON.info;
              return (
                <div key={i} style={{ display: "flex", gap: 10, padding: "9px 11px", borderRadius: RAYONS.sm,
                                      background: JETONS.carteCreuse,
                                      border: `1px solid ${JETONS.bord}` }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                                 background: t.fond, color: t.encre,
                                 display: "flex", alignItems: "center", justifyContent: "center",
                                 fontFamily: FONT, fontSize: 11, fontWeight: 800 }}>
                    {t.signe}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: FONT, fontSize: 11.5, fontWeight: 600,
                                   color: JETONS.texte, marginBottom: 2 }}>
                      {o.titre}
                    </span>
                    <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5,
                                   color: JETONS.texteAttenue, lineHeight: 1.55 }}>
                      {o.detail}
                    </span>
                  </span>
                </div>
              );
            }) : (
              <p style={{ fontFamily: FONT, fontSize: 11, color: JETONS.texteFaible,
                          margin: 0, lineHeight: 1.6 }}>
                Rien de saillant : aucune ligne ne domine, les corrélations et la
                volatilité restent dans des bornes ordinaires.
              </p>
            )}
          </div>

        </Carte>

      </div>
    </div>
  );
}
