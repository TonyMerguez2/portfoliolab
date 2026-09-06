"use client";
import { recuperer } from "@/lib/requete";
import TitreDeCarte from "@/components/ui/TitreDeCarte";
import { useEffect, useMemo, useState } from "react";
import AssetLogo from "@/components/AssetLogo";
import { FONT, NUM } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";
import Cadre from "@/components/ui/Cadre";
import Segments from "@/components/ui/Segments";
import PiluleAction from "@/components/portfolio/PiluleAction";
import PastilleVariation from "@/components/portfolio/PastilleVariation";
import { JETONS } from "@/lib/palette";
import { API_URL as API } from "@/lib/api";
import {
  resume, resultats, repartitionTypes, typesParOperation, montant, parDate,
  LIBELLE_OP, COULEUR_OP, type Tx, type TypeOp,
} from "@/lib/journal";
import {
  lireComptes, listerLesApports, type Compte, type ApportRange,
} from "@/lib/comptes";


/** Géométrie reprise de la vue générale, pour que les deux onglets s'alignent. */
const MARGE = 10;
const GOUTTIERE = 8;

/**
 * La hauteur du panneau de détail — **fixe, et c'est tout l'enjeu**.
 *
 * ⚠️ **Elle ne suit pas son contenu, sans quoi la page bouge à chaque sélection.** Le détail
 * d'une opération occupe 242 pixels, celui d'un apport 208, et l'invite « choisissez une
 * écriture » une seule ligne. À hauteur libre, cliquer d'une ligne à l'autre du journal
 * faisait donc respirer toute la mise en page — le journal au-dessus se rallongeait et se
 * raccourcissait sous le curseur, et la ligne qu'on visait se dérobait. Signalé à l'usage.
 *
 * ⚠️ **Choisie sur le plus grand des trois états, pas sur une moyenne.** Un panneau réglé
 * entre les deux ferait défiler l'opération — ce que l'on vient précisément d'interdire.
 * 284 pixels : la valeur a été **mesurée, pas déduite**. Posée d'abord à 270 par le calcul
 * — contenu, rangée de titre, rembourrage — elle coupait encore le corps de l'opération de
 * quatorze pixels, l'arithmétique ayant oublié une marge en route. C'est le genre de chiffre
 * qu'on relève à l'écran plutôt qu'on ne l'établit sur le papier.
 *
 * ⚠️ **C'est le chiffre à revoir si l'on ajoute un champ au détail**, et le seul. Le
 * commentaire du panneau dit la même chose dans l'autre sens : ne pas rattraper un
 * débordement avec `overflow: auto`.
 */
const HAUTEUR_DETAIL = 284;

/**
 * Journal des transactions.
 *
 * La page répond à « qu'ai-je fait, et qu'est-ce que ça a donné ? ». Chaque
 * chiffre vient des écritures ; rien n'y est estimé.
 *
 * ⚠️ **Ce qui n'existe pas encore ne prend pas de place ici.** Un panneau « Dividendes »
 * annonçait autrefois que leur saisie n'était pas disponible ; il a été retiré. Une
 * fonction absente relève de la feuille de route, pas du tableau de bord — et le jour où
 * elle arrive, elle entre par le journal, comme les apports ci-dessous.
 *
 * ⚠️ **Les apports de trésorerie figurent ici au même titre que les achats.** C'est ce que
 * « comme pour l'achat d'actions » veut dire : verser 500 € sur un livret est une écriture
 * datée, elle a sa place dans le journal des écritures. Les en écarter aurait laissé
 * l'épargnant devant une liste qui prétend tout montrer et tait la moitié de son
 * patrimoine — d'autant qu'ils portent déjà leur pastille sur la courbe d'à côté.
 *
 * ⚠️ **Un apport n'a ni quantité, ni cours, ni résultat, et l'écran l'assume.** Les
 * colonnes correspondantes affichent un tiret plutôt qu'un zéro : verser n'est pas gagner,
 * et un « 0 € » dans la colonne Résultat se lirait comme une opération blanche alors qu'il
 * n'y a rien à mesurer.
 */

type Position = { ticker: string; current_price: number | null; current_value: number | null };

/**
 * Le dossier regardé : tout le portefeuille, un compte déclaré, ou le reliquat.
 *
 * ⚠️ **Le même vocabulaire que le sélecteur du graphique** — `"total"`, l'identifiant du
 * compte, ou `"__libre__"`. Deux écrans voisins qui découpent la même chose selon deux
 * conventions auraient fini par diverger, et il aurait fallu traduire de l'un à l'autre.
 */
type Vue = string;
const TOTAL = "total";
const LIBRE = "__libre__";

/**
 * Une entrée du journal : une opération de bourse ou un apport de trésorerie.
 *
 * ⚠️ **Une clé textuelle plutôt que l'identifiant nu.** Les opérations sont numérotées par
 * la base, les apports portent un UUID : sans préfixe, rien ne garantissait qu'un jour les
 * deux ne se rencontrent pas sur la même valeur, et la sélection aurait désigné deux lignes
 * à la fois.
 */
type Entree =
  | { genre: "op"; cle: string; date: string; tx: Tx; compteId: string | null }
  | { genre: "apport"; cle: string; date: string; apport: ApportRange };

const cleOp = (id: number) => `op:${id}`;
const cleApport = (id: string) => `ap:${id}`;

const eur = (v: number, dec = 2) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";

/**
 * Le panneau de l'onglet.
 *
 * ⚠️ **Même rembourrage que la carte « Répartition » de la vue générale.** Il valait
 * `14px 18px` contre les `13px 15px` du modèle : trois pixels de plus à droite, un de plus
 * en haut. C'est ce qui tenait la pilule d'ajout à distance du bord alors qu'elle porte
 * pourtant la même peinture que sa jumelle d'en face — deux cartes réglées différemment ne
 * peuvent pas placer leur contenu pareil, quoi qu'on fasse au contenu.
 *
 * ⚠️ **Le côté droit est plus serré que le gauche — onze contre quinze — et ce n'est pas une
 * étourderie.** Le modèle pose son contrôle à 12,2 pixels du bord de la carte, non par
 * réglage mais parce que sa rangée déborde de près de quatre pixels : titre 66, gouttière 8,
 * contrôle 170, pour 240 de contenu. Demandé à l'usage de supprimer cet écart plutôt que de
 * le subir. Plutôt que de faire déborder cette carte-ci à son tour, c'est le **bord du
 * contenu** qui vient à la bonne place : onze de rembourrage plus le pixel de cadre donnent
 * les douze du modèle.
 *
 * ⚠️ **Et tout ce que la carte contient suit d'un coup, ce qui est l'intérêt de le régler
 * ici.** La pilule du titre comme la colonne de chiffres se calent sur ce bord — les deux
 * sont en `space-between` dans leur rangée. Les décaler un par un aurait demandé le même
 * nombre magique à deux endroits, et garanti qu'ils divergent au premier ajout.
 */
function Carte({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <Cadre style={{ padding: "13px 15px", display: "flex", flexDirection: "column", minHeight: 0, ...style }}>
      {children}
    </Cadre>
  );
}

/**
 * La rangée de titre des panneaux de l'onglet.
 *
 * ⚠️ **Réglée sur la carte « Répartition » de la vue générale, et pour toute la colonne à la
 * fois.** Son panneau « Résumé » porte désormais la même pilule d'ajout que la vue générale ;
 * la pilule seule ne suffisait pas à les accorder tant que la rangée qui la contient obéissait
 * à d'autres mesures — douze pixels sous la rangée contre cinq, aucune gouttière contre huit,
 * un titre de treize contre douze et demi. Demandé pour la cohérence d'un onglet à l'autre.
 *
 * ⚠️ **Toutes les cartes bougent ensemble, et c'est le point.** N'aligner que « Résumé »
 * l'aurait accordé à la vue générale en le désaccordant de « Répartition des opérations », sa
 * voisine immédiate dans la même colonne — on aurait déplacé l'incohérence de trois
 * centimètres au lieu de la retirer.
 *
 * ⚠️ **Le `marginTop: -5` du modèle est repris, après l'avoir d'abord écarté.** Le raisonnement
 * qui le refusait — là-bas il aligne l'arête de la piste sur le panneau d'en face, ici rien ne
 * fait face — était juste sur l'intention et faux sur le résultat : mesuré, la rangée du résumé
 * restait **six pixels plus basse** que celle du modèle, et cela se voyait. Ce que ce retrait
 * produit n'est pas seulement un alignement avec un voisin, c'est un titre qui tient au haut de
 * sa carte ; c'est cela qu'on venait chercher.
 *
 * ⚠️ **Ce qui n'est *pas* repris, en revanche, c'est le débordement du modèle.** Sa rangée
 * mesure 244 pixels — titre 66, gouttière 8, contrôle 170 — pour 240 de contenu disponible :
 * elle déborde sa carte de près de quatre pixels, et son contrôle paraît donc collé au bord.
 * Ce n'est pas un placement, c'est un panneau trop étroit pour ce qu'on y met. Le recopier
 * aurait décalé la pilule de la colonne de valeurs qu'elle surmonte, laquelle s'aligne, elle,
 * sur le rembourrage.
 */
/** L'en-tête commun à toutes les cartes — voir `TitreDeCarte`. */
function Titre({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <TitreDeCarte action={action}>{children}</TitreDeCarte>;
}

function Ligne({ label, valeur, couleur }: { label: string; valeur: React.ReactNode; couleur?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.45)" }}>{label}</span>
      <span style={{ ...NUM, fontSize: 12.5, fontWeight: 600, color: couleur ?? "rgba(var(--nv-encre-rvb), 0.90)" }}>
        {valeur}
      </span>
    </div>
  );
}

export default function TransactionsView({
  portfolioId, refreshKey, onNewTransaction, selectionDemandee, fondBouton, fondBoutonSurvol,
}: {
  portfolioId: string;
  refreshKey: number;
  onNewTransaction: () => void;
  /**
   * Le fond de la pilule d'ajout, et sa variante de survol.
   *
   * ⚠️ **Reçus de la page plutôt que recalculés ici.** La teinte vient de l'avatar, que
   * l'épargnant choisit, et la page la sert déjà au personnage, à la courbe et aux deux
   * autres pilules. La recalculer dans cet onglet ferait une seconde source pour une même
   * couleur — précisément ce que la page s'interdit, et ce qui finit toujours par diverger.
   */
  fondBouton: string;
  fondBoutonSurvol: string;
  /** Écriture à mettre en avant, désignée depuis le graphique de la vue générale. */
  selectionDemandee?: number | null;
}) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [apports, setApports] = useState<ApportRange[]>([]);
  const [vue, setVue] = useState<Vue>(TOTAL);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [confirme, setConfirme] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [suppression, setSuppression] = useState(false);

  // ── Données ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!portfolioId) return;
    let annule = false;
    setChargement(true);
    Promise.all([
      recuperer(`${API}/api/v1/portfolios/${portfolioId}/transactions`, { headers: enTetesAuth() })
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
      recuperer(`${API}/api/v1/portfolios/${portfolioId}/positions`, { headers: enTetesAuth() })
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
      // ⚠️ Les dossiers et leurs apports échouent sans bruit : l'onglet doit rester lisible
      // sur un portefeuille dont aucun compte n'est déclaré, ce qui est le cas le plus
      // courant tant que la reprise n'est pas faite.
      lireComptes(portfolioId).catch(() => [] as Compte[]),
      listerLesApports(portfolioId).catch(() => [] as ApportRange[]),
    ]).then(([tx, pos, cpts, apps]) => {
      if (annule) return;
      const liste: Tx[] = Array.isArray(tx) ? tx : (tx?.transactions ?? []);
      setTxs(liste);
      setPositions(pos?.positions ?? []);
      setComptes(cpts);
      setApports(apps);
      setChargement(false);
      // La plus récente est sélectionnée d'office : un panneau de détail vide
      // à l'arrivée n'apprend rien et laisse la colonne du milieu béante.
      const recentes = parDate(liste);
      setChoisie(prev => prev ?? (recentes.length ? cleOp(recentes[recentes.length - 1].id) : null));
    });
    return () => { annule = true; };
  }, [portfolioId, refreshKey]);

  // Une opération désignée depuis le graphique prend la main sur la sélection
  // par défaut, et le journal défile jusqu'à elle. ⚠️ L'ancre `op-<id>` est portée par la
  // ligne du tableau ; elle vivait sur la timeline, retirée depuis.
  //
  // ⚠️ **Le dossier se remet sur « Tout » au passage.** L'opération désignée peut
  // appartenir à un compte que le filtre courant écarte : sans cela, le graphique
  // pointerait une ligne que cet onglet a masquée, et le clic n'aurait aucun effet visible.
  useEffect(() => {
    if (selectionDemandee == null) return;
    setVue(TOTAL);
    setChoisie(cleOp(selectionDemandee));
    const el = document.getElementById(`op-${selectionDemandee}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectionDemandee]);

  /**
   * Supprime une écriture.
   *
   * Le serveur refuse si une vente postérieure en dépendait : retirer un achat
   * rendrait cette vente impossible. Son message vaut mieux qu'un « erreur ».
   */
  async function supprimer(id: number) {
    setSuppression(true);
    setErreur(null);
    try {
      const r = await recuperer(`${API}/api/v1/portfolios/${portfolioId}/transactions/${id}`, {
        method: "DELETE", headers: enTetesAuth(),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `Suppression refusée (${r.status})`);
      }
      setTxs(prev => prev.filter(t => t.id !== id));
      setChoisie(prev => (prev === cleOp(id) ? null : prev));
      setConfirme(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setSuppression(false);
    }
  }

  // ── Calculs ────────────────────────────────────────────────────────────────
  const cours = useMemo(
    () => Object.fromEntries(positions.map(p => [p.ticker, p.current_price])) as Record<string, number | null>,
    [positions]);

  const recap    = useMemo(() => resume(txs, cours), [txs, cours]);
  const resultat = useMemo(() => resultats(txs, cours), [txs, cours]);
  const types    = useMemo(() => typesParOperation(txs), [txs]);
  const parts    = useMemo(() => repartitionTypes(txs), [txs]);
  const parId    = useMemo(
    () => Object.fromEntries(resultat.map(r => [r.tx.id, r])), [resultat]);

  /** Les écritures telles que le graphique les attend. */
  const reperes = useMemo(
    () => txs.map(t => ({
      id: t.id, ticker: t.ticker, executed_at: t.executed_at,
      type: types[t.id], couleur: COULEUR_OP[types[t.id]], libelle: LIBELLE_OP[types[t.id]],
    })),
    [txs, types]);

  const nomDeCompte = useMemo(
    () => Object.fromEntries(comptes.map(c => [c.id, c])) as Record<string, Compte>,
    [comptes]);

  /**
   * Les dossiers proposés au filtre.
   *
   * ⚠️ **Seuls ceux qui ont quelque chose à montrer.** Un compte déclaré sans la moindre
   * écriture ni le moindre apport ouvrirait une liste vide : un onglet qui propose un
   * chemin menant nulle part se lit comme une panne.
   *
   * ⚠️ **Et le reliquat en dernier, s'il existe.** Tant que la déclaration des comptes
   * n'est pas faite, la plupart des opérations n'en visent aucun ; sans ce groupe, filtrer
   * ferait disparaître l'essentiel du journal sans dire où c'est passé.
   */
  const dossiers = useMemo(() => {
    const avecOps = new Set(txs.map(t => t.compte_id).filter(Boolean) as string[]);
    const avecApports = new Set(apports.map(a => a.compte_id));
    const lot = comptes
      .filter(c => avecOps.has(c.id) || avecApports.has(c.id))
      .map(c => ({ cle: c.id, nom: c.nom, couleur: c.couleur }));
    if (txs.some(t => !t.compte_id || !nomDeCompte[t.compte_id])) {
      lot.push({ cle: LIBRE, nom: "Non rattachées", couleur: JETONS.texteAttenue });
    }
    return lot;
  }, [comptes, txs, apports, nomDeCompte]);

  /** Ce que le dossier regardé laisse passer. */
  const dansLaVue = useMemo(() => {
    const opRangee = (t: Tx) =>
      t.compte_id && nomDeCompte[t.compte_id] ? t.compte_id : LIBRE;
    return {
      txs: vue === TOTAL ? txs : txs.filter(t => opRangee(t) === vue),
      // ⚠️ Un apport appartient toujours à un compte : le reliquat n'en contient aucun.
      apports: vue === TOTAL ? apports
        : vue === LIBRE ? [] : apports.filter(a => a.compte_id === vue),
    };
  }, [vue, txs, apports, nomDeCompte]);

  /**
   * Le journal complet du dossier regardé, opérations et apports mêlés, du plus récent au
   * plus ancien.
   */
  const entrees = useMemo<Entree[]>(() => {
    const lot: Entree[] = [
      ...dansLaVue.txs.map(t => ({
        genre: "op" as const, cle: cleOp(t.id), date: t.executed_at, tx: t,
        compteId: t.compte_id ?? null,
      })),
      ...dansLaVue.apports.map(a => ({
        genre: "apport" as const, cle: cleApport(a.id), date: a.date ?? "", apport: a,
      })),
    ];
    return lot.sort((x, y) => y.date.localeCompare(x.date));
  }, [dansLaVue]);

  /**
   * ⚠️ **La sélection suit le dossier qu'on vient de choisir.** Elle survivait au filtre :
   * après être passé sur « Livret A », le panneau de détail décrivait encore un
   * renforcement de bitcoin, absent de la liste affichée. Un détail qui désigne une ligne
   * qu'on ne voit nulle part donne à croire à une erreur d'affichage. On retombe donc sur
   * la plus récente du dossier, comme à l'arrivée sur l'onglet.
   */
  useEffect(() => {
    if (!entrees.length) { setChoisie(null); return; }
    setChoisie(prev => (prev && entrees.some(e => e.cle === prev)) ? prev : entrees[0].cle);
  }, [entrees]);

  const choisieOp = choisie?.startsWith("op:") ? Number(choisie.slice(3)) : null;
  const detail    = choisieOp != null ? parId[choisieOp] : null;
  const detailApport = useMemo(
    () => (choisie?.startsWith("ap:")
      ? apports.find(a => a.id === choisie.slice(3)) ?? null : null),
    [choisie, apports]);
  const valeurTotale = positions.reduce((s, p) => s + (p.current_value ?? 0), 0);

  if (chargement) {
    return <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, fontSize: 12, color: "rgba(var(--nv-encre-rvb), 0.30)" }}>Chargement…</div>;
  }

  // ⚠️ **Les apports comptent pour « il y a quelque chose ».** Un portefeuille qui n'est
  // fait que d'épargne a un journal — ses versements — et l'accueillir par « Aucune
  // transaction » lui dirait que rien n'a été saisi alors que tout l'est.
  if (!txs.length && !apports.length) {
    return (
      <Carte style={{ margin: 14, alignItems: "center", justifyContent: "center", padding: 48 }}>
        <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(var(--nv-encre-rvb), 0.55)", margin: "0 0 6px" }}>
          Aucune transaction
        </p>
        <p style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.30)", margin: "0 0 16px", textAlign: "center", lineHeight: 1.6 }}>
          Le portefeuille se compose de vos écritures. Ajoutez la première.
        </p>
        <button onClick={onNewTransaction} style={{
          padding: "9px 16px", borderRadius: 10, border: `1px solid ${JETONS.accentBord}`,
          background: JETONS.accentDoux, color: JETONS.accent, fontSize: 12,
          fontWeight: 600, cursor: "pointer", fontFamily: FONT,
        }}>+ Nouvelle transaction</button>
      </Carte>
    );
  }

  return (
    // Même géométrie que la vue générale : marge de 10 px, gouttière de 8,
    // rayon de 30. Deux onglets voisins aux cadres décalés se voient.
    // Même géométrie que la vue générale, jusqu'au rembourrage : la marge du
    // bas vient du bas de page, commun aux onglets. L'écran tient dans la
    // fenêtre et ne défile pas — les panneaux se partagent la hauteur au
    // prorata, chacun défilant chez lui.
    <div style={{
      display: "flex", flexDirection: "column", gap: GOUTTIERE,
      /* ⚠️ Même rembourrage que la vue générale, bas compris : sans les dix pixels du bas,
         le conteneur mesurait 665 contre 647 et les deux onglets ne partaient pas du même
         cadre, si bien qu'aucun alignement de cartes ne pouvait tomber juste. */
      padding: `8px ${MARGE}px ${MARGE}px`, height: "100%", minHeight: 0, overflow: "hidden",
    }}>

      {/**
        * La rangée haute : le journal et ses panneaux de synthèse.
        *
        * ⚠️ **Le détail n'est plus dans la colonne de gauche mais sous les deux, et c'est ce
        * qui supprime le vide de droite.** Empilé sous le journal, il laissait la colonne de
        * droite s'étirer sur toute la hauteur de la page pour un contenu qui en réclamait
        * 364 : « Répartition des opérations » mesurait **394 pixels pour 103 de contenu**,
        * soit 265 de vide dans une carte. En le sortant, la rangée haute se règle sur la
        * hauteur que ses colonnes ont vraiment besoin d'avoir.
        *
        * ⚠️ **Le journal n'y gagne rien, et il ne faut pas se raconter le contraire.** Sa
        * hauteur vaut « tout moins le détail » dans les deux dispositions — le détail se
        * soustrait, qu'il soit à côté ou dessous. Ce qu'on gagne, c'est le vide en moins et
        * une carte de détail plus large, pas des écritures de plus.
        */}
      {/* ⚠️ **Gouttière à zéro, comme la vue générale — l'écart vient du rembourrage de la
          colonne de droite.** Les deux onglets se superposent case pour case ; obtenir le
          même écart par deux moyens différents — un `gap` ici, un `paddingLeft` là-bas —
          aurait suffi à décaler les cartes de quelques pixels d'un onglet à l'autre. */}
      <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>

      {/* ── Colonne principale ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: GOUTTIERE, flex: 1,
                    minWidth: 0, minHeight: 0 }}>

        {/* Le tableau prend la place du graphique : la courbe est déjà celle
            de la vue générale, la répéter d'un onglet à l'autre n'apprenait
            rien de plus. */}
        {/**
          * ⚠️ **Le journal prend tout ce que le détail ne réclame pas, et non une part fixe.**
          * La colonne se partageait en `1,15 : 1`, un rapport choisi quand les deux panneaux
          * défilaient également. Depuis que le détail a pour contrat de **ne pas défiler**,
          * sa hauteur n'est plus négociable : c'est une donnée, pas une part. Le journal, lui,
          * défile légitimement — une liste d'écritures n'a pas de fin — donc c'est à lui
          * d'absorber ce qui reste, et de le rendre quand le détail en a besoin.
          *
          * Autrement dit : **le panneau qui ne peut pas défiler reçoit sa hauteur naturelle,
          * celui qui le peut prend le reste.** C'est la règle qui survivra au prochain champ
          * ajouté dans le détail ; un rapport fixe, lui, aurait recommencé à le faire défiler.
          */}
        <Carte style={{ flex: 1, minHeight: 0 }}>
          <Titre>
            {vue === TOTAL ? "Toutes les écritures"
              : `Écritures de ${dossiers.find(d => d.cle === vue)?.nom ?? "ce dossier"}`}
          </Titre>
          {/* ⚠️ **Sur sa propre ligne, et non dans le titre.** Placé à droite de celui-ci,
              le rang de dossiers entrait en concurrence avec lui pour la même largeur : à
              six comptes, le titre se brisait en deux lignes et les dernières pastilles
              sortaient du cadre. Vu à l'écran. */}
          {dossiers.length > 0 && (
            <BarreDossiers dossiers={dossiers} vue={vue} onChoisir={setVue} />
          )}
          <div style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
            <TableauOperations
              lignes={entrees} types={types} parId={parId} comptes={nomDeCompte}
              choisie={choisie} onChoisir={setChoisie}
            />
          </div>
        </Carte>

        {/**
          * Le détail de l'écriture choisie, sous le journal et sur toute sa largeur.
          *
          * ⚠️ **La timeline qui l'accompagnait a été retirée, et ce n'était pas une carte
          * de trop par hasard : elle disait exactement ce que dit le tableau.** Mêmes
          * écritures, même ordre — relevé ligne à ligne : `24/07/26 Renforcement BTC-USD`,
          * `20/07/26 Versement Livret A`… Le tableau porte déjà une colonne Date et se trie
          * par date. Les deux servaient en outre de sélecteur pour ce même panneau, si bien
          * qu'une seule sélection était surlignée à deux endroits.
          *
          * ⚠️ **Ce qu'on y perd, il faut le nommer :** la timeline montrait le libellé, la
          * date et le montant sur trois lignes empilées, ce qui se lit d'un coup d'œil là où
          * une ligne de tableau demande de suivre des colonnes. Elle tronquait en revanche
          * `Versement · Compte courant` à chaque apport — 148 pixels pour 166 nécessaires —
          * dans une colonne de 230 qu'elle prenait au détail.
          *
          * ⚠️ **La grille de deux colonnes disparaît avec elle**, plutôt que de survivre
          * avec une seule piste : une grille d'un élément est une indirection que la
          * prochaine lecture prendra pour une intention.
          */}
      </div>

      {/* ── Colonne de droite ────────────────────────────────────────────── */}
      {/* Le dernier panneau s'étire pour occuper le bas : sans quoi la colonne
          s'arrêtait à mi-hauteur et laissait un vide que rien ne justifiait. */}
      {/* ⚠️ **296 pixels et dix de rembourrage à gauche : les mesures exactes de la colonne
          de droite de la vue générale.** Elle en faisait 320 sans rembourrage, ce qui posait
          « Résumé » quarante-huit pixels plus large que « Répartition » d'en face et
          l'entraînait hors de son alignement. */}
      <div style={{ display: "flex", flexDirection: "column", gap: GOUTTIERE,
                    width: 296, paddingLeft: 10, boxSizing: "border-box",
                    flexShrink: 0, minHeight: 0 }}>

        {/**
          * ⚠️ **Seul dans sa colonne, « Résumé » l'occupe entièrement plutôt que de se tasser
          * en haut.** « Répartition des opérations » est descendue dans la rangée basse pour
          * tenir le coin que le détail libère ; sans étirement, ce panneau garderait sa
          * hauteur naturelle de 241 et laisserait le reste de la colonne vide — le défaut
          * qu'on vient précisément de retirer ailleurs.
          */}
        <Carte style={{ flex: 1, minHeight: 0 }}>
          {/**
            * ⚠️ **La même pilule que la vue générale, et non plus un bouton à elle.** Elle
            * portait un bord accentué, un fond translucide, une encre bleue et un rayon de 9
            * — l'ancien habit de la page — pendant que « Ajouter une opération » de la vue
            * générale passait au fond plein tiré de l'avatar. Deux boutons différents pour
            * le même geste, à un onglet d'écart. Signalé à l'usage.
            *
            * ⚠️ **Et le libellé suit, pas seulement la peinture.** « + Nouvelle » laissait
            * deviner l'objet ; puisque les deux boutons ouvrent la même saisie, ils disent
            * désormais la même chose. Le signe « plus » est dans la pilule.
            */}
          <Titre action={
            <PiluleAction libelle="Ajouter une opération" onClick={onNewTransaction}
              title="Saisir une opération" fond={fondBouton} fondSurvol={fondBoutonSurvol} />
          }>Résumé</Titre>
          <Ligne label="Nombre d'opérations" valeur={recap.operations} />
          <Ligne label="Capital investi" valeur={eur(recap.capitalInvesti, 0)} />
          <Ligne label="Gain latent"
            valeur={recap.gainLatent == null ? "—" : `${recap.gainLatent >= 0 ? "+" : ""}${eur(recap.gainLatent, 0)}`}
            couleur={recap.gainLatent == null ? undefined : recap.gainLatent >= 0 ? JETONS.positif : JETONS.negatif} />
          <Ligne label="Meilleure opération"
            valeur={recap.meilleure?.gain == null ? "—" : `${recap.meilleure.gain >= 0 ? "+" : ""}${eur(recap.meilleure.gain, 0)}`}
            couleur={JETONS.positif} />
          <Ligne label="Pire opération"
            valeur={recap.pire?.gain == null ? "—" : `${recap.pire.gain >= 0 ? "+" : ""}${eur(recap.pire.gain, 0)}`}
            couleur={recap.pire?.gain != null && recap.pire.gain >= 0 ? JETONS.positif : JETONS.negatif} />
          <Ligne label="Durée moyenne de détention"
            valeur={recap.dureeMoyenneJours == null ? "—" : `${recap.dureeMoyenneJours} jours`} />
        </Carte>

        {/**
          * ⚠️ **Le panneau « Dividendes » a été retiré : c'était une carte dont le contenu
          * était l'annonce qu'une fonction n'existe pas.** Cent vingt pixels de la meilleure
          * colonne, en permanence, pour dire « la saisie des dividendes n'est pas encore
          * disponible ». Le raisonnement qui l'avait posée était juste sur un point — un
          * panneau à zéro se serait lu « vous n'avez rien touché » alors que le sens est
          * « on ne sait pas encore le saisir » — mais cela justifiait la **phrase**, pas le
          * créneau permanent. Une feuille de route ne se loge pas dans un tableau de bord.
          *
          * ⚠️ **Et quand les dividendes existeront, leur place est dans le journal, pas ici.**
          * Le précédent est déjà pris et documenté en tête de ce module : un apport de
          * trésorerie est une écriture datée, il figure « au même titre qu'un achat » comme
          * second `genre` d'`Entree`. Un dividende est une écriture datée de plus — ce sera un
          * troisième genre, une ligne du tableau et une part de la répartition, pas une carte
          * à lui. Rien à intégrer aujourd'hui en revanche : `TypeOp` ne connaît que
          * `achat | renforcement | vente | vente_partielle | apport`, et le serveur non plus.
          * C'est un changement de modèle, pas de mise en page.
          */}
      </div>
      </div>

      {/**
        * La rangée basse : le détail de l'écriture, et la composition du journal à sa droite.
        *
        * ⚠️ **Deux colonnes ici aussi, aux mêmes mesures que la rangée haute.** Le détail
        * s'arrête donc exactement où s'arrête le journal — demandé à l'usage, son bord droit
        * ne s'alignait sur rien tant qu'il passait sous la colonne de droite. Et « Répartition
        * des opérations » descend occuper le coin ainsi libéré, sans quoi on échangeait un
        * bord mal aligné contre un vide de 286 sur 284.
        *
        * ⚠️ **C'est la rangée haute qui est élastique, celle-ci a la hauteur du détail.** Le
        * détail ne défile pas — voir `HAUTEUR_DETAIL` —, donc sa hauteur est une donnée ; le
        * journal, qui défile légitimement, prend ce qui reste.
        */}
      <div style={{ display: "flex", gap: 0, height: HAUTEUR_DETAIL, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Hauteur naturelle, et pas une part de la colonne : voir la règle au-dessus du
        journal. `flexShrink: 0` est ici la forme que prend le contrat « ce panneau ne
        défile pas » — le laisser rétrécir reviendrait à le reprendre en silence. */}
        <Carte style={{ flex: 1, minHeight: 0 }}>
          {/**
            * ⚠️ **La suppression est passée du bas de la carte à sa rangée de titre.** Elle
            * occupait une rangée à elle seule, marge comprise, pour un bouton ; et cette
            * rangée changeait de hauteur selon l'état — un bouton au repos, deux pendant la
            * confirmation. C'était les dix derniers pixels qui manquaient pour que le
            * panneau tienne sans défiler, et les seuls qui variaient. Là-haut elle ne coûte
            * rien : la rangée existe déjà, réglée sur la hauteur d'une pilule.
            *
            * ⚠️ **Et c'est aussi sa place.** Le reste de la page met ses actions dans le
            * titre du panneau qu'elles concernent — « Ajouter une opération » au-dessus du
            * résumé, « Ajouter un compte » au-dessus de la rangée de dossiers. Une action
            * reléguée sous le contenu se cherche.
            */}
          <Titre action={!detailApport && detail && (
            confirme === detail.tx.id ? (
              <span style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirme(null)} style={{
                  padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(var(--nv-encre-rvb), 0.10)",
                  background: "transparent", color: "rgba(var(--nv-encre-rvb), 0.45)",
                  fontSize: 10.5, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>Annuler</button>
                <button onClick={() => supprimer(detail.tx.id)} disabled={suppression} style={{
                  padding: "5px 10px", borderRadius: 8, border: `1px solid ${JETONS.negatifDoux}`,
                  background: JETONS.negatifDoux, color: JETONS.negatif, fontWeight: 600,
                  fontSize: 10.5, cursor: suppression ? "default" : "pointer", fontFamily: FONT,
                  whiteSpace: "nowrap", opacity: suppression ? 0.5 : 1 }}>
                  {suppression ? "Suppression…" : "Confirmer la suppression"}
                </button>
              </span>
            ) : (
              <button onClick={() => { setConfirme(detail.tx.id); setErreur(null); }} style={{
                padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(var(--nv-encre-rvb), 0.10)",
                background: "transparent", color: "rgba(var(--nv-encre-rvb), 0.35)",
                fontSize: 10.5, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>
                Supprimer cette opération
              </button>
            )
          )}>{detailApport ? "Détail de l’apport" : "Détail de l’opération"}</Titre>
          {detailApport ? (
            <DetailApport apport={detailApport} compte={nomDeCompte[detailApport.compte_id]} />
          ) : detail ? (() => {
            const t = detail.tx;
            const p = cours[t.ticker];
            const valeurLigne = p != null ? t.quantity * p : null;
            const poids = valeurLigne != null && valeurTotale > 0 ? (valeurLigne / valeurTotale) * 100 : null;
            return (
              /**
               * ⚠️ **Ce panneau ne défile pas, et c'est une contrainte à tenir, pas un
               * réglage.** Demandé à l'usage. Le détail d'une écriture tient en une
               * quinzaine de valeurs : s'il faut le faire défiler, ce n'est pas qu'il est
               * long, c'est qu'il est mal disposé — et un ascenseur ici cache justement
               * qu'on a mal employé les mille pixels de large dont il dispose.
               *
               * ⚠️ **Ce qui l'a fait rentrer, mesuré :** les quatre montants passés de deux
               * colonnes à quatre, soit une rangée de moins (~54 px), la suppression
               * remontée dans la rangée de titre (~36 px), et les marges resserrées de deux
               * pixels chacune. Le contenu faisait 323 px pour 242 disponibles.
               *
               * ⚠️ **Le jour où l'on ajoute un champ ici, c'est ce contrat qu'il faut
               * revérifier** — pas ajouter `overflow: auto` pour faire tenir.
               */
              <div style={{ minHeight: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <AssetLogo ticker={t.ticker} type={t.asset_type} size={30} radius={8}
                    fallbackBg={JETONS.accentDoux} fallbackBorder={JETONS.accentBord}
                    fallbackTextColor={JETONS.accent} />
                  <span>
                    <span style={{ display: "block", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: COULEUR_OP[detail.type] }}>
                      {LIBELLE_OP[detail.type]} {t.ticker}
                    </span>
                    <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5, color: "rgba(var(--nv-encre-rvb), 0.35)" }}>
                      {new Date(t.executed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </span>
                </div>

                {/**
                  * ⚠️ **Quatre colonnes et non deux : la carte gagne en largeur ce qu'elle
                  * rendait en hauteur.** Depuis le retrait de la timeline, ce panneau
                  * s'étend sur 1082 pixels ; en deux colonnes, chaque encart en recevait
                  * 520 pour y écrire « 0,02 », et les quatre montants occupaient deux
                  * rangées. Sur une seule, ils tiennent tous et la carte récupère une
                  * cinquantaine de pixels de haut — c'est l'essentiel de ce qu'il fallait
                  * trouver pour qu'elle cesse de défiler.
                  */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
                  {[
                    ["Quantité", t.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 8 })],
                    ["Prix unitaire", eur(t.unit_price)],
                    ["Montant", eur(montant(t))],
                    ["Frais", eur(t.fees ?? 0)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: "rgba(var(--nv-encre-rvb), 0.04)", borderRadius: 10, padding: "8px 10px" }}>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>{l}</div>
                      <div style={{ ...NUM, fontSize: 12, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.92)", whiteSpace: "nowrap" }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>
                      Poids dans le portefeuille
                    </div>
                    <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.92)", whiteSpace: "nowrap" }}>
                      {poids != null ? `${poids.toFixed(2)} %` : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>
                      Valeur actuelle
                    </div>
                    <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.92)", whiteSpace: "nowrap" }}>
                      {valeurLigne != null ? eur(valeurLigne) : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>
                      {detail.realise ? "Résultat réalisé" : "Plus-value latente"}
                    </div>
                    {/**
                      * ⚠️ **Dit comme la performance du bandeau : le montant, puis son
                      * pourcentage en pastille.** Demandé à l'usage. C'est la même grandeur
                      * aux deux bouts de la page — une plus-value — et elle se lisait ici
                      * autrement : le pourcentage passait sous le montant, en petit et à
                      * soixante pour cent d'opacité, c'est-à-dire au registre d'une note de
                      * bas de page. Enfermé dans son fond teinté il redevient une donnée.
                      *
                      * ⚠️ **Et la ligne y gagne de la hauteur** : le pourcentage passant à
                      * côté du montant plutôt qu'en dessous, le corps du détail perd une
                      * ligne — de la réserve reprise sur `HAUTEUR_DETAIL`.
                      */}
                    <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
                      display: "flex", alignItems: "center", gap: 7,
                      color: detail.gain == null ? "rgba(var(--nv-encre-rvb), 0.40)" : detail.gain >= 0 ? JETONS.positif : JETONS.negatif }}>
                      <span>{detail.gain == null ? "—" : `${detail.gain >= 0 ? "+" : ""}${eur(detail.gain)}`}</span>
                      {detail.gainPct != null && (
                        <PastilleVariation pct={detail.gainPct} surMontantDe={12.5}
                          couleur={detail.gain != null && detail.gain < 0 ? JETONS.negatif : JETONS.positif} />
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid rgba(var(--nv-encre-rvb), 0.07)", paddingTop: 8 }}>
                  <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 4 }}>
                    Note personnelle
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, lineHeight: 1.6,
                    color: t.note ? "rgba(var(--nv-encre-rvb), 0.65)" : "rgba(var(--nv-encre-rvb), 0.25)" }}>
                    {t.note || "Aucune note sur cette opération."}
                  </div>
                </div>

                {erreur && (
                  <div style={{ marginTop: 10, padding: "7px 10px", borderRadius: 8,
                    background: JETONS.negatifVoile, border: `1px solid ${JETONS.negatifDoux}`,
                    fontFamily: FONT, fontSize: 10.5, color: JETONS.negatif, lineHeight: 1.5 }}>
                    {erreur}
                  </div>
                )}

              </div>
            );
          })() : (
            <div style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.28)" }}>
              {/* La timeline n'existe plus : c'est le journal du dessus qu'on désigne. */}
              Choisissez une écriture dans le journal.
            </div>
          )}
        </Carte>
        </div>
        <div style={{ width: 296, paddingLeft: 10, boxSizing: "border-box",
                      flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <Carte style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <Titre>Répartition des opérations</Titre>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
            {parts.map(p => (
              <div key={p.type} style={{ width: `${p.part}%`, background: COULEUR_OP[p.type] }} />
            ))}
          </div>
          {parts.map(p => (
            <div key={p.type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.55)" }}>
                <i style={{ width: 7, height: 7, borderRadius: "50%", background: COULEUR_OP[p.type] }} />
                {LIBELLE_OP[p.type]}
              </span>
              <span style={{ ...NUM, fontSize: 12, fontWeight: 600, color: "rgba(var(--nv-encre-rvb), 0.85)" }}>
                {p.part.toFixed(0)} %
              </span>
            </div>
          ))}
        </Carte>
      </div>
      </div>


    </div>
  );
}


/**
 * Le tableau des opérations.
 *
 * Extrait pour être posé à deux endroits : à droite du détail quand la largeur
 * le permet, en pleine largeur dessous sinon. L'écrire deux fois aurait suffi
 * à ce que les deux divergent.
 */
/**
 * Le détail d'un apport de trésorerie.
 *
 * ⚠️ **Aucun résultat, et c'est dit plutôt que tu.** Un panneau qui montrerait les mêmes
 * cases que pour une opération — poids, valeur actuelle, plus-value — avec des tirets
 * partout donnerait à croire à une mesure manquante. Il n'en manque aucune : verser de
 * l'argent n'a pas de performance, et la phrase le dit à la place des cases vides.
 *
 * ⚠️ **La correction se fait au journal du compte, pas ici.** Cet onglet donne à lire
 * l'histoire du portefeuille ; la modifier appartient à la fiche du compte, où le geste a
 * son garde-fou et sa distinction entre corriger et verser.
 */
function DetailApport({ apport, compte }: { apport: ApportRange; compte?: Compte }) {
  const verse = apport.montant >= 0;
  return (
    /* ⚠️ Pas de défilement ici non plus : c'est le second visage de la même carte, et un
       contrat qui ne vaudrait que pour l'un des deux ne tiendrait pas longtemps. Mesuré,
       ce panneau-ci occupe 208 pixels des 289 disponibles. */
    <div style={{ minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: `${COULEUR_OP.apport}22`, border: `1px solid ${COULEUR_OP.apport}55`,
          color: COULEUR_OP.apport, fontFamily: FONT, fontSize: 14, fontWeight: 700,
        }}>{verse ? "+" : "−"}</span>
        <span>
          <span style={{ display: "block", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: COULEUR_OP.apport }}>
            {verse ? "Versement" : "Retrait"} · {compte?.nom ?? "Compte supprimé"}
          </span>
          <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5, color: "rgba(var(--nv-encre-rvb), 0.35)" }}>
            {apport.date && new Date(apport.date).toLocaleDateString("fr-FR",
              { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </span>
      </div>

      <div style={{ background: "rgba(var(--nv-encre-rvb), 0.04)", borderRadius: 10, padding: "8px 10px", marginBottom: 12 }}>
        <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>Montant</div>
        <div style={{ ...NUM, fontSize: 12, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.92)", whiteSpace: "nowrap" }}>
          {verse ? "+" : "−"}{eur(Math.abs(apport.montant))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(var(--nv-encre-rvb), 0.07)", paddingTop: 10, marginBottom: 12 }}>
        <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 4 }}>Note</div>
        <div style={{ fontFamily: FONT, fontSize: 11.5, lineHeight: 1.6,
          color: apport.note ? "rgba(var(--nv-encre-rvb), 0.65)" : "rgba(var(--nv-encre-rvb), 0.25)" }}>
          {apport.note || "Aucune note sur cet apport."}
        </div>
      </div>

      <div style={{ fontFamily: FONT, fontSize: 10.5, lineHeight: 1.6, color: "rgba(var(--nv-encre-rvb), 0.35)" }}>
        Un apport monte votre patrimoine sans être une performance : il n’a ni résultat ni
        plus-value. Pour le corriger, ouvrez la fiche de {compte?.nom ?? "son compte"}.
      </div>
    </div>
  );
}

function BarreDossiers({
  dossiers, vue, onChoisir,
}: {
  dossiers: { cle: string; nom: string; couleur: string }[];
  vue: string;
  onChoisir: (v: string) => void;
}) {
  /**
   * Le classement des écritures par dossier.
   *
   * ⚠️ **C'est le composant `Segments` lui-même, et non une imitation.** La courbe de la vue
   * générale propose exactement les mêmes options — `Total`, puis un dossier par compte —
   * pour découper exactement la même chose ; les deux partagent d'ailleurs déjà leur
   * vocabulaire, `"total"` et l'identifiant du compte. Elles portaient pourtant deux habits :
   * une piste de segments là-bas, des puces à bord fin ici. Demandé à l'usage.
   *
   * ⚠️ **Imiter la piste à la main aurait été le quatrième cas de la journée** — après les
   * boutons d'ajout, la pastille de variation et la pilule d'étiquette. Reprendre le
   * composant, c'est hériter de ses corrections plutôt que de sa forme du jour.
   *
   * ⚠️ **La pastille de couleur passe dans le libellé**, que `Segment` accepte comme nœud.
   * Elle dit à quel dossier appartient l'option, et c'est la seule chose que le sélecteur de
   * la courbe n'a pas : là-bas la couleur est déjà portée par la courbe elle-même.
   */
  return (
    <div style={{ display: "flex", overflowX: "auto", marginBottom: 10,
                  paddingBottom: 2, flexShrink: 0, scrollbarWidth: "none" }}>
      <Segments
        taille="sm"
        ariaLabel="Filtrer les écritures par dossier"
        valeur={vue}
        onChange={onChoisir}
        options={[
          { valeur: TOTAL, libelle: "Tout", titre: "Toutes les écritures du portefeuille" },
          ...dossiers.map(d => ({
            valeur: d.cle,
            libelle: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <i style={{ width: 6, height: 6, borderRadius: "50%",
                            background: d.couleur, flexShrink: 0 }} />
                {d.nom}
              </span>
            ),
            titre: `Les écritures de ${d.nom}`,
          })),
        ]}
      />
    </div>
  );
}
function TableauOperations({
  lignes, types, parId, comptes, choisie, onChoisir,
}: {
  lignes: Entree[];
  types: Record<number, TypeOp>;
  parId: Record<number, { gain: number | null }>;
  comptes: Record<string, Compte>;
  choisie: string | null;
  onChoisir: (cle: string) => void;
}) {
  return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "18%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr>
            {["Date", "Type", "Actif", "Qté", "Montant", "Résultat"].map((h, i) => (
              <th key={h} style={{
                // L'en-tête est collant : son fond doit être opaque, sinon les
                // lignes défilent au travers. D'où le jeton de carte et non un
                // voile — c'est ce qui interdit ici l'encre translucide.
                position: "sticky", top: 0, background: JETONS.carte,
                // Interlettrage et marges resserrés : « Résultat » réclamait
                // 60 px dans une colonne qui en offrait 52.
                textAlign: i >= 3 ? "right" : "left", padding: "6px 3px",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.02em",
                color: JETONS.texteAttenue, textTransform: "uppercase",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map(e => {
            const actif = e.cle === choisie;
            const cellule: React.CSSProperties = {
              padding: "7px 6px", fontSize: 10.5, whiteSpace: "nowrap",
            };
            const fond = {
              cursor: "pointer",
              background: actif ? JETONS.accentVoile : "transparent",
              borderTop: "1px solid rgba(var(--nv-encre-rvb), 0.05)",
            } as React.CSSProperties;

            // ⚠️ **Un apport n'a ni quantité, ni cours, ni résultat.** Les colonnes
            // correspondantes portent un tiret : un « 0 € » en face de Résultat se lirait
            // comme une opération blanche, alors qu'il n'y a rien à mesurer — verser n'est
            // pas gagner, et c'est la règle centrale de ce portefeuille.
            if (e.genre === "apport") {
              const verse = e.apport.montant >= 0;
              const nom = comptes[e.apport.compte_id]?.nom ?? "Compte supprimé";
              const vide = { ...cellule, textAlign: "right" as const,
                             color: "rgba(var(--nv-encre-rvb), 0.25)" };
              return (
                <tr key={e.cle} onClick={() => onChoisir(e.cle)} style={fond}>
                  <td style={{ ...cellule, color: "rgba(var(--nv-encre-rvb), 0.55)" }}>
                    {new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </td>
                  <td style={cellule}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5,
                                   color: COULEUR_OP.apport, overflow: "hidden",
                                   textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                      <i style={{ width: 6, height: 6, borderRadius: "50%", background: COULEUR_OP.apport, flexShrink: 0 }} />
                      {verse ? "Versement" : "Retrait"}
                    </span>
                  </td>
                  <td style={{ ...cellule, fontSize: 11, fontWeight: 600,
                               color: "rgba(var(--nv-encre-rvb), 0.70)",
                               overflow: "hidden", textOverflow: "ellipsis" }}>{nom}</td>
                  <td style={{ ...NUM, ...vide }}>—</td>
                  <td style={{ ...NUM, ...cellule, textAlign: "right", color: "rgba(var(--nv-encre-rvb), 0.75)" }}>
                    {verse ? "+" : "−"}{eur(Math.abs(e.apport.montant))}
                  </td>
                  <td style={{ ...NUM, ...vide }}>—</td>
                </tr>
              );
            }

            const t = e.tx;
            const r = parId[t.id];
            return (
              /**
               * ⚠️ **L'ancre du saut depuis le graphique vit ici, et elle y a été
               * déplacée.** Elle était portée par la timeline, qui était le seul endroit
               * où une écriture avait un identifiant dans le document ; en la retirant on
               * emportait sans le voir le `scrollIntoView` de `selectionDemandee` — cliquer
               * un point de la courbe aurait bien changé la sélection, mais sans amener la
               * ligne sous les yeux, ce qui ne se remarque que sur un journal assez long
               * pour défiler.
               */
              <tr key={e.cle} id={`op-${t.id}`}
                onClick={() => onChoisir(e.cle)} style={fond}>
                <td style={{ ...cellule, color: "rgba(var(--nv-encre-rvb), 0.55)" }}>
                  {new Date(t.executed_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </td>
                <td style={cellule}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: COULEUR_OP[types[t.id]],
                                 overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                    <i style={{ width: 6, height: 6, borderRadius: "50%", background: COULEUR_OP[types[t.id]], flexShrink: 0 }} />
                    {LIBELLE_OP[types[t.id]]}
                  </span>
                </td>
                <td style={{ ...cellule, fontSize: 11, fontWeight: 600, color: "rgba(var(--nv-encre-rvb), 0.88)",
                             overflow: "hidden", textOverflow: "ellipsis" }}>{t.ticker}</td>
                <td style={{ ...NUM, ...cellule, textAlign: "right", color: "rgba(var(--nv-encre-rvb), 0.60)" }}>
                  {t.side === "SELL" ? "−" : "+"}{t.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })}
                </td>
                <td style={{ ...NUM, ...cellule, textAlign: "right", color: "rgba(var(--nv-encre-rvb), 0.75)" }}>{eur(montant(t))}</td>
                <td style={{ ...NUM, ...cellule, textAlign: "right", fontWeight: 600,
                  color: r?.gain == null ? "rgba(var(--nv-encre-rvb), 0.25)" : r.gain >= 0 ? JETONS.positif : JETONS.negatif }}>
                  {r?.gain == null ? "—" : `${r.gain >= 0 ? "+" : ""}${Math.round(r.gain).toLocaleString("fr-FR")} €`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
  );
}
