"""
Les devises d'affichage : la liste, et la seule erreur de conversion qui compte.
"""

import pytest

from app.services import devises as dv


class TestListe:
    def test_le_dollar_est_par_defaut(self):
        """
        ⚠️ Le dollar par défaut parce que les séries du fournisseur y sont majoritairement
        libellées : c'est le seul choix qui n'applique aucune conversion, donc celui qui
        n'introduit aucune approximation.
        """
        assert dv.DEVISE_PAR_DEFAUT == "USD"
        assert dv.DEVISES[0].code == "USD"
        assert dv.DEVISES[0].paire_depuis_usd is None

    def test_les_devises_demandees_sont_la(self):
        codes = {d.code for d in dv.DEVISES}
        for attendu in ("USD", "EUR", "JPY"):
            assert attendu in codes, attendu

    def test_le_yen_n_a_pas_de_centimes(self):
        assert dv.devise("JPY").decimales == 0
        assert dv.devise("EUR").decimales == 2

    def test_les_paires_partent_bien_du_dollar(self):
        """
        ⚠️ Le sens de la paire compte. « EURUSD=X » cote le dollar par euro ; ce dont on a
        besoin est l'inverse — combien d'euros vaut un dollar. Se tromper inverse le
        rendement du change, ce qui ne se voit pas sur un seul chiffre.
        """
        for d in dv.DEVISES:
            if d.paire_depuis_usd is None:
                continue
            assert d.paire_depuis_usd.startswith("USD"), d.code
            assert d.paire_depuis_usd == f"USD{d.code}=X", d.code

    def test_un_code_inconnu_retombe_sur_le_defaut(self):
        # ⚠️ Ne pas lever : une devise retirée de la liste ne doit pas empêcher un compte
        # de se connecter.
        assert dv.devise("XYZ").code == "USD"
        assert dv.devise(None).code == "USD"

    def test_la_casse_est_ignoree(self):
        assert dv.devise("eur").code == "EUR"

    def test_est_connue_sert_a_refuser_une_ecriture(self):
        assert dv.est_connue("JPY") and dv.est_connue("jpy")
        assert not dv.est_connue("XYZ") and not dv.est_connue(None)


class TestConvertirSerie:
    def test_un_taux_constant_ne_change_pas_le_rendement(self):
        """
        ⚠️ **Le test qui dit pourquoi la conversion doit être quotidienne.** Avec un taux
        identique partout, la conversion s'annule dans le rapport final sur initial : le
        rendement est inchangé. Appliquer le taux du jour à toute l'histoire revient donc à
        ne rien convertir du tout, tout en croyant l'avoir fait.
        """
        v = [100.0, 110.0, 121.0]
        c = dv.convertir_serie(v, [0.9, 0.9, 0.9])
        assert c is not None
        assert c[-1] / c[0] == pytest.approx(v[-1] / v[0])

    def test_un_change_variable_modifie_le_rendement(self):
        # Le dollar gagne 10 % : l'épargnant en euros gagne davantage que le marché.
        v = [100.0, 100.0]
        c = dv.convertir_serie(v, [0.90, 0.99])
        assert c is not None
        assert c[-1] / c[0] == pytest.approx(1.1)

    def test_un_change_defavorable_ampute_le_rendement(self):
        v = [100.0, 120.0]           # le marché gagne 20 %
        c = dv.convertir_serie(v, [1.0, 0.9])   # le dollar perd 10 %
        assert c is not None
        assert c[-1] / c[0] == pytest.approx(1.08)

    def test_un_trou_de_taux_reprend_le_dernier_connu(self):
        # Les jours fériés de change ne sont pas ceux des bourses : un trou ne doit pas
        # trouer la série.
        c = dv.convertir_serie([100.0, 100.0, 100.0], [0.9, None, 0.9])
        assert c == pytest.approx([90.0, 90.0, 90.0])

    def test_des_longueurs_differentes_sont_refusees(self):
        # ⚠️ Mieux vaut refuser que d'aligner deux séries au hasard.
        assert dv.convertir_serie([1.0, 2.0], [0.9]) is None

    def test_une_serie_vide_est_refusee(self):
        assert dv.convertir_serie([], []) is None

    def test_sans_aucun_taux_connu_rien_n_est_rendu(self):
        assert dv.convertir_serie([100.0, 110.0], [None, None]) is None
