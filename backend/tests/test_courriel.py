"""
L'envoi de courriels, et surtout ce qu'il ne doit jamais faire.

⚠️ Ce qui s'éprouve ici n'est pas qu'un message part — c'est qu'une inscription réussit même
quand rien ne peut partir. L'adresse est le fait ; le courriel n'est qu'une politesse.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_courriel.py -v
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.services import courriel


@pytest.fixture(name="client")
def client_fixture(monkeypatch):
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    engine = create_engine(f"sqlite:///{fichier.name}", connect_args={"check_same_thread": False})

    from app.main import app
    from app.core.database import get_db, Base
    from app.models import attente  # noqa: F401

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


def test_sans_cle_rien_ne_part_et_rien_ne_casse(monkeypatch):
    monkeypatch.delenv("NOVAC_RESEND_CLE", raising=False)
    assert courriel.configure() is False
    assert courriel.envoyer("x@exemple.com", "s", "t") is False


def test_une_panne_du_fournisseur_ne_leve_pas(monkeypatch):
    """⚠️ Le fournisseur tombe un jour ou l'autre ; ce jour-là, le site continue."""
    monkeypatch.setenv("NOVAC_RESEND_CLE", "cle-de-test")

    def explose(*a, **k):
        raise RuntimeError("réseau coupé")

    monkeypatch.setattr(courriel.httpx, "post", explose)
    assert courriel.envoyer("x@exemple.com", "s", "t") is False


def test_l_inscription_reussit_meme_si_le_courriel_echoue(client, monkeypatch):
    monkeypatch.setattr(courriel, "envoyer_en_fond",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boum")))
    r = client.post("/api/v1/liste-attente", json={"email": "sacha@novac.fyi"})
    # ⚠️ Si ce test tombe, c'est qu'une panne d'envoi ferait perdre des inscriptions.
    assert r.status_code == 200, r.text
    assert r.json()["inscrit"] is True


def test_une_reinscription_n_envoie_pas_un_second_message(client, monkeypatch):
    """
    ⚠️ Deux raisons, et la seconde est la plus grave. On ne harcèle pas quelqu'un qui clique
    deux fois ; et un formulaire qui écrit à chaque envoi devient une arme à retourner contre
    une adresse tierce.
    """
    envois: list[str] = []
    monkeypatch.setattr(courriel, "envoyer_en_fond", lambda d, *a, **k: envois.append(d))
    client.post("/api/v1/liste-attente", json={"email": "sacha@novac.fyi"})
    client.post("/api/v1/liste-attente", json={"email": "SACHA@novac.fyi "})
    assert envois == ["sacha@novac.fyi"]


def test_une_adresse_refusee_n_envoie_rien(client, monkeypatch):
    envois: list[str] = []
    monkeypatch.setattr(courriel, "envoyer_en_fond", lambda d, *a, **k: envois.append(d))
    assert client.post("/api/v1/liste-attente", json={"email": "pas-une-adresse"}).status_code == 422
    assert envois == []
