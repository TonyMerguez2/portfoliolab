"use client";
import { useEffect, useState } from "react";

import type { Compte, CompteASoumettre, GenreCompte } from "@/lib/comptes";
import { fraicheurDuSolde } from "@/lib/comptes";
import PastillesCouleur, { COULEURS_DOSSIER } from "@/components/portfolio/PastillesCouleur";
import { CLAIR, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * La déclaration d'un compte, en deux temps.
 *
 * ⚠️ **Le compte se définit avant qu'une opération n'y entre, et c'est l'inverse d'avant.**
 * Jusqu'ici un compte n'existait qu'en creux : il apparaissait parce qu'une ligne avait été
 * saisie et que sa place de cotation le laissait deviner. Un compte courant, qui ne détient
 * aucun titre, ne pouvait donc jamais exister — et deux PEA chez deux banques n'en faisaient
 * qu'un. On le déclare maintenant d'abord : ce qu'il est, et de quelle couleur.
 *
 * ⚠️ **Deux temps, parce que ce sont deux questions.** *Qu'est-ce que ce compte* est une
 * description ; *comment ses opérations y entrent* est un mode de fonctionnement. Fondues
 * dans un seul écran, la seconde se serait lue comme un champ de plus, et l'on aurait coché
 * « automatique » sans voir que rien ne l'assure encore.
 *
 * ⚠️ **Aucun jugement.** Le formulaire enregistre ce que l'épargnant déclare détenir. Il ne
 * dit pas qu'un PEA vaut mieux qu'un compte-titres, et ne propose rien à y mettre.
 *
 * ⚠️ **Le même écran sert à corriger, et il le fallait d'urgence.** Un solde saisi à la main
 * est la valeur d'un compte de trésorerie : il entre dans le total du portefeuille et vieillit
 * tout seul. Sans moyen de le reprendre, déclarer un livret revenait à graver un chiffre —
 * pire que de ne rien déclarer, puisque le total avait l'air juste. La correction se fait donc
 * ici, en un temps : le second, qui demande d'où viennent les opérations, ne concerne que la
 * déclaration initiale.
 */

/**
 * Ce que le formulaire rend une fois le premier temps rempli.
 *
 * ⚠️ **Un alias, et non plus un type à part.** Il portait un `logo: File | null` que la
 * soumission au serveur ne contient pas — le fichier partait par une seconde requête. Le
 * logo retiré, les deux formes se confondent ; l'alias reste parce que c'est le mot que
 * l'écran emploie, et parce qu'il redeviendra distinct au premier champ propre à la saisie.
 */
export type SaisieCompte = CompteASoumettre;

const etiquette: React.CSSProperties = {
  fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
  color: CLAIR.texteFaible, textTransform: "uppercase",
};

const champ: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: FONT, fontSize: 12.5,
  padding: "8px 10px", borderRadius: RAYONS.xs, background: CLAIR.carteCreuse,
  border: `1px solid ${CLAIR.bord}`, color: CLAIR.texte, outline: "none",
};

export default function FormulaireCompte({
  genres, initial, prerempli, titre, mention, enCours, erreur,
  onEnregistrer, onSupprimer, onFermer,
}: {
  /** Les genres publiés par le serveur. Vide tant qu'ils ne sont pas arrivés. */
  genres: GenreCompte[];
  /** Le compte à corriger, ou rien pour en déclarer un nouveau. */
  initial?: Compte | null;
  /**
   * De quoi ouvrir le formulaire déjà rempli, **sans en faire une correction**.
   *
   * ⚠️ **Un champ à part, et non un faux `initial`.** `correction = initial != null`
   * commande trois choses d'un coup : le titre, le saut de la seconde étape, et la présence
   * du bouton Supprimer. Préremplir en passant un compte fabriqué aurait donc offert de
   * supprimer un compte qui n'existe pas encore.
   */
  prerempli?: SaisieCompte;
  /** Remplace le titre, quand la déclaration a un contexte à nommer. */
  titre?: React.ReactNode;
  /** Ce que l'enregistrement va faire en plus de créer le compte. */
  mention?: React.ReactNode;
  enCours: boolean;
  erreur: string | null;
  onEnregistrer: (s: SaisieCompte) => void;
  onSupprimer?: () => void;
  onFermer: () => void;
}) {
  const correction = initial != null;
  const depart = initial ?? prerempli;
  const [etape, setEtape] = useState<1 | 2>(1);
  const [nom, setNom] = useState(depart?.nom ?? "");
  const [genre, setGenre] = useState<string>(depart?.genre ?? "");
  const [couleur, setCouleur] = useState(depart?.couleur ?? COULEURS_DOSSIER[0].hex);
  /**
   * ⚠️ **Le solde se relit en français, avec ses centimes.** `String(12450.8)` rend
   * « 12450.8 » : un point décimal dans une saisie française, et le zéro final envolé. Vu à
   * l'écran après avoir tapé 12450,80. On repasse donc par deux décimales et la virgule —
   * `enregistrer` refait le chemin inverse, et le champ reste modifiable au clavier puisqu'il
   * ne porte aucun séparateur de milliers.
   */
  const [solde, setSolde] = useState(
    depart?.solde != null ? depart.solde.toFixed(2).replace(".", ",") : "");
  /**
   * ⚠️ **La suppression demande deux clics, et non une boîte du navigateur.** `confirm()`
   * arrête tout, sort de la page et se présente au nom du site plutôt qu'au nom de
   * l'application. Le bouton qui se transforme en son propre garde-fou reste dans le
   * formulaire, se défait en fermant, et personne ne supprime un compte en visant mal.
   */
  const [confirmeSuppression, setConfirmeSuppression] = useState(false);

  /**
   * ⚠️ **Le premier genre n'est choisi qu'une fois la liste arrivée.** Poser une valeur en
   * dur au montage aurait remis un genre que le serveur pourrait ne plus connaître ; on
   * attend ce qu'il publie, et l'on ne choisit rien tant qu'il n'a rien dit.
   */
  useEffect(() => {
    if (!genre && genres.length > 0) setGenre(genres[0].cle);
  }, [genres, genre]);

  const genreChoisi = genres.find(g => g.cle === genre);
  const nomPropre = nom.trim();
  /**
   * Le compte détient-il des titres ? Toute la suite en dépend.
   *
   * ⚠️ **Ce n'est pas une nuance d'étiquette, c'est deux comptes différents.** Un compte
   * de trésorerie n'a pas d'opérations au sens de l'application — le modèle de saisie
   * parle de ticker, de sens achat/vente, de quantité et de prix unitaire, et rien de
   * cela ne s'applique à un livret. Son solde **est** sa valeur, là où celui d'un PEA
   * n'est que la poche d'espèces posée à côté des titres.
   *
   * ⚠️ **Tant que le serveur n'a rien publié, on ne suppose rien.** `genreChoisi` est
   * indéfini au premier rendu ; traiter cette absence comme « avec titres » aurait
   * montré, le temps d'une image, un formulaire qui ne correspond à rien.
   */
  const avecTitres = genreChoisi?.titres ?? true;
  /**
   * ⚠️ **Le solde est exigé quand il est toute la valeur du compte.** Un livret déclaré
   * sans solde ne vaut rien et ne dit rien : la carte porterait un nom et un vide. Sur un
   * compte à titres, en revanche, il reste facultatif — les espèces non investies peuvent
   * être nulles, et surtout on les ignore souvent au moment de déclarer.
   */
  const soldeSaisi = solde.trim() !== "" && Number.isFinite(Number(solde.replace(",", ".")));
  const peutContinuer = nomPropre.length > 0 && genre.length > 0
    && (avecTitres || soldeSaisi);

  const enregistrer = () => onEnregistrer({
    nom: nomPropre, genre, couleur,
    /**
     * ⚠️ **Un champ vide n'est pas un solde nul.** `parseFloat("")` rend `NaN`, et un zéro
     * posé par défaut ferait déclarer « ce compte est vide » à qui n'a rien saisi. Le serveur
     * distingue les deux ; l'écran doit le lui permettre.
     */
    solde: solde.trim() === "" ? null : Number(solde.replace(",", ".")),
  });

  return (
    <div onClick={onFermer}
      style={{
        position: "fixed", inset: 0, zIndex: 60, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto",
          background: CLAIR.carte, border: `1px solid ${CLAIR.bord}`,
          borderRadius: RAYONS.sm, padding: "18px 20px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: CLAIR.texte }}>
            {titre ?? (correction ? "Modifier le compte"
              : etape === 1 ? "Nouveau compte"
              : avecTitres ? "Les opérations de ce compte" : "La mise à jour du solde")}
          </span>
          <button type="button" onClick={onFermer} aria-label="Fermer"
            style={{ background: "none", border: "none", cursor: "pointer",
              color: CLAIR.texteFaible, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {correction || etape === 1 ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={etiquette}>Nom</span>
              <input autoFocus value={nom} onChange={e => setNom(e.target.value)}
                placeholder="PEA Boursorama" maxLength={60} style={champ} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={etiquette}>Quel compte est-ce ?</span>
              {/**
                * ⚠️ **Les genres viennent du serveur.** Recopiés ici, ils auraient divergé au
                * premier ajout, et le formulaire aurait proposé un choix refusé ensuite avec
                * un 400 pour toute explication.
                */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {genres.map(g => (
                  <button key={g.cle} type="button" onClick={() => setGenre(g.cle)}
                    style={{
                      fontFamily: FONT, fontSize: 12, padding: "6px 11px",
                      borderRadius: RAYONS.xs, cursor: "pointer",
                      background: genre === g.cle ? couleur : CLAIR.carteCreuse,
                      border: `1px solid ${genre === g.cle ? couleur : CLAIR.bord}`,
                      color: genre === g.cle ? "#FFFFFF" : CLAIR.texteSecondaire,
                      fontWeight: genre === g.cle ? 600 : 500,
                      transition: "background 150ms, color 150ms",
                    }}>
                    {g.libelle}
                  </button>
                ))}
              </div>
              {genreChoisi && !genreChoisi.titres && (
                <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue }}>
                  Ce compte ne détient pas de titres : son solde est sa valeur, et il n’y a
                  pas d’opérations à y saisir.
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={etiquette}>Couleur du dossier</span>
              <PastillesCouleur couleur={couleur} onChoisir={setCouleur} />
            </div>

            {/**
              * ⚠️ **L'étiquette suit le genre, et ce n'est pas de la cosmétique.**
              * « Liquidités » est le mot juste en finance, et il a quand même échoué :
              * il a fallu demander ce qu'il désignait. Sur un compte courant, personne ne
              * dit « mes liquidités » — on dit son solde ; et sur un PEA, le mot ne dit
              * pas qu'il s'agit de la part *non investie*, ce qui est pourtant tout le
              * sens du champ.
              */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={etiquette}>{avecTitres ? "Espèces non investies" : "Solde"}</span>
              <input value={solde} onChange={e => setSolde(e.target.value)}
                inputMode="decimal"
                placeholder={avecTitres ? "Facultatif" : "Ex : 8 400"}
                style={{ ...champ, ...NUM }} />
              <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue }}>
                {avecTitres
                  ? "La part en euros qui dort à côté de vos titres. Facultatif."
                  : "Ce que contient le compte aujourd’hui."}
                {/* ⚠️ **L'âge du solde s'affiche là où on le corrige.** Sur la carte, il
                    informe ; ici, il justifie le geste qu'on est en train de faire. */}
                {correction && initial?.mis_a_jour_le && (
                  <> Dernière saisie {fraicheurDuSolde(initial.mis_a_jour_le)}.</>
                )}
              </span>
            </div>
          </>
        ) : (
          <>
            {/**
              * ⚠️ **La question posée n'est pas la même selon le compte.** Sur un PEA, on
              * demande d'où viennent les achats et les ventes. Sur un livret, il n'y a pas
              * d'opérations : la seule chose qui bouge est le solde, et la seule question
              * est de savoir qui le tient à jour. Poser la première question à un livret
              * aurait promis une saisie d'opérations qui n'existe pas pour lui.
              */}
            <span style={{ fontFamily: FONT, fontSize: 11.5, color: CLAIR.texteSecondaire, lineHeight: 1.55 }}>
              {avecTitres
                ? <>Comment les opérations de <b>{nomPropre}</b> arrivent-elles ?</>
                : <>Comment le solde de <b>{nomPropre}</b> se met-il à jour ?</>}
            </span>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                padding: "12px 13px", borderRadius: RAYONS.xs,
                background: CLAIR.carteCreuse, border: `1px solid ${couleur}`,
              }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
                  {avecTitres ? "Saisie manuelle" : "Vous le tenez à jour"}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.texteSecondaire, marginTop: 3, lineHeight: 1.5 }}>
                  {avecTitres
                    ? "Vous enregistrez vos achats et ventes vous-même. C’est ce qui alimente les quantités, le prix de revient et la valorisation."
                    : "Ce compte n’a pas d’opérations à saisir : vous corrigez son solde quand il change."}
                </div>
                {/**
                  * ⚠️ **Ce que l'enregistrement fait en plus, dit avant de le faire.**
                  * Déclarer un dossier deviné y range ses lignes du même geste : sans cette
                  * phrase, appuyer sur « Créer le compte » rattacherait trois opérations en
                  * silence — l'effet le plus surprenant de tout le parcours. Elle se pose
                  * ici, dans l'encart qui décrit déjà comment les opérations arrivent.
                  */}
                {mention && (
                  <div style={{
                    fontFamily: FONT, fontSize: 11, color: CLAIR.texte, marginTop: 8,
                    paddingTop: 8, borderTop: `1px solid ${CLAIR.bord}`, lineHeight: 1.5,
                  }}>
                    {mention}
                  </div>
                )}
              </div>

              {/**
                * ⚠️ **L'entrée automatique est montrée indisponible, et non cachée.** La
                * cacher ferait croire que la saisie manuelle est le seul fonctionnement
                * possible ; la proposer sans qu'elle marche serait pire. Elle suppose une
                * connexion bancaire — un agrégateur, un contrat, des identifiants — donc une
                * intégration entière, pas un réglage. Le dire ici évite qu'on l'attende.
                */}
              <div aria-disabled style={{
                padding: "12px 13px", borderRadius: RAYONS.xs,
                background: CLAIR.carteCreuse, border: `1px solid ${CLAIR.bord}`,
                opacity: 0.55, cursor: "not-allowed",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
                    Synchronisation bancaire
                  </span>
                  <span style={{
                    fontFamily: FONT, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em",
                    padding: "2px 6px", borderRadius: 999, background: CLAIR.bord,
                    color: CLAIR.texteSecondaire, textTransform: "uppercase",
                  }}>
                    Indisponible
                  </span>
                </div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.texteSecondaire, marginTop: 3, lineHeight: 1.5 }}>
                  {avecTitres
                    ? "Les opérations remonteraient seules depuis votre banque. Cela demande une connexion bancaire, qui n’est pas encore en place."
                    : "Le solde se mettrait à jour seul depuis votre banque. Cela demande une connexion bancaire, qui n’est pas encore en place."}
                </div>
              </div>
            </div>
          </>
        )}

        {erreur && (
          <span style={{ fontFamily: FONT, fontSize: 11.5, color: CLAIR.negatif }}>{erreur}</span>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
          {correction && onSupprimer ? (
            <button type="button" disabled={enCours}
              onClick={() => (confirmeSuppression ? onSupprimer() : setConfirmeSuppression(true))}
              style={{
                fontFamily: FONT, fontSize: 12, padding: "8px 14px", borderRadius: RAYONS.xs,
                cursor: enCours ? "default" : "pointer", background: "transparent",
                border: `1px solid ${confirmeSuppression ? CLAIR.negatif : CLAIR.bord}`,
                color: confirmeSuppression ? CLAIR.negatif : CLAIR.texteFaible,
                fontWeight: confirmeSuppression ? 600 : 400,
              }}>
              {confirmeSuppression ? "Confirmer la suppression" : "Supprimer"}
            </button>
          ) : (
            <button type="button" onClick={() => (etape === 1 ? onFermer() : setEtape(1))}
              style={{
                fontFamily: FONT, fontSize: 12, padding: "8px 14px", borderRadius: RAYONS.xs,
                cursor: "pointer", background: "transparent",
                border: `1px solid ${CLAIR.bord}`, color: CLAIR.texteSecondaire,
              }}>
              {etape === 1 ? "Annuler" : "Retour"}
            </button>
          )}
          <button type="button" disabled={!peutContinuer || enCours}
            onClick={() => (correction || etape === 2 ? enregistrer() : setEtape(2))}
            style={{
              fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "8px 16px",
              borderRadius: RAYONS.xs, border: "none", color: "#FFFFFF",
              background: couleur, opacity: !peutContinuer || enCours ? 0.45 : 1,
              cursor: !peutContinuer || enCours ? "default" : "pointer",
            }}>
            {enCours ? "Enregistrement…"
              : correction ? "Enregistrer"
              : etape === 1 ? "Continuer" : "Créer le compte"}
          </button>
        </div>
      </div>
    </div>
  );
}
