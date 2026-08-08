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

import json
import os

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


# ── Connexion ─────────────────────────────────────────────────────────────────

def test_email_insensible_a_la_casse_et_aux_espaces():
    """
    Une majuscule mise par le clavier ne doit pas empêcher la connexion.

    La recherche était littérale : « Sacha@… » ne trouvait aucun compte, et le
    message « Email ou mot de passe incorrect » faisait accuser le mot de passe.
    """
    from app.api.routes.auth import _normaliser_email

    for saisie in ["Sacha@Exemple.com", " sacha@exemple.com ", "SACHA@EXEMPLE.COM"]:
        assert _normaliser_email(saisie) == "sacha@exemple.com"


def test_mot_de_passe_long_ne_leve_pas():
    """
    bcrypt refuse au-delà de 72 octets depuis la version 5.

    Il tronquait silencieusement avant : lever renverrait une erreur 500 sur un
    mot de passe qui fonctionnait la veille.
    """
    from app.api.routes.auth import _tronquer
    from app.core.auth import hash_password, verify_password

    long = "é" * 60          # 120 octets en UTF-8
    coupe = _tronquer(long)
    assert len(coupe.encode("utf-8")) <= 72
    assert verify_password(coupe, hash_password(coupe))


def test_tronquer_laisse_les_mots_de_passe_normaux():
    from app.api.routes.auth import _tronquer
    assert _tronquer("MonMotDePasse123!") == "MonMotDePasse123!"


# ── Analyse d'un portefeuille sans écritures ─────────────────────────────────
#
# Le bandeau du tableau de bord tire sa note de cette route. Un portefeuille
# défini par ses poids doit donc obtenir une analyse, et non un refus : sa
# composition suffit à la concentration, à la corrélation, à la volatilité et à
# la diversification en transparence. Seule la liquidité manque, faute de
# quantités détenues.

def test_analyse_sans_ecritures_utilise_les_poids_declares(client, monkeypatch):
    import yfinance

    import app.api.routes.transactions as routes
    import app.services.analyse as analyse

    pid = creer_portefeuille(client, "Poids seuls")

    # Les cours et yfinance sont coupés : on vérifie le choix de la source et des
    # poids, pas la capacité du réseau à répondre. Sans cela le test sortait
    # vraiment sur Internet et se faisait limiter.
    async def pas_de_cours(_tickers):
        return {}

    monkeypatch.setattr(routes, "fetch_current_prices", pas_de_cours)
    monkeypatch.setattr(yfinance, "download", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("réseau coupé")))

    captures = {}

    # ⚠️ Le patch porte sur le module qui **définit** la fonction, pas sur celui
    # de la route : la route l'importe dans son corps, donc son nom local est relié
    # à l'original au moment de l'appel.
    def facteurs_espion(poids, rendements, *a, **kw):
        captures["poids"] = dict(poids)
        return {"concentration": {"valeur": 0.5, "libelle": "2 lignes", "score": 40}}

    monkeypatch.setattr(analyse, "facteurs_de_risque", facteurs_espion)

    r = client.get(f"/api/v1/portfolios/{pid}/analysis")
    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "poids"
    assert d["score"] == 40
    # Les poids déclarés sont 60/40 et arrivent normalisés en pourcentage.
    assert set(captures["poids"]) == {"AAPL", "MSFT"}
    assert captures["poids"]["AAPL"] == pytest.approx(60.0)
    assert captures["poids"]["MSFT"] == pytest.approx(40.0)


def test_analyse_sans_ecritures_ni_poids_ne_note_pas(client, monkeypatch):
    """Sans composition, il n'y a rien à mesurer — et on le dit."""
    import app.api.routes.transactions as routes

    r = client.post("/api/v1/portfolios", json={"name": "Vide", "assets": []})
    pid = r.json()["id"]

    async def pas_de_cours(_tickers):
        return {}

    monkeypatch.setattr(routes, "fetch_current_prices", pas_de_cours)

    d = client.get(f"/api/v1/portfolios/{pid}/analysis").json()
    assert d["source"] == "aucune"
    assert d["score"] is None


# ── Le profil de risque, de bout en bout ─────────────────────────────────────

def test_le_profil_se_declare_et_revient_dans_l_analyse(client, monkeypatch):
    """
    ⚠️ Sans profil, la volatilité reste muette et l'interface doit pouvoir le dire.
    La route rend donc le profil, pas seulement les facteurs.

    Ils étaient trois — le bêta a été supprimé à l'audit pour biais de mesure, la
    perte maximale ne note plus car elle doublait la volatilité.
    """
    import yfinance

    import app.api.routes.transactions as routes

    pid = creer_portefeuille(client, "Avec profil")

    async def pas_de_cours(_tickers):
        return {}

    monkeypatch.setattr(routes, "fetch_current_prices", pas_de_cours)
    monkeypatch.setattr(yfinance, "download",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("réseau coupé")))

    # Avant déclaration : aucun profil.
    assert client.get(f"/api/v1/portfolios/{pid}/analysis").json()["profil"] is None

    r = client.put(f"/api/v1/portfolios/{pid}",
                   json={"horizon_annees": 20, "tolerance": "dynamique"})
    assert r.status_code == 200

    d = client.get(f"/api/v1/portfolios/{pid}/analysis").json()
    assert d["profil"]["part_actions"] == 100.0
    assert d["profil"]["volatilite"] == pytest.approx(16.0)
    assert d["profil"]["tolerance"] == "dynamique"


def test_une_tolerance_inconnue_est_refusee(client):
    """
    Refusée à l'écriture plutôt qu'ignorée à la lecture : acceptée en silence,
    elle ferait taire la volatilité et le portefeuille paraîtrait simplement moins
    bien noté, sans raison visible.
    """
    pid = creer_portefeuille(client, "Profil douteux")
    r = client.put(f"/api/v1/portfolios/{pid}", json={"tolerance": "agressif"})
    assert r.status_code == 422
    assert "prudent" in r.json()["detail"]


class TestLectureDesFrais:
    """
    Ce que le fournisseur dit des frais, et ce qu'il faut en croire.

    Relevé sur les trois fonds d'un vrai PEA :

        ESE.PA    Annual Report Expense Ratio = '0.0'    info : aucun champ de frais
        ETZ.PA    Annual Report Expense Ratio = '0.0'    info : aucun champ de frais
        PAEJ.PA   Annual Report Expense Ratio = '0.006'  info : netExpenseRatio = 0.6
    """

    def test_un_ter_nul_est_refuse(self):
        """
        ⚠️ Le refus le plus important de cette fonction.

        Le fournisseur annonce `0.0` pour ESE.PA et ETZ.PA, dont les frais réels
        tournent autour de 0,12 % et 0,20 %. Ce n'est pas une donnée absente mais une
        donnée **fausse**. Sans ce refus, les frais s'affichaient à 0,00 % par an avec
        une note de cent — la note la plus flatteuse possible, sur un chiffre inventé.
        """
        import app.api.routes.transactions as routes

        assert routes._pct_frais(0.0) is None
        assert routes._pct_frais("0.0") is None
        assert routes._pct_frais(-0.2) is None

    def test_les_deux_unites_sont_lues(self):
        """
        Le même TER arrive en fraction dans `fund_operations` et en pourcentage dans
        `info` : 0,006 et 0,6 pour PAEJ.PA. Le fournisseur n'annonce pas son unité.
        """
        import app.api.routes.transactions as routes

        assert routes._pct_frais(0.006) == pytest.approx(0.6)
        assert routes._pct_frais(0.6) == pytest.approx(0.6)

    def test_un_ter_implausible_est_refuse(self):
        """Au-delà de 3 % par an, aucune lecture ne donne un fonds réel."""
        import app.api.routes.transactions as routes

        assert routes._pct_frais(12.0) is None
        assert routes._pct_frais(0.00001) is None


class TestFraisSaisis:
    """
    Les frais courants saisis à la main.

    ⚠️ Le seul moyen de mesurer les frais d'un portefeuille européen. Le fournisseur
    ne publie presque jamais le TER des ETF domiciliés en Europe : mesuré sur un vrai
    PEA, un seul des trois fonds l'annonçait, soit 10 % du portefeuille — sous le
    seuil de couverture, donc le facteur restait muet. Or les frais sont le facteur
    le plus prédictif du résultat relatif sur vingt ans, et le seul qui soit certain.
    """

    def test_la_saisie_prime_sur_le_fournisseur(self):
        """
        Le TER dépend de la part détenue — capitalisante ou distribuante, couverte ou
        non — et le fournisseur n'en donne qu'une par ticker. Le document
        d'information de l'épargnant décrit exactement sa part.
        """
        import app.api.routes.transactions as routes

        details = {"A": {"frais": 0.40}, "B": {"frais": None}}
        connus = routes._frais_connus(details, {"A": 0.15, "B": 0.22})
        assert connus == {"A": 0.15, "B": 0.22}

    def test_le_fournisseur_sert_quand_rien_n_est_saisi(self):
        import app.api.routes.transactions as routes

        assert routes._frais_connus({"A": {"frais": 0.40}}, None) == {"A": 0.40}
        assert routes._frais_connus({"A": {"frais": 0.40}}, {}) == {"A": 0.40}

    def test_une_valeur_illisible_en_base_est_ignoree(self):
        """Écrite par une version antérieure, elle ne doit pas entrer dans la moyenne."""
        import app.api.routes.transactions as routes

        assert routes._frais_connus({}, {"A": "abc", "B": 0.2}) == {"B": 0.2}

    def test_le_ticker_est_normalise(self):
        import app.api.routes.transactions as routes

        assert routes._frais_connus({}, {"ese.pa": 0.15}) == {"ESE.PA": 0.15}


def test_les_frais_saisis_se_declarent_et_notent(client, monkeypatch):
    """
    Le parcours complet : sans saisie le facteur est muet, avec elle il note.
    """
    import yfinance

    import app.api.routes.transactions as routes

    pid = creer_portefeuille(client, "Frais à la main")
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("ESE.PA", 10, 100.0, "2026-01-05")).status_code == 201

    async def cours(tickers):
        return {t: 150.0 for t in tickers}

    monkeypatch.setattr(routes, "fetch_current_prices", cours)
    monkeypatch.setattr(yfinance, "download",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("réseau coupé")))
    monkeypatch.setattr(routes, "_details_titre", lambda t: {"nom": "Un fonds", "secteur": "Tech"})

    muet = client.get(f"/api/v1/portfolios/{pid}/analysis").json()
    assert muet["facteurs"]["frais"]["score"] is None

    r = client.put(f"/api/v1/portfolios/{pid}", json={"frais_lignes": {"ESE.PA": 0.15}})
    assert r.status_code == 200

    note = client.get(f"/api/v1/portfolios/{pid}/analysis").json()["facteurs"]["frais"]
    assert note["valeur"] == pytest.approx(0.15)
    assert note["score"] > 90, "0,15 % par an est proche du meilleur tracker"


def test_un_ter_hors_bornes_est_refuse(client):
    """
    ⚠️ Validé à l'écriture, comme la tolérance. La borne haute protège surtout d'une
    confusion d'unité : quelqu'un qui tape « 15 » pour 0,15 % verra son erreur
    refusée, au lieu d'obtenir zéro sur cent aux frais sans comprendre pourquoi.
    """
    pid = creer_portefeuille(client, "Frais douteux")
    r = client.put(f"/api/v1/portfolios/{pid}", json={"frais_lignes": {"ESE.PA": 15.0}})
    assert r.status_code == 422
    assert "0 à 5" in r.json()["detail"]

    # Zéro est accepté : certains fonds n'ont réellement aucun frais courant.
    assert client.put(f"/api/v1/portfolios/{pid}",
                      json={"frais_lignes": {"ESE.PA": 0.0}}).status_code == 200


class TestProxyDeComposition:
    """
    Le repli sur l'indice, pour les fonds qui ne publient pas leur composition.

    ⚠️ Un ETF synthétique détient un contrat d'échange, pas des actions : il n'a rien
    à publier. Mais son exposition économique **est** celle de l'indice, et un ETF
    physique sur le même indice publie la sienne. La lire là mesure donc la bonne
    chose ; ce n'est pas un pis-aller.
    """

    def test_l_indice_est_reconnu_dans_le_nom_du_fonds(self):
        import app.api.routes.transactions as routes

        vus = []

        def faux_hhi(fd):
            vus.append(fd)
            return 1 / 55, True

        import yfinance
        routes._CACHE_DETAILS.clear()
        original = routes._hhi_du_fonds
        routes._hhi_du_fonds = faux_hhi
        yf_original = yfinance.Ticker
        yfinance.Ticker = lambda t: type("T", (), {"funds_data": t})()
        try:
            hhi = routes._hhi_de_l_indice("BNP Paribas Easy S&P 500 UCITS ETF")
        finally:
            routes._hhi_du_fonds = original
            yfinance.Ticker = yf_original
        assert hhi == pytest.approx(1 / 55)
        # Le premier candidat de la table pour le S&P 500.
        assert vus and vus[0] == "CSPX.AS"

    def test_un_indice_inconnu_ne_replie_pas(self):
        """
        Aucune correspondance devinée. Un nom non reconnu laisse la ligne non
        mesurée — c'est ce qui évite de refaire l'erreur de la géographie, où une
        étiquette manquante valait une note.
        """
        import app.api.routes.transactions as routes

        assert routes._hhi_de_l_indice("Fonds obscur sans indice") is None
        assert routes._hhi_de_l_indice(None) is None

    def test_les_indices_etroits_sont_volontairement_absents(self):
        """
        ⚠️ L'erreur grave serait d'associer un indice **étroit** à un proxy large :
        un fonds de trente valeurs recevrait la note d'un fonds de cinq cents. Le
        Euro Stoxx 50, le CAC 40 et les indices sectoriels n'ont donc pas de proxy.
        """
        import app.api.routes.transactions as routes

        for etroit in ("cac 40", "euro stoxx 50", "stoxx 50"):
            assert all(motif != etroit for motif, _ in routes.PROXY_COMPOSITION), etroit
        assert routes._hhi_de_l_indice("Amundi CAC 40 UCITS ETF") is None

    def test_les_motifs_precis_passent_devant(self):
        """
        « nasdaq 100 » avant « nasdaq », comme pour la table des zones : l'ordre
        décide, et un motif large placé devant avalerait le précis.
        """
        import app.api.routes.transactions as routes

        motifs = [m for m, _ in routes.PROXY_COMPOSITION]
        assert motifs.index("nasdaq 100") < motifs.index("nasdaq")
        assert motifs.index("stoxx europe 600") < motifs.index("stoxx europe")

    def test_la_composition_de_l_indice_ne_pollue_pas_la_fiche_du_fonds(self):
        """
        ⚠️ Les entrées de proxy portent un préfixe réservé.

        Rangées sous le ticker du fonds qui publie, un utilisateur détenant
        réellement ce fonds aurait reçu une fiche amputée de ses secteurs et de son
        nom — la composition de l'indice l'aurait écrasée.
        """
        import app.api.routes.transactions as routes

        assert routes._CLE_PROXY.startswith("@")
        # Un préfixe impossible dans un ticker réel.
        assert not routes._CLE_PROXY[0].isalnum()


class TestHhiDuFonds:
    """
    La concentration **interne** d'un fonds, lue dans sa composition publiée.

    Elle alimente la concentration en transparence, dont la formule est Σ Wᵢ²·HHIᵢ.
    Testée sans réseau, sur des compositions relevées sur de vrais fonds.
    """

    @staticmethod
    def _fd(poids, colonne="Holding Percent"):
        """Un faux `funds_data`, à la forme que rend le fournisseur."""
        import pandas as pd

        class Faux:
            top_holdings = (pd.DataFrame({"Name": [f"S{i}" for i in range(len(poids))],
                                          colonne: poids})
                            if poids is not None else None)
        return Faux()

    def test_un_fonds_monde_pese_beaucoup_de_societes(self):
        import app.api.routes.transactions as routes

        # VT, relevé : dix premières lignes à 20,5 %, la plus grosse à 4,0 %.
        vt = [0.040, 0.035, 0.025, 0.020, 0.018, 0.016, 0.015, 0.014, 0.013, 0.009]
        hhi, abouti = routes._hhi_du_fonds(self._fd(vt))
        assert abouti and hhi is not None
        assert 150 < 1 / hhi < 250

    def test_un_fonds_sectoriel_pese_peu_de_societes(self):
        import app.api.routes.transactions as routes

        # XLK, relevé : dix premières lignes à 61 %, la plus grosse à 13,8 %.
        xlk = [0.138, 0.120, 0.080, 0.060, 0.050, 0.045, 0.040, 0.030, 0.025, 0.022]
        hhi, abouti = routes._hhi_du_fonds(self._fd(xlk))
        assert abouti and hhi is not None
        assert 15 < 1 / hhi < 25

    def test_une_composition_vide_ne_rend_rien(self):
        """
        Le cas d'un fonds **synthétique** : il détient un contrat d'échange et non
        des actions, donc il n'y a rien à publier. Mesuré vide sur ESE.PA et CW8.PA.
        """
        import app.api.routes.transactions as routes

        # ⚠️ `abouti` vaut **vrai** : la lecture a eu lieu et il n'y a rien. C'est un
        # constat définitif, à ne pas confondre avec une lecture ratée.
        assert routes._hhi_du_fonds(self._fd([])) == (None, True)
        assert routes._hhi_du_fonds(self._fd(None)) == (None, True)

    def test_des_pourcentages_sont_ramenes_en_fractions(self):
        """
        ⚠️ Se tromper d'un facteur cent multiplierait le HHI par dix mille, donc
        diviserait le nombre de sociétés par dix mille. Le fournisseur n'annonce pas
        son unité.
        """
        import app.api.routes.transactions as routes

        fractions = [0.040, 0.035, 0.025, 0.020, 0.018]
        pourcents = [w * 100 for w in fractions]
        assert routes._hhi_du_fonds(self._fd(pourcents))[0] == pytest.approx(
            routes._hhi_du_fonds(self._fd(fractions))[0], rel=1e-9)

    def test_une_somme_impossible_est_refusee(self):
        """
        Des poids qui somment à plus de cent pour cent ne sont pas des poids.

        ⚠️ Le cas `[0.6, 0.6, 0.6]` n'est **pas** refusé, et c'est délibéré : somme
        1,8, donc lu comme des pourcentages, donc 1,8 % au total. C'est le bon
        arbitrage en pratique — des fractions sommant à 180 % n'existent pas, alors
        que des pourcentages sont un format courant. La zone d'ambiguïté est étroite
        et l'ordre de lecture y est celui qui produit une valeur plausible.
        """
        import app.api.routes.transactions as routes

        # 180 % même après division : aucune lecture ne le sauve.
        assert routes._hhi_du_fonds(self._fd([60.0, 60.0, 60.0])) == (None, True)

    def test_une_colonne_inattendue_ne_leve_pas(self):
        import app.api.routes.transactions as routes

        assert routes._hhi_du_fonds(self._fd([0.1, 0.2], colonne="Autre")) == (None, True)

    def test_une_lecture_ratee_se_distingue_d_une_composition_vide(self):
        """
        ⚠️ La distinction qui évite de figer un ETF physique pendant un mois.

        La lecture des secteurs peut réussir quand celle de la composition échoue —
        sous limitation de débit, par exemple. La fiche était alors jugée utile et
        gardée trente jours avec une composition absente : le fonds se retrouvait
        annoncé « composition non publiée » alors qu'il la publie.

        C'est le même défaut qui a d'abord vicié mon banc d'essai, où une erreur
        avalée est devenue un « aucun ETF ne publie » parfaitement faux.
        """
        import app.api.routes.transactions as routes

        class Casse:
            @property
            def top_holdings(self):
                raise RuntimeError("Too Many Requests")

        assert routes._hhi_du_fonds(Casse()) == (None, False)


def test_un_cache_d_ancien_format_est_perime_mais_pas_jete(tmp_path, monkeypatch):
    """
    ⚠️ Une montée de version **périme** les fiches, elle ne les supprime pas.

    Les fiches tiennent trente jours, ce qui rendait invisible pendant un mois tout
    champ ajouté au format : le champ `hhi` — la concentration interne d'un fonds —
    n'apparaissait pas, car les fiches de la veille ne le portaient pas et restaient
    valides. D'où le versionnement.

    Mais la première version du versionnement **ignorait le fichier entier**, et
    c'était une faute. Passer la version de 2 à 3 pour ajouter un seul champ a fait
    disparaître des ventilations sectorielles et géographiques encore parfaitement
    justes ; le fournisseur limitant le débit à ce moment-là, trois facteurs du score
    sont restés sans note. Jeter une donnée juste pour en obtenir une de plus est un
    mauvais échange.

    Les fiches sont donc chargées avec une échéance dépassée : une lecture fraîche
    sera tentée, et si elle échoue l'ancienne est conservée — elle porte déjà tout
    sauf le champ nouveau.
    """
    import json
    import time

    import app.api.routes.transactions as routes

    fichier = tmp_path / "vieux.json"
    monkeypatch.setattr(routes, "_FICHIER_CACHE", fichier)

    ancienne = {"secteurs": {"technology": 0.4, "healthcare": 0.6}, "nom": "Un fonds"}
    for contenu in (
        # Format d'avant le versionnement : un dictionnaire nu.
        {"VT": [time.time() + 3600, ancienne]},
        # Format versionné, version antérieure.
        {"version": routes._VERSION_FICHE - 1, "fiches": {"VT": [time.time() + 3600, ancienne]}},
    ):
        fichier.write_text(json.dumps(contenu))
        routes._CACHE_DETAILS.clear()
        monkeypatch.setattr(routes, "_CACHE_MTIME", None)
        routes._charger_cache_details()
        entree = routes._CACHE_DETAILS.get("VT")
        assert entree is not None, "la fiche doit survivre à la montée de version"
        assert entree[1]["secteurs"] == ancienne["secteurs"], "les secteurs restent justes"
        assert entree[0] <= time.time(), "mais l'échéance est dépassée, pour forcer la relecture"

    # La version courante garde son échéance.
    fichier.write_text(json.dumps(
        {"version": routes._VERSION_FICHE,
         "fiches": {"VT": [time.time() + 3600, {**ancienne, "hhi": 0.005}]}}))
    routes._CACHE_DETAILS.clear()
    monkeypatch.setattr(routes, "_CACHE_MTIME", None)
    routes._charger_cache_details()
    assert routes._CACHE_DETAILS["VT"][0] > time.time()
    assert routes._CACHE_DETAILS["VT"][1]["hhi"] == 0.005


def test_une_fiche_perimee_survit_a_une_lecture_ratee(tmp_path, monkeypatch):
    """
    Le mécanisme de repli, bout à bout : fiche périmée par une montée de version,
    fournisseur indisponible, et la donnée d'hier reste servie.

    C'est ce qui aurait évité la perte : sans ce chemin, une montée de version
    pendant une limitation de débit vide l'écran.
    """
    import json
    import time

    import yfinance

    import app.api.routes.transactions as routes

    fichier = tmp_path / "vieux.json"
    monkeypatch.setattr(routes, "_FICHIER_CACHE", fichier)
    ancienne = {"secteurs": {"technology": 1.0}, "nom": "Un fonds"}
    fichier.write_text(json.dumps(
        {"version": routes._VERSION_FICHE - 1, "fiches": {"VT": [time.time() + 3600, ancienne]}}))
    routes._CACHE_DETAILS.clear()
    monkeypatch.setattr(routes, "_CACHE_MTIME", None)

    def refuse(_t):
        raise RuntimeError("Too Many Requests")

    monkeypatch.setattr(yfinance, "Ticker", refuse)
    d = routes._details_titre("VT")
    assert d["secteurs"] == ancienne["secteurs"], "la donnée d'hier doit être servie"


def test_le_cache_des_fiches_survit_au_redemarrage(tmp_path, monkeypatch):
    """
    ⚠️ Le cache des fiches de titres vit aussi sur disque.

    Observé en travaillant : `uvicorn --reload` redémarre le processus à chaque
    fichier enregistré, ce qui vidait le cache mémoire. Toute la transparence des
    fonds était donc reperdue à chaque modification de code, et la diversification
    retombait à « Transparence indisponible » — sans qu'aucun bug n'existe, et au
    moment précis où le fournisseur de cours refuse de répondre parce qu'on vient
    de l'interroger en boucle. Les deux effets se combinaient pour effacer un
    facteur du score.

    Un secteur ne change pas d'un jour à l'autre : c'est exactement la donnée qui
    doit survivre au processus.
    """
    import time

    import app.api.routes.transactions as routes

    fichier = tmp_path / "cache.json"
    monkeypatch.setattr(routes, "_FICHIER_CACHE", fichier)

    fiche = {"nom": "Fonds test", "secteurs": {"technology": 0.5, "healthcare": 0.5},
             "hhi": 0.005}
    routes._CACHE_DETAILS.clear()
    routes._CACHE_DETAILS["TEST.PA"] = (time.time() + 3600, fiche)
    routes._ecrire_cache_details()
    assert fichier.exists()

    # Redémarrage : la mémoire repart à zéro, le disque reste.
    routes._CACHE_DETAILS.clear()
    monkeypatch.setattr(routes, "_CACHE_MTIME", None)
    routes._charger_cache_details()
    assert routes._CACHE_DETAILS["TEST.PA"][1]["secteurs"] == fiche["secteurs"]


def test_le_cache_est_relu_quand_le_fichier_change(tmp_path, monkeypatch):
    """
    ⚠️ Relu à chaque changement de date, pas **une seule fois** au démarrage.

    La première version chargeait une fois par processus. Observé aussitôt en
    conditions réelles : le serveur avait déjà servi une analyse — donc déjà lu un
    fichier qui n'existait pas encore — quand le cache a été écrit par un autre
    processus. Il ne l'a jamais relu, la diversification est restée « — » et la note
    s'est calculée sur quatre facteurs au lieu de cinq.

    Le même défaut vaudrait en production : plusieurs workers, chacun avec sa
    mémoire, chacun n'ayant lu qu'à son démarrage.
    """
    import time

    import app.api.routes.transactions as routes

    fichier = tmp_path / "cache.json"
    monkeypatch.setattr(routes, "_FICHIER_CACHE", fichier)
    routes._CACHE_DETAILS.clear()
    monkeypatch.setattr(routes, "_CACHE_MTIME", None)

    # Première lecture : le fichier n'existe pas. C'est le cas du démarrage.
    routes._charger_cache_details()
    assert routes._CACHE_DETAILS == {}

    # Un autre processus écrit le cache après coup, au format courant.
    fichier.write_text(json.dumps(
        {"version": routes._VERSION_FICHE,
         "fiches": {"TARD.PA": [time.time() + 3600, {"secteurs": {"technology": 1.0}}]}}))
    # Une date de modification plus récente que la dernière lue : on relit.
    os.utime(fichier, (time.time() + 5, time.time() + 5))

    routes._charger_cache_details()
    assert "TARD.PA" in routes._CACHE_DETAILS, "le fichier apparu après coup doit être relu"


def test_un_cache_illisible_ne_casse_pas_l_analyse(tmp_path, monkeypatch):
    """
    Le fichier reste un **cache** : perdu ou corrompu, il se reconstruit. Aucune
    lecture n'en dépend pour être correcte, seulement pour être rapide — donc un
    JSON tronqué doit ramener un cache vide, pas une erreur 500.
    """
    import app.api.routes.transactions as routes

    for contenu in ("{ceci n'est pas du json", "[]", '{"X": "pas un couple"}'):
        fichier = tmp_path / "abime.json"
        fichier.write_text(contenu)
        monkeypatch.setattr(routes, "_FICHIER_CACHE", fichier)
        routes._CACHE_DETAILS.clear()
        monkeypatch.setattr(routes, "_CACHE_MTIME", None)
        routes._charger_cache_details()          # ne doit pas lever
        assert routes._CACHE_DETAILS == {}, contenu

    # Fichier absent : même exigence.
    monkeypatch.setattr(routes, "_FICHIER_CACHE", tmp_path / "jamais_ecrit.json")
    monkeypatch.setattr(routes, "_CACHE_MTIME", None)
    routes._charger_cache_details()
    assert routes._CACHE_DETAILS == {}


def test_l_analyse_ne_rend_que_les_facteurs_retenus(client, monkeypatch):
    """
    Garde de bout en bout sur l'inventaire des facteurs.

    ⚠️ Le test de service vérifie déjà que les sept facteurs retirés ne
    réapparaissent pas, mais la route pourrait les réintroduire par un autre chemin
    — une exposition repassée en facteur, une fusion mal résolue. Ce qui compte pour
    l'utilisateur, c'est ce que la route rend ; c'est donc ici qu'on l'ancre.

    L'exposition « devises » est vérifiée absente pour la même raison : elle lisait
    la devise de cotation, donc annonçait « EUR 100 % » à un portefeuille de
    trackers S&P 500 cotés à Paris.
    """
    import yfinance

    import app.api.routes.transactions as routes

    pid = creer_portefeuille(client, "Inventaire")
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-05")).status_code == 201

    async def cours(tickers):
        return {t: 150.0 for t in tickers}

    monkeypatch.setattr(routes, "fetch_current_prices", cours)
    monkeypatch.setattr(yfinance, "download",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("réseau coupé")))

    d = client.get(f"/api/v1/portfolios/{pid}/analysis").json()
    assert set(d["facteurs"]) == {
        "concentration", "diversification", "geographie", "redondance",
        "frais", "frais_courtage", "volatilite", "perte_max",
    }
    assert "devises" not in d["expositions"]
    # Les trois ventilations conservées alimentent les graphiques.
    assert set(d["expositions"]) == {"secteurs", "zones", "classes"}


def test_analyse_refuse_de_noter_si_un_cours_manque(client, monkeypatch):
    """
    ⚠️ Une ligne sans cours sortait de `poids` et les autres étaient renormalisées
    à cent. Observé sur un vrai portefeuille : la ligne à 70 % avait disparu, la
    ventilation annonçait « Europe 67 % » au lieu de « États-Unis 70 % », et le
    score s'affichait comme s'il était complet.
    """
    import yfinance

    import app.api.routes.transactions as routes

    pid = creer_portefeuille(client, "Un cours manquant")
    for e in (ecriture("AAPL", 10, 100.0, "2026-01-05"),
              ecriture("MSFT", 5, 200.0, "2026-01-05")):
        assert client.post(f"/api/v1/portfolios/{pid}/transactions", json=e).status_code == 201

    async def un_seul_cours(tickers):
        return {"AAPL": 150.0}          # MSFT reste sans cours

    monkeypatch.setattr(routes, "fetch_current_prices", un_seul_cours)
    monkeypatch.setattr(yfinance, "download",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("réseau coupé")))

    d = client.get(f"/api/v1/portfolios/{pid}/analysis").json()
    assert d["source"] == "incomplet"
    assert d["score"] is None
    assert d["sans_cours"] == ["MSFT"]


def test_analyse_complete_annonce_aucune_ligne_manquante(client, monkeypatch):
    import yfinance

    import app.api.routes.transactions as routes
    import app.services.analyse as analyse

    pid = creer_portefeuille(client, "Complet")
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-05")).status_code == 201

    async def cours(tickers):
        return {t: 150.0 for t in tickers}

    monkeypatch.setattr(routes, "fetch_current_prices", cours)
    monkeypatch.setattr(yfinance, "download",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("réseau coupé")))
    monkeypatch.setattr(analyse, "facteurs_de_risque",
                        lambda *a, **k: {"concentration": {"valeur": 1.0, "libelle": "x", "score": 10}})

    d = client.get(f"/api/v1/portfolios/{pid}/analysis").json()
    assert d["source"] == "transactions"
    assert d["sans_cours"] == []


def test_le_courtage_vient_des_ecritures(client, monkeypatch):
    """
    ⚠️ Ce que l'épargnant a saisi doit servir. Un « Frais — » devant quelqu'un qui
    a renseigné ses commissions est un défaut, pas une donnée manquante.
    """
    import yfinance

    import app.api.routes.transactions as routes
    import app.services.analyse as analyse

    pid = creer_portefeuille(client, "Avec courtage")
    # 10 × 100 € achetés, 2 € de frais → 0,20 % des montants achetés.
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-05", fees=2.0)).status_code == 201

    async def cours(tickers):
        return {t: 100.0 for t in tickers}

    monkeypatch.setattr(routes, "fetch_current_prices", cours)
    monkeypatch.setattr(yfinance, "download",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("réseau coupé")))

    captures = {}

    def espion(poids, rendements, *a, **kw):
        captures["courtage"] = kw.get("courtage")
        return {"concentration": {"valeur": 1.0, "libelle": "x", "score": 50}}

    monkeypatch.setattr(analyse, "facteurs_de_risque", espion)

    client.get(f"/api/v1/portfolios/{pid}/analysis")
    assert captures["courtage"] == pytest.approx(0.20)


# ── Le cache des détails de titre ────────────────────────────────────────────

class TestCacheDetails:
    """
    ⚠️ Ce qu'un ratage du fournisseur ne doit pas faire.

    Le cache retenait indistinctement succès et échecs pendant six heures. Un seul
    appel limité par Yahoo et la transparence disparaissait jusqu'au soir : sur un
    vrai portefeuille, la ligne à 70 % a perdu sa zone, la ventilation a annoncé
    « Europe 67 % » au lieu de « États-Unis 70 % », et la diversification est
    tombée à zéro.
    """

    def _vider(self):
        from app.api.routes.transactions import _CACHE_DETAILS
        _CACHE_DETAILS.clear()

    def test_un_succes_est_garde_longtemps(self, monkeypatch):
        import time as _t

        import app.api.routes.transactions as routes
        self._vider()

        class Faux:
            info = {"shortName": "Un fonds", "quoteType": "EQUITY", "sector": "Tech"}

        import yfinance
        monkeypatch.setattr(yfinance, "Ticker", lambda t: Faux())

        d = routes._details_titre("X")
        assert d["nom"] == "Un fonds"
        echeance = routes._CACHE_DETAILS["X"][0]
        assert echeance - _t.time() > routes._TTL_DETAILS - 60
        # ⚠️ Longtemps veut dire des semaines, pas des heures. Six heures
        # signifiait rechercher chaque fiche quatre fois par jour, ce qui
        # déclenchait la limitation de débit du fournisseur — laquelle faisait
        # disparaître la diversification du score. Le remède était la cause.
        assert routes._TTL_DETAILS >= 7 * 24 * 3600

    def test_un_echec_ne_remplace_pas_une_donnee_connue(self, monkeypatch):
        import app.api.routes.transactions as routes
        import yfinance
        self._vider()

        class Bon:
            info = {"shortName": "Un fonds", "quoteType": "EQUITY", "sector": "Tech"}

        monkeypatch.setattr(yfinance, "Ticker", lambda t: Bon())
        assert routes._details_titre("X")["nom"] == "Un fonds"

        # Puis le fournisseur tombe, et le cache a expiré.
        routes._CACHE_DETAILS["X"] = (0.0, routes._CACHE_DETAILS["X"][1])

        def casse(_t):
            raise RuntimeError("Too Many Requests")

        monkeypatch.setattr(yfinance, "Ticker", casse)
        d = routes._details_titre("X")
        assert d["nom"] == "Un fonds", "la donnée connue doit survivre au ratage"

    def test_un_echec_sans_historique_expire_vite(self, monkeypatch):
        import time as _t

        import app.api.routes.transactions as routes
        import yfinance
        self._vider()

        def casse(_t):
            raise RuntimeError("Too Many Requests")

        monkeypatch.setattr(yfinance, "Ticker", casse)
        d = routes._details_titre("Y")
        assert d == {}
        restant = routes._CACHE_DETAILS["Y"][0] - _t.time()
        # On réessaie dans la minute et demie, pas dans six heures.
        assert 0 < restant <= routes._TTL_DETAILS_ECHEC + 1
