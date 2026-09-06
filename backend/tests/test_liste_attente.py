"""
La liste d'attente de l'alpha fermée, côté API.

Cette route est ouverte : le mot de passe de l'alpha la laisse passer, sans quoi personne
ne pourrait demander à entrer. Ce qui s'éprouve ici est donc ce qu'une route publique doit
tenir — qu'elle refuse ce qui n'est pas une adresse, qu'une même personne ne compte pas
deux fois, et qu'elle ne rende jamais la liste.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_liste_attente.py -v
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


@pytest.fixture(name="client")
def client_fixture():
    """L'application montée sur une base jetable. Aucune authentification : la route est ouverte."""
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    engine = create_engine(f"sqlite:///{fichier.name}",
                           connect_args={"check_same_thread": False})

    from app.main import app
    from app.core.database import get_db, Base
    # ⚠️ `from ... import` et non `import app.models.attente` : la seconde forme relie le nom
    # `app` au paquet et masque l'application FastAPI importée juste au-dessus.
    from app.models import attente  # noqa: F401  (déclare la table avant sa création)

    Base.metadata.create_all(engine)

    def get_db_test():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = get_db_test

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    engine.dispose()
    os.unlink(fichier.name)


def test_une_adresse_est_enregistree(client):
    r = client.post("/api/v1/liste-attente", json={"email": "sacha@novac.xyz"})
    assert r.status_code == 200
    assert r.json() == {"inscrit": True, "deja": False}


def test_la_meme_adresse_ne_compte_pas_deux_fois(client):
    """
    ⚠️ Se réinscrire est un geste banal — on ne se souvient pas de l'avoir fait — et doit
    réussir. La liste, elle, ne doit pas doubler.
    """
    client.post("/api/v1/liste-attente", json={"email": "sacha@novac.xyz"})
    r = client.post("/api/v1/liste-attente", json={"email": "sacha@novac.xyz"})
    assert r.status_code == 200
    assert r.json() == {"inscrit": True, "deja": True}


def test_la_casse_et_les_espaces_ne_font_pas_deux_personnes(client):
    """Le clavier d'un téléphone met une majuscule au premier caractère."""
    client.post("/api/v1/liste-attente", json={"email": "sacha@novac.xyz"})
    r = client.post("/api/v1/liste-attente", json={"email": "  Sacha@Novac.xyz "})
    assert r.json()["deja"] is True


@pytest.mark.parametrize("saisie", ["", "   ", "sacha", "sacha@", "@novac.xyz",
                                    "sacha@novac", "sacha novac@x.fr", "a" * 250 + "@x.fr"])
def test_ce_qui_n_est_pas_une_adresse_est_refuse(client, saisie):
    assert client.post("/api/v1/liste-attente", json={"email": saisie}).status_code == 422


def test_aucune_route_ne_rend_la_liste(client):
    """
    ⚠️ Le test le plus important du fichier. Une liste d'adresses est la donnée la plus
    sensible du site ; il ne doit exister aucun moyen de la lire depuis le web.
    """
    client.post("/api/v1/liste-attente", json={"email": "sacha@novac.xyz"})
    for chemin in ["/api/v1/liste-attente", "/api/v1/liste-attente/"]:
        r = client.get(chemin)
        assert r.status_code == 405, f"{chemin} répond {r.status_code}"
