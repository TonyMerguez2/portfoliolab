from sqlalchemy import Column, String, DateTime
from datetime import datetime
from app.core.database import Base, engine

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    username = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    #: La devise d'affichage du site, code ISO à trois lettres.
    #:
    #: ⚠️ Sur le **compte** et non sur le portefeuille : c'est une préférence de lecture,
    #: pas une propriété du patrimoine. Un épargnant qui pense en euros veut lire en euros
    #: tous ses portefeuilles, même celui libellé en dollars.
    #:
    #: Nullable : un compte créé avant ce réglage n'a pas de valeur, et `devise()` retombe
    #: alors sur le dollar plutôt que de lever.
    devise = Column(String, nullable=True, default=None)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)
