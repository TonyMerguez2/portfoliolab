/**
 * Le découpage du portefeuille en blocs, pour la répartition en pavage.
 *
 * ⚠️ **Le tout représente toujours la même chose, quel que soit le mode.** Compte, actif ou
 * classe ne sont que trois façons de tailler la même surface : la valeur du portefeuille,
 * liquidités comprises. Si un mode excluait l'épargne déclarée, changer de mode changerait
 * le dénominateur sans le dire — et deux parts de 39 % ne désigneraient pas la même somme.
 *
 * ⚠️ **Une part se calcule sur des euros, jamais sur les poids déjà calculés.** Les poids
 * que porte chaque ligne sont rapportés aux seuls titres ; les additionner à des liquidités
 * donnerait un total supérieur à cent. On repart donc des valeurs.
 *
 * ⚠️ **Le pavage lui-même n'est pas ici.** `d3.treemap` sait poser une hiérarchie, et il est
 * déjà une dépendance du projet. Ce module ne fait que la construire — c'est la partie qui
 * se teste, et celle où une erreur ne se verrait pas : un bloc de la mauvaise taille reste
 * un rectangle plausible.
 *
 * ⚠️ Chemins relatifs et non l'alias « @/ » : Vitest tourne sans configuration.
 */

/**
 * La classe d'une ligne, en clair.
 *
 * ⚠️ **Le type du fournisseur d'abord, la déduction sur le ticker ensuite.** `assetClass`
 * reconnaît les fonds à une liste de tickers écrite en dur — SPY, QQQ, CW8… — qui ne
 * contient aucun ETF européen. Vu à l'écran : un portefeuille de trois trackers de Paris
 * annonçait « Actions 100 % ». Le défaut était déjà celui du camembert, il se voit
 * seulement mieux sur un pavage. Le type reçu avec la position, lui, vient du fournisseur
 * de cours et ne se trompe pas de la même façon.
 *
 * ⚠️ **La déduction reste, comme repli.** Les portefeuilles valorisés en poids n'ont pas
 * d'opérations, donc pas de type : sans elle, ils perdraient le mode « classe ».
 */
export function classeEnClair(type: string | null | undefined, deduite: string): string {
  switch ((type ?? "").toUpperCase()) {
    case "ETF": return "ETF";
    case "CRYPTOCURRENCY": return "Crypto";
    case "EQUITY": return "Actions";
    case "INDEX": return "Indices";
    default: return deduite;
  }
}

/** Ce qu'une ligne doit porter pour entrer dans le pavage. */
export type LignePavee = {
  ticker: string;
  value: number | null;
  /** La classe d'actif, quand on découpe par classe. */
  classe?: string;
};

/** Un dossier, tel que la rangée le connaît déjà. */
export type DossierPave = {
  cle: string;
  nom: string;
  couleur: string;
  lignes: LignePavee[];
  /** Les espèces du compte, qui forment leur propre bloc. */
  especes: number | null;
};

/** Un bloc du pavage : un rectangle à venir. */
export type Bloc = {
  cle: string;
  /** Ce que le bloc annonce quand il a la place. */
  nom: string;
  valeur: number;
  couleur: string;
  /** Le ticker, pour poser un logo quand le bloc est assez grand. */
  ticker?: string;
};

export type ModePavage = "compte" | "actif" | "classe";

const valeurDe = (lignes: LignePavee[]) =>
  lignes.reduce((s, l) => s + (l.value ?? 0), 0);

/**
 * ⚠️ **Les espèces ont leur bloc dans les modes « actif » et « classe », pas dans
 * « compte ».** Là, elles font partie de la valeur du compte qui les porte — c'est bien ce
 * qu'un livret *est*. Ailleurs, elles n'ont ni ticker ni classe : sans bloc à elles, le tout
 * cesserait de valoir le portefeuille.
 */
const CLE_ESPECES = "especes";

/**
 * Les blocs à paver, selon le mode.
 *
 * ⚠️ **Aucun tri par valeur ici.** `d3.treemap` range lui-même les nœuds pour minimiser
 * l'écart des proportions ; trier en amont ne changerait que l'ordre des clés, et donnerait
 * l'illusion d'une position lisible qui n'existe pas.
 */
export function blocsDuPortefeuille(
  dossiers: DossierPave[], mode: ModePavage,
  couleurActif: (ticker: string) => string,
): Bloc[] {
  const blocs: Bloc[] = [];

  /**
   * ⚠️ **Un bloc par dossier, sans subdivision — et j'avais fait l'inverse.** Le premier
   * essai découpait chaque compte par ses lignes, en nuances de sa teinte : l'image mêlait
   * alors deux niveaux et l'on y lisait « Espèces 47 % » à côté de « ESE.PA 35 % », deux
   * grandeurs de nature différente dans la même vue. Signalé à l'usage. Un mode répond à une
   * question : « comment mon argent se répartit entre mes comptes ». Les titres ont le leur.
   */
  if (mode === "compte") {
    for (const d of dossiers) {
      blocs.push({
        cle: d.cle,
        nom: d.nom,
        valeur: valeurDe(d.lignes) + (d.especes ?? 0),
        couleur: d.couleur,
      });
    }
    return blocs.filter(b => b.valeur > 0);
  }

  if (mode === "actif") {
    for (const d of dossiers) {
      for (const l of d.lignes) {
        blocs.push({
          cle: l.ticker, nom: l.ticker.replace(/-USD$/, ""),
          valeur: l.value ?? 0, couleur: couleurActif(l.ticker), ticker: l.ticker,
        });
      }
    }
    // ⚠️ Les espèces n'ont pas de ticker : sans bloc à elles, le tout cesserait de valoir le
    // portefeuille dès qu'un livret est déclaré, et la part de chaque ligne changerait en
    // passant du mode compte au mode actif.
    const especes = dossiers.reduce((s, d) => s + (d.especes ?? 0), 0);
    if (especes > 0) {
      blocs.push({ cle: CLE_ESPECES, nom: "Espèces", valeur: especes, couleur: "#5A6478" });
    }
    return fusionner(blocs);
  }

  const parClasse = new Map<string, number>();
  for (const d of dossiers) {
    for (const l of d.lignes) {
      const c = l.classe ?? "Autres";
      parClasse.set(c, (parClasse.get(c) ?? 0) + (l.value ?? 0));
    }
  }
  const especes = dossiers.reduce((s, d) => s + (d.especes ?? 0), 0);
  if (especes > 0) parClasse.set("Espèces", (parClasse.get("Espèces") ?? 0) + especes);

  // Une teinte par classe, prise sur le cercle chromatique : elles n'ont pas de couleur
  // propre, contrairement aux titres et aux dossiers.
  const noms = Array.from(parClasse.keys());
  noms.forEach((nom, i) => {
    blocs.push({
      cle: nom, nom, valeur: parClasse.get(nom) ?? 0,
      couleur: `hsl(${Math.round((i * 360) / Math.max(1, noms.length))} 46% 52%)`,
    });
  });
  return blocs.filter(b => b.valeur > 0);
}

/**
 * Additionne les blocs de même clé.
 *
 * ⚠️ **Un même titre peut être détenu dans deux comptes.** En mode actif, il doit faire un
 * seul rectangle : deux blocs « AAPL » côte à côte se liraient comme deux lignes
 * différentes, et la légende en citerait deux.
 */
function fusionner(blocs: Bloc[]): Bloc[] {
  const par = new Map<string, Bloc>();
  for (const b of blocs) {
    const vu = par.get(b.cle);
    if (vu) vu.valeur += b.valeur;
    else par.set(b.cle, { ...b });
  }
  return Array.from(par.values()).filter(b => b.valeur > 0);
}

/** La somme des blocs — ce que le pavage entier représente. */
export const totalDesBlocs = (blocs: Bloc[]) =>
  blocs.reduce((s, b) => s + b.valeur, 0);

/**
 * Le poids de mise en page de chaque bloc — l'aire qu'il occupera.
 *
 * ⚠️ **C'est le seul endroit du module où l'image ment un peu, et il faut le savoir.** Un
 * bloc à 2 % voisin d'un bloc à 50 % est vingt-cinq fois plus petit : dans un panneau de
 * trois centimètres, il devient un filet de vingt pixels sur cinquante — signalé à l'usage
 * comme « une barre toute fine ». Aucune découpe ne le rend compact tout en gardant les
 * aires exactes ; c'est de l'arithmétique, pas un défaut d'algorithme.
 *
 * ⚠️ **On relève donc les plus petits jusqu'à un plancher, et l'on renormalise.** Les gros
 * blocs cèdent ce qu'il faut, à proportion. La conséquence à assumer : sous le plancher,
 * l'aire n'est plus fidèle à la part. Au-dessus, elle l'est exactement.
 *
 * ⚠️ **Le pourcentage affiché, lui, n'est jamais touché.** C'est ce qui rend le compromis
 * tenable : l'aire dit la forme, le chiffre dit la vérité, et le chiffre est écrit sur le
 * bloc. L'inverse — une aire juste et un chiffre arrondi — serait bien pire.
 *
 * ⚠️ **Rien ne bouge si tous les blocs sont au-dessus du plancher**, ce qui est le cas
 * ordinaire. La distorsion n'existe que là où elle sert.
 *
 * ⚠️ **Le plancher est descendu de 5,5 % à 2 %, parce qu'à 5,5 % l'image mentait trop.** Vu
 * à l'écran : une ligne à 8 % et une ligne à 1 % faisaient la même tuile, et l'utilisateur
 * ne pouvait plus lire les poids sur les aires — ce qui est pourtant tout ce qu'une carte en
 * arbre promet. À 2 %, une part de 1 % est deux fois relevée et reste quatre fois plus
 * petite qu'une part de 8 % ; elle n'est plus un filet, mais elle n'est plus un mensonge
 * non plus. Le nom d'une si petite tuile ne tient pas dessus : la ligne de lecture le
 * porte, c'est son rôle.
 */
export function poidsLisibles(
  blocs: Bloc[], plancher = 0.02,
): { bloc: Bloc; poids: number }[] {
  const total = totalDesBlocs(blocs);
  if (total <= 0) return blocs.map(bloc => ({ bloc, poids: 0 }));

  // ⚠️ Le plancher ne peut pas dépasser une part égale : à vingt blocs il tient encore, mais
  // à soixante il exigerait 120 % de la surface. On le borne donc à ce que la surface permet,
  // faute de quoi la renormalisation les égaliserait tous.
  const borne = Math.min(plancher, 1 / Math.max(1, blocs.length));
  const releves = blocs.map(bloc => ({
    bloc, poids: Math.max(bloc.valeur / total, borne),
  }));
  const somme = releves.reduce((s, r) => s + r.poids, 0);
  return releves.map(r => ({ bloc: r.bloc, poids: r.poids / somme }));
}
