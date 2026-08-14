/**
 * La répartition des lignes dans les dossiers de la vue générale.
 *
 * ⚠️ **Deux sortes de dossiers, et une seule rangée.** Les **déclarés** existent en base :
 * l'épargnant a dit « j'ai un PEA chez Boursorama ». Les **déduits** n'existent nulle part :
 * `compteInfere` range chaque ligne d'après sa place de cotation, ce qui ne sait ni
 * distinguer deux PEA ni décrire un compte courant. Les seconds sont un **chemin de
 * reprise** — ils s'effacent à mesure que les lignes sont rattachées.
 *
 * ⚠️ **L'invariant que ce module existe pour tenir : une ligne est dans un dossier, et un
 * seul.** Tant que les deux rangements vivaient dans deux `.map` du rendu, rien ne
 * l'empêchait de compter deux fois — une ligne rattachée serait restée dans son dossier
 * déduit, et les deux montants l'auraient additionnée chacun de son côté. Le test qui
 * compte le plus ici vérifie que la somme des dossiers redonne la valeur totale.
 *
 * ⚠️ **Aucun nœud React ici.** Pictogrammes et cartes d'aperçu appartiennent à l'écran ; ce
 * module ne rend que des descriptions. C'est ce qui le rend éprouvable sans monter de
 * composant — la maison teste des fonctions pures, elle n'a aucun test de rendu.
 *
 * ⚠️ Chemins relatifs et non l'alias « @/ » : Vitest tourne sans configuration et ne le
 * résout pas.
 */

/** Ce qu'une ligne doit porter pour être rangée : de quoi la nommer et la valoriser. */
export type LigneRangeable = { ticker: string; value: number | null };

/** Ce qu'un compte déclaré doit porter pour tenir un dossier. */
export type CompteRangeable = {
  id: string;
  nom: string;
  genre: string;
  couleur: string;
  solde: number | null;
  porte_des_titres: boolean;
};

/** Une écriture, réduite à ce qui décide de son rangement. */
export type EcritureRangeable = { ticker: string; compte_id?: string | null };

export type Dossier<L extends LigneRangeable> = {
  /**
   * ⚠️ **Préfixée, et ce n'est pas une coquetterie.** Un compte déclaré nommé « PEA » et le
   * dossier déduit « PEA » coexistent forcément pendant la reprise — les lignes rattachées
   * d'un côté, les autres de l'autre. Sans préfixe, ouvrir l'un ouvrirait l'autre, et le
   * bug n'attendrait que le premier épargnant méthodique.
   */
  cle: string;
  nom: string;
  couleur: string;
  /** Déclaré par l'épargnant, ou seulement deviné ? */
  declare: boolean;
  porteDesTitres: boolean;
  /** Le genre serveur — `pea`, `cto`, `crypto`, `courant`, `epargne` — qui donne le dessin. */
  genre: string;
  /** L'identifiant du compte déclaré, ou `null` pour un dossier deviné. */
  compteId: string | null;
  lignes: L[];
  /** Les espèces déclarées, ou `null` quand rien n'a été saisi. */
  especes: number | null;
  /** Ce que le dossier vaut : ses lignes, plus ses espèces. */
  montant: number;
};

/**
 * À quel compte déclaré appartient chaque ticker.
 *
 * ⚠️ **Règle d'unanimité : toutes les opérations, ou aucune.** Une position est un agrégat
 * indivisible — `compute_positions` groupe par ticker et n'en tient qu'un seul prix de
 * revient. La couper entre deux comptes demanderait de recalculer ce PRU par sous-ensemble,
 * donc de réécrire en TypeScript une arithmétique qui vit en Python et y est éprouvée. Tant
 * que ce n'est pas fait, un ticker dont les opérations divergent reste **déduit**, ce qui
 * est déjà le domicile de tout ce qui n'est pas rangé.
 *
 * ⚠️ **`null` recouvre ici deux faits, et c'est délibéré à cet endroit précis** — « aucune
 * opération n'est rattachée » et « elles ne s'accordent pas ». Les deux mènent au même
 * rangement, et les distinguer n'aurait servi qu'à faire choisir l'appelant entre deux
 * branches identiques. Ce serait un défaut dans un contrat de route, où l'appelant est
 * lointain ; c'en est un de moins dans une fonction qui ne répond qu'à « où va cette ligne ».
 */
export function comptesParTicker(
  ecritures: EcritureRangeable[],
): Record<string, string | null> {
  const vu: Record<string, string | null> = {};
  const divergent = new Set<string>();
  for (const e of ecritures) {
    const compte = e.compte_id ?? null;
    if (!(e.ticker in vu)) { vu[e.ticker] = compte; continue; }
    if (vu[e.ticker] !== compte) divergent.add(e.ticker);
  }
  divergent.forEach(t => { vu[t] = null; });
  return vu;
}

/** La valorisation d'un paquet de lignes, les valeurs manquantes comptant pour zéro. */
const valeurDe = (lignes: LigneRangeable[]): number =>
  lignes.reduce((s, l) => s + (l.value ?? 0), 0);

/**
 * La rangée de dossiers, déclarés puis déduits.
 *
 * ⚠️ **Les déclarés passent devant, et l'ordre ne se recalcule pas.** Le serveur les trie
 * déjà par rang puis par date de création ; les retrier ici ferait deux vérités. Les déduits
 * suivent `ordreDeduits`, qui est fiscal — le PEA d'abord parce que c'est l'enveloppe
 * contrainte.
 *
 * ⚠️ **Aucun tri par valeur, nulle part.** La rangée se réordonnerait au rythme des cours,
 * et l'on chercherait un dossier là où il était il y a quinze secondes.
 *
 * ⚠️ **Un dossier déduit vide n'est pas rendu ; un dossier déclaré vide, si.** Le premier
 * promettrait un rangement qui n'existe pas — un dossier « Crypto » à zéro ligne sur un
 * portefeuille qui n'en contient pas. Le second est un fait : l'épargnant a déclaré ce
 * compte, il est vide, et le lui cacher lui ferait croire que sa déclaration a échoué.
 */
export function repartirEnDossiers<L extends LigneRangeable>({
  lignes, ecritures, declares, deduire, couleurDeduite, nomDeduit, genreDeduit, ordreDeduits,
}: {
  lignes: L[];
  ecritures: EcritureRangeable[];
  declares: CompteRangeable[];
  /** L'enveloppe devinée d'un ticker — voir `compteInfere`. */
  deduire: (ticker: string) => string;
  couleurDeduite: (enveloppe: string) => string;
  nomDeduit: (enveloppe: string) => string;
  /** Le genre serveur correspondant à une enveloppe devinée — voir `GENRE_DE`. */
  genreDeduit: (enveloppe: string) => string;
  ordreDeduits: string[];
}): Dossier<L>[] {
  const compteDe = comptesParTicker(ecritures);

  const ranger = <K>(m: Map<K, L[]>, cle: K, ligne: L) => {
    const paquet = m.get(cle);
    if (paquet) paquet.push(ligne); else m.set(cle, [ligne]);
  };

  /**
   * ⚠️ **Un compte n'accueille une ligne que s'il existe *et* porte des titres.** Le
   * serveur refuse déjà l'inverse des deux côtés, mais une base d'avant ce contrôle peut
   * porter un rattachement à un livret — et un compte supprimé pendant qu'on regarde
   * l'écran laisse le même vide.
   *
   * ⚠️ **La ligne écartée retombe dans le déduit, elle ne s'évapore pas.** Écrit d'abord
   * autrement — retirée du déduit parce qu'elle avait un compte, puis refusée par ce
   * compte — elle sortait de la rangée entière : le dossier ne la montrait plus et le total
   * des dossiers cessait de faire la valeur du portefeuille. Un test l'a attrapée, l'écran
   * ne l'aurait pas montrée.
   */
  const accueillants = new Map(
    declares.filter(c => c.porte_des_titres).map(c => [c.id, c]),
  );

  const parCompte = new Map<string, L[]>();
  const restantes: L[] = [];
  for (const l of lignes) {
    const id = compteDe[l.ticker] ?? null;
    if (id != null && accueillants.has(id)) ranger(parCompte, id, l);
    else restantes.push(l);
  }

  const dossiers: Dossier<L>[] = declares.map(c => {
    const siennes = parCompte.get(c.id) ?? [];
    return {
      cle: `declare:${c.id}`,
      nom: c.nom,
      couleur: c.couleur,
      declare: true,
      porteDesTitres: c.porte_des_titres,
      genre: c.genre,
      compteId: c.id,
      lignes: siennes,
      especes: c.solde,
      montant: valeurDe(siennes) + (c.solde ?? 0),
    };
  });

  const parEnveloppe = new Map<string, L[]>();
  for (const l of restantes) ranger(parEnveloppe, deduire(l.ticker), l);

  // Un rang au-delà du dernier pour une enveloppe absente de la liste : elle part en queue
  // plutôt que de disparaître. Aucune ligne ne doit quitter l'écran à la faveur d'un oubli.
  const rang = (e: string) => {
    const i = ordreDeduits.indexOf(e);
    return i < 0 ? ordreDeduits.length : i;
  };

  const enveloppes = Array.from(parEnveloppe.keys()).sort((a, b) => rang(a) - rang(b));
  for (const e of enveloppes) {
    const siennes = parEnveloppe.get(e)!;
    dossiers.push({
      cle: `deduit:${e}`,
      nom: nomDeduit(e),
      couleur: couleurDeduite(e),
      declare: false,
      porteDesTitres: true,
      genre: genreDeduit(e),
      compteId: null,
      lignes: siennes,
      especes: null,
      montant: valeurDe(siennes),
    });
  }

  return dossiers;
}

/**
 * Les identifiants des opérations d'un dossier, pour les rattacher d'un coup.
 *
 * ⚠️ **Toutes les écritures des tickers du dossier, sans exception.** Déclarer un dossier
 * prend ce qu'il contient : un sous-ensemble laisserait des lignes à moitié rangées, donc
 * non unanimes, donc **déduites** — le dossier tout juste déclaré annoncerait « aucun
 * actif » alors que l'épargnant vient d'y ranger la moitié de son histoire.
 */
export function operationsDuDossier<L extends LigneRangeable>(
  dossier: Dossier<L>, ecritures: (EcritureRangeable & { id: number })[],
): number[] {
  const tickers = new Set(dossier.lignes.map(l => l.ticker));
  return ecritures.filter(e => tickers.has(e.ticker)).map(e => e.id);
}
