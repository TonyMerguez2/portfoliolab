"use client";
import { useCallback, useEffect, useState } from "react";
import Segments from "@/components/ui/Segments";
import TrameAnimee from "@/components/TrameAnimee";
import { FONT, NUM } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";
import {
  REGLAGES_NOVAC, REGLAGES_REFERENCE, type ReglagesTrame, tauxDAmortissement,
} from "@/lib/trame";

/**
 * Banc d'essai — la trame de points, animée.
 *
 * ⚠️ **Cette page a servi à décider, et sert maintenant à régler.** La toile a remplacé la
 * trame CSS du fond ; le banc garde son intérêt pour ce qu'aucune valeur écrite dans le code
 * ne montre — l'effet d'un champ plus large, d'un ressort plus sec, d'une maille plus fine —
 * et pour ce qu'il mesure : des points, des images par seconde, et le sommeil de la boucle.
 *
 * ⚠️ **La bascule éteint la trame du site.** Les deux dessinent la même maille : superposées,
 * elles se liraient comme une trame floue et l'essai ne dirait rien. `.nv-points` — qui porte
 * désormais la toile du site — est donc masquée tant que celle du banc est montée, et
 * retrouvée en sortant. C'est ce qui fait de la bascule un vrai A/B contre le fond réel.
 *
 * ⚠️ **Ce qui se mesure ici : les points et les images par seconde, pas une impression.** La
 * boucle s'endort dès que tout est à sa cible, si bien que le coût au repos est nul et que
 * seule compte la dépense sous le curseur. Le compteur affiche donc « endormie » aussi.
 */

/** Les bornes des tirettes : de quoi sortir des valeurs de la référence sans casser la trame. */
const BORNES: Record<keyof ReglagesTrame, [min: number, max: number, pas: number, unite: string]> = {
  pas:             [8, 40, 1, "px"],
  point:           [0.5, 4, 0.1, "px"],
  champ:           [24, 260, 2, "px"],
  poussee:         [0, 24, 0.5, "px"],
  grossissement:   [0, 4, 0.1, "×"],
  raideur:         [40, 400, 5, ""],
  amortissement:   [4, 60, 1, ""],
  vitesseAnneau:   [120, 1600, 20, "px/s"],
  largeurAnneau:   [4, 80, 1, "px"],
  pousseeAnneau:   [0, 30, 0.5, "px"],
};

const LIBELLES: Record<keyof ReglagesTrame, string> = {
  pas: "Pas de la maille",
  point: "Rayon du point",
  champ: "Champ du curseur",
  poussee: "Poussée",
  grossissement: "Grossissement",
  raideur: "Raideur du ressort",
  amortissement: "Amortissement",
  vitesseAnneau: "Vitesse de l’onde",
  largeurAnneau: "Largeur du front",
  pousseeAnneau: "Poussée de l’onde",
};

type Fond = "animee" | "actuelle";
type Echelle = "fenetre" | "carte";

export default function BancTrame() {
  const [fond, setFond] = useState<Fond>("animee");
  const [echelle, setEchelle] = useState<Echelle>("fenetre");
  const [reglages, setReglages] = useState<ReglagesTrame>(REGLAGES_NOVAC);
  const [mesure, setMesure] =
    useState({ points: 0, eveilles: 0, ips: 0, endormie: true });

  /**
   * La trame du site s'efface tant que le canvas est monté — voir l'en-tête.
   *
   * Par le style en ligne plutôt que par une règle dans `globals.css` : un banc d'essai ne
   * doit rien laisser derrière lui dans la feuille commune, et le retour en arrière est ici
   * garanti par le nettoyage de l'effet.
   */
  useEffect(() => {
    if (fond !== "animee") return;
    const couche = document.querySelector<HTMLElement>(".nv-points");
    if (!couche) return;
    const avant = couche.style.display;
    couche.style.display = "none";
    return () => { couche.style.display = avant; };
  }, [fond]);

  const surMesure = useCallback(
    (m: { points: number; eveilles: number; ips: number; endormie: boolean }) =>
      setMesure(m), []);

  const taux = tauxDAmortissement(reglages.raideur, reglages.amortissement);

  const carte: React.CSSProperties = {
    background: JETONS.carte, border: `1px solid ${JETONS.bord}`,
    borderRadius: RAYONS.lg, padding: 18,
  };

  return (
    <>
      {fond === "animee" && echelle === "fenetre" && (
        <TrameAnimee
          reglages={reglages}
          surMesure={surMesure}
          style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none" }}
        />
      )}

      <div style={{ fontFamily: FONT, color: JETONS.texte, maxWidth: 760, margin: "0 auto",
                    padding: "28px 20px 80px", display: "grid", gap: 18 }}>
        <header style={{ display: "grid", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 650, color: JETONS.texteFort }}>
            Trame animée — banc d’essai
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: JETONS.texteAttenue }}>
            La trame du site est cette toile : chaque point est une masse sur ressort, le
            curseur les repousse, un clic envoie une onde à travers la page. Les tirettes
            règlent une seconde toile, posée par-dessus la sienne, pour juger un écart sans
            toucher à <code>REGLAGES_NOVAC</code>. Le compteur dit ce que ça coûte ; sur
            l’accueil et la porte, le logo ajoute une passe de plus.
          </p>
        </header>

        <div style={{ ...carte, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <Segments
              ariaLabel="Fond de page"
              valeur={fond}
              onChange={setFond}
              options={[
                { valeur: "animee" as Fond, libelle: "Réglages d’essai" },
                { valeur: "actuelle" as Fond, libelle: "Trame du site" },
              ]}
            />
            <Segments
              ariaLabel="Échelle"
              taille="sm"
              valeur={echelle}
              onChange={setEchelle}
              options={[
                { valeur: "fenetre" as Echelle, libelle: "Plein écran" },
                { valeur: "carte" as Echelle, libelle: "Carte 3:2" },
              ]}
            />
          </div>

          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                       gap: 12 }}>
            <Chiffre nom="Points dessinés" valeur={mesure.points ? String(mesure.points) : "—"} />
            <Chiffre nom="Images / s" valeur={mesure.endormie ? "endormie" : String(mesure.ips)} />
            {/* La dépense par image se joue sur les points éveillés : le premier tracé
                groupe toute la trame en un seul chemin, la seconde passe les dessine un
                par un. C'est ce nombre qui monte avec le champ du curseur. */}
            <Chiffre nom="Points éveillés" valeur={mesure.endormie ? "—" : String(mesure.eveilles)} />
            <Chiffre nom="Amortissement" valeur={`${taux.toFixed(2)}${taux < 1 ? " (souple)" : " (sec)"}`} />
          </dl>

          {fond === "actuelle" && (
            <p style={{ margin: 0, fontSize: 13, color: JETONS.texteAttenue }}>
              La toile du banc est démontée : ce que tu vois derrière est celle du site, avec
              les réglages de <code>REGLAGES_NOVAC</code>. Les tirettes ne la touchent pas.
            </p>
          )}
        </div>

        {fond === "animee" && echelle === "carte" && (
          <TrameAnimee
            reglages={reglages}
            surMesure={surMesure}
            style={{ position: "relative", aspectRatio: "3 / 2", width: "100%",
                     overflow: "hidden", borderRadius: RAYONS.lg, border: `1px solid ${JETONS.bord}`,
                     background: JETONS.carte }}
          />
        )}

        <div style={{ ...carte, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                        gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: JETONS.texteFort }}>
              Réglages
            </h2>
            <div style={{ display: "flex", gap: 8 }}>
              <Bouton onClick={() => setReglages(REGLAGES_NOVAC)}>Maille de Novac</Bouton>
              <Bouton onClick={() => setReglages(REGLAGES_REFERENCE)}>Référence ui-lab</Bouton>
            </div>
          </div>

          {(Object.keys(BORNES) as (keyof ReglagesTrame)[]).map((cle) => {
            const [min, max, pas, unite] = BORNES[cle];
            return (
              <label key={cle} style={{ display: "grid", gap: 6 }}>
                <span style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{LIBELLES[cle]}</span>
                  <span style={{ ...NUM, color: JETONS.texteAttenue }}>
                    {reglages[cle]}{unite && ` ${unite}`}
                  </span>
                </span>
                <input
                  type="range"
                  min={min} max={max} step={pas} value={reglages[cle]}
                  onChange={(e) => setReglages((r) => ({ ...r, [cle]: Number(e.target.value) }))}
                  style={{ width: "100%", accentColor: "var(--nv-accent)" }}
                />
              </label>
            );
          })}
        </div>

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: JETONS.texteAttenue }}>
          Mouvement réduit : la poussée, le grossissement et les ondes s’effacent, la trame
          reste dessinée. Au doigt, rien ne suit le curseur — un écran tactile n’a pas de
          survol, et une lueur figée là où l’on a touché se lit comme un défaut.
        </p>
      </div>
    </>
  );
}

function Chiffre({ nom, valeur }: { nom: string; valeur: string }) {
  return (
    <div>
      <dt style={{ fontSize: 12, color: JETONS.texteAttenue }}>{nom}</dt>
      <dd style={{ margin: 0, ...NUM, fontSize: 16, color: JETONS.texteFort }}>{valeur}</dd>
    </div>
  );
}

function Bouton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontFamily: FONT, fontSize: 12, padding: "5px 10px", cursor: "pointer",
               borderRadius: RAYONS.sm, border: `1px solid ${JETONS.bord}`,
               background: "transparent", color: JETONS.texte }}
    >
      {children}
    </button>
  );
}
