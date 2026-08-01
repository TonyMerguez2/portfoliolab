"""
Trajectoire d'un portefeuille déduite de ses transactions.

Le défaut d'origine : un PEA ouvert en février affichait « +371 % sur tout
l'historique », la courbe remontant à la création du plus ancien fonds et
comptant l'historique de l'indice comme performance de l'épargnant.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_portfolio_history.py -v
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from app.services.portfolio_history import (courbe_portefeuille, twr_sur_fenetre,
    dietz_sur_fenetre, simuler_benchmark)


def tx(ticker, qty, prix, jour, side="BUY", fees=0.0):
    return {
        "ticker": ticker, "side": side, "quantity": qty,
        "unit_price": prix, "fees": fees, "executed_at": jour,
    }


def jours(debut: date, n: int) -> list[date]:
    return [debut + timedelta(days=i) for i in range(n)]


class TestDebutDeCourbe:
    def test_commence_a_la_premiere_transaction(self):
        """
        Rien avant le premier achat : le portefeuille n'existait pas.

        C'est le défaut d'origine — la courbe démarrait à la création du fonds.
        """
        d0 = date(2026, 2, 6)
        cal = jours(date(2021, 1, 1), 3000)
        cours = {"ESE.PA": {j: 30.0 for j in cal}}
        r = courbe_portefeuille([tx("ESE.PA", 1, 29.23, d0)], cours, cal)

        assert r["start"] == "2026-02-06"
        assert r["points"][0]["date"] == "2026-02-06"

    def test_sans_transaction(self):
        r = courbe_portefeuille([], {}, jours(date(2026, 1, 1), 10))
        assert r["points"] == []
        assert r["twr_pct"] is None


class TestValeur:
    def test_valeur_suit_les_quantites_detenues(self):
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {d[0]: 10.0, d[1]: 11.0, d[2]: 12.0}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert [p["value"] for p in r["points"]] == [100.0, 110.0, 120.0]

    def test_un_renfort_augmente_la_valeur(self):
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0]), tx("A", 10, 10.0, d[2])], cours, d)
        assert [p["value"] for p in r["points"]] == [100.0, 100.0, 200.0]

    def test_capital_investi_cumule_les_versements(self):
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0]), tx("A", 5, 10.0, d[2])], cours, d)
        assert [p["invested"] for p in r["points"]] == [100.0, 100.0, 150.0]

    def test_frais_comptes_dans_l_investi(self):
        d = jours(date(2026, 1, 1), 1)
        cours = {"A": {d[0]: 10.0}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0], fees=2.5)], cours, d)
        assert r["points"][0]["invested"] == 102.5
        assert r["pnl_eur"] == pytest.approx(-2.5)

    def test_vente_reduit_la_position(self):
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille(
            [tx("A", 10, 10.0, d[0]), tx("A", 4, 10.0, d[2], side="SELL")], cours, d)
        assert r["points"][-1]["value"] == 60.0

    def test_cours_manquant_reporte_le_dernier(self):
        """Un jour férié n'annule pas la détention."""
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {d[0]: 10.0, d[2]: 12.0}}   # d[1] absent
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert [p["value"] for p in r["points"]] == [100.0, 100.0, 120.0]


class TestTWR:
    def test_hausse_simple(self):
        d = jours(date(2026, 1, 1), 2)
        cours = {"A": {d[0]: 10.0, d[1]: 11.0}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert r["twr_pct"] == pytest.approx(10.0, abs=1e-6)

    def test_un_versement_n_est_pas_une_performance(self):
        """
        Verser de l'argent ne fait pas monter le rendement.

        C'est le cœur du problème : le rapport brut entre valeur finale et
        valeur initiale compterait ce versement comme un doublement.
        """
        d = jours(date(2026, 1, 1), 2)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0]), tx("A", 10, 10.0, d[1])], cours, d)
        assert r["points"][-1]["value"] == 200.0
        assert r["twr_pct"] == pytest.approx(0.0, abs=1e-6)   # et non +100 %

    def test_versements_reguliers_puis_hausse(self):
        """Un plan d'investissement progressif ne gonfle pas le rendement."""
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {d[0]: 10.0, d[1]: 10.0, d[2]: 11.0}}
        r = courbe_portefeuille(
            [tx("A", 10, 10.0, d[0]), tx("A", 10, 10.0, d[1])], cours, d)
        # 20 titres passés de 10 à 11 : +10 %, quels que soient les versements.
        assert r["twr_pct"] == pytest.approx(10.0, abs=1e-6)

    def test_chainage_des_sous_periodes(self):
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {d[0]: 10.0, d[1]: 11.0, d[2]: 9.9}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        # (1 + 0,10) × (1 − 0,10) − 1 = −1 %
        assert r["twr_pct"] == pytest.approx(-1.0, abs=1e-6)

    def test_pnl_est_la_difference_valeur_investi(self):
        d = jours(date(2026, 1, 1), 2)
        cours = {"A": {d[0]: 10.0, d[1]: 12.0}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert r["pnl_eur"] == pytest.approx(20.0)
        assert r["invested"] == pytest.approx(100.0)


class TestCasReel:
    def test_pea_alimente_mensuellement(self):
        """
        Le cas de l'utilisateur, réduit : des achats mensuels sur six mois.

        Le portefeuille ne doit ni commencer avant le premier achat, ni afficher
        la performance de l'indice depuis sa création.
        """
        cal = jours(date(2026, 2, 1), 180)
        # Cours plat : quoi qu'on verse, le rendement doit rester nul.
        cours = {"ESE.PA": {j: 30.0 for j in cal}}
        achats = [tx("ESE.PA", 5, 30.0, date(2026, 2, 6) + timedelta(days=30 * i))
                  for i in range(5)]

        r = courbe_portefeuille(achats, cours, cal)
        assert r["start"] == "2026-02-06"
        assert r["twr_pct"] == pytest.approx(0.0, abs=1e-6)
        assert r["points"][-1]["value"] == pytest.approx(25 * 30.0)
        assert r["pnl_eur"] == pytest.approx(0.0, abs=1e-6)


class TestTWRSurFenetre:
    def test_rechaine_au_lieu_de_comparer_les_bornes(self):
        """
        Sur une fenêtre courte, comparer valeur de début et de fin recompterait
        les versements de la période comme performance.
        """
        d = jours(date(2026, 1, 1), 4)
        cours = {"A": {j: 10.0 for j in d}}
        # Cours plat, mais un versement au 3e jour double la valeur.
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0]), tx("A", 10, 10.0, d[2])], cours, d)
        assert r["points"][-1]["value"] == 200.0
        assert twr_sur_fenetre(r["points"], d[1].isoformat()) == pytest.approx(0.0, abs=1e-6)

    def test_fenetre_couvrant_une_hausse(self):
        d = jours(date(2026, 1, 1), 4)
        cours = {"A": {d[0]: 10.0, d[1]: 10.0, d[2]: 11.0, d[3]: 11.0}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert twr_sur_fenetre(r["points"], d[1].isoformat()) == pytest.approx(10.0, abs=1e-6)

    def test_fenetre_hors_periode(self):
        d = jours(date(2026, 1, 1), 2)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert twr_sur_fenetre(r["points"], "2030-01-01") is None

    def test_fenetre_d_un_seul_point(self):
        """Un seul jour ne porte aucun rendement : zéro, et non un chiffre inventé."""
        d = jours(date(2026, 1, 1), 2)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert twr_sur_fenetre(r["points"], d[1].isoformat()) == 0.0


class TestRendementDeLEpargnant:
    def test_gain_en_euros_est_la_difference_nette(self):
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {d[0]: 10.0, d[1]: 10.0, d[2]: 11.0}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        g = dietz_sur_fenetre(r["points"], d[0].isoformat())
        assert g["gain_eur"] == pytest.approx(10.0)     # 100 € → 110 €
        assert g["gain_pct"] == pytest.approx(10.0)

    def test_pourcentage_rapporte_au_capital_engage(self):
        """
        Le pourcentage affiché est celui que l'épargnant calcule de tête :
        gain divisé par ce qu'il a mis sur la table.

        C'est aussi la base du repère : deux pourcentages calculés autrement ne
        se compareraient pas.
        """
        d = jours(date(2026, 1, 1), 5)
        cours = {"A": {d[0]: 10.0, d[1]: 10.0, d[2]: 10.0, d[3]: 10.0, d[4]: 11.0}}
        r = courbe_portefeuille(
            [tx("A", 10, 10.0, d[0]), tx("A", 10, 10.0, d[3])], cours, d)
        g = dietz_sur_fenetre(r["points"], d[0].isoformat())
        assert g["gain_eur"] == pytest.approx(20.0)
        assert g["gain_pct"] == pytest.approx(10.0)      # 20 € sur 200 € versés

    def test_taux_dietz_pondere_le_temps_de_presence(self):
        """
        Le taux, lui, tient compte du moment des versements : celui du 4e jour
        n'a pas travaillé autant que celui du 1er, la base est plus faible et
        le taux plus élevé.
        """
        d = jours(date(2026, 1, 1), 5)
        cours = {"A": {d[0]: 10.0, d[1]: 10.0, d[2]: 10.0, d[3]: 10.0, d[4]: 11.0}}
        r = courbe_portefeuille(
            [tx("A", 10, 10.0, d[0]), tx("A", 10, 10.0, d[3])], cours, d)
        g = dietz_sur_fenetre(r["points"], d[0].isoformat())
        assert g["taux_pct"] > g["gain_pct"]

    def test_versement_sans_hausse_ne_rapporte_rien(self):
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0]), tx("A", 10, 10.0, d[2])], cours, d)
        g = dietz_sur_fenetre(r["points"], d[0].isoformat())
        assert g["gain_eur"] == pytest.approx(0.0, abs=1e-6)
        assert g["gain_pct"] == pytest.approx(0.0, abs=1e-6)

    def test_inferieur_au_twr_quand_l_argent_arrive_tard(self):
        """
        Le cas de l'utilisateur : les fonds montent, mais l'argent arrive après.

        Le TWR mesure les fonds, Dietz mesure l'épargnant — le second est plus
        bas, et c'est lui qui répond à « qu'ai-je gagné ? ».
        """
        d = jours(date(2026, 1, 1), 5)
        cours = {"A": {d[0]: 10.0, d[1]: 11.0, d[2]: 12.0, d[3]: 12.0, d[4]: 12.0}}
        r = courbe_portefeuille(
            [tx("A", 1, 10.0, d[0]), tx("A", 100, 12.0, d[3])], cours, d)
        g = dietz_sur_fenetre(r["points"], d[0].isoformat())
        assert r["twr_pct"] > g["gain_pct"]

    def test_fenetre_vide(self):
        d = jours(date(2026, 1, 1), 2)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert dietz_sur_fenetre(r["points"], "2030-01-01")["gain_pct"] is None


    def test_pondere_par_le_temps_pas_par_le_rang(self):
        """
        Un calendrier à trous ne doit pas fausser la pondération.

        Compter les points au lieu des jours ferait peser un versement suivi
        d'un long pont comme s'il datait de la veille.
        """
        # Deux points seulement, séparés de dix jours.
        pts = [
            {"date": "2026-01-01", "value": 100.0, "flow": 100.0, "ret": 0.0},
            {"date": "2026-01-11", "value": 210.0, "flow": 100.0, "ret": 0.0},
        ]
        g = dietz_sur_fenetre(pts, "2026-01-01")
        # 200 € versés, 210 € au bout : +10 €, soit +5 % du capital engagé.
        assert g["gain_eur"] == pytest.approx(10.0)
        assert g["gain_pct"] == pytest.approx(5.0)
        # Le second versement, arrivé le dernier jour, ne pèse rien dans la
        # base pondérée — qui vaut donc 100 €, d'où un taux de 10 %.
        assert g["taux_pct"] == pytest.approx(10.0)


class TestSimulationBenchmark:
    def test_rejoue_les_memes_versements(self):
        """Les mêmes sommes, aux mêmes dates, sur l'indice."""
        pts = [
            {"date": "2026-01-01", "value": 100.0, "flow": 100.0, "ret": 0.0},
            {"date": "2026-01-02", "value": 200.0, "flow": 100.0, "ret": 0.0},
        ]
        # L'indice double entre les deux jours.
        repere = {date(2026, 1, 1): 10.0, date(2026, 1, 2): 20.0}
        r = simuler_benchmark(pts, repere, "2026-01-01")
        # 100 € à 10 € → 10 parts ; 100 € à 20 € → 5 parts. 15 parts à 20 €.
        assert r["value"] == pytest.approx(300.0)
        assert r["gain_eur"] == pytest.approx(100.0)
        assert r["gain_pct"] == pytest.approx(50.0)

    def test_versement_tardif_ne_profite_pas_de_la_hausse(self):
        """Un euro versé le dernier jour n'a rien gagné, sur l'indice non plus."""
        pts = [
            {"date": "2026-01-01", "value": 0.0, "flow": 0.0, "ret": 0.0},
            {"date": "2026-01-02", "value": 100.0, "flow": 100.0, "ret": 0.0},
        ]
        repere = {date(2026, 1, 1): 10.0, date(2026, 1, 2): 20.0}
        r = simuler_benchmark(pts, repere, "2026-01-01")
        assert r["gain_eur"] == pytest.approx(0.0)

    def test_cours_manquant_reprend_le_precedent(self):
        """Paris et New York ne chôment pas les mêmes jours."""
        pts = [{"date": "2026-01-02", "value": 100.0, "flow": 100.0, "ret": 0.0}]
        repere = {date(2026, 1, 1): 10.0}          # rien au 2
        r = simuler_benchmark(pts, repere, "2026-01-02")
        assert r["value"] == pytest.approx(100.0)

    def test_sans_versement(self):
        pts = [{"date": "2026-01-01", "value": 0.0, "flow": 0.0, "ret": 0.0}]
        assert simuler_benchmark(pts, {date(2026, 1, 1): 10.0}, "2026-01-01")["value"] is None

    def test_fenetre_vide(self):
        assert simuler_benchmark([], {}, "2026-01-01")["value"] is None


class TestCoursManquants:
    def test_signale_un_titre_sans_cours(self):
        """
        Un titre détenu sans cours ne vaut pas zéro : il vaut une valeur qu'on
        ignore.

        L'omettre silencieusement de la somme donnait une courbe fausse et
        muette — sur un téléchargement partiel, un portefeuille de 5 134 €
        s'affichait à 1 568 €, soit une perte de 3 392 € inexistante.
        """
        d = jours(date(2026, 1, 1), 2)
        cours = {"A": {j: 10.0 for j in d}}          # rien pour B
        r = courbe_portefeuille(
            [tx("A", 10, 10.0, d[0]), tx("B", 10, 10.0, d[0])], cours, d)
        assert r["sans_cours"] == ["B"]

    def test_aucun_signalement_quand_tout_est_connu(self):
        d = jours(date(2026, 1, 1), 2)
        cours = {"A": {j: 10.0 for j in d}, "B": {j: 10.0 for j in d}}
        r = courbe_portefeuille(
            [tx("A", 10, 10.0, d[0]), tx("B", 10, 10.0, d[0])], cours, d)
        assert r["sans_cours"] == []

    def test_un_trou_ponctuel_ne_compte_pas(self):
        """Un jour férié se comble par report ; ce n'est pas un cours manquant."""
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {d[0]: 10.0, d[2]: 11.0}}      # d[1] absent
        r = courbe_portefeuille([tx("A", 10, 10.0, d[0])], cours, d)
        assert r["sans_cours"] == []

    def test_position_soldee_sans_cours_ne_compte_pas(self):
        """Un titre vendu en totalité n'est plus détenu : son cours est sans objet."""
        d = jours(date(2026, 1, 1), 3)
        cours = {"A": {j: 10.0 for j in d}}
        r = courbe_portefeuille(
            [tx("A", 10, 10.0, d[0]),
             tx("B", 5, 10.0, d[0]), tx("B", 5, 10.0, d[0], side="SELL")], cours, d)
        assert r["sans_cours"] == []
