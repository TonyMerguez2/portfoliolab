"use client";
import { recuperer } from "@/lib/requete";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AssetLogo from "@/components/AssetLogo";
import FenetreModale from "@/components/ui/FenetreModale";
import { FONT, NUM } from "@/lib/typography";
import { CLAIR } from "@/lib/palette";
/* Le vocabulaire des formulaires, partagé avec la déclaration d'un compte. */
import { etiquette, champ, RAYON_SAISIE, HAUTEUR_SAISIE } from "@/components/ui/saisie";
import { ancrerLisere } from "@/components/ui/lisere";
import BoutonFermer from "@/components/ui/BoutonFermer";
import { API_URL as API } from "@/lib/api";


type Side        = "BUY" | "SELL";
type SearchAsset = { ticker: string; name: string; type: string };

/** Une écriture, telle que la saisie la produit — avant tout envoi. */
export type DraftTx = {
  ticker:      string;
  asset_type:  string;
  side:        Side;
  quantity:    number;
  unit_price:  number;
  fees:        number;
  executed_at: string;
  /** Mémo libre, facultatif. */
  note?:       string;
  /** Nom lisible, conservé pour l'affichage des brouillons. */
  name:        string;
};

interface Props {
  /**
   * Portefeuille destinataire. Facultatif : la page de construction saisit des
   * transactions avant que le portefeuille existe, et les remet via `onDraft`.
   */
  portfolioId?:   string;
  isOpen:         boolean;
  onClose:        () => void;
  onSuccess:      () => void;
  prefillTicker?: string;
  /**
   * Actif imposé, quand l'appelant le connaît déjà — évite l'aller-retour de
   * recherche de `prefillTicker`.
   */
  prefillAsset?:  SearchAsset;
  /** Empêche de changer d'actif : la ligne saisie porte sur celui-là. */
  lockAsset?:     boolean;
  /**
   * Reçoit l'écriture au lieu de l'envoyer. Sert à collecter des transactions
   * pour un portefeuille qui n'est pas encore créé.
   */
  onDraft?:       (tx: DraftTx) => void;
  /**
   * Remonte l'ecriture **a chaque frappe**, ou `null` tant qu'elle est incomplete.
   *
   * ⚠️ **Sans cela, une operation saisie pouvait etre perdue en silence.** `onDraft` ne part
   * qu'au clic sur « Acheter ». Dans le panneau de creation, ce bouton voisine avec « Creer le
   * portefeuille » : remplir l'operation puis conclure directement — le geste evident — creait
   * le portefeuille et son compte, et **jetait l'ecriture**. Constate en base : un portefeuille
   * neuf, un compte, zero transaction.
   *
   * ⚠️ **Il rend l'autre bouton inutile, donc il le supprime.** Quand l'appelant ecoute la
   * saisie vivante, il porte lui-meme la validation : afficher « Acheter » en plus ferait deux
   * actions principales pour un seul geste — le defaut deja corrige a l'etape du compte.
   */
  onBrouillonVivant?: (tx: DraftTx | null) => void;
  /** Valeurs de départ, pour reprendre une écriture déjà saisie. */
  initialDraft?:  DraftTx | null;
  /**
   * Rendu intégré : le panneau s'affiche dans le flux au lieu de flotter
   * au-dessus d'un voile.
   *
   * C'est la même saisie, au même endroit du code. La page de construction en
   * avait une autre — poids et montant global, une seule date pour tout — qui
   * produisait un prix de revient approché. Deux formulaires pour la même
   * écriture auraient divergé, et le prix de revient avec eux.
   */
  embedded?: boolean;
  /** Masque la croix de fermeture, inutile en rendu intégré. */
  hideClose?: boolean;
  /**
   * Le compte dans lequel l'opération sera rangée, quand l'appelant le connaît déjà.
   *
   * ⚠️ **Parce que l'écran ne le disait nulle part.** Ouverte seule, cette fenêtre fait
   * choisir le dossier dans une rubrique « Compte » ; ouverte au dernier temps de la création
   * d'un portefeuille, elle masque cette rubrique — le compte vient d'être déclaré à l'écran
   * précédent, et le code le sait. Mais l'œil, lui, ne le savait plus : rien ne rappelait où
   * l'écriture allait tomber. Relevé en parcourant le panneau.
   *
   * ⚠️ **Une mention, et non la rubrique en lecture seule.** Un champ grisé se lit comme un
   * champ qu'on pourra modifier ; ici il n'y a rien à choisir, seulement à se rappeler.
   */
  nomCompte?: string;
  /**
   * Les comptes déclarés **à titres** du portefeuille, parmi lesquels ranger l'écriture.
   *
   * ⚠️ **Une opération se range dans un compte, et ce n'est plus facultatif à l'écran.**
   * Sans compte, elle retombe dans le classement par déduction — deviné d'après la place de
   * cotation, incapable de distinguer deux PEA. Tant que ce classement était le seul, il
   * fallait bien s'en contenter ; depuis qu'un compte peut être déclaré, laisser une ligne
   * sans compte ne fait plus que reporter le rangement.
   *
   * ⚠️ **Les comptes de trésorerie n'y figurent pas.** Sur un livret, le solde *est* la
   * valeur : y ranger un achat compterait la somme deux fois. Le serveur le refuse, mais un
   * choix impossible n'a pas à être proposé.
   */
  comptes?: {
    /** L'identifiant du compte, ou la clé du dossier deviné qu'il faudra déclarer. */
    id: string;
    nom: string;
    couleur: string;
    /**
     * Ce choix est un dossier **deviné** : le retenir le déclarera.
     *
     * ⚠️ **Les dossiers devinés figurent dans la liste, et ce n'est pas un raccourci de
     * confort.** L'écran montre « PEA » et « CTO » sur la vue générale ; répondre ici
     * « vous n'avez déclaré aucun compte » revient à nier ce qu'il vient d'afficher.
     * L'épargnant a bien des comptes — ils sont seulement devinés — et la seule chose qui
     * manquait était de pouvoir les désigner.
     */
    aDeclarer?: boolean;
    /** Combien de lignes la déclaration rattacherait. */
    lignes?: number;
  }[];
  /**
   * Transforme le choix en un identifiant de compte réel, en le déclarant au besoin.
   *
   * ⚠️ **La modale ne sait pas ce que « déclarer » veut dire, et c'est voulu.** Créer un
   * compte puis lui rattacher les lignes d'un dossier est l'affaire de la page ; la saisie
   * n'a qu'à savoir dans quel compte écrire. Sans cette couture, elle aurait dû connaître
   * les genres, les couleurs et la route de rattachement pour poser une opération.
   */
  resoudreLeCompte?: (choix: string) => Promise<string>;
  /**
   * Le compte imposé, quand la saisie part de l'intérieur d'un dossier.
   *
   * ⚠️ **Imposé et montré, jamais imposé en silence.** On ouvre cette saisie depuis un
   * dossier précis ; laisser le choix ouvert inviterait à ranger ailleurs que là où l'on
   * vient de cliquer, et le taire ferait un rangement invisible.
   */
  compteImpose?: { id: string; nom: string; couleur: string };
  /** Ouvre la déclaration d'un compte, quand il n'y en a aucun où ranger l'écriture. */
  onDeclarerCompte?: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function typeColor(type: string) {
  return {
    bg:     type === "CRYPTOCURRENCY" ? "rgba(245,158,11,0.16)"  : type === "ETF" ? "rgba(139,92,246,0.16)"  : type === "INDEX" ? "rgba(34,211,238,0.14)"  : "rgba(59,130,246,0.16)",
    border: type === "CRYPTOCURRENCY" ? "rgba(245,158,11,0.35)"  : type === "ETF" ? "rgba(139,92,246,0.35)"  : type === "INDEX" ? "rgba(34,211,238,0.32)"  : "rgba(59,130,246,0.35)",
    text:   type === "CRYPTOCURRENCY" ? "#fcd34d"                : type === "ETF" ? "#c4b5fd"                : type === "INDEX" ? "#67e8f9"                 : "#93c5fd",
  };
}

function fmtEur(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/**
 * Une quantite lisible : assez de decimales pour dire quelque chose, jamais plus.
 *
 * ⚠️ **Huit decimales etaient posees quelle que soit la valeur, et c'etait illisible.**
 * « 2,5 » s'affichait bien, mais un calcul rendait « 0,14285714 » ou « 3,33333333 » — huit
 * chiffres dont six n'apprennent rien sur un titre qui en vaut trois. Signale a l'usage :
 * trop long pour rien.
 *
 * ⚠️ **On compte les chiffres *significatifs*, pas les decimales.** Une regle a deux
 * decimales aurait affiche « 0,00 » pour une fraction de bitcoin — c'est-a-dire zero, ce qui
 * est faux. La bonne grandeur est le nombre de chiffres qui portent l'information : quatre
 * suffisent partout, et les zeros qui les precedent ne comptent pas. D'ou « 0,00002891 » qui
 * garde ses huit decimales, quand « 3,33333333 » tombe a « 3,333 ».
 *
 * ⚠️ **Le plafond reste a huit.** Au-dela, on afficherait la poussiere du binaire plutot que
 * la valeur : `0.1 + 0.2` vaut `0.30000000000000004`, et personne n'a besoin de le savoir.
 */
function fmtQuantite(v: number): string {
  if (!isFinite(v) || v === 0) return "0";
  const ordre = Math.floor(Math.log10(Math.abs(v)));
  /* Quatre chiffres significatifs : pour un nombre d'ordre −5, cela fait huit decimales ;
     pour un nombre d'ordre 3, cela n'en laisse aucune. Borne des deux cotes. */
  const decimales = Math.min(8, Math.max(0, 3 - ordre));
  return v.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

export default function TransactionModal({
  portfolioId, isOpen, onClose, onSuccess, prefillTicker, prefillAsset,
  lockAsset = false, onDraft, onBrouillonVivant, initialDraft, embedded = false, hideClose = false,
  nomCompte,
  comptes = [], compteImpose, onDeclarerCompte, resoudreLeCompte,
}: Props) {
  const [side,           setSide]           = useState<Side>("BUY");
  /**
   * Le compte où ranger l'écriture.
   *
   * ⚠️ **Aucun choix par défaut, même quand il n'y a qu'un compte.** Le préremplir ferait
   * ranger sans y penser, et l'on ne s'en apercevrait qu'au moment où un second compte
   * existe — c'est-à-dire trop tard, avec un historique déjà mal classé.
   */
  const [compteId,       setCompteId]       = useState<string>("");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [searchResults,  setSearchResults]  = useState<SearchAsset[]>([]);
  const [isSearching,    setIsSearching]    = useState(false);
  const [showDrop,       setShowDrop]       = useState(false);
  const [selectedAsset,  setSelectedAsset]  = useState<SearchAsset | null>(null);
  const [quantity,       setQuantity]       = useState("");
  const [unitPrice,      setUnitPrice]      = useState("");
  const [fees,           setFees]           = useState("0");
  const [date,           setDate]           = useState(todayStr);
  /**
   * Ce que l'utilisateur tape, avant qu'on en fasse une date.
   *
   * ⚠️ **Deux etats et non un, parce qu'une saisie incomplete n'est pas une date.** `date`
   * porte la valeur ISO que le reste du formulaire lit — le cours du jour, l'ecriture envoyee.
   * `saisieDate` porte les chiffres en cours de frappe : « 28/08 » n'est pas encore une date,
   * et l'ecrire dans `date` ferait recharger un cours pour une date absurde a chaque touche.
   */
  const [saisieDate,     setSaisieDate]     = useState(() => {
    const [a, m, j] = todayStr().split("-");
    return j + m + a.slice(2);
  });
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [heldQty,        setHeldQty]        = useState<number | null>(null);
  const [fetchingPrice,  setFetchingPrice]  = useState(false);
  const [note,           setNote]           = useState("");
  /**
   * Unité de saisie. On raisonne tantôt en titres — « j'ai acheté 5 Apple » —,
   * tantôt en euros — « j'ai mis 500 € sur Apple ». Imposer l'un des deux
   * oblige à sortir la calculatrice ; la quantité manquante se déduit du cours.
   */
  const [saisieEn,       setSaisieEn]       = useState<"quantite" | "montant">("quantite");
  const [montant,        setMontant]        = useState("");
  const [focusedField,   setFocusedField]   = useState<string | null>(null);

  const debounceRef   = useRef<NodeJS.Timeout | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  /**
   * Vrai dès que le prix a été saisi à la main. Le cours proposé ne doit plus
   * l'écraser : une transaction réelle se passe rarement au cours de clôture.
   */
  const prixEdite     = useRef(false);


  // ── Escape to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  // ── Reset form on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery("");
    setSearchResults([]);
    setShowDrop(false);
    setError(null);
    setHeldQty(null);

    if (initialDraft) {
      setSide(initialDraft.side);
      setSelectedAsset({
        ticker: initialDraft.ticker, type: initialDraft.asset_type, name: initialDraft.name,
      });
      setQuantity(String(initialDraft.quantity));
      setUnitPrice(String(initialDraft.unit_price));
      setFees(String(initialDraft.fees));
      poserDate(initialDraft.executed_at.slice(0, 10));
      setNote(initialDraft.note ?? "");
      setSaisieEn("quantite");
      setMontant("");
      prixEdite.current = true;   // le prix repris ne doit pas être écrasé
      return;
    }

    setSide("BUY");
    setSelectedAsset(prefillAsset ?? null);
    setQuantity("");
    setUnitPrice("");
    setFees("0");
    poserDate(todayStr());
    setNote("");
    setSaisieEn("quantite");
    setMontant("");
    prixEdite.current = false;
  }, [isOpen, prefillAsset, initialDraft]);

  // ── Prefill ticker ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !prefillTicker || prefillAsset) return;
    recuperer(`${API}/api/v1/search?q=${encodeURIComponent(prefillTicker)}`)
      .then(r => r.json())
      .then((d: any) => {
        const results: SearchAsset[] = (d?.results || []).map((x: any) => ({
          ticker: x.ticker, type: x.type || "EQUITY", name: x.name || x.ticker,
        }));
        const match = results.find(r => r.ticker === prefillTicker) ?? results[0];
        if (match) setSelectedAsset(match);
      })
      .catch(() => {});
  }, [isOpen, prefillTicker, prefillAsset]);

  // ── Cours proposé, à la date de l'opération ──────────────────────────────────
  //
  // Le prix de revient n'est juste que si le cours retenu est celui du jour de
  // l'achat. Proposer le cours du jour pour une transaction datée de mars
  // dernier fausserait tout le calcul, sans que rien ne le signale.
  useEffect(() => {
    if (!isOpen || !selectedAsset || prixEdite.current) return;
    let annule = false;
    setFetchingPrice(true);
    recuperer(`${API}/api/v1/price-at?tickers=${encodeURIComponent(selectedAsset.ticker)}&date=${date}`)
      .then(r => r.json())
      .then((d: any) => {
        if (annule || prixEdite.current) return;
        const p = d?.[selectedAsset.ticker];
        if (typeof p === "number" && p > 0) setUnitPrice(p >= 1 ? p.toFixed(2) : p.toFixed(6));
      })
      .catch(() => {})
      .finally(() => { if (!annule) setFetchingPrice(false); });
    return () => { annule = true; };
  }, [isOpen, selectedAsset, date]);

  // ── Search debounce ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await recuperer(`${API}/api/v1/search?q=${encodeURIComponent(searchQuery)}`);
        const d = await r.json();
        const items: SearchAsset[] = (d?.results || []).map((x: any) => ({
          ticker: x.ticker, type: x.type || "EQUITY", name: x.name || x.ticker,
        }));
        setSearchResults(items.slice(0, 8));
        setShowDrop(true);
      } catch {} finally { setIsSearching(false); }
    }, 300);
  }, [searchQuery]);

  // ── Held quantity (SELL only) ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAsset || side !== "SELL" || !portfolioId) { setHeldQty(null); return; }
    const token = localStorage.getItem("novac_token");
    if (!token) return;
    recuperer(`${API}/api/v1/portfolios/${portfolioId}/positions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        const pos = (d?.positions || []).find((p: any) => p.ticker === selectedAsset.ticker);
        setHeldQty(pos?.quantity ?? null);
      })
      .catch(() => setHeldQty(null));
  }, [selectedAsset, side, portfolioId]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function pickAsset(asset: SearchAsset) {
    setSelectedAsset(asset);
    setSearchQuery("");
    setShowDrop(false);
    setSearchResults([]);
    setUnitPrice("");
    prixEdite.current = false;   // le cours du nouvel actif reprend la main
  }

  function clearAsset() {
    setSelectedAsset(null);
    setHeldQty(null);
    setUnitPrice("");
    prixEdite.current = false;
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  /**
   * ⚠️ **Le compte imposé se réapplique à chaque ouverture.** L'état survit au démontage —
   * le panneau se cache, il ne se démonte pas — si bien qu'ouvrir la saisie depuis un
   * dossier après l'avoir ouverte depuis un autre aurait gardé le premier compte.
   */
  useEffect(() => {
    if (!isOpen) return;
    setCompteId(compteImpose?.id ?? "");
  }, [isOpen, compteImpose?.id]);

  /**
   * Ne garde que des chiffres et **un seul** separateur decimal.
   *
   * ⚠️ **Le champ n'est plus `type="number"`, et il fallait le remplacer.** Un champ
   * numerique accepte bien plus que des chiffres : « e », « E », « + » et « - » y sont
   * valides — `1e9` est un nombre parfaitement legal. Pire, quand la saisie devient invalide,
   * le navigateur rend une **chaine vide** plutot que ce qui est tape, si bien que le champ
   * paraissait se vider tout seul. Demande a l'usage de n'accepter que des chiffres.
   *
   * ⚠️ **La virgule est acceptee et gardee telle quelle.** C'est le separateur francais ; la
   * convertir en point sous les doigts ferait sauter le caractere qu'on vient de taper. Elle
   * est traduite a la lecture, comme le font deja le prix et les frais.
   *
   * ⚠️ **Un seul separateur, et c'est le premier qui compte.** Sans cette regle, « 1.2.3 »
   * passait le filtre pour etre lu comme 1,2 — un nombre different de ce qui est affiche.
   */
  const chiffresSeuls = (saisie: string): string => {
    const propre = saisie.replace(/[^\d.,]/g, "");
    const premier = propre.search(/[.,]/);
    return premier < 0
      ? propre
      : propre.slice(0, premier + 1) + propre.slice(premier + 1).replace(/[.,]/g, "");
  };

  /**
   * La taille du nombre principal, qui **retrecit pour qu'il tienne en entier**.
   *
   * ⚠️ **La largeur du champ est comptee en `ch`, donc elle grandit avec la saisie.** A taille
   * fixe, un nombre de douze caracteres occupait 374 pixels dans une carte qui en offre un peu
   * plus de quatre cents : il chassait le symbole hors du cadre puis debordait lui-meme.
   * Demande a l'usage qu'il se reduise a partir du sixieme chiffre, et un peu plus a chaque
   * chiffre suivant.
   *
   * ⚠️ **Reduire *proportionnellement* garde la largeur constante, et c'est ce qui rend la
   * regle exacte plutot qu'approchee.** Le `ch` etant l'avance du zero, il suit la taille de
   * police : poser `taille = 52 × 5 / n` fait que `n` caracteres occupent toujours la largeur
   * de cinq caracteres a 52. Le nombre ne peut donc plus deborder, quelle que soit sa
   * longueur — ce qu'un palier par tranche n'aurait garanti que jusqu'a sa derniere tranche.
   *
   * ⚠️ **Cinq caracteres avant que cela ne bouge**, virgule comprise : « 1234,5 » en fait six
   * et commence donc a se reduire, ce qui est le seuil demande.
   *
   * ⚠️ **Le plancher de vingt pixels a ete retire, et c'etait un vrai defaut.** Il rendait la
   * promesse fausse au-dela de treize caracteres : la taille cessant de baisser, la largeur
   * repartait — vingt-trois chiffres occupaient 276 pixels pour 430 disponibles, le symbole
   * etait chasse hors du cadre puis **renvoye a la ligne**. Constate a l'usage. Un plancher et
   * une largeur bornee ne peuvent pas tenir ensemble ; c'est la largeur qui compte.
   *
   * ⚠️ **La largeur cible est posee en pixels, pas en caracteres.** `0,673` est la largeur
   * d'un caractere par pixel de police, relevee sur ce rendu. La taille se deduit alors
   * directement de la place disponible, et la regle vaut pour n'importe quelle longueur au
   * lieu de s'arreter a une tranche.
   *
   * ⚠️ **La place disponible, c'est jusqu'au bouton d'inversion — moins le symbole.** 270
   * pixels separent l'ancre du nombre du point ou plus rien ne doit deborder ; le symbole en
   * prend sa part, et le nombre garde le reste. Au-dela, il n'a plus la place de pousser le
   * symbole plus loin, et c'est lui qui cede.
   *
   * ⚠️ **Le symbole se mesure, il ne s'estime pas.** Sa largeur va de onze pixels pour « € » a
   * quatre-vingts pour « NVDA.TO » : une valeur fixe aurait laisse le nombre deborder sur le
   * bouton avec les tickers longs — constate a l'ecran, le symbole passait **dessous** — ou
   * gaspille soixante-dix pixels avec les courts. Elle est donc relevee sur le rendu.
   *
   * ⚠️ **Neuf pixels de garde-fou, jamais atteints en pratique.** Il faudrait trente-deux
   * caracteres pour y arriver — a ce stade on ne saisit plus un nombre de titres.
   */
  /**
   * La largeur du symbole, relevee sur le rendu.
   *
   * ⚠️ **`useLayoutEffect` et non `useEffect`.** La mesure sert a calculer la taille du nombre,
   * donc a repeindre : faite apres l'affichage, elle produirait une image intermediaire ou le
   * nombre est a la mauvaise taille, puis un saut. Avant la peinture, rien ne se voit.
   *
   * ⚠️ **Le garde-fou d'un demi-pixel evite la boucle.** Sans lui, un ecart d'arrondi entre
   * deux mesures suffirait a redemander un rendu indefiniment.
   */
  const symboleRef = useRef<HTMLSpanElement>(null);
  const [largeurSymbole, setLargeurSymbole] = useState(44);
  const saisieAffichee = saisieEn === "quantite" ? quantity : montant;
  const TAILLE_MAX = 52;
  const ESPACE_UTILE = 330;
  /**
   * ⚠️ **Le symbole est compte deux fois, et c'est ce qui centre le nombre.** Une cale de sa
   * largeur est posee a gauche du champ : les deux cotes se repondent, donc le milieu de la
   * rangee tombe au milieu du **nombre** et non du groupe. Sans elle, le groupe entier etait
   * centre — le nombre paraissait pousse a gauche par le poids du ticker. Signale a l'usage.
   */
  const LARGEUR_NOMBRE = Math.max(70, ESPACE_UTILE - 16 - 2 * largeurSymbole);
  /**
   * La largeur du texte saisi, par pixel de police.
   *
   * ⚠️ **Un chiffre n'a pas la meme largeur qu'un autre, et la constante le niait.** `0,673`
   * etait l'avance du zero ; le « 1 » est nettement plus etroit, la virgule aussi. La boite du
   * champ etait donc calculee trop large pour « 111111 », et le texte y flottait : comme il
   * est centre, la moitie du surplus tombait a droite et **l'ecart au symbole grandissait**.
   * Releve a l'usage — l'espace n'etait pas le meme selon les chiffres tapes.
   *
   * ⚠️ **La mesure remplace la constante, et vaut pour n'importe quel contenu.** Le canevas
   * rend la largeur exacte du texte reellement affiche, separateur compris. On la releve a
   * cent pixels puis on la ramene a un : c'est un rapport, donc il se remultiplie par la
   * taille qu'on cherche — ce qui evite d'avoir a resoudre la circularite entre la taille et
   * la largeur.
   *
   * ⚠️ **Un repli sur l'ancienne constante** si le canevas manque — rendu serveur, contexte
   * refuse. Mieux vaut une largeur approchee qu'une division par zero.
   */
  const largeurParPixel = (() => {
    const texte = saisieAffichee || "0";
    if (typeof document === "undefined") return 0.673 * texte.length;
    const c = document.createElement("canvas").getContext("2d");
    if (!c) return 0.673 * texte.length;
    c.font = `700 100px ${FONT}`;
    return c.measureText(texte).width / 100;
  })();
  /**
   * ⚠️ **La taille n'est pas arrondie, et c'est ce qui immobilise le symbole.** Arrondie au
   * pixel, la largeur du nombre ne tombait plus exactement sur son plafond : elle variait de
   * quelques pixels d'une longueur a l'autre, et le symbole — colle a son bord — se decalait
   * encore alors qu'il etait cense avoir bute. Releve a l'usage. En valeur exacte,
   * `n × 0,673 × taille` vaut la largeur cible au flottant pres, donc rigoureusement la meme
   * pour toutes les longueurs au-dela du seuil.
   */
  const tailleNombre = Math.max(9, Math.min(TAILLE_MAX,
    LARGEUR_NOMBRE / Math.max(0.1, largeurParPixel)));
  /**
   * ⚠️ **La largeur est calculee, plus posee en `ch`.** L'unite `ch` est l'avance du zero dans
   * la police : elle donne le meme resultat, mais le navigateur l'arrondit a sa facon et le
   * plafond n'etait plus atteint au pixel pres. Le calcul explicite garantit que la boite
   * cesse net de grandir, ce qui est la seule facon d'immobiliser ce qui la suit.
   */
  const largeurChamp = Math.min(LARGEUR_NOMBRE, largeurParPixel * tailleNombre);
  /**
   * La remontee du symbole, qui **garde sa taille pendant que le nombre change**.
   *
   * ⚠️ **Le symbole ne retrecit pas avec le nombre.** Il l'a fait un moment, par simple
   * proportion — mais il n'a aucune raison de suivre : ce n'est pas lui qui manque de place,
   * et un ticker de six pixels a cote d'un nombre de vingt ne se lit plus. Demande a l'usage.
   * Il reste donc a dix-sept, quelle que soit la longueur saisie.
   *
   * ⚠️ **Sa remontee est fixe, elle non plus ne suit pas le nombre.** Elle l'a suivie, pour
   * garder les hauts d'encre alignes a toutes les tailles — mais la consequence etait absurde :
   * quand le nombre devient plus petit que le symbole, la difference des hauteurs de capitale
   * change de signe et **le symbole descend sous la ligne**. A onze pixels de chiffre, il
   * flottait quinze pixels plus bas, comme une seconde ligne. Constate a l'usage.
   *
   * ⚠️ **Le symbole est une ancre, pas un satellite.** Il marque le haut de l'emplacement du
   * nombre, une fois pour toutes ; c'est la valeur qui se reduit dessous. Sa position se
   * calcule donc a `TAILLE_MAX`, jamais a la taille courante — et le jalon invisible, qui fixe
   * la ligne de base quelle que soit la police du nombre, garantit qu'une valeur constante
   * suffit.
   *
   * ⚠️ **Les deux coefficients sont ajustes sur des mesures, et il a fallu s'y resoudre.** La
   * formule des metriques — hauteur d'encre du grand moins hauteur d'encre du petit — donne
   * 25,8 pixels a 52 ; l'ecran en demande 30,8. L'ecart vient de `align-items: baseline`, qui
   * ne pose pas la ligne de base d'un `<input>` la ou ses metriques le laissent attendre. Les
   * valeurs viennent donc d'un releve a cinq tailles, ajuste par une droite : residus sous le
   * tiers de pixel.
   *
   * ⚠️ **Les deux methodes de mesure se trompaient, et il a fallu regarder l'ecran.** Le
   * canevas annoncait les hauts d'encre confondus ; une sonde `<span>` posee sur la boite du
   * champ annoncait trois pixels de retrait. Sur une capture, le symbole etait encore
   * nettement au-dessus du chiffre. La raison est la meme dans les deux cas : ni l'une ni
   * l'autre ne sait ou un `<input>` pose reellement son texte — elles decrivent la police, ou
   * une boite qui lui ressemble. L'ordonnee a l'origine porte donc la correction relevee a
   * l'image, six pixels de plus.
   *
   * ⚠️ **La pente n'a plus d'objet depuis que la remontee est fixe**, mais elle reste ecrite :
   * elle dit d'ou vient le nombre, et servirait telle quelle si le symbole devait un jour
   * suivre a nouveau la taille du chiffre.
   */
  const TAILLE_SYMBOLE = 17;
  const remonteeSymbole = 0.9678 * TAILLE_MAX - 25.52;

  /* ⚠️ **Les dependances sont le *texte* du symbole, pas sa largeur.** Sans liste, le lint
     signale a juste titre une chaine de rendus possible ; avec `[largeurSymbole]`, l'effet se
     relancerait a chaque mesure, ce qui est la meme chose. Ce qui change reellement la largeur,
     c'est le mot affiche — l'unite de saisie et le ticker retenu. La mesure ne se refait donc
     qu'a ce moment-la, et le garde-fou d'un demi-pixel reste en second rempart. */
  useLayoutEffect(() => {
    const mesuree = symboleRef.current?.offsetWidth;
    if (mesuree && Math.abs(mesuree - largeurSymbole) > 0.5) setLargeurSymbole(mesuree);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisieEn, selectedAsset?.ticker]);

  /**
   * La date telle qu'on la tape : six chiffres, les barres se posent seules.
   *
   * ⚠️ **Le champ natif `type="date"` est parti, et il coutait cher.** Il ouvre un calendrier
   * qu'il faut naviguer a la souris pour reculer de quelques mois, impose sa propre langue et
   * son propre dessin — que `colorScheme` corrigeait a moitie —, et n'accepte la frappe qu'au
   * format que le navigateur a decide. Pour une date qu'on connait par coeur, six frappes
   * suffisent. Demande a l'usage.
   *
   * ⚠️ **Deux chiffres d'annee, et la regle qui leve l'ambiguite.** « 26 » peut valoir 1926 ou
   * 2026. Ici la date d'une operation est toujours passee : on prend donc le siecle qui donne
   * une date **anterieure ou egale a aujourd'hui**. « 26 » vaut 2026 tant qu'on n'a pas
   * depasse 2026, puis basculera de lui-meme. Aucun seuil a maintenir.
   */
  const chiffresDeDate = (saisie: string) => saisie.replace(/\D/g, "").slice(0, 6);
  /**
   * ⚠️ **Poser la date, c'est poser les deux etats.** Le formulaire la remet a zero a chaque
   * ouverture et la reprend d'un brouillon : ecrire `date` sans `saisieDate` laisserait le
   * champ afficher les chiffres de la fois d'avant pendant que le reste du formulaire compte
   * une autre date. Une seule porte d'entree, donc, et rien a se rappeler ailleurs.
   */
  /**
   * Six chiffres en une date, ou rien.
   *
   * ⚠️ **Le jour et le mois se verifient, ils ne se supposent pas.** « 12/34/56 » passait le
   * filtre des chiffres et produisait `1956-34-12` — une chaine qu'aucune couche suivante ne
   * savait lire, et qui partait telle quelle vers le serveur. Trouve en essayant des lettres
   * dans le champ : le filtre les retirait, et il restait des nombres qui n'etaient pas une
   * date.
   *
   * ⚠️ **Le 31 fevrier ne se rattrape pas par des bornes.** Un jour entre 1 et 31 et un mois
   * entre 1 et 12 laissent encore passer des dates qui n'existent pas. On construit donc la
   * date et l'on verifie qu'elle rend bien le jour demande : c'est le seul controle qui les
   * attrape toutes, y compris le 29 fevrier des annees non bissextiles.
   *
   * ⚠️ **Deux chiffres d'annee, et la regle qui leve l'ambiguite.** « 26 » peut valoir 1926 ou
   * 2026. La date d'une operation est toujours passee : on prend donc le siecle qui donne une
   * date anterieure ou egale a aujourd'hui. Aucun seuil a maintenir — la regle se deplace
   * toute seule avec le calendrier.
   */
  const dateDepuisChiffres = (c: string): string | null => {
    if (c.length < 6) return null;
    const j = +c.slice(0, 2), m = +c.slice(2, 4), aa = +c.slice(4, 6);
    if (m < 1 || m > 12 || j < 1 || j > 31) return null;
    const iso = (siecle: number) =>
      `${siecle + aa}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
    const existe = (v: string) => {
      const d = new Date(`${v}T00:00:00`);
      return !isNaN(d.getTime()) && d.getDate() === j && d.getMonth() + 1 === m;
    };
    const candidate = iso(2000) <= todayStr() ? iso(2000) : iso(1900);
    return existe(candidate) && candidate <= todayStr() ? candidate : null;
  };

  const poserDate = (iso: string) => {
    setDate(iso);
    const [an, mois, jour] = iso.split("-");
    setSaisieDate(`${jour}${mois}${an.slice(2)}`);
  };
  const dateAffichee = (() => {
    const c = chiffresDeDate(saisieDate);
    return [c.slice(0, 2), c.slice(2, 4), c.slice(4, 6)].filter(Boolean).join("/");
  })();

  const price    = parseFloat(unitPrice.replace(",", ".")) || 0;
  const feesVal  = parseFloat(fees.replace(",", "."))      || 0;
  const montantVal = parseFloat(montant.replace(",", ".")) || 0;
  // En mode « montant », la quantité se déduit du cours retenu. Sans cours, on
  // ne peut pas conclure : mieux vaut zéro qu'une division par zéro.
  /* ⚠️ **La virgule se traduit ici aussi, et elle ne l'etait pas.** Le prix, les frais et le
     montant le faisaient tous les trois ; la quantite, seule, lisait « 1,5 » comme 1 — donc
     une operation de un titre la ou l'ecran en affichait un et demi. Defaut anterieur,
     trouve en remplacant le champ numerique. */
  const qty      = saisieEn === "quantite"
    ? (parseFloat(quantity.replace(",", ".")) || 0)
    : (price > 0 ? montantVal / price : 0);
  const total    = qty * price + feesVal;
  /**
   * ⚠️ **Le compte n'est exigé que sur le chemin qui écrit en base.** Le brouillon sert la
   * création d'un portefeuille : il n'existe pas encore, donc il n'a aucun compte, et
   * l'exiger là rendrait toute création impossible. C'est la même raison qui interdit de
   * rendre `compte_id` obligatoire côté serveur.
   */
  const compteRequis = !onDraft && !onBrouillonVivant;
  const choixCompte = comptes.find(c => c.id === compteId);
  const isValid  = !!selectedAsset && qty > 0 && price > 0
    && (!compteRequis || !!compteId);

  /**
   * ⚠️ **L'ecriture remonte a chaque frappe, tant qu'elle tient debout.** L'appelant reçoit
   * `null` des qu'un champ manque : il sait donc a tout instant s'il y a une operation a
   * creer, sans avoir a demander a l'utilisateur de la confirmer par un second bouton.
   *
   * ⚠️ **Les dependances sont les valeurs, pas l'objet.** Reconstruire le brouillon a chaque
   * rendu et le passer en dependance relancerait l'effet indefiniment — deux objets de meme
   * contenu ne sont jamais egaux.
   */
  useEffect(() => {
    if (!onBrouillonVivant) return;
    onBrouillonVivant(isValid && selectedAsset ? {
      ticker:      selectedAsset.ticker,
      asset_type:  selectedAsset.type,
      name:        selectedAsset.name,
      side,
      quantity:    qty,
      unit_price:  price,
      fees:        feesVal,
      executed_at: `${date}T00:00:00`,
      note:        note.trim() || undefined,
    } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, selectedAsset?.ticker, side, qty, price, feesVal, date, note]);

  const accentColor  = side === "BUY" ? "#4ade80"              : "#f87171";
  const accentBg     = side === "BUY" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)";
  const accentBorder = side === "BUY" ? "rgba(74,222,128,0.40)" : "rgba(248,113,113,0.40)";

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!isValid || submitting) return;

    // Portefeuille pas encore créé : on remet l'écriture à l'appelant.
    if (onDraft) {
      onDraft({
        ticker:      selectedAsset!.ticker,
        asset_type:  selectedAsset!.type,
        name:        selectedAsset!.name,
        side,
        quantity:    qty,
        unit_price:  price,
        fees:        feesVal,
        executed_at: `${date}T00:00:00`,
        note:        note.trim() || undefined,
      });
      onSuccess();
      return;
    }

    const token = localStorage.getItem("novac_token");
    if (!token) { setError("Vous devez être connecté pour enregistrer une transaction."); return; }
    setSubmitting(true);
    setError(null);
    try {
      /**
       * ⚠️ **Le compte est résolu avant l'écriture, et son échec arrête tout.** Choisir un
       * dossier deviné le déclare : si cette déclaration manque, poster l'opération quand
       * même la laisserait sans compte — c'est-à-dire exactement ce que l'écran vient
       * d'interdire, mais en silence et après coup.
       */
      const compteFinal = resoudreLeCompte ? await resoudreLeCompte(compteId) : compteId;
      const res = await recuperer(`${API}/api/v1/portfolios/${portfolioId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticker:      selectedAsset!.ticker,
          asset_type:  selectedAsset!.type,
          side,
          quantity:    qty,
          unit_price:  price,
          fees:        feesVal,
          executed_at: `${date}T00:00:00`,
          note:        note.trim() || null,
          compte_id:   compteFinal || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || `Erreur ${res.status}`);
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Enter key on card ────────────────────────────────────────────────────────
  function handleCardKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && isValid && !submitting && !showDrop) handleSubmit();
  }

  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────────────────
  /**
   * ⚠️ **La géométrie vient de `@/components/ui/saisie`, le fond et les états de
   * `.novac-surface-saisie`.** Cette fenêtre écrivait les siens à la main — fond
   * `rgba(var(--nv-encre-rvb), 0.06)`, bord à 10 %, rayon de 10, bleu de mise au point posé en dur —
   * c'est-à-dire un second dialecte pour la même chose que le formulaire de compte, et un
   * dialecte qui ne connaît que le thème sombre. Demandé à l'usage que les deux saisies se
   * ressemblent.
   *
   * ⚠️ **La mise au point n'est plus gérée en React.** `focusedField` servait à peindre un
   * bord au `:focus` ; la classe le fait en CSS, sans rendu ni état. Ce que le style en ligne
   * ne sait pas faire — `:hover`, `:focus` — est précisément ce qu'on veut voir sur un champ.
   */
  function inputStyle(): React.CSSProperties {
    return champ;
  }

  const labelStyle: React.CSSProperties = { ...etiquette, display: "block", marginBottom: 6 };

  const ticker  = selectedAsset?.ticker ?? "—";
  // Une quantité déduite d'un montant tombe rarement rond : 1 000 € d'Apple
  // font 3,237188825224175 titres, qu'il ne sert à rien d'afficher en entier.
  const qtyLisible = fmtQuantite(qty);

  /**
   * La phrase qui dit l'opération : « Acheter 5 TSLA », que le montant vient compléter.
   *
   * ⚠️ **Une seule fabrication pour le bandeau et pour le bouton.** Le bouton la composait
   * déjà ; le bandeau, lui, disait la même chose en langage de calculette — `5 × 346,61 =`
   * d'un côté, `1 733,05 €` de l'autre. Deux formulations du même fait dans la même fenêtre,
   * dont une qui demande de reconstituer mentalement ce qu'on est en train de faire.
   * Remplacée à l'usage par la phrase. La partager évite qu'elles se remettent à diverger.
   *
   * ⚠️ **Sans actif, le verbe reste et le nom devient générique.** « Acheter — » laissait un
   * tiret là où l'œil attend un mot ; « Acheter un actif » se lit, et dit ce qui manque.
   */
  const phraseOperation = `${side === "BUY" ? "Acheter" : "Vendre"}${
    selectedAsset
      ? `${qty > 0 ? ` ${qtyLisible}` : ""} ${ticker}`
      : " un actif"}`;
  const btnLabel = submitting
    ? "Enregistrement…"
    : `${phraseOperation}${isValid ? ` pour ${fmtEur(total)}` : ""}`;

  const contenu = (
        <div>

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: CLAIR.texte, letterSpacing: "0.02em" }}>
              Nouvelle transaction
            </span>
            {!hideClose && <BoutonFermer onClick={onClose} titre="Fermer sans enregistrer" />}
          </div>

          {nomCompte && (
            <div style={{
              marginTop: -12, marginBottom: 18,
              fontFamily: FONT, fontSize: 11.5, color: CLAIR.texteFaible,
            }}>
              Dans <span style={{ color: CLAIR.texteSecondaire, fontWeight: 600 }}>{nomCompte}</span>
            </div>
          )}

          {/* ── Error banner ─────────────────────────────────────────────────── */}
          {error && (
            <div style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 10,
              background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)",
              color: "#f87171", fontSize: 12, lineHeight: 1.55,
            }}>
              {error}
            </div>
          )}

          {/* ── Side toggle ──────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 20 }}>
            {(["BUY", "SELL"] as Side[]).map(s => {
              const active   = side === s;
              const col      = s === "BUY" ? "#4ade80"               : "#f87171";
              const activeBg = s === "BUY" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)";
              const actBord  = s === "BUY" ? "rgba(74,222,128,0.40)" : "rgba(248,113,113,0.40)";
              /**
               * ⚠️ **Le sens choisi est un bouton d'action, pas une case à cocher bordée.**
               * Les deux se présentaient en cadres creux de rayon 10, teintés à 15 % :
               * l'actif se distinguait de l'inactif par une nuance, et rien ne disait que
               * l'on **décide** ici. Demandé à l'usage de reprendre la langue des boutons
               * d'ajout — fond plein, encre blanche, rayon de saisie.
               *
               * ⚠️ **La couleur reste celle du sens, pas celle de l'avatar.** Les pilules
               * d'ajout tirent leur teinte du personnage parce qu'elles font toutes le même
               * geste ; ici le vert et le rouge portent l'information même — acheter n'est
               * pas vendre — et l'uniformiser reviendrait à la taire.
               *
               * ⚠️ **Le non-choisi n'est pas teinté.** Deux aplats saturés côte à côte
               * annonceraient deux actions possibles ; il n'y en a qu'une, et l'autre est
               * l'option qu'on écarte.
               *
               * ⚠️ **Mais il n'est pas cerclé non plus : il suit `boutonSecondaire`**, dont
               * la recette vient du bouton de tri de la grille — fond de la carte, aucune
               * bordure, encre pleine, et le liseré pour seul contour. Voir le détail
               * là-bas, notamment pourquoi l'encre doit rester pleine.
               */
              return (
                <button key={s} onClick={() => setSide(s)} ref={ancrerLisere}
                  /* ⚠️ `.novac-bouton-doux` seulement au repos : elle porte le voile d'encre
                     et son survol. Sur le sens choisi, l'aplat vient de la teinte du sens et
                     c'est `.novac-bouton-plein` qui l'éclaire. */
                  className={`novac-lisere ${active ? "novac-bouton-plein" : "novac-bouton-doux"}`}
                  style={{
                  boxSizing: "border-box", height: HAUTEUR_SAISIE, padding: "0 10px",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  borderRadius: RAYON_SAISIE,
                  /* ⚠️ Jamais de bordure : elle raccourcirait la boîte du liseré de deux
                     pixels sans changer son rayon, et les deux arcs se croiseraient dans les
                     angles. Voir `boutonSecondaire`. */
                  border: "none",
                  background: active ? col : undefined,
                  /* ⚠️ Encre pleine même au repos : c'est elle qui teinte le liseré, seul
                     contour du bouton non choisi. L'atténuer l'effacerait. */
                  color: active ? "#FFFFFF" : CLAIR.texte,
                  fontSize: 12.5, fontWeight: active ? 600 : 500, fontFamily: FONT,
                  cursor: "pointer", transition: "background 160ms ease, color 160ms ease",
                }}>
                  {s === "BUY" ? "↑ Achat" : "↓ Vente"}
                </button>
              );
            })}
          </div>

          {/* ── Asset search ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>ACTIF</label>

            {/**
              * ⚠️ **Un seul champ, qu'un actif soit choisi ou non.** Il y en avait deux : une
              * barre de recherche, remplacée par une pastille dès la sélection. Pour chercher
              * autre chose il fallait donc **d'abord cliquer sur une croix**, ce qui ajoute un
              * geste à la correction la plus banale du formulaire — se tromper d'actif.
              * Signalé à l'usage. Ici le champ reste, l'actif retenu s'y montre, et taper
              * relance la recherche.
              *
              * ⚠️ **Et la pastille n'était cohérente avec rien.** Rayon de 10 là où les champs
              * en portent un autre, fond et bord écrits à la main plutôt que la surface de
              * saisie commune, croix à 6. Trois valeurs inventées pour un objet qui vit au
              * milieu d'un formulaire. La barre de recherche, elle, avait déjà été ramenée sur
              * `novac-surface-saisie` — la pastille était restée en arrière.
              *
              * ⚠️ **Le logo remplace la loupe, il ne s'y ajoute pas.** Deux symboles au même
              * endroit diraient deux choses à la fois ; l'un annonce qu'on peut chercher,
              * l'autre ce qu'on a trouvé. C'est la même place, elle change de rôle.
              */}
            <div style={{ position: "relative" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                /* ⚠️ La barre de recherche est une surface de saisie comme les autres :
                   même rayon, même fond, mêmes états. */
                borderRadius: RAYON_SAISIE, cursor: "text",
                /* ⚠️ **La hauteur est imposée, elle ne se déduit plus du contenu.** Elle
                   valait la somme du logo et du rembourrage — donc 40 avec un actif choisi,
                   mais 34 sans, la loupe étant plus petite que le logo. Le champ se
                   raccourcissait donc au moment précis où il est vide, c'est-à-dire celui où
                   on le regarde le plus. Mesuré à l'écran. `HAUTEUR_SAISIE` le fixe des deux
                   côtés ; le rembourrage vertical disparaît, le centrage vient du `flex`.

                   ⚠️ **C'est ce champ qui a fixé la valeur commune à 40**, et non l'inverse :
                   un logo de 24 avec sept pixels de marge n'en admet pas moins. */
                boxSizing: "border-box", height: HAUTEUR_SAISIE,
                padding: "0 12px",
              }} className="novac-surface-saisie"
              onClick={() => searchInputRef.current?.focus()}>
                {selectedAsset ? (() => { const tc = typeColor(selectedAsset.type); return (
                  <AssetLogo ticker={selectedAsset.ticker} type={selectedAsset.type}
                    /**
                      * ⚠️ **Rond, et sans bord.** Le champ qui l'accueille est une pilule — un
                      * rayon de dix-huit sur trente-huit de haut, donc entierement arrondi. Un
                      * carre a coins casses pose dedans y introduit une seconde geometrie, et
                      * l'oeil lit deux systemes dans le meme objet. Demande a l'usage.
                      *
                      * ⚠️ **Le bord venait du composant, pas d'ici.** `AssetLogo` cercle les
                      * logos charges d'un trait blanc a sept centiemes : utile sur un fond de
                      * carte, de trop dans un champ qui porte deja le sien. Le style en ligne
                      * l'emporte, faute d'une propriete pour le dire.
                      */
                    size={24} radius={12} style={{ border: "none" }}
                    fallbackBg={tc.bg} fallbackBorder={tc.border} fallbackTextColor={tc.text}/>
                ); })() : (
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    style={{ color: "rgba(var(--nv-encre-rvb), 0.28)", flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                  </svg>
                )}
                <input
                  ref={searchInputRef}
                  className="tx-input"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setShowDrop(true); }}
                  onFocus={() => searchQuery && setShowDrop(true)}
                  onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                  /**
                    * ⚠️ **Le ticker retenu sert d'invite, il n'occupe pas le champ.** Écrit
                    * dans la valeur, il faudrait l'effacer avant de taper — le geste qu'on
                    * vient de supprimer. En invite, la première frappe cherche directement.
                    */
                  placeholder={selectedAsset ? selectedAsset.ticker : "Rechercher un actif…"}
                  disabled={lockAsset}
                  autoFocus={!selectedAsset}
                  style={{
                    background: "transparent", border: "none", outline: "none",
                    color: CLAIR.texte, fontSize: 12, flex: 1, minWidth: 0, fontFamily: FONT,
                    /* L'invite porte le ticker retenu : elle doit se lire comme une valeur,
                       pas comme une consigne en attente. */
                    ...(selectedAsset && !searchQuery
                      ? { fontWeight: 600, opacity: 1 } : {}),
                  }}
                />
                {selectedAsset && !searchQuery && (
                  <span style={{
                    fontSize: 11, color: "rgba(var(--nv-encre-rvb), 0.35)", flexShrink: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {selectedAsset.name}
                  </span>
                )}
                {(isSearching || fetchingPrice) && (
                  <span style={{ fontSize: 10, color: "rgba(var(--nv-encre-rvb), 0.28)", flexShrink: 0 }}>…</span>
                )}
                {selectedAsset && !lockAsset && (
                  <button
                    onClick={e => { e.stopPropagation(); clearAsset(); }}
                    aria-label="Retirer l’actif"
                    style={{
                      background: "none", border: "none", padding: 0, flexShrink: 0,
                      color: "rgba(var(--nv-encre-rvb), 0.40)", width: 18, height: 18,
                      cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 14, lineHeight: 1,
                    }}
                  >×</button>
                )}
              </div>

                {/* Dropdown */}
                {showDrop && searchResults.length > 0 && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
                    /* Le menu emprunte la carte de la page plutôt qu'un bleu nuit écrit ici :
                       il flotte au-dessus du formulaire, pas au-dessus d'un autre écran. */
                    background: CLAIR.carte, border: `1px solid ${CLAIR.bord}`,
                    borderRadius: RAYON_SAISIE, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
                  }}>
                    {searchResults.map((a, i) => {
                      const tc = typeColor(a.type);
                      return (
                        <div
                          key={a.ticker}
                          onMouseDown={() => pickAsset(a)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                            cursor: "pointer",
                            borderBottom: i < searchResults.length - 1 ? "1px solid rgba(var(--nv-encre-rvb), 0.04)" : "none",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--nv-encre-rvb), 0.05)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          {/* ⚠️ Le meme objet que celui du champ, donc le meme dessin : rond
                              et sans bord. Les laisser differer ferait changer le logo de forme
                              au moment ou on le choisit. */}
                          <AssetLogo ticker={a.ticker} type={a.type} size={26} radius={13}
                            style={{ border: "none" }}
                            fallbackBg={tc.bg} fallbackBorder={tc.border} fallbackTextColor={tc.text}/>
                          <span style={{ fontSize: 12, fontWeight: 600, color: CLAIR.texte, minWidth: 56 }}>{a.ticker}</span>
                          <span style={{ fontSize: 11, color: "rgba(var(--nv-encre-rvb), 0.35)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                          <span style={{ fontSize: 9, color: tc.text, background: `${tc.text}18`, borderRadius: 4, padding: "2px 6px", fontWeight: 700, letterSpacing: "0.08em", flexShrink: 0 }}>
                            {a.type}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>

          {/**
            * ── La saisie principale : un nombre nu ───────────────────────────
            *
            * ⚠️ **Plus de cadre autour du nombre, et ce n'est pas qu'une affaire de goût.**
            * Il vivait dans une carte bordée, avec un fond et un liseré qui s'allumait à la
            * mise au point. Or c'est **le champ le plus important de l'écran** : l'entourer
            * le range au même niveau que la date ou les frais, qui sont eux dans des cases.
            * Un nombre posé nu, en grand, au milieu, se lit comme le sujet de la page et non
            * comme une ligne de formulaire. Demandé à l'usage, sur le modèle d'un écran de
            * change.
            *
            * ⚠️ **Le nombre est centré, la bascule reste à droite.** Elle est absolue plutôt
            * que dans le flux : dans une rangée, sa largeur décalerait le nombre vers la
            * gauche, et le centre optique se déplacerait à chaque changement d'unité. Sortie
            * du flux, le nombre est centré sur la carte, pas sur ce qu'il en reste.
            *
            * ⚠️ **La bascule annonce l'unité d'arrivée, pas celle de départ.** Le symbole
            * seul ne dit pas vers quoi l'on bascule ; l'unité écrite dessous le dit. C'est
            * aussi ce qui permet de retirer l'infobulle, qui portait la même phrase en plus
            * long et n'apparaissait qu'au survol.
            *
            * ⚠️ **La largeur du champ est calculée en `ch`.** Un champ numérique occupe toute
            * la place qu'on lui laisse : sans cette largeur, « centrer » n'aurait centré
            * qu'une boîte vide autour d'un chiffre collé à gauche. Le `ch` est la largeur du
            * zéro dans la police en cours, donc la bonne unité pour compter des chiffres.
            */}
          <div style={{ marginBottom: 14, position: "relative", paddingTop: 2 }}>
            {/**
              * ⚠️ **Le symbole est accoude au nombre : il le suit, puis il bute.** Le nombre
              * part d'une ancre fixe et grandit vers la droite ; le symbole, colle a son bord,
              * se decale avec lui. Quand il arrive un peu a gauche du bouton d'inversion, il
              * n'y a plus de place : c'est alors la police du nombre qui se reduit, et le
              * symbole s'immobilise. Deux comportements, un seul mecanisme.
              *
              * ⚠️ **Quatre dispositions avant celle-ci, et chacune ratait un des deux.** Le
              * groupe centre faisait glisser le nombre a gauche a chaque frappe. Le groupe
              * ancre a gauche laissait le symbole s'arreter des le sixieme caractere, loin du
              * bouton — un mouvement qui s'interrompt sans raison visible. L'emplacement de
              * largeur fixe immobilisait le symbole, mais des le premier chiffre : il ne
              * suivait plus rien. Signale a l'usage a chaque fois.
              *
              * ⚠️ **C'est le nombre qui est centre, pas le groupe.** Le groupe centre mettait
              * son propre milieu au milieu de la carte : le symbole pesant a droite, le nombre
              * s'en trouvait decale a gauche. Une cale de la largeur du symbole, posee a
              * gauche du champ, retablit l'equilibre — le milieu du nombre tombe alors sur
              * celui de la carte, et le symbole reste accoude a son bord droit.
              *
              * ⚠️ **Ancre a gauche, un nombre court laissait un vide a droite** qu'on lisait
              * comme un defaut d'alignement. Centre, il s'ouvre des deux cotes jusqu'a son
              * plafond, puis plus rien ne bouge — la largeur de la rangee est alors constante.
              *
              * ⚠️ **Aucune transition sur la taille.** Elle donnait au symbole un glissement
              * qui n'avait pas lieu d'etre : la police s'animait pendant que la largeur, elle,
              * changeait d'un coup. Deux vitesses pour un seul mouvement. Signale a l'usage —
              * le symbole doit buter, pas deriver.
              */}
            <div style={{
              display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8,
              /* ⚠️ **Jamais de retour a la ligne.** Le symbole appartient au nombre : renvoye
                 en dessous, il devient une seconde ligne qui ne veut rien dire. */
              flexWrap: "nowrap",
            }}>
              {/**
                * ⚠️ **Un montant invisible fixe la hauteur du bloc et la ligne de base.** Sans
                * lui, la boîte du nombre suit sa police : à vingt pixels elle mesure 24 de haut
                * au lieu de 63, le bloc se tasse de quarante pixels et **tout ce qui suit
                * remonte** — la date, les frais, le total, le bouton. On tapait un chiffre de
                * plus et le formulaire sautait sous les doigts. Signalé à l'usage.
                *
                * ⚠️ **Un jalon plutôt qu'une hauteur écrite.** Poser `height: 63` aurait figé
                * un nombre qui n'est vrai que pour cette police et cette taille ; le jalon,
                * lui, porte la taille maximale et laisse le navigateur en déduire la boîte. Il
                * suit donc `TAILLE_MAX` sans qu'on ait à recalculer quoi que ce soit.
                *
                * ⚠️ **Il tient aussi la ligne de base, et c'est le second service.** Dans une
                * rangée alignée sur les lignes de base, c'est le plus grand qui la fixe :
                * quelle que soit la taille du nombre, elle reste celle du jalon. Le chiffre ne
                * glisse donc pas verticalement en rétrécissant, il rétrécit sur place.
                */}
              <span aria-hidden="true" style={{
                fontSize: TAILLE_MAX, fontWeight: 700, fontFamily: FONT,
                width: 0, overflow: "hidden", flexShrink: 0,
                /* ⚠️ **La marge negative annule l'ecart que le jalon consomme.** Large de zero,
                   il n'en restait pas moins un enfant de la rangee : l'ecart de huit pixels qui
                   le suit s'ajoutait a gauche sans rien a droite, et le nombre se retrouvait
                   decale de quatre pixels. Mesure. */
                marginRight: -8,
              }}>0</span>

              {/**
                * ⚠️ **Une cale muette, de la largeur du symbole.** C'est elle qui met le
                * *nombre* au centre plutot que le groupe : la rangee etant centree, il faut
                * qu'elle pese autant a gauche qu'a droite. Le symbole occupant sa place a
                * droite, la cale l'equilibre a gauche — et le milieu du champ tombe alors sur
                * le milieu de la carte.
                *
                * ⚠️ **Elle suit la largeur mesuree, pas une valeur fixe.** « € » et
                * « NVDA.TO » ne pesent pas la meme chose ; une cale figee aurait recentre
                * juste pour l'un des deux.
                */}
              <span aria-hidden="true" style={{ width: largeurSymbole, flexShrink: 0 }}/>
              <input
                type="text"
                inputMode="decimal"
                className="nv-nombre-nu"
                value={saisieEn === "quantite" ? quantity : montant}
                onChange={e => {
                  const v = chiffresSeuls(e.target.value);
                  if (saisieEn === "quantite") setQuantity(v); else setMontant(v);
                }}
                onFocus={() => setFocusedField("hero")} onBlur={() => setFocusedField(null)}
                placeholder="0"
                style={{
                  background: "transparent", border: "none", outline: "none",
                  color: CLAIR.texte, fontSize: tailleNombre, fontWeight: 700, fontFamily: FONT,
                  letterSpacing: "-0.03em", padding: 0, textAlign: "center",
                  /* La boite epouse le nombre jusqu'a son plafond : c'est ce qui fait que le
                     symbole le suit, puis s'arrete. */
                  width: largeurChamp, flexShrink: 0,
                }}
              />
              {/**
                * ⚠️ **Le symbole est un exposant, pas un mot posé à côté.** Aligné sur la
                * ligne de base, il pesait autant que le nombre et l'ensemble se lisait comme
                * deux mots. En haut à droite et deux fois plus petit, il devient ce qu'il est :
                * l'unité de ce qui précède.
                *
                * ⚠️ **L'alignement se fait sur la ligne de base, jamais sur les boîtes.**
                * `flex-start` alignait les boîtes, or un glyphe ne commence pas au haut de la
                * sienne : il s'en écarte d'une quantité qui dépend de la police *et* de la
                * taille. Le symbole se posait donc trop haut. Signalé à l'usage — deux fois,
                * parce que ma première correction estimait cet écart au lieu de le mesurer.
                *
                * ⚠️ **La remontée vient de la police elle-même.** Mesurée au canevas, sur
                * `actualBoundingBoxAscent` — la hauteur d'encre réelle au-dessus de la ligne
                * de base : **38,34 pixels** pour un chiffre à 52, **12,53** pour trois
                * capitales à 17. Les baselines confondues, il faut donc remonter le symbole de
                * leur différence, 25,8, pour que les deux hauts d'encre coïncident exactement.
                *
                * ⚠️ **La théorie donnait 25,8 ; l'écran en demandait 30,8.** Les cinq pixels
                * d'écart viennent de l'alignement lui-même : `align-items: baseline` ne pose
                * pas la ligne de base d'un `<input>` là où la formule des métriques le laisse
                * attendre — sa boîte de contenu et sa boîte de ligne ne coïncident pas. Le
                * calcul donne l'ordre de grandeur, la mesure donne la valeur.
                *
                * ⚠️ **La remontée se recalcule à chaque taille du nombre**, puisque le
                * symbole, lui, n'en change pas — voir `remonteeSymbole`.
                */}
              <span ref={symboleRef} style={{
                fontSize: TAILLE_SYMBOLE, fontWeight: 700, fontFamily: FONT, flexShrink: 0,
                letterSpacing: "0.01em", whiteSpace: "nowrap",
                /* ⚠️ **Le signe est porté par la valeur, pas collé devant.** Écrit
                   `-${remontee}`, une remontée négative — elle l'est au plancher de vingt
                   pixels, où le nombre devient plus petit que son symbole — donnait
                   `translateY(--0.16px)`, du CSS invalide que le navigateur jette **en
                   silence**. Le symbole sautait alors de huit pixels à la dernière taille,
                   sans qu'aucune erreur ne le signale. */
                transform: `translateY(${(-remonteeSymbole).toFixed(2)}px)`,
                color: "rgba(var(--nv-encre-rvb), 0.42)",
              }}>
                {saisieEn === "quantite" ? (selectedAsset?.ticker ?? "—") : "€"}
              </span>
            </div>

            {/* Bascule d'unité : on raisonne en titres ou en euros selon le jour. */}
            <button
              onClick={() => {
                // On convertit pour que le basculement ne perde pas la saisie.
                if (saisieEn === "quantite") {
                  setMontant(qty > 0 && price > 0 ? String(+(qty * price).toFixed(2)) : "");
                  setSaisieEn("montant");
                } else {
                  setQuantity(qty > 0 ? String(+qty.toFixed(8)) : "");
                  setSaisieEn("quantite");
                }
              }}
              aria-label={saisieEn === "quantite" ? "Saisir un montant en euros" : "Saisir un nombre de titres"}
              style={{
                position: "absolute", right: 2,
                /**
                  * ⚠️ **Le bouton s'aligne sur le symbole, pas sur le haut du bloc.** Pose a
                  * six pixels, il flottait dix pixels au-dessus du ticker — deux objets de
                  * meme famille a deux hauteurs differentes, alors qu'ils disent la meme
                  * chose : l'unite de ce qu'on saisit. Demande a l'usage.
                  *
                  * ⚠️ **Seize, et le nombre se deduit de deux mesures.** L'encre du symbole
                  * commence a 19,7 du haut du bloc — sa boite a 16,2, plus les 3,5 que le
                  * glyphe laisse au-dessus de lui a cette taille. Le trace de l'icone, lui,
                  * demarre a 3,2 de sa propre boite, le `viewBox` la faisant commencer a 4 sur
                  * 24. Il faut donc poser la boite du bouton a 19,7 − 3,2.
                  *
                  * ⚠️ **La reference est une capitale, pas le tiret.** Sans actif choisi, le
                  * symbole affiche « — », dont l'encre est centree sur la ligne et non calee en
                  * haut : s'aligner dessus aurait fait descendre le bouton de dix pixels des
                  * qu'un ticker apparait.
                  */
                top: 16,
                background: "none", border: "none", padding: 0, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                color: "rgba(var(--nv-encre-rvb), 0.42)", fontFamily: FONT,
              }}
            >
              {/**
                * ⚠️ **Les deux fleches sont decalees en hauteur, elles ne sont plus jumelles.**
                * Le dessin precedent posait deux traits de meme longueur cote a cote, tetes
                * opposees : symetrique, donc lisible comme un signe abstrait. Ici l'une monte
                * depuis le haut et l'autre descend vers le bas, sur des hauteurs differentes —
                * on y lit un echange, pas un ornement. Fourni a l'usage.
                */}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m3 8 4-4m0 0 4 4M7 4v9m6 3 4 4m0 0 4-4m-4 4V10"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                {saisieEn === "quantite" ? "€" : (selectedAsset?.ticker ?? "—")}
              </span>
            </button>

            {/**
              * ⚠️ **La légende dit trois choses selon ce qu'on sait, de la plus utile à la
              * plus pauvre.** Le total quand la saisie suffit à le calculer ; sinon le cours
              * unitaire, qui est ce qu'on cherche à ce moment-là ; sinon seulement le nom du
              * champ. La version d'avant s'arrêtait au premier et au troisième, si bien qu'un
              * actif choisi mais pas encore chiffré n'affichait que « Nombre de titres » —
              * alors que son cours était déjà connu.
              */}
            <div style={{
              marginTop: 6, textAlign: "center", fontFamily: FONT, fontSize: 12,
              color: "rgba(var(--nv-encre-rvb), 0.34)",
            }}>
              {/* ⚠️ Plus de « ≈ » devant la somme : le total est exact — quantité fois cours,
                  au centime — et le signe laissait croire à une estimation. Relevé à l'usage. */}
              {qty > 0 && price > 0
                ? (saisieEn === "quantite"
                    ? fmtEur(qty * price)
                    : `${fmtQuantite(qty)} ${selectedAsset?.ticker ?? ""}`)
                : price > 0
                  ? `${fmtEur(price)} par ${selectedAsset?.type === "CRYPTOCURRENCY" ? "cryptomonnaie" : "titre"}`
                  : saisieEn === "quantite" ? "Nombre de titres" : "Montant investi"}
            </div>

            {side === "SELL" && selectedAsset && (
              <div style={{
                marginTop: 4, textAlign: "center", fontFamily: FONT, fontSize: 10.5,
                color: "rgba(var(--nv-encre-rvb), 0.28)",
              }}>
                Détenu : {heldQty !== null ? fmtQuantite(heldQty) : "—"}
              </div>
            )}
          </div>

          {/* ── Détails ──────────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

            {/* Date — aujourd'hui par défaut ; la changer change le cours. */}
            <div>
              <label style={labelStyle}>DATE</label>
              {/**
                * ⚠️ **La date ne part vers le reste du formulaire qu'une fois complete.** Six
                * chiffres, pas cinq : sinon on demanderait le cours d'une date que l'utilisateur
                * n'a pas fini d'ecrire, a chaque touche. Tant qu'elle est incomplete, l'ancienne
                * valeur tient — le formulaire reste valide pendant la correction.
                *
                * ⚠️ **Et jamais dans le futur.** Un jour saisi apres aujourd'hui est ramene a
                * aujourd'hui : c'est ce que faisait `max` sur le champ natif, et il faut le
                * refaire a la main puisqu'on ne l'a plus. Une operation ne se passe pas demain.
                */}
              <input
                type="text"
                inputMode="numeric"
                value={dateAffichee}
                onChange={e => {
                  const c = chiffresDeDate(e.target.value);
                  setSaisieDate(c);
                  const lue = dateDepuisChiffres(c);
                  if (lue) setDate(lue);
                }}
                onFocus={() => setFocusedField("date")} onBlur={() => setFocusedField(null)}
                placeholder="JJ/MM/AA"
                maxLength={8}
                className="novac-surface-saisie" style={{ ...inputStyle(), ...NUM }}
              />
              {/**
                * ⚠️ **La ligne garde sa hauteur même vide.** Elle ne dit plus rien quand la
                * date est celle du jour — le champ affiche déjà cette date, et « Aujourd'hui »
                * ne faisait que la répéter en plus petit. Mais elle parle encore pour une date
                * passée et pour une date refusée : si le bloc disparaissait, tout ce qui suit
                * remonterait de douze pixels à la frappe du sixième chiffre.
                *
                * ⚠️ **Elle porte l'erreur :** sans elle, une date refusée laissait le champ
                * afficher des chiffres pendant que le formulaire en comptait une autre, sans
                * que rien ne le dise.
                */}
              <div style={{
                marginTop: 5, fontSize: 10, lineHeight: "12px", minHeight: 12,
                color: "rgba(var(--nv-encre-rvb), 0.28)", fontFamily: FONT,
              }}>
                {saisieDate.length === 6 && !dateDepuisChiffres(saisieDate)
                  ? "Cette date n’existe pas"
                  : date === todayStr() ? ""
                  : "Cours de clôture de ce jour"}
              </div>
            </div>

            {/* Prix unitaire */}
            <div>
              <label style={labelStyle}>PRIX UNITAIRE (€)</label>
              {/**
                * ⚠️ **Plus de champ numerique ici non plus, donc plus de molette.** Les fleches
                * d'increment n'ont aucun sens sur un cours — personne ne cherche 220,95 en
                * cliquant depuis 220,94 — et elles apparaissent au survol pile a l'endroit ou
                * l'on va cliquer pour corriger. Demande a l'usage. Le filtre est celui du
                * champ principal : des chiffres et un seul separateur.
                */}
              <input
                type="text"
                inputMode="decimal"
                value={unitPrice}
                onChange={e => { prixEdite.current = true; setUnitPrice(chiffresSeuls(e.target.value)); }}
                onFocus={() => setFocusedField("price")} onBlur={() => setFocusedField(null)}
                placeholder={fetchingPrice ? "…" : "0,00"}
                className="novac-surface-saisie" style={{ ...inputStyle(), ...NUM }}
              />
              {prixEdite.current && (
                <div style={{ marginTop: 5, fontSize: 10, color: "rgba(var(--nv-encre-rvb), 0.28)", fontFamily: FONT }}>
                  Saisi à la main
                </div>
              )}
            </div>

            {/* Frais */}
            <div>
              <label style={labelStyle}>FRAIS (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={fees} onChange={e => setFees(chiffresSeuls(e.target.value))}
                onFocus={() => setFocusedField("fees")} onBlur={() => setFocusedField(null)}
                placeholder="0"
                className="novac-surface-saisie" style={{ ...inputStyle(), ...NUM }}
              />
            </div>

            {/* Note */}
            <div>
              <label style={labelStyle}>NOTE</label>
              <input
                type="text"
                value={note} onChange={e => setNote(e.target.value)}
                onFocus={() => setFocusedField("note")} onBlur={() => setFocusedField(null)}
                placeholder="PEA, arbitrage…"
                maxLength={120}
                className="novac-surface-saisie" style={{ ...inputStyle() }}
              />
            </div>

            {/**
              * Le compte où ranger l'écriture.
              *
              * ⚠️ **Trois cas, et le troisième est celui qu'on oublie.** Un compte imposé —
              * la saisie part de l'intérieur d'un dossier — se montre sans se changer. Une
              * liste de comptes se choisit. Et quand il n'y en a aucun, un bouton éteint et
              * muet serait le pire des trois : on ne saurait ni pourquoi ni quoi faire. On
              * dit donc ce qui manque, et on offre de le créer.
              */}
            {compteRequis && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>COMPTE</label>
                {compteImpose ? (
                  <div style={{
                    ...inputStyle(),
                    display: "flex", alignItems: "center", gap: 8,
                    color: "rgba(var(--nv-encre-rvb), 0.92)",
                  }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                      background: compteImpose.couleur,
                    }} />
                    {compteImpose.nom}
                  </div>
                ) : comptes.length > 0 ? (
                  <select
                    value={compteId} onChange={e => setCompteId(e.target.value)}
                    onFocus={() => setFocusedField("compte")} onBlur={() => setFocusedField(null)}
                    className="novac-surface-saisie" style={{ ...inputStyle(), appearance: "none" }}>
                    {/* ⚠️ Une option vide et sélectionnée par défaut, plutôt que le premier
                        compte : préremplir ferait ranger sans y penser, et l'on ne s'en
                        apercevrait qu'une fois un second compte ouvert — trop tard, avec un
                        historique déjà mal classé. */}
                    <option value="">Choisissez un compte…</option>
                    {comptes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nom}{c.aDeclarer ? " — à déclarer" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    padding: "10px 12px", borderRadius: 10, fontSize: 12, lineHeight: 1.5,
                    background: "rgba(var(--nv-encre-rvb), 0.04)",
                    border: "1px solid rgba(var(--nv-encre-rvb), 0.10)",
                    color: "rgba(var(--nv-encre-rvb), 0.72)",
                  }}>
                    Une opération se range dans un compte, et vous n’en avez pas encore
                    déclaré.
                    {onDeclarerCompte && (
                      <button type="button" onClick={onDeclarerCompte}
                        style={{
                          display: "block", marginTop: 8, padding: 0, background: "none",
                          border: "none", cursor: "pointer", font: "inherit",
                          color: "#4ade80", textDecoration: "underline",
                        }}>
                        Déclarer un compte
                      </button>
                    )}
                  </div>
                )}
                {/**
                  * ⚠️ **Ce que le choix entraîne, dit avant d'enregistrer.** Retenir un
                  * dossier deviné le déclare : cela crée un compte et lui rattache ses
                  * lignes. C'est le bon geste — il évite un détour par un autre écran — mais
                  * il est bien plus lourd que « ranger cette opération », et le découvrir
                  * après coup serait le pire des deux mondes.
                  */}
                {choixCompte?.aDeclarer && (
                  <div style={{
                    marginTop: 6, fontSize: 11, lineHeight: 1.45,
                    color: "rgba(var(--nv-encre-rvb), 0.62)",
                  }}>
                    Ce dossier est deviné : l’enregistrer le déclarera comme compte
                    {choixCompte.lignes ? `, avec ses ${choixCompte.lignes} ligne${
                      choixCompte.lignes > 1 ? "s" : ""}` : ""}. Vous pourrez le renommer
                    ensuite.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Récapitulatif, et action quand la fenêtre porte la sienne ─────── */}
          {/**
            * ⚠️ **Un seul bloc là où il y en avait deux, et ils disaient la même phrase.** Le
            * bandeau récapitulait « Acheter 5 NVDA pour 1 087,75 € », et le bouton juste
            * en dessous répétait mot pour mot « Acheter 5 NVDA pour 1 087,75 € ». Deux fois
            * le même texte à deux pixels d'écart, dont un cliquable — rien ne disait lequel.
            * Signalé à l'usage : « la pill d'achat devient un bouton ».
            *
            * ⚠️ **La même boîte, deux natures selon l'appelant.** Quand le panneau de
            * création écoute la saisie vivante, il porte lui-même l'action dans son pied :
            * ce bloc n'est alors qu'une lecture, et reste un `div` sur la surface calme des
            * champs. Ouverte seule depuis le tableau de bord, la fenêtre n'a pas de pied —
            * le bloc devient le bouton, teinté du sens de l'opération.
            *
            * ⚠️ **Teinté, et non laissé calme.** Les deux fenêtres se ressembleraient
            * davantage si l'action gardait la surface du récapitulatif ; mais elle serait
            * alors la seule commande de l'écran et ne se distinguerait d'aucun champ. C'est
            * le reproche qui avait déjà fait remplacer un bouton creux ici même.
            *
            * ⚠️ **Le libellé est centré quand il agit, aligné à gauche quand il relit.** Une
            * phrase qu'on lit commence au bord gauche comme tout texte ; un libellé de bouton
            * se centre dans sa boîte.
            *
            * ⚠️ **Hauteur de champ et non de pilule.** Une pilule de vingt-six pixels étirée
            * sur toute la largeur se lit comme un ruban, pas comme une commande. Les vingt-six
            * pixels valent pour une pilule *posée dans une rangée*, ce qu'est le pied de la
            * fenêtre de création.
            */}
          {(() => {
            const agit = !onBrouillonVivant;
            const socle: React.CSSProperties = {
              boxSizing: "border-box", width: "100%", height: HAUTEUR_SAISIE,
              padding: champ.padding, borderRadius: RAYON_SAISIE,
              display: "flex", alignItems: "center",
              justifyContent: agit ? "center" : "flex-start",
              fontFamily: FONT, fontSize: agit ? 12.5 : 12, border: "none",
            };
            if (!agit) return (
              <div style={{ ...socle, background: "var(--nv-bord)", color: CLAIR.texteSecondaire }}>
                <span>
                  {phraseOperation}
                  {isValid && <>
                    {" pour "}
                    <span style={{ fontWeight: 700, color: accentColor }}>{fmtEur(total)}</span>
                  </>}
                </span>
              </div>
            );
            return (
              <button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
                className="novac-lisere novac-bouton-plein"
                ref={ancrerLisere}
                style={{
                  ...socle,
                  background: accentColor, color: "#FFFFFF", fontWeight: 700,
                  cursor: isValid && !submitting ? "pointer" : "not-allowed",
                  opacity: submitting ? 0.6 : isValid ? 1 : 0.45,
                  transition: "background 200ms ease, opacity 200ms ease, filter 150ms ease",
                }}>
                {btnLabel}
              </button>
            );
          })()}

        </div>
  );

  if (embedded) return contenu;

  /**
   * ⚠️ **La fenêtre est celle de tout le monde, elle n'a plus la sienne.** Elle portait un
   * fond translucide bleuté, un bord blanc à 10 %, un rayon de 16, une ombre écrite à la
   * main et un flou de 32 — cinq valeurs qui ne se retrouvaient nulle part ailleurs dans
   * l'application. Le cadre double de la page les remplace toutes.
   *
   * ⚠️ **Son animation en JavaScript disparaît avec.** Elle existait « pour éviter un
   * `<style>` global », ce qui était la bonne objection au moment de l'écrire ; la feuille
   * globale porte désormais ces images-clés pour les trois fenêtres, et un état React
   * remis à zéro à chaque ouverture ne rend plus service à personne. Ce qu'on y gagne :
   * `prefers-reduced-motion` s'applique enfin ici aussi, ce qu'un `transition` en ligne ne
   * savait pas faire.
   *
   * ⚠️ **`handleCardKey` reste sur le contenu**, et non sur le voile : il sert aux touches
   * de la saisie, pas à la fermeture, que la coquille prend en charge.
   */
  return (
    /**
      * ⚠️ **Mêmes mesures que le panneau de création, qui montre la même chose.** Elle
      * s'ouvrait à 440 de large avec un rembourrage de `20px 24px 24px` **posé par-dessus**
      * celui de `Cadre` — soit 38 en haut et 44 sur les côtés, contre 18 et 20 dans le
      * panneau. Deux fenêtres qui portent le même formulaire, l'une nettement plus étroite
      * et plus creuse que l'autre : le même contenu n'y tombait pas aux mêmes endroits.
      * Relevé à l'usage, les deux captures côte à côte.
      *
      * ⚠️ **Le rembourrage n'est plus redéclaré du tout.** `Cadre` en pose déjà un ; le
      * redire ici ne l'ajustait pas, il s'y ajoutait. C'est le genre de valeur qu'on croit
      * régler alors qu'on la cumule.
      */
    <FenetreModale onFermer={onClose} zIndex={200}
      etiquette="Saisir une opération"
      style={{ fontFamily: FONT }}>
      <div onKeyDown={handleCardKey} style={{ display: "contents" }}>
        {contenu}
      </div>
    </FenetreModale>
  );
}
