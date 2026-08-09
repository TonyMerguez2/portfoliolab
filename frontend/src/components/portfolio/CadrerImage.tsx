"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  bornerDecalage, COTE_EXPORT, echelleMinimale, sourceVisible, ZOOM_MAX,
} from "@/lib/cadrage";
import { JETONS, RAYONS, rayonVignette } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * Cadrer une image avant de la poser sur un portefeuille.
 *
 * Le cadre est fixe et carré : c'est la vignette elle-même, à la silhouette près.
 * L'image passe dessous, et c'est elle qu'on déplace et qu'on agrandit — jamais
 * le cadre. Un cadre qu'on redimensionnerait donnerait des vignettes de formats
 * différents selon l'humeur, alors que toutes doivent tenir la même place.
 *
 * ⚠️ **La découpe part de l'image native**, pas de ce que le navigateur affiche.
 * Le cadre mesure quelques centaines de pixels quand une photo de téléphone en
 * compte des milliers : découper d'après l'affichage aurait exporté une vignette
 * à la résolution de l'écran, floue au premier agrandissement. Voir
 * `sourceVisible`.
 *
 * Toute la géométrie est dans `lib/cadrage`, testée sans navigateur.
 */

/** Le côté du cadre à l'écran. Assez grand pour viser, assez petit pour tenir. */
const CADRE = 260;

export default function CadrerImage({
  fichier, onValider, onAnnuler,
}: {
  fichier: File;
  /** Reçoit la découpe, prête à être envoyée. */
  onValider: (image: Blob) => void;
  onAnnuler: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [dim, setDim] = useState<{ largeur: number; hauteur: number } | null>(null);
  const [zoom, setZoom] = useState(1);          // en multiples de l'échelle minimale
  const [dep, setDep] = useState({ dx: 0, dy: 0 });
  const [occupe, setOccupe] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const geste = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  /**
   * L'URL de l'objet, créée puis révoquée.
   *
   * ⚠️ Sans la révocation, chaque essai de cadrage laisserait le fichier en
   * mémoire jusqu'au rechargement de la page — quelques mégaoctets par image
   * choisie, sur un composant qu'on ouvre et referme volontiers plusieurs fois.
   */
  useEffect(() => {
    const u = URL.createObjectURL(fichier);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [fichier]);

  // Échap referme, comme partout ailleurs dans l'application.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") onAnnuler(); };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onAnnuler]);

  const base = dim ? echelleMinimale(dim, CADRE) : 1;
  const echelle = base * zoom;

  /** Reborne le déplacement à chaque changement d'échelle : la marge a bougé. */
  function reglerZoom(z: number) {
    setZoom(z);
    if (dim) setDep(d => bornerDecalage(d.dx, d.dy, dim, base * z, CADRE));
  }

  function surPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    geste.current = { x: e.clientX, y: e.clientY, dx: dep.dx, dy: dep.dy };
  }
  function surPointerMove(e: React.PointerEvent) {
    const g = geste.current;
    if (!g || !dim) return;
    setDep(bornerDecalage(
      g.dx + (e.clientX - g.x), g.dy + (e.clientY - g.y), dim, echelle, CADRE));
  }
  function surPointerUp() { geste.current = null; }

  /**
   * Découpe et rend l'image.
   *
   * PNG, parce que le serveur reconnaît le format au contenu et que la signature
   * PNG est celle qu'un canevas produit sans réglage. Le JPEG demanderait un
   * facteur de qualité, donc un arbitrage de plus pour un gain invisible à cette
   * taille.
   */
  async function valider() {
    const img = imgRef.current;
    if (!img || !dim) return;
    setOccupe(true);
    try {
      const s = sourceVisible(dep.dx, dep.dy, dim, echelle, CADRE);
      const toile = document.createElement("canvas");
      toile.width = COTE_EXPORT;
      toile.height = COTE_EXPORT;
      const ctx = toile.getContext("2d");
      if (!ctx) throw new Error("canevas indisponible");
      // Lissage de qualité : on réduit souvent d'un facteur six ou plus, et le
      // rééchantillonnage par défaut y laisse des marches d'escalier.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, s.sx, s.sy, s.cote, s.cote, 0, 0, COTE_EXPORT, COTE_EXPORT);
      const blob = await new Promise<Blob | null>(res => toile.toBlob(res, "image/png"));
      if (!blob) throw new Error("découpe impossible");
      onValider(blob);
    } finally {
      setOccupe(false);
    }
  }

  const corps = (
    <div
      onClick={onAnnuler}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(3,8,20,0.72)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: FONT,
      }}>
      <div
        // Le clic dans le panneau ne doit pas remonter au voile qui referme.
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Cadrer l'image du portefeuille"
        style={{
          background: JETONS.carte, border: `1px solid ${JETONS.bord}`,
          borderRadius: RAYONS.lg, padding: 20,
          display: "flex", flexDirection: "column", gap: 14, alignItems: "center",
        }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: JETONS.texteIntense, alignSelf: "flex-start" }}>
          Cadrer l&apos;image
        </div>

        {/* Le cadre, et l'image dessous.
            La silhouette est celle de la vignette — même rapport entre le rayon
            et le côté, voir `rayonVignette` — pour qu'on voie la forme finale et
            non un carré vif qui laisserait deviner autre chose. */}
        <div
          onPointerDown={surPointerDown}
          onPointerMove={surPointerMove}
          onPointerUp={surPointerUp}
          onPointerCancel={surPointerUp}
          onWheel={e => {
            e.preventDefault();
            // Un cran de molette vaut un dixième d'écart : assez pour sentir le
            // geste, assez peu pour viser.
            reglerZoom(Math.min(ZOOM_MAX, Math.max(1, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
          }}
          style={{
            width: CADRE, height: CADRE, position: "relative", overflow: "hidden",
            borderRadius: rayonVignette(CADRE),
            background: JETONS.carteCreuse,
            cursor: geste.current ? "grabbing" : "grab",
            touchAction: "none", userSelect: "none", flexShrink: 0,
          }}>
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef} src={url} alt=""
              draggable={false}
              onLoad={e => {
                const el = e.currentTarget;
                setDim({ largeur: el.naturalWidth, hauteur: el.naturalHeight });
                setDep({ dx: 0, dy: 0 });
                setZoom(1);
              }}
              style={{
                position: "absolute", left: "50%", top: "50%",
                // `translate(-50%,-50%)` centre, puis le déplacement s'ajoute. La
                // taille vient de l'échelle plutôt que d'un `scale` : un `scale`
                // aurait aussi multiplié le déplacement, qui est en pixels d'écran.
                transform: `translate(-50%,-50%) translate(${dep.dx}px, ${dep.dy}px)`,
                width: dim ? dim.largeur * echelle : undefined,
                height: dim ? dim.hauteur * echelle : undefined,
                /**
                 * ⚠️ Les plafonds sont levés, et sans cela le cadrage était faux.
                 *
                 * La feuille de style globale porte un `img { max-width: 100% }`,
                 * le garde-fou habituel qui empêche une illustration de déborder
                 * de sa colonne. Ici il travaille contre nous : l'image doit
                 * justement dépasser du cadre, puisque c'est ce dépassement qu'on
                 * fait glisser. Mesuré à l'écran sur une image de 800 × 320 : le
                 * style demandait 650 × 260, le rendu donnait 260 × 260 — la
                 * largeur rabattue, la hauteur gardée, donc une image écrasée.
                 * Le cadre montrait toute la photo déformée au lieu d'une portion
                 * fidèle.
                 */
                maxWidth: "none", maxHeight: "none",
                display: "block",
              }} />
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, width: CADRE }}>
          <span style={{ fontSize: 11, color: JETONS.texteSecondaire, flexShrink: 0 }}>Taille</span>
          <input
            type="range" min={1} max={ZOOM_MAX} step={0.01} value={zoom}
            onChange={e => reglerZoom(Number(e.target.value))}
            aria-label="Agrandissement de l'image"
            style={{ flex: 1, accentColor: JETONS.accent, cursor: "pointer" }} />
          <span style={{ ...NUM, fontSize: 11, color: JETONS.texteAttenue, width: 34, textAlign: "right" }}>
            ×{zoom.toFixed(1)}
          </span>
        </label>

        <div style={{ fontSize: 10, color: JETONS.texteAttenue, width: CADRE, lineHeight: 1.5 }}>
          Glissez l&apos;image pour la déplacer, la molette ou le curseur pour
          l&apos;agrandir.
          {dim && (
            <>
              {" "}Découpe de{" "}
              <span style={{ ...NUM }}>
                {Math.round(sourceVisible(dep.dx, dep.dy, dim, echelle, CADRE).cote)}
              </span>
              {" "}px, exportée en{" "}
              <span style={{ ...NUM }}>{COTE_EXPORT}×{COTE_EXPORT}</span>.
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignSelf: "stretch", justifyContent: "flex-end" }}>
          <button type="button" onClick={onAnnuler}
            style={{
              padding: "7px 13px", borderRadius: RAYONS.sm, cursor: "pointer",
              border: `1px solid ${JETONS.bord}`, background: "transparent",
              color: JETONS.texteFort, fontFamily: FONT, fontSize: 12,
            }}>Annuler</button>
          <button type="button" onClick={valider} disabled={!dim || occupe}
            style={{
              padding: "7px 15px", borderRadius: RAYONS.sm,
              cursor: !dim || occupe ? "progress" : "pointer",
              border: "none", background: JETONS.accent, color: "#FFFFFF",
              fontFamily: FONT, fontSize: 12, fontWeight: 600,
              opacity: !dim || occupe ? 0.6 : 1,
            }}>Utiliser cette image</button>
        </div>
      </div>
    </div>
  );

  // En portail : le panneau doit couvrir la page, pas se laisser rogner par le
  // `overflow: hidden` du panneau qui contient la vignette.
  return typeof document === "undefined" ? null : createPortal(corps, document.body);
}
