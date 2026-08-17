"""
La courbe découpée par compte.

⚠️ **Un seul de ces tests compte vraiment : celui de la somme.** Le reste décrit des
refus (pas de trésorerie, pas de mesure de performance) qui sont des choix, et qu'on
peut revoir. La somme, elle, est la promesse faite à l'écran : basculer de « total » à
« par compte » ne doit pas changer la hauteur de la courbe. Si elle tombe, la vue ment
et il faut la retirer, pas l'ajuster.

⚠️ **Les cours sont simulés, et c'est nécessaire à la valeur du test.** Avec de vrais
cours, la somme des courbes et la courbe totale seraient calculées sur deux
téléchargements distincts, donc potentiellement sur deux calendriers de séances
différents : le test échouerait au gré du réseau et l'on prendrait l'habitude de le
relancer. Ici, un jeu de cours fixe rend l'égalité exacte ou fausse, jamais « à peu près ».
"""

import os
import tempfile

import pandas as pd
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


def creer_portefeuille(client, nom="Courbes"):
    r = client.post("/api/v1/portfolios", json={
        "name": nom, "assets": [{"ticker": "AAPL", "weight": 100}], "color": "#5B8DEF",
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def ecriture(ticker, qty, prix, date, compte_id=None):
    e = {
        "ticker": ticker, "asset_type": "EQUITY", "side": "BUY",
        "quantity": qty, "unit_price": prix, "fees": 0.0,
        "executed_at": f"{date}T00:00:00", "note": None,
    }
    if compte_id:
        e["compte_id"] = compte_id
    return e


def declarer(client, pid, nom, genre, couleur="#6366F1"):
    r = client.post(f"/api/v1/portfolios/{pid}/comptes",
                    json={"nom": nom, "genre": genre, "couleur": couleur})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def verser(client, pid, cid, montant, quand):
    """
    Poser de l'argent daté sur un compte déjà déclaré.

    ⚠️ **Par le journal, parce qu'il n'y a plus d'autre chemin.** Ces tests passaient par
    `PUT /comptes/{id}` avec un solde ; ce formulaire ne touche plus à l'argent, seul le
    journal l'écrit. C'est précisément la couture que la refonte a supprimée — deux
    chemins pour poser la même somme, qui finissaient par ne plus dire la même chose.
    """
    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": quand, "montant": montant, "note": "Apport initial"})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def cours(monkeypatch):
    """
    Un jeu de cours fixe, servi à toutes les routes qui téléchargent.

    Les prix montent d'un euro par séance : une courbe plate ne distinguerait pas une
    somme juste d'une somme qui ignore un compte, puisque tout vaudrait pareil.
    """
    import yfinance
    from app.api.routes.transactions import _BENCHMARK

    idx = pd.date_range("2026-01-05", periods=40, freq="B")
    colonnes = ["AAPL", "MSFT", "ESE.PA", _BENCHMARK]
    df = pd.DataFrame({c: [100.0 + i for i in range(len(idx))] for c in colonnes},
                      index=idx)

    def faux(tickers, **kw):
        # ⚠️ **Rendre une Series pour un ticker seul, un DataFrame au-delà.** yfinance fait
        # cette distinction et le code appelant s'y fie : `brut.to_frame(...)`. Une première
        # version de cette simulation rendait toujours le tableau entier, et les routes qui
        # ne demandent qu'un titre — la valorisation à la saisie — tombaient sur un
        # `AttributeError` qui n'avait rien à voir avec ce que le test mesure.
        noms = [tickers] if isinstance(tickers, str) else list(tickers)
        connus = [t for t in noms if t in df.columns]
        if len(noms) == 1:
            return {"Close": df[connus[0]] if connus else pd.Series(dtype=float)}
        return {"Close": df[connus]}

    monkeypatch.setattr(yfinance, "download", faux)
    return df


def par_compte(client, pid, period="max"):
    r = client.get(f"/api/v1/portfolios/{pid}/history/comptes?period={period}")
    assert r.status_code == 200, r.text
    return r.json()


# ── La promesse ───────────────────────────────────────────────────────────────

def test_la_somme_des_courbes_egale_la_courbe_totale(client, cours):
    """
    ⚠️ **Le test qui justifie la route.** Deux comptes déclarés, une opération restée
    libre : à chaque date, la somme des trois courbes doit redonner au centime la courbe
    de `/history`. C'est ce qui autorise l'écran à proposer les deux vues comme deux
    lectures d'une même chose.
    """
    pid = creer_portefeuille(client)
    pea = declarer(client, pid, "PEA", "pea")
    cto = declarer(client, pid, "CTO", "cto")

    for e in [ecriture("AAPL", 10, 100.0, "2026-01-06", pea),
              ecriture("MSFT", 5, 100.0, "2026-01-07", cto),
              ecriture("ESE.PA", 8, 100.0, "2026-01-08")]:
        assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                           json=e).status_code == 201, e

    # ⚠️ **Des espèces sur l'un des comptes, sans quoi le test ne prouve plus grand-chose.**
    # Sans apport déclaré, `/history` ne rend pas de patrimoine et la comparaison retombe
    # sur les seuls titres — exactement le cas qui restait vert pendant que l'écran mentait.
    verser(client, pid, pea, 1200.0, "2026-01-06T00:00:00")

    total = client.get(f"/api/v1/portfolios/{pid}/history?period=max").json()
    decoupe = par_compte(client, pid)

    assert any("patrimoine" in p for p in total["points"]), (
        "le total doit compter les liquidités, sinon la somme n'est pas mise à l'épreuve")
    assert len(decoupe["comptes"]) == 3, "deux comptes déclarés et le reliquat"

    # ⚠️ **On compare à ce que l'écran trace, donc au patrimoine quand il existe.**
    # La première version de ce test comparait à `value`, qui ne porte pas les espèces :
    # elle est restée verte alors même que la somme des courbes avait cessé de redonner
    # la courbe affichée, le jour où le total s'est mis à compter les liquidités.
    attendu = {p["date"]: p.get("patrimoine", p["value"]) for p in total["points"]}
    somme: dict[str, float] = {}
    for c in decoupe["comptes"]:
        for p in c["points"]:
            somme[p["date"]] = somme.get(p["date"], 0.0) + p["value"]

    assert set(somme) == set(attendu), "les courbes doivent couvrir les mêmes séances"
    for jour, valeur in attendu.items():
        assert somme[jour] == pytest.approx(valeur, abs=0.01), (
            f"le {jour} : {somme[jour]} par compte contre {valeur} au total"
        )


def test_le_montant_investi_s_additionne_aussi(client, cours):
    """
    L'investi suit la même règle que la valeur : c'est une somme de versements, et un
    versement appartient à un compte et un seul.
    """
    pid = creer_portefeuille(client)
    pea = declarer(client, pid, "PEA", "pea")

    for e in [ecriture("AAPL", 10, 100.0, "2026-01-06", pea),
              ecriture("MSFT", 5, 100.0, "2026-01-07")]:
        assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                           json=e).status_code == 201

    total = client.get(f"/api/v1/portfolios/{pid}/history?period=max").json()
    decoupe = par_compte(client, pid)

    dernier = total["points"][-1]["date"]
    investi = sum(
        p["invested"] for c in decoupe["comptes"] for p in c["points"] if p["date"] == dernier
    )
    attendu = next(p["invested"] for p in total["points"] if p["date"] == dernier)
    assert investi == pytest.approx(attendu, abs=0.01)


# ── Les refus, qui sont des décisions ─────────────────────────────────────────

def test_un_compte_de_tresorerie_a_sa_courbe_depuis_sa_date(client, cours):
    """
    ⚠️ **Le refus d'hier est devenu une courbe, et c'est le journal daté qui l'a permis.**
    Un livret n'avait pas d'historique tant que son solde était un chiffre sans date : le
    tracer faisait remonter l'argent à plat jusqu'au premier point. Datée, la somme sait à
    partir de quand elle compte, et vaut zéro avant.
    """
    pid = creer_portefeuille(client)
    pea = declarer(client, pid, "PEA", "pea")
    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json={
        "nom": "Livret A", "genre": "epargne", "apport_initial": 5000.0,
        "apport_le": "2026-01-20T00:00:00",
    })
    assert r.status_code in (200, 201), r.text

    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-06", pea)).status_code == 201

    comptes = par_compte(client, pid)["comptes"]
    livret = next(c for c in comptes if c["nom"] == "Livret A")
    par_date = {p["date"]: p["value"] for p in livret["points"]}
    assert par_date["2026-01-06"] == 0.0, "le livret n'existait pas encore"
    assert par_date["2026-01-20"] == pytest.approx(5000.0)
    # ⚠️ Aucun capital engagé : les espèces montent le patrimoine, pas l'investi. Les
    # compter deux fois aurait déplacé les gains, que cette route n'a pas à toucher.
    assert all(p["invested"] == 0.0 for p in livret["points"])


def test_les_especes_d_un_compte_a_titres_entrent_dans_sa_courbe(client, cours):
    """
    ⚠️ La poche d'espèces d'un PEA est à lui : sans elle, la somme des courbes cesserait
    de redonner le patrimoine dès qu'un compte à titres déclare des liquidités.
    """
    pid = creer_portefeuille(client)
    pea = declarer(client, pid, "PEA", "pea")
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-06", pea)).status_code == 201
    verser(client, pid, pea, 800.0, "2026-01-06T00:00:00")

    c = par_compte(client, pid)["comptes"][0]
    titres = client.get(f"/api/v1/portfolios/{pid}/history?period=max").json()["points"]
    par_date = {p["date"]: p["value"] for p in titres}
    for p in c["points"]:
        assert p["value"] == pytest.approx(par_date[p["date"]] + 800.0)


def test_les_operations_libres_forment_le_dernier_groupe(client, cours):
    """
    Le reliquat existe, il est nommé, et il vient en dernier : c'est un reste, pas un
    compte. Sans lui, un portefeuille repris — où rien n'est encore déclaré — afficherait
    une vue vide au lieu de sa courbe.
    """
    pid = creer_portefeuille(client)
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-06")).status_code == 201

    comptes = par_compte(client, pid)["comptes"]
    assert len(comptes) == 1
    assert comptes[-1]["id"] is None
    assert comptes[-1]["declare"] is False
    assert comptes[-1]["nom"] == "Non rattachées"
    assert comptes[-1]["points"], "le reliquat porte bien une courbe"


def test_aucune_mesure_de_performance_par_compte(client, cours):
    """
    ⚠️ Ni TWR ni gain par compte : un virement d'un compte à l'autre serait un versement
    pour l'un et un retrait pour l'autre, alors qu'il n'est ni l'un ni l'autre pour
    l'épargnant. Les deux performances seraient fausses en sens contraire.
    """
    pid = creer_portefeuille(client)
    pea = declarer(client, pid, "PEA", "pea")
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-06", pea)).status_code == 201

    decoupe = par_compte(client, pid)
    interdits = {"twr_pct", "gain_pct", "gain_eur", "taux_pct", "benchmark"}
    assert not (interdits & set(decoupe)), decoupe.keys()
    for c in decoupe["comptes"]:
        assert not (interdits & set(c)), c.keys()
        for p in c["points"]:
            assert set(p) == {"date", "value", "invested"}, p


def test_un_portefeuille_sans_ecriture_ne_rend_rien(client, cours):
    """Le cas nu : aucune opération, aucune courbe, et surtout aucune erreur."""
    pid = creer_portefeuille(client)
    d = par_compte(client, pid)
    assert d == {"comptes": [], "start": None, "source": "aucune"}


def test_le_patrimoine_ajoute_les_liquidites_sans_toucher_a_la_valeur(client, cours):
    """
    ⚠️ **Le grand chiffre et la courbe doivent enfin dire la même chose.** « Valeur
    totale » compte les liquidités déclarées ; la courbe ne traçait que les titres. Le
    jour où un livret est déclaré, le bandeau annonçait 9 536 € au-dessus d'une courbe
    finissant à 4 536 €.

    ⚠️ **Et `value` ne bouge pas d'un centime.** C'est elle qui nourrit le TWR, le Dietz
    et la comparaison au repère : y verser l'épargne aurait fait lire l'argent qui dort
    comme un résultat.
    """
    pid = creer_portefeuille(client)
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-06")).status_code == 201

    avant = client.get(f"/api/v1/portfolios/{pid}/history?period=max").json()
    assert all("patrimoine" not in p for p in avant["points"]), (
        "sans liquidités déclarées, pas de seconde courbe superposée à la première")

    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json={
        "nom": "Livret A", "genre": "epargne", "apport_initial": 5000.0,
        "apport_le": "2026-01-06T00:00:00",
    })
    assert r.status_code in (200, 201), r.text
    assert r.json()["solde"] == pytest.approx(5000.0)

    apres = client.get(f"/api/v1/portfolios/{pid}/history?period=max").json()
    assert len(apres["points"]) == len(avant["points"])
    for p, a in zip(apres["points"], avant["points"]):
        assert p["value"] == pytest.approx(a["value"]), "la valeur des titres est intacte"
        assert p["patrimoine"] == pytest.approx(p["value"] + 5000.0)
    assert apres["twr_pct"] == avant["twr_pct"], "l'épargne n'est pas une performance"


def test_le_patrimoine_ignore_les_liquidites_avant_leur_date(client, cours):
    """
    ⚠️ La règle que portait `solde_depuis`, désormais tenue par la somme cumulée
    elle-même : un livret ouvert le 20 janvier ne compte pas le 6. Sans elle, l'argent
    serait apparu avant d'exister.
    """
    pid = creer_portefeuille(client)
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-06")).status_code == 201
    assert client.post(f"/api/v1/portfolios/{pid}/comptes", json={
        "nom": "Livret A", "genre": "epargne", "apport_initial": 5000.0,
        "apport_le": "2026-01-20T00:00:00",
    }).status_code in (200, 201)

    pts = client.get(f"/api/v1/portfolios/{pid}/history?period=max").json()["points"]
    tot = {p["date"]: p["patrimoine"] - p["value"] for p in pts}
    assert tot["2026-01-06"] == pytest.approx(0.0), "le livret n'existait pas encore"
    assert tot["2026-01-20"] == pytest.approx(5000.0)
    assert tot[pts[-1]["date"]] == pytest.approx(5000.0)


def test_une_periode_inconnue_est_refusee(client, cours):
    """Le même refus que `/history`, faute de quoi la période serait silencieusement ignorée."""
    pid = creer_portefeuille(client)
    assert client.post(f"/api/v1/portfolios/{pid}/transactions",
                       json=ecriture("AAPL", 10, 100.0, "2026-01-06")).status_code == 201
    r = client.get(f"/api/v1/portfolios/{pid}/history/comptes?period=depuis-toujours")
    assert r.status_code == 400
