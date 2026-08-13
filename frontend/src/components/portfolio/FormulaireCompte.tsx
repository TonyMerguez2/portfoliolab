"use client";
import { useEffect, useRef, useState } from "react";

import type { CompteASoumettre, GenreCompte } from "@/lib/comptes";
import { COULEURS_AVATAR } from "@/lib/avatarCouleur";
import { CLAIR, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * La déclaration d'un compte, en deux temps.
 *
 * ⚠️ **Le compte se définit avant qu'une opération n'y entre, et c'est l'inverse d'avant.**
 * Jusqu'ici un compte n'existait qu'en creux : il apparaissait parce qu'une ligne avait été
 * saisie et que sa place de cotation le laissait deviner. Un compte courant, qui ne détient
 * aucun titre, ne pouvait donc jamais exister — et deux PEA chez deux banques n'en faisaient
 * qu'un. On le déclare maintenant d'abord : ce qu'il est, de quelle couleur, sous quel logo.
 *
 * ⚠️ **Deux temps, parce que ce sont deux questions.** *Qu'est-ce que ce compte* est une
 * description ; *comment ses opérations y entrent* est un mode de fonctionnement. Fondues
 * dans un seul écran, la seconde se serait lue comme un champ de plus, et l'on aurait coché
 * « automatique » sans voir que rien ne l'assure encore.
 *
 * ⚠️ **Aucun jugement.** Le formulaire enregistre ce que l'épargnant déclare détenir. Il ne
 * dit pas qu'un PEA vaut mieux qu'un compte-titres, et ne propose rien à y mettre.
 */

/** Ce que le formulaire rend une fois le premier temps rempli. */
export type SaisieCompte = CompteASoumettre & { logo: File | null };

/**
 * Les couleurs proposées pour le dossier.
 *
 * ⚠️ **Celles de l'avatar, et non une seconde palette.** Elles couvrent le tour du cercle
 * chromatique à clarté et saturation comparables — c'est déjà éprouvé — et deux palettes
 * auraient divergé au premier ajustement, si bien qu'un dossier et un personnage n'auraient
 * plus jamais été exactement de la même couleur.
 */
const COULEURS = COULEURS_AVATAR;

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
  genres, enCours, erreur, onEnregistrer, onFermer,
}: {
  /** Les genres publiés par le serveur. Vide tant qu'ils ne sont pas arrivés. */
  genres: GenreCompte[];
  enCours: boolean;
  erreur: string | null;
  onEnregistrer: (s: SaisieCompte) => void;
  onFermer: () => void;
}) {
  const [etape, setEtape] = useState<1 | 2>(1);
  const [nom, setNom] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [couleur, setCouleur] = useState(COULEURS[0].hex);
  const [solde, setSolde] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [apercuLogo, setApercuLogo] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  /**
   * ⚠️ **Le premier genre n'est choisi qu'une fois la liste arrivée.** Poser une valeur en
   * dur au montage aurait remis un genre que le serveur pourrait ne plus connaître ; on
   * attend ce qu'il publie, et l'on ne choisit rien tant qu'il n'a rien dit.
   */
  useEffect(() => {
    if (!genre && genres.length > 0) setGenre(genres[0].cle);
  }, [genres, genre]);

  /**
   * ⚠️ **L'aperçu du logo se révoque, sinon il fuit.** `createObjectURL` retient le fichier
   * en mémoire jusqu'à ce qu'on le relâche : choisir cinq logos de suite en garderait cinq.
   */
  useEffect(() => {
    if (!logo) { setApercuLogo(null); return; }
    const url = URL.createObjectURL(logo);
    setApercuLogo(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const genreChoisi = genres.find(g => g.cle === genre);
  const nomPropre = nom.trim();
  const peutContinuer = nomPropre.length > 0 && genre.length > 0;

  const enregistrer = () => onEnregistrer({
    nom: nomPropre, genre, couleur, logo,
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
            {etape === 1 ? "Nouveau compte" : "Les opérations de ce compte"}
          </span>
          <button type="button" onClick={onFermer} aria-label="Fermer"
            style={{ background: "none", border: "none", cursor: "pointer",
              color: CLAIR.texteFaible, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {etape === 1 ? (
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
                  Ce compte ne détient pas de titres : sa valeur est son solde.
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={etiquette}>Couleur du dossier</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {COULEURS.map(c => (
                  <button key={c.hex} type="button" onClick={() => setCouleur(c.hex)}
                    aria-label={c.nom} title={c.nom}
                    style={{
                      width: 22, height: 22, borderRadius: "50%", cursor: "pointer",
                      background: c.hex, border: "none",
                      // La sélection se dit par un anneau détaché, pas par un liseré : sur
                      // une pastille de 22 px, un bord de la même famille disparaît.
                      boxShadow: couleur === c.hex
                        ? `0 0 0 2px ${CLAIR.carte}, 0 0 0 4px ${c.hex}` : "none",
                    }} />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={etiquette}>Logo de l’établissement</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: RAYONS.xs, flexShrink: 0,
                  background: apercuLogo ? `center/cover no-repeat url(${apercuLogo})` : couleur,
                  border: `1px solid ${CLAIR.bord}`,
                }} />
                <input ref={fichier} type="file" accept="image/*" hidden
                  onChange={e => setLogo(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fichier.current?.click()}
                  style={{ ...champ, width: "auto", cursor: "pointer",
                    color: CLAIR.texteSecondaire }}>
                  {logo ? "Changer" : "Choisir une image"}
                </button>
                {logo && (
                  <button type="button" onClick={() => setLogo(null)}
                    style={{ background: "none", border: "none", cursor: "pointer",
                      fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
                    Retirer
                  </button>
                )}
              </div>
              <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue }}>
                Facultatif. À défaut, le dossier porte sa couleur.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={etiquette}>Liquidités {genreChoisi?.titres ? "du compte" : ""}</span>
              <input value={solde} onChange={e => setSolde(e.target.value)}
                inputMode="decimal" placeholder="Facultatif"
                style={{ ...champ, ...NUM }} />
            </div>
          </>
        ) : (
          <>
            <span style={{ fontFamily: FONT, fontSize: 11.5, color: CLAIR.texteSecondaire, lineHeight: 1.55 }}>
              Comment les opérations de <b>{nomPropre}</b> arrivent-elles ?
            </span>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                padding: "12px 13px", borderRadius: RAYONS.xs,
                background: CLAIR.carteCreuse, border: `1px solid ${couleur}`,
              }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
                  Saisie manuelle
                </div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.texteSecondaire, marginTop: 3, lineHeight: 1.5 }}>
                  Vous enregistrez vos achats et ventes vous-même. C’est ce qui alimente les
                  quantités, le prix de revient et la valorisation.
                </div>
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
                  Les opérations remonteraient seules depuis votre banque. Cela demande une
                  connexion bancaire, qui n’est pas encore en place.
                </div>
              </div>
            </div>
          </>
        )}

        {erreur && (
          <span style={{ fontFamily: FONT, fontSize: 11.5, color: CLAIR.negatif }}>{erreur}</span>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
          <button type="button" onClick={() => (etape === 1 ? onFermer() : setEtape(1))}
            style={{
              fontFamily: FONT, fontSize: 12, padding: "8px 14px", borderRadius: RAYONS.xs,
              cursor: "pointer", background: "transparent",
              border: `1px solid ${CLAIR.bord}`, color: CLAIR.texteSecondaire,
            }}>
            {etape === 1 ? "Annuler" : "Retour"}
          </button>
          <button type="button" disabled={!peutContinuer || enCours}
            onClick={() => (etape === 1 ? setEtape(2) : enregistrer())}
            style={{
              fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "8px 16px",
              borderRadius: RAYONS.xs, border: "none", color: "#FFFFFF",
              background: couleur, opacity: !peutContinuer || enCours ? 0.45 : 1,
              cursor: !peutContinuer || enCours ? "default" : "pointer",
            }}>
            {etape === 1 ? "Continuer" : enCours ? "Création…" : "Créer le compte"}
          </button>
        </div>
      </div>
    </div>
  );
}
