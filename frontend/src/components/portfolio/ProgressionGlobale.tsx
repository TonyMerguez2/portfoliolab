"use client";
import { agregat, euros, pourcentageLisible, type Objectif } from "@/lib/objectifs";
import { CLAIR, JETONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * L'avancement de tous les objectifs, et des constats chiffrés.
 *
 * ⚠️ **Ce panneau remplace « Recommandations IA ».** La maquette y proposait
 * « augmenter votre investissement mensuel à 1 000 € », « réduire l'exposition aux
 * actions à 70 % », « activer le réinvestissement automatique ». C'est du conseil en
 * investissement personnalisé, que ce logiciel ne produit pas. À la place : des
 * soustractions et des divisions, dont chacune se recompte à la main.
 *
 * ⚠️ **Additionner des cibles d'échéances différentes est une convention.** 300 000 € en
 * 2031 et 1 250 000 € en 2044 ne sont pas commensurables — un euro de 2044 n'a pas le
 * pouvoir d'achat d'un euro de 2031. La maquette additionne, donc on additionne, mais le
 * total est présenté comme une **somme de cibles** et non comme un patrimoine à
 * constituer.
 */

function Anneau({ part }: { part: number }) {
  const r = 34, c = 2 * Math.PI * r;
  const couleur = part >= 66 ? JETONS.positif : part >= 33 ? JETONS.accent : JETONS.attention;
  return (
    <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden="true">
      <circle cx="43" cy="43" r={r} fill="none" stroke={CLAIR.carteCreuse} strokeWidth="7" />
      <circle cx="43" cy="43" r={r} fill="none" stroke={couleur} strokeWidth="7"
        strokeLinecap="round" strokeDasharray={`${(part / 100) * c} ${c}`}
        transform="rotate(-90 43 43)" />
      <text x="43" y="48" textAnchor="middle"
        style={{ ...NUM, fontSize: 18, fontWeight: 700, fill: CLAIR.texte }}>
        {pourcentageLisible(part)}
      </text>
    </svg>
  );
}

function Ligne({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>{titre}</span>
      <span style={{ ...NUM, fontSize: 13.5, fontWeight: 700, color: CLAIR.texte }}>{valeur}</span>
    </div>
  );
}

export default function ProgressionGlobale({ objectifs }: { objectifs: Objectif[] }) {
  const a = agregat(objectifs);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0, flex: 1 }}>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
        Progression globale
      </span>

      {objectifs.length === 0 ? (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Aucun objectif pour l’instant.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Anneau part={a.part} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <Ligne titre="Somme de vos cibles" valeur={euros(a.total)} />
              <Ligne titre="Déjà constitué" valeur={euros(a.actuel)} />
              <Ligne titre="Reste à atteindre" valeur={euros(a.reste)} />
            </div>
          </div>

          {/* ⚠️ Les objectifs écartés sont dits. Un objectif dont la valorisation a
              échoué ne vaut pas zéro : l'inclure ferait passer une ignorance pour un
              retard, et le taire ferait mentir le total. */}
          {a.ecartes > 0 && (
            <p style={{ margin: 0, fontFamily: FONT, fontSize: 9.5, lineHeight: 1.5,
              color: JETONS.attention }}>
              {a.ecartes} objectif{a.ecartes > 1 ? "s" : ""} non compté
              {a.ecartes > 1 ? "s" : ""} : montant indisponible.
            </p>
          )}

          <p style={{ margin: 0, fontFamily: FONT, fontSize: 9, lineHeight: 1.5,
            color: CLAIR.texteFaible }}>
            Somme de cibles d’échéances différentes : un euro de 2044 n’a pas le pouvoir
            d’achat d’un euro de 2031.
          </p>
        </>
      )}
    </div>
  );
}
