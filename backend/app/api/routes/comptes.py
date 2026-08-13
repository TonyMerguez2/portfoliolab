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

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_auth
from app.core.database import Compte, Portfolio, Transaction, get_db
from app.models.user import User
from app.utils.images import ImageRefusee, TAILLE_MAX, enregistrer, supprimer

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

DOSSIER_LOGOS = "uploads"

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
        "logo_url": c.logo_url,
        "solde": c.solde,
        "rang": c.rang,
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
    supprimer(DOSSIER_LOGOS, f"compte-{c.id}")
    db.delete(c)
    db.commit()
    return {"supprime": True, "operations_detachees": detachees}


@router.post("/{portfolio_id}/comptes/{compte_id}/logo")
async def televerser_logo(portfolio_id: str, compte_id: str,
                          file: UploadFile = File(...),
                          db: Session = Depends(get_db),
                          user: User = Depends(require_auth)):
    """
    Reçoit le logo de l'établissement.

    ⚠️ **Le nom du fichier vient d'un identifiant interne, jamais de l'appelant.** Le
    portefeuille puis le compte sont résolus d'abord : c'est ce qui empêche d'écrire dans
    le dossier d'autrui, et ce qui garantit qu'aucune chaîne reçue ne devient un chemin.
    Le préfixe `compte-` évite en outre qu'un compte écrase l'image du portefeuille qui
    porterait le même UUID.

    ⚠️ **La lecture est bornée avant l'écriture.** `UploadFile` n'impose rien de son
    côté : sans ce garde-fou, la taille écrite serait celle que l'appelant décide.
    """
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    donnees = await file.read(TAILLE_MAX + 1)
    try:
        c.logo_url = enregistrer(donnees, DOSSIER_LOGOS, f"compte-{c.id}")
    except ImageRefusee as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(c)
    return _en_dict(c)


@router.delete("/{portfolio_id}/comptes/{compte_id}/logo")
def retirer_logo(portfolio_id: str, compte_id: str, db: Session = Depends(get_db),
                 user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    c = _compte(compte_id, p, db)
    supprimer(DOSSIER_LOGOS, f"compte-{c.id}")
    c.logo_url = None
    db.commit()
    db.refresh(c)
    return _en_dict(c)
