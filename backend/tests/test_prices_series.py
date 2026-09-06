"""Série de sparkline renvoyée par /prices.

Les deux invariants testés ici sont ceux qui, une fois rompus, font mentir la
carte d'actif sans rien casser de visible : une courbe qui ne finit pas sur le
prix affiché, ou qui enjambe une clôture.
"""
from datetime import datetime, timedelta

import pandas as pd
import pytest

from app.api.routes.backtest import (_downsample, _intraday_24h, _session_with_base,
                                     _trim_depuis, _trim_to_period)


class TestTrimToPeriod:
    """La fenêtre téléchargée est plus large que la période, à dessein.

    Sans coupe, cette marge était comptée comme de la période : « 7 jours »
    en couvrait douze, « 1 an » quatorze mois. Mesuré sur données réelles,
    NVDA affichait +41,74 % sur un an au lieu de +11,61 %, et MSFT sortait un
    mois à -4,47 % quand il valait +5,46 % — signe inversé.
    """

    @staticmethod
    def _serie(jours: int):
        fin = datetime.today().date()
        idx = pd.to_datetime([fin - timedelta(days=n) for n in range(jours, -1, -1)])
        return pd.Series(range(len(idx)), index=idx, dtype=float)

    def test_coupe_a_sept_jours(self):
        s = self._serie(30)
        coupe = _trim_to_period(s, "7d")
        assert (coupe.index[-1] - coupe.index[0]).days == 7

    def test_coupe_a_un_an(self):
        s = self._serie(420)
        coupe = _trim_to_period(s, "1y")
        assert (coupe.index[-1] - coupe.index[0]).days == 365

    def test_garde_la_derniere_cotation_avant_la_borne(self):
        """« Il y a sept jours » désigne le dernier cours connu à cette date.

        Ici seuls les jours pairs cotent, et la borne à J-7 tombe un jour sans
        cotation : la référence doit être J-8, la dernière séance antérieure,
        et non J-6 qui raccourcirait la période.
        """
        fin = datetime.today().date()
        idx = pd.to_datetime([fin - timedelta(days=n) for n in range(20, -1, -2)])
        s = pd.Series(range(len(idx)), index=idx, dtype=float)
        coupe = _trim_to_period(s, "7d")
        assert (fin - coupe.index[0].date()).days == 8

    def test_periode_inconnue_intacte(self):
        """1d garde son propre calcul, sur les deux dernières clôtures."""
        s = self._serie(30)
        assert len(_trim_to_period(s, "1d")) == len(s)

    def test_fenetre_plus_courte_que_la_periode(self):
        """Un actif récemment coté n'a pas un an d'historique : on garde tout."""
        s = self._serie(40)
        assert len(_trim_to_period(s, "1y")) == len(s)

    def test_serie_vide(self):
        assert len(_trim_to_period(pd.Series(dtype=float), "1y")) == 0

    def test_index_avec_fuseau(self):
        """Les séries intraday portent un fuseau ; comparer sans lui lève."""
        idx = pd.date_range(datetime.today().date() - timedelta(days=30),
                            periods=31, freq="D", tz="America/New_York")
        s = pd.Series(range(31), index=idx, dtype=float)
        assert len(_trim_to_period(s, "7d")) > 0

    def test_dataframe_accepte(self):
        """portfolio-history coupe un tableau entier, pas une seule série."""
        s = self._serie(30)
        df = pd.DataFrame({"AAPL": s, "MSFT": s})
        coupe = _trim_to_period(df, "7d")
        assert (coupe.index[-1] - coupe.index[0]).days == 7
        assert list(coupe.columns) == ["AAPL", "MSFT"]


class TestTrimDepuis:
    """La courbe d'une carte s'arrête à la date de détention.

    Sans borne, « max » rendait l'historique du fonds depuis sa création : un
    ETF né en 2016 dessinait une multiplication par six sous une carte
    annonçant +6 %, la courbe parlant du fonds et le chiffre de la position.
    Mesuré sur ESE.PA : 5,27 → 34,04 € et +545,7 % au lieu de +15,6 %.
    """

    @staticmethod
    def _serie(jours: int):
        fin = datetime.today().date()
        idx = pd.to_datetime([fin - timedelta(days=n) for n in range(jours, -1, -1)])
        return pd.Series(range(len(idx)), index=idx, dtype=float)

    def test_coupe_a_la_date_donnee(self):
        s = self._serie(30)
        borne = (datetime.today().date() - timedelta(days=10)).isoformat()
        coupe = _trim_depuis(s, borne)
        assert len(coupe) == 11
        assert coupe.index[0].date().isoformat() == borne

    def test_prend_la_cotation_anterieure_ou_egale(self):
        """
        Le jour d'un achat, le prix de référence est celui qu'on connaissait
        alors — pas celui de la séance suivante. Même règle que pour les
        périodes, sans quoi les deux coupes se contrediraient.
        """
        idx = pd.to_datetime(["2026-01-05", "2026-01-12", "2026-01-19"])
        s = pd.Series([10.0, 11.0, 12.0], index=idx)
        # Le 8 n'est pas coté : on repart du 5, pas du 12.
        assert _trim_depuis(s, "2026-01-08").index[0] == idx[0]

    def test_sans_borne_ne_touche_a_rien(self):
        s = self._serie(30)
        assert len(_trim_depuis(s, "")) == len(s)
        assert len(_trim_depuis(s, None)) == len(s)

    def test_date_illisible_ne_casse_pas_la_carte(self):
        s = self._serie(5)
        assert len(_trim_depuis(s, "pas-une-date")) == len(s)

    def test_borne_postérieure_garde_deux_points_et_pas_toute_la_série(self):
        """
        Une date plus récente que toute la série ne laisserait qu'un point, et
        une sparkline d'un point est un pixel. On garde donc **les deux derniers**.

        ⚠️ **Ce test affirmait l'inverse, et l'écran a tranché.** Il exigeait la
        série entière — « mieux vaut une courbe trop longue qu'une carte vide ».
        Le principe était bon, la conséquence non : une ligne achetée la veille
        faisait afficher `AAPL` à **+331 078 %** sur quarante points, à côté de
        voisines bornées à quatre points et +2 %. Deux points suffisent à tracer,
        et ils parlent de la détention au lieu de l'histoire du titre.
        """
        s = self._serie(5)
        coupe = _trim_depuis(s, "2099-01-01")
        assert len(coupe) == 2
        # Ce sont bien les deux plus récents, pas deux points quelconques.
        assert list(coupe.values) == list(s.values[-2:])


class TestDownsample:
    def test_serie_courte_intacte(self):
        assert _downsample([1.0, 2.0, 3.0], max_points=40) == [1.0, 2.0, 3.0]

    def test_respecte_la_borne(self):
        assert len(_downsample([float(i) for i in range(1000)], max_points=40)) == 40

    def test_conserve_le_dernier_point(self):
        """Le dernier point est le prix courant, celui écrit sur la carte.

        Un pas régulier le manque presque toujours : sur 1000 points ramenés à
        40, l'échantillonnage s'arrête à l'indice 975. La courbe finirait alors
        ailleurs que le montant affiché juste à côté d'elle.
        """
        vals = [float(i) for i in range(1000)]
        assert _downsample(vals, max_points=40)[-1] == 999.0

    def test_conserve_le_premier_point(self):
        """Le premier point est la référence de la variation."""
        vals = [float(i) for i in range(1000)]
        assert _downsample(vals, max_points=40)[0] == 0.0

    def test_serie_vide(self):
        assert _downsample([], max_points=40) == []


class TestIntraday24h:
    @staticmethod
    def _frame():
        """Deux séances de trois barres, deux tickers, à un jour d'écart."""
        idx = (list(pd.date_range("2026-07-27 09:00", periods=3, freq="15min", tz="Europe/Paris"))
               + list(pd.date_range("2026-07-28 09:00", periods=3, freq="15min", tz="Europe/Paris")))
        return pd.DataFrame(
            {"AAPL": [10.0, 11.0, 12.0, 20.0, 21.0, 22.0],
             "MSFT": [30.0, 31.0, 32.0, 40.0, 41.0, 42.0]},
            index=pd.DatetimeIndex(idx),
        )

    def test_vingt_quatre_heures_depuis_la_derniere_barre(self):
        """Le point capital : la fenêtre remonte d'un jour depuis la dernière barre, donc la
        séance de la veille y entre — pas seulement la séance en cours, qui à l'ouverture ne
        compte qu'une barre ou deux."""
        close = self._frame()
        # Dernière barre : 28/07 09:30 ; fenêtre depuis 27/07 09:30 inclus → 09:00 et 09:15
        # de la veille sortent, sa barre de 09:30 reste.
        assert _intraday_24h(close, "AAPL", 2) == [12.0, 20.0, 21.0, 22.0]

    def test_isole_le_bon_ticker(self):
        assert _intraday_24h(self._frame(), "MSFT", 2) == [32.0, 40.0, 41.0, 42.0]

    def test_ticker_absent(self):
        assert _intraday_24h(self._frame(), "TSLA", 2) == []

    def test_sans_donnee(self):
        assert _intraday_24h(None, "AAPL", 1) == []

    def test_ticker_unique_en_serie(self):
        """Sur un seul ticker, yfinance renvoie une Series, pas un DataFrame."""
        close = self._frame()
        assert _intraday_24h(close["AAPL"], "AAPL", 1) == [12.0, 20.0, 21.0, 22.0]

    def test_un_dimanche_rend_toute_la_seance_du_vendredi(self):
        """⚠️ Depuis la dernière barre, pas depuis l'horloge : un week-end, la fenêtre
        d'horloge serait vide et la carte n'aurait rien à tracer."""
        close = self._frame().iloc[:3]  # seule la « veille » a coté
        assert _intraday_24h(close, "AAPL", 2) == [10.0, 11.0, 12.0]


class TestSessionWithBase:
    """La courbe du jour part de la clôture de la veille, pas de l'ouverture.

    Défaut mesuré en conditions réelles : la bande de tête annonçait +0,40 %
    quand la courbe descendait à -0,18 %. Deux signes opposés pour la même
    journée, sur le même écran, parce que l'une partait de la clôture
    précédente et l'autre de la première barre du jour.
    """

    @staticmethod
    def _frame():
        """Deux séances : trois barres hier, deux aujourd'hui."""
        sessions = [
            pd.Timestamp("2026-07-28").date(), pd.Timestamp("2026-07-28").date(), pd.Timestamp("2026-07-28").date(),
            pd.Timestamp("2026-07-29").date(), pd.Timestamp("2026-07-29").date(),
        ]
        frame = pd.DataFrame(
            {"AAPL": [10.0, 11.0, 12.0, 11.5, 11.8]},
            index=pd.date_range("2026-07-28 09:30", periods=5, freq="15min", tz="America/New_York"),
        )
        return frame, sessions

    def test_ajoute_la_cloture_de_la_veille(self):
        frame, sessions = self._frame()
        out = _session_with_base(frame, sessions)
        assert list(out["AAPL"]) == [12.0, 11.5, 11.8]

    def test_la_base_donne_le_bon_signe(self):
        """Le cœur du défaut : la journée est en baisse, pas en hausse.

        Depuis l'ouverture du jour (11,5 → 11,8) on lisait +2,6 %. Depuis la
        clôture de la veille (12,0 → 11,8) la journée vaut -1,7 %.
        """
        frame, sessions = self._frame()
        out = _session_with_base(frame, sessions)
        depuis_base = (out["AAPL"].iloc[-1] / out["AAPL"].iloc[0] - 1) * 100
        assert depuis_base < 0
        assert depuis_base == pytest.approx(-1.667, abs=0.01)

    def test_ne_garde_qu_une_ligne_de_la_veille(self):
        """Une seule, la dernière : deux feraient apparaître le saut de nuit."""
        frame, sessions = self._frame()
        out = _session_with_base(frame, sessions)
        assert len(out) == 3

    def test_premiere_seance_disponible(self):
        """Sans séance antérieure, on garde le jour seul plutôt que de vider."""
        frame = pd.DataFrame({"AAPL": [10.0, 11.0]},
                             index=pd.date_range("2026-07-29 09:30", periods=2, freq="15min", tz="America/New_York"))
        sessions = [pd.Timestamp("2026-07-29").date()] * 2
        out = _session_with_base(frame, sessions)
        assert len(out) == 2

    def test_tableau_vide(self):
        assert len(_session_with_base(pd.DataFrame(), [])) == 0

    def test_conserve_toutes_les_colonnes(self):
        frame, sessions = self._frame()
        frame["MSFT"] = [20.0, 21.0, 22.0, 21.5, 21.8]
        out = _session_with_base(frame, sessions)
        assert list(out.columns) == ["AAPL", "MSFT"]
        assert list(out["MSFT"]) == [22.0, 21.5, 21.8]
