"""
L'état d'une alerte macroéconomique pour un compte : vue, puis supprimée.

⚠️ **On range l'état, jamais l'alerte.** Les alertes se déduisent du calendrier macro,
qui est déterministe : mêmes échéances, mêmes libellés, mêmes zones à chaque appel. Les
recopier en base aurait créé une seconde vérité à tenir d'accord avec la première — et
le jour où le calendrier corrige une date, la copie aurait continué d'annoncer
l'ancienne. Ce qui est propre au compte, et seulement cela, est enregistré : l'ai-je
vue, l'ai-je supprimée.

⚠️ **La clé vient du contenu de l'échéance, pas d'un compteur.** Date, libellé, zone :
trois champs que le calendrier rend identiques d'un appel à l'autre. Un identifiant
attribué à la volée aurait changé à chaque rafraîchissement, et une alerte supprimée
serait revenue sous un nouveau nom — c'est-à-dire tous les jours.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Index, String

from app.core.database import Base, engine


class EtatAlerte(Base):
    __tablename__ = "alerte_macro_etat"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)

    #: L'empreinte de l'échéance — voir `services/alertes.cle_alerte`.
    cle = Column(String, nullable=False)

    #: Quand l'alerte a été annoncée à l'écran.
    #:
    #: ⚠️ C'est ce qui empêche le toast de se répéter. Sans lui, chaque chargement de
    #: page aurait relancé l'annonce des mêmes échéances, ce qui est précisément la
    #: façon dont une notification cesse d'être lue.
    vue_le = Column(DateTime, nullable=True)

    #: Quand l'utilisateur l'a écartée. `null` tant qu'elle vit.
    supprimee_le = Column(DateTime, nullable=True)

    cree_le = Column(DateTime, default=datetime.utcnow)


#: ⚠️ Un couple unique, et non une clé unique seule : deux comptes suivent les mêmes
#: échéances macro, et l'un qui en écarte une ne doit rien décider pour l'autre.
Index("ix_alerte_compte_cle", EtatAlerte.user_id, EtatAlerte.cle, unique=True)

Base.metadata.create_all(engine)
