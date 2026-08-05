"use client";
import { useRef, useState } from "react";
import { JETONS, RAYONS, rayonVignette } from "@/lib/palette";
import { FONT } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";
import { encreSur } from "@/lib/couleur";
import { initiale } from "@/lib/initiale";

/**
 * L'image de profil d'un portefeuille, et de quoi la changer.
 *
 * Sa forme suit celle des logos d'actifs — même rapport entre le rayon et la
 * taille, voir `rayonVignette`. Un portefeuille et un actif sont deux choses
 * qu'on désigne du regard au même endroit ; leur donner deux silhouettes
 * différentes ferait croire à deux natures différentes.
 *
 * Sans image, l'initiale du nom sur la couleur du portefeuille. Elle est
 * redondante avec le nom affiché juste à côté, et c'est vrai de tous les
 * avatars : leur rôle n'est pas d'informer mais d'occuper un emplacement
 * stable et reconnaissable. C'est précisément ce qui manquait au repli
 * précédent — les logos empilés des actifs. Ils montraient le contenu, mais
 * ne ressemblaient pas à un emplacement d'image, si bien que personne ne
 * pouvait deviner qu'on pouvait en poser une.
 *
 * L'encre de l'initiale se calcule au lieu de se choisir : les couleurs de
 * portefeuille sont libres, et entre un jaune et un bleu marine l'une réclame
 * du noir et l'autre du blanc. Voir `encreSur`.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Ce que l'API renvoie et que l'appelant doit réinjecter dans son état. */
export type PortefeuilleImage = {
  id: string; name: string; color?: string | null; image_url?: string | null;
};

/** La couleur par défaut de l'API, reprise ici pour les portefeuilles anciens. */
const COULEUR_PAR_DEFAUT = "#6366F1";


function Appareil() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export default function ImagePortefeuille<T extends PortefeuilleImage>({
  portefeuille, taille = 44, onChange,
}: {
  portefeuille: T;
  taille?: number;
  /** Reçoit le portefeuille tel que l'API le renvoie après écriture. */
  onChange: (p: T) => void;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const rayon = rayonVignette(taille);
  const image = portefeuille.image_url;
  const fond = portefeuille.color || COULEUR_PAR_DEFAUT;

  async function appeler(methode: "POST" | "DELETE", corps?: FormData) {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(`${API}/api/v1/portfolios/${portefeuille.id}/image`, {
        // Surtout pas de Content-Type ici : c'est au navigateur de le poser,
        // avec la frontière multipart qu'il vient de tirer au sort.
        method: methode, headers: enTetesAuth(), body: corps,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Envoi refusé");
      }
      onChange(await r.json());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setEnvoi(false);
    }
  }

  function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Le champ est remis à zéro pour que reprendre le même fichier après un
    // refus déclenche bien un nouvel événement.
    e.target.value = "";
    if (!f) return;
    const form = new FormData();
    form.append("file", f);
    appeler("POST", form);
  }

  const libelle = image ? "Changer l'image du portefeuille" : "Ajouter une image au portefeuille";

  return (
    <div style={{ position: "relative", flexShrink: 0, lineHeight: 0 }}
      onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}>
      <input ref={champ} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={choisir} style={{ display: "none" }} />

      <button type="button" onClick={() => champ.current?.click()} disabled={envoi}
        title={libelle} aria-label={libelle}
        style={{
          width: taille, height: taille, overflow: "hidden",
          borderRadius: rayon, padding: 0, border: "none",
          background: image ? JETONS.carteCreuse : fond,
          color: image ? undefined : encreSur(fond),
          cursor: envoi ? "progress" : "pointer", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONT, fontWeight: 700, letterSpacing: "-0.02em",
          // Proportionnel : la vignette est réutilisable à d'autres tailles, et
          // une taille de texte fixe s'y perdrait ou y déborderait.
          fontSize: Math.round(taille * 0.45), lineHeight: 1,
          opacity: envoi ? 0.6 : 1, transition: "opacity 150ms",
        }}>
        {image
          // Chemin renvoyé par l'API, donc relatif à elle et non au frontal.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`${API}${image}`} alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <span aria-hidden="true">{initiale(portefeuille.name)}</span>}

        {survol && !envoi && (
          <span style={{
            position: "absolute", inset: 0, borderRadius: rayon,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.55)", color: "#FFFFFF",
          }}>
            <Appareil />
          </span>
        )}
      </button>

      {/* Tant qu'aucune image n'est posée, la pastille reste visible en
          permanence. Un survol seul ne se découvre pas : rien, au repos,
          n'aurait dit qu'on peut cliquer ici — c'est bien ce qui s'est
          produit. Une fois l'image en place, elle se supprime : l'image se
          désigne elle-même, et le survol suffit à proposer de la changer. */}
      {!image && !envoi && (
        <span aria-hidden="true" style={{
          position: "absolute", right: -4, bottom: -4, zIndex: 11,
          width: 17, height: 17, borderRadius: RAYONS.plein,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: JETONS.segmentActif, color: JETONS.segmentEncre,
          boxShadow: JETONS.segmentOmbre, pointerEvents: "none",
        }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={3} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      )}

      {image && survol && !envoi && (
        <button type="button" onClick={() => appeler("DELETE")}
          title="Retirer l'image" aria-label="Retirer l'image du portefeuille"
          style={{
            position: "absolute", top: -5, right: -5, width: 17, height: 17,
            borderRadius: RAYONS.plein, border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: JETONS.negatif, color: "#FFFFFF",
            fontFamily: FONT, fontSize: 11, lineHeight: 1, fontWeight: 700,
          }}>×</button>
      )}

      {erreur && (
        <span role="alert" style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, zIndex: 5,
          whiteSpace: "nowrap", fontFamily: FONT, fontSize: 10,
          color: JETONS.negatifFort, background: JETONS.negatifVoile,
          borderRadius: 6, padding: "3px 7px", lineHeight: 1.3,
        }}>{erreur}</span>
      )}
    </div>
  );
}
