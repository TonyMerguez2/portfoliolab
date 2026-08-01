"""
Recherche des ETF éligibles au PEA.

Ces fonds sont indexés par Yahoo sous leur nom commercial français ; l'indice
suivi ne figure qu'entre parenthèses, où la recherche ne va pas. « PEA MSCI AC
Asia Pacific Ex Japan » ne renvoyait donc rien, alors que c'est le nom sous
lequel l'épargnant connaît le produit.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_pea_etfs.py -v
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.data.pea_etfs import PEA_ETFS, chercher


class TestChercher:
    def test_trouve_par_indice_anglais(self):
        """Le cas d'origine : Yahoo ne renvoyait rien pour cette requête."""
        r = chercher("PEA MSCI AC Asia Pacific Ex Japan")
        assert [x["ticker"] for x in r] == ["PAEJ.PA"]

    def test_trouve_par_nom_francais(self):
        r = chercher("Amundi PEA Asie Pacifique")
        assert r[0]["ticker"] == "PAEJ.PA"

    def test_trouve_par_ticker(self):
        assert chercher("PAEJ")[0]["ticker"] == "PAEJ.PA"

    def test_insensible_aux_accents(self):
        """« Émergent » doit répondre à « emergent », frappé sans accent."""
        assert chercher("PEA emergent")[0]["ticker"] == "PAEEM.PA"
        assert chercher("PEA Émergent")[0]["ticker"] == "PAEEM.PA"

    def test_insensible_a_la_casse(self):
        assert chercher("pea japon topix")[0]["ticker"].startswith("PTPX")

    def test_exige_tous_les_mots(self):
        """
        « PEA Japon » ne doit pas rendre les dix-huit fonds de la gamme.

        Chercher l'un des mots suffirait à tous les faire remonter — ils portent
        tous « PEA » —, ce qui reviendrait à ne pas filtrer.
        """
        r = chercher("PEA Japon")
        assert len(r) == 2
        assert all("Japon" in x["name"] for x in r)

    def test_requete_vide(self):
        assert chercher("") == []
        assert chercher("   ") == []

    def test_sans_correspondance(self):
        assert chercher("Bitcoin") == []
        assert chercher("PEA Bitcoin") == []

    def test_ponctuation_ignoree(self):
        """« S&P 500 » et « Nasdaq-100 » portent des signes que la saisie omet."""
        assert chercher("PEA S&P 500")
        assert chercher("PEA SP 500")
        assert chercher("PEA Nasdaq 100")
        assert chercher("PEA Nasdaq-100")

    def test_forme_du_resultat(self):
        """Le format doit être celui de la recherche Yahoo, sans quoi l'interface cale."""
        r = chercher("PAEJ")[0]
        assert set(r) == {"ticker", "name", "type", "exchange", "logo"}
        assert r["type"] == "ETF"
        assert r["exchange"] == "PAR"

    def test_limite_respectee(self):
        assert len(chercher("PEA", limite=3)) == 3


class TestCatalogue:
    def test_tickers_uniques(self):
        tickers = [t for t, _ in PEA_ETFS]
        assert len(tickers) == len(set(tickers))

    def test_tickers_euronext_paris(self):
        """Un PEA ne loge que des titres européens ; la gamme est cotée à Paris."""
        assert all(t.endswith(".PA") for t, _ in PEA_ETFS)

    def test_noms_mentionnent_pea(self):
        assert all("PEA" in nom for _, nom in PEA_ETFS)
