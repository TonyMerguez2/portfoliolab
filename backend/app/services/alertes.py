"""
Les alertes macroéconomiques d'un portefeuille.

⚠️ **Rien n'est inventé : l'alerte est une échéance du calendrier, pas un signal.** Le
calendrier macro de `evenements.py` sait déjà quelles zones concernent un portefeuille —
déduites de ses tickers — et à quelle date chaque publication tombe. Une alerte n'est que
cette échéance, vue à travers l'état du compte : annoncée ou non, écartée ou non.

⚠️ **Sept jours, et l'on dit pourquoi.** Au-delà, une décision de taux annoncée trois
semaines à l'avance n'est plus une alerte mais une ligne d'agenda — et l'onglet
« Événements » la montre déjà. En deçà, prévenir la veille au soir d'une publication du
matin laisse trop peu de temps pour en faire quoi que ce soit. La fenêtre part
d'aujourd'hui inclus : une publication du jour même reste la plus utile de toutes.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.alerte import EtatAlerte
from app.services.evenements import evenements_macro_du_flux

#: L'horizon d'une alerte, en jours, aujourd'hui compris.
FENETRE_JOURS = 7


def cle_alerte(evenement: dict[str, Any]) -> str:
    """
    L'empreinte d'une échéance : date, libellé, zone.

    ⚠️ **Les trois champs, et pas seulement la date.** Deux publications tombent le même
    jour plus souvent qu'on ne croit — l'inflation américaine et une décision de la BCE
    ont partagé le 11 septembre. Une clé sur la date seule les aurait confondues : écarter
    l'une aurait écarté l'autre.

    ⚠️ Une empreinte et non les trois champs concaténés : la clé voyage dans une adresse,
    et un libellé porte des espaces, des accents et des virgules.
    """
    brut = "|".join([
        str(evenement.get("date") or ""),
        str(evenement.get("libelle") or ""),
        str(evenement.get("pays") or ""),
    ])
    return hashlib.sha1(brut.encode("utf-8")).hexdigest()[:16]


def _etats(db: Session, user_id: str, cles: list[str]) -> dict[str, EtatAlerte]:
    if not cles:
        return {}
    lignes = (db.query(EtatAlerte)
              .filter(EtatAlerte.user_id == user_id, EtatAlerte.cle.in_(cles))
              .all())
    return {l.cle: l for l in lignes}


def alertes(
    db: Session, user_id: str, tickers: list[str], aujourdhui: date | None = None,
) -> list[dict[str, Any]]:
    """
    Les alertes vivantes d'un portefeuille, les écartées en moins.

    Chaque alerte porte `nouvelle` : vraie tant qu'elle n'a pas été annoncée. C'est ce
    drapeau que l'interface consomme pour ne lever le toast qu'une fois.
    """
    ref = aujourdhui or date.today()
    evs = evenements_macro_du_flux(tickers, ref)

    retenues: list[dict[str, Any]] = []
    for e in evs:
        jours = e.get("jours")
        # ⚠️ `jours` peut manquer ; sans lui on ne sait pas si l'échéance est dans la
        # fenêtre, et une alerte dont on ignore la date n'a rien à annoncer.
        if not isinstance(jours, int) or jours < 0 or jours > FENETRE_JOURS:
            continue
        retenues.append(e)

    cles = [cle_alerte(e) for e in retenues]
    connus = _etats(db, user_id, cles)

    vivantes: list[dict[str, Any]] = []
    for e, cle in zip(retenues, cles):
        etat = connus.get(cle)
        if etat is not None and etat.supprimee_le is not None:
            continue
        vivantes.append({
            **e,
            "cle": cle,
            "nouvelle": etat is None or etat.vue_le is None,
        })

    # ⚠️ La plus proche d'abord : c'est l'ordre dans lequel elles deviennent utiles.
    vivantes.sort(key=lambda a: (a.get("jours") if isinstance(a.get("jours"), int) else 99,
                                 a.get("libelle") or ""))
    return vivantes


def _ligne(db: Session, user_id: str, cle: str) -> EtatAlerte:
    """La ligne d'état du couple compte/alerte, créée si elle manque."""
    ligne = (db.query(EtatAlerte)
             .filter(EtatAlerte.user_id == user_id, EtatAlerte.cle == cle)
             .first())
    if ligne is None:
        ligne = EtatAlerte(id=f"{user_id}:{cle}", user_id=user_id, cle=cle)
        db.add(ligne)
    return ligne


def marquer_vues(db: Session, user_id: str, cles: list[str]) -> int:
    """
    Note que ces alertes ont été annoncées. Rend le nombre de lignes touchées.

    ⚠️ **Idempotent, et il le faut.** L'interface annonce puis marque ; si la réponse se
    perd et qu'elle réessaie, la seconde passe ne doit pas écraser l'heure de la première
    ni créer un doublon.
    """
    touchees = 0
    for cle in cles:
        ligne = _ligne(db, user_id, cle)
        if ligne.vue_le is None:
            ligne.vue_le = datetime.utcnow()
            touchees += 1
    db.commit()
    return touchees


def supprimer(db: Session, user_id: str, cle: str) -> None:
    """
    Écarte l'alerte pour ce compte, définitivement.

    ⚠️ **On date la suppression, on n'efface pas la ligne.** Effacer l'aurait fait
    revenir : à l'appel suivant, le calendrier rend la même échéance, aucune ligne ne dit
    qu'elle a été écartée, et l'alerte reparaît comme neuve.
    """
    ligne = _ligne(db, user_id, cle)
    if ligne.supprimee_le is None:
        ligne.supprimee_le = datetime.utcnow()
    db.commit()
