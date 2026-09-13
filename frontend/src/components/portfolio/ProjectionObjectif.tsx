"use client";
import TitreDeCarte from "@/components/ui/TitreDeCarte";
import type { Projection } from "@/hooks/useProjection";
import {
  anneeDuMois, bande, bornes, chemin, echelles, graduations, montantCourt,
} from "@/lib/courbeProjection";
import { echeanceEnClair, euros, pourcent, pourcentageLisible, type Objectif } from "@/lib/objectifs";
import { useTaille } from "@/lib/useTaille";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@appica/ui-react/select";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * La projection d'un objectif : enveloppes, intervalle, probabilité.
 *
 * ⚠️ **Trois courbes, mais pas trois scénarios.** La maquette les nomme « optimiste »,
 * « neutre », « pessimiste », ce qui laisse croire à trois avenirs dont un se réalisera.
 * Ce sont les 5ᵉ, 50ᵉ et 95ᵉ centiles des tirages à chaque mois : aucune n'est une
 * trajectoire qu'un portefeuille suivrait. La légende les nomme donc pour ce qu'elles
 * sont, et la bande grisée — la représentation honnête d'un intervalle — est dessinée
 * derrière.
 *
 * ⚠️ **Le panneau dit ce qu'il ne peut pas calculer.** Sans échéance, sans rendement
 * attendu, sans valorisation, sans volatilité mesurable : quatre silences distincts, avec
 * chacun sa cause et son remède. Une courbe absente sans explication se lit comme une
 * panne.
 */

/**
 * Les marges du dessin.
 *
 * ⚠️ **Les valeurs sont à droite, et c'est ce qui aligne cette courbe sur les autres.** Le
 * graphique de la vue générale est un `lightweight-charts` : son échelle de prix est à
 * droite, sans liseré, avec 8 % de marge en haut et en bas. Celui-ci portait ses valeurs à
 * gauche en corps 8,5 — deux graphiques du même écran qui ne se lisaient pas pareil.
 */
const MARGE = { haut: 14, bas: 26, gauche: 12, droite: 58 };

/** Le corps des graduations, celui de `lightweight-charts` dans la vue générale. */
const CORPS_AXE = 11;

/**
 * Le filet, à l'identique du préréglage « standard » partagé par les autres graphiques.
 *
 * ⚠️ **Exprimé en encre du thème, pas en `--nv-bord`.** `--nv-bord` vaut `#101828`, une
 * couleur de liseré de carte : posée en filet sur le fond de page elle disparaît. Les
 * graphiques du site tracent le leur en blanc à 7,5 % — voir `lib/grille.ts` — et
 * `--nv-encre-rvb` porte exactement cette encre, blanche en sombre, ardoise en clair.
 */
const FILET = "rgba(var(--nv-encre-rvb), 0.075)";

/** Sous cette hauteur, une courbe cesse d'être lisible : on ne la comprime pas plus. */
const HAUTEUR_MINIMALE = 150;

/**
 * Combien de graduations pour une hauteur donnée.
 *
 * ⚠️ Un nombre fixe de repères entassait quatre étiquettes dans quarante pixels — un pâté
 * illisible, vu sur un écran plus court que le mien. Un repère par quarante-cinq pixels
 * environ, deux au minimum.
 */
const nombreDeGraduations = (hauteur: number) =>
  Math.max(2, Math.min(6, Math.floor((hauteur - MARGE.haut - MARGE.bas) / 45)));

const COURBES: { centile: string; libelle: string; couleur: string; tirets?: string }[] = [
  { centile: "95", libelle: "95ᵉ centile", couleur: JETONS.positif, tirets: "5 4" },
  { centile: "50", libelle: "Médiane", couleur: JETONS.accent },
  { centile: "5", libelle: "5ᵉ centile", couleur: JETONS.negatif, tirets: "5 4" },
];

/**
 * Une pastille de l'en-tête : un point de couleur, un libellé, un montant.
 *
 * ⚠️ **Elle remplace une ligne de la colonne de mesures, elle ne s'y ajoute pas.** L'en-tête
 * était une colonne de 168 pixels posée à gauche de la courbe : la courbe y perdait sa
 * largeur, et les chiffres se lisaient de haut en bas alors qu'ils se comparent de gauche à
 * droite. Tout est passé au-dessus, en rang.
 */
function Pastille({ couleur, libelle, valeur }: {
  couleur?: string; libelle: string; valeur: string;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "5px 11px", borderRadius: RAYONS.plein,
      background: CLAIR.carteCreuse, whiteSpace: "nowrap",
    }}>
      {couleur && <span aria-hidden="true" style={{ width: 7, height: 7,
        borderRadius: "50%", background: couleur, flexShrink: 0 }} />}
      <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteSecondaire }}>
        {libelle}
      </span>
      <span style={{ ...NUM, fontSize: 11.5, fontWeight: 700, color: CLAIR.texte }}>
        {valeur}
      </span>
    </span>
  );
}

function Anneau({ part, couleur }: { part: number; couleur: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
      <circle cx="34" cy="34" r={r} fill="none" stroke={CLAIR.carteCreuse} strokeWidth="6" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={couleur} strokeWidth="6"
        strokeLinecap="round" strokeDasharray={`${(part / 100) * c} ${c}`}
        transform="rotate(-90 34 34)" />
      <text x="34" y="38" textAnchor="middle"
        style={{ ...NUM, fontSize: 15, fontWeight: 700, fill: CLAIR.texte }}>
        {pourcentageLisible(part)}
      </text>
    </svg>
  );
}

/** Le motif de refus, dit en clair et avec son remède. */
function Silence({ raison }: { raison: string }) {
  const textes: Record<string, string> = {
    valeur_inconnue: "La valeur du portefeuille n’a pas pu être établie : les cours sont "
      + "indisponibles pour l’instant. Sans elle, aucun point de départ à projeter.",
    sans_echeance: "Cet objectif n’a pas d’échéance. Ajoutez une année cible — ou une "
      + "année de naissance, pour un objectif exprimé en âge — pour obtenir une projection.",
    sans_rendement_attendu: "Aucun rendement attendu n’est renseigné. C’est une hypothèse "
      + "qui vous appartient : le logiciel n’en choisit pas à votre place, faute de quoi "
      + "la projection passerait pour une prévision.",
    // ⚠️ Un motif distinct de « sans_rendement_attendu », parce que le remède est
    // différent : ici il ne manque pas une hypothèse mais une donnée, le rythme auquel
    // l'épargnant compte verser. Sans lui, la date du plafond n'existe pas.
    sans_versement: "Aucun versement mensuel n’est renseigné. Un plafond de versements se "
      + "remplit uniquement par vos apports : sans rythme, aucune date ne peut être "
      + "calculée.",
  };
  return (
    <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, lineHeight: 1.6,
      color: CLAIR.texteSecondaire, maxWidth: 460 }}>
      {textes[raison] ?? "Projection indisponible."}
    </p>
  );
}

export default function ProjectionObjectif({
  objectifs, choisi, onChoisir, projection, etat, onParametres,
}: {
  objectifs: Objectif[];
  choisi: string | null;
  onChoisir: (id: string) => void;
  projection: Projection | null;
  etat: "charge" | "pret" | "erreur";
  onParametres?: (o: Objectif) => void;
}) {
  const o = objectifs.find(x => x.id === choisi) ?? null;
  // ⚠️ Le conteneur est mesuré pour que le `viewBox` vaille sa taille en pixels : une
  // unité de dessin par pixel, donc aucune mise à l'échelle et un texte jamais déformé.
  const zone = useTaille<HTMLDivElement>();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
      <TitreDeCarte style={{ marginBottom: 0 }} action={<>
        {/* Le choix de l'objectif projeté. Une liste et non un onglet : cinq objectifs
            tiennent dans un menu, pas dans une rangée d'onglets. */}
        {/**
          * ⚠️ **Le composant de la bibliothèque, et non un `<select>` habillé.** C'en était
          * un, avec bord, fond et teinte posés à la main : sur un écran sombre il gardait la
          * flèche et le menu du système, qui ne ressemblent à rien d'autre sur le site et
          * changent d'un navigateur à l'autre. Le reste du produit passe déjà par Appica —
          * boutons, champs, pastilles — et ce menu-ci en fait partie.
          *
          * ⚠️ **Une liste et non une rangée de pastilles.** Cinq objectifs tiennent dans un
          * menu ; en onglets, ils déborderaient la ligne du titre dès le troisième nom un peu
          * long.
          */}
        {objectifs.length > 0 && (
          <Select value={choisi ?? ""} size="sm" variant="soft"
            onValueChange={(v: unknown) => onChoisir(String(v))}>
            <SelectTrigger style={{ minWidth: 150 }}>
              {/* ⚠️ **Le libellé se donne, il ne se devine pas.** `SelectValue` rend la
                  *valeur* de l'élément choisi : ici l'identifiant de l'objectif, affiché tel
                  quel — « 94b783be-2813-4e87… » à la place de « Retraite ». La fonction fait
                  la correspondance. */}
              <SelectValue>
                {(v: unknown) => objectifs.find(o => o.id === String(v))?.nom ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {objectifs.map(x => (
                <SelectItem key={x.id} value={x.id}>{x.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {o && onParametres && (
          <button type="button" onClick={() => onParametres(o)}
            style={{
              marginLeft: "auto", padding: "4px 10px", borderRadius: RAYONS.xs,
              cursor: "pointer", border: `1px solid ${CLAIR.bord}`,
              background: "transparent", color: CLAIR.texteSecondaire,
              fontFamily: FONT, fontSize: 10.5, fontWeight: 600,
            }}>
            Modifier les paramètres
          </button>
        )}
      </>}>Projection de l’objectif</TitreDeCarte>

      {objectifs.length === 0 && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Créez un objectif pour voir une projection.
        </p>
      )}
      {etat === "charge" && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Mesure de la volatilité et tirages…
        </p>
      )}
      {etat === "erreur" && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Projection indisponible pour le moment.
        </p>
      )}

      {etat === "pret" && projection && !projection.possible && (
        <Silence raison={projection.raison} />
      )}

      {etat === "pret" && projection?.possible && (() => {
        const p = projection;
        const toutes = Object.values(p.enveloppes).flat().concat(p.requis ?? []);
        const { bas, haut } = bornes(toutes);
        const cadre = {
          largeur: Math.max(240, zone.largeur || 600),
          hauteur: Math.max(HAUTEUR_MINIMALE, zone.hauteur || HAUTEUR_MINIMALE),
          marge: MARGE,
        };
        const { x, y } = echelles(p.mois, bas, haut, cadre);
        // ⚠️ L'horizon vient de la **courbe** et non de `mois_restants`. Pour un plafond de
        // versements sans échéance saisie, le serveur projette jusqu'à la date du plafond
        // qu'il a calculée : lire `mois_restants`, nul dans ce cas, aurait affiché
        // « Versements cumulés dans 0 an » au-dessus d'une courbe de dix-huit ans. Pour les
        // autres genres les deux coïncident, donc rien ne change.
        const horizon = p.mois[p.mois.length - 1] ?? p.objectif.mois_restants ?? 0;
        const ans = Math.round(horizon / 12);
        const sansDispersion = p.volatilite == null;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10,
            flex: 1, minHeight: 0 }}>

            {/* ── En-tête : le chiffre, sa décomposition, l'intervalle ─────── */}
            {/**
              * ⚠️ **Horizontal, et c'est le changement.** Les mesures occupaient une colonne
              * de 168 pixels à gauche de la courbe. Deux défauts : la courbe perdait cette
              * largeur sur un panneau qui n'en a pas de trop, et des grandeurs qui se
              * comparent — apports contre rendement — se lisaient de haut en bas. Elles
              * passent au-dessus, en rang, le montant en tête.
              */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16,
              flexWrap: "wrap", flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {/* ⚠️ « Versements cumulés » et non « valeur médiane » : ce n'est pas la
                    même grandeur, et ce n'est pas une médiane. Le mot « médiane » sur une
                    droite certaine laisserait chercher une dispersion qui n'existe pas. */}
                <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteFaible }}>
                  {p.objectif.sur_versements
                    ? `Versements cumulés dans ${ans} an${ans > 1 ? "s" : ""}`
                    : `Valeur médiane dans ${ans} an${ans > 1 ? "s" : ""}`}
                </span>
                {/* ⚠️ **Le chiffre est grand, mais il reste une médiane.** Le libellé
                    au-dessus le dit, et l'intervalle à côté le borne : un montant seul, en
                    très grand, se lirait comme une promesse. */}
                <span style={{ ...NUM, fontSize: 30, fontWeight: 700, lineHeight: 1.1,
                  color: CLAIR.texte }}>
                  {p.mediane != null ? euros(p.mediane) : "—"}
                </span>
                {p.objectif.projetee_en_euros_constants != null && (
                  <span style={{ fontFamily: FONT, fontSize: 10,
                    color: CLAIR.texteFaible }}>
                    soit {euros(p.objectif.projetee_en_euros_constants)} d’aujourd’hui
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap",
                alignItems: "center", marginLeft: "auto" }}>
                {/**
                  * ⚠️ **La décomposition vient du serveur, elle n'est pas refaite ici.**
                  * `depart` est le montant déjà constitué et affecté à l'objectif, déjà
                  * pondéré par la part choisie ; le recalculer depuis `valeur_portefeuille`
                  * aurait donné deux formules de pondération à tenir d'accord.
                  *
                  * ⚠️ **Et le rendement peut être négatif.** Une médiane sous les apports
                  * arrive — rendement attendu faible, horizon court — et l'afficher en vert
                  * annoncerait un gain là où il y a une perte. La teinte suit le signe.
                  */}
                {(() => {
                  if (p.mediane == null || p.depart == null || p.objectif.sur_versements) {
                    return null;
                  }
                  const verses = (p.objectif.versement_mensuel ?? 0) * horizon;
                  const apports = p.depart + verses;
                  const rendement = p.mediane - apports;
                  return (
                    <>
                      <Pastille couleur={JETONS.accent} libelle="Apports"
                        valeur={euros(apports)} />
                      <Pastille
                        couleur={rendement >= 0 ? JETONS.positif : JETONS.negatif}
                        libelle={rendement >= 0 ? "Rendement" : "Perte attendue"}
                        valeur={euros(Math.abs(rendement))} />
                    </>
                  );
                })()}

                {/* ⚠️ « 90 % » et non 95 : c'est ce que les centiles 5 et 95 délimitent. La
                    maquette annonçait 95 % au-dessus de bornes qui n'en couvrent que 90. */}
                {p.intervalle && (
                  <Pastille libelle={`Intervalle ${p.niveau_intervalle} %`}
                    valeur={`${montantCourt(p.intervalle[0])} – ${montantCourt(p.intervalle[1])}`} />
                )}

                {p.probabilite != null && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Anneau part={p.probabilite}
                      couleur={p.probabilite >= 66 ? JETONS.positif
                        : p.probabilite >= 33 ? JETONS.attention : JETONS.negatif} />
                    <span style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible,
                      lineHeight: 1.45, maxWidth: 120 }}>
                      des tirages atteignent {p.requis != null ? euros(p.requis) : "la cible"}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* ⚠️ La provenance de la volatilité, jamais tue : c'est elle qui décide si
                l'intervalle et la probabilité existent. Elle est passée sous l'en-tête,
                là où le lecteur cherche pourquoi les deux pastilles manquent. */}
            {/* ⚠️ **« sans_objet » n'est pas une panne, et se dit autrement.** Les trois
                autres motifs sont des empêchements — historique trop court, mesure
                impossible — et se teintent d'orange. Celui-ci est un choix de calcul : une
                somme de versements ne dépend d'aucun marché. L'afficher en orange avec
                « volatilité non mesurable » aurait fait passer un résultat exact pour un
                résultat dégradé. */}
            <span style={{ fontFamily: FONT, fontSize: 9.5, lineHeight: 1.5, flexShrink: 0,
              color: sansDispersion && p.volatilite_source !== "sans_objet"
                ? JETONS.attention : CLAIR.texteFaible }}>
              {p.volatilite_source === "sans_objet"
                ? "Aucune volatilité n’intervient : un cumul de versements ne dépend "
                  + "d’aucun marché. Cette droite est exacte si le rythme est tenu."
                : p.volatilite_source === "mesuree"
                ? `Volatilité mesurée sur votre portefeuille : ${pourcent(p.volatilite!)} % par an, `
                  + `sur ${p.seances_mesurees} séances.`
                : p.volatilite_source === "echantillon_court"
                  ? `Historique trop court pour mesurer la volatilité `
                    + `(${p.seances_mesurees} séances, ${p.seances_minimales} requises) : `
                    + `ni intervalle ni probabilité.`
                  : "Volatilité non mesurable : ni intervalle ni probabilité."}
            </span>

            {/* ── La courbe ────────────────────────────────────────────────── */}
            <div style={{ flex: 1, minWidth: 260, display: "flex",
              flexDirection: "column", minHeight: 0 }}>
              {/* Le conteneur mesuré : c'est lui qui donne ses dimensions au dessin. */}
              <div ref={zone.ref} style={{ flex: 1, minHeight: HAUTEUR_MINIMALE }}>
              {/* ⚠️ **Plus d'étirement.** J'avais posé `preserveAspectRatio="none"` pour
                  que la courbe remplisse sa place : sur mon écran elle avait 186 pixels et
                  la déformation ne se voyait pas, sur un écran plus court elle en avait
                  quarante et l'écrasement de 6 pour 1 rendait **le texte illisible** — le
                  SVG n'étire pas que les traits, il écrase aussi les lettres.

                  Le `viewBox` vaut désormais la taille mesurée du conteneur : une unité de
                  dessin par pixel, aucune mise à l'échelle, et un plancher de 150 pixels
                  sous lequel on refuse de comprimer. Si la fenêtre est trop courte, la page
                  défile — une courbe illisible est pire qu'une barre de défilement. */}
              <svg viewBox={`0 0 ${cadre.largeur} ${cadre.hauteur}`}
                style={{ width: "100%", height: cadre.hauteur, display: "block" }}
                role="img"
                // ⚠️ Le nom entre guillemets, pour éviter l'élision. « Projection de
                // Indépendance financière » se lisait à l'écran ; l'apostrophe dépend du
                // nom que l'épargnant a choisi, donc on ne la devine pas.
                aria-label={`Projection de « ${p.objectif.nom} » sur ${ans} ans`}>
                {/**
                  * ⚠️ **L'aire sous la médiane, et rien d'autre.** La courbe était un trait
                  * seul sur un fond vide : elle se lisait comme un tracé technique, pas
                  * comme une trajectoire de patrimoine. L'aire lui donne son assise.
                  *
                  * ⚠️ **Elle s'arrête au bas de l'échelle, pas à zéro.** `bornes` ne part pas
                  * toujours de zéro ; fermer le tracé sur zéro aurait fait déborder l'aire
                  * hors du cadre dès que le plancher est plus haut.
                  *
                  * ⚠️ **Sous la bande d'incertitude, jamais dessus.** Les deux se
                  * superposent ; peinte au-dessus, l'aire effacerait l'intervalle — or
                  * c'est l'intervalle qui porte l'honnêteté du dessin.
                  */}
                <defs>
                  <linearGradient id={`nv-aire-${p.objectif.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={JETONS.accent} stopOpacity="0.26" />
                    <stop offset="100%" stopColor={JETONS.accent} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={bande(p.mois, p.mois.map(() => bas), p.enveloppes["50"], x, y)}
                  fill={`url(#nv-aire-${p.objectif.id})`} />

                {graduations(bas, haut, nombreDeGraduations(cadre.hauteur)).map(v => (
                  <g key={v}>
                    <line x1={cadre.marge.gauche} x2={cadre.largeur - cadre.marge.droite}
                      y1={y(v)} y2={y(v)} stroke={FILET} strokeWidth="1"
                      />
                    {/* ⚠️ À droite du filet, pas à gauche : l'échelle de prix de la vue
                        générale est à droite, et deux graphiques voisins qui posent leurs
                        valeurs de deux côtés différents se lisent comme deux produits. */}
                    <text x={cadre.largeur - cadre.marge.droite + 8} y={y(v) + 4}
                      textAnchor="start"
                      style={{ ...NUM, fontSize: CORPS_AXE, fill: CLAIR.texteSecondaire }}>
                      {montantCourt(v)}
                    </text>
                  </g>
                ))}

                {/* La bande de l'intervalle : une zone, là où trois traits laisseraient
                    croire à trois trajectoires. */}
                {!sansDispersion && (
                  <path d={bande(p.mois, p.enveloppes["5"], p.enveloppes["95"], x, y)}
                    fill={JETONS.accent} opacity={0.09} />
                )}

                {/* La cible : une ligne horizontale, pointillée pour ne pas être prise
                    pour une trajectoire. */}
                {p.requis != null && p.requis <= haut && (
                  <line x1={cadre.marge.gauche} x2={cadre.largeur - cadre.marge.droite}
                    y1={y(p.requis)} y2={y(p.requis)} stroke={CLAIR.texteSecondaire}
                    strokeWidth="1.2" strokeDasharray="4 4"
                    />
                )}

                {COURBES.filter(c => !sansDispersion || c.centile === "50").map(c => (
                  <path key={c.centile}
                    d={chemin(p.mois, p.enveloppes[c.centile], x, y)}
                    fill="none" stroke={c.couleur} strokeWidth="2"
                    strokeDasharray={c.tirets} strokeLinejoin="round" strokeLinecap="round"
                    />
                ))}

                {/**
                  * ⚠️ **Le nombre d'années suit la largeur.** Il en affichait trois, quelle
                  * que soit la place : sur un panneau large, deux repères pour vingt ans de
                  * courbe, et l'œil n'a rien où se poser entre les deux. Un repère par
                  * 130 pixels environ, trois au minimum, sept au plus — au-delà les années
                  * se touchent.
                  */}
                {(() => {
                  const utile = cadre.largeur - cadre.marge.gauche - cadre.marge.droite;
                  const combien = Math.max(3, Math.min(7, Math.floor(utile / 130)));
                  const pas = (p.mois.length - 1) / (combien - 1);
                  return Array.from({ length: combien }, (_, i) =>
                    p.mois[Math.round(i * pas)]).map((m, i, tout) => (
                    <text key={m} x={x(m)} y={cadre.hauteur - 8}
                      textAnchor={i === 0 ? "start" : i === tout.length - 1 ? "end" : "middle"}
                      style={{ ...NUM, fontSize: CORPS_AXE, fill: CLAIR.texteSecondaire }}>
                      {anneeDuMois(m)}
                    </text>
                  ));
                })()}
              </svg>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5,
                flexShrink: 0 }}>
                {COURBES.filter(c => !sansDispersion || c.centile === "50").map(c => (
                  <span key={c.centile} style={{ display: "inline-flex", alignItems: "center",
                    gap: 5, fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>
                    <span style={{ width: 12, height: 2, background: c.couleur }} />
                    {/* ⚠️ Une droite de versements n'est pas une médiane : il n'y a qu'une
                        trajectoire, pas une distribution dont elle serait le milieu. */}
                    {p.objectif.sur_versements && c.centile === "50"
                      ? "Cumul des versements" : c.libelle}
                    {p.taux_implicites[c.centile] != null && (
                      <span style={{ ...NUM }}> ({pourcent(p.taux_implicites[c.centile])} %/an)</span>
                    )}
                  </span>
                ))}
                {p.requis != null && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5,
                    fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>
                    <span style={{ width: 12, height: 0, borderTop:
                      `1.2px dashed ${CLAIR.texteSecondaire}` }} />
                    Objectif
                  </span>
                )}
              </div>

              {/* ⚠️ L'aveu du modèle, sous la courbe et non dans une aide masquée. Les
                  tirages supposent des rendements mensuels indépendants et log-normaux :
                  les marchés réels ont des queues plus épaisses, donc les extrêmes sont
                  sous-estimés. Sans cette phrase, trois courbes lisses passent pour une
                  prévision. */}
              {/* ⚠️ **Deux textes, et le second n'est pas un adoucissement du premier.**
                  Vu à l'écran : « ces courbes sont des centiles de 2 000 tirages […] le
                  modèle suppose des rendements log-normaux » s'affichait sous la droite d'un
                  plafond de versements, où il n'y a **ni tirage ni modèle**. Un aveu de
                  modèle placé sous un calcul qui n'en a pas est aussi trompeur qu'un modèle
                  tu : il fait douter d'une addition exacte, et laisse croire que le logiciel
                  a simulé quelque chose. */}
              <p style={{ margin: "6px 0 0", fontFamily: FONT, fontSize: 8.5,
                lineHeight: 1.45, color: CLAIR.texteFaible, flexShrink: 0 }}>
                {p.objectif.sur_versements ? (
                  <>
                    Cette droite est la somme de vos versements, mois après mois : aucun
                    tirage, aucun rendement, aucune inflation n’y entre. Elle est exacte tant
                    que le rythme est tenu — c’est la seule chose qu’elle suppose.
                  </>
                ) : (
                  <>
                    Ces courbes sont des centiles de{" "}
                    <span style={{ ...NUM }}>2 000</span> tirages, pas trois scénarios :
                    aucune n’est une trajectoire que le portefeuille suivrait. Le modèle
                    suppose des rendements mensuels indépendants et log-normaux, ce qui
                    sous-estime les situations extrêmes.
                  </>
                )}
                {echeanceEnClair(p.objectif.mois_restants)
                  && ` Échéance ${echeanceEnClair(p.objectif.mois_restants)}.`}
              </p>

              {/* ⚠️ Les hypothèses en clair, sous la courbe qu'elles produisent. « Non
                  renseigné » plutôt qu'une valeur par défaut : un taux affiché sans avoir
                  été choisi se lit comme une donnée du logiciel, et la projection qu'il
                  produit comme une prévision. */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8,
                paddingTop: 8, borderTop: `1px solid ${CLAIR.bord}`, flexShrink: 0 }}>
                {/* ⚠️ **La liste dépend du genre, faute de quoi elle affiche du vide.** Vu à
                    l'écran sous un plafond de versements : « Rendement attendu : non
                    renseigné · Inflation estimée : non renseigné · Part du portefeuille :
                    100 % » — trois mentions dont aucune n'entre dans le calcul, et dont les
                    deux premières donnent à croire qu'il manque quelque chose. Ce qui compte
                    ici est le cumul déjà versé et sa provenance. */}
                {(p.objectif.sur_versements ? [
                  { titre: "Versement mensuel",
                    valeur: p.objectif.versement_mensuel != null
                      ? `${euros(p.objectif.versement_mensuel)} / mois` : null },
                  { titre: "Déjà versé",
                    valeur: p.objectif.verse_retenu != null
                      ? euros(p.objectif.verse_retenu) : null },
                  { titre: "Source du cumul",
                    valeur: p.objectif.verse_deja != null
                      ? "votre saisie" : "vos transactions" },
                  { titre: "Plafond",
                    valeur: p.requis != null ? euros(p.requis) : null },
                ] : [
                  { titre: "Versement mensuel",
                    valeur: p.objectif.versement_mensuel != null
                      ? `${euros(p.objectif.versement_mensuel)} / mois` : null },
                  { titre: "Rendement attendu",
                    valeur: p.objectif.taux_attendu != null
                      ? `${pourcent(p.objectif.taux_attendu)} % / an` : null },
                  { titre: "Inflation estimée",
                    valeur: p.objectif.inflation != null
                      ? `${pourcent(p.objectif.inflation)} % / an` : null },
                  { titre: "Part du portefeuille",
                    valeur: `${pourcent(p.objectif.part_affectee ?? 100, 1)} %` },
                ]).map(m => (
                  <div key={m.titre} style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontFamily: FONT, fontSize: 9,
                      color: CLAIR.texteFaible }}>{m.titre}</span>
                    <span style={{ ...NUM, fontSize: 11.5, fontWeight: 700,
                      color: m.valeur ? CLAIR.texte : CLAIR.texteFaible }}>
                      {m.valeur ?? "non renseigné"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
