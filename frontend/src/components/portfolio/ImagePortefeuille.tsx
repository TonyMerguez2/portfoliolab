"use client";
import { recuperer } from "@/lib/requete";
import { useRef, useState } from "react";
import { JETONS, RAYONS, rayonVignette } from "@/lib/palette";
import { FONT } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";
import { encreSur } from "@/lib/couleur";
import { initiale } from "@/lib/initiale";
import PocheActifs, { RAYON_CORPS } from "@/components/portfolio/PocheActifs";
import CadrerImage from "@/components/portfolio/CadrerImage";
import { annoncerModification } from "@/lib/portefeuilleModifie";
import { API_URL as API } from "@/lib/api";

/**
 * L'image de profil d'un portefeuille, et de quoi la changer.
 *
 * Sa forme suit celle des logos d'actifs — même rapport entre le rayon et la
 * taille, voir `rayonVignette`. Un portefeuille et un actif sont deux choses
 * qu'on désigne du regard au même endroit ; leur donner deux silhouettes
 * différentes ferait croire à deux natures différentes.
 *
 * Sans image, une poche portant une carte par actif : voir `PocheActifs`.
 * L'initiale du nom qui occupait cette place ne servait à rien d'autre qu'à
 * tenir l'emplacement — elle répétait le nom affiché à côté d'elle.
 *
 * ⚠️ **Rien n'indique plus, au repos, qu'on peut poser une image ici.** Ce repli
 * a déjà été retiré une fois, sous la forme des logos empilés des actifs : ils
 * montraient le contenu, mais ne ressemblaient pas à un emplacement d'image, si
 * bien que personne ne devinait qu'on pouvait en poser une. La pastille « + » y
 * avait répondu, avant d'être retirée à son tour sur demande — voir plus bas.
 * Il ne reste que l'icône d'appareil photo au survol, et un survol seul ne se
 * découvre pas. Le dessin de la poche est donc plus expressif que jamais, et son
 * emplacement moins cliquable que jamais : les deux se sont éloignés.
 *
 * L'initiale sert encore aux appelants qui ne passent pas `actifs`, avec son
 * encre calculée au lieu d'être choisie : les couleurs de portefeuille sont
 * libres, et entre un jaune et un bleu marine l'une réclame du noir et l'autre
 * du blanc. Voir `encreSur`.
 */


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
  portefeuille, taille = 44, actifs, onChange,
}: {
  portefeuille: T;
  taille?: number;
  /**
   * Les lignes du portefeuille, pour la poche du repli. Omises, on retombe sur
   * l'initiale du nom.
   *
   * À prendre à la même source que le compte affiché à côté de la vignette :
   * trois cartes sous la mention « 4 actifs » se lirait comme un bogue, et ce
   * serait le cas si l'un comptait l'allocation cible et l'autre les positions
   * réellement détenues.
   */
  actifs?: { ticker: string; weight: number }[];
  /** Reçoit le portefeuille tel que l'API le renvoie après écriture. */
  onChange: (p: T) => void;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Le fichier en attente de cadrage, avant tout envoi. */
  const [aCadrer, setACadrer] = useState<File | null>(null);

  const image = portefeuille.image_url;
  const fond = portefeuille.color || COULEUR_PAR_DEFAUT;
  // La poche peint son propre fond, d'un bord à l'autre : l'aplat du bouton ne
  // sert alors plus qu'aux angles qu'elle laisse voir, soit rien.
  const poche = !image && actifs != null;

  /**
   * Le rayon des angles.
   *
   * ⚠️ La poche impose le sien, relevé sur le concept — voir `RAYON_CORPS`. Ce
   * n'est pas un choix qu'on peut laisser à l'appelant : c'est ce bouton qui
   * coupe les angles du dessin avec son `overflow: hidden`, et du plus creux des
   * deux arrondis c'est toujours lui qui gagne. Un corps à 17,8 % dans un bouton
   * à 21,7 % rendrait 21,7.
   *
   * Les autres replis — image posée, initiale — gardent `rayonVignette`, la
   * silhouette commune aux logos d'actifs.
   */
  const rayon = poche ? Math.round(taille * RAYON_CORPS) : rayonVignette(taille);

  async function appeler(methode: "POST" | "DELETE", corps?: FormData) {
    setEnvoi(true); setErreur(null);
    try {
      const r = await recuperer(`${API}/api/v1/portfolios/${portefeuille.id}/image`, {
        // Surtout pas de Content-Type ici : c'est au navigateur de le poser,
        // avec la frontière multipart qu'il vient de tirer au sort.
        method: methode, headers: enTetesAuth(), body: corps,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Envoi refusé");
      }
      const maj = await r.json();
      onChange(maj);
      // L'appelant n'est pas le seul à afficher ce portefeuille : la liste du
      // menu de l'en-tête le montre aussi, et elle ne le relit qu'au montage.
      annoncerModification(maj);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setEnvoi(false);
    }
  }

  /**
   * Le fichier choisi passe par le cadrage avant l'envoi.
   *
   * ⚠️ Il n'y allait pas, et cela décidait du cadrage à la place de
   * l'utilisateur : le fichier partait tel quel, puis `object-fit: cover`
   * prélevait le carré central. Une photo en pied s'y trouvait coupée au ventre,
   * un logo posé en haut d'un visuel disparaissait, et rien ne permettait de le
   * corriger — sinon retoucher le fichier ailleurs et recommencer.
   */
  function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Le champ est remis à zéro pour que reprendre le même fichier après un
    // refus déclenche bien un nouvel événement.
    e.target.value = "";
    if (!f) return;
    setErreur(null);
    setACadrer(f);
  }

  function envoyer(decoupe: Blob) {
    setACadrer(null);
    const form = new FormData();
    // Un nom est nécessaire : sans lui, le navigateur envoie « blob », que le
    // serveur accepte — il lit la signature du contenu — mais qui ne dit rien
    // dans un journal.
    form.append("file", decoupe, "portefeuille.png");
    appeler("POST", form);
  }

  const libelle = image ? "Changer l'image du portefeuille" : "Ajouter une image au portefeuille";

  return (
    <div style={{ position: "relative", flexShrink: 0, lineHeight: 0 }}
      onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}>
      <input ref={champ} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={choisir} style={{ display: "none" }} />

      <button type="button" onClick={() => champ.current?.click()} disabled={envoi} aria-label={libelle}
        style={{
          width: taille, height: taille, overflow: "hidden",
          borderRadius: rayon, padding: 0, border: "none",
          background: image || poche ? JETONS.carteCreuse : fond,
          color: image || poche ? undefined : encreSur(fond),
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
          : poche
            ? <PocheActifs actifs={actifs!} taille={taille} />
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

      {/* Il y avait ici une pastille « + » à l'angle bas-droit, visible tant
          qu'aucune image n'était posée. Retirée sur demande.

          ⚠️ Elle n'était pas décorative, et son retrait a un coût connu : c'est
          elle qui disait, au repos, qu'on peut poser une image ici. Il ne reste
          que le survol, qui découvre l'icône d'appareil photo — et un survol
          seul ne se découvre pas. C'est exactement l'état où les logos empilés
          des actifs avaient échoué, quand ils occupaient cet emplacement : ils
          montraient le contenu, personne ne devinait qu'on pouvait y mettre une
          photo. Voir l'en-tête du fichier.

          Si le besoin revient, la piste est de le dire ailleurs qu'à l'angle de
          la vignette — dans le menu du portefeuille, ou au survol du nom. */}

      {image && survol && !envoi && (
        <button type="button" onClick={() => appeler("DELETE")} aria-label="Retirer l'image du portefeuille"
          style={{
            position: "absolute", top: -5, right: -5, width: 17, height: 17,
            borderRadius: RAYONS.plein, border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: JETONS.negatif, color: "#FFFFFF",
            fontFamily: FONT, fontSize: 11, lineHeight: 1, fontWeight: 700,
          }}>×</button>
      )}

      {aCadrer && (
        <CadrerImage fichier={aCadrer}
          onValider={envoyer} onAnnuler={() => setACadrer(null)} />
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
