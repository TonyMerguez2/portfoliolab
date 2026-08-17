"""
La reprise des soldes déclarés vers le journal d'apports.

⚠️ **Une migration de données qui ne s'éprouve que sur la base réelle ne s'éprouve
qu'après coup.** Celle-ci est rejouée ici sur des cas construits, dont les cinq qu'on a
mesurés en base avant de l'écrire — un livret à 16 500 € dont le journal n'en portait que
4 500, un compte à 13 000 € sans la moindre écriture, un compte déjà d'accord avec le
sien, et des comptes sans espèces qui ne doivent pas bouger.

⚠️ **Ce qu'elle doit garantir tient en deux phrases.** Après reprise, la somme du journal
vaut le solde qui était déclaré, au centime. Et la rejouer ne fait rien du tout — sans
quoi un redémarrage de l'application doublerait l'épargne de tout le monde.
"""

import os
import tempfile

import pytest
from sqlalchemy import create_engine, text

from app.core.database import _verser_les_soldes_au_journal


#: Le schéma tel qu'il était **avant** la refonte, colonnes de solde comprises.
#:
#: ⚠️ Écrit à la main parce que le modèle ne les porte plus : c'est tout l'objet de la
#: migration, et le déduire des classes actuelles reviendrait à tester le présent contre
#: lui-même.
SCHEMA_ANCIEN = [
    """CREATE TABLE comptes (
           id TEXT PRIMARY KEY, portfolio_id TEXT NOT NULL, nom TEXT NOT NULL,
           genre TEXT NOT NULL, couleur TEXT, rang INTEGER DEFAULT 0,
           cree_le TIMESTAMP, mis_a_jour_le TIMESTAMP,
           solde REAL DEFAULT NULL, solde_depuis TIMESTAMP DEFAULT NULL)""",
    """CREATE TABLE mouvements_tresorerie (
           id TEXT PRIMARY KEY, compte_id TEXT NOT NULL, date TIMESTAMP NOT NULL,
           montant REAL NOT NULL, note TEXT)""",
    """CREATE TABLE transactions (
           id INTEGER PRIMARY KEY, portfolio_id TEXT NOT NULL, executed_at TIMESTAMP)""",
]


@pytest.fixture
def base():
    """Une base jetable au schéma d'avant, garnie des cas rencontrés en vrai."""
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    moteur = create_engine(f"sqlite:///{fichier.name}")

    with moteur.connect() as c:
        for ordre in SCHEMA_ANCIEN:
            c.execute(text(ordre))

        c.execute(text("INSERT INTO transactions (portfolio_id, executed_at) "
                       "VALUES ('p1', '2026-01-02T00:00:00')"))

        def compte(cid, nom, solde, depuis):
            c.execute(text(
                "INSERT INTO comptes (id, portfolio_id, nom, genre, couleur, cree_le, "
                "solde, solde_depuis) VALUES (:i, 'p1', :n, 'epargne', '#000000', "
                "'2026-03-01T00:00:00', :s, :d)"),
                {"i": cid, "n": nom, "s": solde, "d": depuis})

        def apport(cid, montant, quand):
            c.execute(text("INSERT INTO mouvements_tresorerie (id, compte_id, date, montant) "
                           "VALUES (:i, :c, :d, :m)"),
                      {"i": f"m-{cid}-{montant}", "c": cid, "d": quand, "m": montant})

        # Le livret mesuré : 16 500 € déclarés, 4 500 € seulement au journal.
        compte("partiel", "Livret A", 16500.0, "2026-01-05T00:00:00")
        apport("partiel", 3000.0, "2026-02-01T00:00:00")
        apport("partiel", 1500.0, "2026-02-15T00:00:00")
        # Un compte déclaré avant que le journal n'écrive quoi que ce soit.
        compte("vierge", "Boursorama", 13000.0, "2026-05-13T00:00:00")
        # Celui qui est déjà d'accord avec son journal : rien ne doit lui être ajouté.
        compte("accorde", "CA épargne", 5000.0, "2026-08-16T00:00:00")
        apport("accorde", 5000.0, "2026-08-16T00:00:00")
        # Un compte sans espèces : la reprise ne le regarde pas.
        compte("sans", "PEA", None, None)
        # Le cas défensif : un solde sans date. Aucun en base au moment de la reprise.
        compte("sansdate", "Ancien", 800.0, None)
        c.commit()

    yield moteur
    moteur.dispose()
    os.unlink(fichier.name)


def journal(moteur):
    with moteur.connect() as c:
        return {nom: (n, somme) for nom, n, somme in c.execute(text("""
            SELECT c.id, COUNT(m.id), COALESCE(SUM(m.montant), 0)
            FROM comptes c LEFT JOIN mouvements_tresorerie m ON m.compte_id = c.id
            GROUP BY c.id"""))}


def soldes_restants(moteur):
    with moteur.connect() as c:
        return c.execute(text(
            "SELECT COUNT(*) FROM comptes WHERE solde IS NOT NULL "
            "OR solde_depuis IS NOT NULL")).scalar()


def test_la_somme_du_journal_retrouve_le_solde_declare(base):
    """
    ⚠️ **La promesse de la reprise.** Sans elle, chaque compte tomberait à la somme de ses
    seuls versements ultérieurs : le livret à 16 500 € se serait affiché à 4 500 €, et
    l'épargnant aurait vu 12 000 € disparaître de son patrimoine du jour au lendemain.
    """
    assert _verser_les_soldes_au_journal(base) == 4, "quatre comptes portaient un solde"

    apres = journal(base)
    assert apres["partiel"] == (3, pytest.approx(16500.0))
    assert apres["vierge"] == (1, pytest.approx(13000.0))
    assert apres["sansdate"] == (1, pytest.approx(800.0))


def test_un_compte_deja_d_accord_ne_recoit_rien(base):
    """
    ⚠️ **On comble l'écart, on ne réécrit pas le solde.** Écrire le montant entier
    doublerait ce que le journal contient déjà — 10 000 € sur un livret qui en vaut 5 000.
    """
    _verser_les_soldes_au_journal(base)
    assert journal(base)["accorde"] == (1, pytest.approx(5000.0))


def test_un_compte_sans_especes_reste_sans_journal(base):
    """Un PEA dont on ne connaît que les lignes ne déclare aucune espèce, et n'en gagne pas."""
    _verser_les_soldes_au_journal(base)
    assert journal(base)["sans"] == (0, 0)


def test_la_reprise_se_rejoue_sans_rien_changer(base):
    """
    ⚠️ **Le verrou, et il est dans la donnée.** La migration tourne au démarrage de
    l'application : sans idempotence, chaque redémarrage ajouterait un apport de l'écart
    constaté. Vider `solde` est ce qui l'en empêche — les comptes repris sortent de sa vue.
    """
    _verser_les_soldes_au_journal(base)
    apres_une_fois = journal(base)
    assert soldes_restants(base) == 0, "les colonnes reprises doivent être vidées"

    assert _verser_les_soldes_au_journal(base) == 0
    assert journal(base) == apres_une_fois


def test_a_defaut_de_date_la_premiere_operation_fait_foi(base):
    """
    ⚠️ **La branche défensive, qu'aucune ligne n'empruntait en base.** Dater de la
    déclaration aurait dessiné une marche verticale que l'œil lit comme une performance ;
    dater de la première opération reconduit l'hypothèse « présent depuis toujours » de
    l'ancien calcul, qui ne déforme au pire que le début de la courbe.
    """
    _verser_les_soldes_au_journal(base)
    with base.connect() as c:
        quand = c.execute(text("SELECT date FROM mouvements_tresorerie "
                               "WHERE compte_id = 'sansdate'")).scalar()
    assert str(quand).startswith("2026-01-02"), (
        "l'apport doit être daté de la première opération du portefeuille, "
        "et non du jour où le compte a été déclaré")


def test_une_base_neuve_n_a_rien_a_reprendre():
    """
    ⚠️ Les colonnes n'existent plus dans le modèle : une base créée aujourd'hui ne les
    porte pas. La reprise doit s'en apercevoir plutôt que d'échouer sur un `no such column`
    — c'est le cas de tous les tests de ce dépôt, qui montent une base vierge.
    """
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    moteur = create_engine(f"sqlite:///{fichier.name}")
    with moteur.connect() as c:
        c.execute(text("CREATE TABLE comptes (id TEXT PRIMARY KEY, nom TEXT)"))
        c.commit()

    assert _verser_les_soldes_au_journal(moteur) == 0
    moteur.dispose()
    os.unlink(fichier.name)
