"use client";
import { useEffect, useState } from "react";

import type { Compte, CompteASoumettre, GenreCompte } from "@/lib/comptes";
import FenetreModale from "@/components/ui/FenetreModale";
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

/* Le vocabulaire des formulaires est partagé : voir `@/components/ui/saisie`. */
import {
  etiquette, champ, RAYON_SAISIE, boutonPrincipal, boutonSecondaire,
} from "@/components/ui/saisie";
import { ancrerLisere } from "@/components/ui/lisere";
import BoutonFermer from "@/components/ui/BoutonFermer";
import EventailDossiers from "@/components/portfolio/EventailDossiers";




/**
 * Qui tiendrait le compte, si la reprise automatique existait.
 *
 * ⚠️ **Un mot par genre, et rien de plus.** La phrase entière n'est pas dupliquée ici : seuls
 * changent le titre du bloc et le nom de l'organisme. Recopier la phrase aurait fait huit
 * variantes à maintenir, dont sept se seraient figées au premier ajustement du texte.
 *
 * ⚠️ **Le repli couvre les genres inconnus**, et il le fera pour les prochains : « votre
 * établissement » est vrai de tous, banque, courtier, assureur ou plateforme. Un genre ajouté
 * sans être noté ici dira donc quelque chose de correct, au lieu de parler de banque à tort —
 * ce qui est précisément le défaut qu'on corrige.
 */
const TENEUR: Record<string, { titre: string; organisme: string }> = {
  courant: { titre: "Synchronisation bancaire", organisme: "votre banque" },
  epargne: { titre: "Synchronisation bancaire", organisme: "votre banque" },
  pea:     { titre: "Connexion au courtier", organisme: "votre courtier" },
  cto:     { titre: "Connexion au courtier", organisme: "votre courtier" },
  av:      { titre: "Connexion à l’assureur", organisme: "votre assureur" },
  per:     { titre: "Connexion à l’assureur", organisme: "votre assureur" },
  pee:     { titre: "Connexion au teneur de compte", organisme: "votre teneur de compte" },
  crypto:  { titre: "Connexion à la plateforme", organisme: "votre plateforme d’échange" },
};
const TENEUR_PAR_DEFAUT = {
  titre: "Synchronisation automatique", organisme: "votre établissement",
};

export default function FormulaireCompte({
  genres, initial, prerempli, titre, mention, enCours, erreur,
  onEnregistrer, onSupprimer, onFermer, integre = false, onCouleur, onEtape, sortie,
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
  /**
   * Rendu **intégré** : le formulaire s'affiche dans le flux au lieu de flotter au-dessus
   * d'un voile.
   *
   * ⚠️ **Il manquait, et cela s'est vu au premier appelant qui n'était pas une fenêtre.** Le
   * panneau de création enchaîne trois étapes — le portefeuille, le premier compte, la
   * première opération — dans une seule fenêtre. Posé tel quel, ce formulaire ouvrait sa
   * *propre* `FenetreModale` par-dessus : une modale dans une modale, avec deux voiles, et
   * l'étape du panneau restait vide puisque le contenu était parti dans un autre portail.
   *
   * ⚠️ **C'est exactement le mode `embedded` de la saisie d'opération**, et pour la même
   * raison. Deux formulaires qui servent le même geste à deux endroits doivent pouvoir se
   * poser des deux façons ; la solution existait déjà à côté, il n'y avait qu'à la reprendre
   * sous le même nom d'intention.
   *
   * ⚠️ **La croix disparaît avec la fenêtre.** Elle fermait quelque chose qui n'existe plus ;
   * en rendu intégré, c'est l'appelant qui porte la navigation. `onFermer` continue d'être
   * appelé — le panneau de création s'en sert pour reculer d'une étape.
   */
  integre?: boolean;
  /**
   * Signale le temps interne du formulaire — 1 ou 2 — à chaque changement.
   *
   * ⚠️ **Parce que ce formulaire compte pour deux écrans, et que l'appelant l'ignorait.** Le
   * panneau de création affichait trois puces pour quatre écrans : la déclaration d'un compte
   * en occupe deux — ce qu'il est, puis d'où viennent ses opérations —, et le fil de
   * progression restait immobile pendant qu'on avançait. Un indicateur qui ne bouge pas au
   * moment où l'on avance est pire que pas d'indicateur. Relevé en parcourant le panneau.
   */
  onEtape?: (n: 1 | 2) => void;
  /**
   * Une sortie de plus, fournie par l'appelant, posée à gauche avec « Annuler ».
   *
   * ⚠️ **Parce qu'elle se retrouvait sur une seconde rangée.** Le panneau de création offre
   * de conclure sans déclarer de compte ; faute de place ici, il posait ce bouton dans son
   * propre pied, sous celui du formulaire. Résultat : quatre boutons sur deux rangées, dont
   * deux à droite qui ne faisaient pas la même chose — la disposition même qu'un commentaire
   * de ce fichier disait avoir corrigée. Constaté à l'écran.
   *
   * ⚠️ **À gauche, avec les autres sorties.** La droite est réservée à ce qui fait avancer.
   * Une commande qui conclut le parcours n'a rien à y faire, quelle que soit son importance.
   */
  sortie?: React.ReactNode;
  /**
   * Signale la couleur retenue, à chaque changement.
   *
   * ⚠️ **Pour un aperçu que ce formulaire ne porte pas lui-même.** Le panneau de création
   * dessine, en tête, le dossier qu'on est en train de déclarer : il lui faut donc la teinte
   * *pendant* la saisie, et non à l'enregistrement. Sans cela l'aperçu resterait à la couleur
   * par défaut jusqu'au dernier clic — c'est-à-dire jusqu'après le choix.
   *
   * ⚠️ **La couleur seule, et pas l'ensemble de la saisie.** Un rappel à chaque frappe du nom
   * ferait redessiner l'appelant pour une information qu'il ne montre pas. On remonte ce
   * qu'on montre, rien de plus.
   */
  onCouleur?: (hex: string) => void;
}) {
  const correction = initial != null;
  const depart = initial ?? prerempli;
  const [etape, setEtape] = useState<1 | 2>(1);
  /* ⚠️ Signalé par effet et non au clic : le formulaire change de temps à deux endroits —
     « Continuer » et « Retour » —, et un rappel posé sur chacun aurait fini par manquer au
     troisième. */
  useEffect(() => { onEtape?.(etape); }, [etape, onEtape]);
  const [nom, setNom] = useState(depart?.nom ?? "");
  const [genre, setGenre] = useState<string>(depart?.genre ?? "");
  const [couleur, setCouleur] = useState(depart?.couleur ?? COULEURS_DOSSIER[0].hex);
  /**
   * L'argent qu'on met sur le compte en le déclarant.
   *
   * ⚠️ **Le montant se relit en français, avec ses centimes.** `String(12450.8)` rend
   * « 12450.8 » : un point décimal dans une saisie française, et le zéro final envolé. Vu à
   * l'écran après avoir tapé 12450,80. On repasse donc par deux décimales et la virgule —
   * `enregistrer` refait le chemin inverse, et le champ reste modifiable au clavier puisqu'il
   * ne porte aucun séparateur de milliers.
   */
  const [apport, setApport] = useState(
    prerempli?.apport_initial != null
      ? prerempli.apport_initial.toFixed(2).replace(".", ",") : "");
  /**
   * Quand cet argent est arrivé sur le compte.
   *
   * ⚠️ **« Il n'y a pas de depuis quand, juste la date. »** Le mot de l'épargnant, et la
   * refonte tient dedans. On ne demande plus depuis quand un solde vaut ce qu'il vaut —
   * question à laquelle un chiffre ne peut pas répondre — mais à quelle date on apporte
   * ce capital. Exactement ce qu'on demande pour un achat d'actions, et le repère que
   * l'apport laisse sur la courbe est le même.
   *
   * ⚠️ **En date du jour par défaut, jamais vide.** C'est la seule valeur qu'on puisse
   * proposer sans rien inventer, et elle se corrige d'un clic. `toISOString().slice(0, 10)`
   * suffit : le champ est en heure locale et la précision utile est le jour.
   */
  const [apportLe, setApportLe] = useState(
    prerempli?.apport_le?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
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
  const teneur = TENEUR[genre] ?? TENEUR_PAR_DEFAUT;
  /**
   * ⚠️ **L'apport est exigé quand il est toute la valeur du compte.** Un livret déclaré
   * sans un euro ne vaut rien et ne dit rien : la carte porterait un nom et un vide. Sur un
   * compte à titres, en revanche, il reste facultatif — les espèces non investies peuvent
   * être nulles, et surtout on les ignore souvent au moment de déclarer.
   *
   * ⚠️ **Et seulement à la déclaration.** En correction, l'argent ne passe plus par ce
   * formulaire : exiger un montant qu'il n'affiche pas bloquerait le bouton sans rien dire.
   */
  const apportSaisi = apport.trim() !== "" && Number.isFinite(Number(apport.replace(",", ".")));
  const peutContinuer = nomPropre.length > 0 && genre.length > 0
    && (correction || avecTitres || apportSaisi);

  const enregistrer = () => onEnregistrer({
    nom: nomPropre, genre, couleur,
    /**
     * ⚠️ **Un champ vide n'est pas un apport nul.** `parseFloat("")` rend `NaN`, et un zéro
     * posé par défaut ferait déclarer « ce compte est vide » à qui n'a rien saisi. Le serveur
     * distingue les deux ; l'écran doit le lui permettre.
     *
     * ⚠️ **Rien n'est envoyé en correction.** Le serveur ignore ces champs sur un compte
     * existant — l'apport initial n'a de sens qu'au moment de la déclaration — et les
     * envoyer quand même laisserait croire, en lisant ce code, qu'ils peuvent encore agir.
     */
    ...(correction ? {} : {
      apport_initial: apport.trim() === "" ? null : Number(apport.replace(",", ".")),
      apport_le: apport.trim() === "" ? null : `${apportLe}T00:00:00`,
    }),
  });

  const contenu = (
      <>
        {/**
          * ⚠️ **L'éventail de dossiers, le même qu'à la deuxième étape de la création.** Il
          * n'y vivait qu'elle ; cette fenêtre-ci ouvre pourtant le même formulaire depuis le
          * tableau de bord, et s'ouvrait donc sans en-tête. Signalé à l'usage. Le dossier
          * central porte la couleur choisie, si bien que l'illustration est l'aperçu et non un
          * décor — c'est ce qui autorise la bande de couleurs à ne marquer aucune sélection.
          *
          * ⚠️ **Pas en rendu intégré : le panneau de création pose déjà le sien**, et il tient
          * à ce que les dossiers du fond survivent aux allers-retours entre étapes. Deux
          * éventails superposés, en plus, feraient deux illustrations pour un formulaire.
          *
          * ⚠️ **En correction aussi, désormais — et c'est ce qui rend la bande de couleurs
          * utilisable.** Elle en était exclue au motif que la fenêtre de correction était « la
          * plus longue de toutes, puisqu'elle porte en plus le journal de trésorerie », le
          * commentaire d'alors réclamant qu'on mesure avant d'y revenir. Le journal étant
          * parti, la mesure a été faite — voir plus bas.
          *
          * ⚠️ **Sans elle, choisir une couleur ne se voyait nulle part.** La bande ne marque
          * aucune sélection : décision assumée, mais **à la condition, écrite trois lignes
          * plus haut, que l'illustration réponde à sa place**. Privée d'illustration, la
          * correction ne répondait plus qu'en repeignant la pilule du genre et le bouton
          * « Enregistrer » — deux commandes, pas un aperçu. Relevé à l'usage : « les pastilles
          * ne réagissent pas pareil que les autres pages ». La justification et son exception
          * se contredisaient dans le même commentaire, et personne ne l'avait lu jusqu'au bout.
          */}
        {!integre && <EventailDossiers couleur={couleur} />}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: CLAIR.texte }}>
            {titre ?? (correction ? "Modifier le compte"
              : etape === 1 ? "Nouveau compte"
              : avecTitres ? "Les opérations de ce compte" : "La mise à jour du solde")}
          </span>
          {/* ⚠️ La croix vient de `ui/BoutonFermer`. Elle était écrite ici — un « × » nu,
              sans fond ni forme —, tandis que la fenêtre d'opération en dessinait un autre :
              deux croix visiblement différentes dans deux fenêtres qui s'enchaînent. */}
          {!integre && <BoutonFermer onClick={onFermer} titre="Fermer sans enregistrer" />}
        </div>

        {correction || etape === 1 ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={etiquette}>Nom</span>
              <input autoFocus value={nom} onChange={e => setNom(e.target.value)}
                placeholder="PEA Boursorama" maxLength={60} className="novac-surface-saisie" style={champ} />
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
                  /**
                    * ⚠️ **Le choix retenu sort de la surface commune, les autres y restent.**
                    * `novac-surface-saisie` porte le fond gris et les deux liserés ; le
                    * genre choisi les recouvre en ligne — le style en ligne l'emporte sur la
                    * classe — pour prendre la couleur du dossier. C'est ce qui fait qu'un
                    * seul des cinq se détache, sans qu'aucun ne change de forme.
                    */
                  <button key={g.cle} type="button" onClick={() => setGenre(g.cle)}
                    className="novac-surface-saisie"
                    style={{
                      fontFamily: FONT, fontSize: 12, padding: "7px 13px",
                      borderRadius: RAYON_SAISIE, cursor: "pointer",
                      color: genre === g.cle ? "#FFFFFF" : CLAIR.texteSecondaire,
                      fontWeight: genre === g.cle ? 600 : 500,
                      ...(genre === g.cle
                        ? { background: couleur, border: `1px solid ${couleur}` }
                        : {}),
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
              <PastillesCouleur couleur={couleur}
                onChoisir={hex => { setCouleur(hex); onCouleur?.(hex); }} />
            </div>

            {/**
              * ⚠️ **L'argent ne se saisit qu'à la déclaration, et jamais plus ici.**
              * Ce champ réécrivait un solde, et les deux valeurs ont fini par diverger sur
              * cinq comptes sur six — jusqu'à 12 000 € d'écart. Le compte n'ayant plus de
              * solde propre, il n'y a plus rien à réécrire.
              *
              * ⚠️ **Et il n'y a plus, ici, d'endroit où l'argent d'un compte existant se
              * touche.** Le journal de trésorerie tenait ce rôle sous ce formulaire ; il a
              * été retiré à l'usage — « c'est le travail de la page transaction ». Cette
              * page-là *lit* les apports et les mêle aux opérations, mais elle n'en écrit
              * pas encore : tant qu'elle ne le fera pas, corriger un versement passé n'est
              * possible nulle part. C'est su, ce n'est pas un oubli.
              *
              * ⚠️ **Les espèces non investies ne se demandent plus à la déclaration.**
              * Le champ changeait d'étiquette selon le genre — « Apport initial » sur un
              * livret, « Espèces non investies » sur un PEA — et la seconde version a été
              * retirée à l'usage. Elle demandait, au moment de nommer un compte, une somme
              * que personne ne connaît de tête : la poche d'espèces d'un compte à titres
              * n'est pas un montant qu'on décide, c'est ce qui **reste** une fois les achats
              * saisis. La poser en premier obligeait à la deviner, puis à la corriger.
              *
              * ⚠️ **Ce sont les opérations qui répondent, sur un compte à titres.** La poche
              * d'espèces se déduit des achats et des ventes saisis ; il n'y a rien à
              * apporter à l'ouverture qui ne soit démenti au premier ordre enregistré.
              *
              * ⚠️ **L'apport reste, lui, sur les comptes sans titres.** Déclarer un livret à
              * 5 000 €, c'est apporter 5 000 € à une date : le compte n'a pas d'autre
              * contenu, et sans ce champ il naîtrait vide. La question a un sens là, et pas
              * ailleurs — d'où la condition plutôt que deux étiquettes.
              */}
            {!correction && !avecTitres && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={etiquette}>Apport initial</span>
                  <input value={apport} onChange={e => setApport(e.target.value)}
                    inputMode="decimal" placeholder="Ex : 8 400"
                    className="novac-surface-saisie" style={{ ...champ, ...NUM }} />
                  <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue }}>
                    Ce que vous mettez sur ce compte.
                  </span>
                </div>

                {/**
                  * ⚠️ **La date n'apparaît qu'une fois un montant saisi.** Posée à côté
                  * d'un champ vide, elle demanderait quand est arrivée une somme qu'on n'a
                  * pas donnée. Elle surgit à la frappe, là où la question a un sens.
                  *
                  * ⚠️ **« À quelle date » et non « depuis quand ».** C'est le mot de
                  * l'épargnant : on ne demande pas depuis quand un solde vaut ce qu'il
                  * vaut, on demande quand le capital est apporté. Comme pour un achat
                  * d'actions.
                  */}
                {apportSaisi && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={etiquette}>À quelle date</span>
                    <input type="date" value={apportLe}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={e => setApportLe(e.target.value)}
                      className="novac-surface-saisie" style={{ ...champ, ...NUM }} />
                    <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue }}>
                      Cette somme entre dans la courbe de votre patrimoine à cette date, et
                      y laisse un repère. Avant, elle n’y figure pas.
                    </span>
                  </div>
                )}
              </>
            )}
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
                padding: "12px 14px", borderRadius: RAYON_SAISIE,
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
                * intégration entière — un agrégateur, un contrat, des identifiants — et non
                * un réglage. Le dire ici évite qu'on l'attende.
                *
                * ⚠️ **Elle ne parle plus de banque sur un compte qui n'en est pas un.** Le
                * bloc annonçait « Synchronisation bancaire » et « depuis votre banque » quels
                * que soient le genre : sur un compte-titres, un PEA ou un portefeuille crypto,
                * ce n'est pas une banque qu'on brancherait mais un courtier ou une plateforme
                * d'échange. Signalé à l'usage. Le titre et la phrase suivent donc l'organisme
                * qui tiendrait réellement le compte.
                *
                * ⚠️ **Le nom de l'organisme est déduit du genre, pas écrit à côté.** Une
                * seconde table `genre → phrase` aurait divergé de `GENRES_COMPTE` au premier
                * genre ajouté — et il vient précisément d'en arriver trois. `TENEUR` ne porte
                * que le mot manquant ; tout le reste de la phrase est commun, et le repli
                * couvre les genres qu'il ne connaît pas.
                */}
              <div aria-disabled style={{
                padding: "12px 14px", borderRadius: RAYON_SAISIE,
                background: CLAIR.carteCreuse, border: `1px solid ${CLAIR.bord}`,
                opacity: 0.55, cursor: "not-allowed",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
                    {teneur.titre}
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
                  {`${avecTitres ? "Les opérations remonteraient seules" : "Le solde se mettrait à jour seul"}`
                    + ` depuis ${teneur.organisme}. Cela demande une connexion qui n’est pas`
                    + " encore en place."}
                </div>
              </div>
            </div>
          </>
        )}

        {erreur && (
          <span style={{ fontFamily: FONT, fontSize: 11.5, color: CLAIR.negatif }}>{erreur}</span>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/**
            * ⚠️ **Les trois boutons viennent de `ui/saisie`, ils n'étaient plus que recopiés.**
            * Leurs styles étaient écrits ici mot pour mot — `fontSize: 12`, `9px 16px`,
            * `RAYON_SAISIE`, `1px solid CLAIR.bord` — c'est-à-dire `boutonSecondaire` et
            * `boutonPrincipal` réécrits à côté de leur propre définition. Le pied de ce
            * formulaire et celui du panneau qui le contient se suivent à l'écran, à un pas
            * d'intervalle et au même endroit : la moindre dérive de l'un se lit comme un saut.
            * C'est exactement ce qui est arrivé sur la hauteur, restée à 38 ici pendant que
            * les champs passaient à 40.
            *
            * ⚠️ **Seule la suppression garde des surcharges**, et uniquement celles qui
            * portent du sens : le rouge et la graisse de la confirmation. Le reste — la
            * géométrie — n'a aucune raison de différer d'un bouton qui renonce.
            */}
          {correction && onSupprimer ? (
            <button type="button" disabled={enCours} className="novac-lisere novac-bouton-doux" ref={ancrerLisere}
              onClick={() => (confirmeSuppression ? onSupprimer() : setConfirmeSuppression(true))}
              style={{
                ...boutonSecondaire,
                cursor: enCours ? "default" : "pointer",
                /* ⚠️ **Le cerne rouge n'apparaît qu'à la confirmation, et c'est une ombre
                   interne, jamais une bordure** — une bordure dédoublerait le liseré, voir
                   `boutonSecondaire`. Au repos, le bouton reste celui qui renonce : rien ne
                   doit distinguer « Supprimer » de « Retour » tant qu'on n'a pas confirmé. */
                ...(confirmeSuppression
                  ? { boxShadow: `inset 0 0 0 1px ${CLAIR.negatif}`, color: CLAIR.negatif, fontWeight: 600 }
                  : {}),
              }}>
              {confirmeSuppression ? "Confirmer la suppression" : "Supprimer"}
            </button>
          ) : (
            <button type="button" onClick={() => (etape === 1 ? onFermer() : setEtape(1))}
              className="novac-lisere novac-bouton-doux" ref={ancrerLisere} style={boutonSecondaire}>
              {etape === 1 ? "Annuler" : "Retour"}
            </button>
          )}
          {sortie}
          </div>
          <button type="button" disabled={!peutContinuer || enCours}
            className="novac-lisere novac-bouton-plein" ref={ancrerLisere}
            onClick={() => (correction || etape === 2 ? enregistrer() : setEtape(2))}
            style={{
              ...boutonPrincipal(couleur, !(!peutContinuer || enCours)),
              cursor: !peutContinuer || enCours ? "default" : "pointer",
            }}>
            {enCours ? "Enregistrement…"
              : correction ? "Enregistrer"
              /* ⚠️ **« Suivant » et non « Créer le compte » en rendu intégré, parce que rien
                 n'est créé.** Ce bouton range un brouillon et rend la main à l'appelant ;
                 l'écriture n'a lieu qu'à la conclusion du panneau. Le libellé promettait donc
                 une écriture qui n'avait pas lieu — et il voisinait avec « Passer, et créer
                 sans compte », lequel, lui, écrivait vraiment. Les deux verbes étaient
                 inversés. Relevé en parcourant le panneau. */
              : etape === 1 ? "Continuer"
              : integre ? "Suivant" : "Créer le compte"}
          </button>
        </div>
      </>
  );

  /* ⚠️ **Le même contenu, deux enveloppes.** Écrire deux rendus aurait fait diverger
     l'espacement, le titre ou l'ordre des étapes au premier ajustement — c'est ce que fait
     toujours une seconde copie. */
  if (integre) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{contenu}</div>
    );
  }
  return (
    <FenetreModale onFermer={onFermer}
      etiquette={correction ? "Modifier le compte" : "Nouveau compte"}>
      {contenu}
    </FenetreModale>
  );
}
