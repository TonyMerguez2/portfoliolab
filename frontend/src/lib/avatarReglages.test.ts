import { describe, expect, it } from "vitest";

import {
  ARRONDI_REFERENCE, OEIL_REFERENCE, TAILLE_REFERENCE, VIE_REFERENCE,
} from "./avatarReglages";
import { cheminOeil, cheminSvg, contourSilhouette, type Point2 } from "./avatarSpherique";
import { solideDepuis, type FamilleSolide } from "./avatarVolume";

/**
 * Le tableau de bord rend-il exactement ce que le banc d'essai montre ?
 *
 * ⚠️ **La question ne se pose que parce qu'elle s'est déjà mal posée.** Les mêmes
 * nombres vivaient en double — état initial d'un côté, constantes de l'autre — et ils
 * ont divergé : arrondi 0,30 ici contre 0,50 là, capsules de 32 unités contre 23. La
 * même forme ne rendait plus pareil aux deux endroits, ce qui rend le banc inutile
 * puisqu'il ne montre plus ce qu'on obtiendra. Ces tests fixent l'égalité **forme par
 * forme**, et non en gros : c'est la seule façon qu'une famille ajoutée demain ne
 * reparte pas en silence.
 */

const FORMES: FamilleSolide[] = ["sphere", "cube", "etoile", "etoile6", "coussin"];

/** Ce que le composant de l'application construit, reproduit ici à l'identique. */
const solideDeLApplication = (f: FamilleSolide) => solideDepuis(f, ARRONDI_REFERENCE);
/** Ce que le banc d'essai construit au chargement. */
const solideDuBanc = (f: FamilleSolide) =>
  solideDepuis(f, f === "sphere" ? 1 : ARRONDI_REFERENCE);

describe("le tableau de bord et le banc d'essai", () => {
  it("donnent le même solide pour chaque forme", () => {
    for (const f of FORMES) {
      expect(solideDeLApplication(f)).toEqual(solideDuBanc(f));
    }
  });

  it("donnent le même contour de tête, au centième d'unité", () => {
    for (const f of FORMES) {
      const a = cheminSvg(contourSilhouette(solideDeLApplication(f), 100, 180));
      const b = cheminSvg(contourSilhouette(solideDuBanc(f), 100, 180));
      expect(a).toBe(b);
    }
  });

  it("donnent le même œil, forme par forme", () => {
    /**
     * L'œil traverse la silhouette : sa taille, son écart, son arrondi et le solide sur
     * lequel il est peint doivent tous coïncider pour que le `d` soit identique.
     */
    const reglages = {
      ecart: OEIL_REFERENCE.ecart * TAILLE_REFERENCE,
      elevation: OEIL_REFERENCE.elevation * TAILLE_REFERENCE,
      largeur: OEIL_REFERENCE.largeur * TAILLE_REFERENCE,
      hauteur: OEIL_REFERENCE.hauteur * TAILLE_REFERENCE,
      inclinaison: 0,
      arrondi: OEIL_REFERENCE.forme === "capsule" ? 1 : OEIL_REFERENCE.arrondi,
    };
    for (const f of FORMES) {
      for (const cote of [-1, 1] as const) {
        const o = { lacet: 0.2, tangage: -0.1 };
        const a = cheminOeil(reglages, o, cote, 100, 160, solideDeLApplication(f));
        const b = cheminOeil(reglages, o, cote, 100, 160, solideDuBanc(f));
        expect(a).toBe(b);
      }
    }
  });

  it("gardent la référence à des valeurs qui se voient", () => {
    /**
     * ⚠️ Un garde-fou contre l'ajustement distrait : ces nombres sont désormais lus par
     * deux endroits, et les changer change les deux. Les bornes disent ce qui reste
     * lisible à soixante-trois pixels — la capsule y fait sept pixels de large — et ce
     * qui garde un côté droit sur le carré.
     */
    expect(OEIL_REFERENCE.largeur * TAILLE_REFERENCE * 63 / 200).toBeGreaterThan(5);
    expect(ARRONDI_REFERENCE).toBeGreaterThan(0.2);
    expect(ARRONDI_REFERENCE).toBeLessThan(0.75);
    expect(VIE_REFERENCE.amplitude).toBeGreaterThan(0);
  });

  it("ne laisse aucune forme sortir du carré de la tête", () => {
    for (const f of FORMES) {
      const pts: Point2[] = contourSilhouette(solideDeLApplication(f), 100, 360);
      for (const p of pts) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(100.0001);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(100.0001);
      }
    }
  });
});
