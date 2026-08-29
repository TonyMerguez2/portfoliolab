"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import AvatarNovac, { contourDeForme } from "@/components/AvatarNovac";
import TransactionModal, { type DraftTx } from "@/components/TransactionModal";
import FenetreModale from "@/components/ui/FenetreModale";
import { ancrerLisere } from "@/components/ui/lisere";
import BoutonFermer from "@/components/ui/BoutonFermer";
import EventailDossiers, { couleursDeFond, tirage } from "@/components/portfolio/EventailDossiers";
import {
  ChoixCouleur, ChoixSilhouette, Reglage,
} from "@/components/portfolio/ChoixApparence";
import { API_URL } from "@/lib/api";
import { useApp } from "@/lib/AppContext";
import { COULEURS_AVATAR, COULEUR_PAR_DEFAUT } from "@/lib/avatarCouleur";
import { assombrirPourBlanc } from "@/lib/couleur";
import { CLAIR, RAYONS } from "@/lib/palette";
import { enTetesAuth, jeton } from "@/lib/session";
import FormulaireCompte, { type SaisieCompte } from "@/components/portfolio/FormulaireCompte";
import { COULEURS_DOSSIER } from "@/components/portfolio/PastillesCouleur";
import { type GenreCompte, creerCompte, lireGenres } from "@/lib/comptes";
import { FONT } from "@/lib/typography";
import {
  FORMES_AVATAR, FORME_PAR_DEFAUT, type FormeAvatar, cleCouleur, cleForme,
} from "@/lib/useCouleurAvatar";
import {
  boutonPrincipal, boutonSecondaire, champ, etiquette,
} from "@/components/ui/saisie";

/**
 * Créer un portefeuille sans quitter l'écran d'accueil.
 *
 * ⚠️ **Ce que cela remplace, et pourquoi.** Le bouton menait à `/build`, une page pleine qui
 * demandait d'abord « d'où viennent vos positions ? », faisait chercher des actifs, composer
 * une allocation, et ne demandait le nom qu'à la toute fin — dans une fenêtre intitulée
 * « Sauvegarder ». Nommer la chose en dernier, c'est la construire avant de savoir ce qu'on
 * construit. Ici l'ordre est rendu : on la nomme, on lui donne un visage, et l'on y met une
 * première opération si l'on veut.
 *
 * ⚠️ **`/build` n'est pas supprimé pour autant.** Il reste ce qu'il fait bien : composer une
 * allocation cible à partir d'un modèle ou d'une recherche. Ce panneau est l'autre chemin,
 * le court — celui de qui sait déjà ce qu'il possède.
 */

/**
 * La place de chaque tete dans la grappe.
 *
 * ⚠️ **Deux rangs, huit tetes, rien de symetrique — et c'est la bonne version.** Elle a ete
 * remplacee par quatre tetes alignees, puis par quatre tetes legerement decalees, pour
 * repondre a un reproche de desordre. Les deux etaient plus rangees et moins vivantes. Ce qui
 * genait n'etait pas la disposition : c'etait que les tetes se voyaient **au travers** les
 * unes des autres. On revient donc a l'original, et l'on corrige le vrai defaut.
 *
 * ⚠️ **Le second rang est ce qui fait la foule.** Plus petit, plus haut, bien plus efface, et
 * glisse dans les intervalles du premier : c'est le decalage entre les deux qui creuse la
 * profondeur, un second rang aligne sur le premier n'aurait fait qu'epaissir le trait.
 *
 * ⚠️ **L'eloignement se dit par trois choses a la fois.** Plus petit, plus haut, plus sombre :
 * de 44 pixels et pleine couleur au premier plan, a 24 pixels et 87 % de voile au fond. Une
 * seule des trois ne suffirait pas — une petite tete aussi nette que les autres se lit comme
 * une petite tete, pas comme une tete lointaine.
 *
 * ⚠️ **Le fond evite la zone du centre.** La tete composee occupe −38 a +38 ; aucun satellite
 * de second rang n'est pose a moins de 70 du milieu, faute de quoi il disparaitrait
 * entierement derriere elle — un objet dessine, anime, et jamais vu.
 *
 * ⚠️ **Sept satellites et non huit, et c'est une contrainte de fond.** Il n'existe que huit
 * silhouettes : neuf tetes ne peuvent pas en montrer neuf differentes. Avec huit satellites
 * elles les prenaient toutes — l'une d'elles etait donc forcement celle du centre, si bien
 * qu'une tete du fond doublait toujours celle qu'on compose. Demande a l'usage qu'aucune ne
 * se repete. A sept, la silhouette du centre est retiree du lot et il en reste exactement
 * sept pour sept places : plus aucun doublon possible, ni entre satellites ni avec le centre.
 *
 * ⚠️ **Retirer une tete desequilibre la rangee, il a fallu la recomposer.** Les quatre du fond
 * passent a trois, et les diametres de droite montent pour compenser la place perdue. En
 * ponderant chaque tete par son diametre : a gauche 45·44 + 95·36 + 70·29 + 136·24 = 10 694,
 * a droite 55·46 + 95·42 + 140·28 = 10 440. Deux virgule quatre pour cent d'ecart — le groupe
 * penche imperceptiblement a gauche au lieu de tomber d'un cote.
 *
 * ⚠️ **`retard` echelonne l'arrivee**, en millisecondes, du plus proche au plus lointain : le
 * groupe se forme autour du centre et s'etend vers le fond, au lieu de se remplir de gauche a
 * droite comme une liste.
 *
 * ⚠️ **L'ordre du tableau est l'ordre de peinture.** Le second rang vient en premier pour
 * passer derriere le premier ; aucun `z-index` n'est necessaire entre eux.
 */
/** Le nom proposé dans le champ, et retenu si l'on n'en donne pas d'autre. Voir `nomRetenu`. */
const NOM_PAR_DEFAUT = "Portefeuille principal";

const PLACES = [
  /* Le fond. */
  { x: -136, y: 9, taille: 24, recul: 0.87, retard: 580 },
  { x: -70, y: 1, taille: 29, recul: 0.81, retard: 460 },
  { x: 140, y: 11, taille: 28, recul: 0.84, retard: 520 },
  /* Le premier rang. */
  { x: -45, y: 23, taille: 44, recul: 0.54, retard: 80 },
  { x: 55, y: 16, taille: 46, recul: 0.46, retard: 160 },
  { x: -95, y: 38, taille: 36, recul: 0.72, retard: 240 },
  { x: 95, y: 31, taille: 42, recul: 0.62, retard: 320 },
];

/**
 * La hauteur du cadre de la grappe.
 *
 * ⚠️ **Cent pixels, et l'éventail de dossiers en demande 148.** Les deux objets n'ont pas la
 * même stature : une grappe de têtes rondes tient dans cent, des dossiers dressés de 176 de
 * large en font 98 à eux seuls et leurs voisins basculés dépassent encore. Une hauteur unique
 * aurait rogné l'un ou vidé l'autre. Voir `HAUTEUR_EVENTAIL`, dans `EventailDossiers`.
 */
const HAUTEUR_GRAPPE = 100;

/**
 * La tete du centre.
 *
 * ⚠️ **Descendue de douze pixels pour degager le fond.** Elle partait du haut du cadre, ce
 * qui ne laissait rien au-dessus d'elle ; le second rang doit depasser de ses epaules, sinon
 * il n'est pas derriere, il est a cote.
 */
const CENTRE = { y: 12, taille: 76 };


/**
 * Une tête, éventuellement enfoncée dans le fond.
 *
 * ⚠️ **Le recul est peint sur la silhouette, pas posé en `opacity`.** C'est la correction
 * qu'on venait de faire aux dossiers, et les têtes avaient exactement le même défaut :
 * effacées par une opacité d'enveloppe, elles laissaient voir au travers celles qu'elles
 * recouvraient et la carte derrière. Une tête d'arrière-plan doit être **sombre**, pas
 * transparente.
 *
 * ⚠️ **Le voile emprunte le contour à l'avatar lui-même.** `contourDeForme` rend le tracé de
 * la silhouette portée : le voile épouse donc la goutte, l'étoile ou le nuage, là où un
 * rectangle posé par-dessus aurait assombri un carré autour de la tête.
 *
 * ⚠️ **Et il prend la couleur du fond, jamais du noir.** En thème clair, un voile noir
 * salirait la tête au lieu de l'éloigner ; `--nv-fond-rvb` la fait s'enfoncer dans la page
 * quelle que soit celle-ci.
 */
function Tete({
  taille, couleur, forme, recul = 0,
}: { taille: number; couleur: string; forme: FormeAvatar; recul?: number }) {
  return (
    <div style={{ position: "relative", width: taille, height: taille }}>
      <AvatarNovac taille={taille} couleur={couleur} forme={forme} suivi={false} />
      {recul > 0 && (
        <svg viewBox="-100 -100 200 200" width={taille} height={taille} aria-hidden="true"
          style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none" }}>
          <path d={contourDeForme(forme)} fill={`rgba(var(--nv-fond-rvb), ${recul})`} />
        </svg>
      )}
    </div>
  );
}

export default function PanneauCreation({ onFermer }: { onFermer: () => void }) {
  const router = useRouter();
  const { setActivePortfolio } = useApp();

  /**
   * L'étape en cours.
   *
   * ⚠️ **Trois temps, et l'ordre est celui du modèle, pas de l'interface.** Une opération se
   * range dans un compte, un compte appartient à un portefeuille : l'API elle-même l'impose —
   * `/portfolios/{id}/comptes`, puis `/comptes/{id}/operations`. Rien ne peut exister avant
   * son parent, et un formulaire qui prétendrait le contraire mentirait sur la nature des
   * choses.
   *
   * ⚠️ **La version d'avant proposait la première opération à plat, sans compte.** Elle
   * exploitait la dispense de `TransactionModal` — le compte n'est exigé que sur le chemin
   * qui écrit en base — puis envoyait quand même l'écriture. Celle-ci retombait donc dans le
   * classement par déduction, celui que le code décrit comme « incapable de distinguer deux
   * PEA » : la toute première opération du portefeuille était, par construction, la plus mal
   * rangée de toutes. Relevé à l'usage.
   */
  const [etape, setEtape] = useState<1 | 2 | 3>(1);

  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(COULEUR_PAR_DEFAUT);
  const [forme, setForme] = useState<FormeAvatar>(FORME_PAR_DEFAUT);
  const [brouillonCompte, setBrouillonCompte] = useState<SaisieCompte | null>(null);
  /**
   * La couleur du dossier en cours de déclaration, pour l'aperçu en tête.
   *
   * ⚠️ **Partie du même défaut que celle du formulaire**, faute de quoi l'aperçu montrerait
   * une autre teinte que la rangée tant qu'on n'y a pas touché.
   */
  const [couleurCompte, setCouleurCompte] = useState(COULEURS_DOSSIER[0].hex);
  const [brouillon, setBrouillon] = useState<DraftTx | null>(null);
  const [genres, setGenres] = useState<GenreCompte[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /**
   * Le temps interne du formulaire de compte, remonté par lui.
   *
   * ⚠️ **Le parcours a quatre écrans, pas trois.** La déclaration d'un compte en occupe deux
   * — ce qu'il est, puis d'où viennent ses opérations — et le fil restait sur la deuxième
   * puce pendant qu'on passait de l'un à l'autre. On avançait sans que rien ne bouge, ce
   * qu'un indicateur de progression existe précisément pour éviter.
   */
  const [tempsCompte, setTempsCompte] = useState<1 | 2>(1);

  /**
   * ⚠️ **Fermer après quatre écrans de saisie ne doit pas tenir à un clic à côté.** Le voile
   * referme au clic, Échap aussi, et rien n'était retenu : un geste de trop effaçait le nom,
   * l'avatar, le compte et l'opération. Relevé en parcourant le panneau.
   *
   * ⚠️ **La garde ne se déclenche que s'il y a quelque chose à perdre.** Fermer un panneau
   * qu'on vient d'ouvrir sans rien y écrire doit rester immédiat — une confirmation
   * systématique s'apprend à ignorer, et c'est alors qu'elle cesse de protéger.
   */
  const aQuelqueChoseASauver = nom.trim().length > 0 || brouillonCompte != null
    || brouillon != null || etape > 1;
  const [confirmeSortie, setConfirmeSortie] = useState(false);
  const demanderFermeture = () => {
    if (!aQuelqueChoseASauver || confirmeSortie) { onFermer(); return; }
    setConfirmeSortie(true);
  };

  /**
   * Le rang dans le parcours, sur quatre — voir le fil de progression plus bas.
   *
   * ⚠️ **L'étape 2 en occupe deux**, puisque le formulaire de compte a ses propres temps.
   * Les rangs 2 et 3 sont donc les deux faces d'une même étape, et le rang 4 est l'opération.
   */
  const rang = etape === 1 ? 1 : etape === 2 ? (tempsCompte === 1 ? 2 : 3) : 4;
  const intituleDuRang = rang === 1 ? "Le portefeuille"
    : rang === 2 ? "Le compte"
    : rang === 3 ? "Ses opérations"
    : "La première opération";

  /**
   * Les genres de compte publiés par le serveur.
   *
   * ⚠️ **Chargés à l'ouverture, pas à l'arrivée sur l'étape 2.** Le formulaire ne peut rien
   * proposer tant qu'ils manquent ; les demander au moment où l'on affiche l'étape ferait
   * apparaître une rangée vide qui se remplit sous les doigts. Une requête au montage coûte
   * moins qu'un écran qui bouge.
   */
  useEffect(() => {
    let vivant = true;
    lireGenres().then(g => { if (vivant) setGenres(g); }).catch(() => { /* étape 2 vide */ });
    return () => { vivant = false; };
  }, []);

  /**
   * Le décor, tiré une fois à l'ouverture — il n'a pas à changer à chaque frappe.
   *
   * ⚠️ **Un seul tirage pour les deux dispositions.** Les couleurs et les silhouettes sont
   * prises une fois, puis lues par la grappe comme par l'éventail : retirer au changement
   * d'étape ferait repeindre tout le décor à chaque aller-retour, et l'on croirait avoir
   * changé quelque chose.
   */
  /**
   * Ce que porte le fond : tire une fois a l'ouverture, et plus jamais touche.
   *
   * ⚠️ **Deux regles s'excluaient, et celle-ci l'emporte : le fond ne bouge pas.** On a
   * d'abord voulu qu'aucun satellite ne porte la silhouette du centre. Mais il n'existe que
   * huit formes pour sept places plus le centre : la seule facon de garantir l'unicite est de
   * **deplacer une tete du fond** des que le centre prend la sienne. Trois versions l'ont
   * tente — un filtre qui decalait tout, une doublure qui faisait changer deux tetes, une
   * attribution persistante qui n'en changeait plus qu'une. Aucune ne pouvait descendre a
   * zero, et zero est ce qui est demande : **les avatars derriere ne sont pas modifiables,
   * ils n'ont donc aucune raison de se modifier.**
   *
   * ⚠️ **Ce qu'on accepte en echange.** Quand le centre prend une silhouette qu'un satellite
   * porte deja, le doublon se voit. Il ne concerne qu'une tete sur sept, souvent voilee a 80 %
   * au fond de l'image, et il ne bouge pas : c'est moins couteux qu'un decor qui se
   * reorganise sous les doigts a chaque essai.
   *
   * ⚠️ **Les satellites restent mutuellement uniques**, eux, et sans effort : le tirage vide sa
   * reserve avant de la reconstituer, et sept places puisent dans huit formes.
   *
   * ⚠️ **Deux lots de couleurs et non un seul.** Le centre de l'etape 1 et celui de l'etape 2
   * ne portent pas la meme teinte ; un lot partage aurait fait tirer les memes couleurs aux
   * tetes et aux dossiers, ce qui se remarque en passant de l'une a l'autre.
   */
  const [fond] = useState(() => ({
    formes: tirage(FORMES_AVATAR, PLACES.length),
    couleursTetes: tirage(COULEURS_AVATAR, PLACES.length).map(c => c.hex),
    couleursDossiers: couleursDeFond(),
  }));


  /**
   * Le nom retenu : celui qu'on a tapé, ou celui qui était proposé.
   *
   * ⚠️ **L'invite du champ était une suggestion qu'on refusait ensuite.** « Portefeuille
   * principal » s'affichait en gris et « Suivant » restait inerte tant qu'on n'avait rien
   * frappé : on montrait une valeur acceptable puis on exigeait de la retaper. Relevé en
   * parcourant le panneau. Elle devient un vrai défaut — au sens de valeur par défaut —, si
   * bien que l'étape peut se franchir sans rien saisir.
   *
   * ⚠️ **Une seule constante pour l'invite et pour le défaut.** Les avoir écrites en deux
   * endroits aurait laissé le champ proposer un nom et le panneau en enregistrer un autre le
   * jour où l'un des deux change.
   */
  const nomRetenu = nom.trim() || NOM_PAR_DEFAUT;

  /**
   * Créer le portefeuille, son premier compte, sa première opération — dans cet ordre.
   *
   * ⚠️ **Rien ne part avant le bouton final.** Les trois saisies vivent en brouillon jusque
   * là : `FormulaireCompte` ne connaît pas le réseau — il rend une saisie et la remonte — et
   * `TransactionModal` sait faire de même par `onDraft`. Les deux composants avaient déjà ce
   * mode ; il n'y avait qu'à les enchaîner.
   *
   * ⚠️ **La session se vérifie *avant* d'écrire quoi que ce soit, et c'est une leçon déjà
   * apprise ailleurs.** `/build` porte ce commentaire : « La création d'un portefeuille ne
   * demande pas de jeton, l'écriture des transactions si. Enchaîner les deux sans contrôle
   * laissait un portefeuille vide derrière chaque échec d'authentification, et il fallait le
   * découvrir au dernier écran. » Ce panneau avait refait exactement cette erreur — la route
   * des portefeuilles accepte une requête sans jeton, si bien qu'un visiteur non connecté
   * repartait avec un portefeuille orphelin et une opération refusée.
   *
   * ⚠️ **L'apparence ne peut s'écrire qu'après la création, et c'est structurel.** Couleur et
   * silhouette sont rangées dans le stockage local **sous l'identifiant du portefeuille** —
   * voir `useCouleurAvatar`. Cet identifiant n'existe pas tant que le serveur ne l'a pas
   * rendu : les choix faits ici vivent donc en mémoire jusqu'à la réponse.
   *
   * ⚠️ **Un échec en fin de chaîne n'annule pas ce qui précède, il le dit.** Le portefeuille
   * est créé, nommé, coloré : le perdre parce qu'une écriture est refusée coûterait plus que
   * de l'ouvrir tel quel. On ouvre, et le message nomme l'étape qui a manqué.
   */
  async function creer() {
    if (envoi) return;
    if (!jeton()) {
      setErreur("Connectez-vous pour créer un portefeuille.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch(`${API_URL}/api/v1/portfolios`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...enTetesAuth() },
        body: JSON.stringify({
          name: nomRetenu, assets: [], color: couleur,
          /**
           * ⚠️ **Toujours un portefeuille réel, et c'est une décision.** `/build` propose la
           * bascule « réel ou simulation » et la garde : une simulation est une allocation
           * cible qu'on éprouve, c'est-à-dire précisément ce que cette page-là compose. Ce
           * panneau-ci sert le geste court — déclarer ce qu'on possède — et n'a pas à porter
           * les deux parcours. Écrit en dur, donc, mais pas par omission.
           */
          total_value: null, is_simulation: false,
        }),
      });
      if (!reponse.ok) {
        setErreur(reponse.status === 401
          ? "Session expirée — reconnectez-vous."
          : "La création a échoué. Réessayez.");
        setEnvoi(false);
        return;
      }
      const portefeuille = await reponse.json();
      const id = String(portefeuille.id);

      try {
        localStorage.setItem(cleCouleur(id), couleur);
        localStorage.setItem(cleForme(id), forme);
      } catch {
        // Stockage refusé — navigation privée, réglage strict. L'avatar retombera sur
        // ses valeurs par défaut, ce qui n'empêche pas le portefeuille d'exister.
      }

      const ouvrir = (avertissement?: string) => {
        /* ⚠️ L'identifiant est gardé en chaîne pour les routes et les clés de stockage,
           mais le contexte de l'application le veut numérique. Une seule conversion, ici. */
        setActivePortfolio({ id: portefeuille.id, name: nomRetenu, assets: [], color: couleur });
        if (avertissement) setErreur(avertissement);
        router.push("/portfolio");
      };

      if (!brouillonCompte) { ouvrir(); return; }

      let compteCree;
      try {
        compteCree = await creerCompte(id, brouillonCompte);
      } catch {
        ouvrir("Le portefeuille est créé, mais son compte n'a pas pu l'être.");
        return;
      }

      if (brouillon) {
        const r = await fetch(`${API_URL}/api/v1/portfolios/${id}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...enTetesAuth() },
          body: JSON.stringify({
            ticker: brouillon.ticker, asset_type: brouillon.asset_type,
            side: brouillon.side, quantity: brouillon.quantity,
            unit_price: brouillon.unit_price, fees: brouillon.fees,
            executed_at: brouillon.executed_at, note: brouillon.note ?? null,
            /* ⚠️ Le compte qu'on vient de créer, et toute la raison du fil en trois temps :
               sans lui, l'écriture retombe dans le classement par déduction. */
            compte_id: compteCree.id,
          }),
        }).catch(() => null);
        if (!r || !r.ok) {
          ouvrir("Le portefeuille et son compte sont créés ; l'opération, non.");
          return;
        }
      }
      ouvrir();
    } catch {
      setErreur("Serveur injoignable.");
      setEnvoi(false);
    }
  }

  return (
    <FenetreModale onFermer={demanderFermeture}
      etiquette="Créer un portefeuille"
      /* ⚠️ `relative` pour la croix ci-dessous, qui se pose dans l'angle de la carte. */
      style={{ position: "relative" }}>

      {/**
        * ⚠️ **La croix vit sur le panneau, et non sur la troisième étape.** Demandé pour que
        * l'écran « Nouvelle transaction » d'ici ressemble à celui du tableau de bord, qui en
        * porte une. Mais posée sur cette seule étape, elle serait apparue au dernier moment
        * d'un parcours en trois temps, là où l'on est le moins susceptible d'abandonner.
        * Portée par la fenêtre, elle est là dès le premier écran — et c'est bien le panneau
        * qu'elle referme, pas la saisie qu'il contient.
        *
        * ⚠️ **Elle ne remplace pas « Annuler ».** Le pied dit ce qu'on quitte et à quel prix ;
        * la croix est la sortie qu'on cherche des yeux dans un angle, sans lire. Les deux
        * gestes cohabitent dans toutes les fenêtres qui en valent la peine.
        */}
      {/* ⚠️ 18 et 20 : le rembourrage de `Cadre`, donc le bord exact du contenu. Elle était
          à 14/16 et dépassait de quatre pixels la pilule « Vente » juste en dessous —
          assez pour qu'on voie deux verticales au lieu d'une. Relevé à l'usage. */}
      <div style={{ position: "absolute", top: 18, right: 20, zIndex: 3 }}>
        <BoutonFermer onClick={demanderFermeture} titre="Fermer sans créer" />
      </div>

      {/**
        * La grappe : quelques avatars réunis, dont celui qu'on est en train de composer.
        *
        * ⚠️ **Le centre n'est pas du décor, c'est l'aperçu.** Les quatre autres sont tirés au
        * hasard et voilés ; celui du milieu porte la couleur et la silhouette choisies plus
        * bas, en grand et vivant. Une illustration qui ne montrerait pas le choix en cours
        * obligerait à régler à l'aveugle — c'est le reproche déjà fait au panneau de réglage
        * quand l'avatar y restait à trente-huit pixels dans un coin.
        *
        * ⚠️ **Les satellites vivent, alors qu'ils étaient figés — et c'est une erreur
        * corrigée.** Je les avais posés en `vivant={false}` en reprenant l'argument de la
        * grille des huit silhouettes : « huit têtes qui clignent chacune de son côté attirent
        * l'œil sur le choix qu'on n'a pas fait ». **Ici personne ne choisit un satellite.**
        * L'argument valait pour un sélecteur, il ne vaut pas pour une illustration, et une
        * assemblée immobile n'est pas une assemblée.
        *
        * ⚠️ **Vivants, mais `suivi={false}` : seul le centre répond au curseur.** Ils l'ont
        * suivi un temps, l'idée étant que cinq têtes se tournant ensemble font une assemblée
        * qui vous remarque. À l'écran c'est l'inverse qui se produit : le mouvement d'ensemble
        * emporte le regard partout à la fois, et la tête qu'on est en train de composer — la
        * seule qui ait quelque chose à dire — se noie dans son propre décor. Demandé à
        * l'usage de n'en laisser réagir qu'une.
        *
        * Ils gardent leur vie propre : clignement, dérive lente, roulis. Ils sont animés sans
        * être attentifs — ce qui est exactement l'attitude d'un groupe autour de quelqu'un
        * qu'on regarde.
        *
        * ⚠️ **`suivi` et `vivant` ne sont pas symétriques.** Couper `suivi` laisse la vie
        * tourner et ramène simplement la cible du regard à zéro. Couper `vivant`, en revanche,
        * arrête la boucle entière — `if (!anime || !vivant) return` — donc le suivi avec, même
        * demandé. La documentation du composant ne décrit que le premier sens et laisse croire
        * que les deux se règlent séparément.
        */}
      {/**
        * ⚠️ **Pas d'illustration à la troisième étape, et ce n'est pas qu'une question de
        * place.** Les deux premières composent un objet — un avatar, un dossier — dont le
        * centre de l'image est l'aperçu. Une opération n'est pas un objet qu'on dessine :
        * elle n'a ni couleur ni silhouette, et l'éventail de dossiers qu'on y montrait
        * illustrait l'étape précédente. Le formulaire est ici son propre sujet.
        *
        * ⚠️ **Et cela règle le défilement.** La saisie d'opération est longue — sens, actif,
        * quantité, date, prix, frais, note, total — et les 148 pixels de l'éventail poussaient
        * l'ensemble contre le plafond de 90 % de hauteur d'écran. Signalé à l'usage : la page
        * défilait. Retirer ce qui n'y avait pas sa place suffisait.
        *
        * ⚠️ `flexShrink: 0` : la carte de `FenetreModale` est une colonne flexible plafonnée
        * à 90 % de la hauteur d'écran. Sans cela, un contenu qui grandit **rétrécit les
        * enfants à hauteur fixe** — la grappe passait de 104 pixels à une quarantaine et les
        * têtes venaient chevaucher l'intitulé du champ en dessous. Constaté à l'écran,
        * invisible tant que le panneau reste court.
        */}
      {/**
        * ⚠️ **Deux illustrations, une par objet composé — et la seconde vit ailleurs.**
        * L'éventail de dossiers est celui de la déclaration d'un compte, laquelle s'ouvre
        * aussi seule depuis le tableau de bord : le garder ici l'aurait réservé à cette
        * fenêtre. Il est donc passé dans `EventailDossiers`, et les deux vues du formulaire
        * portent la même tête. La grappe d'avatars, elle, n'appartient qu'au portefeuille et
        * reste ici.
        */}
      {etape === 2 && (
        <EventailDossiers couleur={couleurCompte} couleursFond={fond.couleursDossiers} />
      )}

      {/**
        * ⚠️ **Pas d'illustration à la troisième étape, et ce n'est pas qu'une question de
        * place.** Les deux premières composent un objet — un avatar, un dossier — dont le
        * centre de l'image est l'aperçu. Une opération n'est pas un objet qu'on dessine :
        * elle n'a ni couleur ni silhouette, et l'éventail de dossiers qu'on y montrait
        * illustrait l'étape précédente. Le formulaire est ici son propre sujet.
        *
        * ⚠️ **Et cela règle le défilement.** La saisie d'opération est longue — sens, actif,
        * quantité, date, prix, frais, note, total — et les 148 pixels de l'éventail poussaient
        * l'ensemble contre le plafond de 90 % de hauteur d'écran. Signalé à l'usage : la page
        * défilait. Retirer ce qui n'y avait pas sa place suffisait.
        *
        * ⚠️ `flexShrink: 0` : la carte de `FenetreModale` est une colonne flexible plafonnée
        * à 90 % de la hauteur d'écran. Sans cela, un contenu qui grandit **rétrécit les
        * enfants à hauteur fixe** — la grappe passait de 104 pixels à une quarantaine et les
        * têtes venaient chevaucher l'intitulé du champ en dessous. Constaté à l'écran,
        * invisible tant que le panneau reste court.
        */}
      {etape === 1 && <div aria-hidden="true" style={{
        position: "relative", flexShrink: 0, marginBottom: 2,
        height: HAUTEUR_GRAPPE, overflow: "hidden",
      }}>
        {/**
          * ⚠️ **Deux div par tête, et le partage n'est pas arbitraire.** L'extérieur porte la
          * place, l'intérieur l'arrivée : `nv-arrivee-tete` anime `transform` et `opacity`,
          * et une seule enveloppe ferait écraser le `translateX` du placement par celui de
          * l'animation. C'est le défaut classique d'un `transform` qui sert à deux choses.
          *
          * ⚠️ **L'opacité de destination est portée par l'enveloppe**, pas par l'animation :
          * chaque tête a la sienne — de 0,28 à 0,52 selon l'éloignement — et une image-clé
          * commune ne peut pas les connaître. Elle va donc de 0 à 1, et se multiplie par le
          * voile du parent.
          *
          * ⚠️ **Chaque satellite garde sa propre silhouette : ce sont des aperçus.** Ils ont
          * porté un moment celle du centre, pour calmer une image jugée désordonnée — mais
          * c'était traiter le mauvais coupable. Le désordre venait des places irrégulières sur
          * deux rangs et de l'opacité qui les rendait translucides, pas de la variété des
          * formes. Uniformiser les contours coûtait la seule chose que ces têtes apprennent :
          * qu'il existe autre chose que celle qu'on a choisie. Redemandé à l'usage.
          */}
        {PLACES.map((place, i) => (
          <div key={i} style={{
            position: "absolute", left: "50%", top: place.y,
            transform: `translateX(calc(-50% + ${place.x}px))`,
          }}>
            <div className="nv-arrivee-tete" style={{ animationDelay: `${place.retard}ms` }}>
              <Tete taille={place.taille} couleur={fond.couleursTetes[i]}
                forme={fond.formes[i]} recul={place.recul} />
            </div>
          </div>
        ))}
        {/**
          * ⚠️ **Le centre montre ce que l'étape compose**, et arrive le premier : c'est autour
          * de lui que le groupe se forme. L'illustration cesse ainsi d'être un décor pour
          * devenir l'aperçu de ce qu'on est en train de faire. Demandé à l'usage.
          *
          * ⚠️ **Et c'est cet aperçu qui autorise la bande de couleurs sans marque de
          * sélection.** La rubrique n'a pas à désigner la teinte retenue, puisque le centre de
          * la grappe la porte en grand, juste au-dessus.
          */}
        <div style={{
          position: "absolute", zIndex: 1,
          top: CENTRE.y, left: "50%", transform: "translateX(-50%)",
        }}>
          <div className="nv-arrivee-tete">
            <AvatarNovac taille={CENTRE.taille} couleur={couleur} forme={forme}
              titre={nomRetenu} />
          </div>
        </div>
      </div>}

      {etape === 1 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={etiquette} htmlFor="nv-nom-portefeuille">Nom du portefeuille</label>
            <input id="nv-nom-portefeuille" className="novac-surface-saisie" style={champ}
              value={nom} onChange={e => setNom(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") setEtape(2); }}
              placeholder={NOM_PAR_DEFAUT} autoFocus maxLength={60} />
          </div>

          <Reglage titre="Couleur">
            <ChoixCouleur couleur={couleur} onChoisir={setCouleur} />
          </Reglage>

          <Reglage titre="Silhouette">
            <ChoixSilhouette forme={forme} onChoisir={setForme} couleur={couleur} />
          </Reglage>
        </>
      )}

      {/**
        * ⚠️ **La déclaration de compte de l'application, en brouillon.** `FormulaireCompte`
        * ne sait rien du réseau : il rend une saisie et la remonte par `onEnregistrer`. Il
        * sert déjà à déclarer un compte qui n'existe pas encore ; il n'y avait rien à
        * adapter. Un formulaire abrégé écrit ici aurait donné deux façons de déclarer un
        * compte, qui auraient divergé au premier ajout de genre.
        *
        * ⚠️ **Son `onFermer` recule d'une étape au lieu de refermer le panneau.** Ce qu'il
        * appelle « fermer » est ici « revenir », puisqu'il n'est plus une fenêtre mais une
        * étape.
        */}
      {etape === 2 && (
        <FormulaireCompte
          integre
          genres={genres}
          onCouleur={setCouleurCompte}
          prerempli={brouillonCompte ?? undefined}
          titre="Le premier compte"
          mention="Il recevra la première opération. Vous pourrez en déclarer d'autres ensuite."
          enCours={false}
          erreur={null}
          onEtape={setTempsCompte}
          sortie={tempsCompte === 1 && (
            <button type="button" onClick={creer} disabled={envoi} style={boutonSecondaire}
              className="novac-lisere novac-bouton-doux" ref={ancrerLisere}>
              {envoi ? "Création…" : "Créer sans compte"}
            </button>
          )}
          onEnregistrer={saisie => { setBrouillonCompte(saisie); setEtape(3); }}
          onFermer={() => setEtape(1)} />
      )}

      {/**
        * ⚠️ **La saisie remonte a chaque frappe, elle ne se confirme plus.** Avec `onDraft`,
        * l'ecriture ne partait qu'au clic sur « Acheter » — un bouton qui voisinait avec
        * « Creer le portefeuille ». Remplir l'operation puis conclure directement, le geste
        * evident, creait le portefeuille et son compte et **jetait l'ecriture**. Verifie en
        * base apres un essai : portefeuille neuf, un compte, zero transaction.
        *
        * ⚠️ **Un seul bouton principal a l'ecran, celui du panneau.** C'est la meme correction
        * qu'a l'etape du compte, ou le pied de page faisait double emploi avec la navigation
        * du formulaire.
        *
        * ⚠️ **Un commentaire ne peut pas ouvrir le corps d'un `&&`.** Pose entre la parenthese
        * et l'element, il compte comme une seconde expression et la compilation s'arrete. Il
        * remonte donc au-dessus de la condition — le defaut que ce fichier a deja rencontre
        * dans la grille d'actifs.
        */}
      {etape === 3 && (
        <TransactionModal
          isOpen embedded hideClose
          nomCompte={brouillonCompte?.nom}
          initialDraft={brouillon}
          onBrouillonVivant={setBrouillon}
          onSuccess={() => { /* sans objet : plus de bouton de validation dans le formulaire */ }}
          onClose={() => setEtape(2)} />
      )}

      {erreur && (
        <span style={{ fontFamily: FONT, fontSize: 12, color: CLAIR.negatif }}>{erreur}</span>
      )}

      {/**
        * Le fil des étapes, et la navigation.
        *
        * ⚠️ **Le fil dit où l'on en est, il ne sert pas à sauter.** Les puces sont
        * décoratives : on ne peut pas atterrir sur l'opération sans être passé par le compte,
        * puisque c'est lui qui la recevra. Les rendre cliquables aurait promis une liberté
        * que le modèle refuse.
        *
        * ⚠️ **Passer l'étape 2 ferme l'étape 3, et c'est la règle rendue visible.** Pas de
        * compte, pas d'opération. On crée alors un portefeuille vide — un état parfaitement
        * légitime, que la page des transactions sait déjà afficher et commenter.
        */}
      {/**
        * ⚠️ **La garde s'annonce là où l'erreur s'annonce**, juste au-dessus du pied : c'est
        * l'endroit que l'œil vient déjà consulter quand un bouton ne fait pas ce qu'on
        * attendait. Un second emplacement pour un second genre de message aurait fait deux
        * endroits à surveiller.
        */}
      {confirmeSortie && (
        <span style={{ fontFamily: FONT, fontSize: 11.5, color: CLAIR.texteSecondaire }}>
          Fermer maintenant abandonnera ce qui est saisi. Refermez pour confirmer.
        </span>
      )}

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginTop: 4,
      }}>
        {/**
          * ⚠️ **Quatre positions, parce qu'il y a quatre écrans.** Elles étaient trois et la
          * deuxième couvrait à elle seule les deux temps du formulaire de compte : le fil
          * restait immobile pendant qu'on avançait. Le rang se calcule donc à partir de
          * l'étape *et* du temps interne remonté par le formulaire.
          *
          * ⚠️ **L'intitulé nomme le temps, pas seulement l'étape.** « Le premier compte »
          * s'affichait deux écrans de suite, mot pour mot ; « ce qu'il est » puis « ses
          * opérations » disent lequel des deux on regarde.
          */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }} aria-hidden="true">
          {([1, 2, 3, 4] as const).map(n => (
            <span key={n} style={{
              width: n === rang ? 18 : 6, height: 6, borderRadius: RAYONS.plein,
              background: n === rang ? assombrirPourBlanc(couleur)
                : n < rang ? CLAIR.texteAttenue : CLAIR.bord,
              transition: "width 200ms ease, background 200ms ease",
            }}/>
          ))}
          <span style={{
            fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible, marginLeft: 4,
          }}>
            {intituleDuRang}
          </span>
        </div>

        {/**
          * ⚠️ **L'étape 2 n'a pas de bouton d'avancement, et c'est voulu.** `FormulaireCompte`
          * porte sa propre navigation — « Annuler » et « Continuer » — parce qu'il a lui-même
          * deux temps internes : le compte, puis ce qu'on y met. Doubler cette navigation
          * dans le pied du panneau donnait quatre boutons sur deux rangées, dont deux
          * primaires qui ne faisaient pas la même chose. Constaté à l'écran. Le panneau ne
          * garde donc, à cette étape, que la sortie que le formulaire ne propose pas : passer.
          */}
        {/**
          * ⚠️ **« Passer » est une sortie, pas un avancement : il rejoint donc la gauche.** Il
          * était posé à droite, à la place du bouton qui fait avancer, et il *écrivait tout*
          * — alors que « Créer le compte », juste à côté, n'écrivait rien. Les deux verbes
          * étaient inversés et les deux places aussi. Relevé en parcourant le panneau.
          *
          * ⚠️ **Et seulement au premier temps du compte.** Sur le second, le formulaire est
          * déjà rempli : proposer de passer y revient à proposer de jeter ce qu'on vient de
          * saisir, sans le dire.
          */}
        <div style={{ display: "flex", gap: 8 }}>
          {etape !== 2 && (
            <button type="button" style={boutonSecondaire} className="novac-lisere novac-bouton-doux" ref={ancrerLisere}
              onClick={() => (etape === 1 ? demanderFermeture() : setEtape(2))}>
              {etape === 1 ? "Annuler" : "Retour"}
            </button>
          )}

          {/**
            * ⚠️ **Une seule commande à droite, dont le libellé dit l'étape suivante.** Deux
            * boutons — « Passer » et « Créer » — auraient posé la même question deux fois à
            * chaque étape. Ici, avancer et conclure sont le même geste : on avance tant qu'il
            * reste quelque chose à dire, on conclut dès qu'on n'a plus rien à ajouter.
            *
            * ⚠️ **Le bouton porte la couleur choisie, mais assombrie.** Telle quelle elle
            * serait illisible : le citron `#D8E63C` sous un libellé blanc donne un contraste
            * de 1,4 pour 1, très en deçà des 4,5 exigés. `assombrirPourBlanc` la descend
            * jusqu'au seuil sans changer sa teinte, comme le fait déjà la pilule d'ajout.
            */}
          {etape === 1 && (
            <button type="button" onClick={() => setEtape(2)} className="novac-lisere novac-bouton-plein" ref={ancrerLisere}
              style={boutonPrincipal(assombrirPourBlanc(couleur))}>
              Suivant
            </button>
          )}
          {etape === 3 && (
            <button type="button" onClick={creer} disabled={envoi} className="novac-lisere novac-bouton-plein" ref={ancrerLisere}
              style={boutonPrincipal(assombrirPourBlanc(couleur), !envoi)}>
              {envoi ? "Création…" : "Créer le portefeuille"}
            </button>
          )}
        </div>
      </div>

    </FenetreModale>
  );
}
