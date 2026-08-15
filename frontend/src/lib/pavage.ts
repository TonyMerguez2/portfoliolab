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
  /** Le groupe auquel il appartient — un dossier, une classe — ou rien. */
  groupe?: string;
  /** Le ticker, pour poser un logo quand le bloc est assez grand. */
  ticker?: string;
};

export type ModePavage = "compte" | "actif" | "classe";

const valeurDe = (lignes: LignePavee[]) =>
  lignes.reduce((s, l) => s + (l.value ?? 0), 0);

/**
 * ⚠️ **Les espèces d'un compte forment un bloc, elles ne se fondent pas dans le sien.**
 * Fondues, un livret de cinq mille euros et un PEA de cinq mille auraient exactement la même
 * apparence, alors que l'un est investi et l'autre non — c'est-à-dire précisément ce que
 * l'image doit montrer.
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
  nuancer: (couleur: string, ecart: number) => string,
  couleurActif: (ticker: string) => string,
): Bloc[] {
  const blocs: Bloc[] = [];

  if (mode === "compte") {
    for (const d of dossiers) {
      /**
       * ⚠️ **Les nuances s'échelonnent sur le rang, pas sur la valeur.** Réparties selon le
       * poids, deux lignes voisines auraient des teintes presque identiques et l'on ne
       * verrait pas la frontière ; sur le rang, l'écart est constant et chaque ligne se
       * distingue de sa voisine quelle que soit la composition.
       */
      const rangees = [...d.lignes].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
      rangees.forEach((l, i) => {
        const ecart = rangees.length <= 1 ? 0
          : 0.16 - (0.32 * i) / (rangees.length - 1);
        blocs.push({
          cle: `${d.cle}/${l.ticker}`,
          nom: l.ticker.replace(/-USD$/, ""),
          valeur: l.value ?? 0,
          couleur: nuancer(d.couleur, ecart),
          groupe: d.nom,
          ticker: l.ticker,
        });
      });
      if (d.especes && d.especes > 0) {
        blocs.push({
          cle: `${d.cle}/${CLE_ESPECES}`,
          nom: "Espèces",
          valeur: d.especes,
          // Assombries franchement : elles ne sont pas une ligne de plus, elles sont l'autre
          // nature du compte, et l'image doit le dire sans légende.
          couleur: nuancer(d.couleur, -0.24),
          groupe: d.nom,
        });
      }
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
 * Réunit sous « Autres » ce qui deviendrait un filet illisible.
 *
 * ⚠️ **C'est la réponse à l'objection qui avait fait retirer la treemap d'ici.** Le poids
 * codé par la surface rend les petites lignes minuscules ; vu à l'écran sur un panneau de
 * trois centimètres, une ligne à 15 % réduite à un trait vertical sans étiquette. Plutôt que
 * de dessiner ce qu'on ne peut pas lire, on le rassemble et on le nomme.
 *
 * ⚠️ **Le seuil est une part, pas un nombre de pixels.** Un nombre de pixels dépendrait de
 * la taille du panneau, donc changerait la composition de l'image d'un écran à l'autre : le
 * même portefeuille ne se raconterait pas pareil sur un portable et sur un moniteur.
 *
 * ⚠️ **Rien n'est regroupé s'il n'y a rien à gagner.** Un seul bloc sous le seuil devient
 * « Autres » tout seul — un rectangle de même taille, avec un nom moins précis. On ne
 * regroupe donc qu'à partir de deux.
 */
export function regrouperLesMiettes(
  blocs: Bloc[], seuil = 0.04,
): Bloc[] {
  const total = totalDesBlocs(blocs);
  if (total <= 0) return blocs;
  const miettes = blocs.filter(b => b.valeur / total < seuil);
  if (miettes.length < 2) return blocs;
  const gardes = blocs.filter(b => b.valeur / total >= seuil);
  return [...gardes, {
    cle: "autres",
    nom: `${miettes.length} autres`,
    valeur: miettes.reduce((s, b) => s + b.valeur, 0),
    couleur: "#3A4256",
  }];
}
