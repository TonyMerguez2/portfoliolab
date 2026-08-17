"""
Verser de l'argent n'est jamais une performance.

⚠️ **C'est la règle centrale du projet, et elle a été enfreinte deux fois sans qu'aucun
test ne la retienne.** Une fois en comptant la trésorerie entière comme un gain
(« +115,66 % » relevé à l'écran sur un patrimoine dont la moitié dormait sur un livret),
une fois en la recomptant après l'avoir crue corrigée. Ce module existe pour qu'il y ait
un troisième garde-fou que le code doive franchir.

⚠️ **La règle ne se garde pas seule : il faut lui adjoindre que l'argent arrive
quelque part.** « Le gain n'a pas bougé » est trivialement vrai d'un code qui perd les
5 000 € en route — et c'est exactement ainsi que le défaut s'est caché. La trésorerie
pesait zéro sur toute la courbe, donc rien à retrancher du gain, donc aucun test de la
règle seule n'aurait rougi pendant que l'écran annonçait le double du patrimoine réel.
Les deux assertions vont donc toujours par paire :

  1. le patrimoine monte **d'exactement** ce qu'on a versé ;
  2. le gain, le TWR et la comparaison au repère n'en bougent **pas d'un centime**.

⚠️ **L'apport est daté d'aujourd'hui, et c'est le cas qui compte.** C'est ce que propose
le formulaire par défaut, c'est ce que l'épargnant fait quand il déclare son livret, et
c'est précisément là que la courbe le perdait : elle s'arrêtait à la dernière séance
close — hier, ou vendredi un dimanche — et l'argent tombait après le dernier point tracé.
"""

from datetime import date, timedelta

import os
import tempfile

import pandas as pd
import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


APPORT = 5000.0
#: L'apport d'un portefeuille qui ne contient que ça.
APPORT_LIVRET = 8400.0


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

    utilisateur = SimpleNamespace(id="user-test", email="test@novac.local",
                                  username="Test", avatar_url=None, devise=None)

    app.dependency_overrides[get_db] = get_db_test
    app.dependency_overrides[require_auth] = lambda: utilisateur

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    engine.dispose()
    os.unlink(fichier.name)


@pytest.fixture
def cours(monkeypatch):
    """
    Des cours qui s'arrêtent à la dernière séance close, comme dans la vie.

    ⚠️ **Ancrés sur aujourd'hui, et non sur des dates écrites en dur.** Tout l'enjeu est
    l'écart entre le dernier jour coté et le jour où l'épargnant déclare son argent : un
    jeu de cours figé en janvier ne reproduirait jamais cet écart, et le test resterait
    vert le jour même où l'écran se trompe. Un dimanche, la dernière séance est vendredi ;
    un mardi, c'est lundi. Le test rencontre donc le cas réel quel que soit le jour où on
    le joue.
    """
    import yfinance
    from app.api.routes.transactions import _BENCHMARK

    idx = pd.bdate_range(end=derniere_seance(), periods=40)
    colonnes = ["AAPL", "MSFT", _BENCHMARK]
    # Les cours montent d'un euro par séance : sur une courbe plate, une somme juste et
    # une somme qui ignore un compte se ressemblent trop pour qu'on les distingue.
    df = pd.DataFrame({c: [100.0 + i for i in range(len(idx))] for c in colonnes},
                      index=idx)

    # ⚠️ **Une seconde série, horodatée et avec fuseau, pour les appels intraday.**
    # `_points_intraday` demande un `interval` ; lui servir les clôtures journalières faisait
    # comparer des horodatages naïfs à des horodatages localisés, et l'erreur qui en sortait
    # n'avait rien à voir avec ce que le test mesure. Surtout, sans elle la courbe ne
    # basculerait jamais en barres — donc jamais dans le chemin où le défaut se produisait.
    heures = pd.date_range(end=pd.Timestamp.now(tz="UTC").floor("h"), periods=48, freq="h")
    intra = pd.DataFrame({c: [100.0 + i / 24 for i in range(len(heures))] for c in colonnes},
                         index=heures)

    def faux(tickers, **kw):
        source = intra if kw.get("interval") not in (None, "1d") else df
        noms = [tickers] if isinstance(tickers, str) else list(tickers)
        connus = [t for t in noms if t in source.columns]
        if len(noms) == 1:
            return {"Close": source[connus[0]] if connus else pd.Series(dtype=float)}
        return {"Close": source[connus]}

    monkeypatch.setattr(yfinance, "download", faux)
    return df


def derniere_seance() -> date:
    """Le dernier jour ouvré à ce jour — aujourd'hui même s'il en est un."""
    j = date.today()
    while j.weekday() >= 5:        # samedi, dimanche
        j -= timedelta(days=1)
    return j


def creer_portefeuille(client, nom="Épargne"):
    r = client.post("/api/v1/portfolios", json={
        "name": nom, "assets": [{"ticker": "AAPL", "weight": 100}], "color": "#5B8DEF",
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def acheter(client, pid, ticker, qty, prix, quand):
    r = client.post(f"/api/v1/portfolios/{pid}/transactions", json={
        "ticker": ticker, "asset_type": "EQUITY", "side": "BUY",
        "quantity": qty, "unit_price": prix, "fees": 0.0,
        "executed_at": f"{quand}T00:00:00", "note": None,
    })
    assert r.status_code == 201, r.text


def declarer_avec_apport(client, pid, montant, quand, nom="Livret A"):
    """
    Déclarer un compte d'épargne et l'argent qu'on y met, en un geste.

    ⚠️ Isolé dans une aide parce que c'est le geste que la refonte redéfinit : le jour où
    « solde » devient « apport initial », c'est ici que ça se voit et nulle part ailleurs
    dans ce module.
    """
    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json={
        "nom": nom, "genre": "epargne", "couleur": "#6366F1",
        "apport_initial": montant, "apport_le": f"{quand}T00:00:00",
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def history(client, pid, period="max"):
    r = client.get(f"/api/v1/portfolios/{pid}/history?period={period}")
    assert r.status_code == 200, r.text
    return r.json()


def portefeuille_garni(client):
    """Deux lignes achetées il y a longtemps, pour que la courbe ait de quoi bouger."""
    pid = creer_portefeuille(client)
    debut = derniere_seance() - timedelta(days=45)
    acheter(client, pid, "AAPL", 10, 100.0, debut.isoformat())
    acheter(client, pid, "MSFT", 5, 100.0, (debut + timedelta(days=1)).isoformat())
    return pid


# ── La règle ──────────────────────────────────────────────────────────────────

def test_un_apport_du_jour_monte_le_patrimoine_d_exactement_son_montant(client, cours):
    """
    Le premier des deux volets : l'argent versé **arrive**.

    ⚠️ C'est le défaut signalé mot pour mot — « déclarer un livret à 5 000 € n'ajoute
    aucune hausse à la courbe ». Sans cette assertion, le volet suivant serait vert sur un
    code qui perd la somme, ce qui est arrivé.
    """
    pid = portefeuille_garni(client)
    avant = history(client, pid)
    patrimoine_avant = avant["points"][-1].get("patrimoine", avant["points"][-1]["value"])

    declarer_avec_apport(client, pid, APPORT, date.today().isoformat())

    apres = history(client, pid)
    dernier = apres["points"][-1]
    assert "patrimoine" in dernier, (
        "Le dernier point ne porte aucun patrimoine : la trésorerie déclarée n'est "
        "arrivée nulle part sur la courbe.")
    assert dernier["patrimoine"] == pytest.approx(patrimoine_avant + APPORT, abs=0.01), (
        f"Patrimoine attendu {patrimoine_avant + APPORT:.2f}, "
        f"obtenu {dernier['patrimoine']:.2f} — l'apport du jour s'est perdu.")


def test_un_apport_ne_bouge_ni_le_gain_ni_le_twr_ni_le_repere(client, cours):
    """
    Le second volet, et la règle elle-même : verser n'est pas gagner.

    ⚠️ **Les trois mesures ensemble.** Le TWR neutralise les flux par construction, mais
    le gain en euros et la comparaison au repère se calculent autrement et se sont déjà
    trompés séparément. Les vérifier d'un bloc empêche qu'on en répare une en cassant
    l'autre.
    """
    pid = portefeuille_garni(client)
    avant = history(client, pid)

    declarer_avec_apport(client, pid, APPORT, date.today().isoformat())
    apres = history(client, pid)

    for mesure in ("twr_pct", "gain_eur", "gain_pct"):
        assert apres[mesure] == pytest.approx(avant[mesure], abs=0.01), (
            f"« {mesure} » est passé de {avant[mesure]} à {apres[mesure]} : "
            f"les {APPORT:.0f} € versés ont été comptés comme une performance.")

    assert apres["benchmark_sim"]["gain_eur"] == pytest.approx(
        avant["benchmark_sim"]["gain_eur"], abs=0.01), (
        "La simulation du repère a bougé : elle rejoue les flux, et un apport de "
        "trésorerie n'en est pas un.")


@pytest.mark.parametrize("periode", ["1d", "7d", "1mo", "3mo", "6mo", "1y", "max"])
def test_la_tresorerie_survit_a_toutes_les_fenetres(client, cours, periode):
    """
    ⚠️ **Le patrimoine disparaissait des trois fenêtres courtes, et de celles-là seulement.**
    Les liquidités étaient posées sur la courbe *avant* le passage en barres intraday, qui
    remplace les points par une série n'ayant jamais vu la trésorerie : sur « 24 h »,
    « 7 j » et « 1 mois », le livret cessait de monter la courbe et son apport n'avait plus
    de marche où poser sa pastille. « Max » se comportait bien, ce qui rendait le défaut
    difficile à nommer — signalé comme « bizarre selon la période ».

    ⚠️ **Le rang des deux blocs est donc porteur.** Ce test le grave : enrichir puis
    remplacer jette l'enrichissement. Paramétré sur toutes les fenêtres parce que le défaut
    n'était visible que sur une partie d'entre elles, et qu'en éprouver une seule laissait
    exactement passer ce qui est arrivé.
    """
    pid = portefeuille_garni(client)
    declarer_avec_apport(client, pid, APPORT, date.today().isoformat())

    d = history(client, pid, period=periode)
    assert d["points"], f"la fenêtre « {periode} » ne rend aucun point"
    dernier = d["points"][-1]
    assert "patrimoine" in dernier, (
        f"la fenêtre « {periode} » a perdu le patrimoine : la trésorerie déclarée "
        f"n'apparaît nulle part sur cette courbe-là.")
    assert dernier["liquidites"] == pytest.approx(APPORT, abs=0.01)
    assert dernier["patrimoine"] == pytest.approx(dernier["value"] + APPORT, abs=0.01)


@pytest.mark.parametrize("periode", ["1d", "7d", "1mo", "3mo", "6mo", "1y", "max"])
def test_la_courbe_finit_sur_aujourd_hui(client, cours, periode):
    """
    ⚠️ **Le défaut le plus trompeur de tout ce chantier, parce qu'il mentait à l'échelle.**
    Les barres intraday s'arrêtent à la dernière séance cotée — vendredi 17 h 15 un
    dimanche — quand le calendrier journalier va jusqu'au jour même. Un apport déclaré
    aujourd'hui tombait donc après le dernier point de la série intraday, et la trésorerie
    disparaissait de la fenêtre.

    ⚠️ **Ce n'est pas l'absence qui se voyait, c'est l'échelle.** Le graphique met la courbe
    à l'échelle pour qu'elle finisse sur le chiffre du bandeau : avec une série s'arrêtant à
    5 313 € pour un patrimoine de 10 712 €, il multipliait **tout le mois par deux**. La
    courbe annonçait 10 500 € en plein juillet — un chiffre qui n'a jamais existé — pendant
    que « 3 M », journalier, montrait le bon niveau. Deux captures irréconciliables, et
    aucune des deux ne disait où était la faute.
    """
    pid = portefeuille_garni(client)
    declarer_avec_apport(client, pid, APPORT, date.today().isoformat())

    points = history(client, pid, period=periode)["points"]
    assert points[-1]["date"][:10] == date.today().isoformat(), (
        f"la fenêtre « {periode} » s'arrête le {points[-1]['date'][:10]} : tout apport "
        f"postérieur est perdu, et la mise à l'échelle du graphique déforme alors "
        f"l'intégralité de la courbe.")

    # ⚠️ Une seule forme de temps par série : une date nue glissée au milieu d'horodatages
    # donne deux types de temps dans la même courbe, que la bibliothèque de tracé refuse.
    formes = {len(p["date"]) > 10 for p in points}
    assert len(formes) == 1, (
        f"la fenêtre « {periode} » mêle dates nues et horodatages")


def test_la_fenetre_24h_passe_bien_en_barres_intraday(client, cours):
    """
    ⚠️ **Sans cette assertion, le test précédent pourrait devenir vide sans qu'on le voie.**
    Il ne garde le défaut que s'il emprunte le chemin où le défaut se produisait — celui du
    remplacement par les barres intraday. Le jour où la simulation de cours cesserait d'en
    fournir, les sept fenêtres resteraient journalières, le test resterait vert, et il ne
    vérifierait plus rien. C'est exactement la façon dont la règle centrale de ce module a
    déjà été enfreinte deux fois : une garde satisfaite parce qu'il ne se passait rien.
    """
    pid = portefeuille_garni(client)
    declarer_avec_apport(client, pid, APPORT, date.today().isoformat())

    points = history(client, pid, period="1d")["points"]
    assert any(len(p["date"]) > 10 for p in points), (
        "« 24 h » doit rendre des barres horodatées : sans elles, le test des fenêtres "
        "ne traverse jamais le remplacement intraday qu'il est censé garder.")


# ── Le patrimoine qui n'est fait que d'épargne ────────────────────────────────

def portefeuille_sans_operation(client, montant=APPORT_LIVRET, quand=None):
    """Un portefeuille qui ne contient qu'un livret : aucune ligne, aucun titre."""
    pid = creer_portefeuille(client, "Que de l'épargne")
    declarer_avec_apport(
        client, pid, montant,
        (quand or (date.today() - timedelta(days=40))).isoformat())
    return pid


def test_un_portefeuille_de_pure_tresorerie_a_sa_courbe(client, cours):
    """
    ⚠️ **Il n'avait droit à rien, pas même à une ligne plate.** Les routes d'historique
    renonçaient avant d'avoir regardé le journal, la courbe se définissant comme « la
    trajectoire déduite des transactions ». Depuis que l'épargne est faite d'apports datés
    — le même objet qu'un achat de titres — les mêmes 8 400 € donnaient une courbe complète
    si le portefeuille détenait par ailleurs une action, et une page vide sinon.
    """
    pid = portefeuille_sans_operation(client)
    d = history(client, pid)

    assert d["source"] == "tresorerie"
    assert d["points"], "un portefeuille qui contient de l'argent doit avoir une courbe"
    assert d["points"][-1]["patrimoine"] == pytest.approx(APPORT_LIVRET, abs=0.01)
    assert d["points"][-1]["date"] == date.today().isoformat(), (
        "la courbe d'une épargne s'arrête aujourd'hui : aucune séance ne la borne")


def test_une_epargne_seule_n_affiche_aucune_performance(client, cours):
    """
    ⚠️ **Le cas où la règle centrale est la plus exposée**, puisqu'il n'y a rien d'autre à
    montrer. Le gain vaut zéro euro — verser n'est pas gagner — et le pourcentage n'existe
    pas, faute de capital engagé. `None` dit « il n'y a rien à mesurer », là où `0.0`
    affirmerait « vos fonds n'ont pas bougé » à quelqu'un qui n'en a aucun.
    """
    d = history(client, portefeuille_sans_operation(client))

    assert d["gain_eur"] == 0.0
    assert d["gain_pct"] is None
    assert d["twr_pct"] is None
    assert all(p["invested"] == 0.0 for p in d["points"])
    assert all(p["value"] == 0.0 for p in d["points"]), (
        "aucun titre n'est détenu : la valeur des titres est nulle, pas le patrimoine")


def test_la_fenetre_courte_montre_le_solde_entier_et_non_ses_seuls_versements(client, cours):
    """
    ⚠️ Un apport antérieur à la fenêtre compte quand même : la somme cumulée absorbe tout
    ce qui précède le premier jour tracé. Sans cela, « 7 jours » afficherait un livret de
    douze ans à zéro parce qu'aucun versement n'y a été fait cette semaine-là.
    """
    pid = portefeuille_sans_operation(client)
    d = history(client, pid, period="7d")

    assert d["points"], "la fenêtre courte doit rester traçable"
    assert d["points"][0]["patrimoine"] == pytest.approx(APPORT_LIVRET, abs=0.01)


def test_sans_argent_ni_operation_il_n_y_a_toujours_rien_a_tracer(client, cours):
    """
    ⚠️ Le renoncement reste la bonne réponse quand il n'y a réellement rien : un
    portefeuille vide ne doit pas se voir offrir une ligne à zéro, qui se lirait comme une
    mesure alors qu'elle ne mesure rien.
    """
    pid = creer_portefeuille(client, "Vide")
    d = history(client, pid)
    assert d["points"] == [] and d["source"] == "aucune"


def test_la_somme_par_compte_redonne_le_total_sans_operation(client, cours):
    """
    ⚠️ **La promesse de `/history/comptes` vaut aussi ici.** Si cette route renonçait
    pendant que le total trace une épargne, basculer de « total » à « par compte » ferait
    disparaître l'argent — et la somme des parties cesserait de redonner le tout.
    """
    pid = portefeuille_sans_operation(client)
    total = history(client, pid)["points"][-1]["patrimoine"]

    r = client.get(f"/api/v1/portfolios/{pid}/history/comptes?period=max")
    assert r.status_code == 200, r.text
    decoupe = r.json()
    assert decoupe["source"] == "tresorerie"
    somme = sum(c["points"][-1]["value"] for c in decoupe["comptes"])
    assert somme == pytest.approx(total, abs=0.01)


def test_le_capital_investi_ignore_la_tresorerie(client, cours):
    """
    ⚠️ **Le corollaire qui empêche de « corriger » en gonflant le dénominateur.** Ajouter
    l'apport au capital investi ferait bien retomber le pourcentage, mais en racontant que
    l'épargnant a investi 5 000 € de plus en titres. Le gain en euros, lui, resterait
    faux. `invested` ne bouge donc pas non plus.
    """
    pid = portefeuille_garni(client)
    investi_avant = history(client, pid)["points"][-1]["invested"]

    declarer_avec_apport(client, pid, APPORT, date.today().isoformat())

    investi_apres = history(client, pid)["points"][-1]["invested"]
    assert investi_apres == pytest.approx(investi_avant, abs=0.01), (
        "Le capital investi a absorbé l'apport : la trésorerie n'est pas un achat.")
