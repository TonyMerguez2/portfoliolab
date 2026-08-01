"""
Parcours complet de la page de construction, côté API.

Les tests de `test_transactions.py` couvrent le calcul des positions ; celui-ci
couvre ce que la page de construction en fait réellement : créer un portefeuille,
y déposer des écritures datées, et retrouver le prix de revient qu'elles
impliquent. C'est le chemin qui portait le bug — le cours du jour enregistré sur
une transaction datée d'il y a deux ans — et rien ne le testait.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_transactions_api.py -v
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
    """Application montée sur une base jetable, sans authentification."""
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    engine = create_engine(f"sqlite:///{fichier.name}", connect_args={"check_same_thread": False})

    from app.main import app
    from app.core.database import get_db, Base
    from app.core.auth import require_auth

    Base.metadata.create_all(engine)

    def get_db_test():
        with Session(engine) as session:
            yield session

    # Un compte de test : les portefeuilles appartiennent désormais à
    # quelqu'un, une dépendance renvoyant None ne suffit plus.
    compte = SimpleNamespace(id="user-test", email="test@novac.local", username="Test")

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
        "assets": [{"ticker": "AAPL", "weight": 60}, {"ticker": "MSFT", "weight": 40}],
        "color": "#5B8DEF",
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def ecriture(ticker, qty, prix, date, side="BUY", fees=0.0, note=None):
    return {
        "ticker": ticker, "asset_type": "EQUITY", "side": side,
        "quantity": qty, "unit_price": prix, "fees": fees,
        "executed_at": f"{date}T00:00:00", "note": note,
    }


# ── Le parcours du builder ────────────────────────────────────────────────────

def test_creation_puis_ecritures(client):
    """Ce que fait la page de construction : un portefeuille, puis ses écritures."""
    pid = creer_portefeuille(client)

    # Cours réels du 15 mars 2024, ceux que /price-at renvoie.
    for e in [ecriture("AAPL", 17.55354, 170.91, "2024-03-15"),
              ecriture("MSFT", 7.330685, 409.24, "2024-03-15")]:
        r = client.post(f"/api/v1/portfolios/{pid}/transactions", json=e)
        assert r.status_code == 201, r.text

    r = client.get(f"/api/v1/portfolios/{pid}/transactions")
    assert r.status_code == 200
    txs = r.json()["transactions"] if isinstance(r.json(), dict) else r.json()
    assert len(txs) == 2


def test_prix_de_revient_est_celui_saisi(client):
    """
    Le PRU doit valoir le cours de la date d'achat, pas celui d'aujourd'hui.

    C'est tout l'objet du changement : l'ancienne page enregistrait le cours du
    jour sur une écriture datée d'il y a deux ans.
    """
    pid = creer_portefeuille(client)
    client.post(f"/api/v1/portfolios/{pid}/transactions",
                json=ecriture("NVDA", 22.80884, 87.69, "2024-03-15"))

    r = client.get(f"/api/v1/portfolios/{pid}/positions")
    assert r.status_code == 200
    pos = {p["ticker"]: p for p in r.json()["positions"]}
    assert pos["NVDA"]["avg_cost"] == pytest.approx(87.69, abs=1e-4)
    assert pos["NVDA"]["invested"] == pytest.approx(22.80884 * 87.69, abs=1e-2)


def test_deux_achats_dates_donnent_un_pru_pondere(client):
    """Un renfort à une autre date déplace le PRU, il ne l'écrase pas."""
    pid = creer_portefeuille(client)
    client.post(f"/api/v1/portfolios/{pid}/transactions", json=ecriture("AAPL", 10, 100.0, "2024-01-05"))
    client.post(f"/api/v1/portfolios/{pid}/transactions", json=ecriture("AAPL", 10, 200.0, "2024-06-05"))

    pos = {p["ticker"]: p for p in client.get(f"/api/v1/portfolios/{pid}/positions").json()["positions"]}
    assert pos["AAPL"]["quantity"] == pytest.approx(20.0)
    assert pos["AAPL"]["avg_cost"] == pytest.approx(150.0)


def test_source_est_les_transactions(client):
    """Le dashboard doit savoir qu'il lit des écritures, pas des poids."""
    pid = creer_portefeuille(client)
    client.post(f"/api/v1/portfolios/{pid}/transactions", json=ecriture("AAPL", 5, 150.0, "2024-03-15"))
    assert client.get(f"/api/v1/portfolios/{pid}/positions").json()["source"] == "transactions"


def test_vente_superieure_au_detenu_refusee(client):
    """Le builder peut produire une vente ; elle doit rester contrôlée."""
    pid = creer_portefeuille(client)
    client.post(f"/api/v1/portfolios/{pid}/transactions", json=ecriture("AAPL", 5, 150.0, "2024-03-15"))
    r = client.post(f"/api/v1/portfolios/{pid}/transactions",
                    json=ecriture("AAPL", 10, 180.0, "2024-04-15", side="SELL"))
    assert r.status_code == 400


def test_vente_anterieure_a_l_achat_refusee(client):
    """
    Une date antérieure à l'achat ne doit pas passer.

    La saisie laisse choisir n'importe quelle date passée ; rien n'empêche
    l'utilisateur de dater une vente d'avant l'achat correspondant.
    """
    pid = creer_portefeuille(client)
    client.post(f"/api/v1/portfolios/{pid}/transactions", json=ecriture("AAPL", 10, 150.0, "2024-03-15"))
    r = client.post(f"/api/v1/portfolios/{pid}/transactions",
                    json=ecriture("AAPL", 5, 180.0, "2024-01-10", side="SELL"))
    assert r.status_code == 400


def test_portefeuille_inconnu(client):
    r = client.post("/api/v1/portfolios/inexistant/transactions",
                    json=ecriture("AAPL", 1, 150.0, "2024-03-15"))
    assert r.status_code == 404


# ── Note libre ────────────────────────────────────────────────────────────────

def test_note_conservee(client):
    """Le mémo doit survivre à l'aller-retour ; sans lui il n'est qu'un champ mort."""
    pid = creer_portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/transactions",
                    json=ecriture("AAPL", 5, 122.93, "2023-01-05", note="PEA Boursorama"))
    assert r.status_code == 201
    assert r.json()["note"] == "PEA Boursorama"

    txs = client.get(f"/api/v1/portfolios/{pid}/transactions").json()
    txs = txs["transactions"] if isinstance(txs, dict) else txs
    assert txs[0]["note"] == "PEA Boursorama"


def test_note_absente_vaut_null(client):
    """Une note vide ne doit pas s'enregistrer comme chaîne vide."""
    pid = creer_portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/transactions",
                    json=ecriture("AAPL", 5, 122.93, "2023-01-05"))
    assert r.json()["note"] is None

    r2 = client.post(f"/api/v1/portfolios/{pid}/transactions",
                     json=ecriture("MSFT", 1, 300.0, "2023-01-05", note="   "))
    assert r2.json()["note"] is None


def test_quantite_fractionnaire(client):
    """
    Saisir un montant produit des quantités à huit décimales.

    1 000 € d'Apple à 308,91 € font 3,23718883 titres : la quantité doit être
    stockée telle quelle, sans arrondi qui décalerait le prix de revient.
    """
    pid = creer_portefeuille(client)
    q = 3.23718883
    client.post(f"/api/v1/portfolios/{pid}/transactions", json=ecriture("AAPL", q, 308.91, "2026-01-05"))
    pos = {p["ticker"]: p for p in client.get(f"/api/v1/portfolios/{pid}/positions").json()["positions"]}
    assert pos["AAPL"]["quantity"] == pytest.approx(q, abs=1e-8)
    assert pos["AAPL"]["invested"] == pytest.approx(1000.0, abs=1e-2)


# ── Cloisonnement entre comptes ───────────────────────────────────────────────

def test_portefeuille_d_autrui_invisible(client):
    """
    Le portefeuille d'un autre compte doit rester hors d'atteinte.

    404 et non 403 : répondre « interdit » confirmerait son existence à qui
    essaie des identifiants au hasard.
    """
    from app.main import app
    from app.core.auth import require_auth

    pid = creer_portefeuille(client, "Le mien")

    autre = SimpleNamespace(id="user-autre", email="autre@novac.local", username="Autre")
    app.dependency_overrides[require_auth] = lambda: autre

    assert client.get("/api/v1/portfolios").json() == []
    r = client.post(f"/api/v1/portfolios/{pid}/transactions",
                    json=ecriture("AAPL", 1, 150.0, "2024-03-15"))
    assert r.status_code == 404
    assert client.delete(f"/api/v1/portfolios/{pid}").status_code == 404
    assert client.put(f"/api/v1/portfolios/{pid}", json={"name": "Volé"}).status_code == 404


def test_liste_limitee_au_compte(client):
    """Chaque compte ne voit que les siens."""
    from app.main import app
    from app.core.auth import require_auth

    creer_portefeuille(client, "A1")
    creer_portefeuille(client, "A2")

    autre = SimpleNamespace(id="user-autre", email="autre@novac.local", username="Autre")
    app.dependency_overrides[require_auth] = lambda: autre
    creer_portefeuille(client, "B1")
    assert [p["name"] for p in client.get("/api/v1/portfolios").json()] == ["B1"]


def test_portefeuilles_sans_proprietaire_adoptes(client):
    """
    Les portefeuilles d'avant les comptes sont rattachés, pas masqués.

    Les filtrer sans les adopter les ferait disparaître de la liste — pour qui
    les a créés, cela ne se distingue pas d'une perte de données.
    """
    from app.core.database import Portfolio

    pid = creer_portefeuille(client, "Ancien")

    # On simule l'état d'avant la migration.
    from app.main import app
    from app.core.database import get_db
    db = next(app.dependency_overrides[get_db]())
    db.query(Portfolio).filter(Portfolio.id == pid).first().user_id = None
    db.commit()

    noms = [p["name"] for p in client.get("/api/v1/portfolios").json()]
    assert "Ancien" in noms


# ── Session ───────────────────────────────────────────────────────────────────

def test_me_refuse_sans_session():
    """
    `/auth/me` doit rejeter une session absente ou invalide.

    Elle renvoyait `{"message": "use Authorization header"}` avec un 200 : toute
    vérification de session la croyait valide, et l'interface qui enregistrait
    la réponse remplaçait le compte mémorisé — pseudo et avatar compris — par
    ce message.
    """
    from fastapi.testclient import TestClient
    from app.main import app

    app.dependency_overrides.clear()
    with TestClient(app) as c:
        assert c.get("/api/v1/auth/me").status_code == 401
        assert c.get("/api/v1/auth/me",
                     headers={"Authorization": "Bearer pas-un-jeton"}).status_code == 401


def test_me_renvoie_le_compte(client):
    """La réponse porte le pseudo et l'avatar, que l'interface réaffiche."""
    from app.main import app
    from app.core.auth import require_auth

    compte = SimpleNamespace(id="u1", email="a@b.c", username="Sacha", avatar_url="/uploads/u1.jpg")
    app.dependency_overrides[require_auth] = lambda: compte

    d = client.get("/api/v1/auth/me").json()
    assert d["username"] == "Sacha"
    assert d["avatar_url"] == "/uploads/u1.jpg"
    assert "message" not in d
