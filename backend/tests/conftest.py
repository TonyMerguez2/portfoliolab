"""
Réglages communs à tous les tests.

Exécution : cd backend && ./venv/bin/python -m pytest
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def cache_details_isole(tmp_path, monkeypatch):
    """
    Aucun test n'écrit dans le cache de fiches du projet.

    ⚠️ Ce garde-fou vient d'un dégât réel, pas d'un principe. Le cache des fiches
    de titres — secteurs, classes d'actifs, volumes — a été posé sur disque pour
    survivre aux redémarrages du serveur. Aussitôt, un test qui préexistait,
    `test_un_succes_est_garde_longtemps`, a appelé `_details_titre("X")` avec un
    yfinance simulé : l'écriture a suivi, et le fichier du projet — qui contenait
    la ventilation sectorielle des trois lignes d'un vrai PEA — s'est retrouvé
    réduit à une entrée de test de 162 octets.

    Conséquence visible à l'écran : la diversification est repassée à « — » et la
    note s'est calculée sur quatre facteurs au lieu de cinq. Un test qui casse
    l'application qu'il vérifie est le pire des cas, parce qu'il passe en le
    faisant.

    `autouse` plutôt qu'à la demande : le prochain test à toucher le cache ne
    saurait pas qu'il doit s'isoler, et le dégât est silencieux.
    """
    import app.api.routes.transactions as routes

    monkeypatch.setattr(routes, "_FICHIER_CACHE", tmp_path / "cache_details.json")
    monkeypatch.setattr(routes, "_CACHE_MTIME", None)
    yield
