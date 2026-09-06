"""
Les comptes déclarés d'un portefeuille : lecture, création, modification, suppression.

⚠️ **Ces routes remplacent une déduction par une donnée.** L'écran rangeait chaque ligne
dans « PEA », « CTO » ou « Crypto » d'après sa place de cotation. C'était une inférence,
et le code le disait sans détour : « une action parisienne détenue en compte-titres
ordinaire ira dans PEA et personne ne le saura ». Trois enveloppes devinées ne savent pas
non plus décrire un compte courant ou un livret — ils ne détiennent aucun titre, donc
aucune place de cotation ne peut les révéler.

⚠️ **L'inférence survit, et c'est délibéré.** Aucun portefeuille existant n'a de compte
déclaré : les supprimer d'un coup laisserait leurs lignes en vrac. Ce qui est rattaché à
un compte y va, le reste continue d'être deviné. La bascule se fait portefeuille par
portefeuille, au rythme de qui déclare.

⚠️ **Aucun jugement ici non plus.** Ces routes enregistrent ce que l'épargnant déclare
détenir et où. Elles ne disent pas si un PEA vaut mieux qu'un compte-titres, ni ce qu'il
faudrait y mettre.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_auth
from app.services.memoire_courte import memorise
from app.core.database import (Compte, MouvementTresorerie, Portfolio,
                                Transaction, get_db)
from app.models.user import User
from app.services.tresorerie import solde_actuel

router = APIRouter(prefix="/api/v1/portfolios", tags=["Comptes"])

#: Les genres vivent hors du chemin d'un portefeuille, sur leur propre routeur.
#:
#: ⚠️ **Rangés sous `/portfolios/genres-de-compte`, ils tenaient à un hasard.** Aucune
#: route `GET /portfolios/{portfolio_id}` n'existe aujourd'hui, donc rien ne les avalait —
#: mais le routeur des portefeuilles est monté *avant* celui-ci, si bien que le jour où
#: quelqu'un ajoutera cette route parfaitement banale, « genres-de-compte » deviendra un
#: identifiant de portefeuille et rendra 404. Une constante du domaine n'a de toute façon
#: pas sa place sous le chemin d'un portefeuille : elle n'appartient à aucun.
constantes = APIRouter(prefix="/api/v1", tags=["Comptes"])

#: Les genres de compte reconnus, et ce qu'ils peuvent contenir.
#:
#: ⚠️ **Un ensemble fermé, et il faut qu'il le reste.** Un champ libre aurait produit
#: « PEA », « P.E.A. » et « pea » dans la même base, donc trois comptes là où il y en a
#: un, et plus aucun regroupement possible. En ajouter un est une ligne ici, et le refus
#: explicite dit à l'appelant ce qui existe.
#:
#: ⚠️ **`titres` n'est pas décoratif.** Un compte courant et un livret ne détiennent
#: aucune ligne : leur valeur *est* leur solde. Un PEA en détient, et son solde n'est que
#: la poche d'espèces à côté. Additionner les deux de la même façon ferait compter les
#: titres deux fois sur les uns et rien du tout sur les autres.
#:
#: ⚠️ **Cinq genres prétendaient couvrir « ce qu'un épargnant français détient », et
#: c'était faux.** Il y manquait l'assurance-vie et le plan d'épargne retraite, qui sont
#: parmi les premiers véhicules d'épargne du pays, ainsi que l'épargne salariale. Trois
#: entrées les ajoutent. Signalé à l'usage.
#:
#: ⚠️ **L'assurance-vie et le PER ne rentrent pas proprement dans ce booléen, et c'est une
#: approximation assumée.** Un contrat détient à la fois un fonds en euros — un solde, sans
#: aucune ligne — et des unités de compte, qui en sont. `titres` est binaire : quel que soit
#: le côté choisi, on perd l'autre moitié du contrat. Ils sont donc déclarés porteurs de
#: titres, le fonds en euros se saisissant comme une ligne parmi les autres. Ce que cela
#: coûte : son rendement doit être entré à la main, faute de cotation.
#:
#: ⚠️ **La sortie propre serait un troisième état plutôt qu'un booléen** — « solde », « titres »
#: et « les deux ». Elle touche la valorisation, la trésorerie et l'agrégation ; elle n'a pas
#: été prise ici pour que l'ajout reste réversible.
#:
#: ⚠️ **La déduction, elle, ne connaît toujours que trois enveloppes.** `compteInfere`, côté
#: interface, devine « PEA », « compte-titres » ou « crypto » d'après les places de cotation ;
#: elle ne produira jamais « assurance-vie ». Un compte déclaré comme tel ne sera donc jamais
#: rejoint par la règle qui range les opérations orphelines. C'est le prix d'un vocabulaire de
#: déclaration plus riche que le vocabulaire de déduction, et il faut le savoir.
GENRES_COMPTE: dict[str, dict] = {
    "courant":  {"libelle": "Compte courant",  "titres": False},
    "epargne":  {"libelle": "Épargne",         "titres": False},
    "pea":      {"libelle": "PEA",             "titres": True},
    "cto":      {"libelle": "Compte-titres",   "titres": True},
    "av":       {"libelle": "Assurance-vie",   "titres": True},
    "per":      {"libelle": "PER",             "titres": True},
    "pee":      {"libelle": "Épargne salariale", "titres": True},
    "crypto":   {"libelle": "Crypto",          "titres": True},
}

#: Une couleur hexadécimale à six chiffres, seule forme acceptée.
COULEUR = re.compile(r"^#[0-9A-Fa-f]{6}$")

NOM_MAX = 60


class CompteEntree(BaseModel):
    nom: str
    genre: str
    couleur: str = "#6366F1"
    #: L'argent qu'on met sur le compte en le déclarant, et la date à laquelle on l'y met.
    #:
    #: ⚠️ **Un apport daté, et non plus un solde.** C'est la refonte, et elle tient dans le
    #: nom de ces deux champs : « il n'y a pas de depuis quand, juste la date ». Déclarer un
    #: livret à 5 000 € au 12 mars, c'est apporter 5 000 € le 12 mars — le même geste qu'un
    #: achat de titres, écrit au même endroit, et qui laisse le même repère sur la courbe.
    #: Le solde n'est plus saisi nulle part : il est la somme du journal.
    #:
    #: ⚠️ **Facultatifs dans le contrat, demandés à l'écran.** Les exiger ici rendrait
    #: impossible de déclarer un compte sans liquidités — un PEA dont on ne connaît que les
    #: lignes — pour lequel la question n'a aucun sens.
    apport_initial: float | None = None
    apport_le: datetime | None = None
    rang: int | None = None


def _portefeuille(portfolio_id: str, user: User, db: Session) -> Portfolio:
    """Le portefeuille demandé, s'il appartient au compte. 404 sinon, jamais 403."""
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p or (p.user_id is not None and p.user_id != user.id):
        raise HTTPException(404, "Portefeuille introuvable")
    return p


def _compte(compte_id: str, p: Portfolio, db: Session) -> Compte:
    """
    Le compte demandé, s'il appartient bien à ce portefeuille.

    ⚠️ **Le filtre porte sur les deux identifiants.** Chercher par le seul identifiant de
    compte laisserait modifier celui d'un autre portefeuille — y compris d'un autre
    épargnant — pourvu qu'on en devine l'UUID. Le portefeuille a déjà été résolu contre le
    compte utilisateur juste avant ; l'y raccrocher ferme la chaîne.
    """
    c = db.query(Compte).filter(
        Compte.id == compte_id, Compte.portfolio_id == p.id,
    ).first()
    if not c:
        raise HTTPException(404, "Compte introuvable")
    return c


def porte_des_titres(c: Compte) -> bool:
    """
    Ce compte peut-il recevoir des opérations ?

    ⚠️ **Publiée parce qu'elle sert des deux côtés du rattachement.** La route qui rattache
    en masse et celle qui crée une opération posent la même question, et une seule des deux
    l'aurait posée si chacune avait écrit sa condition : un livret aurait alors reçu des
    achats par le chemin resté sans contrôle.

    ⚠️ **Un genre inconnu ne porte pas de titres.** Il n'en existe pas aujourd'hui — le
    genre est validé à l'écriture — mais si un jour la base en portait un, le repli refuse
    plutôt qu'il n'accepte : mieux vaut un rattachement impossible qu'un achat rangé dans un
    compte courant.
    """
    return bool(GENRES_COMPTE.get(c.genre, {}).get("titres", False))


def _valider(e: CompteEntree) -> None:
    """
    ⚠️ **Le nom est nettoyé puis mesuré, dans cet ordre.** Mesuré d'abord, une saisie
    faite de soixante espaces passait le contrôle et donnait un compte sans nom visible.
    """
    nom = (e.nom or "").strip()
    if not nom:
        raise HTTPException(400, "Le compte a besoin d'un nom.")
    if len(nom) > NOM_MAX:
        raise HTTPException(400, f"Nom trop long (maximum {NOM_MAX} caractères).")
    if e.genre not in GENRES_COMPTE:
        raise HTTPException(400, f"Genre inconnu. Attendu : {', '.join(GENRES_COMPTE)}.")
    if not COULEUR.match(e.couleur or ""):
        raise HTTPException(400, "Couleur attendue au format #RRGGBB.")
    if e.apport_initial is not None and e.apport_initial < 0:
        raise HTTPException(400, "Un apport initial ne peut pas être négatif.")
    # ⚠️ Un apport sans date ne se placerait nulle part sur la courbe. Le refuser à la
    # saisie vaut mieux que l'écrire pour le perdre ensuite : c'est très exactement le
    # défaut que cette refonte répare.
    if e.apport_initial is not None and e.apport_le is None:
        raise HTTPException(400, "Un apport a besoin de sa date.")


def _journaux_des_comptes(comptes: list[Compte], db: Session) -> dict[str, list]:
    """
    Le journal de chaque compte, en **une** requête au lieu d'une par compte.

    ⚠️ **Lister les comptes en faisait une par compte, et l'écran attendait le lot.** Chaque
    compte porte son solde, le solde est la somme de son journal, et le journal se lisait à la
    demande : huit comptes, neuf requêtes. C'est le défaut classique du « N + 1 » — invisible
    sur un compte de démonstration, sensible dès qu'un épargnant en déclare plusieurs.

    ⚠️ **Le tri reste celui du journal — du plus récent au plus ancien.** Le groupement le
    préserve puisqu'on parcourt le lot dans l'ordre reçu : `dernier_apport_le` continue de se
    lire sur le premier élément, sans retrier quoi que ce soit.
    """
    ids = [c.id for c in comptes]
    if not ids:
        return {}
    lot = (db.query(MouvementTresorerie)
           .filter(MouvementTresorerie.compte_id.in_(ids))
           .order_by(MouvementTresorerie.date.desc()).all())
    par_compte: dict[str, list] = {i: [] for i in ids}
    for m in lot:
        par_compte[m.compte_id].append(m)
    return par_compte


def _en_dict(c: Compte, db: Session, journal: list | None = None) -> dict:
    """
    Le compte tel que l'écran le lit, **solde compris**.

    ⚠️ **`solde` est calculé, il n'est plus stocké.** La colonne existe encore en base —
    SQLite n'a pas de migration dans ce projet, et la retirer demanderait de reconstruire
    la table — mais plus rien ne la lit. La somme du journal est la seule vérité, et la
    rendre sous le nom que l'écran connaît déjà évite de propager la refonte jusque dans
    les composants qui n'ont aucune raison de la connaître.

    ⚠️ **`dernier_apport_le` remplace `mis_a_jour_le` pour dire l'âge d'un solde.** La
    carte d'un livret annonçait « Solde déclaré il y a 8 mois » d'après la date de dernière
    retouche de la *fiche* — renommer le compte rajeunissait donc son solde. La question que
    l'écran pose vraiment est : depuis quand cet argent n'a-t-il pas bougé ? Le journal y
    répond exactement, et c'est désormais un fait plutôt qu'un indice.

    ⚠️ **Le journal peut être fourni par l'appelant.** C'est ce qui permet à la liste de le
    lire en une seule requête pour tous les comptes ; seul l'appel unitaire — création,
    correction — le relit ici, et il n'en charge qu'un.
    """
    if journal is None:
        journal = _mouvements_du_compte(c, db)
    return {
        "id": c.id,
        "nom": c.nom,
        "genre": c.genre,
        "libelle_genre": GENRES_COMPTE[c.genre]["libelle"] if c.genre in GENRES_COMPTE else c.genre,
        "porte_des_titres": bool(GENRES_COMPTE.get(c.genre, {}).get("titres")),
        "couleur": c.couleur,
        "solde": solde_actuel([{"montant": m.montant} for m in journal]),
        # `_mouvements_du_compte` trie du plus récent au plus ancien : le premier est le dernier.
        "dernier_apport_le": journal[0].date.isoformat() if journal else None,
        "rang": c.rang,
        "mis_a_jour_le": c.mis_a_jour_le.isoformat() if c.mis_a_jour_le else None,
    }


@constantes.get("/genres-de-compte")
def genres():
    """
    Les genres reconnus, pour que l'écran n'ait pas à les réécrire.

    ⚠️ **Sans authentification, et hors du chemin d'un portefeuille.** C'est une
    constante du domaine, pas une donnée de quiconque. Recopiée côté client, elle aurait
    divergé au premier genre ajouté — et le formulaire aurait proposé un choix que le
    serveur refuse.
    """
    return [{"cle": k, **v} for k, v in GENRES_COMPTE.items()]


@router.get("/{portfolio_id}/comptes")
@memorise("comptes")
def lister(portfolio_id: str, db: Session = Depends(get_db),
           user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    comptes = (db.query(Compte)
               .filter(Compte.portfolio_id == p.id)
               .order_by(Compte.rang, Compte.cree_le)
               .all())
    journaux = _journaux_des_comptes(comptes, db)
    return [_en_dict(c, db, journaux.get(c.id, [])) for c in comptes]


@router.post("/{portfolio_id}/comptes")
def creer(portfolio_id: str, data: CompteEntree, db: Session = Depends(get_db),
          user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    _valider(data)
    #: Le rang par défaut place le nouveau venu en queue plutôt qu'en tête : on déclare
    #: un compte de plus, on ne réordonne pas ceux qu'on avait rangés.
    dernier = (db.query(Compte)
               .filter(Compte.portfolio_id == p.id)
               .order_by(Compte.rang.desc()).first())
    c = Compte(
        id=str(uuid.uuid4()), portfolio_id=p.id, nom=data.nom.strip(),
        genre=data.genre, couleur=data.couleur,
        rang=data.rang if data.rang is not None else ((dernier.rang + 1) if dernier else 0),
    )
    db.add(c)

    # ⚠️ **Déclarer un compte avec de l'argent dessus, c'est écrire un apport, et rien
    # d'autre.** Il n'y a plus de champ de solde à remplir à côté : le compte n'a que son
    # journal, et son solde en est la somme. C'est ce qui fait qu'un apport d'ouverture
    # laisse sur la courbe le même repère qu'un versement fait six mois plus tard — les
    # deux gestes sont désormais le même objet, ce qu'ils n'ont jamais cessé d'être pour
    # l'épargnant.
    if data.apport_initial is not None and data.apport_le is not None:
        db.add(MouvementTresorerie(
            id=str(uuid.uuid4()), compte_id=c.id,
            date=data.apport_le, montant=data.apport_initial,
            note="Apport initial"))

    db.commit()
    db.refresh(c)
    return _en_dict(c, db)


@router.put("/{portfolio_id}/comptes/{compte_id}")
def modifier(portfolio_id: str, compte_id: str, data: CompteEntree,
             db: Session = Depends(get_db), user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    _valider(data)
    c.nom, c.genre, c.couleur = data.nom.strip(), data.genre, data.couleur
    # ⚠️ **Modifier un compte ne touche plus à son argent, et c'est le cœur de la refonte.**
    # Le formulaire réécrivait `solde` sans rien ajouter au journal, ce qui voulait dire
    # « je m'étais trompé » et réécrivait tout le passé de la courbe. Un apport se corrige
    # maintenant là où il est écrit — dans le journal, par `PUT .../mouvements/{id}` —
    # exactement comme on corrige un achat de titres mal saisi. Un compte n'a plus de solde
    # propre à corriger : il a des apports, et ce sont eux qu'on rectifie.
    #
    # `apport_initial` est donc ignoré ici. Le laisser agir aurait rouvert la couture que
    # tout ce chantier ferme : deux chemins pour écrire la même somme.
    if data.rang is not None:
        c.rang = data.rang
    db.commit()
    db.refresh(c)
    return _en_dict(c, db)


@router.delete("/{portfolio_id}/comptes/{compte_id}")
def supprimer_compte(portfolio_id: str, compte_id: str, db: Session = Depends(get_db),
                     user: User = Depends(require_auth)):
    """
    Supprime le compte, **et détache ses opérations sans les supprimer**.

    ⚠️ **Le détachement est explicite parce qu'aucune contrainte ne le fera.** `compte_id`
    n'est pas une clé étrangère : SQLite ne sait pas en ajouter une par `ALTER TABLE`, et
    c'est par là que passe la migration des bases déjà créées. Sans cette boucle, les
    lignes garderaient l'identifiant d'un compte disparu — elles ne s'afficheraient donc
    nulle part, ni dans un compte, ni dans le rangement par déduction qui ne regarde que
    les lignes détachées.

    ⚠️ **On détache, on ne supprime pas.** Une opération est un fait : elle a eu lieu. Le
    compte où on la rangeait peut disparaître ; l'achat, lui, reste, et la valorisation du
    portefeuille en dépend.
    """
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    detachees = (db.query(Transaction)
                 .filter(Transaction.portfolio_id == p.id,
                         Transaction.compte_id == c.id)
                 .update({Transaction.compte_id: None}, synchronize_session=False))
    # ⚠️ **Le journal part avec le compte, et il faut l'effacer à la main.** Même raison
    # que le détachement ci-dessus : `ondelete="CASCADE"` est déclaré sur la colonne, mais
    # SQLite n'applique les clés étrangères que si on le lui demande, et la migration douce
    # de ce projet ne sait qu'ajouter des colonnes. Sans cette ligne, les mouvements
    # survivaient à leur compte — vérifié par un test qui échouait.
    #
    # ⚠️ **On supprime, là où les opérations sont détachées.** Une opération est un fait :
    # l'achat a eu lieu, et la valorisation du portefeuille en dépend. Un mouvement de
    # trésorerie ne décrit que ce compte-là ; sans lui, il ne dit plus rien.
    mouvements_effaces = (db.query(MouvementTresorerie)
                          .filter(MouvementTresorerie.compte_id == c.id).delete())
    db.delete(c)
    db.commit()
    return {"supprime": True, "operations_detachees": detachees,
            "mouvements_effaces": mouvements_effaces}


class Rattachement(BaseModel):
    operations: list[int] = []


@router.post("/{portfolio_id}/comptes/{compte_id}/operations")
def rattacher_des_operations(portfolio_id: str, compte_id: str, corps: Rattachement,
                             db: Session = Depends(get_db),
                             user: User = Depends(require_auth)):
    """
    Range des opérations existantes dans ce compte — le geste inverse de la suppression
    juste au-dessus, et c'est pourquoi les deux se lisent l'un sous l'autre.

    ⚠️ **C'est ce qui permet de *déclarer* un dossier deviné.** Jusqu'ici un compte déclaré
    ne pouvait contenir que des opérations créées après lui : l'histoire déjà saisie restait
    rangée par déduction, sans moyen de la reprendre. Un épargnant qui déclarait son PEA
    obtenait donc un dossier vide à côté du dossier deviné toujours plein.

    ⚠️ **Par identifiants d'opération, jamais par tickers.** « Rattacher AAPL » ne dit pas
    si l'on parle des opérations d'aujourd'hui ou aussi de celles à venir, et la réponse
    change le sens de l'appel. Une liste d'identifiants ne veut dire qu'une chose.

    ⚠️ **Tout ou rien.** Les identifiants sont d'abord confrontés au portefeuille ; s'il en
    manque un, rien n'est écrit. Un rattachement partiel laisserait « trois sur cinq » sans
    aucun moyen de nommer les deux autres, et l'appelant ne saurait pas quoi reprendre.

    ⚠️ **Aucune ligne de `comptes` n'est touchée, pas même relue pour la forme.**
    `Compte.mis_a_jour_le` porte un `onupdate` et nourrit la mention « Solde déclaré… » de
    l'écran : un `db.refresh(c)` inoffensif ferait dire « aujourd'hui » à un montant tapé en
    janvier. On écrit dans `transactions`, on lit dans `comptes`, jamais l'inverse.
    """
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    if not porte_des_titres(c):
        raise HTTPException(
            400,
            f"« {c.nom} » ne détient pas de titres : son solde est sa valeur, "
            "et aucune opération ne s'y range.",
        )

    # ⚠️ Une liste vide est une réponse juste, pas une erreur : c'est ce que rend un dossier
    # sans ligne, et l'écran n'a pas à traiter ce cas à part.
    demandees = list(dict.fromkeys(corps.operations))
    if not demandees:
        return {"rattachees": 0, "deplacees": 0}

    lignes = (db.query(Transaction)
              .filter(Transaction.portfolio_id == p.id,
                      Transaction.id.in_(demandees))
              .all())
    if len(lignes) != len(demandees):
        introuvables = sorted(set(demandees) - {t.id for t in lignes})
        raise HTTPException(
            400,
            "Ces opérations n'appartiennent pas à ce portefeuille : "
            f"{', '.join(str(i) for i in introuvables)}. Rien n'a été rattaché.",
        )

    # ⚠️ Compté **avant** l'écriture. `Query.update()` rend le nombre de lignes *appariées*,
    # pas modifiées : au second appel il vaudrait encore N, et l'on annoncerait un
    # déplacement qui n'a pas eu lieu. Seul ce chiffre-là peut surprendre l'appelant — une
    # opération qui change de compte quitte le précédent — donc il doit être exact.
    deplacees = sum(1 for t in lignes if t.compte_id not in (None, c.id))

    for t in lignes:
        t.compte_id = c.id
    db.commit()
    return {"rattachees": len(lignes), "deplacees": deplacees}


# ── Les mouvements de trésorerie ──────────────────────────────────────────────
#
# ⚠️ **Un virement entre deux comptes ne demande aucun type particulier.** C'est un
# retrait sur l'un et un versement sur l'autre : la somme fait zéro, et le patrimoine ne
# bouge pas de lui-même. Un champ « nature » distinguant l'apport extérieur du transfert
# interne aurait donc décrit ce que l'arithmétique dit déjà — et il aurait fallu le tenir
# à jour, donc le voir se tromper.

class MouvementEntree(BaseModel):
    #: Quand le mouvement a eu lieu, et non quand on le saisit.
    date: datetime
    #: Signé : positif pour un versement, négatif pour un retrait.
    montant: float
    note: str | None = None


def _mouvement_en_dict(m: MouvementTresorerie) -> dict:
    return {
        "id": m.id,
        "date": m.date.isoformat() if m.date else None,
        "montant": m.montant,
        "note": m.note,
    }


def _mouvements_du_compte(c: Compte, db: Session) -> list[MouvementTresorerie]:
    return (db.query(MouvementTresorerie)
            .filter(MouvementTresorerie.compte_id == c.id)
            .order_by(MouvementTresorerie.date.desc()).all())


@router.get("/{portfolio_id}/mouvements")
@memorise("mouvements")
def lister_les_mouvements_du_portefeuille(portfolio_id: str,
                                          db: Session = Depends(get_db),
                                          user: User = Depends(require_auth)):
    """
    Tous les apports du portefeuille, comptes confondus, du plus récent au plus ancien.

    ⚠️ **Une route à part parce que l'onglet Transactions n'a pas à payer une courbe.**
    Les apports voyagent déjà avec `/history/comptes`, qui les rend compte par compte — mais
    cette route-là télécharge l'historique des cours de tous les titres. Les demander pour
    remplir une liste d'écritures aurait fait dépendre l'affichage d'un journal du réseau du
    fournisseur, et attendre plusieurs secondes pour des lignes déjà en base.

    ⚠️ **`compte_id` accompagne chaque apport.** C'est ce qui permet de les ranger par
    dossier au même titre que les opérations, qui le portent depuis toujours.
    """
    p = _portefeuille(portfolio_id, user, db)
    ids = [c.id for c in db.query(Compte).filter(Compte.portfolio_id == p.id).all()]
    if not ids:
        return []
    lot = (db.query(MouvementTresorerie)
           .filter(MouvementTresorerie.compte_id.in_(ids))
           .order_by(MouvementTresorerie.date.desc()).all())
    return [{**_mouvement_en_dict(m), "compte_id": m.compte_id} for m in lot]


@router.get("/{portfolio_id}/comptes/{compte_id}/mouvements")
def lister_les_mouvements(portfolio_id: str, compte_id: str,
                          db: Session = Depends(get_db),
                          user: User = Depends(require_auth)):
    """Le journal du compte, du plus récent au plus ancien."""
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    return [_mouvement_en_dict(m) for m in _mouvements_du_compte(c, db)]


@router.post("/{portfolio_id}/comptes/{compte_id}/mouvements", status_code=201)
def enregistrer_un_mouvement(portfolio_id: str, compte_id: str, corps: MouvementEntree,
                             db: Session = Depends(get_db),
                             user: User = Depends(require_auth)):
    """
    Enregistre un versement ou un retrait.

    ⚠️ **Rien à mettre à jour à côté.** Le solde du compte est la somme de son journal :
    écrire l'apport *est* le changement de solde. La ligne qui ajoutait le montant à
    `Compte.solde` a disparu avec la colonne qu'elle entretenait, et avec elle le risque
    que les deux chiffres divergent — ce qu'ils faisaient, mesuré sur cinq comptes sur six.

    ⚠️ **Plus de refus sur un compte « sans solde déclaré ».** L'ancienne version l'exigeait
    parce qu'un mouvement se retranchait d'un solde qui devait exister d'abord. Le cumul
    n'a besoin de rien : le premier apport déclare les espèces, et un compte peut donc
    commencer nu puis recevoir de l'argent, ce qui est l'ordre naturel des choses.

    ⚠️ **Un montant nul est refusé.** Il n'ajouterait rien à la courbe et poserait une
    pastille sur le graphique désignant un événement sans effet.
    """
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)

    if corps.montant == 0:
        raise HTTPException(400, "Un mouvement de zéro euro ne dit rien.")

    m = MouvementTresorerie(
        id=str(uuid.uuid4()), compte_id=c.id,
        date=corps.date, montant=corps.montant,
        note=(corps.note or "").strip() or None,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    db.refresh(c)
    return {"mouvement": _mouvement_en_dict(m), "compte": _en_dict(c, db)}


@router.put("/{portfolio_id}/comptes/{compte_id}/mouvements/{mouvement_id}")
def corriger_un_mouvement(portfolio_id: str, compte_id: str, mouvement_id: str,
                          corps: MouvementEntree,
                          db: Session = Depends(get_db),
                          user: User = Depends(require_auth)):
    """
    Corrige un apport mal saisi : son montant, sa date ou sa note.

    ⚠️ **C'est ici que « je m'étais trompé » se dit désormais.** L'écran de correction du
    compte réécrivait le solde sans rien ajouter au journal, ce qui était le seul moyen de
    rectifier une faute de frappe sans inventer un versement. Le compte n'ayant plus de
    solde propre, la correction retrouve sa place : sur l'écriture fautive elle-même,
    comme pour un achat de titres dont on a tapé le mauvais prix.

    ⚠️ **Corriger n'est toujours pas verser, et la distinction survit à la refonte.**
    Passer un apport de 5 000 à 5 500 € veut dire qu'il valait 5 500 € depuis le début, et
    réécrit donc la courbe à partir de sa date. Ajouter 500 € aujourd'hui se fait en
    enregistrant un second apport. Les deux gestes ne racontent pas la même histoire, et
    ils ont maintenant deux verbes distincts au lieu de deux écrans qui se ressemblaient.
    """
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    m = (db.query(MouvementTresorerie)
         .filter(MouvementTresorerie.id == mouvement_id,
                 MouvementTresorerie.compte_id == c.id).first())
    if not m:
        raise HTTPException(404, "Mouvement introuvable pour ce compte")
    if corps.montant == 0:
        raise HTTPException(400, "Un mouvement de zéro euro ne dit rien.")

    m.date, m.montant = corps.date, corps.montant
    m.note = (corps.note or "").strip() or None
    db.commit()
    db.refresh(m)
    db.refresh(c)
    return {"mouvement": _mouvement_en_dict(m), "compte": _en_dict(c, db)}


@router.delete("/{portfolio_id}/comptes/{compte_id}/mouvements/{mouvement_id}")
def supprimer_un_mouvement(portfolio_id: str, compte_id: str, mouvement_id: str,
                           db: Session = Depends(get_db),
                           user: User = Depends(require_auth)):
    """
    Retire un apport du journal.

    ⚠️ **Il n'y a plus rien à défaire à côté.** L'ancienne version retranchait le montant
    de `Compte.solde`, faute de quoi le compte serait resté plus riche qu'il ne l'est. Le
    solde étant la somme du journal, retirer la ligne suffit — et l'oubli qui guettait
    cette route ne peut plus se produire.
    """
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    m = (db.query(MouvementTresorerie)
         .filter(MouvementTresorerie.id == mouvement_id,
                 MouvementTresorerie.compte_id == c.id).first())
    if not m:
        raise HTTPException(404, "Mouvement introuvable pour ce compte")

    db.delete(m)
    db.commit()
    db.refresh(c)
    return {"supprime": mouvement_id, "compte": _en_dict(c, db)}
