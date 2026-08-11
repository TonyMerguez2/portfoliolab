"""
Le backtest d'une allocation : ce qu'il simule, et ce qu'il ne prétend pas être.

Aucun réseau : des cours fabriqués, et de l'arithmétique vérifiable à la main.
"""

import pytest

from app.services import backtest_allocation as ba


def cours(*series: list[float]) -> tuple[list[dict], list[int]]:
    """Des relevés `{A: …, B: …}` et un numéro de mois par séance, 21 séances par mois."""
    noms = [chr(65 + i) for i in range(len(series))]
    n = len(series[0])
    releves = [{noms[j]: series[j][i] for j in range(len(series))} for i in range(n)]
    mois = [1 + i // 21 for i in range(n)]
    return releves, mois


class TestSerieRebalancee:
    def test_une_seule_ligne_suit_son_cours(self):
        c, m = cours([100, 110, 121])
        s = ba.serie_rebalancee(c, {"A": 100}, m)
        assert s == pytest.approx([1.0, 1.1, 1.21])

    def test_deux_lignes_a_parts_egales(self):
        # A double, B stagne : le portefeuille moitié-moitié gagne 50 %.
        c, m = cours([100, 200], [100, 100])
        s = ba.serie_rebalancee(c, {"A": 50, "B": 50}, m)
        assert s[-1] == pytest.approx(1.5)

    def test_les_poids_sont_normalises(self):
        # Des poids qui ne font pas cent doivent tout de même produire une base 1.
        c, m = cours([100, 200], [100, 100])
        s = ba.serie_rebalancee(c, {"A": 5, "B": 5}, m)
        assert s[0] == pytest.approx(1.0) and s[-1] == pytest.approx(1.5)

    def test_le_rebalancement_a_lieu_au_changement_de_mois(self):
        """
        ⚠️ Le rééquilibrage mensuel n'est pas un détail. Des poids constants au jour le
        jour supposent un rééquilibrage continu, que personne ne pratique, et ajoutent un
        gain qui n'existe pas.
        """
        # A monte tout le premier mois, puis c'est B qui monte. Sans rééquilibrage, la
        # part de A aurait dérivé et le portefeuille profiterait moins de la hausse de B.
        a = [100.0] * 21 + [200.0] * 21
        b = [100.0] * 42
        c, m = cours(a, b)
        avec = ba.serie_rebalancee(c, {"A": 50, "B": 50}, m)
        # Deux mois distincts : le rééquilibrage a bien eu lieu une fois.
        assert m[0] == 1 and m[21] == 2
        assert avec[-1] > 1.0

    def test_une_ligne_sans_cours_est_ignoree_sans_lever(self):
        c, m = cours([100, 110])
        c[1] = {"A": 110, "B": 0}      # B n'a pas de cours ce jour-là
        s = ba.serie_rebalancee(c, {"A": 60, "B": 40}, m)
        assert all(v > 0 for v in s)

    def test_sans_cours_ni_poids_rien_n_est_rendu(self):
        assert ba.serie_rebalancee([], {"A": 100}, []) == []
        assert ba.serie_rebalancee([{"A": 100}], {}, [1]) == []


class TestPireRecul:
    def test_le_recul_se_mesure_depuis_les_sommets_glissants(self):
        """
        ⚠️ Un portefeuille qui triple puis perd la moitié a reculé de cinquante pour cent,
        même s'il reste bien au-dessus de son point de départ. Mesurer depuis le premier
        point aurait rendu zéro.
        """
        assert ba.pire_recul([1.0, 3.0, 1.5]) == -50.0

    def test_une_suite_croissante_ne_recule_pas(self):
        assert ba.pire_recul([1.0, 1.1, 1.2]) == 0.0

    def test_une_suite_trop_courte_ne_recule_pas(self):
        assert ba.pire_recul([1.0]) == 0.0

    def test_le_recul_est_negatif(self):
        assert ba.pire_recul([1.0, 0.42]) == -58.0


class TestAnnualiser:
    def test_un_doublement_en_dix_ans(self):
        # 2^(1/10) − 1 ≈ 7,18 %.
        assert ba.annualiser_suite([1.0, 2.0], 10) == pytest.approx(7.18, abs=0.01)

    def test_sans_duree_aucun_taux(self):
        assert ba.annualiser_suite([1.0, 2.0], 0) is None

    def test_une_suite_degeneree_ne_rend_rien(self):
        assert ba.annualiser_suite([0.0, 2.0], 10) is None


class TestSubstituts:
    def test_les_etf_europeens_ont_un_substitut_plus_ancien(self):
        """
        ⚠️ C'est tout l'intérêt : sur un vrai PEA, l'histoire commune des trois lignes
        commence en 2014 et ne contient aucune crise. Avec les substituts, elle remonte à
        2001 — 2008, 2020 et 2022 comprises — et le rendement passe de 13 % à 9,5 % par an.
        """
        for etf in ("ESE.PA", "ETZ.PA", "PAEJ.PA"):
            assert etf in ba.SUBSTITUTS, etf

    def test_un_substitut_suit_le_meme_marche_pas_le_meme_fonds(self):
        # SPY n'est pas ESE.PA : frais, devise et réplication diffèrent. Ce qui est
        # substitué est l'exposition, et les substitutions sont rendues à l'appelant.
        assert ba.SUBSTITUTS["ESE.PA"] == "SPY"
        assert ba.SUBSTITUTS["ETZ.PA"] == "IEV"

    def test_une_fenetre_courte_est_refusee(self):
        # ⚠️ Dix ans au minimum : en dessous, aucune crise dans l'échantillon.
        assert ba.ANNEES_MINIMALES >= 10
