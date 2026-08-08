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


    def test_fenetre_d_un_seul_point_avec_veille_connue(self):
        """
        Deux bornes suffisent, et la veille en est une.

        Exiger deux points *dans* la fenêtre rendait zéro sur 24 heures : une
        journée ne compte qu'une séance. Le gain sortait donc à zéro pendant
        que le repère, lui, affichait un chiffre — deux nombres censés se
        soustraire, dont l'un était faux.
        """
        pts = [
            {"date": "2026-01-01", "value": 100.0, "flow": 100.0, "ret": 0.0},
            {"date": "2026-01-02", "value": 120.0, "flow": 0.0,   "ret": 0.0},
        ]
        g = dietz_sur_fenetre(pts, "2026-01-02")
        assert g["gain_eur"] == pytest.approx(20.0)
        assert g["gain_pct"] == pytest.approx(20.0)

    def test_versement_le_premier_jour_de_la_fenetre_compte(self):
        """
        Un dépôt le premier jour de la fenêtre n'est pas de la performance.

        Il était écarté quand une veille existait, par crainte de compter le
        capital initial comme un gain. Mais la valeur d'ouverture est la
        clôture de la veille : elle ne peut pas contenir un versement du
        lendemain. L'écarter le faisait passer pour de la hausse.
        """
        pts = [
            {"date": "2026-01-01", "value": 100.0, "flow": 100.0, "ret": 0.0},
            {"date": "2026-01-02", "value": 250.0, "flow": 50.0,  "ret": 0.0},
            {"date": "2026-01-03", "value": 250.0, "flow": 0.0,   "ret": 0.0},
        ]
        # 250 au bout, 100 à l'ouverture, 50 versés : la hausse vaut 100.
        assert dietz_sur_fenetre(pts, "2026-01-02")["gain_eur"] == pytest.approx(100.0)

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

    def test_fenetre_sans_versement_compare_quand_meme(self):
        """
        Le capital déjà là compte autant que les versements de la période.

        Sur une fenêtre courte — 24 heures, ou un mois sans opération — il n'y
        a aucun flux à rejouer. La simulation renonçait alors et renvoyait des
        `None`, ce qui faisait disparaître le bloc de comparaison de l'écran :
        le seul moment où la comparaison manquait était celui où rien ne
        s'était passé, c'est-à-dire le cas le plus courant.
        """
        pts = [
            {"date": "2026-01-01", "value": 100.0, "flow": 100.0, "ret": 0.0},
            {"date": "2026-01-02", "value": 120.0, "flow": 0.0,   "ret": 0.0},
        ]
        repere = {date(2026, 1, 1): 10.0, date(2026, 1, 2): 11.0}
        # Fenêtre du 2 seul : aucun flux dedans, mais 100 € y étaient déjà.
        r = simuler_benchmark(pts, repere, "2026-01-02")
        # 100 € placés à 10 € la part la veille font 10 parts, valant 110 € au 2.
        assert r["value"] == pytest.approx(110.0)
        assert r["gain_eur"] == pytest.approx(10.0)
        assert r["gain_pct"] == pytest.approx(10.0)

    def test_meme_base_que_le_gain_de_l_epargnant(self):
        """
        Les deux nombres sont affichés côte à côte : ils doivent se soustraire.

        `dietz_sur_fenetre` rapporte le gain à la valeur d'ouverture plus les
        versements ; la simulation doit partir de la même mise, sinon l'écart
        entre les deux ne veut rien dire.
        """
        pts = [
            {"date": "2026-01-01", "value": 100.0, "flow": 100.0, "ret": 0.0},
            {"date": "2026-01-02", "value": 250.0, "flow": 50.0,  "ret": 0.0},
        ]
        repere = {date(2026, 1, 1): 10.0, date(2026, 1, 2): 10.0}
        # 100 € d'ouverture + 50 € versés = 150 € de mise commune.
        depuis = "2026-01-02"
        mien = dietz_sur_fenetre(pts, depuis)
        sien = simuler_benchmark(pts, repere, depuis)
        # Mise commune : 100 € d'ouverture + 50 € versés.
        assert sien["value"] - sien["gain_eur"] == pytest.approx(150.0)
        # L'indice n'ayant pas bougé, tout l'écart revient au portefeuille.
        assert mien["gain_eur"] - sien["gain_eur"] == pytest.approx(100.0)

    def test_fenetre_complete_ignore_l_ouverture(self):
        """Sur toute la détention il n'y a pas de veille : rien à ajouter."""
        pts = [
            {"date": "2026-01-01", "value": 100.0, "flow": 100.0, "ret": 0.0},
            {"date": "2026-01-02", "value": 200.0, "flow": 100.0, "ret": 0.0},
        ]
        repere = {date(2026, 1, 1): 10.0, date(2026, 1, 2): 20.0}
        r = simuler_benchmark(pts, repere, "2026-01-01")
        assert r["value"] == pytest.approx(300.0)

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


# ── courbe_intraday ───────────────────────────────────────────────────────────

def _ts(h, m=0, jour=6):
    """Un horodatage conscient, comme ceux que rend yfinance."""
    from datetime import datetime, timezone
    return datetime(2026, 8, jour, h, m, tzinfo=timezone.utc)


def _achat(ticker, q, prix, jour=1):
    from datetime import datetime
    return {"ticker": ticker, "side": "BUY", "quantity": q, "unit_price": prix,
            "fees": 0.0, "executed_at": datetime(2026, 8, jour, 10, 0)}


def test_intraday_reagit_a_celui_qui_cote():
    """Le cœur de l'affaire : un titre qui saute des créneaux ne gèle pas la courbe."""
    from app.services.portfolio_history import courbe_intraday
    txs = [_achat("A", 10, 100.0), _achat("B", 10, 50.0)]
    cours = {
        # A cote partout, B seulement au premier et au dernier créneau.
        "A": {_ts(9): 100.0, _ts(9, 15): 101.0, _ts(9, 30): 102.0},
        "B": {_ts(9): 50.0, _ts(9, 30): 60.0},
    }
    instants = sorted({i for m in cours.values() for i in m})
    pts = courbe_intraday(txs, cours, instants)

    assert len(pts) == 3, "l'intersection en aurait gardé deux"
    # 9h00 : 10×100 + 10×50 = 1500
    # 9h15 : A monte, B est reporté à 50 → 1010 + 500 = 1510
    # 9h30 : les deux cotent → 1020 + 600 = 1620
    assert [p["value"] for p in pts] == [1500.0, 1510.0, 1620.0]


def test_intraday_ne_suppose_rien_avant_la_premiere_cotation():
    from app.services.portfolio_history import courbe_intraday
    txs = [_achat("A", 10, 100.0), _achat("B", 10, 50.0)]
    cours = {"A": {_ts(9): 100.0, _ts(9, 15): 101.0}, "B": {_ts(9, 15): 50.0}}
    instants = sorted({i for m in cours.values() for i in m})
    pts = courbe_intraday(txs, cours, instants)
    # B n'a pas de base à 9h00 : cet instant est passé, pas valorisé à moitié.
    assert len(pts) == 1
    assert pts[0]["value"] == 1010.0 + 500.0


def test_intraday_lit_tout_mais_ne_rend_que_depuis_la_borne():
    from app.services.portfolio_history import courbe_intraday
    txs = [_achat("A", 10, 100.0)]
    cours = {"A": {_ts(9, jour=5): 100.0, _ts(9, jour=6): 110.0, _ts(9, 15, jour=6): 111.0}}
    instants = sorted(cours["A"])
    pts = courbe_intraday(txs, cours, instants, depuis=_ts(9, jour=6))
    assert [p["value"] for p in pts] == [1100.0, 1110.0]


def test_intraday_suit_une_vente_en_cours_de_seance():
    from app.services.portfolio_history import courbe_intraday
    from datetime import datetime
    txs = [
        _achat("A", 10, 100.0),
        {"ticker": "A", "side": "SELL", "quantity": 4, "unit_price": 105.0,
         "fees": 0.0, "executed_at": datetime(2026, 8, 6, 9, 20)},
    ]
    cours = {"A": {_ts(9): 100.0, _ts(9, 15): 100.0, _ts(9, 30): 100.0}}
    pts = courbe_intraday(txs, cours, sorted(cours["A"]))
    assert [p["value"] for p in pts] == [1000.0, 1000.0, 600.0]


def test_intraday_compare_les_horodatages_malgre_les_fuseaux():
    """Les dates d'exécution sont naïves, les barres non : la comparaison doit tenir."""
    from app.services.portfolio_history import courbe_intraday
    txs = [_achat("A", 10, 100.0, jour=6)]   # naïf, 10h00
    cours = {"A": {_ts(9): 100.0, _ts(11): 120.0}}
    pts = courbe_intraday(txs, cours, sorted(cours["A"]))
    # L'achat n'a lieu qu'à 10h : le premier créneau ne détient rien.
    assert len(pts) == 1
    assert pts[0]["value"] == 1200.0


def test_intraday_expose_le_capital_engage():
    """C'est `invested` qui permet de retirer les versements de la courbe."""
    from app.services.portfolio_history import courbe_intraday
    from datetime import datetime
    txs = [
        _achat("A", 10, 100.0),                                  # 1 000 € engagés
        {"ticker": "A", "side": "BUY", "quantity": 5, "unit_price": 100.0,
         "fees": 2.0, "executed_at": datetime(2026, 8, 6, 9, 20)},  # +502 €
    ]
    cours = {"A": {_ts(9): 100.0, _ts(9, 15): 100.0, _ts(9, 30): 100.0}}
    pts = courbe_intraday(txs, cours, sorted(cours["A"]))

    assert [p["invested"] for p in pts] == [1000.0, 1000.0, 1502.0]
    # La valeur saute au renforcement ; nette du capital engagé, elle ne saute plus.
    assert [p["value"] for p in pts] == [1000.0, 1000.0, 1500.0]
    net = [p["value"] - p["invested"] for p in pts]
    assert net == [0.0, 0.0, -2.0], "seuls les frais subsistent, pas le versement"
