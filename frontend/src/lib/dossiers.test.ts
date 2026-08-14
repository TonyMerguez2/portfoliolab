import { describe, expect, it } from "vitest";

import {
  comptesParTicker, operationsDuDossier, repartirEnDossiers,
  type CompteRangeable, type EcritureRangeable,
} from "./dossiers";

/**
 * La répartition des lignes dans les dossiers.
 *
 * ⚠️ **Ce qui s'éprouve ici ne se voit pas à l'écran.** Un dossier qui compte une ligne de
 * trop affiche un montant plausible : rien ne clignote, rien ne manque, et l'on ne
 * s'aperçoit de rien tant qu'on n'additionne pas les dossiers à la main. C'est exactement
 * pourquoi le rangement a quitté le rendu pour une fonction.
 */

const ligne = (ticker: string, value: number | null) => ({ ticker, value });

const compte = (p: Partial<CompteRangeable> & { id: string }): CompteRangeable => ({
  nom: p.id, genre: "pea", couleur: "#5B6CF0", solde: null, porte_des_titres: true, ...p,
});

/** Les réglages du déduit, tels que la page les fournit. */
const deduction = {
  deduire: (t: string) => (t.endsWith(".PA") ? "PEA" : "CTO"),
  couleurDeduite: () => "#5B6CF0",
  nomDeduit: (e: string) => e,
  genreDeduit: (e: string) => e.toLowerCase(),
  ordreDeduits: ["PEA", "CTO", "Crypto"],
};

const repartir = (
  lignes: { ticker: string; value: number | null }[],
  ecritures: EcritureRangeable[],
  declares: CompteRangeable[] = [],
) => repartirEnDossiers({ lignes, ecritures, declares, ...deduction });

describe("le compte d'un ticker", () => {
  it("est celui de ses écritures quand elles s'accordent", () => {
    expect(comptesParTicker([
      { ticker: "MC.PA", compte_id: "a" },
      { ticker: "MC.PA", compte_id: "a" },
    ])).toEqual({ "MC.PA": "a" });
  });

  it("n'est aucun quand rien n'est rattaché", () => {
    expect(comptesParTicker([{ ticker: "AAPL" }, { ticker: "AAPL", compte_id: null }]))
      .toEqual({ AAPL: null });
  });

  it("n'est aucun quand deux comptes se disputent le même ticker", () => {
    /**
     * ⚠️ **La seule contradiction qui compte : deux rattachements pour un ticker.** Le même
     * titre détenu chez deux courtiers. Une position n'a qu'un prix de revient, calculé en
     * Python sur l'ensemble de ses opérations ; la couper demanderait de refaire ce calcul
     * ici, donc de tenir deux arithmétiques qui divergeraient.
     */
    expect(comptesParTicker([
      { ticker: "ESE.PA", compte_id: "a" },
      { ticker: "ESE.PA", compte_id: "b" },
    ])).toEqual({ "ESE.PA": null });
  });

  it("ne se laisse pas contredire par une écriture non classée", () => {
    /**
     * ⚠️ **Le test qui a corrigé la règle, et c'est l'écran qui l'a dicté.** J'exigeais
     * d'abord l'unanimité de *toutes* les écritures. Dans un portefeuille dont l'historique
     * n'est pas encore classé — c'est-à-dire tous, au début — le premier achat d'un titre
     * déjà détenu produisait aussitôt une divergence : mesuré, deux actions Apple achetées
     * **dans** le PEA déclaré sont allées grossir le dossier deviné CTO, sous les yeux de
     * qui venait de choisir le compte. Une écriture non classée n'affirme rien ; elle ne
     * peut donc rien contredire.
     */
    expect(comptesParTicker([
      { ticker: "MC.PA", compte_id: "a" },
      { ticker: "MC.PA", compte_id: null },
      { ticker: "MC.PA" },
    ])).toEqual({ "MC.PA": "a" });
  });
});

describe("la rangée de dossiers", () => {
  it("range les lignes rattachées dans leur compte, et le reste par déduction", () => {
    const dossiers = repartir(
      [ligne("MC.PA", 1000), ligne("AAPL", 500)],
      [{ ticker: "MC.PA", compte_id: "c1" }, { ticker: "AAPL", compte_id: null }],
      [compte({ id: "c1", nom: "PEA Boursorama" })],
    );
    expect(dossiers.map(d => [d.cle, d.lignes.map(l => l.ticker)]))
      .toEqual([["declare:c1", ["MC.PA"]], ["deduit:CTO", ["AAPL"]]]);
  });

  it("ne laisse jamais une ligne dans deux dossiers", () => {
    /**
     * ⚠️ **L'invariant pour lequel ce module existe.** Tant que les deux rangements
     * vivaient dans deux `.map` du rendu, une ligne rattachée restait dans son dossier
     * déduit : les deux montants l'additionnaient chacun de leur côté, et le total des
     * dossiers dépassait la valeur du portefeuille sans que rien ne le signale.
     */
    const lignes = [ligne("MC.PA", 1000), ligne("ESE.PA", 300), ligne("AAPL", 500)];
    const dossiers = repartir(lignes,
      [{ ticker: "MC.PA", compte_id: "c1" }, { ticker: "ESE.PA", compte_id: "c1" }],
      [compte({ id: "c1" })]);

    const vues = dossiers.flatMap(d => d.lignes.map(l => l.ticker));
    expect(vues.sort()).toEqual(["AAPL", "ESE.PA", "MC.PA"]);
    expect(new Set(vues).size, "une ligne apparaît dans deux dossiers").toBe(vues.length);
  });

  it("fait toujours la somme de la valeur totale", () => {
    /**
     * ⚠️ **La propriété qui remplace un accord tacite entre trois branches de JSX.** Trois
     * arithmétiques cohabitent : un compte de trésorerie vaut son solde, un dossier déduit
     * la somme de ses lignes, un compte à titres les deux. Qu'elles se recoupent était
     * jusqu'ici une intention ; c'est maintenant une exigence.
     */
    const lignes = [ligne("MC.PA", 1000), ligne("ESE.PA", 300.5), ligne("AAPL", 500.25)];
    const declares = [
      compte({ id: "c1", solde: 120.75 }),
      compte({ id: "livret", genre: "epargne", porte_des_titres: false, solde: 5000 }),
    ];
    const dossiers = repartir(lignes,
      [{ ticker: "MC.PA", compte_id: "c1" }], declares);

    const attendu = 1000 + 300.5 + 500.25 + 120.75 + 5000;
    expect(dossiers.reduce((s, d) => s + d.montant, 0)).toBeCloseTo(attendu, 6);
  });

  it("compte une valeur manquante pour zéro plutôt que de rendre NaN", () => {
    // Un cours indisponible laisse `value` à null. Propagé, il rendrait « NaN € ».
    const dossiers = repartir([ligne("AAPL", null), ligne("MSFT", 40)], []);
    expect(dossiers[0].montant).toBe(40);
  });

  it("vide le dossier déduit à mesure que ses lignes sont rattachées", () => {
    const lignes = [ligne("MC.PA", 1000), ligne("ESE.PA", 300)];
    const ecritures: EcritureRangeable[] = [
      { ticker: "MC.PA", compte_id: "c1" }, { ticker: "ESE.PA", compte_id: "c1" },
    ];
    const dossiers = repartir(lignes, ecritures, [compte({ id: "c1" })]);
    expect(dossiers.map(d => d.cle), "le dossier déduit vidé subsiste")
      .toEqual(["declare:c1"]);
  });

  it("garde un compte déclaré vide, mais jamais un dossier déduit vide", () => {
    /**
     * Un dossier déduit sans ligne promettrait un rangement qui n'existe pas. Un compte
     * déclaré sans ligne est un fait : l'épargnant l'a déclaré. Le cacher lui ferait croire
     * que sa déclaration a échoué.
     */
    const dossiers = repartir([], [], [compte({ id: "c1" })]);
    expect(dossiers.map(d => d.cle)).toEqual(["declare:c1"]);
    expect(dossiers[0].lignes).toEqual([]);
  });

  it("renvoie au déduit une ligne rattachée à un compte de trésorerie", () => {
    /**
     * ⚠️ **Ce test a trouvé une perte de ligne, et l'écran ne l'aurait pas montrée.** Le
     * serveur refuse ce rattachement des deux côtés, mais une base d'avant ce contrôle peut
     * en porter un. La ligne était alors retirée du déduit parce qu'elle avait un compte,
     * puis refusée par ce compte parce qu'il ne porte pas de titres : elle sortait de la
     * rangée entière. Le dossier ne la montrait plus et le total des dossiers cessait de
     * faire la valeur du portefeuille — sans rien clignoter.
     */
    const dossiers = repartir([ligne("MC.PA", 1000)],
      [{ ticker: "MC.PA", compte_id: "livret" }],
      [compte({ id: "livret", genre: "epargne", porte_des_titres: false, solde: 5000 })]);
    expect(dossiers[0].lignes).toEqual([]);
    expect(dossiers[0].montant).toBe(5000);
    expect(dossiers[1]?.cle, "la ligne a disparu de la rangée").toBe("deduit:PEA");
    expect(dossiers.reduce((s, d) => s + d.montant, 0)).toBe(6000);
  });

  it("renvoie au déduit une ligne rattachée à un compte disparu", () => {
    // Un compte supprimé pendant qu'on regarde l'écran laisse le même vide que le livret.
    const dossiers = repartir([ligne("MC.PA", 1000)],
      [{ ticker: "MC.PA", compte_id: "fantome" }]);
    expect(dossiers.map(d => d.cle)).toEqual(["deduit:PEA"]);
    expect(dossiers[0].montant).toBe(1000);
  });

  it("met les déclarés devant, dans l'ordre reçu, et les déduits dans l'ordre fiscal", () => {
    // ⚠️ Aucun tri par valeur : la rangée se réordonnerait au rythme des cours, et l'on
    // chercherait un dossier là où il était il y a quinze secondes.
    const dossiers = repartir(
      [ligne("AAPL", 9999), ligne("MC.PA", 1)],
      [],
      [compte({ id: "z" }), compte({ id: "a" })],
    );
    expect(dossiers.map(d => d.cle))
      .toEqual(["declare:z", "declare:a", "deduit:PEA", "deduit:CTO"]);
  });

  it("garde en queue une enveloppe absente de l'ordre plutôt que de la perdre", () => {
    const dossiers = repartirEnDossiers({
      lignes: [ligne("BTC", 200), ligne("MC.PA", 100)],
      ecritures: [], declares: [], ...deduction,
      deduire: (t: string) => (t === "BTC" ? "Inconnue" : "PEA"),
    });
    expect(dossiers.map(d => d.cle)).toEqual(["deduit:PEA", "deduit:Inconnue"]);
  });
});

describe("les opérations d'un dossier", () => {
  it("prend toutes les écritures de ses tickers, sans exception", () => {
    /**
     * ⚠️ **Un sous-ensemble se retournerait contre l'épargnant.** Une ligne à moitié
     * rattachée n'est plus unanime, donc redevient déduite : le dossier tout juste déclaré
     * annoncerait « aucun actif » alors qu'il vient d'en recevoir la moitié.
     */
    const dossiers = repartir([ligne("MC.PA", 100), ligne("AAPL", 50)], []);
    const pea = dossiers.find(d => d.cle === "deduit:PEA")!;
    const ecritures = [
      { id: 1, ticker: "MC.PA" }, { id: 2, ticker: "MC.PA", compte_id: null },
      { id: 3, ticker: "AAPL" },
    ];
    expect(operationsDuDossier(pea, ecritures)).toEqual([1, 2]);
  });

  it("ne rend rien pour un dossier sans ligne", () => {
    const dossiers = repartir([], [], [compte({ id: "c1" })]);
    expect(operationsDuDossier(dossiers[0], [{ id: 1, ticker: "MC.PA" }])).toEqual([]);
  });
});
