"use client";

/**
 * Le journal d'un compte : enregistrer un versement ou un retrait, et relire les
 * mouvements déjà saisis.
 *
 * ⚠️ **Enregistrer un versement n'est pas corriger le solde, et l'écran doit le dire.**
 * Les deux gestes changent le même chiffre, et rien ne les distingue une fois écrits.
 * Corriger veut dire « je m'étais trompé » : le nouveau montant vaut alors pour tout le
 * passé, et la courbe de patrimoine se réécrit entièrement. Verser veut dire « j'ai
 * ajouté » : seule la suite de la date bouge. Sans cette phrase à l'écran, l'épargnant
 * choisit au hasard entre deux gestes dont il ne peut pas deviner la différence — et il
 * ne s'en apercevrait que des mois plus tard, sur une courbe qui a bougé là où il ne
 * fallait pas.
 *
 * ⚠️ **Deux boutons plutôt qu'un montant signé.** L'API attend un montant signé, mais
 * taper « −200 » est une convention d'informaticien : personne n'écrit son retrait avec
 * un moins sur son relevé. Le sens est donc un choix explicite, et le signe est posé au
 * moment de l'envoi.
 */

import { useState } from "react";
import { CLAIR } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";
import type { Mouvement } from "@/lib/comptes";

const etiquette: React.CSSProperties = {
  fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
  textTransform: "uppercase", color: CLAIR.texteAttenue,
};

const champ: React.CSSProperties = {
  fontFamily: FONT, fontSize: 13, color: CLAIR.texte,
  background: CLAIR.carteCreuse, border: `1px solid ${CLAIR.bordFort}`,
  borderRadius: 8, padding: "8px 10px", outline: "none", width: "100%",
};

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Le montant en français, avec ses centimes et son signe explicite. */
const enEuros = (v: number) =>
  `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("fr-FR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} €`;

export default function JournalCompte({
  mouvements, enCours, erreur, onEnregistrer, onSupprimer,
}: {
  mouvements: Mouvement[];
  enCours: boolean;
  erreur: string | null;
  onEnregistrer: (m: { date: string; montant: number; note: string | null }) => void;
  onSupprimer: (id: string) => void;
}) {
  const [sens, setSens] = useState<"versement" | "retrait">("versement");
  const [montant, setMontant] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [note, setNote] = useState("");

  const valeur = Number(montant.replace(",", "."));
  const valide = montant.trim() !== "" && Number.isFinite(valeur) && valeur > 0;

  const envoyer = () => {
    if (!valide || enCours) return;
    onEnregistrer({
      date: `${date}T00:00:00`,
      // ⚠️ Le signe est posé ici, une seule fois : l'écran raisonne en « combien » et en
      // « dans quel sens », l'API en montant signé. Mélanger les deux vocabulaires plus
      // haut aurait fini par produire un retrait de −200 € compté deux fois.
      montant: sens === "retrait" ? -valeur : valeur,
      note: note.trim() || null,
    });
    setMontant(""); setNote("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={etiquette}>Enregistrer un mouvement</span>
        <p style={{
          margin: 0, fontFamily: FONT, fontSize: 10.5, lineHeight: 1.45,
          color: CLAIR.texteAttenue,
        }}>
          Un versement ne change votre patrimoine qu’à partir de sa date. Corriger le
          solde plus haut, au contraire, réécrit tout son passé.
        </p>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {(["versement", "retrait"] as const).map(s => (
          <button key={s} type="button" onClick={() => setSens(s)}
            style={{
              flex: 1, fontFamily: FONT, fontSize: 12, fontWeight: 600,
              padding: "7px 0", borderRadius: 8, cursor: "pointer",
              background: sens === s ? CLAIR.accent : CLAIR.carteCreuse,
              color: sens === s ? "#FFFFFF" : CLAIR.texteSecondaire,
              border: `1px solid ${sens === s ? CLAIR.accent : CLAIR.bordFort}`,
            }}>
            {s === "versement" ? "Versement" : "Retrait"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={etiquette}>Montant</span>
          <input value={montant} onChange={e => setMontant(e.target.value)}
            inputMode="decimal" placeholder="Ex : 500"
            onKeyDown={e => { if (e.key === "Enter") envoyer(); }}
            style={{ ...champ, ...NUM }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={etiquette}>Date</span>
          {/* Bornée à aujourd'hui, comme « Depuis quand » : on n'enregistre pas un
              versement à venir, qui ferait monter le patrimoine avant qu'il n'existe. */}
          <input type="date" value={date} max={aujourdhui()}
            onChange={e => setDate(e.target.value)}
            style={{ ...champ, ...NUM }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={etiquette}>Note</span>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="Facultatif — « Prime », « Virement mensuel »…"
          onKeyDown={e => { if (e.key === "Enter") envoyer(); }}
          style={champ} />
      </div>

      {erreur && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11.5, color: CLAIR.negatif }}>
          {erreur}
        </p>
      )}

      <button type="button" onClick={envoyer} disabled={!valide || enCours}
        style={{
          fontFamily: FONT, fontSize: 12.5, fontWeight: 600, padding: "9px 0",
          borderRadius: 8, border: "none",
          cursor: valide && !enCours ? "pointer" : "default",
          background: valide && !enCours ? CLAIR.accent : CLAIR.carteCreuse,
          color: valide && !enCours ? "#FFFFFF" : CLAIR.texteAttenue,
        }}>
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </button>

      {mouvements.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={etiquette}>Journal</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {mouvements.map((m, i) => (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 0",
                borderBottom: i === mouvements.length - 1
                  ? "none" : `1px dashed ${CLAIR.bordFort}`,
              }}>
                <span style={{
                  ...NUM, fontSize: 12.5, fontWeight: 600, minWidth: 92,
                  color: m.montant > 0 ? CLAIR.positif : CLAIR.negatif,
                }}>
                  {enEuros(m.montant)}
                </span>
                <span style={{
                  flex: 1, fontFamily: FONT, fontSize: 11, color: CLAIR.texteSecondaire,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {new Date(m.date).toLocaleDateString("fr-FR")}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
                {/* ⚠️ Supprimer défait l'effet sur le solde, côté serveur. Sans cela,
                    effacer une erreur de saisie en créerait une autre : un compte plus
                    riche qu'il ne l'est, sans plus rien pour expliquer l'écart. */}
                <button type="button" onClick={() => onSupprimer(m.id)} disabled={enCours}
                  aria-label={`Supprimer le mouvement du ${new Date(m.date).toLocaleDateString("fr-FR")}`}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 2,
                    color: CLAIR.texteAttenue, lineHeight: 1, fontSize: 14,
                  }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
