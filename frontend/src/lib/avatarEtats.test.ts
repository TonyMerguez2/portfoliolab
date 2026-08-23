import { describe, expect, it } from "vitest";

import { GESTES_LIBRES, etatParCle } from "./avatarEtats";

/**
 * Le répertoire des gestes que le visage se permet quand on l'a laissé seul.
 */

describe("les gestes du vagabondage", () => {
  /**
   * ⚠️ **Le tour complet doit être *dans* le mouvement libre, et pas seulement exister.**
   * Il a longtemps existé sans jamais se produire : c'est le genre de geste qu'on croit
   * livré parce qu'on l'a écrit. L'essai le cloue au répertoire.
   */
  it("comprend le tour complet et l'invite", () => {
    expect([...GESTES_LIBRES]).toContain("tour");
    expect([...GESTES_LIBRES]).toContain("invite");
  });

  /**
   * ⚠️ **Tous ponctuels, sans quoi le visage resterait bloqué dedans.** Un état soutenu
   * s'installe jusqu'à ce qu'autre chose le remplace ; tiré au sort pendant le vagabondage,
   * il ne repartirait jamais. Le répertoire n'accepte donc que des gestes qui passent.
   */
  it("ne contient que des gestes qui passent", () => {
    for (const cle of GESTES_LIBRES) {
      const etat = etatParCle(cle);
      expect(etat, cle).toBeDefined();
      expect(etat.nature, cle).toBe("ponctuel");
      expect(etat.duree, cle).toBeGreaterThan(0);
    }
  });

  /**
   * ⚠️ **Le tour se referme sur lui-même, et rien d'autre ne le peut.** Son animation
   * s'ajoute à la pose et **disparaît d'un coup** à la fin de l'état : toute valeur d'arrivée
   * autre que zéro — ou 360°, qui lui est identique — ferait sauter la tête d'un cran.
   */
  it("laisse le tour complet revenir exactement à sa pose", () => {
    const tour = etatParCle("tour");
    const fin = tour.anime?.(tour.duree ?? 0, 0) ?? {};
    expect((fin.lacet ?? 0) % 360).toBeCloseTo(0, 6);
    expect(fin.roulis ?? 0).toBeCloseTo(0, 6);
    expect(fin.echelleX ?? 1).toBeCloseTo(1, 6);
    expect(fin.echelleY ?? 1).toBeCloseTo(1, 6);
  });
});

describe("la colère", () => {
  const colere = etatParCle("colere");
  const sceptique = etatParCle("sceptique");

  /**
   * ⚠️ **Elle se tient, elle ne passe pas.** Une colère ponctuelle serait une saute d'humeur :
   * elle retomberait toute seule au bout d'une seconde, alors que ce que l'expression dit —
   * une action refusée coup sur coup, une perte qui s'aggrave — dure tant que la situation
   * dure. C'est la même nature que le sceptique, et pour la même raison.
   */
  it("se tient tant que la situation dure", () => {
    expect(colere.nature).toBe("soutenu");
    expect(colere.duree).toBeUndefined();
  });

  /**
   * ⚠️ **Le signe de l'inclinaison est ce qui fait la colère, et s'être trompé a coûté deux
   * allers-retours.** Positive, elle **monte** les bouts intérieurs des yeux : `/ \`, le
   * visage de celui qui implore — vu à l'écran comme un caprice. Négative, elle les descend
   * vers le nez : `\ /`, et c'est le seul sens qui durcit. L'essai fixe le signe, pas
   * seulement l'ampleur, parce que c'est le signe qui s'est perdu.
   */
  it("descend les bouts intérieurs des yeux, et ne les monte pas", () => {
    const pose = typeof colere.pose === "function" ? colere.pose(0) : colere.pose;
    expect(pose.inclinaison ?? 0).toBeLessThan(-16);
    expect(pose.hauteur ?? 1).toBeLessThan(1);
    /* Et l'œil s'étire au lieu de seulement s'écraser — c'est ce qui le sépare du doute. */
    expect(pose.largeur ?? 1).toBeGreaterThan(1);
    /* Le sceptique penche de l'autre côté : les deux ne peuvent pas se confondre. */
    const doute = typeof sceptique.pose === "function" ? sceptique.pose(0) : sceptique.pose;
    expect(Math.sign(pose.inclinaison ?? 0)).not.toBe(Math.sign(doute.inclinaison ?? 0));
  });

  /**
   * ⚠️ **L'œil reste droit : le chevron a été essayé et refusé.** Plier l'œil en `> <` donne
   * un angle franc et se mesure bien — mais à l'écran cela se lit comme un caprice, pas comme
   * de la colère. L'angle infantilise, la barre penchée durcit. L'essai empêche que la pliure
   * revienne par une bonne intention géométrique.
   */
  it("garde l'œil droit, sans chevron", () => {
    const pose = typeof colere.pose === "function" ? colere.pose(0) : colere.pose;
    expect(pose.pliure ?? 0).toBe(0);
    expect(pose.courbure ?? 0).toBe(0);
  });

  /**
   * ⚠️ **Le volume vibre avec la tête, et son amplitude reste sous les cinq centièmes.** Sur
   * un état soutenu, `anime` disparaît d'un coup au changement d'état : une pulsation ample se
   * paierait en sursaut du volume au moment de la sortie.
   */
  it("fait vibrer le volume, en opposition et de peu", () => {
    let mn = 9, mx = 0, opposees = true;
    for (let e = 0; e < 3000; e += 5) {
      const m = colere.anime?.(e, 0) ?? {};
      const x = m.echelleX ?? 1, y = m.echelleY ?? 1;
      mn = Math.min(mn, x); mx = Math.max(mx, x);
      /* Ce qui s'élargit se tasse : sinon le volume enfle, et cela se lit comme un zoom. */
      if (Math.abs(x - 1) > 1e-6 && (x - 1) * (y - 1) > 0) opposees = false;
    }
    /* ⚠️ Entre un demi et cinq centièmes : en dessous le volume ne bouge plus à l'écran, au
       dessus il sursaute au moment où l'on quitte l'état. */
    expect(mx - 1).toBeGreaterThan(0.005);
    expect(mx - 1).toBeLessThan(0.05);
    expect(1 - mn).toBeCloseTo(mx - 1, 3);
    expect(opposees).toBe(true);
  });

  /**
   * ⚠️ **Le frémissement doit rester minuscule, parce que l'état est soutenu.** `anime`
   * disparaît d'un coup quand on change d'état, et un état soutenu se quitte à n'importe quel
   * instant : toute amplitude se paierait en saut du visage à la sortie. Le même piège que le
   * décalage constant, mesuré ailleurs à quinze degrés de saut en une image.
   */
  it("tremble vite et court, sans faire sauter le visage en sortant", () => {
    let pire = 0, changements = 0, precedent = 0;
    for (let e = 0; e < 4000; e += 5) {
      const m = colere.anime?.(e, 0) ?? {};
      const lacet = m.lacet ?? 0;
      pire = Math.max(pire, Math.abs(lacet), Math.abs(m.tangage ?? 0), Math.abs(m.roulis ?? 0));
      if (Math.sign(lacet) !== Math.sign(precedent) && precedent !== 0) changements++;
      precedent = lacet;
    }
    /* ⚠️ Un degré et demi : ce qui reste sur la table au moment où l'on quitte l'état, le
       visage le rattrape en une image. La borne haute vient de là — quinze degrés se voyaient
       comme un sursaut. La borne basse, elle, vient du fait qu'un tremblement qu'on ne voit
       pas n'est pas un tremblement : sous un demi-degré, il n'y a plus rien à l'écran. */
    expect(pire).toBeGreaterThan(0.5);
    expect(pire).toBeLessThan(2);
    /* ⚠️ Et surtout : *vite*. Un tremblement se reconnaît à sa fréquence, pas à son ampleur.
       Huit passages par zéro et par seconde au minimum ; en dessous, on lit un balancement. */
    expect(changements / 4).toBeGreaterThan(8);
  });


  /**
   * ⚠️ **Un œil clos est un trait horizontal, quelle que soit l'humeur.** La fermeture réduit
   * la hauteur de l'œil, donc son *propre* axe — et cet axe est penché dès qu'une expression
   * l'incline. À 31° de colère, l'œil clos restait un trait oblique de 21 × 14 unités au lieu
   * de s'aplatir, contre 24 × 3 pour un œil droit : cela se lisait comme un œil qui se ferme
   * sur les côtés. Les deux rendus effacent donc l'inclinaison à mesure que la paupière tombe.
   *
   * L'essai reproduit ce calcul plutôt que d'appeler les composants, qui sont du React : ce
   * qu'il verrouille est la **règle**, `incl × (1 − fermeture)`, et le fait qu'elle s'annule
   * bien à la fermeture complète.
   */
  it("ferme l'œil à plat, même sur un visage incliné", () => {
    const pose = typeof colere.pose === "function" ? colere.pose(0) : colere.pose;
    const inclinaison = pose.inclinaison ?? 0;
    expect(inclinaison).not.toBe(0);
    const penche = (fermeture: number) => inclinaison * (1 - fermeture);
    /* Ouvert, l'accent est entier ; à mi-course, il n'en reste que la moitié. */
    expect(penche(0)).toBe(inclinaison);
    expect(Math.abs(penche(0.5))).toBeCloseTo(Math.abs(inclinaison) / 2, 6);
    /* Clos, il ne reste rien : le trait est droit. */
    expect(penche(1)).toBeCloseTo(0, 10);
  });

});

describe("le blasé", () => {
  const blase = etatParCle("blase");
  const pose = typeof blase.pose === "function" ? blase.pose(0) : blase.pose;

  /**
   * ⚠️ **C'est une paupière, pas un sourcil : aucun angle nulle part.** Un accent ferait
   * basculer l'œil dans une humeur — vers le bas la colère, vers le haut la peine — alors que
   * l'indifférence est l'absence des deux. C'est la seule expression du répertoire qui ne se
   * sert d'aucun angle, et c'est ce qui la distingue de toutes les autres.
   */
  it("garde l'œil rigoureusement droit", () => {
    expect(pose.inclinaison ?? 0).toBe(0);
    expect(pose.pliure ?? 0).toBe(0);
    expect(pose.courbure ?? 0).toBe(0);
  });

  /**
   * ⚠️ **Une fente large : l'œil perd les quatre cinquièmes de sa hauteur et gagne la moitié
   * de sa largeur.** Les deux vont ensemble — seulement l'écraser donnerait un œil qui se
   * ferme, donc de la fatigue ; l'élargir en même temps donne le regard qui a déjà tout vu.
   */
  it("écrase l'œil et l'élargit, les deux à la fois", () => {
    expect(pose.hauteur ?? 1).toBeLessThan(0.25);
    expect(pose.largeur ?? 1).toBeGreaterThan(1.4);
  });

  /**
   * ⚠️ **Rien ne bouge, et c'est l'expression même.** Lui ajouter une oscillation, même
   * minuscule, lui rendrait de l'intérêt pour ce qu'il regarde.
   */
  it("n'a aucun mouvement propre", () => {
    expect(blase.anime).toBeUndefined();
    /* Mais il garde un peu de dérive : immobile pour de bon, il se lirait comme éteint. */
    expect(pose.derive ?? 1).toBeGreaterThan(0);
  });
});
