"""
Facteurs de risque, score et observations.

Ces chiffres ont l'air d'une mesure et seront lus comme tels : un score de 62
sur 100 n'invite pas à la vérification. Ils sont donc testés sur des cas dont
la réponse est connue d'avance.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_analyse.py -v
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from app.services.analyse import (
    herfindahl, facteurs_de_risque, score_global, bande, observations,
    agreger_exposition, exposition_secteurs, exposition_simple,
    zone_du_fonds, exposition_zones, projection,
)


def series(n=250, vol=0.01, graine=0):
    r = np.random.default_rng(graine)
    return r.normal(0, vol, n)


class TestHerfindahl:
    def test_ligne_unique(self):
        assert herfindahl([100]) == pytest.approx(1.0)

    def test_equiponderation(self):
        # Quatre lignes égales : 4 × (1/4)² = 1/4.
        assert herfindahl([25, 25, 25, 25]) == pytest.approx(0.25)

    def test_insensible_a_l_echelle(self):
        """Des poids en pourcentage ou en fraction donnent le même indice."""
        assert herfindahl([70, 30]) == pytest.approx(herfindahl([0.7, 0.3]))

    def test_ignore_les_lignes_vides(self):
        assert herfindahl([50, 50, 0]) == pytest.approx(0.5)

    def test_sans_ligne(self):
        assert herfindahl([]) == pytest.approx(1.0)


class TestFacteurs:
    def test_huit_lignes_equiponderees_valent_cent(self):
        f = facteurs_de_risque({str(i): 12.5 for i in range(8)}, None)
        assert f["concentration"]["score"] == 100

    def test_l_echelle_ne_s_adapte_pas_au_portefeuille(self):
        """
        Quatre lignes équipondérées ne valent pas cent.

        Rapporter l'indice au nombre de lignes détenues flattait tout le
        monde : chaque portefeuille atteignait son propre idéal.
        """
        f = facteurs_de_risque({"A": 25, "B": 25, "C": 25, "D": 25}, None)
        assert 0 < f["concentration"]["score"] < 100

    def test_ligne_unique_vaut_zero(self):
        f = facteurs_de_risque({"A": 100}, None)
        assert f["concentration"]["score"] == 0

    def test_lignes_equivalentes(self):
        """L'inverse de l'indice se lit comme un nombre de lignes."""
        f = facteurs_de_risque({"A": 50, "B": 50}, None)
        assert f["concentration"]["libelle"] == "2.0 lignes équivalentes"

    def test_portefeuille_desequilibre(self):
        # 70/20/10 ne pèse pas trois lignes mais moins de deux.
        f = facteurs_de_risque({"A": 70, "B": 20, "C": 10}, None)
        assert f["concentration"]["libelle"].startswith("1.9")

    def test_sans_historique_les_facteurs_de_marche_sont_nuls(self):
        """
        Un portefeuille ouvert hier n'a pas de volatilité.

        En inventer une serait pire que de l'omettre : le lecteur n'aurait aucun
        moyen de savoir qu'elle ne repose sur rien.
        """
        f = facteurs_de_risque({"A": 60, "B": 40}, None)
        for cle in ("volatilite", "correlation", "sensibilite_marche"):
            assert f[cle]["score"] is None
            assert f[cle]["valeur"] is None

    def test_volatilite_calculee(self):
        d = pd.DataFrame({"A": series(vol=0.01), "B": series(vol=0.01, graine=1)})
        f = facteurs_de_risque({"A": 50, "B": 50}, d)
        # ~1 % par séance sur deux lignes indépendantes à parts égales :
        # l'annualisation donne un ordre de grandeur de 11 %.
        assert 5 < f["volatilite"]["valeur"] < 20
        assert f["volatilite"]["score"] is not None

    def test_correlation_parfaite_donne_zero(self):
        base = series()
        d = pd.DataFrame({"A": base, "B": base})
        f = facteurs_de_risque({"A": 50, "B": 50}, d)
        assert f["correlation"]["valeur"] == pytest.approx(1.0, abs=1e-6)
        assert f["correlation"]["score"] == 0

    def test_correlation_nulle_donne_cent(self):
        d = pd.DataFrame({"A": series(graine=1), "B": series(graine=2)})
        f = facteurs_de_risque({"A": 50, "B": 50}, d)
        assert f["correlation"]["score"] > 85

    def test_beta_du_marche_lui_meme_vaut_un(self):
        m = pd.Series(series(graine=3))
        d = pd.DataFrame({"A": m.to_numpy()})
        f = facteurs_de_risque({"A": 100}, d, rendements_marche=m)
        assert f["sensibilite_marche"]["valeur"] == pytest.approx(1.0, abs=1e-6)
        assert f["sensibilite_marche"]["score"] == 100

    def test_beta_double_s_eloigne_du_score_haut(self):
        m = pd.Series(series(graine=4))
        d = pd.DataFrame({"A": (m * 2).to_numpy()})
        f = facteurs_de_risque({"A": 100}, d, rendements_marche=m)
        assert f["sensibilite_marche"]["valeur"] == pytest.approx(2.0, abs=1e-6)
        assert f["sensibilite_marche"]["score"] == 0

    def test_liquidite(self):
        f = facteurs_de_risque({"A": 100}, None, jours_liquidation=0.4)
        assert f["liquidite"]["libelle"] == "moins d'une séance"
        assert f["liquidite"]["score"] > 80

    def test_liquidite_lente(self):
        f = facteurs_de_risque({"A": 100}, None, jours_liquidation=6.0)
        assert f["liquidite"]["score"] == 0

    def test_diversification_sans_transparence_suit_la_concentration(self):
        f = facteurs_de_risque({"A": 50, "B": 50}, None)
        assert f["diversification"]["score"] == f["concentration"]["score"]

    def test_trois_etf_bien_repartis_sont_diversifies(self):
        """
        Compter les lignes calomnie un portefeuille de fonds.

        Trois ETF, c'est trois lignes — mais des centaines de sociétés sur onze
        secteurs et trois continents. La diversification doit le voir.
        """
        secteurs = [{"libelle": f"S{i}", "part": 100 / 9} for i in range(9)]
        zones = [{"libelle": "États-Unis", "part": 50},
                 {"libelle": "Europe", "part": 30},
                 {"libelle": "Asie-Pacifique", "part": 20}]
        f = facteurs_de_risque({"A": 80, "B": 17, "C": 3}, None,
                               secteurs=secteurs, zones=zones)
        # La concentration des lignes reste basse — 80 % sur un produit — mais
        # la diversification, elle, est bonne.
        assert f["concentration"]["score"] < 20
        assert f["diversification"]["score"] > 60

    def test_un_seul_secteur_reste_mal_diversifie(self):
        secteurs = [{"libelle": "Technologie", "part": 100}]
        zones = [{"libelle": "États-Unis", "part": 100}]
        f = facteurs_de_risque({"A": 50, "B": 50}, None, secteurs=secteurs, zones=zones)
        assert f["diversification"]["score"] == 0

    def test_le_libelle_cite_la_mesure(self):
        secteurs = [{"libelle": f"S{i}", "part": 25} for i in range(4)]
        f = facteurs_de_risque({"A": 100}, None, secteurs=secteurs)
        assert "secteurs" in f["diversification"]["libelle"]


class TestScore:
    def test_moyenne_des_facteurs_connus(self):
        f = {"a": {"score": 80}, "b": {"score": 60}, "c": {"score": None}}
        assert score_global(f) == 70

    def test_aucun_facteur_connu(self):
        assert score_global({"a": {"score": None}}) is None

    def test_bandes(self):
        assert bande(95) == "Très bon"
        assert bande(62) == "Bon"
        assert bande(45) == "Moyen"
        assert bande(25) == "Faible"
        assert bande(5)  == "Très faible"
        assert bande(None) is None


class TestObservations:
    def test_signale_une_ligne_dominante(self):
        o = observations({"ESE.PA": 69.5, "ETZ.PA": 20.4, "PAEJ.PA": 10.1}, {}, {})
        assert any("ESE.PA" in x["titre"] and "69.5" in x["titre"] for x in o)

    def test_chiffre_l_impact_d_une_baisse(self):
        """Une observation sans chiffre n'est qu'une opinion."""
        o = observations({"A": 60, "B": 40}, {}, {})
        assert any("6.0 %" in x["detail"] for x in o)

    def test_signale_une_correlation_forte(self):
        o = observations({"A": 50, "B": 50},
                         {"correlation": {"valeur": 0.9}}, {})
        assert any("0.90" in x["titre"] for x in o)

    def test_salue_une_correlation_faible(self):
        o = observations({"A": 50, "B": 50},
                         {"correlation": {"valeur": 0.2}}, {})
        assert any(x["ton"] == "favorable" for x in o)

    def test_signale_l_exposition_hors_euro(self):
        o = observations({"A": 100}, {},
                         {"devises": [{"libelle": "USD", "part": 60.0},
                                      {"libelle": "EUR", "part": 40.0}]})
        assert any("hors euro" in x["titre"] for x in o)

    def test_portefeuille_vide(self):
        assert observations({}, {}, {}) == []


class TestExposition:
    def test_normalise_a_cent(self):
        r = agreger_exposition([{"libelle": "A", "part": 30}, {"libelle": "B", "part": 10}])
        assert sum(x["part"] for x in r) == pytest.approx(100, abs=0.2)

    def test_regroupe_les_miettes(self):
        """
        Une ventilation en transparence produit quinze entrées dont la moitié
        sous un pour cent : les garder masque les trois qui comptent.
        """
        lignes = [{"libelle": f"S{i}", "part": p}
                  for i, p in enumerate([40, 30, 20, 2, 2, 2, 2, 2])]
        r = agreger_exposition(lignes)
        assert r[-1]["libelle"] == "Autres"
        assert len(r) == 4

    def test_sans_miette_pas_de_ligne_autres(self):
        r = agreger_exposition([{"libelle": "A", "part": 60}, {"libelle": "B", "part": 40}])
        assert all(x["libelle"] != "Autres" for x in r)

    def test_vide(self):
        assert agreger_exposition([]) == []

    def test_transparence_des_fonds(self):
        """
        Un ETF n'a pas de secteur : il en a des centaines.

        Sans transparence, un portefeuille de trois ETF n'aurait aucune
        exposition sectorielle — ce qui est faux.
        """
        details = {"ESE.PA": {"secteurs": {"technology": 0.4, "healthcare": 0.6}}}
        r = exposition_secteurs(details, {"ESE.PA": 100})
        parts = {x["libelle"]: x["part"] for x in r}
        assert parts["Santé"] == pytest.approx(60, abs=0.2)
        assert parts["Technologie"] == pytest.approx(40, abs=0.2)

    def test_melange_action_et_fonds(self):
        details = {
            "AAPL":   {"secteur": "Technologie"},
            "ESE.PA": {"secteurs": {"healthcare": 1.0}},
        }
        r = exposition_secteurs(details, {"AAPL": 50, "ESE.PA": 50})
        parts = {x["libelle"]: x["part"] for x in r}
        assert parts["Technologie"] == pytest.approx(50, abs=0.2)
        assert parts["Santé"] == pytest.approx(50, abs=0.2)

    def test_devises(self):
        details = {"A": {"devise": "EUR"}, "B": {"devise": "USD"}}
        r = exposition_simple(details, {"A": 70, "B": 30}, "devise")
        assert {x["libelle"]: x["part"] for x in r} == {"EUR": 70.0, "USD": 30.0}

    def test_classes_d_actifs_reparties(self):
        details = {"A": {"classes": {"stockPosition": 0.9, "bondPosition": 0.1}}}
        r = exposition_simple(details, {"A": 100}, "classes")
        # Le nom technique de l'API n'a rien à faire à l'écran.
        parts = {x["libelle"]: x["part"] for x in r}
        assert parts["Actions"] == pytest.approx(90, abs=0.2)
        assert parts["Obligations"] == pytest.approx(10, abs=0.2)


class TestZones:
    def test_indices_courants(self):
        cas = {
            "BNP Paribas Easy S&P 500 UCITS ETF EUR C": "États-Unis",
            "BNP Paribas Easy Stoxx Europe 600 UCITS ETF": "Europe",
            "Amundi PEA Asie Pacifique (MSCI AC Asia Pacific Ex Japan)": "Asie-Pacifique",
            "Amundi PEA Japon (TOPIX) UCITS ETF": "Japon",
            "Amundi PEA Monde (MSCI World) UCITS ETF": "Monde développé",
            "Amundi PEA Inde (MSCI India) UCITS ETF": "Inde",
            "Amundi PEA Nasdaq-100 UCITS ETF": "États-Unis",
        }
        for nom, attendu in cas.items():
            assert zone_du_fonds(nom) == attendu, nom

    def test_le_motif_precis_passe_devant(self):
        """
        « Asie émergente » ne doit pas être rangée sous « émergents ».

        Les motifs se chevauchent : sans ordre, le plus vague gagnerait.
        """
        assert zone_du_fonds("Amundi PEA Asie Émergente (MSCI Emerging Asia)") == "Asie émergente"
        assert zone_du_fonds("Amundi PEA Émergent (MSCI Emerging Markets)") == "Marchés émergents"

    def test_fonds_inconnu(self):
        assert zone_du_fonds("Un fonds sans indice reconnaissable") is None
        assert zone_du_fonds(None) is None

    def test_le_pays_d_une_action_prime(self):
        details = {"AAPL": {"pays": "United States", "nom": "Apple Inc."}}
        r = exposition_zones(details, {"AAPL": 100})
        assert r[0]["libelle"] == "United States"

    def test_fonds_non_reconnu_est_signale(self):
        """Mieux vaut « non déterminé » qu'une zone inventée."""
        r = exposition_zones({"X": {"nom": "Fonds obscur"}}, {"X": 100})
        assert r[0]["libelle"] == "Non déterminé"

    def test_repartition_reelle(self):
        details = {
            "ESE.PA":  {"nom": "BNP Paribas Easy S&P 500 UCITS ETF"},
            "ETZ.PA":  {"nom": "BNP Paribas Easy Stoxx Europe 600 UCITS ETF"},
            "PAEJ.PA": {"nom": "Amundi PEA Asie Pacifique (MSCI AC Asia Pacific Ex Japan)"},
        }
        r = exposition_zones(details, {"ESE.PA": 80, "ETZ.PA": 17, "PAEJ.PA": 3})
        parts = {x["libelle"]: x["part"] for x in r}
        assert parts["États-Unis"] == pytest.approx(80, abs=0.2)
        assert parts["Europe"] == pytest.approx(17, abs=0.2)


class TestProjection:
    def test_les_quantiles_sont_ordonnes(self):
        p = projection(10000, 0.0003, 0.01)
        assert p["p10"] < p["median"] < p["p90"]

    def test_sans_derive_la_mediane_reste_au_depart(self):
        """
        Sans la correction d'Itô, l'exponentielle dériverait vers le haut :
        la médiane monterait alors qu'aucun rendement n'a été supposé.
        """
        p = projection(10000, 0.0, 0.01)
        assert p["median"] == pytest.approx(10000, rel=0.05)

    def test_une_volatilite_plus_forte_ecarte_les_bornes(self):
        etroit = projection(10000, 0.0, 0.005)
        large  = projection(10000, 0.0, 0.02)
        assert (large["p90"] - large["p10"]) > (etroit["p90"] - etroit["p10"])

    def test_trajectoire_bornee_et_croissante_en_temps(self):
        p = projection(10000, 0.0002, 0.01)
        t = p["trajectoire"]
        assert 40 <= len(t) <= 60
        assert t[0]["jour"] < t[-1]["jour"]
        assert all(x["p10"] <= x["median"] <= x["p90"] for x in t)

    def test_reproductible(self):
        assert projection(10000, 0.0002, 0.01)["median"] == projection(10000, 0.0002, 0.01)["median"]

    def test_portefeuille_vide(self):
        assert projection(0, 0.0002, 0.01)["median"] is None

    def test_sans_volatilite(self):
        assert projection(10000, 0.0002, 0.0)["median"] is None
