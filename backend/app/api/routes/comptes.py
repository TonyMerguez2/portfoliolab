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
from app.core.database import (Compte, MouvementTresorerie, Portfolio,
                                Transaction, get_db)
from app.models.user import User

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
#: un, et plus aucun regroupement possible. Les cinq genres couvrent ce qu'un épargnant
#: français détient ; en ajouter un est une ligne ici, et le refus explicite dit à
#: l'appelant ce qui existe.
#:
#: ⚠️ **`titres` n'est pas décoratif.** Un compte courant et un livret ne détiennent
#: aucune ligne : leur valeur *est* leur solde. Un PEA en détient, et son solde n'est que
#: la poche d'espèces à côté. Additionner les deux de la même façon ferait compter les
#: titres deux fois sur les uns et rien du tout sur les autres.
GENRES_COMPTE: dict[str, dict] = {
    "courant":  {"libelle": "Compte courant", "titres": False},
    "epargne":  {"libelle": "Épargne",        "titres": False},
    "pea":      {"libelle": "PEA",            "titres": True},
    "cto":      {"libelle": "Compte-titres",  "titres": True},
    "crypto":   {"libelle": "Crypto",         "titres": True},
}

#: Une couleur hexadécimale à six chiffres, seule forme acceptée.
COULEUR = re.compile(r"^#[0-9A-Fa-f]{6}$")

NOM_MAX = 60


class CompteEntree(BaseModel):
    nom: str
    genre: str
    couleur: str = "#6366F1"
    solde: float | None = None
    #: Depuis quand ce solde existe — voir `Compte.solde_depuis`.
    #:
    #: ⚠️ **Facultatif dans le contrat, demandé à l'écran.** L'exiger ici ferait échouer
    #: toutes les déclarations déjà écrites, celles des tests comprises, et rendrait
    #: impossible de déclarer un compte sans liquidités — pour lequel la question n'a
    #: aucun sens. C'est le même partage que pour le compte d'une opération : obligatoire
    #: là où l'épargnant répond, facultatif là où le contrat doit rester tenable.
    solde_depuis: datetime | None = None
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
    if e.solde is not None and e.solde < 0:
        raise HTTPException(400, "Un solde ne peut pas être négatif.")


def _en_dict(c: Compte) -> dict:
    return {
        "id": c.id,
        "nom": c.nom,
        "genre": c.genre,
        "libelle_genre": GENRES_COMPTE[c.genre]["libelle"] if c.genre in GENRES_COMPTE else c.genre,
        "porte_des_titres": bool(GENRES_COMPTE.get(c.genre, {}).get("titres")),
        "couleur": c.couleur,
        "solde": c.solde,
        "solde_depuis": c.solde_depuis.isoformat() if c.solde_depuis else None,
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
def lister(portfolio_id: str, db: Session = Depends(get_db),
           user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    comptes = (db.query(Compte)
               .filter(Compte.portfolio_id == p.id)
               .order_by(Compte.rang, Compte.cree_le)
               .all())
    return [_en_dict(c) for c in comptes]


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
        genre=data.genre, couleur=data.couleur, solde=data.solde,
        solde_depuis=data.solde_depuis,
        rang=data.rang if data.rang is not None else ((dernier.rang + 1) if dernier else 0),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _en_dict(c)


@router.put("/{portfolio_id}/comptes/{compte_id}")
def modifier(portfolio_id: str, compte_id: str, data: CompteEntree,
             db: Session = Depends(get_db), user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    _valider(data)
    c.nom, c.genre, c.couleur, c.solde = data.nom.strip(), data.genre, data.couleur, data.solde
    # ⚠️ Écrasée même par `None` : corriger un compte pour en retirer le solde doit en
    # retirer la date, sinon le compte garderait une date de solde sans solde — et la
    # courbe de patrimoine aurait un jalon désignant une somme qui n'existe plus.
    c.solde_depuis = data.solde_depuis
    if data.rang is not None:
        c.rang = data.rang
    db.commit()
    db.refresh(c)
    return _en_dict(c)


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
    Enregistre un versement ou un retrait, et **met le solde à jour d'autant**.

    ⚠️ **Le solde bouge, parce qu'un mouvement dit que l'argent a bougé.** C'est toute la
    différence avec l'écran de correction, qui réécrit le solde sans rien ajouter au
    journal : corriger veut dire « je m'étais trompé » et réécrit le passé de la courbe,
    verser veut dire « j'ai ajouté » et ne touche qu'à partir de la date du versement. Les
    deux gestes existent parce qu'ils ne racontent pas la même histoire, et deviner l'un à
    partir de l'autre aurait fait apparaître des apports que personne n'a faits.

    ⚠️ **Refusé sur un compte sans solde déclaré.** Un mouvement se retranche du solde
    actuel pour remonter le temps ; sans solde, il n'y a rien dont le retrancher, et le
    compte afficherait un journal sans jamais rien valoir. Déclarer le solde d'abord est
    aussi le seul moyen d'obtenir la date à partir de laquelle il compte.

    ⚠️ **Un montant nul est refusé.** Il n'ajouterait rien à la courbe et poserait une
    pastille sur le graphique désignant un événement sans effet.
    """
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)

    if c.solde is None:
        raise HTTPException(
            400, "Ce compte n'a pas de solde déclaré : un mouvement n'aurait rien à "
                 "quoi se rapporter.")
    if corps.montant == 0:
        raise HTTPException(400, "Un mouvement de zéro euro ne dit rien.")

    m = MouvementTresorerie(
        id=str(uuid.uuid4()), compte_id=c.id,
        date=corps.date, montant=corps.montant,
        note=(corps.note or "").strip() or None,
    )
    db.add(m)
    # ⚠️ Le solde suit le mouvement : il reste la vérité du présent, et le journal ne
    # façonne que le passé. Voir `MouvementTresorerie`.
    c.solde = (c.solde or 0.0) + corps.montant
    db.commit()
    db.refresh(m)
    db.refresh(c)
    return {"mouvement": _mouvement_en_dict(m), "compte": _en_dict(c)}


@router.delete("/{portfolio_id}/comptes/{compte_id}/mouvements/{mouvement_id}")
def supprimer_un_mouvement(portfolio_id: str, compte_id: str, mouvement_id: str,
                           db: Session = Depends(get_db),
                           user: User = Depends(require_auth)):
    """
    Retire un mouvement du journal **et défait son effet sur le solde**.

    ⚠️ **Sans le défaire, supprimer une erreur de saisie en créerait une autre.** Le solde
    porte la somme du mouvement depuis son enregistrement ; l'effacer du journal seulement
    laisserait un compte plus riche qu'il ne l'est, sans plus rien pour expliquer d'où
    vient l'écart.
    """
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    m = (db.query(MouvementTresorerie)
         .filter(MouvementTresorerie.id == mouvement_id,
                 MouvementTresorerie.compte_id == c.id).first())
    if not m:
        raise HTTPException(404, "Mouvement introuvable pour ce compte")

    c.solde = (c.solde or 0.0) - m.montant
    db.delete(m)
    db.commit()
    db.refresh(c)
    return {"supprime": mouvement_id, "compte": _en_dict(c)}
