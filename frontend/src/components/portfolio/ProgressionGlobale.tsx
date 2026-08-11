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
  const r = 23, c = 2 * Math.PI * r;
  const couleur = part >= 66 ? JETONS.positif : part >= 33 ? JETONS.accent : JETONS.attention;
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true"
      style={{ flexShrink: 0 }}>
      <circle cx="29" cy="29" r={r} fill="none" stroke={CLAIR.carteCreuse} strokeWidth="5" />
      <circle cx="29" cy="29" r={r} fill="none" stroke={couleur} strokeWidth="5"
        strokeLinecap="round" strokeDasharray={`${(part / 100) * c} ${c}`}
        transform="rotate(-90 29 29)" />
      <text x="29" y="33" textAnchor="middle"
        style={{ ...NUM, fontSize: 12.5, fontWeight: 700, fill: CLAIR.texte }}>
        {pourcentageLisible(part)}
      </text>
    </svg>
  );
}

function Ligne({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: FONT, fontSize: 9, color: CLAIR.texteFaible }}>{titre}</span>
      <span style={{ ...NUM, fontSize: 12.5, fontWeight: 700, color: CLAIR.texte }}>{valeur}</span>
    </div>
  );
}

export default function ProgressionGlobale({ objectifs }: { objectifs: Objectif[] }) {
  const a = agregat(objectifs);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0, flex: 1 }}>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
        Progression globale
      </span>

      {objectifs.length === 0 ? (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Aucun objectif pour l’instant.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Anneau part={a.part} />
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
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

          {/* ⚠️ **Un message distinct, et ce n'est pas un raffinement.** Vu à l'écran :
              « 1 objectif non compté : montant indisponible » s'affichait pour un plafond de
              versements, dont le montant est parfaitement connu. La vraie raison est autre —
              les versements *sont* dans le patrimoine, les additionner compterait deux fois
              le même argent — et la donner en orange, comme une panne, faisait passer un
              choix de calcul assumé pour une défaillance. Ton neutre, et cause exacte. */}
          {a.horsUnite > 0 && (
            <p style={{ margin: 0, fontFamily: FONT, fontSize: 9.5, lineHeight: 1.5,
              color: CLAIR.texteFaible }}>
              {a.horsUnite} plafond{a.horsUnite > 1 ? "s" : ""} de versements hors total :
              vos versements sont déjà compris dans votre patrimoine.
            </p>
          )}

          <p style={{ margin: 0, fontFamily: FONT, fontSize: 9, lineHeight: 1.5,
            color: CLAIR.texteFaible }}>
            {/* Resserré à une ligne : la mise en garde reste, sans manger la place des
                constats voisins. */}
            Cibles d’échéances différentes : un euro futur vaut moins qu’aujourd’hui.
          </p>
        </>
      )}
    </div>
  );
}
