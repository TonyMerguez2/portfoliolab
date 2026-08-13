"""
Les comptes déclarés d'un portefeuille, côté API.

Ces routes remplacent une **déduction** par une **donnée** : jusqu'ici chaque ligne était
rangée dans « PEA », « CTO » ou « Crypto » d'après sa place de cotation, ce qui ne pouvait
ni décrire un compte courant ni distinguer deux PEA. Ce qu'on éprouve ici, c'est
précisément ce qu'une inférence ne garantissait pas : qu'un compte appartienne à un
portefeuille et à un seul, que son genre soit reconnu, et qu'en le supprimant on ne
supprime pas l'histoire des opérations qu'il portait.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_comptes_api.py -v
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


@pytest.fixture(name="client")
def client_fixture():
    """Application montée sur une base jetable, avec un compte de test."""
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    engine = create_engine(f"sqlite:///{fichier.name}",
                           connect_args={"check_same_thread": False})

    from app.main import app
    from app.core.database import get_db, Base
    from app.core.auth import require_auth

    Base.metadata.create_all(engine)

    def get_db_test():
        with Session(engine) as session:
            yield session

    compte = SimpleNamespace(id="user-test", email="test@novac.local", username="Test",
                             avatar_url=None, devise=None)

    app.dependency_overrides[get_db] = get_db_test
    app.dependency_overrides[require_auth] = lambda: compte

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    engine.dispose()
    os.unlink(fichier.name)


def creer_portefeuille(client, nom="Test"):
    r = client.post("/api/v1/portfolios", json={
        "name": nom,
        "assets": [{"ticker": "AAPL", "weight": 100}],
        "color": "#5B8DEF",
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def compte_valide(**ecrase):
    return {"nom": "PEA Boursorama", "genre": "pea", "couleur": "#22C55E", **ecrase}


# ── Le parcours ordinaire ─────────────────────────────────────────────────────

def test_creation_lecture_modification(client):
    pid = creer_portefeuille(client)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide(solde=1200.0))
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["nom"] == "PEA Boursorama"
    assert c["genre"] == "pea"
    assert c["libelle_genre"] == "PEA"
    assert c["porte_des_titres"] is True
    assert c["solde"] == 1200.0

    liste = client.get(f"/api/v1/portfolios/{pid}/comptes").json()
    assert [x["id"] for x in liste] == [c["id"]]

    r = client.put(f"/api/v1/portfolios/{pid}/comptes/{c['id']}",
                   json=compte_valide(nom="  PEA Fortuneo  ", couleur="#F43F5E"))
    assert r.status_code == 200, r.text
    # Le nom est nettoyé à l'enregistrement, pas seulement à l'affichage.
    assert r.json()["nom"] == "PEA Fortuneo"
    assert r.json()["couleur"] == "#F43F5E"


def test_un_compte_sans_titres_se_declare_aussi(client):
    """
    ⚠️ **C'est le cas que l'inférence ne pouvait pas atteindre.** Un livret ne détient
    aucune ligne, donc aucune place de cotation ne le révèle : il n'existait tout
    simplement pas dans l'écran des comptes. Sa valeur est son solde, et le drapeau
    `porte_des_titres` est ce qui empêche de l'additionner comme un portefeuille.
    """
    pid = creer_portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/comptes",
                    json={"nom": "Livret A", "genre": "epargne",
                          "couleur": "#F59E0B", "solde": 8400.0})
    assert r.status_code == 200, r.text
    assert r.json()["porte_des_titres"] is False
    assert r.json()["solde"] == 8400.0


def test_le_rang_range_en_queue(client):
    """On déclare un compte de plus ; on ne réordonne pas ceux qu'on avait rangés."""
    pid = creer_portefeuille(client)
    for nom in ["Premier", "Deuxième", "Troisième"]:
        client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide(nom=nom))
    liste = client.get(f"/api/v1/portfolios/{pid}/comptes").json()
    assert [c["nom"] for c in liste] == ["Premier", "Deuxième", "Troisième"]
    assert [c["rang"] for c in liste] == [0, 1, 2]


def test_les_genres_sont_publies(client):
    """
    Le formulaire ne réécrit pas la liste : recopiée, elle aurait divergé au premier
    genre ajouté, et l'écran aurait proposé un choix que le serveur refuse.
    """
    genres = client.get("/api/v1/genres-de-compte").json()
    cles = {g["cle"] for g in genres}
    assert cles == {"courant", "epargne", "pea", "cto", "crypto"}
    assert {g["cle"] for g in genres if g["titres"]} == {"pea", "cto", "crypto"}


# ── Ce que la saisie doit refuser ─────────────────────────────────────────────

@pytest.mark.parametrize("charge, motif", [
    ({"nom": "", "genre": "pea", "couleur": "#22C55E"}, "nom vide"),
    ({"nom": "   ", "genre": "pea", "couleur": "#22C55E"}, "nom fait d'espaces"),
    ({"nom": "x" * 61, "genre": "pea", "couleur": "#22C55E"}, "nom trop long"),
    ({"nom": "A", "genre": "assurance-vie", "couleur": "#22C55E"}, "genre inconnu"),
    ({"nom": "A", "genre": "pea", "couleur": "vert"}, "couleur non hexadécimale"),
    ({"nom": "A", "genre": "pea", "couleur": "#22C5"}, "couleur trop courte"),
    ({"nom": "A", "genre": "pea", "couleur": "#22C55E", "solde": -1}, "solde négatif"),
])
def test_saisies_refusees(client, charge, motif):
    """
    ⚠️ **Le nom fait d'espaces est le cas qui a fait inverser l'ordre du contrôle.**
    Mesuré avant nettoyage, « soixante espaces » passe la longueur et donne un compte
    sans nom visible — présent dans la base, invisible à l'écran.
    """
    pid = creer_portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json=charge)
    assert r.status_code == 400, f"{motif} accepté : {r.text}"


# ── L'appartenance ────────────────────────────────────────────────────────────

def test_un_compte_ne_se_lit_pas_depuis_un_autre_portefeuille(client):
    """
    ⚠️ **Le filtre porte sur les deux identifiants, et voici pourquoi.** Chercher par le
    seul identifiant de compte laisserait modifier celui d'un autre portefeuille — d'un
    autre épargnant, le jour où il y en a plusieurs — pourvu qu'on en devine l'UUID.
    """
    a = creer_portefeuille(client, "A")
    b = creer_portefeuille(client, "B")
    cid = client.post(f"/api/v1/portfolios/{a}/comptes", json=compte_valide()).json()["id"]

    assert client.get(f"/api/v1/portfolios/{b}/comptes").json() == []
    assert client.put(f"/api/v1/portfolios/{b}/comptes/{cid}",
                      json=compte_valide(nom="Détourné")).status_code == 404
    assert client.delete(f"/api/v1/portfolios/{b}/comptes/{cid}").status_code == 404
    # Et le compte d'origine n'a pas bougé.
    assert client.get(f"/api/v1/portfolios/{a}/comptes").json()[0]["nom"] == "PEA Boursorama"


def test_portefeuille_inconnu(client):
    r = client.post("/api/v1/portfolios/inexistant/comptes", json=compte_valide())
    assert r.status_code == 404


def test_une_operation_ne_se_range_pas_dans_le_compte_d_un_autre(client):
    """
    ⚠️ **Refuser plutôt qu'ignorer.** Écrire `None` en silence rangerait la ligne
    ailleurs que là où l'appelant l'a demandé. Et laisser passer l'identifiant la ferait
    disparaître des deux rangements à la fois : de son compte, qui n'est pas dans ce
    portefeuille, et du classement par déduction, qui ne regarde que les lignes détachées.
    """
    a = creer_portefeuille(client, "A")
    b = creer_portefeuille(client, "B")
    cid = client.post(f"/api/v1/portfolios/{a}/comptes", json=compte_valide()).json()["id"]

    ecriture = {"ticker": "AAPL", "asset_type": "EQUITY", "side": "BUY",
                "quantity": 1, "unit_price": 100.0, "fees": 0.0,
                "executed_at": "2024-01-10T00:00:00"}

    assert client.post(f"/api/v1/portfolios/{b}/transactions",
                       json={**ecriture, "compte_id": cid}).status_code == 400
    assert client.post(f"/api/v1/portfolios/{a}/transactions",
                       json={**ecriture, "compte_id": "inexistant"}).status_code == 400
    # Sans compte, la saisie passe comme avant : c'est le parcours de qui n'a rien déclaré.
    r = client.post(f"/api/v1/portfolios/{a}/transactions", json=ecriture)
    assert r.status_code in (200, 201), r.text
    assert r.json()["compte_id"] is None


# ── La suppression ────────────────────────────────────────────────────────────

def test_supprimer_un_compte_detache_ses_operations_sans_les_perdre(client):
    """
    ⚠️ **C'est l'invariant qui justifie une boucle explicite dans la route.** `compte_id`
    n'est pas une clé étrangère — SQLite ne sait pas en ajouter une par `ALTER TABLE`, et
    c'est par là que passent les bases déjà créées. Sans ce détachement, les lignes
    garderaient l'identifiant d'un compte disparu : elles ne s'afficheraient plus nulle
    part, ni dans un compte, ni dans le rangement par déduction qui ne regarde que les
    lignes détachées.

    ⚠️ **Et une opération ne se supprime pas avec son compte.** Elle a eu lieu : la
    valorisation du portefeuille en dépend.
    """
    pid = creer_portefeuille(client)
    cid = client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide()).json()["id"]

    r = client.post(f"/api/v1/portfolios/{pid}/transactions", json={
        "ticker": "AAPL", "asset_type": "EQUITY", "side": "BUY",
        "quantity": 3, "unit_price": 100.0, "fees": 0.0,
        "executed_at": "2024-01-10T00:00:00", "compte_id": cid,
    })
    assert r.status_code in (200, 201), r.text

    avant = client.get(f"/api/v1/portfolios/{pid}/transactions").json()
    assert len(avant) == 1
    # ⚠️ **Sans cette ligne, le test passait sans rien prouver.** La saisie ignorait
    # `compte_id` : l'opération n'était donc jamais rattachée, et le détachement
    # « réussissait » sur une ligne qui n'avait jamais rien à détacher.
    assert avant[0]["compte_id"] == cid, "l'opération n'a pas été rattachée au compte"

    r = client.delete(f"/api/v1/portfolios/{pid}/comptes/{cid}")
    assert r.status_code == 200, r.text

    apres = client.get(f"/api/v1/portfolios/{pid}/transactions").json()
    assert len(apres) == 1, "l'opération a disparu avec son compte"
    assert apres[0].get("compte_id") in (None, ""), "l'opération pointe un compte disparu"
    assert client.get(f"/api/v1/portfolios/{pid}/comptes").json() == []
