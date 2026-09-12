"""
Le bandeau d'actifs : ce qu'il fait quand la source de cours tombe.

⚠️ **Le cas couvert ici est celui qui a été constaté, pas un cas imaginé.** Yahoo a répondu
`YFRateLimitError` pendant la mise au point ; `yf.download` ne lève rien dans ce cas, il rend
un tableau vide. La première version rangeait donc une liste vide dans le cache et le bandeau
disparaissait de la page d'accès — la seule page publique du site — jusqu'au prochain
rafraîchissement réussi.
"""

import time

import pytest

from app.services import bandeau


@pytest.fixture(autouse=True)
def cache_vierge():
    """Chaque test part d'un service qui n'a rien calculé."""
    bandeau._cache = None
    bandeau._en_cours = False
    bandeau._echec_le = 0.0
    yield
    bandeau._cache = None
    bandeau._en_cours = False
    bandeau._echec_le = 0.0


def test_un_calcul_vide_est_un_echec(monkeypatch):
    """Zéro actif exploitable doit lever, pour ne jamais être rangé comme un résultat."""
    monkeypatch.setattr(bandeau.yf, "download", lambda *a, **k: {})
    with pytest.raises(RuntimeError):
        bandeau._calculer()


def test_l_instantane_precedent_survit_a_un_echec(monkeypatch):
    """
    C'est la garantie qui compte : un rafraîchissement raté laisse l'ancien en place.
    """
    bon = {"horodatage": 1, "actifs": [{"symbole": "AAPL", "cours": 100.0, "variation": 1.0}]}
    # Rangé comme s'il avait été calculé il y a longtemps : donc périmé, donc à rafraîchir.
    bandeau._cache = (time.time() - bandeau.DUREE_CACHE - 1, bon)

    appels = []

    def calcul_qui_echoue():
        appels.append(1)
        raise RuntimeError("quota amont")

    monkeypatch.setattr(bandeau, "_calculer", calcul_qui_echoue)

    # L'appel déclenche le rafraîchissement en fond et rend l'instantané connu tout de suite.
    assert bandeau.instantane() == bon

    # Le fil de fond a le temps de se plaindre, puis on vérifie que rien n'a été écrasé.
    for _ in range(50):
        if appels:
            break
        time.sleep(0.02)
    time.sleep(0.05)
    assert bandeau.instantane() == bon


def test_un_echec_repousse_la_prochaine_tentative(monkeypatch):
    """Sur un quota, réessayer toutes les trente secondes prolonge la limite."""
    bon = {"horodatage": 1, "actifs": [{"symbole": "AAPL", "cours": 100.0, "variation": 1.0}]}
    bandeau._cache = (time.time() - bandeau.DUREE_CACHE - 1, bon)
    bandeau._echec_le = time.time()

    appels = []
    monkeypatch.setattr(bandeau, "_calculer", lambda: appels.append(1) or bon)

    bandeau.instantane()
    time.sleep(0.1)
    assert appels == [], "un échec récent doit empêcher toute nouvelle tentative"


def test_un_symbole_muet_n_emporte_pas_les_autres(monkeypatch):
    """Neuf cours valides et un trou doivent rendre neuf lignes, pas une erreur."""
    import pandas as pd

    def faux_download(symboles, **k):
        colonnes = []
        donnees = {}
        for s in symboles:
            if s == "TSLA":
                continue  # absent du tableau rendu, comme le fait yfinance
            colonnes.append((s, "Close"))
            donnees[(s, "Close")] = [100.0, 102.0]
        return pd.DataFrame(donnees, columns=pd.MultiIndex.from_tuples(colonnes))

    monkeypatch.setattr(bandeau.yf, "download", faux_download)
    resultat = bandeau._calculer()
    symboles = [a["symbole"] for a in resultat["actifs"]]
    assert "TSLA" not in symboles
    assert len(symboles) == len(bandeau.SYMBOLES) - 1
    assert resultat["actifs"][0]["variation"] == 2.0
