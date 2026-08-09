"""
La fenêtre « 24 h » de la courbe de portefeuille.

Deux règles, et chacune corrige un défaut qui se voyait à l'écran : la courbe
d'une journée affichait deux points reliés par un segment de droite, avec les
nombres « 6 » et « 7 » pour tout repère en abscisse.
"""

from datetime import datetime, timedelta
from types import SimpleNamespace

import pandas as pd
import pytest
import yfinance

from app.api.routes.transactions import _pas_intraday, _points_intraday

PARIS = "Europe/Paris"


def _txs(ticker="A", quantite=10.0, prix=100.0, quand=datetime(2026, 8, 1, 10, 0)):
    return [SimpleNamespace(ticker=ticker, side="buy", quantity=quantite,
                            unit_price=prix, fees=0.0, executed_at=quand)]


def _seance(jour: int, ouverture=9, cloture=17, pas_min=1, prix=100.0):
    """Une séance parisienne d'août 2026, en barres régulières."""
    debut = pd.Timestamp(f"2026-08-{jour:02d} {ouverture:02d}:00", tz=PARIS)
    fin = pd.Timestamp(f"2026-08-{jour:02d} {cloture:02d}:00", tz=PARIS)
    idx = pd.date_range(debut, fin, freq=f"{pas_min}min")
    return pd.Series([prix + i * 0.01 for i in range(len(idx))], index=idx)


@pytest.fixture
def telechargement(monkeypatch):
    """Remplace yfinance et retient les arguments reçus."""
    recu = {}

    def faux(tickers, **kw):
        recu.update(kw)
        recu["tickers"] = tickers
        return {"Close": recu["serie"].to_frame("A")}

    monkeypatch.setattr(yfinance, "download", faux)
    return recu


class TestPasImpose:
    """Sur « 24 h », la finesse ne doit pas dépendre du jour de la semaine."""

    def test_la_veille_boursiere_lointaine_garde_la_minute(self, telechargement):
        # Un lundi, la veille boursière est le vendredi : trois jours. La règle
        # des fenêtres longues aurait alors choisi le quart d'heure.
        assert _pas_intraday(3) == "15m"

        telechargement["serie"] = _seance(7)
        _points_intraday(["A"], _txs(), "1d", datetime(2026, 8, 4).date())
        assert telechargement["interval"] == "1m", (
            "la courbe d'une journée doit rester en barres d'une minute quel que "
            "soit l'écart au dernier jour coté")

    def test_les_fenetres_longues_gardent_leur_regle(self, telechargement):
        telechargement["serie"] = _seance(7, pas_min=15)
        _points_intraday(["A"], _txs(), "1mo", datetime(2026, 7, 20).date())
        assert telechargement["interval"] == "15m"


class TestFenetreAncreeSurLeRuban:
    """Les vingt-quatre heures partent de la dernière barre, pas de l'horloge."""

    def test_un_week_end_rend_la_derniere_seance(self, telechargement):
        # Jeudi et vendredi cotés, puis rien : c'est la situation d'un dimanche,
        # où la dernière cotation a plus de vingt-quatre heures. La fenêtre
        # d'horloge ne retenait aucune barre et la courbe retombait sur deux
        # clôtures journalières.
        telechargement["serie"] = pd.concat([_seance(6), _seance(7, prix=101.0)])
        pts = _points_intraday(["A"], _txs(), "1d", datetime(2026, 8, 6).date())

        assert len(pts) > 2, "la séance entière doit être rendue, pas un segment"
        horodatages = [p["date"] for p in pts]
        assert any(h.startswith("2026-08-07") for h in horodatages), \
            "la dernière séance cotée doit être dans la fenêtre"

    def test_la_fenetre_reste_de_vingt_quatre_heures(self, telechargement):
        # Trois séances disponibles : la fenêtre ne doit pas toutes les prendre.
        telechargement["serie"] = pd.concat([_seance(5), _seance(6), _seance(7)])
        pts = _points_intraday(["A"], _txs(), "1d", datetime(2026, 8, 6).date())

        premier = datetime.fromisoformat(pts[0]["date"])
        dernier = datetime.fromisoformat(pts[-1]["date"])
        assert dernier - premier <= timedelta(hours=24)
        assert not any(p["date"].startswith("2026-08-05") for p in pts), \
            "la séance de l'avant-veille est hors de la fenêtre"

    def test_en_seance_le_comportement_ne_change_pas(self, telechargement):
        # La dernière barre datant de l'instant, l'ancrage sur le ruban et
        # l'ancrage sur l'horloge coïncident : c'est ce qui rend la correction
        # sans effet de bord aux heures d'ouverture.
        maintenant = pd.Timestamp.now(tz=PARIS).floor("min")
        idx = pd.date_range(maintenant - pd.Timedelta(hours=3), maintenant, freq="1min")
        telechargement["serie"] = pd.Series(
            [100.0 + i * 0.01 for i in range(len(idx))], index=idx)

        pts = _points_intraday(["A"], _txs(), "1d", maintenant.date())
        assert len(pts) == len(idx)
