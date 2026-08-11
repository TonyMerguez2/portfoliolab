"""
Les objectifs d'épargne d'un portefeuille : lecture, création, modification, suppression.

⚠️ **La valeur du portefeuille ne vient pas de `total_value`.** Cette colonne s'est
révélée trompeuse : sur un vrai PEA elle vaut 4 959,91 €, c'est-à-dire exactement le
montant *investi*, alors que le portefeuille en vaut 5 304,86 aux cours du jour. S'en
servir aurait retiré la totalité de la plus-value de l'avancement de chaque objectif.
On valorise donc comme la route des positions : quantités issues des transactions,
multipliées par les cours actuels.

⚠️ **La provenance de cette valeur est rendue au client.** Un portefeuille sans
transaction n'a pas de quantités : il ne reste que la colonne, dont on vient de voir ce
qu'elle vaut. Le champ `source` dit alors « poids » au lieu de « transactions », et
l'écran peut prévenir plutôt que d'afficher un avancement d'apparence exacte.

⚠️ **Aucun conseil n'est rendu par ces routes.** Elles donnent où l'on en est et ce
qu'il faudrait ; jamais quoi faire. « À 800 € par mois, la cible tombe en 2044 » est une
division ; « augmentez à 1 000 € » serait une recommandation d'investissement.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_auth
from app.core.database import Objectif, Portfolio, Transaction, get_db
from app.models.user import User
from app.services.objectifs import (
    GENRES, annee_de_l_age, capital_requis, echeance_en_mois, euros_constants,
    mois_pour_atteindre, progression, valeur_projetee,
)
from app.services.projection import projeter
from app.services.volatilite import JOURS_MINIMAUX, volatilite_mesuree
from app.utils.positions import compute_positions, fetch_current_prices

router = APIRouter(prefix="/api/v1/portfolios", tags=["Objectifs"])


class ObjectifEntree(BaseModel):
    nom: str
    genre: str
    cible: float
    echeance_annee: int | None = None
    age_cible: int | None = None
    part_affectee: float | None = None
    versement_mensuel: float | None = None
    taux_attendu: float | None = None
    inflation: float | None = None
    taux_retrait: float | None = None
    couleur: str | None = None


#: Les bornes de saisie, et pourquoi elles existent.
#:
#: ⚠️ Validées à l'écriture et non à la lecture. Un taux hors bornes entré une fois
#: fausserait toutes les projections suivantes sans que rien ne le signale — le même
#: défaut que les frais courants, déjà bornés à l'écriture pour la même raison.
BORNES = {
    # Un rendement attendu négatif est un choix défendable ; au-delà de 30 % l'an, c'est
    # une erreur de saisie ou une promesse que ce logiciel ne relaiera pas.
    "taux_attendu": (-20.0, 30.0),
    "inflation": (0.0, 20.0),
    # Un taux de retrait de zéro voudrait dire ne jamais toucher au capital : accepté,
    # mais la conversion en capital devient impossible, ce que le service gère.
    "taux_retrait": (0.0, 20.0),
    "part_affectee": (0.0, 100.0),
}


def _valider(e: ObjectifEntree) -> None:
    if e.genre not in GENRES:
        raise HTTPException(422, f"genre doit valoir l'un de {', '.join(GENRES)}")
    if not (e.nom or "").strip():
        raise HTTPException(422, "un objectif sans nom ne se retrouve pas dans une liste")
    if e.cible <= 0:
        raise HTTPException(422, "la cible doit être strictement positive")
    for champ, (bas, haut) in BORNES.items():
        v = getattr(e, champ)
        if v is not None and not bas <= v <= haut:
            raise HTTPException(422, f"{champ} : {v} est hors de {bas} à {haut}")
    if e.echeance_annee is not None:
        an = date.today().year
        if not an <= e.echeance_annee <= an + 100:
            raise HTTPException(422, f"echeance_annee doit tomber entre {an} et {an + 100}")
    if e.age_cible is not None and not 0 < e.age_cible <= 120:
        raise HTTPException(422, "age_cible doit tomber entre 1 et 120")
    # ⚠️ Un objectif exprimé en âge sans âge est un objectif sans échéance : on refuse à
    # l'écriture plutôt que de laisser une carte muette sur l'écran.
    if e.genre == "capital_age" and e.age_cible is None:
        raise HTTPException(422, "un objectif « à tel âge » exige age_cible")


def _portefeuille(portfolio_id: str, user: User, db: Session) -> Portfolio:
    """Le portefeuille demandé, s'il appartient au compte. 404 sinon, jamais 403."""
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p or (p.user_id is not None and p.user_id != user.id):
        raise HTTPException(404, "Portefeuille introuvable")
    return p


@dataclass(frozen=True)
class Valorisation:
    """Ce que vaut un portefeuille, et à quel point on peut s'y fier."""

    #: `None` quand aucun cours n'a pu être obtenu. **Jamais zéro dans ce cas.**
    valeur: float | None
    #: « transactions », « poids », ou « indisponible ».
    source: str
    lignes_valorisees: int = 0
    lignes_totales: int = 0


async def valeur_courante(p: Portfolio, db: Session) -> Valorisation:
    """
    La valeur du portefeuille et la façon dont on l'a obtenue.

    ⚠️ Rend la provenance, pas seulement le nombre. « 4 959,91 € d'après la colonne » et
    « 5 304,86 € aux cours du jour » ne se valent pas, et seul l'appelant qui sait lequel
    il tient peut le dire à l'écran.

    ⚠️ **Aucun cours obtenu ne vaut pas zéro, et ce garde vient d'un vrai incident.**
    Le premier jet additionnait les lignes en sautant celles sans prix : le fournisseur
    limitant le débit ce jour-là, la somme est sortie à 0,00 € avec la mention
    « transactions » — donc « 0 % de votre objectif » sur un PEA de cinq mille euros. Un
    portefeuille dont on ignore la valeur doit se dire inconnu ; zéro est une valeur, et
    c'est la pire de toutes ici.

    Une valorisation **partielle** est rendue mais comptée : `lignes_valorisees` sur
    `lignes_totales`. Un total amputé d'une ligne reste faux, et l'écran doit pouvoir le
    dire au lieu de l'afficher comme un patrimoine.
    """
    txs = db.query(Transaction).filter(Transaction.portfolio_id == p.id).all()
    if not txs:
        return Valorisation(p.total_value, "poids")
    positions = compute_positions(txs)
    cours = await fetch_current_prices(list(positions.keys()))
    total, valorisees = 0.0, 0
    for ticker, pos in positions.items():
        prix = cours.get(ticker)
        if prix:
            total += pos["quantity"] * prix
            valorisees += 1
    if valorisees == 0:
        return Valorisation(None, "indisponible", 0, len(positions))
    return Valorisation(total, "transactions", valorisees, len(positions))


def _annee_naissance(user: User) -> int | None:
    """
    L'année de naissance du compte, si elle est connue.

    ⚠️ Elle ne l'est jamais aujourd'hui : le modèle `User` ne la porte pas. Les
    objectifs exprimés en âge restent donc sans date, et l'écran doit le dire au lieu
    d'inventer une année de départ à la retraite. Cette fonction existe pour que le
    jour où le champ apparaît, il n'y ait qu'un endroit à changer.
    """
    return getattr(user, "annee_naissance", None)


def _en_dict(o: Objectif, valeur: float | None, user: User) -> dict:
    """Un objectif, augmenté de ce que le serveur sait en déduire."""
    an_echeance = o.echeance_annee
    if o.genre == "capital_age":
        an_echeance = annee_de_l_age(o.age_cible, _annee_naissance(user)) or o.echeance_annee

    mois = echeance_en_mois(an_echeance)
    requis = capital_requis(o.genre, o.cible, o.taux_retrait)
    prog = progression(o.genre, o.cible, valeur or 0.0,
                       o.part_affectee, o.taux_retrait) if valeur is not None else None

    # ── Ce que les hypothèses permettent de calculer, et rien de plus ─────────
    #
    # ⚠️ Sans taux attendu, aucune projection. Le champ reste nul plutôt que de
    # recevoir un rendement choisi par le logiciel : une projection est une hypothèse
    # de l'épargnant, et la lui souffler la ferait passer pour une prévision.
    projete = atteinte_mois = None
    if prog is not None and o.taux_attendu is not None and mois:
        projete = valeur_projetee(prog.actuel, o.versement_mensuel or 0.0,
                                  o.taux_attendu, mois)
    if prog is not None and o.taux_attendu is not None and requis:
        atteinte_mois = mois_pour_atteindre(prog.actuel, o.versement_mensuel or 0.0,
                                           o.taux_attendu, requis)

    return {
        "id": o.id, "nom": o.nom, "genre": o.genre, "cible": o.cible,
        "echeance_annee": an_echeance, "age_cible": o.age_cible,
        "part_affectee": o.part_affectee, "versement_mensuel": o.versement_mensuel,
        "taux_attendu": o.taux_attendu, "inflation": o.inflation,
        "taux_retrait": o.taux_retrait, "couleur": o.couleur,
        "capital_requis": requis,
        "montant_actuel": prog.actuel if prog else None,
        "avancement": round(prog.part, 2) if prog else None,
        "atteint": prog.atteint if prog else None,
        "mois_restants": mois,
        "valeur_projetee": projete,
        # En euros d'aujourd'hui, quand l'épargnant a donné une inflation : un million
        # dans trente ans n'a pas le pouvoir d'achat d'un million aujourd'hui.
        "projetee_en_euros_constants": (
            euros_constants(projete, o.inflation, mois)
            if projete is not None and o.inflation is not None and mois else None),
        # ⚠️ Un constat, pas un conseil : le nombre de mois qu'il faudrait au rythme
        # actuel. L'écran peut le comparer à l'échéance ; il ne dit pas quoi changer.
        "mois_pour_atteindre": atteinte_mois,
    }


@router.get("/{portfolio_id}/objectifs")
async def lister(portfolio_id: str, db: Session = Depends(get_db),
                 user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    v = await valeur_courante(p, db)
    objectifs = (db.query(Objectif)
                 .filter(Objectif.portfolio_id == portfolio_id)
                 .order_by(Objectif.cree_le).all())
    parts = [o.part_affectee if o.part_affectee is not None else 100.0 for o in objectifs]
    return {
        "objectifs": [_en_dict(o, v.valeur, user) for o in objectifs],
        "valeur_portefeuille": v.valeur,
        "source_valeur": v.source,
        # ⚠️ Rendus pour que l'écran puisse avouer une valorisation partielle : un total
        # amputé d'une ligne reste faux, même s'il ressemble à un patrimoine.
        "lignes_valorisees": v.lignes_valorisees,
        "lignes_totales": v.lignes_totales,
        # ⚠️ Rendu tel quel, sans normalisation. Au-delà de cent, le même euro est
        # compté pour deux objectifs : c'est une erreur de saisie que l'écran doit
        # montrer, pas que le serveur doit corriger en silence.
        "somme_des_parts": round(sum(parts), 2),
        "annee_naissance_connue": _annee_naissance(user) is not None,
    }


@router.post("/{portfolio_id}/objectifs")
async def creer(portfolio_id: str, data: ObjectifEntree,
                db: Session = Depends(get_db), user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    _valider(data)
    o = Objectif(id=str(uuid.uuid4()), portfolio_id=p.id, **data.model_dump())
    db.add(o)
    db.commit()
    db.refresh(o)
    return _en_dict(o, (await valeur_courante(p, db)).valeur, user)


@router.put("/{portfolio_id}/objectifs/{objectif_id}")
async def modifier(portfolio_id: str, objectif_id: str, data: ObjectifEntree,
                   db: Session = Depends(get_db), user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    o = (db.query(Objectif)
         .filter(Objectif.id == objectif_id, Objectif.portfolio_id == p.id).first())
    if not o:
        raise HTTPException(404, "Objectif introuvable")
    _valider(data)
    for champ, valeur in data.model_dump().items():
        setattr(o, champ, valeur)
    db.commit()
    db.refresh(o)
    return _en_dict(o, (await valeur_courante(p, db)).valeur, user)


@router.delete("/{portfolio_id}/objectifs/{objectif_id}")
def supprimer(portfolio_id: str, objectif_id: str,
              db: Session = Depends(get_db), user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    o = (db.query(Objectif)
         .filter(Objectif.id == objectif_id, Objectif.portfolio_id == p.id).first())
    if not o:
        raise HTTPException(404, "Objectif introuvable")
    db.delete(o)
    db.commit()
    return {"supprime": objectif_id}


#: Un point par an sur la courbe : au-delà, la ligne ne se voit plus.
PAS_PROJECTION = 12


@router.get("/{portfolio_id}/objectifs/{objectif_id}/projection")
async def projection(portfolio_id: str, objectif_id: str,
                     db: Session = Depends(get_db), user: User = Depends(require_auth)):
    """
    Les enveloppes de quantiles d'un objectif, avec l'origine de chaque entrée.

    ⚠️ **Deux entrées de nature opposée.** Le rendement attendu est une hypothèse de
    l'épargnant ; la volatilité est mesurée sur la courbe du portefeuille. La réponse
    rend `volatilite_source` pour que l'écran ne les présente pas du même ton.

    ⚠️ **Sans volatilité mesurable, ni intervalle ni probabilité.** La courbe médiane
    reste calculable — c'est de la capitalisation — mais toute dispersion serait inventée.
    Trois causes distinctes sont rendues telles quelles : « mesuree »,
    « echantillon_court » et « indisponible » ne se corrigent pas de la même façon.

    ⚠️ **Ce ne sont pas trois scénarios.** Les courbes sont les 5ᵉ, 50ᵉ et 95ᵉ centiles
    des tirages à chaque mois. Aucune n'est une trajectoire qu'un portefeuille suivrait.
    """
    p = _portefeuille(portfolio_id, user, db)
    o = (db.query(Objectif)
         .filter(Objectif.id == objectif_id, Objectif.portfolio_id == p.id).first())
    if not o:
        raise HTTPException(404, "Objectif introuvable")

    v = await valeur_courante(p, db)
    detail = _en_dict(o, v.valeur, user)
    mois = detail["mois_restants"]
    requis = detail["capital_requis"]
    depart = detail["montant_actuel"]

    # ⚠️ Trois refus explicites, plutôt qu'une courbe vide sans explication.
    if depart is None:
        return {"possible": False, "raison": "valeur_inconnue", "objectif": detail}
    if not mois:
        return {"possible": False, "raison": "sans_echeance", "objectif": detail}
    if o.taux_attendu is None:
        return {"possible": False, "raison": "sans_rendement_attendu", "objectif": detail}

    txs = db.query(Transaction).filter(Transaction.portfolio_id == p.id).all()
    vol, source_vol, seances = volatilite_mesuree(txs)

    proj = projeter(
        depart=depart, versement_mensuel=o.versement_mensuel or 0.0,
        taux_annuel=o.taux_attendu, volatilite_annuelle=vol, mois=mois,
        requis=requis,
        # ⚠️ La graine dérive de l'identifiant : deux affichages du même objectif donnent
        # la même probabilité. Sans cela, 71 % puis 73 %, et plus rien de crédible.
        cle=o.id, pas=PAS_PROJECTION,
    )

    return {
        "possible": True,
        "objectif": detail,
        "mois": proj.mois,
        "enveloppes": {str(c): proj.enveloppes[c] for c in proj.enveloppes},
        "mediane": proj.mediane,
        # ⚠️ 90 % et non 95 : c'est ce que les centiles 5 et 95 délimitent. La maquette
        # annonçait « intervalle de confiance (95 %) » au-dessus de bornes qui n'en
        # couvrent que quatre-vingt-dix.
        "intervalle": proj.intervalle,
        "niveau_intervalle": 90,
        "probabilite": proj.probabilite,
        "taux_implicites": {str(c): t for c, t in proj.taux_implicites.items()},
        "requis": requis,
        "volatilite": vol,
        "volatilite_source": source_vol,
        "seances_mesurees": seances,
        "seances_minimales": JOURS_MINIMAUX,
        "valeur_portefeuille": v.valeur,
        "source_valeur": v.source,
    }
