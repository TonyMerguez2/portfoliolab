/**
 * La piste de pastilles, rendue en balisage statique.
 *
 * ⚠️ Pas de DOM simulé dans ce projet : on rend en chaîne et on lit le balisage. C'est
 * suffisant pour ce qui compte ici — ce qui est annoncé au clavier et au lecteur d'écran,
 * et la présence de la seconde ligne — sans ajouter un environnement de test pour ça.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Segments from "./Segments";

const rendre = (options: Parameters<typeof Segments<"a" | "b">>[0]["options"], sousEnLigne = false) =>
  renderToStaticMarkup(createElement(Segments<"a" | "b">, { options, valeur: "a", onChange: () => {}, sousEnLigne, taille: "sm" }));

describe("Segments", () => {
  it("rend des boutons, donc des cibles clavier, avec l'option retenue annoncée", () => {
    const html = rendre([{ valeur: "a", libelle: "A" }, { valeur: "b", libelle: "B" }]);
    expect(html.match(/<button/g)?.length).toBe(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain("aria-disabled");
  });

  it("pose la seconde ligne sous le libellé et passe la pastille en colonne", () => {
    const html = rendre([{ valeur: "a", libelle: "6M", sous: "+6.45%" }, { valeur: "b", libelle: "Max" }]);
    expect(html).toContain("<span>6M</span><span>+6.45%</span>");
    expect(html).toContain("flex-direction:column");
    // ⚠️ Une option sans seconde ligne n'a pas de hauteur fixe non plus : c'est la piste
    // qui égalise, sinon « Max » ferait une pastille plus basse que « 6M ».
    expect(html).not.toContain(";height:22px");
  });

  it("sur une ligne, garde la hauteur de la piste et pose le rendement à côté", () => {
    // ⚠️ C'est la disposition retenue sous le graphique : deux lignes y coûtaient 62 px.
    const html = rendre([{ valeur: "a", libelle: "6M", sous: "+6.45%" }, { valeur: "b", libelle: "Max" }], true);
    expect(html).toContain("<span>6M</span><span>+6.45%</span>");
    expect(html).toContain("flex-direction:row");
    expect(html).toContain("height:22px");
  });

  it("montre l'option éteinte sans l'offrir", () => {
    const html = rendre([{ valeur: "a", libelle: "24h" }, { valeur: "b", libelle: "3A", desactive: true, titre: "Trop ancien" }]);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Trop ancien"');
    // ⚠️ Plus de `title` : l'infobulle native du navigateur est bannie du site, l'intitulé
    // passe par `aria-label`, que les lecteurs d'écran lisent et que le navigateur n'affiche pas.
    expect(html).not.toContain('title=');
    expect(html).toContain("cursor:not-allowed");
  });

  it("transmet les attributs data-* que l'avatar lit", () => {
    const html = rendre([{ valeur: "a", libelle: "A", attributs: { "data-avatar": "content", "data-variation": 6.45 } }]);
    expect(html).toContain('data-avatar="content"');
    expect(html).toContain('data-variation="6.45"');
  });
});

describe("Segments — option retenue stylée", () => {
  it("prend le style demandé par-dessus celui de la piste, pour l'option retenue seule", () => {
    const html = rendre([
      { valeur: "a", libelle: "24h", styleActif: { background: "green", fontSize: 13 } },
      { valeur: "b", libelle: "Max", styleActif: { background: "red" } },
    ]);
    expect(html).toContain("background:green");
    expect(html).toContain("font-size:13px");
    // ⚠️ Seule l'option retenue : « Max » garde le fond transparent, quoi qu'il demande.
    expect(html).not.toContain("background:red");
  });
});
