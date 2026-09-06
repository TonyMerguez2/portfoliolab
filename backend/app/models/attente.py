"""
La liste d'attente de l'alpha fermée.

⚠️ **Une table à part, et non une colonne sur `users`.** Quelqu'un qui laisse son adresse
n'a pas de compte : il n'a ni mot de passe, ni portefeuille, ni rien qui puisse remplir
les colonnes obligatoires de `users`. Lui en fabriquer un vide aurait mêlé deux
populations dans la table qui sert à l'authentification — et la première requête un peu
distraite aurait renvoyé des comptes fantômes.

⚠️ **Aucune route ne rend cette table.** Une liste d'adresses e-mail est la donnée la plus
sensible du site, et un `GET /liste-attente` mal protégé la publie d'un coup. On y écrit
depuis le web, on la lit depuis le serveur — voir `backend/scripts/liste_attente.py`.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, String

from app.core.database import Base, engine


class ListeAttente(Base):
    __tablename__ = "liste_attente"

    id = Column(String, primary_key=True)
    #: Normalisée en minuscules et sans espaces, comme celle d'un compte.
    #:
    #: ⚠️ Unique : la même personne qui s'inscrit deux fois ne doit pas compter double.
    #: La route le rattrape avant l'insertion, l'index est le filet en dessous.
    email = Column(String, unique=True, nullable=False, index=True)
    #: D'où vient l'inscription — « acces » pour la porte de l'alpha. Une seule valeur
    #: aujourd'hui ; elle existe pour que la prochaine origine n'oblige pas à migrer.
    origine = Column(String, nullable=True)
    cree_le = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(engine)
