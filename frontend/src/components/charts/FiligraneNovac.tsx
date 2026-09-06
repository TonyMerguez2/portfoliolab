"use client";
import { FONT } from "@/lib/typography";

/**
 * Le filigrane Novac sur un graphique : le sigle et le nom, posés en bas à gauche du tracé.
 *
 * ⚠️ **En bas à gauche, et pas ailleurs, pour trois raisons mesurées.** Le coin haut gauche
 * porte la légende de survol sur la page actif et l'encart d'écriture sur le portefeuille ; le
 * bord droit porte l'échelle des prix et l'étiquette du dernier cours ; le bas est l'axe des
 * dates. Reste le coin bas gauche, au-dessus des dates : la courbe y passe rarement — un
 * historique monte en général vers la droite — et rien d'autre n'y vit. C'est aussi là que les
 * outils de marché mettent le leur, et l'œil sait déjà l'y ignorer.
 *
 * ⚠️ **Un filigrane, donc en dessous de tout : sous la lecture, pas devant.** Opacité faible,
 * transparent aux événements, sans `z-index` au-dessus des légendes. Il signe la capture
 * d'écran ; il ne doit jamais disputer la place à une valeur.
 *
 * ⚠️ **Le sigle est le même masque que la barre latérale** — un seul fichier, une seule forme,
 * teintée de l'encre du thème pour rester lisible en clair comme en sombre.
 */
export default function FiligraneNovac({ bas = 34, gauche = 12 }: { bas?: number; gauche?: number }) {
  return (
    <div aria-hidden="true" style={{
      position: "absolute", left: gauche, bottom: bas, zIndex: 3, pointerEvents: "none",
      display: "flex", alignItems: "center", gap: 7, opacity: 0.16, userSelect: "none",
      color: "var(--nv-texte)",
    }}>
      <span style={{
        width: 18, height: 18, flexShrink: 0, backgroundColor: "currentColor",
        maskImage: "url(/logo-hivesync.svg)", WebkitMaskImage: "url(/logo-hivesync.svg)",
        maskSize: "contain", WebkitMaskSize: "contain",
        maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
        maskPosition: "center", WebkitMaskPosition: "center",
      }} />
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, letterSpacing: "0.22em", lineHeight: 1 }}>
        NOVAC
      </span>
    </div>
  );
}
