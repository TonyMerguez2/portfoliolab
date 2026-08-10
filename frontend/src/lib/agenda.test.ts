import { describe, expect, it } from "vitest";

import { echapper, fichierAgenda, nomFichier, plier } from "./agenda";

const octets = (s: string) => new TextEncoder().encode(s).length;

describe("echapper", () => {
  it("échappe les quatre caractères que la norme réserve", () => {
    expect(echapper("a;b,c\\d")).toBe("a\\;b\\,c\\\\d");
    expect(echapper("deux\nlignes")).toBe("deux\\nlignes");
  });

  it("double la barre oblique avant d'en introduire d'autres", () => {
    // ⚠️ L'ordre compte : traiter la virgule d'abord produirait « \\, » puis
    // « \\\\, » — on échapperait ses propres échappements.
    expect(echapper("\\,")).toBe("\\\\\\,");
  });

  it("laisse un libellé ordinaire intact", () => {
    expect(echapper("TSLA — Résultats T3 2026")).toBe("TSLA — Résultats T3 2026");
  });
});

describe("plier", () => {
  it("laisse une ligne courte telle quelle", () => {
    expect(plier("SUMMARY:court")).toBe("SUMMARY:court");
  });

  it("plie à soixante-quinze octets et non à soixante-quinze caractères", () => {
    // ⚠️ Un « é » occupe deux octets. Quarante « é » font 40 caractères mais
    // 80 octets : compter les caractères aurait laissé passer la ligne.
    const ligne = "SUMMARY:" + "é".repeat(40);
    expect(ligne.length).toBeLessThan(75);
    expect(octets(ligne)).toBeGreaterThan(75);
    expect(plier(ligne)).toContain("\r\n ");
  });

  it("ne coupe jamais au milieu d'un caractère multioctet", () => {
    const plie = plier("SUMMARY:" + "é".repeat(60));
    // Chaque morceau doit se décoder sans caractère de remplacement.
    for (const m of plie.split("\r\n")) {
      expect(m).not.toContain("�");
      expect(octets(m)).toBeLessThanOrEqual(75);
    }
  });

  it("préfixe chaque continuation d'une espace", () => {
    const suite = plier("DESCRIPTION:" + "a".repeat(200)).split("\r\n");
    expect(suite.length).toBeGreaterThan(1);
    for (const m of suite.slice(1)) expect(m.startsWith(" ")).toBe(true);
  });

  it("conserve le texte une fois déplié", () => {
    const original = "SUMMARY:" + "Résultats trimestriels de Tesla ".repeat(6);
    const deplie = plier(original).split("\r\n")
      .map((m, i) => (i === 0 ? m : m.slice(1))).join("");
    expect(deplie).toBe(original);
  });
});

describe("fichierAgenda", () => {
  const e = {
    date: "2026-10-21",
    titre: "TSLA — Résultats T3 2026",
    description: "Publication après clôture ; impact moyen ±9,00 %",
    cle: "resultats-TSLA-2026-10-21",
  };
  const ics = fichierAgenda(e, new Date("2026-08-10T09:00:00Z"));

  it("borne la journée entière, fin exclusive au lendemain", () => {
    // ⚠️ `DTEND` est exclusif dans la norme : mettre le même jour produirait un
    // événement de durée nulle, que certains agendas n'affichent pas.
    expect(ics).toContain("DTSTART;VALUE=DATE:20261021");
    expect(ics).toContain("DTEND;VALUE=DATE:20261022");
  });

  it("franchit une fin de mois sans se tromper de lendemain", () => {
    const f = fichierAgenda({ ...e, date: "2026-10-31" });
    expect(f).toContain("DTEND;VALUE=DATE:20261101");
  });

  it("franchit une année bissextile", () => {
    const f = fichierAgenda({ ...e, date: "2028-02-28" });
    expect(f).toContain("DTEND;VALUE=DATE:20280229");
  });

  it("termine chaque ligne par un CRLF", () => {
    // La norme l'impose, et l'agenda d'Apple refuse un fichier en LF seul sans
    // le moindre message — c'est-à-dire précisément l'agenda d'un poste macOS.
    expect(ics.includes("\n")).toBe(true);
    expect(ics.split("\n").every(l => l === "" || l.endsWith("\r"))).toBe(true);
  });

  it("échappe le point-virgule de la description", () => {
    expect(ics).toContain("impact moyen ±9\\,00 %");
    expect(ics).toContain("après clôture \\;");
  });

  it("ouvre et referme les deux blocs", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect((ics.match(/END:VEVENT/g) ?? []).length).toBe(1);
  });

  it("porte un identifiant stable, pour qu'un second ajout remplace le premier", () => {
    expect(ics).toContain("UID:resultats-TSLA-2026-10-21@novac");
    expect(fichierAgenda(e, new Date("2027-01-01T00:00:00Z")))
      .toContain("UID:resultats-TSLA-2026-10-21@novac");
  });

  it("omet la description quand il n'y en a pas", () => {
    expect(fichierAgenda({ date: "2026-10-21", titre: "x", cle: "y" }))
      .not.toContain("DESCRIPTION:");
  });
});

describe("nomFichier", () => {
  it("retire les accents et la ponctuation", () => {
    expect(nomFichier({ date: "2026-10-21", titre: "TSLA — Résultats T3 2026", cle: "k" }))
      .toBe("2026-10-21-tsla-resultats-t3-2026.ics");
  });

  it("garde un nom utilisable même sans titre exploitable", () => {
    expect(nomFichier({ date: "2026-10-21", titre: "!!!", cle: "k" }))
      .toBe("2026-10-21-evenement.ics");
  });
});
