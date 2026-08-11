"use client";
import { observations, type Objectif } from "@/lib/objectifs";
import { CLAIR } from "@/lib/palette";
import { FONT } from "@/lib/typography";

/**
 * Des constats chiffrés sur l'objectif projeté.
 *
 * ⚠️ **Ce panneau occupe l'emplacement des « Recommandations IA » de la maquette**, qui
 * proposait « augmenter votre investissement mensuel à 1 000 € », « réduire l'exposition
 * aux actions à 70 % », « activer le réinvestissement automatique ». C'est du conseil en
 * investissement personnalisé, que ce logiciel ne produit pas. Ce qui suit est
 * arithmétique : des soustractions, des divisions et des comparaisons de dates, dont
 * chacune se recompte à la main. L'épargnant en tire ses conclusions ; le logiciel ne les
 * tire pas pour lui.
 *
 * Séparé de la progression globale parce que la maquette en fait deux cartes distinctes,
 * et parce que les deux ne parlent pas de la même chose : l'une agrège tous les
 * objectifs, l'autre détaille celui qu'on projette.
 */
export default function ConstatsObjectif({
  objectif, valeurPortefeuille, medianeProjection,
}: {
  objectif: Objectif | null;
  valeurPortefeuille: number | null;
  /**
   * La médiane que le panneau de projection affiche.
   *
   * ⚠️ Transmise pour que les deux panneaux citent le **même** nombre. Sans elle, les
   * constats retombent sur la capitalisation déterministe du serveur, et l'écran montre
   * 373 261 € d'un côté et 362 986 € de l'autre pour la même grandeur.
   */
  medianeProjection?: number | null;
}) {
  const constats = objectif
    ? observations(objectif, valeurPortefeuille, medianeProjection) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
          Constats
        </span>
        {objectif && (
          <span style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>
            {objectif.nom}
          </span>
        )}
      </div>

      {constats.length === 0 ? (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 10.5, lineHeight: 1.55,
          color: CLAIR.texteFaible }}>
          {objectif
            ? "Rien à constater sans échéance ni hypothèse de rendement : ce panneau ne "
              + "calcule que ce que vos paramètres permettent."
            : "Choisissez un objectif pour en voir les constats."}
        </p>
      ) : (
        <>
          {constats.map(t => (
            <div key={t} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
                background: CLAIR.texteFaible, marginTop: 5 }} />
              <span style={{ fontFamily: FONT, fontSize: 10.5, lineHeight: 1.55,
                color: CLAIR.texteSecondaire }}>{t}</span>
            </div>
          ))}
          {/* ⚠️ Dit en clair, parce que l'emplacement de la maquette promettait des
              recommandations et qu'un lecteur peut s'attendre à en trouver ici. */}
          <span style={{ marginTop: 2, fontFamily: FONT, fontSize: 9, lineHeight: 1.5,
            color: CLAIR.texteFaible }}>
            Ce sont des calculs, pas des recommandations : ce logiciel ne conseille aucun
            placement.
          </span>
        </>
      )}
    </div>
  );
}
