import { describe, expect, it } from "vitest";

import {
  ECART_INVITE, OEIL_REFERENCE, TAILLE_INVITE, TAILLE_REFERENCE,
} from "./avatarReglages";
import { RAYON_TETE, type Point2 } from "./avatarSpherique";
import { cheminOeilSurface } from "./avatarSurface";
import { solideDepuis } from "./avatarVolume";

/**
 * Le glyphe d'invite de commande : `>` à gauche, `_` à droite.
 *
 * ⚠️ **Ce qui se vérifie ici est une *composition*, pas une géométrie.** Les deux signes sont
 * dessinés par le même chemin d'œil que le regard, et cette partie-là est couverte ailleurs.
 * Ce qui se perd facilement, c'est l'accord entre eux : leur taille, leur jointure, leur
 * centrage. Trois nombres partagés le tiennent, et les deux rendus — `AvatarNovac` et le banc
 * `/avatar`, qui a sa propre copie du tracé — les lisent tous les deux.
 */

const largeur = OEIL_REFERENCE.largeur * TAILLE_REFERENCE;
const ouverte = OEIL_REFERENCE.hauteur * TAILLE_REFERENCE;
const ecart = OEIL_REFERENCE.ecart * TAILLE_REFERENCE;

function etendue(cote: -1 | 1): { min: number; max: number } {
  const reglages = cote < 0
    ? {
      largeur: largeur * TAILLE_INVITE, hauteur: ouverte * 0.88 * TAILLE_INVITE,
      ecart: ecart * ECART_INVITE.chevron, elevation: 0,
      inclinaison: 0, arrondi: 1, courbure: 0, pliure: -0.95,
    }
    : {
      largeur: ouverte * 0.62 * TAILLE_INVITE, hauteur: largeur * TAILLE_INVITE,
      ecart: ecart * ECART_INVITE.barre, elevation: -ouverte * 0.28,
      inclinaison: 0, arrondi: 1, courbure: 0, pliure: 0,
    };
  const d = cheminOeilSurface(
    reglages, { lacet: 0, tangage: 0 }, cote, RAYON_TETE, 260, solideDepuis("sphere", 1));
  const points: Point2[] = [];
  const re = /[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) points.push({ x: Number(m[1]), y: Number(m[2]) });
  const xs = points.map(p => p.x);
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

describe("le glyphe d'invite", () => {
  /**
   * ⚠️ **La jointure est ce qui fait lire `>_` d'un seul tenant.** À 1,73 et 1,42, les deux
   * signes étaient séparés de 17 unités de vide et se lisaient comme deux yeux dépareillés.
   */
  it("fait finir la pointe du chevron là où la barre commence", () => {
    const chevron = etendue(-1), barre = etendue(1);
    expect(Math.abs(barre.min - chevron.max)).toBeLessThan(2);
  });

  /**
   * ⚠️ **Refermer la jointure en ne bougeant qu'un signe déporte le glyphe entier.** C'est
   * l'erreur que ce second essai interdit : les deux écarts doivent se régler ensemble.
   */
  it("laisse le glyphe centré sur le visage", () => {
    const chevron = etendue(-1), barre = etendue(1);
    const centre = (chevron.min + barre.max) / 2;
    expect(Math.abs(centre)).toBeLessThan(3);
  });

  /**
   * ⚠️ **Le glyphe doit peser moins que le regard qu'il remplace.** À taille d'œil, les deux
   * signes écrasaient le visage : « les 2 yeux sont un peu trop grands ».
   */
  it("reste plus léger que les yeux qu'il remplace", () => {
    expect(TAILLE_INVITE).toBeLessThan(1);
    const aire = (e: { min: number; max: number }) => e.max - e.min;
    expect(aire(etendue(-1))).toBeLessThan(largeur * 2);
  });
});
