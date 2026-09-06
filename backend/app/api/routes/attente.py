"""
L'inscription à la liste d'attente de l'alpha fermée.

Une seule route, et elle n'écrit qu'une adresse.
"""

import logging
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.attente import ListeAttente
from app.services import courriel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/liste-attente", tags=["Liste d'attente"])

#: ⚠️ Volontairement large. Une expression régulière ne dit jamais qu'une adresse existe —
#: seul un e-mail envoyé le dit — et les tentatives strictes rejettent des adresses valides :
#: apostrophes, plus, domaines longs, sous-domaines. Elle n'est là que pour écarter la faute
#: de frappe évidente et le champ rempli au hasard.
FORME_EMAIL = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]+$")

#: Une adresse dépassant cette longueur n'est pas une adresse.
LONGUEUR_MAX = 254


class Inscription(BaseModel):
    email: str
    origine: str | None = None


class Reponse(BaseModel):
    inscrit: bool
    #: Vrai si l'adresse était déjà dans la liste.
    #:
    #: ⚠️ **Ce n'est pas une fuite.** Il faut avoir tapé l'adresse pour l'apprendre, et la
    #: réponse doit se distinguer d'un vrai enregistrement, sans quoi quelqu'un qui
    #: s'inscrit deux fois croit avoir échoué la première.
    deja: bool


@router.post("", response_model=Reponse)
@router.post("/", response_model=Reponse)
def inscrire(entree: Inscription, db: Session = Depends(get_db)) -> Reponse:
    """
    Enregistre une adresse, ou constate qu'elle y est déjà.

    ⚠️ **Idempotente.** Se réinscrire ne crée pas de doublon et ne renvoie pas d'erreur :
    du point de vue de qui tape son adresse une seconde fois, le résultat voulu est le
    même — être sur la liste.
    """
    email = (entree.email or "").strip().lower()

    if len(email) > LONGUEUR_MAX or not FORME_EMAIL.match(email):
        raise HTTPException(status_code=422, detail="Adresse e-mail invalide")

    if db.query(ListeAttente).filter(ListeAttente.email == email).first():
        # ⚠️ Aucun second accusé de réception : quelqu'un qui se réinscrit par oubli ne doit
        # pas recevoir deux fois le même message, et surtout un formulaire qui renvoie un
        # courriel à chaque envoi devient une arme à retourner contre une adresse tierce.
        return Reponse(inscrit=True, deja=True)

    db.add(ListeAttente(id=str(uuid.uuid4()), email=email,
                        origine=(entree.origine or "acces")[:40]))
    db.commit()

    # ⚠️ **Après le `commit`, et en fond.** L'inscription est le fait ; le courriel n'est
    # qu'une politesse. Envoyer avant l'enregistrement risquerait d'accuser réception d'une
    # inscription qui échoue ensuite, et envoyer dans le fil de la requête ferait attendre le
    # bouton le temps d'un aller-retour vers le fournisseur.
    # ⚠️ **Y compris l'appel lui-même est protégé, et un test l'exige.** `envoyer_en_fond`
    # attrape tout *à l'intérieur* du fil, mais le lancer peut échouer — plus de fil
    # disponible, ou une erreur de programmation ici même. Sans ce garde, une panne d'envoi
    # ferait perdre l'inscription, c'est-à-dire l'inverse de ce qu'on veut.
    try:
        courriel.envoyer_en_fond(email, courriel.SUJET_INSCRIPTION,
                                 courriel.TEXTE_INSCRIPTION, courriel.HTML_INSCRIPTION)
    except Exception:                                          # pragma: no cover
        logger.exception("Liste d'attente : envoi impossible pour %s", email)
    return Reponse(inscrit=True, deja=False)
