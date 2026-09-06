"use client";
import TitreDeCarte from "@/components/ui/TitreDeCarte";
import { useMemo, useState } from "react";

import AssetLogo from "@/components/AssetLogo";
import Segments from "@/components/ui/Segments";
import Mosaique from "@/components/portfolio/Mosaique";
import { blocsDuPortefeuille, type DossierPave, type ModePavage } from "@/lib/pavage";
import { decalerClarte } from "@/lib/couleur";
import { couleurActif } from "@/lib/tileStyle";
import { CLAIR, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * La répartition du portefeuille, en pavage.
 *
 * ⚠️ **Un pavage plutôt qu'un camembert, et l'objection est connue.** Une treemap a déjà été
 * retirée de cette application, pour un motif inscrit dans le code : « le poids codé par la
 * surface rendait les petites lignes illisibles ». Mais c'était pour remplacer la **grille
 * d'actifs**, là où l'on vient lire un cours, une variation, un prix de revient sur chaque
 * ligne. Ici le travail est autre : montrer la *forme* du portefeuille d'un coup d'œil. Et
 * le camembert code le poids par un **angle**, qui se compare plus mal encore qu'une aire.
 *
 * ⚠️ **Un mode, un système de couleurs — jamais deux à la fois.** Teinter les groupes à la
 * couleur des dossiers *et* les blocs à celle des titres donnait une image où la couleur ne
 * raconte plus rien. Chaque mode en porte donc un seul : les dossiers en « compte », les
 * cartes en « actif », une roue chromatique en « classe ».
 *
 * ⚠️ **Le tout vaut toujours le portefeuille entier, liquidités comprises.** Voir `pavage.ts`
 * et son invariant : sans cela, une même ligne vaudrait 20 % dans un mode et 34 % dans
 * l'autre — deux chiffres justes dans leur repère et incomparables entre eux.
 */


const MODES: { valeur: ModePavage; libelle: string }[] = [
  { valeur: "compte", libelle: "Compte" },
  { valeur: "actif", libelle: "Actif" },
  { valeur: "classe", libelle: "Classe" },
];


const EUROS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export default function RepartitionPavee({
  dossiers, onVoirTout,
}: {
  dossiers: DossierPave[];
  onVoirTout?: () => void;
}) {
  const [mode, setMode] = useState<ModePavage>("compte");
  const blocs = useMemo(() => {
    /* ⚠️ **`couleurActif` et non `brandHex`, sinon le tableau de bord se contredit lui-même.**
       Les cartes d'actif de la même page consultent la teinte tirée du logo pour les actifs
       absents de la table de marques ; laisser la répartition sur `brandHex` lui aurait fait
       peindre le même actif d'une couleur de hachage à côté de sa carte. La règle est partagée,
       et le cache des teintes l'est aussi — voir `lib/couleursLogos`. */
    /* ⚠️ **Plus de « N autres » : chaque ligne a sa tuile, signalé à l'écran.** Le regroupement
       réunissait sous un bloc gris tout ce qui pesait moins de 4 %, au motif qu'une tuile trop
       petite ne peut pas porter son nom. Mais c'est déjà réglé ailleurs et mieux : `poidsLisibles`
       relève les plus petites à un plancher pour qu'elles ne soient pas des filets, `nomLisible`
       tait l'étiquette quand elle ne tient pas, et la **ligne de lecture** au-dessus nomme la tuile
       survolée. Fondre quatre actifs en un bloc anonyme cachait de l'information que ces trois
       mécanismes savent déjà montrer. */
    return blocsDuPortefeuille(dossiers, mode, t => couleurActif(t));
  }, [dossiers, mode]);
  return (
    <>
      {/**
        * ⚠️ **La rangée s'aligne sur la barre d'outils de la courbe, à sa gauche.** Les deux
        * commandent chacune leur image et se font face à travers l'écran ; décalées, elles se
        * voient sans qu'on sache pourquoi.
        *
        * ⚠️ **Alignée par le haut, et non par les deux bords.** Prendre le calibre `md` de la
        * barre d'en face donnait bien des marges identiques en haut et en bas — et une pastille
        * trop grosse pour un panneau de trois centimètres, où elle pesait autant que l'image
        * qu'elle commande. Le `sm` revient, et seule l'arête supérieure se cale : c'est celle
        * qu'on lit, les deux barres étant à la même hauteur d'œil.
        *
        * ⚠️ **Le retrait négatif compense un rembourrage, et il se mesure.** La carte est plus
        * généreuse que celle de la courbe ; cinq pixels posent l'arête haute de la piste
        * exactement sur celle d'en face. Écrit à sept, elle la dépassait de deux — assez pour
        * se voir, comme l'écart qu'on cherchait à supprimer.
        */}
      <TitreDeCarte style={{ marginBottom: 5 }} action={
        <Segments taille="sm" ariaLabel="Découper la répartition"
          valeur={mode} onChange={v => setMode(v as ModePavage)}
          options={MODES.map(m => ({ valeur: m.valeur, libelle: m.libelle }))} />
      }>Répartition</TitreDeCarte>

      {/* La carte en arbre elle-même — voir `Mosaique`, partagée avec « Exposition ». */}
      <Mosaique blocs={blocs} montant={b => `${EUROS.format(Math.round(b.valeur))} €`} />

      {/* ⚠️ **Plus de légende sous l'image.** Elle donnait le nombre de blocs et le total,
          et prenait vingt-cinq pixels sur un panneau qui en a moins de trois cents : le
          total figure déjà en gros dans le bandeau de tête, et compter les blocs revenait à
          décrire l'image au lieu de la montrer. Ce qu'un bloc vaut se lit au survol. */}
      {/* ⚠️ **Pas de légende sous l'image, et c'est demandé deux fois.** J'en ai remis une
          pour nommer les blocs muets : c'était traiter le symptôme. Un bloc doit parler
          lui-même dès qu'il en a physiquement la place, et se taire seulement quand il n'en
          a pas — le survol reste alors le dernier recours. */}
      {onVoirTout && (
        <button type="button" onClick={onVoirTout}
          style={{
            display: "flex", alignItems: "center", gap: 5, marginTop: 8, flexShrink: 0,
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: FONT, fontSize: 11, fontWeight: 500, color: CLAIR.accent,
          }}>
          Voir la répartition détaillée
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </>
  );
}
