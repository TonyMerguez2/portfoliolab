import { describe, expect, it, vi } from "vitest";

import { jouerEtalement, releverLesCartes, type Positions } from "./etalement";

/**
 * L'étalement des cartes à l'ouverture d'un dossier.
 *
 * ⚠️ **Ce qui s'éprouve ici, c'est surtout le refus de jouer.** Une animation ratée ne
 * ressemble pas à une animation absente : elle laisse des cartes figées hors du cadre par
 * une transformation qu'aucun rendu ne vient effacer. Les cas où l'on s'abstient comptent
 * donc plus que celui où l'on joue.
 */

/** Une fausse carte, qui note les animations qu'on lui demande. */
function carte(ticker: string, x: number, y = 0) {
  const jouees: { transformDepart: string; opaciteDepart: number; delai: number }[] = [];
  return {
    el: {
      dataset: { carte: ticker },
      getBoundingClientRect: () => ({ left: x, top: y, width: 248, height: 196 }),
      animate: (images: Keyframe[], reglages: KeyframeAnimationOptions) => {
        jouees.push({
          transformDepart: String(images[0].transform),
          opaciteDepart: Number(images[0].opacity),
          delai: Number(reglages.delay),
        });
      },
    },
    jouees,
  };
}

/** Une racine qui rend les cartes fournies, comme le ferait le DOM. */
const racineAvec = (cartes: { el: unknown }[]) => ({
  querySelectorAll: () => cartes.map(c => c.el),
}) as unknown as ParentNode;

const positions = (paires: [string, number, number?][]): Positions =>
  new Map(paires.map(([t, x, y]) => [t, { x, y: y ?? 0 }]));

describe("l'étalement", () => {
  it("ramène chaque carte à sa position d'avant, puis à zéro", () => {
    // Mesuré à l'écran : la pile est à x = 88/102/116, la rangée à x = 78/336/594.
    const a = carte("ESE.PA", 78), b = carte("ETZ.PA", 336);
    jouerEtalement(positions([["ESE.PA", 116], ["ETZ.PA", 102]]),
      racineAvec([a, b]), { refuse: false });

    expect(a.jouees[0].transformDepart).toBe("translate(38px, 0px)");
    expect(b.jouees[0].transformDepart).toBe("translate(-234px, 0px)");
    expect(a.jouees[0].opaciteDepart).toBe(1);
  });

  it("échelonne les départs, et borne la cascade", () => {
    /**
     * ⚠️ **Sans borne, le douzième actif partirait une demi-seconde après le premier.**
     * L'éventail se lit sur les premières cartes ; au-delà, le retard ne s'ajoute plus au
     * geste, il s'ajoute à l'attente.
     */
    // La pile est à 500 : toutes les cartes bougent, y compris la première — sans quoi
    // elle serait écartée du décompte et le premier retard mesuré serait celui de la
    // deuxième.
    const cartes = Array.from({ length: 10 }, (_, i) => carte(`T${i}`, i * 258));
    jouerEtalement(positions([["T0", 500]]), racineAvec(cartes), { refuse: false });
    const delais = cartes.map(c => c.jouees[0]?.delai).filter(d => d != null);
    expect(delais[0]).toBe(0);
    expect(Math.max(...delais)).toBe(6 * 45);
  });

  it("fait partir du fond de la pile, en fondu, ce qui n'avait pas d'aperçu", () => {
    /**
     * Un dossier ne laisse voir que trois cartes et en contient parfois douze. Immobiles,
     * les autres casseraient l'éventail en deux moitiés dont l'une ne bouge pas.
     */
    const inconnue = carte("PAEJ.PA", 594);
    jouerEtalement(positions([["ESE.PA", 116], ["ETZ.PA", 88]]),
      racineAvec([inconnue]), { refuse: false });
    expect(inconnue.jouees[0].transformDepart).toBe("translate(-506px, 0px)");
    expect(inconnue.jouees[0].opaciteDepart, "elle jaillirait de nulle part").toBe(0);
  });

  it("ne joue rien quand le mouvement est refusé", () => {
    const a = carte("ESE.PA", 78);
    expect(jouerEtalement(positions([["ESE.PA", 116]]), racineAvec([a]), { refuse: true }))
      .toBe(0);
    expect(a.jouees).toEqual([]);
  });

  it("ne joue rien sans mesure de départ, plutôt que de deviner", () => {
    /**
     * ⚠️ **Le repli qui compte.** Sans position d'avant, on pourrait inventer un point de
     * départ — le bord de l'écran, le centre. Ce serait une animation qui ne raconte rien
     * et qui peut se tromper de sens. L'affichage instantané, lui, n'est jamais faux.
     */
    const a = carte("ESE.PA", 78);
    expect(jouerEtalement(new Map(), racineAvec([a]), { refuse: false })).toBe(0);
    expect(a.jouees).toEqual([]);
  });

  it("ne joue rien quand la racine a disparu entre-temps", () => {
    expect(jouerEtalement(positions([["ESE.PA", 116]]), null, { refuse: false })).toBe(0);
  });

  it("laisse tranquille une carte qui n'a pas bougé", () => {
    // Rouvrir le même dossier, ou un rendu qui ne déplace rien : une image de plus pour
    // rien, et un fondu perceptible sur une carte immobile.
    const a = carte("ESE.PA", 78);
    expect(jouerEtalement(positions([["ESE.PA", 78]]), racineAvec([a]), { refuse: false }))
      .toBe(0);
  });
});

describe("le relevé des cartes", () => {
  it("ignore les cartes sans surface", () => {
    /**
     * Une carte masquée — la grille en vue liste, par exemple — mesure zéro. La retenir
     * ferait partir sa jumelle du coin haut-gauche de la fenêtre.
     */
    const racine = {
      querySelectorAll: () => [
        { dataset: { carte: "ESE.PA" },
          getBoundingClientRect: () => ({ left: 10, top: 20, width: 248, height: 196 }) },
        { dataset: { carte: "MASQUEE" },
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) },
      ],
    };
    const releve = releverLesCartes(racine as unknown as ParentNode);
    expect(Array.from(releve.keys())).toEqual(["ESE.PA"]);
    expect(releve.get("ESE.PA")).toEqual({ x: 10, y: 20 });
  });

  it("ne retient que la première d'un ticker en double", () => {
    // Un même titre peut figurer dans deux dossiers ; c'est celui qu'on voit qui compte,
    // et le premier du document est celui de la rangée.
    const rect = (l: number) => ({ left: l, top: 0, width: 248, height: 196 });
    const racine = {
      querySelectorAll: () => [
        { dataset: { carte: "ESE.PA" }, getBoundingClientRect: () => rect(10) },
        { dataset: { carte: "ESE.PA" }, getBoundingClientRect: () => rect(999) },
      ],
    };
    expect(releverLesCartes(racine as unknown as ParentNode).get("ESE.PA")!.x).toBe(10);
  });

  it("rend un relevé vide plutôt que d'échouer sans racine", () => {
    expect(releverLesCartes(null).size).toBe(0);
    expect(vi.isMockFunction(releverLesCartes)).toBe(false);
  });
});
