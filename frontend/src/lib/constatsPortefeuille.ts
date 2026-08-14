/**
 * Des constats chiffrés sur le portefeuille — jamais des conseils.
 *
 * ⚠️ **Le pendant, pour le portefeuille, de ce que `observations()` fait pour un objectif.**
 * Ce panneau prend la place du « Détail du score », qui sur un portefeuille complet ne
 * portait plus qu'une ligne neuve : le reste était deux raccourcis de réglage et un lien
 * vers l'onglet Analyse, sous un score déjà écrit dans le bandeau, trois centimètres plus
 * haut.
 *
 * ⚠️ **Chaque phrase se recompte à la main.** Ce sont des divisions et des sommes sur des
 * chiffres déjà à l'écran. Aucune ne dit quoi faire : « vos trois premières lignes font 74 %
 * du portefeuille » est une mesure ; « vous êtes trop concentré » serait un jugement, et
 * « allégez-les » du conseil en investissement, que ce logiciel ne produit pas.
 *
 * ⚠️ **Un constat qui ne se calcule pas ne s'affiche pas.** Pas de tiret, pas de zéro, pas
 * de « données insuffisantes » : la ligne disparaît. Un panneau qui annonce ce qu'il ne sait
 * pas occupe la place de ce qu'il sait.
 *
 * ⚠️ **Les montants sont arrondis à l'euro, contrairement aux dossiers.** Une phrase se lit,
 * elle ne se réconcilie pas avec un total : « 38 € par an » se retient, « 38,42 € par an »
 * suggère une précision que le calcul n'a pas — le TER est saisi à la main et la
 * valorisation bouge à chaque cours.
 *
 * ⚠️ **La forme rendue est celle que `CarteConstats` attend, et non une phrase.** La carte
 * met un chiffre fort à droite et le commentaire à gauche ; lui donner une phrase entière
 * l'aurait obligée à y repêcher le nombre, ou à s'en passer. Un `Insight` d'objectif entre
 * dans la même carte : les deux sortes de constats sont désormais du même moule.
 *
 * ⚠️ Chemins relatifs et non l'alias « @/ » : Vitest tourne sans configuration.
 */

/**
 * Un constat, dans la forme que la carte affiche.
 *
 * ⚠️ **`confiance` dit la complétude des données, jamais une probabilité.** La plupart de
 * ces constats sont des divisions de chiffres déjà à l'écran : ils valent 1. Celui des
 * frais vaut la part des lignes dont le TER est renseigné — c'est le seul qui puisse être
 * partiel, et le seul qu'il faut savoir lire avec réserve.
 */
export type Constat = {
  titre: string;
  description: string;
  metrique?: { libelle: string; valeur: string };
  confiance: number;
  motifs: string[];
  hypotheses: string[];
};

/** Ce qu'une ligne doit porter pour entrer dans un constat. */
export type LigneConstat = {
  ticker: string;
  value: number | null;
  /** Le gain ou la perte de la ligne, quand la valorisation vient des opérations. */
  pnlEur?: number | null;
};

const EUROS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const euros = (v: number) => `${EUROS.format(Math.round(v))} €`;
const pourcent = (part: number) => `${Math.round(part * 100)} %`;

const valeurDe = (lignes: LigneConstat[]) =>
  lignes.reduce((s, l) => s + (l.value ?? 0), 0);

/**
 * Les constats du portefeuille, du plus utile au moins utile.
 *
 * ⚠️ **L'ordre n'est pas décoratif : le panneau n'en montre qu'un à la fois.** Il répond
 * d'abord aux questions qu'aucun autre endroit de l'écran ne traite — d'où vient le gain,
 * ce que coûtent les frais en euros — avant celles que le camembert d'à côté effleure déjà.
 */
export function constatsDuPortefeuille({
  lignes, liquidites = 0, fraisParLigne = {}, gainTotal = null,
}: {
  lignes: LigneConstat[];
  /** Les soldes déclarés des comptes de trésorerie, cumulés. */
  liquidites?: number;
  /** Le TER saisi par ticker, en pourcentage par an. */
  fraisParLigne?: Record<string, number>;
  gainTotal?: number | null;
}): Constat[] {
  const sortie: Constat[] = [];
  const titres = valeurDe(lignes);
  const total = titres + liquidites;
  if (lignes.length === 0 && liquidites <= 0) return sortie;

  // ── 1. D'où vient le gain ───────────────────────────────────────────────────
  //
  // ⚠️ **La question qu'on se pose devant « +590 € », et que rien à l'écran ne traite.** Le
  // bandeau donne le total, le camembert donne les poids ; aucun des deux ne dit quelle
  // ligne a produit le résultat. Une ligne peut peser 15 % du portefeuille et porter la
  // moitié du gain.
  //
  // ⚠️ **On ne compare que ce qui va dans le même sens.** Sur un portefeuille en perte, la
  // ligne qui gagne le plus « porte » une fraction *négative* du total : la phrase dirait
  // « −40 % de votre perte », ce qui ne se lit pas. On cherche donc le plus gros
  // contributeur **du signe du total**, et l'on se tait s'il n'y en a pas.
  if (gainTotal != null && Math.abs(gainTotal) > 1) {
    const memeSens = lignes.filter(l => l.pnlEur != null
      && Math.sign(l.pnlEur) === Math.sign(gainTotal));
    const tete = memeSens.sort((a, b) => Math.abs(b.pnlEur!) - Math.abs(a.pnlEur!))[0];
    if (tete) {
      const part = Math.abs(tete.pnlEur!) / Math.abs(gainTotal);
      const mot = gainTotal >= 0 ? "gain" : "perte";
      sortie.push({
        titre: `D’où vient votre ${mot}`,
        description: `Sur vos ${euros(Math.abs(gainTotal))} de ${mot}, `
          + `${euros(Math.abs(tete.pnlEur!))} viennent de ${tete.ticker}.`,
        metrique: { libelle: `porté par ${tete.ticker}`,
          valeur: pourcent(Math.min(1, part)) },
        confiance: 1,
        motifs: ["valorisation des lignes", "prix de revient de vos opérations"],
        hypotheses: [],
      });
    }
  }

  // ── 2. Ce que coûtent les frais, en euros ───────────────────────────────────
  //
  // ⚠️ **En euros par an, parce qu'un TER en pourcentage ne se soupèse pas.** « 0,20 % » ne
  // dit rien à personne ; « 38 € par an » se compare à un abonnement. Le pourcentage figure
  // déjà dans le score, où il sert à noter — pas à se représenter une somme.
  const avecFrais = lignes.filter(l => fraisParLigne[l.ticker] != null && l.value != null);
  if (avecFrais.length > 0) {
    const cout = avecFrais.reduce(
      (s, l) => s + (l.value ?? 0) * (fraisParLigne[l.ticker] ?? 0) / 100, 0);
    if (cout >= 1) {
      // ⚠️ On dit sur combien de lignes le calcul porte quand il ne les couvre pas toutes :
      // sans cela, un chiffre partiel se lirait comme le total des frais du portefeuille.
      const partiel = avecFrais.length < lignes.length;
      sortie.push({
        titre: "Ce que coûtent vos fonds",
        description: partiel
          ? `Sur ${avecFrais.length} de vos ${lignes.length} lignes, les frais courants `
            + `prélèvent ${euros(cout)} en douze mois au niveau actuel des encours.`
          : `Les frais courants de vos fonds prélèvent ${euros(cout)} en douze mois, `
            + `au niveau actuel de vos encours.`,
        metrique: { libelle: "par an", valeur: euros(cout) },
        // ⚠️ La confiance est la couverture : un chiffre calculé sur deux lignes de cinq
        // est vrai pour ces deux-là et muet sur les trois autres.
        confiance: avecFrais.length / Math.max(1, lignes.length),
        motifs: ["les TER que vous avez saisis"],
        hypotheses: ["encours actuels", "frais inchangés"],
      });
    }
  }

  // ── 3. Ce qui n'est pas investi ─────────────────────────────────────────────
  //
  // ⚠️ **Visible nulle part ailleurs depuis que le total les additionne.** Déclarer un
  // livret grossit le grand chiffre du bandeau sans que rien ne dise quelle part de ce
  // chiffre dort. C'est un fait, pas un reproche : une réserve peut être exactement ce
  // qu'on veut.
  if (liquidites > 0 && total > 0) {
    sortie.push({
      titre: "Ce qui n’est pas investi",
      description: `${euros(liquidites)} figurent sur vos comptes déclarés, `
        + `sur un portefeuille de ${euros(total)}.`,
      metrique: { libelle: "du portefeuille", valeur: pourcent(liquidites / total) },
      confiance: 1,
      motifs: ["les soldes que vous avez déclarés"],
      hypotheses: [],
    });
  }

  // ── 4. Ce que pèsent les premières lignes ───────────────────────────────────
  //
  // ⚠️ **Une somme, là où le camembert d'à côté ne donne que des parts séparées.** Lire
  // « 39 %, 27 %, 19 % » et en faire 85 % demande un effort que personne ne fournit devant
  // un tableau de bord.
  //
  // ⚠️ **Muet en dessous de quatre lignes.** À trois, « vos trois premières font 100 % » est
  // vrai et ne vaut rien.
  if (lignes.length >= 4 && titres > 0) {
    const tete = [...lignes].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 3);
    sortie.push({
      titre: "Le poids de vos premières lignes",
      description: `${tete.map(t => t.ticker).join(", ")} font ensemble `
        + `${euros(valeurDe(tete))} sur ${euros(titres)} de titres.`,
      metrique: { libelle: "de vos titres", valeur: pourcent(valeurDe(tete) / titres) },
      confiance: 1,
      motifs: ["valorisation des lignes"],
      hypotheses: [],
    });
  }

  return sortie;
}
