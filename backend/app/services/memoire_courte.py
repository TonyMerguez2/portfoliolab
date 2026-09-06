"""
Une mémoire de quelques minutes pour les lectures coûteuses.

⚠️ **Écrite contre une mesure.** Un chargement de la vue générale demandait au serveur, entre
autres, huit fenêtres d'historique, deux fois les positions et deux fois l'analyse. Chacune
recalcule la même chose à partir des mêmes transactions et des mêmes cours ; chacune attend
Yahoo. Mesuré dans le navigateur sur le site en ligne : trente-quatre appels, le dernier rendu
à 18,9 secondes, quand un seul de ces appels pris isolément répond en 0,68 s. Ce n'est pas la
lenteur d'un calcul, c'est leur nombre.

⚠️ **Ce que cette mémoire ne doit pas faire, c'est mentir.** Un portefeuille dont on vient de
saisir une transaction doit se relire à jour, sinon l'utilisateur croit sa saisie perdue et la
refait. D'où deux garde-fous :

— **Une durée courte**, `SECONDES`. Trois minutes : assez pour couvrir un chargement de page et
  les allers-retours entre onglets qui suivent, trop peu pour qu'un cours devienne faux — les
  cours de clôture ne bougent pas dans la journée, et l'intraday n'a pas cette précision.

— **`oublier()`, appelé à chaque écriture.** Toute route qui modifie un portefeuille efface ses
  entrées. C'est la règle qui compte : sans elle, la durée courte ne serait qu'un pari.

⚠️ **En mémoire du processus, et non sur disque ni dans Redis.** Un seul serveur, un seul
travailleur uvicorn : un cache partagé n'aurait rien à partager, et ajouterait une pièce à
faire tourner. Le jour où il y aura plusieurs travailleurs, cette décision sera à reprendre —
avant, pas après.
"""

from __future__ import annotations

import threading
import time
from typing import Any

#: Trois minutes.
SECONDES = 180

_verrou = threading.Lock()
_entrees: dict[tuple, tuple[float, Any]] = {}


def lire(cle: tuple) -> Any | None:
    """La valeur retenue pour cette clé, si elle n'a pas dépassé `SECONDES`."""
    with _verrou:
        entree = _entrees.get(cle)
        if entree is None:
            return None
        pose, valeur = entree
        if time.monotonic() - pose > SECONDES:
            del _entrees[cle]
            return None
        return valeur


def retenir(cle: tuple, valeur: Any) -> Any:
    """Retient une valeur et la rend, pour pouvoir écrire `return retenir(cle, calcul())`."""
    with _verrou:
        _entrees[cle] = (time.monotonic(), valeur)
        # ⚠️ Le ménage se fait ici plutôt que dans une tâche de fond : sans lui, une mémoire
        # qui ne se vide jamais grandit à chaque portefeuille et chaque fenêtre consultés.
        if len(_entrees) > 500:
            limite = time.monotonic() - SECONDES
            for k in [k for k, (p, _) in _entrees.items() if p < limite]:
                del _entrees[k]
    return valeur


def oublier(portfolio_id: str) -> None:
    """
    Efface tout ce qui concerne un portefeuille.

    ⚠️ À appeler depuis **toute** route qui le modifie — transaction, compte, mouvement,
    objectif, pondérations. Une seule oubliée, et l'utilisateur voit son écran figé sur l'état
    d'avant sa saisie pendant trois minutes, ce qui est bien pire que trois minutes d'attente.
    """
    with _verrou:
        for k in [k for k in _entrees if len(k) > 1 and k[1] == portfolio_id]:
            del _entrees[k]


def memorise(nom: str):
    """
    Décore une route de lecture pour qu'elle ne recalcule pas ce qu'elle vient de rendre.

    ⚠️ **`functools.wraps` n'est pas cosmétique ici.** FastAPI lit la signature de la fonction
    pour savoir quoi injecter — la session, l'utilisateur, les paramètres d'adresse. Une
    enveloppe en `*args, **kwargs` sans `wraps` lui présenterait une fonction sans paramètres :
    plus d'authentification, plus de base, et la route rendrait 500. `wraps` pose
    `__wrapped__`, que `inspect.signature` suit, et la route garde sa vraie forme.

    La clé porte l'identifiant du compte : deux personnes ne partagent jamais une réponse, même
    pour un portefeuille de même identifiant.
    """
    import functools
    import inspect

    def decorateur(fn):
        def cle_de(kwargs):
            utilisateur = kwargs.get("user")
            return (nom, kwargs.get("portfolio_id"), kwargs.get("period"),
                    getattr(utilisateur, "id", None))

        # ⚠️ Les deux formes, parce que les routes lourdes sont repassées en `def` : une route
        # `async def` s'exécute *sur* la boucle d'événements et la retient pendant chaque appel
        # bloquant. Une enveloppe uniquement asynchrone les aurait forcées à le rester.
        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def enveloppe_async(*args, **kwargs):
                cle = cle_de(kwargs)
                deja = lire(cle)
                if deja is not None:
                    return deja
                return retenir(cle, await fn(*args, **kwargs))
            return enveloppe_async

        @functools.wraps(fn)
        def enveloppe(*args, **kwargs):
            cle = cle_de(kwargs)
            deja = lire(cle)
            if deja is not None:
                return deja
            return retenir(cle, fn(*args, **kwargs))
        return enveloppe

    return decorateur


def tout_oublier() -> None:
    """Vide entièrement la mémoire, pour une écriture qui ne désigne aucun portefeuille."""
    with _verrou:
        _entrees.clear()
