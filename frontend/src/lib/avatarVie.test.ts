import { describe, expect, it } from "vitest";

import {
  ETATS, MARCHE_AGGRAVATION, POSE_NEUTRE, etatParCle, etatSelonAggravation,
  etatSelonEcartCourbe, etatSelonVariation, lireMarqueAvatar, marqueAvatar, poseDeLEtat,
} from "./avatarEtats";
import { type EtatVie, type ReglagesVie, VIE_AU_REPOS, creerVie } from "./avatarVie";

/**
 * Une machine à états se vérifie-t-elle autrement qu'à l'œil ?
 *
 * ⚠️ **Oui, et c'est tout l'intérêt d'avoir sorti le temps du rendu.** Durées tenues,
 * retour exact au repos, continuité, bornes : rien de tout cela ne se voit sur une
 * capture d'écran, et tout se rate sur un instant qu'on n'a pas su saisir. Ces tests
 * simulent des minutes entières, image par image.
 *
 * ⚠️ Le tirage au sort est injecté. Une logique de temps qui tire à chaque appel donne
 * un résultat différent à chaque exécution, et un test qui échoue une fois sur vingt
 * finit par être ignoré.
 */

const REGLAGES: ReglagesVie = {
  derive: 3, clignement: true, cadenceClignement: 4, spontane: true, cadenceSpontane: 5,
};
/**
 * Tout coupé.
 *
 * ⚠️ **`spontane: false` en fait partie**, et l'oublier a fait tomber un test : les
 * gestes que le visage se donne tout seul sont, par définition, du mouvement que
 * personne n'a demandé. Un régime dit « calme » qui les laisserait passer ne mesurerait
 * plus l'état qu'on croit isoler.
 */
const CALME: ReglagesVie = {
  derive: 0, clignement: false, cadenceClignement: 4, spontane: false,
};
const FIGE = (v: number) => () => v;

/** Fait tourner la vie à 60 images par seconde et rend toutes les images. */
function simuler(
  vie: ReturnType<typeof creerVie>, secondes: number,
  reglages: ReglagesVie = REGLAGES, depart = 0,
): EtatVie[] {
  const images: EtatVie[] = [];
  for (let t = depart; t <= depart + secondes * 1000; t += 1000 / 60) {
    images.push(vie.avancer(t, reglages));
  }
  return images;
}

/**
 * L'état à son apogée.
 *
 * ⚠️ **Un ponctuel se mesure *pendant*, pas après**, et ma première version l'oubliait :
 * elle laissait tourner deux secondes et demie, si bien que « Surpris » et « Très
 * content » avaient déjà rendu la main au neutre au moment du relevé. Le test disait
 * donc que leurs yeux n'étaient pas écarquillés — ce qui était vrai, et hors sujet.
 */
function poser(cle: string, reglages: ReglagesVie = CALME): EtatVie {
  const etat = etatParCle(cle);
  const quand = etat.nature === "ponctuel" ? (etat.duree ?? 1000) * 0.6 : 2500;
  const vie = creerVie(FIGE(0.99));
  vie.avancer(0, reglages);
  vie.demander(cle, 0);
  let dernier = VIE_AU_REPOS;
  for (let t = 0; t <= quand; t += 16) dernier = vie.avancer(t, reglages);
  return dernier;
}

describe("répertoire", () => {
  it("ne porte plus que les états retenus", () => {
    // ⚠️ Le clignement n'est pas un état : il se superpose à tous les autres. En faire
    // un état l'aurait rendu incompatible avec eux, alors qu'on cligne en réfléchissant
    // comme en s'étonnant.
    // ⚠️ `invite` est rangée ici parce que la machine à états la joue comme les autres,
    // mais elle ne dit rien de l'application — c'est un clin d'œil au code, tiré pendant
    // le vagabondage qui précède le sommeil. Elle ne se compte donc pas parmi les
    // expressions du répertoire.
    /**
     * ⚠️ **Sept états ont été retirés d'un coup** — focus, content, surpris, préoccupé,
     * réflexion, observation, succès — parce qu'ils se répétaient : trois disaient une
     * hausse, deux une baisse, deux une attention. Ce qui reste couvre les mêmes
     * situations avec une intention par état, et les déclencheurs qui les nommaient ont
     * été redirigés vers un survivant plutôt que laissés à pointer dans le vide.
     */
    expect(ETATS.map(e => e.cle)).toEqual([
      "neutre", "curieux", "tres-content", "sceptique", "colere", "blase", "emerveille",
      "tour", "invite",
      "somnolent", "reveil", "erreur",
    ]);
  });

  it("dit pour chaque état quand l'appeler", () => {
    // La colonne « quand » est de la documentation, mais une documentation vide serait
    // pire que pas de colonne du tout.
    for (const e of ETATS) {
      expect({ [e.cle]: e.quand.length > 8 }).toEqual({ [e.cle]: true });
      expect({ [e.cle]: e.libelle.length > 2 }).toEqual({ [e.cle]: true });
    }
  });

  it("donne une durée à tous les ponctuels, et à eux seuls", () => {
    for (const e of ETATS) {
      expect({ [e.cle]: e.nature === "ponctuel" ? typeof e.duree : e.duree })
        .toEqual({ [e.cle]: e.nature === "ponctuel" ? "number" : undefined });
    }
  });

  it("retombe sur le neutre pour une clé inconnue, au lieu de lever", () => {
    expect(etatParCle("n'existe pas").cle).toBe("neutre");
  });

  it("laisse le neutre au repos complet", () => {
    expect(poseDeLEtat(etatParCle("neutre"))).toEqual(POSE_NEUTRE);
  });
});

describe("machine à états", () => {
  it("garde un état soutenu tant qu'on n'en demande pas un autre", () => {
    /**
     * ⚠️ **La distinction qui structure tout le module.** Un état soutenu doit tenir tant
     * que la situation dure : « Curieux » accompagne un survol, et s'il s'éteignait au bout
     * d'une seconde la mimique dirait le contraire de ce qu'elle annonce.
     */
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("curieux", 0);
    for (let t = 0; t <= 60000; t += 100) vie.avancer(t, CALME);
    expect(vie.courant()).toBe("curieux");
    expect(vie.avancer(60000, CALME).ecart).toBeGreaterThan(1.1);
  });

  it("rend la main au fond après un ponctuel", () => {
    // « Erreur » se joue une fois. Sans retour, la tête resterait fâchée après un
    // simple refus — et le prochain état ne s'expliquerait plus.
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("curieux", 0);
    vie.demander("erreur", 0);
    expect(vie.courant()).toBe("erreur");
    for (let t = 0; t <= 3000; t += 16) vie.avancer(t, CALME);
    expect(vie.courant()).toBe("curieux");
    expect(vie.fond()).toBe("curieux");
  });

  it("revient exactement au neutre, sans résidu", () => {
    /**
     * ⚠️ **L'invariant le plus important.** Un état qui ne se referme pas tout à fait
     * laisse un résidu ; les résidus s'accumulent et le visage part lentement de
     * travers sans que rien ne le signale — une dérive qu'on ne remarque qu'après
     * plusieurs minutes, quand la tête est déjà penchée.
     */
    for (const e of ETATS) {
      const vie = creerVie(FIGE(0.99));
      vie.avancer(0, CALME);
      vie.demander(e.cle, 0);
      let dernier = VIE_AU_REPOS;
      for (let t = 0; t <= 4000; t += 16) dernier = vie.avancer(t, CALME);
      vie.demander("neutre", 4000);
      for (let t = 4000; t <= 12000; t += 16) dernier = vie.avancer(t, CALME);
      for (const cle of Object.keys(VIE_AU_REPOS) as (keyof EtatVie)[]) {
        expect({ [`${e.cle}.${cle}`]: Math.abs(dernier[cle] - VIE_AU_REPOS[cle]) < 0.01 })
          .toEqual({ [`${e.cle}.${cle}`]: true });
      }
    }
  });

  it("passe d'un état à l'autre sans à-coup", () => {
    // Aucune transition n'est écrite à la main : on rejoint la pose visée depuis la
    // pose courante, quelle qu'elle soit. Encore faut-il que le trajet soit continu.
    /**
     * ⚠️ **Le plafond du lacet est passé de 2,5 à 3,5, et il faut dire pourquoi.** Le
     * somnolent tient désormais un décalage latéral — de quel côté l'avatar s'endort — là
     * où sa pose était auparavant centrée. Partir de quinze degrés vers un « réveil », dont
     * l'amorti est volontairement court (55 ms), donne quelques degrés sur la première image :
     * c'est l'approche exponentielle nominale, et les écarts décroissent géométriquement
     * ensuite. Ce que cet essai doit attraper, c'est un **saut** — la même mesure valait 15
     * quand le décalage était porté par `anime`, qui s'ajoute et disparaît sans amorti. Le
     * seuil reste donc largement sous cette valeur-là.
     */
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("somnolent", 0);
    for (let t = 0; t <= 3000; t += 16) vie.avancer(t, CALME);
    vie.demander("reveil", 3000);
    let precedent = vie.avancer(3000, CALME);
    for (let t = 3016; t <= 5000; t += 16) {
      const e = vie.avancer(t, CALME);
      expect(Math.abs(e.hauteur - precedent.hauteur)).toBeLessThan(0.06);
      expect(Math.abs(e.lacet - precedent.lacet)).toBeLessThan(3.5);
      precedent = e;
    }
  });
});

describe("les mimiques disent ce qu'elles annoncent", () => {

  it("écarte les yeux du curieux, au lieu de les resserrer", () => {
    /**
     * ⚠️ **Le sens s'est inversé, et l'essai le fige dans le bon.** La première version
     * rapprochait les yeux — un regard qui converge vise un point précis. À l'écran, deux
     * yeux serrés sur une tête penchée se lisaient comme un plissement méfiant. L'écart
     * passe donc de 18 unités au repos à 22 : c'est l'ouverture qui dit la curiosité.
     */
    expect(poser("curieux").ecart).toBeGreaterThan(1.1);
  });



  it("ne ferme qu'un œil pour le sceptique", () => {
    const e = poser("sceptique");
    expect(Math.abs(e.fermetureDroite - e.fermetureGauche)).toBeGreaterThan(0.3);
  });

  it("baisse les deux paupières du somnolent, également", () => {
    const e = poser("somnolent");
    expect(e.fermetureGauche).toBeGreaterThan(0.4);
    expect(e.fermetureGauche).toBe(e.fermetureDroite);
  });


});

describe("les états qui bougent", () => {

  it("secoue la tête horizontalement pour l'erreur, puis s'arrête", () => {
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("erreur", 0);
    const images = simuler(vie, 3, CALME);
    const lacets = images.map(i => i.lacet);
    // Un vrai « non » : plusieurs changements de sens, pas un simple écart.
    let changements = 0;
    for (let i = 2; i < lacets.length; i++) {
      const a = lacets[i - 1] - lacets[i - 2], b = lacets[i] - lacets[i - 1];
      if (a * b < 0 && Math.abs(a) > 0.05) changements++;
    }
    expect(changements).toBeGreaterThanOrEqual(4);
    expect(Math.abs(lacets[lacets.length - 1])).toBeLessThan(0.5);
  });

  it("fait sursauter la tête au réveil et l'écrase sur le très content", () => {
    // Deux joies, deux gestes : l'une part vers le haut, l'autre s'écrase. Les
    // confondre reviendrait à n'avoir qu'un seul état.
    const reveil = simuler(demanderEt("reveil"), 2, CALME).map(i => i.echelleY);
    const tres = simuler(demanderEt("tres-content"), 2, CALME).map(i => i.echelleY);
    expect(Math.max(...reveil)).toBeGreaterThan(1.02);
    expect(Math.min(...tres)).toBeLessThan(0.98);
  });

  it("ne laisse aucune échelle devenir absurde", () => {
    for (const e of ETATS) {
      for (const i of simuler(demanderEt(e.cle), 4, REGLAGES)) {
        expect({ [e.cle]: i.echelleX > 0.85 && i.echelleX < 1.2 })
          .toEqual({ [e.cle]: true });
        expect({ [e.cle]: i.echelleY > 0.85 && i.echelleY < 1.2 })
          .toEqual({ [e.cle]: true });
      }
    }
  });

  it("ne rend jamais une hauteur d'œil négative", () => {
    // ⚠️ La fermeture de fond et le clignement se combinent par le maximum, pas par une
    // somme : sur un dormeur qui cligne, une somme aurait dépassé un.
    for (const e of ETATS) {
      for (const i of simuler(demanderEt(e.cle), 20, REGLAGES)) {
        expect({ [e.cle]: i.fermetureGauche >= 0 && i.fermetureGauche <= 1 })
          .toEqual({ [e.cle]: true });
        expect({ [e.cle]: i.fermetureDroite >= 0 && i.fermetureDroite <= 1 })
          .toEqual({ [e.cle]: true });
        expect({ [e.cle]: i.hauteur > 0 }).toEqual({ [e.cle]: true });
      }
    }
  });
});

function demanderEt(cle: string) {
  const vie = creerVie(FIGE(0.99));
  vie.avancer(0, CALME);
  vie.demander(cle, 0);
  return vie;
}

describe("dérive et clignement", () => {
  it("ne laisse jamais le visage parfaitement immobile", () => {
    // ⚠️ C'est *la* différence entre un visage et une icône. Un avatar strictement figé
    // se lit comme une image, quelle que soit la qualité des mimiques.
    const vie = creerVie(FIGE(0.99));
    const images = simuler(vie, 20, { derive: 3, clignement: false, cadenceClignement: 4, spontane: false });
    const distincts = new Set(images.map(i => i.lacet.toFixed(4)));
    expect(distincts.size).toBeGreaterThan(images.length * 0.9);
  });

  it("s'éteint complètement quand tout est coupé", () => {
    for (const i of simuler(creerVie(FIGE(0.99)), 10, CALME)) {
      expect(i).toEqual(VIE_AU_REPOS);
    }
  });

  it("espace les clignements du somnolent", () => {
    const compter = (cle: string) => {
      const vie = demanderEt(cle);
      const images = simuler(vie, 120, { ...CALME, clignement: true });
      let n = 0;
      for (let i = 1; i < images.length; i++) {
        if (images[i - 1].fermetureGauche < images[i].fermetureGauche
          && images[i - 1].fermetureGauche === 0) n++;
      }
      return n;
    };
    expect(compter("somnolent")).toBeLessThan(compter("neutre"));
  });

  it("ferme les deux yeux ensemble sur un clignement ordinaire", () => {
    const vie = creerVie(FIGE(0.99));
    const images = simuler(vie, 40, { ...CALME, clignement: true, cadenceClignement: 3 });
    expect(images.some(i => i.fermetureGauche > 0.9)).toBe(true);
    for (const i of images) expect(i.fermetureGauche).toBe(i.fermetureDroite);
  });
});

describe("etatSelonVariation", () => {
  it("traduit un résultat en mimique, au lieu de toujours dire « curieux »", () => {
    /**
     * ⚠️ **C'est ce qui sépare un avatar utile d'un avatar décoratif.** Survoler une
     * ligne ne dit rien ; survoler une ligne *qui a pris neuf pour cent* est une
     * information, et le visage la reprend avant qu'on ait lu le chiffre.
     */
    expect(etatSelonVariation(12)).toBe("tres-content");
    expect(etatSelonVariation(3.4)).toBe("curieux");
    expect(etatSelonVariation(0.2)).toBe("curieux");
    expect(etatSelonVariation(-2)).toBe("sceptique");
    expect(etatSelonVariation(-9)).toBe("sceptique");
  });

  it("ne s'étonne pas d'une chute — elle inquiète", () => {
    // ⚠️ Le seuil de l'inhabituel n'est pas symétrique dans son intention : une hausse
    // de neuf pour cent surprend, une baisse du même ordre appelle l'inquiétude.
    expect(etatSelonVariation(9)).toBe("tres-content");
    expect(etatSelonVariation(-9)).not.toBe("tres-content");
  });

  it("retombe sur « curieux » quand la variation manque", () => {
    // Un prix indisponible ne doit pas rendre le visage inquiet : l'absence de donnée
    // n'est pas une mauvaise nouvelle.
    for (const v of [null, undefined, NaN, Infinity]) {
      expect({ [String(v)]: etatSelonVariation(v as number) })
        .toEqual({ [String(v)]: "curieux" });
    }
  });

  it("ne nomme que des états qui existent", () => {
    for (const v of [50, 9, 3, 0, -0.5, -3, -12, -80]) {
      expect({ [v]: etatParCle(etatSelonVariation(v)).cle })
        .toEqual({ [v]: etatSelonVariation(v) });
    }
  });
});

describe("etatSelonAggravation", () => {
  it("se fâche sur une perte qui se creuse, pas sur une perte installée", () => {
    /**
     * ⚠️ **La régression que ce test fige.** « En colère » dit « une perte qui s'aggrave
     * sous les yeux » : c'est le *mouvement* qui fâche, pas le niveau. Un seuil sur la
     * seule valeur courante aurait mis le visage en colère devant tout ce qui affiche
     * −9 %, y compris un titre qui remonte depuis une heure.
     */
    expect(etatSelonAggravation(-9, -9)).toBe("sceptique");
    expect(etatSelonAggravation(-9, -1)).toBe("colere");
    /* Il remonte : il perd toujours autant, mais plus rien ne s'aggrave. */
    expect(etatSelonAggravation(-9, -14)).toBe("sceptique");
  });

  it("ne se fâche pas d'un gain qui s'effrite", () => {
    // ⚠️ Un titre qui passe de +4 % à +3,5 % se replie ; il ne perd rien. Enrager là-dessus
    // se lirait comme de l'avidité.
    expect(etatSelonAggravation(3.5, 4)).toBe("curieux");
    expect(etatSelonAggravation(0, 9)).toBe("curieux");
  });

  it("laisse passer le frémissement d'un tick", () => {
    /**
     * ⚠️ **Sans marche, le visage serait fâché en permanence.** Les cours se relisent
     * toutes les dix secondes et un tick ordinaire ne déplace la variation que de quelques
     * centièmes de point — chaque relecture d'un titre en baisse aurait déclenché la colère.
     */
    for (const pas of [0.01, 0.1, MARCHE_AGGRAVATION - 0.01]) {
      expect({ [pas]: etatSelonAggravation(-2 - pas, -2) }).toEqual({ [pas]: "sceptique" });
    }
    expect(etatSelonAggravation(-2 - MARCHE_AGGRAVATION, -2)).toBe("colere");
  });

  it("ne se fâche pas sur une donnée qui n'est plus une perte", () => {
    /**
     * ⚠️ **Une position longue ne peut pas perdre plus que tout** : sous −100 %, on ne lit
     * plus une perte mais une donnée fausse. Le garde-fou sert — relevé à l'écran sur la
     * fenêtre Max, une ligne annonçait **+814 559 %**. Contre cette échelle, la marche de
     * trois dixièmes est franchie par n'importe quel frémissement, et le visage serait resté
     * fâché tant que la fenêtre est ouverte.
     */
    expect(etatSelonAggravation(-814559, -814000)).toBe("sceptique");
    expect(etatSelonAggravation(-100, -80)).toBe("sceptique");
    /* Juste au-dessus du plancher, la colère reste possible. */
    expect(etatSelonAggravation(-99, -80)).toBe("colere");
  });

  it("ne peut pas se fâcher au premier relevé", () => {
    /**
     * ⚠️ **C'est ce qui garantit le « sous les yeux ».** Le premier relevé est celui de
     * l'entrée dans l'élément : il n'a rien à quoi se comparer, et la colère ne peut donc
     * naître qu'au relevé suivant — devant quelqu'un qui regardait déjà.
     */
    for (const p of [null, undefined, NaN, Infinity]) {
      expect({ [String(p)]: etatSelonAggravation(-40, p as number) })
        .toEqual({ [String(p)]: "sceptique" });
    }
  });

  it("retombe sur la lecture ordinaire, et ne nomme que des états qui existent", () => {
    for (const [v, p] of [[12, 11], [3, 3], [-2, -2], [-30, -1], [0, 0]]) {
      const cle = etatSelonAggravation(v, p);
      expect({ [`${v}/${p}`]: etatParCle(cle).cle }).toEqual({ [`${v}/${p}`]: cle });
    }
    for (const v of [null, undefined, NaN]) {
      expect({ [String(v)]: etatSelonAggravation(v as number, -3) })
        .toEqual({ [String(v)]: "curieux" });
    }
  });
});

describe("lireMarqueAvatar", () => {
  /**
   * Le survol tel que le fournisseur le joue : on se pose sur un élément, puis ses
   * attributs changent sous le curseur sans qu'on ait bougé.
   *
   * ⚠️ **C'est l'enchaînement qu'on éprouve, pas un appel isolé.** La colère naît d'un
   * *souvenir* : elle ne peut pas apparaître au premier relevé, et elle doit repartir dès
   * que la chute s'arrête. Aucune de ces deux règles ne se lit sur un appel unique.
   */
  const survoler = (releves: (string | undefined)[], cle = "sceptique") => {
    let memoire: number | null = null;
    return releves.map(chiffre => {
      const lu = lireMarqueAvatar(cle, chiffre, memoire);
      memoire = lu.variation;
      return lu.cle;
    });
  };

  it("se fâche quand la perte se creuse sous le curseur, et se calme ensuite", () => {
    /**
     * ⚠️ **La régression que ce test fige.** `data-avatar` n'était relu qu'à l'**entrée**
     * dans l'élément — noté sur la page du portefeuille. Or « sous les yeux » désigne le cas
     * contraire : la souris ne bouge pas, et c'est la valeur qui change dessous au rythme du
     * rafraîchissement des cours.
     */
    expect(survoler(["-1.0", "-1.5", "-1.52", "-1.9"]))
      .toEqual(["sceptique", "colere", "sceptique", "colere"]);
  });

  it("oublie la carte précédente dès qu'on la quitte", () => {
    /**
     * ⚠️ **Le souvenir appartient à l'élément, pas au visage.** Sans cet oubli, quitter une
     * ligne à −40 % pour une autre à −41 % aurait déclenché une colère qui n'appartient à
     * aucune des deux — on aurait comparé deux titres entre eux au lieu de suivre l'un
     * d'eux. Le fournisseur efface la mémoire en changeant de porteur ; ici, un relevé sans
     * chiffre suffit à la rendre.
     */
    expect(lireMarqueAvatar("curieux", undefined, -40)).toEqual({ cle: "curieux", variation: null });
    expect(survoler([undefined, "-41"])).toEqual(["sceptique", "sceptique"]);
  });

  it("laisse passer une clé imposée, sans rien inventer", () => {
    // Un élément qui ne publie pas de chiffre — la barre de navigation, un panneau —
    // garde exactement ce qu'il annonce.
    expect(lireMarqueAvatar("curieux", undefined, null)).toEqual({ cle: "curieux", variation: null });
    expect(lireMarqueAvatar(null, undefined, null)).toEqual({ cle: null, variation: null });
  });

  it("ne retient pas un chiffre illisible", () => {
    // ⚠️ Sans cela, un `NaN` resterait en mémoire et empoisonnerait toutes les comparaisons
    // suivantes : `NaN <= x` est toujours faux, donc plus jamais de colère sur cette carte.
    expect(lireMarqueAvatar("curieux", "brouillé", null).variation).toBe(null);
    expect(survoler(["-1.0", "brouillé", "-9"])).toEqual(["sceptique", "curieux", "sceptique"]);
  });
});

describe("marqueAvatar", () => {
  it("publie la clé et le chiffre ensemble", () => {
    /**
     * ⚠️ **Les deux attributs décrivent le même nombre, et c'est pour cela qu'ils ne
     * s'écrivent pas séparément.** Le fournisseur a besoin de la clé pour savoir ce que vaut
     * la variation maintenant, et du chiffre pour voir ce qu'elle est en train de faire.
     */
    expect(marqueAvatar(-4)).toEqual({ "data-avatar": "sceptique", "data-variation": -4 });
    expect(marqueAvatar(12)["data-avatar"]).toBe(etatSelonVariation(12));
  });

  it("sait classer sur un chiffre et surveiller l'autre", () => {
    /**
     * ⚠️ **La régression que ce test fige.** La grille d'actifs classe ses cartes sur
     * l'écart à la moyenne des lignes, qui atteint des centaines de milliers de points sur
     * la fenêtre Max — relevé à l'écran : 246 485. Contre cette échelle, la marche de trois
     * dixièmes ne veut plus rien dire : le visage serait parti en colère à chaque relecture
     * des cours. Le classement garde l'écart, la surveillance prend la variation vraie.
     */
    expect(marqueAvatar(-246485, -1.2))
      .toEqual({ "data-avatar": "sceptique", "data-variation": -1.2 });
    /* Et sans second chiffre, c'est le premier qu'on surveille — le cas ordinaire. */
    expect(marqueAvatar(-1.2)["data-variation"]).toBe(-1.2);
  });

  it("n'écrit aucun chiffre quand il n'y en a pas", () => {
    // ⚠️ `undefined` retire l'attribut ; « null » écrit en toutes lettres ferait croire au
    // fournisseur qu'un chiffre est publié, et il lirait `Number("null")`.
    for (const v of [null, undefined, NaN, Infinity]) {
      expect({ [String(v)]: marqueAvatar(v as number)["data-variation"] })
        .toEqual({ [String(v)]: undefined });
      expect(marqueAvatar(v as number)["data-avatar"]).toBe("curieux");
    }
  });
});

describe("gestes spontanés", () => {
  it("bouge de lui-même en neutre, au lieu de seulement dériver", () => {
    /**
     * ⚠️ **La régression que ce test fige.** En passant à la machine à états, les gestes
     * spontanés avaient disparu : hors réaction de l'application, le visage ne faisait
     * plus que dériver et cligner. Or c'est en « neutre » qu'il passe le plus clair de
     * son temps — et un neutre sans initiative propre se lit comme une icône, si
     * soignées que soient les mimiques qu'on ne voit jamais.
     */
    const vie = creerVie(Math.random);
    const sansDerive = { ...CALME, spontane: true, cadenceSpontane: 3 };
    const images = simuler(vie, 60, sansDerive);
    const bouge = images.filter(i =>
      Math.abs(i.lacet) > 3 || Math.abs(i.roulis) > 3
      || i.hauteur < 0.8 || i.hauteur > 1.1);
    expect(bouge.length).toBeGreaterThan(images.length * 0.15);
  });

  it("rend la main à l'état de fond, sans le remplacer", () => {
    // Un coup d'œil pendant « Préoccupé » revient sur « Préoccupé ». Un geste qui
    // écraserait l'état effacerait ce que l'application vient d'annoncer.
    const vie = creerVie(Math.random);
    const avec = { ...CALME, spontane: true, cadenceSpontane: 1 };
    vie.avancer(0, avec);
    vie.demander("sceptique", 0);
    for (let t = 0; t <= 40000; t += 16) vie.avancer(t, avec);
    expect(vie.fond()).toBe("sceptique");
  });

  it("laisse le dormeur dormir", () => {
    // ⚠️ Un dormeur qui jette des coups d'œil ne dort pas : c'est la tolérance de l'état
    // qui décide, et celle du somnolent est à zéro.
    const compter = (cle: string) => {
      const vie = creerVie(Math.random);
      const avec = { ...CALME, spontane: true, cadenceSpontane: 2 };
      vie.avancer(0, avec);
      vie.demander(cle, 0);
      let gestes = 0;
      let precedent = "";
      for (let t = 0; t <= 120000; t += 16) {
        vie.avancer(t, avec);
        const c = vie.courant();
        if (c !== precedent && c !== cle) gestes++;
        precedent = c;
      }
      return gestes;
    };
    const neutre = compter("neutre");
    expect(neutre).toBeGreaterThan(4);
    /* Le dormeur n'en tolère aucun : sa spontanéité est à zéro. */
    expect(compter("somnolent")).toBe(0);
  });

  it("s'arrête net quand on les coupe", () => {
    const vie = creerVie(Math.random);
    for (const i of simuler(vie, 90, CALME)) expect(i).toEqual(VIE_AU_REPOS);
  });
});

describe("somnolent", () => {
  it("penche la tête au lieu de seulement fermer les yeux", () => {
    /**
     * ⚠️ **Des paupières basses sur une tête droite se lisent comme un regard méfiant**,
     * pas comme l'assoupissement. C'est l'inclinaison qui fait la différence : le menton
     * descend, la tête roule sur le côté — le mouvement de celui qui pique du nez.
     */
    const e = poser("somnolent");
    expect(e.fermetureGauche).toBeGreaterThan(0.45);
    expect(e.tangage).toBeGreaterThan(8);
    expect(Math.abs(e.roulis)).toBeGreaterThan(6);
  });
});

describe("etatSelonEcartCourbe", () => {
  it("emploie des paliers bien plus larges qu'une variation de cours", () => {
    /**
     * ⚠️ **Le défaut que ce test fige, signalé à l'usage.** Une courbe se parcourt en
     * continu — chaque pixel déplace la valeur — là où l'on passe d'une carte à l'autre
     * par sauts. Avec les seuils d'`etatSelonVariation`, un simple glissement traversait
     * quatre bandes et le visage changeait sans arrêt de mimique.
     */
    /**
     * ⚠️ **On mesure la largeur de la bande neutre, plus le nombre de changements.** La
     * première version comptait les états atteignables — quatre des deux côtés, donc rien
     * à en tirer. La deuxième comptait les changements en balayant, ce qui était juste
     * tant que les deux tables avaient un nombre de bandes différent ; le répertoire
     * ayant été réduit, elles en ont désormais deux chacune et le compte est le même.
     *
     * Ce qui distingue vraiment les deux, et qui explique le défaut d'origine, c'est
     * l'étendue de valeurs sur laquelle le visage **ne change pas**. Un balayage de
     * courbe traverse cette plage en continu : plus elle est large, moins la tête
     * papillonne.
     */
    const bandeNeutre = (f: (v: number) => string) => {
      let n = 0;
      for (let v = -40; v <= 40; v += 0.25) if (f(v) === "curieux") n++;
      return n;
    };
    expect(bandeNeutre(etatSelonEcartCourbe))
      .toBeGreaterThan(bandeNeutre(etatSelonVariation) * 2);
  });

  it("ne dit rien de neuf tant que l'écart reste modeste", () => {
    for (const v of [-9, -4, 0, 2, 3.9]) {
      expect({ [v]: etatSelonEcartCourbe(v) }).toEqual({ [v]: "curieux" });
    }
  });

  it("s'éclaire sur un sommet et s'assombrit dans un creux", () => {
    expect(etatSelonEcartCourbe(30)).toBe("tres-content");
    expect(etatSelonEcartCourbe(-14)).toBe("sceptique");
  });


  it("s'émerveille sur le sommet de la courbe, et là seulement", () => {
    /**
     * ⚠️ **C'est le seul chemin vers « émerveillé » qui soit observable.** Une première
     * version l'avait branché sur un *record* du portefeuille — juste sur le fond,
     * invisible en pratique : il fallait qu'un nouveau plus haut se produise pendant que
     * la page était ouverte. Mesuré sur le portefeuille d'essai : 1,7 à 2,1 % sous son
     * sommet sur **toutes** les fenêtres, donc jamais rien. Ici la découverte est celle de
     * l'utilisateur, qui promène le curseur et trouve le meilleur moment de la période.
     */
    expect(etatSelonEcartCourbe(30, true)).toBe("emerveille");
    /* Le même écart, ailleurs qu'au sommet, reste ce qu'il était. */
    expect(etatSelonEcartCourbe(30, false)).toBe("tres-content");
    expect(etatSelonEcartCourbe(30)).toBe("tres-content");
  });

  it("ne s'émerveille pas d'un sommet qui vaut moins qu'aujourd'hui", () => {
    /**
     * ⚠️ **Sur une courbe entièrement sous le niveau actuel, son point haut reste le
     * meilleur *de la période*** — mais s'extasier devant un moment où l'on valait moins
     * qu'aujourd'hui se lirait comme un contresens. Au-delà de zéro seulement, le sommet
     * est à la fois le meilleur de la courbe et meilleur que maintenant.
     */
    expect(etatSelonEcartCourbe(-14, true)).toBe("sceptique");
    expect(etatSelonEcartCourbe(-0.5, true)).toBe("curieux");
    /* Pile à zéro — le sommet est le point d'aujourd'hui — il y a bien de quoi fêter. */
    expect(etatSelonEcartCourbe(0, true)).toBe("emerveille");
  });

  it("ne s'émerveille pas d'un sommet sans donnée", () => {
    // Un relevé illisible ne devient pas une découverte parce qu'il tombe au sommet.
    for (const v of [null, undefined, NaN, Infinity]) {
      expect({ [String(v)]: etatSelonEcartCourbe(v as number, true) })
        .toEqual({ [String(v)]: "curieux" });
    }
  });

  it("ne nomme que des états qui existent, et reste calme sans donnée", () => {
    for (const v of [-100, -10, 0, 10, 100]) {
      expect(etatParCle(etatSelonEcartCourbe(v)).cle).toBe(etatSelonEcartCourbe(v));
    }
    for (const v of [null, undefined, NaN, Infinity]) {
      expect({ [String(v)]: etatSelonEcartCourbe(v as number) })
        .toEqual({ [String(v)]: "curieux" });
    }
  });
});
