"""
La mémoire courte des lectures coûteuses.

⚠️ Ce qui s'éprouve ici n'est pas qu'elle accélère — c'est qu'elle ne **ment** jamais. Une
réponse gardée après une écriture ferait croire à l'utilisateur que sa saisie s'est perdue, et
il la referait : une transaction en double vaut bien pire qu'un calcul refait.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_memoire_courte.py -v
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from app.services import memoire_courte as m


@pytest.fixture(autouse=True)
def memoire_vierge():
    m.tout_oublier()
    yield
    m.tout_oublier()


def test_ce_qui_est_retenu_se_relit():
    m.retenir(("history", "p1", "1y", "u1"), {"valeur": 42})
    assert m.lire(("history", "p1", "1y", "u1")) == {"valeur": 42}


def test_une_cle_absente_ne_rend_rien():
    assert m.lire(("history", "jamais-vu", None, "u1")) is None


def test_deux_comptes_ne_partagent_pas_une_reponse():
    """
    ⚠️ Le garde-fou le plus important du fichier. Deux personnes peuvent demander le même
    portefeuille — le nôtre et un partagé — et la réponse de l'une ne doit jamais servir à
    l'autre.
    """
    m.retenir(("positions", "p1", None, "moi"), ["à moi"])
    assert m.lire(("positions", "p1", None, "quelqu-un-d-autre")) is None


def test_une_ecriture_efface_ce_qui_concerne_le_portefeuille():
    m.retenir(("history", "p1", "1y", "u1"), "vieux")
    m.retenir(("positions", "p1", None, "u1"), "vieux")
    m.retenir(("history", "p2", "1y", "u1"), "intact")
    m.oublier("p1")
    assert m.lire(("history", "p1", "1y", "u1")) is None
    assert m.lire(("positions", "p1", None, "u1")) is None
    assert m.lire(("history", "p2", "1y", "u1")) == "intact"


def test_une_valeur_perimee_n_est_pas_rendue(monkeypatch):
    monkeypatch.setattr(m, "SECONDES", 0.05)
    m.retenir(("history", "p1", "1y", "u1"), "frais")
    assert m.lire(("history", "p1", "1y", "u1")) == "frais"
    time.sleep(0.08)
    assert m.lire(("history", "p1", "1y", "u1")) is None


def test_la_memoire_ne_grandit_pas_sans_fin(monkeypatch):
    """⚠️ Sans ménage, elle enfle d'une entrée par portefeuille et par fenêtre consultés."""
    monkeypatch.setattr(m, "SECONDES", 0.02)
    for i in range(600):
        m.retenir(("history", f"p{i}", "1y", "u1"), i)
    time.sleep(0.05)
    m.retenir(("history", "declencheur", "1y", "u1"), 0)
    assert len(m._entrees) < 600


def test_retenir_rend_la_valeur():
    """Pour pouvoir écrire `return retenir(cle, calcul())` sans variable intermédiaire."""
    assert m.retenir(("x", "p1", None, "u1"), "v") == "v"
