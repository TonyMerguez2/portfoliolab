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
    profil_cible,
    herfindahl, facteurs_de_risque, score_global, bande, observations,
    agreger_exposition, exposition_secteurs, exposition_simple,
    zone_du_fonds, exposition_zones, projection, ventilation_secteurs,
    ventilation_zones, regions_du_portefeuille, ecart_au_marche,
    POIDS_MARCHE_MONDIAL, DECOMPOSITION_ZONE, ZONES,
)


def serie_calibree(mu, sigma, n=250, graine=0):
    """
    Une série dont la moyenne et l'écart-type **d'échantillon** valent exactement
    ce qu'on demande.

    ⚠️ `rng.normal(mu, sigma, n)` ne donne pas cette garantie : sur 250 points
    l'erreur type de la moyenne vaut sigma/√250, assez pour que le Sharpe mesuré
    n'ait aucun rapport avec celui visé. Deux de mes tests ont échoué là-dessus,
    et c'est ce qui a fait apparaître le vrai problème du facteur.
    """
    x = np.random.default_rng(graine).normal(0, 1, n)
    x = (x - x.mean()) / x.std()
    return mu + sigma * x


def actions(*poids_secteurs):
    """
    Un portefeuille d'actions détenues en **direct**.

    Rend `(poids, types_lignes, secteurs)` prêts pour `facteurs_de_risque`. La
    concentration ne comptant que les sociétés en direct, un test qui oublierait
    `types_lignes` verrait le facteur non mesuré et passerait pour la mauvaise
    raison — d'où cette aide.
    """
    poids, types, secteurs = {}, {}, {}
    for i, (w, sect) in enumerate(poids_secteurs):
        t = f"ACT{i}"
        poids[t] = w
        types[t] = "action"
        secteurs[sect] = secteurs.get(sect, 0.0) + w
    return poids, types, [{"libelle": k, "part": v} for k, v in secteurs.items()]


def fonds(*poids_valeurs):
    """Un portefeuille de fonds : aucune société détenue en direct."""
    poids = {f"F{i}": w for i, w in enumerate(poids_valeurs)}
    return poids, {t: "fonds" for t in poids}


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
    def test_vingt_societes_equiponderees_valent_cent(self):
        poids, types, _ = actions(*[(5.0, "Tech") for _ in range(20)])
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert f["concentration"]["score"] == 100

    def test_l_echelle_ne_s_adapte_pas_au_portefeuille(self):
        """
        Deux sociétés équipondérées ne valent pas cent.

        Rapporter l'indice au nombre de lignes détenues flattait tout le
        monde : chaque portefeuille atteignait son propre idéal.
        """
        poids, types, _ = actions((50.0, "Tech"), (50.0, "Santé"))
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert 0 < f["concentration"]["score"] < 100

    def test_societe_unique_vaut_zero(self):
        poids, types, _ = actions((100.0, "Tech"))
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert f["concentration"]["score"] == 0

    def test_societes_equivalentes(self):
        """L'inverse de la somme des carrés se lit comme un nombre de sociétés."""
        poids, types, _ = actions((50.0, "Tech"), (50.0, "Santé"))
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert f["concentration"]["libelle"] == "2.0 sociétés équivalentes"

    def test_portefeuille_desequilibre(self):
        # 70/20/10 ne pèse pas trois sociétés mais moins de deux.
        poids, types, _ = actions((70.0, "Tech"), (20.0, "Santé"), (10.0, "Énergie"))
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert f["concentration"]["libelle"].startswith("1.9")

    def test_sans_historique_les_facteurs_de_marche_sont_nuls(self):
        """
        Un portefeuille ouvert hier n'a pas de volatilité.

        En inventer une serait pire que de l'omettre : le lecteur n'aurait aucun
        moyen de savoir qu'elle ne repose sur rien.
        """
        f = facteurs_de_risque({"A": 60, "B": 40}, None)
        for cle in ("volatilite", "redondance", "perte_max"):
            assert f[cle]["score"] is None
            assert f[cle]["valeur"] is None

    def test_volatilite_calculee(self):
        d = pd.DataFrame({"A": series(vol=0.01), "B": series(vol=0.01, graine=1)})
        f = facteurs_de_risque({"A": 50, "B": 50}, d)
        # ~1 % par séance sur deux lignes indépendantes à parts égales :
        # l'annualisation donne un ordre de grandeur de 11 %.
        assert 5 < f["volatilite"]["valeur"] < 20
        # ⚠️ Mesurée sans être notée : sans cible, l'échelle absolue de repli
        # faisait de l'idéal implicite un fonds équilibré. La valeur reste juste,
        # la note attend une intention déclarée.
        assert f["volatilite"]["score"] is None
        assert f["volatilite"]["compte"] is False

    def test_volatilite_notee_des_qu_un_profil_existe(self):
        d = pd.DataFrame({"A": series(vol=0.01), "B": series(vol=0.01, graine=1)})
        f = facteurs_de_risque({"A": 50, "B": 50}, d, cible=profil_cible(30, "equilibre"))
        assert f["volatilite"]["score"] is not None
        assert f["volatilite"]["compte"] is True
        assert "visés" in f["volatilite"]["libelle"]

    def test_les_facteurs_retires_ne_reviennent_pas(self):
        """
        Sept facteurs ont été supprimés à l'audit, chacun pour une raison mesurée.

        Le test les nomme afin qu'un ajout involontaire — un `out[...]` recopié,
        une fusion mal résolue — échoue au lieu de repeupler la moyenne en silence.
        """
        d = pd.DataFrame({"A": series(graine=1), "B": series(graine=2)})
        f = facteurs_de_risque({"A": 50, "B": 50}, d, courtage=0.3)
        for cle in ("correlation", "sensibilite_marche", "liquidite",
                    "efficacite", "devise", "classes_actifs"):
            assert cle not in f, f"{cle} a été retiré à l'audit"

    def test_seule_la_perte_maximale_est_affichee_sans_noter(self):
        """
        Un seul indicateur reste montré hors moyenne, et il n'affiche pas de note.

        Afficher « 100 » à côté de la mention « indicatif » se lisait comme un
        bulletin : le lecteur retenait le chiffre et pas la mention. La perte
        maximale porte donc sa valeur et son libellé, sans score.
        """
        d = pd.DataFrame({"A": series(vol=0.02, graine=7)})
        # ⚠️ Avec un profil : sans lui la volatilité est elle aussi indicative, et
        # le test dirait autre chose que ce qu'il annonce.
        f = facteurs_de_risque({"A": 100}, d, cible=profil_cible(30, "equilibre"))
        indicatifs = [c for c, v in f.items() if v.get("compte", True) is False]
        assert indicatifs == ["perte_max"]
        assert f["perte_max"]["valeur"] is not None
        assert f["perte_max"]["score"] is None

    def test_diversification_sans_transparence_n_est_pas_mesuree(self):
        """
        ⚠️ Elle retombait sur la concentration des lignes, ce qui affichait un
        chiffre comme s'il s'agissait d'une diversification alors qu'on n'en savait
        rien. Ce cas n'arrive que sur un échec de lecture — une action porte son
        secteur, un fonds porte sa ventilation — et une note inventée sur un ratage
        réseau entrait dans la moyenne.
        """
        f = facteurs_de_risque({"A": 50, "B": 50}, None)
        assert f["diversification"]["score"] is None
        assert f["diversification"]["libelle"] == "Transparence indisponible"

    def test_trois_etf_bien_repartis_sont_diversifies(self):
        """
        Compter les lignes calomnie un portefeuille de fonds.

        Trois ETF, c'est trois lignes — mais des centaines de sociétés sur onze
        secteurs et trois continents. La diversification doit le voir.
        """
        secteurs = [{"libelle": f"S{i}", "part": 100 / 9} for i in range(9)]
        poids, types = fonds(80.0, 17.0, 3.0)
        f = facteurs_de_risque(poids, None, secteurs=secteurs, types_lignes=types)
        # ⚠️ La concentration ne reproche plus les 80 % sur un seul fonds : un fonds
        # est un ensemble déjà réparti, et compter les enveloppes donnait 0 à un ETF
        # monde. C'est la diversification qui juge le contenu, et elle est bonne.
        assert f["concentration"]["score"] is None
        assert f["diversification"]["score"] > 60

    def test_un_seul_secteur_reste_mal_diversifie(self):
        secteurs = [{"libelle": "Technologie", "part": 100}]
        f = facteurs_de_risque({"A": 50, "B": 50}, None, secteurs=secteurs)
        assert f["diversification"]["score"] == 0

    def test_un_etf_monde_n_est_plus_puni_par_la_geographie(self):
        """
        ⚠️ Le correctif le plus important de l'audit.

        La composante géographique comptait des **étiquettes** de mandat, pas une
        dispersion : un ETF MSCI World reçoit l'étiquette « Monde développé », donc
        une seule zone, donc zéro sur cent — alors qu'il détient 23 pays et quelque
        1 500 sociétés. Mesuré avant correction : 0 en géographie et 32 en
        diversification pour un ETF monde, contre 28 et 44 pour un PEA à trois
        lignes. Le score récompensait le moins diversifié des deux.

        Ici on rejoue le cas : les secteurs d'un ETF monde, une seule étiquette de
        zone. La note doit venir des secteurs seuls.
        """
        secteurs = [
            {"libelle": "Technologie", "part": 26}, {"libelle": "Finance", "part": 17},
            {"libelle": "Industrie", "part": 12}, {"libelle": "Santé", "part": 11},
            {"libelle": "Consommation discrétionnaire", "part": 11},
            {"libelle": "Communication", "part": 9}, {"libelle": "Autres", "part": 14},
        ]
        monde = facteurs_de_risque({"MONDE": 100}, None, secteurs=secteurs)
        assert monde["diversification"]["score"] > 55
        # Et la mesure citée est bien un nombre de secteurs, pas de zones.
        assert "secteurs" in monde["diversification"]["libelle"]

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

    def test_signale_deux_lignes_interchangeables(self):
        """
        ⚠️ Le constat porte sur la corrélation **maximale**, plus sur la moyenne.

        « Vos lignes évoluent ensemble » se déclenchait à 0,80 de moyenne, ce qu'un
        portefeuille d'actions atteint par nature : il reprochait la classe d'actifs
        à qui l'avait choisie. La corrélation maximale désigne deux lignes précises,
        et le conseil devient exécutable.
        """
        o = observations({"A": 50, "B": 50}, {"redondance": {"valeur": 0.97}}, {})
        assert any("0.97" in x["titre"] for x in o)

    def test_des_lignes_seulement_correlees_ne_declenchent_rien(self):
        # 0,85 entre deux fonds d'actions est normal : rien à signaler.
        o = observations({"A": 50, "B": 50}, {"redondance": {"valeur": 0.85}}, {})
        assert all("pari" not in x["titre"] for x in o)

    def test_plus_d_observation_sur_les_devises(self):
        """
        ⚠️ Elle sommait les parts dont la devise **de cotation** n'était pas l'euro.

        Un portefeuille de trackers S&P 500 cotés à Paris s'entendait donc dire
        « 0 % hors euro » alors qu'il porte cent pour cent de risque dollar. Une
        observation fausse est plus coûteuse qu'absente : elle rassure.
        """
        o = observations({"A": 100}, {},
                         {"devises": [{"libelle": "USD", "part": 60.0},
                                      {"libelle": "EUR", "part": 40.0}]})
        assert all("hors euro" not in x["titre"] for x in o)

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


# ── Les quatre corrections de calibrage ──────────────────────────────────────

class TestCalibrage:
    """
    Ce que chaque facteur doit et ne doit pas punir.

    Les points corrigés ici étaient indéfendables, chiffres à l'appui : la
    corrélation pesait 22,2 % du score par double comptage, la liquidité valait
    cent pour toute position de particulier, la cible de concentration poussait à
    détenir huit fonds, et le bêta punissait un portefeuille défensif comme un
    portefeuille à effet de levier — avant d'être supprimé pour biais de mesure.
    """

    def test_un_seul_fonds_n_est_plus_puni(self):
        """
        ⚠️ Le correctif final de l'audit sur ce facteur.

        Il comptait les **lignes** du portefeuille, fonds compris — donc des
        enveloppes, alors que l'enveloppe ne porte pas le risque. Un ETF MSCI World
        à cent pour cent obtenait 0 sur 100 : mille cinq cents sociétés notées comme
        une action unique.
        """
        poids, types = fonds(100.0)
        f = facteurs_de_risque(poids, None, types_lignes=types)
        # ⚠️ Ni 0 ni 100 : le facteur ne s'applique pas.
        #
        # 0 était l'ancien défaut — mille cinq cents sociétés notées comme une
        # action unique. 100 était mon premier correctif, et il était mauvais aussi :
        # la majorité des épargnants ne détenant que des fonds, le facteur aurait
        # valu cent pour la plupart des portefeuilles, ajoutant une constante à la
        # moyenne. C'est le motif pour lequel la liquidité a été retirée. Sur un vrai
        # PEA, cela gonflait la note de 83 à 86 sans information à l'appui.
        assert f["concentration"]["score"] is None
        assert f["concentration"]["libelle"] == "aucune action détenue en direct"

    def test_decouper_en_plusieurs_enveloppes_ne_rapporte_rien(self):
        """
        ⚠️ Quatre ETF World identiques à 25 % ont exactement la même exposition
        qu'un seul à 100 %. L'ancien calcul donnait 0 au premier et 100 aux seconds,
        soit vingt-cinq points de score global gagnés en multipliant les frais
        d'ordre. Sur ce même cas, la redondance donnait 0 quand la concentration
        donnait 100 : deux facteurs affirmaient l'inverse du même fait.
        """
        un, t1 = fonds(100.0)
        quatre, t4 = fonds(25.0, 25.0, 25.0, 25.0)
        a = facteurs_de_risque(un, None, types_lignes=t1)["concentration"]
        b = facteurs_de_risque(quatre, None, types_lignes=t4)["concentration"]
        assert a["score"] == b["score"] is None
        assert a["libelle"] == b["libelle"]

    def test_la_cible_est_vingt_societes(self):
        poids, types, _ = actions(*[(5.0, "Tech") for _ in range(20)])
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert f["concentration"]["score"] == 100

    def test_une_societe_dominante_reste_mal_notee(self):
        # 69/20/10 en actions directes : moins de deux sociétés équivalentes.
        poids, types, _ = actions((69.0, "Tech"), (20.0, "Santé"), (10.0, "Énergie"))
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert f["concentration"]["score"] < 15

    def test_une_petite_ligne_d_action_ne_plombe_pas_un_portefeuille_de_fonds(self):
        """
        Dix pour cent sur une société, le reste en fonds : le risque qu'elle
        disparaisse coûte dix pour cent, pas le portefeuille. La note doit être
        haute — l'assiette est le portefeuille entier, pas la poche d'actions.
        """
        poids = {"AAPL": 10.0, "IWDA": 90.0}
        types = {"AAPL": "action", "IWDA": "fonds"}
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert f["concentration"]["score"] == 100
        # Cent parce qu'une société y est bien détenue et pèse peu — à distinguer du
        # cas sans action du tout, qui n'est pas noté.
        assert "sociétés équivalentes" in f["concentration"]["libelle"]

    def test_la_moitie_sur_une_societe_est_mal_notee(self):
        poids = {"AAPL": 50.0, "IWDA": 50.0}
        types = {"AAPL": "action", "IWDA": "fonds"}
        f = facteurs_de_risque(poids, None, types_lignes=types)
        assert f["concentration"]["score"] < 25

    def test_sans_nature_de_ligne_le_facteur_ne_note_pas(self):
        """
        Une fiche illisible ne doit pas faire supposer « fonds » — ce qui donnerait
        la note pleine à un portefeuille inconnu — ni « action ». Sous soixante pour
        cent du portefeuille identifié, le facteur se tait.
        """
        f = facteurs_de_risque({"X": 100.0}, None, types_lignes={})
        assert f["concentration"]["score"] is None
        assert f["concentration"]["libelle"] == "Composition indéterminée"

    def test_la_diversification_ne_juge_que_la_transparence(self):
        """
        ⚠️ La corrélation pesait deux fois : en propre, et comme composante de la
        diversification. Elle a depuis été retirée des deux côtés.

        Le test garde son cœur : deux lignes parfaitement corrélées — donc
        totalement redondantes — n'entament pas la diversification, qui se juge sur
        ce qui est **détenu** et non sur la façon dont les lignes bougent. Les deux
        constats coexistent sans se confondre.
        """
        secteurs = [{"libelle": f"S{i}", "part": 100 / 8} for i in range(8)]
        base = series()
        d = pd.DataFrame({"A": base, "B": base})
        f = facteurs_de_risque({"A": 50, "B": 50}, d, secteurs=secteurs)
        assert f["redondance"]["score"] == 0
        assert f["diversification"]["score"] == 100

    def test_la_construction_et_le_cout_comptent(self):
        f = facteurs_de_risque({"A": 50, "B": 50}, None)
        # ⚠️ Sans profil déclaré, ce qui note se limite à la **construction** et au
        # **coût** : on peut juger comment un portefeuille est bâti et ce qu'il
        # coûte, pas quel risque il devrait porter. Seule la volatilité attend une
        # intention déclarée.
        for cle in ("concentration", "diversification", "frais", "redondance",
                    "frais_courtage"):
            assert f[cle]["compte"] is True, cle
        assert f["volatilite"]["compte"] is False

    def test_un_seul_facteur_depend_du_profil(self):
        """
        ⚠️ Ils étaient trois — volatilité, perte maximale, bêta. Le bêta a été
        supprimé pour biais de mesure et la perte maximale ne note plus car elle
        doublait la volatilité à 0,88 de corrélation. L'interface annonce le nombre
        de facteurs en attente ; ce test tient le chiffre qu'elle annonce.
        """
        d = pd.DataFrame({"A": series(vol=0.01, graine=3)})
        sans = facteurs_de_risque({"A": 100}, d)
        avec = facteurs_de_risque({"A": 100}, d, cible=profil_cible(30, "equilibre"))
        muets = [c for c in sans
                 if sans[c]["compte"] is False and avec.get(c, {}).get("compte") is True]
        assert muets == ["volatilite"]

    def test_un_facteur_sans_cle_compte_est_compte(self):
        """Un facteur ajouté plus tard doit peser, pas être oublié en silence."""
        assert score_global({"neuf": {"score": 40}, "vieux": {"score": 80}}) == 60


# ── Les facteurs ajoutés ─────────────────────────────────────────────────────

class TestFrais:
    def test_frais_ponderes_par_les_poids(self):
        f = facteurs_de_risque({"A": 90, "B": 10}, None,
                               frais_par_ligne={"A": 0.10, "B": 1.00})
        # 0,9 × 0,10 + 0,1 × 1,00 = 0,19 % par an.
        assert f["frais"]["valeur"] == pytest.approx(0.19, abs=1e-6)
        assert f["frais"]["score"] > 85

    def test_un_fonds_cher_est_puni(self):
        f = facteurs_de_risque({"A": 100}, None, frais_par_ligne={"A": 1.20})
        assert f["frais"]["score"] == 0

    def test_frais_inconnus_ne_sont_pas_zero(self):
        """Un TER absent n'est pas un TER élevé : le facteur n'est pas mesuré."""
        f = facteurs_de_risque({"A": 100}, None)
        assert f["frais"]["valeur"] is None
        assert f["frais"]["score"] is None

    def test_couverture_insuffisante_ne_rend_rien(self):
        """
        ⚠️ Moyenner sur un tiers du portefeuille donnerait un chiffre qui a l'air
        d'un chiffre : si la ligne la plus chère est celle dont le TER manque, la
        note serait flatteuse et fausse.
        """
        f = facteurs_de_risque({"A": 30, "B": 70}, None, frais_par_ligne={"A": 0.10})
        assert f["frais"]["valeur"] is None

    def test_la_perte_maximale_est_mesuree_sans_noter(self):
        montee = [0.01] * 40
        chute = [-0.02] * 20
        d = pd.DataFrame({"A": montee + chute + [0.001] * 20})
        f = facteurs_de_risque({"A": 100}, d)
        assert f["perte_max"]["valeur"] < -20
        assert f["perte_max"]["compte"] is False
        assert f["perte_max"]["score"] is None

    def test_la_cible_de_perte_situe_la_mesure_sans_la_noter(self):
        """
        La cible reste **affichée** : « 6,4 %, pour 30 % attendus au pire » situe le
        chiffre, ce que « 6,4 % » seul ne fait pas. Elle ne produit plus de note.
        """
        d = pd.DataFrame({"A": [0.01] * 40 + [-0.02] * 20})
        f = facteurs_de_risque({"A": 100}, d, cible=profil_cible(30, "equilibre"))
        assert "attendus au pire" in f["perte_max"]["libelle"]
        assert f["perte_max"]["score"] is None
        assert f["perte_max"]["compte"] is False


class TestRedondance:
    def test_deux_trackers_identiques_sont_detectes(self):
        base = series()
        d = pd.DataFrame({"A": base, "B": base, "C": series(graine=9)})
        f = facteurs_de_risque({"A": 33, "B": 33, "C": 34}, d)
        # ⚠️ Le maximum, non la moyenne : c'est ce qui fait sortir le doublon.
        assert f["redondance"]["valeur"] == pytest.approx(1.0, abs=1e-6)
        assert f["redondance"]["score"] == 0

    def test_des_lignes_distinctes_ne_sont_pas_redondantes(self):
        d = pd.DataFrame({"A": series(graine=1), "B": series(graine=2)})
        f = facteurs_de_risque({"A": 50, "B": 50}, d)
        assert f["redondance"]["score"] == 100

    def test_la_redondance_note_la_ou_la_moyenne_ne_notait_pas(self):
        """
        ⚠️ La corrélation **moyenne** a été supprimée ; la redondance reste notée.

        La distinction est le cœur du choix : une moyenne de 0,85 entre lignes
        d'actions décrit la classe d'actifs et ne se corrige pas, un maximum de 0,97
        désigne deux lignes précises dont l'une peut être vendue.
        """
        f = facteurs_de_risque({"A": 50, "B": 50}, None)
        assert f["redondance"]["compte"] is True
        assert "correlation" not in f


# ── Le profil de risque ──────────────────────────────────────────────────────

class TestProfil:
    """
    ⚠️ Ce que le profil rend possible : juger un niveau de risque.

    Sans lui, volatilité, perte maximale et bêta ne sont que des mesures ; les
    noter dans l'absolu revenait à décréter qu'un portefeuille prudent vaut mieux
    qu'un portefeuille de long terme.
    """

    def test_sans_profil_pas_de_cible(self):
        assert profil_cible(None, "dynamique") is None
        assert profil_cible(20, None) is None
        assert profil_cible(20, "n'importe quoi") is None
        assert profil_cible(0, "dynamique") is None

    def test_l_horizon_fait_monter_la_part_d_actions(self):
        court = profil_cible(2, "dynamique")
        long = profil_cible(20, "dynamique")
        assert court["part_actions"] == 30.0     # 20 + 5 × 2
        assert long["part_actions"] == 100.0     # plafonné
        assert long["volatilite"] > court["volatilite"]

    def test_la_tolerance_plafonne_l_horizon(self):
        """Se savoir capable d'attendre ne sert à rien si l'on vend au creux."""
        p = profil_cible(30, "prudent")
        assert p["part_actions"] == 35.0
        assert p["volatilite"] == pytest.approx(0.35 * 16 + 0.65 * 5, abs=0.01)

    def test_la_perte_attendue_suit_la_volatilite(self):
        p = profil_cible(20, "dynamique")
        assert p["volatilite"] == pytest.approx(16.0)
        assert p["perte"] == pytest.approx(40.0)

    def test_une_volatilite_conforme_est_bien_notee(self):
        cible = profil_cible(20, "dynamique")
        d = pd.DataFrame({"A": serie_calibree(mu=0.0003, sigma=16.0 / 100 / np.sqrt(252))})
        f = facteurs_de_risque({"A": 100}, d, cible=cible)
        assert f["volatilite"]["score"] > 95
        assert f["volatilite"]["compte"] is True
        assert "visés" in f["volatilite"]["libelle"]

    def test_trop_de_risque_pour_le_profil_declare(self):
        cible = profil_cible(30, "prudent")           # cible ≈ 8,85 %
        d = pd.DataFrame({"A": serie_calibree(mu=0.0003, sigma=25.0 / 100 / np.sqrt(252))})
        f = facteurs_de_risque({"A": 100}, d, cible=cible)
        assert f["volatilite"]["score"] == 0

    def test_trop_prudent_pour_l_horizon_coute_moins_cher(self):
        """
        Rester en deçà de sa cible est un manque à gagner ; la dépasser expose à
        vendre dans la baisse. Les deux sont des écarts, pas de même gravité.
        """
        cible = profil_cible(20, "dynamique")          # cible 16 %
        trop = 16.0 + 8.0
        pas_assez = 16.0 - 8.0
        d_haut = pd.DataFrame({"A": serie_calibree(mu=0.0003, sigma=trop / 100 / np.sqrt(252))})
        d_bas = pd.DataFrame({"A": serie_calibree(mu=0.0003, sigma=pas_assez / 100 / np.sqrt(252))})
        haut = facteurs_de_risque({"A": 100}, d_haut, cible=cible)["volatilite"]["score"]
        bas = facteurs_de_risque({"A": 100}, d_bas, cible=cible)["volatilite"]["score"]
        assert bas > haut

    def test_la_cible_de_perte_reste_calculee_pour_l_affichage(self):
        """
        `profil_cible` produit toujours une perte attendue, alors que plus aucun
        facteur ne la note : elle sert à situer la perte maximale affichée.
        Supprimer le calcul aurait vidé le libellé de son repère.
        """
        cible = profil_cible(20, "dynamique")
        assert cible["perte"] == pytest.approx(cible["volatilite"] * 2.5, abs=0.01)


class TestTransparenceIncomplete:
    """
    ⚠️ Ce qu'un ratage de lecture ne doit **pas** faire.

    Observé sur un vrai portefeuille : la ventilation des fonds a échoué le temps
    d'un appel, tout s'est rangé sous « Non déterminé », et la diversification a
    valu zéro — affichée comme « ce qui pèse le plus », donc envoyant corriger une
    concentration géographique qui n'existait pas.
    """

    def test_un_secteur_inconnu_ne_vaut_pas_zero(self):
        secteurs = [{"libelle": "Non déterminé", "part": 100.0}]
        f = facteurs_de_risque({"A": 70, "B": 30}, None, secteurs=secteurs)
        assert f["diversification"]["score"] is None

    def test_la_part_connue_est_renormalisee(self):
        """Huit secteurs connus sur 80 % du portefeuille valent huit secteurs."""
        secteurs = [{"libelle": "Non déterminé", "part": 20.0}] + [
            {"libelle": f"S{i}", "part": 10.0} for i in range(8)]
        f = facteurs_de_risque({"X": 100}, None, secteurs=secteurs)
        assert f["diversification"]["score"] == 100
        assert "8.0 secteurs" in f["diversification"]["libelle"]

    def test_une_couverture_trop_faible_ne_note_pas(self):
        # 30 % connus seulement : trop peu pour prétendre juger la répartition.
        secteurs = [{"libelle": "Non déterminé", "part": 70.0},
                    {"libelle": "Technologie", "part": 15.0},
                    {"libelle": "Santé", "part": 15.0}]
        f = facteurs_de_risque({"X": 100}, None, secteurs=secteurs)
        assert f["diversification"]["score"] is None

    def test_les_zones_ne_comptent_plus_des_etiquettes(self):
        """
        ⚠️ La géographie note de nouveau, mais elle ne **compte plus de zones**.

        Elle comptait des étiquettes de mandat : « Monde développé » valait une zone,
        donc zéro sur cent, pour un fonds détenant 23 pays. Elle mesure désormais
        l'écart aux poids du marché mondial — voir `TestGeographie`. Le test garde la
        distinction : une seule étiquette peut valoir une note haute, ce qui était
        impossible avant.
        """
        f = facteurs_de_risque({"A": 100}, None,
                               zones=[{"libelle": "Monde développé", "part": 100}])
        assert f["geographie"]["score"] > 60, "une étiquette unique peut être diversifiée"
        # Et le facteur de diversification, lui, ne regarde que les secteurs : la
        # géographie n'y est plus mêlée.
        assert f["diversification"]["score"] is None

    def test_les_parametres_retires_ne_reviennent_pas(self):
        """
        Les entrées supprimées à l'audit ne doivent pas reparaître par recopie.

        `zones` en est absent volontairement : il a été retiré puis **rétabli** avec
        un calcul entièrement différent, et c'est `TestGeographie` qui le couvre.
        """
        import inspect
        params = inspect.signature(facteurs_de_risque).parameters
        for retire in ("devises", "classes", "jours_liquidation", "rendements_marche"):
            assert retire not in params, retire


class TestGeographie:
    """
    ⚠️ Ce facteur remplace un comptage de zones qui punissait le fonds le plus
    diversifié qui existe.

    La zone d'un fonds se déduit de l'indice cité dans son nom : un ETF MSCI World
    recevait « Monde développé », soit **une** étiquette, donc une zone équivalente,
    donc zéro sur cent — pour 23 pays et quelque 1 500 sociétés. On mesure désormais
    la distance au portefeuille de marché, qui est par arithmétique le plus
    diversifié possible.
    """

    def test_un_etf_monde_n_est_plus_puni(self):
        """Le cas qui a motivé le remplacement : il valait 0, il vaut bien plus."""
        f = facteurs_de_risque({"A": 100}, None,
                               zones=[{"libelle": "Monde développé", "part": 100}])
        assert f["geographie"]["score"] > 60
        # Pas cent pour autant : un fonds « World » exclut réellement les marchés
        # émergents, soit onze pour cent du marché mondial. C'est la critique
        # habituelle de cette allocation, et elle est fondée.
        assert f["geographie"]["score"] < 95

    def test_un_portefeuille_de_marche_vaut_cent(self):
        f = facteurs_de_risque({"A": 100}, None, zones=[
            {"libelle": "Monde développé", "part": 89},
            {"libelle": "Marchés émergents", "part": 11},
        ])
        assert f["geographie"]["score"] == 100
        assert "conforme au marché mondial" in f["geographie"]["libelle"]

    def test_un_seul_pays_est_mal_note(self):
        f = facteurs_de_risque({"A": 100}, None,
                               zones=[{"libelle": "France", "part": 100}])
        assert f["geographie"]["score"] == 0

    def test_le_plus_gros_marche_du_monde_reste_un_pari(self):
        """
        Cent pour cent d'actions américaines n'est pas absurde — c'est deux tiers du
        marché coté — mais il en manque un tiers. La note doit être médiocre sans
        être nulle, entre l'ETF monde et le pays unique.
        """
        f = facteurs_de_risque({"A": 100}, None,
                               zones=[{"libelle": "États-Unis", "part": 100}])
        assert 20 < f["geographie"]["score"] < 50

    def test_les_pays_d_actions_sont_reconnus(self):
        """
        ⚠️ Les zones de fonds arrivent en français, déduites du mandat ; les pays
        d'actions arrivent en anglais, de `info["country"]`. Les deux vocabulaires
        se mélangent dans la même ventilation, et n'en couvrir qu'un rangerait la
        moitié du portefeuille en « non déterminé ».
        """
        f = facteurs_de_risque({"A": 100}, None, zones=[
            {"libelle": "United States", "part": 60},
            {"libelle": "Japan", "part": 20},
            {"libelle": "Germany", "part": 20},
        ])
        assert f["geographie"]["score"] is not None
        regions, situe = regions_du_portefeuille([
            {"libelle": "United States", "part": 60},
            {"libelle": "Japan", "part": 20},
            {"libelle": "Germany", "part": 20},
        ])
        assert situe == pytest.approx(100.0)
        assert regions["Amérique du Nord"] == pytest.approx(60.0)

    def test_des_zones_inconnues_ne_valent_pas_zero(self):
        f = facteurs_de_risque({"A": 100}, None,
                               zones=[{"libelle": "Non déterminé", "part": 100}])
        assert f["geographie"]["score"] is None
        assert f["geographie"]["libelle"] == "Zones indéterminées"

    def test_une_couverture_trop_faible_ne_note_pas(self):
        f = facteurs_de_risque({"A": 100}, None, zones=[
            {"libelle": "Non déterminé", "part": 70},
            {"libelle": "États-Unis", "part": 30},
        ])
        assert f["geographie"]["score"] is None

    def test_la_reference_somme_a_cent(self):
        assert sum(POIDS_MARCHE_MONDIAL.values()) == pytest.approx(100.0)

    def test_chaque_decomposition_somme_a_un(self):
        for zone, repartition in DECOMPOSITION_ZONE.items():
            assert sum(repartition.values()) == pytest.approx(1.0), zone
            for region in repartition:
                assert region in POIDS_MARCHE_MONDIAL, f"{zone} → {region}"

    def test_toute_zone_produite_sait_se_decomposer(self):
        """
        ⚠️ Garde contre une régression silencieuse.

        `ZONES` traduit un nom de fonds en étiquette. Ajouter un motif là-bas sans
        l'ajouter ici rangerait la ligne en « non situé » : elle sortirait du calcul,
        la couverture baisserait, et la géographie pourrait cesser d'être notée sans
        qu'aucun test n'échoue et sans rien à l'écran pour le dire.
        """
        for _motif, etiquette in ZONES:
            assert etiquette in DECOMPOSITION_ZONE, etiquette

    def test_l_ecart_se_lit_en_points_de_portefeuille(self):
        """
        La distance de variation totale se lit directement : « il faudrait déplacer
        tant pour cent du portefeuille pour rejoindre le marché ». D'où la moitié de
        la somme des écarts — sans elle, chaque écart serait compté deux fois.
        """
        # Tout en Amérique du Nord : il manque 34 % ailleurs, il y a 34 % en trop ici.
        assert ecart_au_marche({"Amérique du Nord": 100.0}) == pytest.approx(34.0)
        assert ecart_au_marche(dict(POIDS_MARCHE_MONDIAL)) == pytest.approx(0.0)

    def test_la_ventilation_d_affichage_ne_sert_pas_au_calcul(self):
        """
        Même piège que pour les secteurs : `exposition_zones` plafonne à six entrées
        plus « Autres », étiquette qui ne sait pas se situer et sortirait donc du
        calcul en faisant chuter la couverture.
        """
        details = {f"T{i}": {"pays": p} for i, p in enumerate(
            ["United States", "France", "Japan", "Germany", "Canada",
             "Australia", "Brazil", "India"])}
        poids = {f"T{i}": 12.5 for i in range(8)}
        complete = ventilation_zones(details, poids)
        abrege = exposition_zones(details, poids)
        assert len(complete) == 8
        assert any(x["libelle"] == "Autres" for x in abrege)
        _, situe_complet = regions_du_portefeuille(complete)
        _, situe_abrege = regions_du_portefeuille(abrege)
        assert situe_complet == pytest.approx(100.0)
        assert situe_abrege < situe_complet


class TestVentilationSectorielle:
    """
    ⚠️ Deux défauts trouvés à l'audit, tous deux dans la donnée **passée** au
    facteur plutôt que dans son calcul. C'est le pire endroit pour un défaut : la
    formule est juste, le chiffre est faux, et rien ne le signale.
    """

    def test_l_agregation_d_affichage_ne_sert_pas_au_calcul(self):
        """
        `agreger_exposition` plafonne à six entrées et verse le reste dans
        « Autres », qui compte alors pour **un** secteur.

        Mesuré sur onze secteurs équipondérés, la meilleure diversification
        sectorielle possible : l'agrégation garde six lignes à 9,1 % et réunit les
        cinq dernières dans un « Autres » à 45,5 % — le plus gros poste. Le nombre
        de secteurs équivalents tombait de 11,00 à 3,90 et la note de 100 à 41. Le
        portefeuille parfait ne pouvait pas dépasser 41, sans que rien ne dise que
        ce plafond venait de la mise en forme.
        """
        det = {"F": {"secteurs": {f"s{i}": 1 / 11 for i in range(11)}}}
        poids = {"F": 100.0}

        complete = ventilation_secteurs(det, poids)
        assert len(complete) == 11
        assert facteurs_de_risque(poids, None, secteurs=complete)["diversification"]["score"] == 100

        # La version d'affichage reste abrégée — c'est son rôle — et donnerait,
        # elle, une note très inférieure : d'où la séparation des deux.
        abrege = exposition_secteurs(det, poids)
        assert len(abrege) == 7
        assert abrege[-1]["libelle"] == "Autres"
        assert facteurs_de_risque(poids, None, secteurs=abrege)["diversification"]["score"] < 50

    def test_la_part_non_transparente_est_declaree(self):
        """
        La ventilation normalisait à cent sur les seuls titres dont le secteur était
        connu. Elle sommait donc toujours à cent, et le contrôle de couverture du
        facteur ne pouvait jamais se déclencher : une diversification calculée sur
        30 % du portefeuille s'affichait comme celle du portefeuille entier.
        """
        det = {"F": {"secteurs": {f"s{i}": 1 / 11 for i in range(11)}}, "X": {}}
        poids = {"F": 30.0, "X": 70.0}

        v = ventilation_secteurs(det, poids)
        inconnu = [x for x in v if x["libelle"] == "Non déterminé"]
        assert inconnu and inconnu[0]["part"] == pytest.approx(70.0, abs=0.1)

        # 30 % de transparence : trop peu pour prétendre juger la répartition.
        assert facteurs_de_risque(poids, None, secteurs=v)["diversification"]["score"] is None

    def test_une_transparence_suffisante_note_sur_la_part_connue(self):
        det = {"F": {"secteurs": {f"s{i}": 1 / 8 for i in range(8)}}, "X": {}}
        poids = {"F": 80.0, "X": 20.0}
        v = ventilation_secteurs(det, poids)
        f = facteurs_de_risque(poids, None, secteurs=v)
        # Huit secteurs équipondérés sur la part connue : la note est pleine, et
        # « Non déterminé » n'est pas compté comme un neuvième secteur.
        assert f["diversification"]["score"] == 100
        assert "8.0 secteurs" in f["diversification"]["libelle"]


class TestCourtage:
    """
    ⚠️ Les commissions de courtage sont **distinctes** des frais courants.

    Un TER est un prélèvement annuel sur l'encours, une commission un coût
    ponctuel sur l'ordre. Les mêler donnerait un chiffre sans signification. Et
    c'est la seule donnée de coût réellement disponible : le TER des ETF européens
    manque presque toujours chez le fournisseur de cours.
    """

    def test_le_courtage_est_note_a_part_du_ter(self):
        f = facteurs_de_risque({"A": 100}, None, courtage=0.31, frais_par_ligne={"A": 0.15})
        assert f["frais"]["valeur"] == pytest.approx(0.15)
        assert f["frais_courtage"]["valeur"] == pytest.approx(0.31)
        assert f["frais_courtage"]["score"] > 70

    def test_un_courtier_cher_est_puni(self):
        f = facteurs_de_risque({"A": 100}, None, courtage=1.20)
        assert f["frais_courtage"]["score"] == 0

    def test_aucun_frais_saisi_est_une_information(self):
        """Zéro n'est pas une absence de mesure : c'est un courtier sans frais."""
        f = facteurs_de_risque({"A": 100}, None, courtage=0.0)
        assert f["frais_courtage"]["valeur"] == 0.0
        assert f["frais_courtage"]["score"] == 100

    def test_sans_ecritures_le_courtage_n_est_pas_mesure(self):
        f = facteurs_de_risque({"A": 100}, None, courtage=None)
        assert f["frais_courtage"]["score"] is None
        assert f["frais_courtage"]["libelle"] == "Aucun frais saisi"
