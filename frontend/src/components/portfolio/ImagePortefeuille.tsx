"use client";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { JETONS, RAYONS, rayonVignette } from "@/lib/palette";
import { FONT } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";

/**
 * L'image de profil d'un portefeuille, et de quoi la changer.
 *
 * Sa forme suit celle des logos d'actifs — même rapport entre le rayon et la
 * taille, voir `rayonVignette`. Un portefeuille et un actif sont deux choses
 * qu'on désigne du regard au même endroit ; leur donner deux silhouettes
 * différentes ferait croire à deux natures différentes.
 *
 * Sans image, la vignette laisse voir ce qu'on lui passe en `children` — les
 * logos empilés du portefeuille. Ce repli en dit plus qu'un marque-place : il
 * montre le contenu au lieu d'annoncer un vide.
 *
 * D'où les deux gabarits ci-dessous plutôt qu'un seul. L'image occupe un carré
 * fixe ; les logos empilés font trois fois cette largeur et seraient rognés
 * s'ils héritaient de la même boîte. Le survol s'ajuste à ce que la boîte
 * contient au lieu d'imposer une taille aux deux.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Ce que l'API renvoie et que l'appelant doit réinjecter dans son état. */
export type PortefeuilleImage = { id: string; image_url?: string | null };

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
  portefeuille, taille = 44, onChange, children,
}: {
  portefeuille: T;
  taille?: number;
  /** Reçoit le portefeuille tel que l'API le renvoie après écriture. */
  onChange: (p: T) => void;
  /** Affiché à défaut d'image. */
  children?: ReactNode;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const rayon = rayonVignette(taille);
  const image = portefeuille.image_url;

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
          // Carré imposé pour l'image, ajusté au contenu pour le repli.
          ...(image ? { width: taille, height: taille, overflow: "hidden" } : {}),
          borderRadius: rayon, padding: 0, border: "none",
          background: image ? JETONS.carteCreuse : "transparent",
          cursor: envoi ? "progress" : "pointer", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: envoi ? 0.6 : 1, transition: "opacity 150ms",
        }}>
        {image
          // Chemin renvoyé par l'API, donc relatif à elle et non au frontal.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`${API}${image}`} alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : children}

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
