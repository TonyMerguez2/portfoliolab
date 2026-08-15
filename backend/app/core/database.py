from sqlalchemy import create_engine, Column, String, JSON, DateTime, Integer, Float, Boolean, ForeignKey, text, event
from sqlalchemy.orm import DeclarativeBase, Session
from datetime import datetime
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "portfoliolab.db")
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

# SQLite ne respecte les FK et CASCADE que si ce PRAGMA est activé par connexion
@event.listens_for(engine, "connect")
def _enable_fk(dbapi_conn, _record):
    if isinstance(dbapi_conn, sqlite3.Connection):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

class Base(DeclarativeBase):
    pass

class Portfolio(Base):
    __tablename__ = "portfolios"
    id = Column(String, primary_key=True)
    # Propriétaire. Nullable pour les portefeuilles créés avant l'introduction
    # des comptes ; ils sont rattachés au chargement plutôt que perdus.
    user_id = Column(String, nullable=True, index=True)
    name = Column(String, nullable=False)
    assets = Column(JSON, nullable=False)  # [{ticker, weight}]
    color = Column(String, default="#6366f1")
    # Image de profil du portefeuille. On stocke le chemin public, pas les
    # octets : le dossier `uploads/` est déjà servi en statique, et une base
    # SQLite grossit mal quand on y met des fichiers.
    image_url = Column(String, nullable=True)
    total_value = Column(Float, nullable=True, default=None)
    # cost_basis : prix de revient total (montant investi à l'origine), saisi par l'utilisateur
    cost_basis     = Column(Float,   nullable=True, default=None)
    is_simulation  = Column(Boolean, nullable=True, default=None)
    # ── Profil de risque déclaré ─────────────────────────────────────────────
    #
    # ⚠️ Sans lui, volatilité, perte maximale et bêta ne sont que des niveaux
    # mesurés, et l'analyse les affiche sans les noter : juger un niveau de risque
    # dans l'absolu revient à décider du projet de l'épargnant à sa place. Voir
    # `profil_cible`.
    #
    # Rangé par portefeuille et non par compte : un PEA de retraite à vingt-cinq
    # ans et un portefeuille d'essai n'ont pas la même intention.
    horizon_annees = Column(Integer, nullable=True, default=None)
    tolerance      = Column(String,  nullable=True, default=None)
    # ── Frais courants saisis à la main ──────────────────────────────────────
    #
    # `{ticker: pourcentage par an}`, par exemple `{"ESE.PA": 0.15}`.
    #
    # ⚠️ Le seul moyen de mesurer les frais d'un portefeuille européen. Le
    # fournisseur de cours ne publie presque jamais le TER des ETF domiciliés en
    # Europe : mesuré sur un vrai PEA, un seul des trois fonds l'annonçait, soit
    # 10 % du portefeuille — sous le seuil de couverture, donc le facteur restait
    # muet. Or les frais sont le facteur le plus prédictif du résultat relatif d'un
    # portefeuille de fonds sur vingt ans, et le seul qui soit **certain** : les
    # rendements sont espérés, les frais sont prélevés.
    #
    # L'épargnant, lui, a le chiffre — il figure sur le document d'information clé
    # de chaque fonds. Le lui demander vaut mieux que de renoncer à mesurer.
    #
    # Rangé par portefeuille plutôt que par ticker global : deux personnes peuvent
    # détenir deux parts différentes du même fonds, aux frais différents, et rien
    # ici ne justifie de trancher pour elles.
    frais_lignes   = Column(JSON,    nullable=True, default=None)
    # La couleur choisie pour les dossiers **déduits**, `{genre: "#RRGGBB"}`.
    #
    # ⚠️ **Ici, et non dans la table `comptes`, parce qu'un dossier déduit n'y a pas de
    # ligne.** PEA, compte-titres et crypto apparaissent à l'écran parce que des lignes s'y
    # rangent d'après leur place de cotation — c'est une inférence, pas une déclaration.
    # Leur créer un `Compte` pour retenir une couleur en ferait des comptes déclarés, donc
    # des dossiers *en plus* de ceux qu'on devine : deux PEA côte à côte, l'un vide.
    #
    # ⚠️ **Une préférence d'affichage, et rien d'autre.** Aucun calcul ne la lit. Elle ne
    # rattache aucune ligne, ne crée aucun compte, et disparaître ne ferait que rendre au
    # dossier sa couleur d'origine.
    couleurs_comptes = Column(JSON, nullable=True, default=None)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Objectif(Base):
    """
    Un objectif d'épargne, tel que l'épargnant l'a saisi.

    ⚠️ **Cette table remplace trois objectifs inventés.** L'onglet affichait « Retraite
    2035 », « Achat immobilier » et « Indépendance financière » écrits dans le code,
    avec des cibles choisies au hasard et un montant courant obtenu en multipliant la
    valeur du portefeuille par 0,42 et 0,28. Rien n'appartenait à personne.

    ⚠️ **Rattaché à un portefeuille et non à un compte.** C'est le patrimoine qui
    avance vers l'objectif, et un épargnant peut mener un PEA de retraite à côté d'un
    portefeuille d'essai. La suppression en cascade suit : un objectif sans portefeuille
    ne mesure plus rien.
    """
    __tablename__ = "objectifs"
    id = Column(String, primary_key=True)
    portfolio_id = Column(String, ForeignKey("portfolios.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    nom = Column(String, nullable=False)
    #: « capital », « capital_age », « achat », « revenu_mensuel » ou
    #: « plafond_versements ».
    #:
    #: ⚠️ Ils ne se calculent pas pareil — voir `services/objectifs.py`. Un revenu mensuel
    #: n'est pas un montant : il faut le convertir en capital par un taux de retrait avant
    #: de le comparer à un patrimoine. Et un plafond de versements ne se mesure pas du tout
    #: sur le patrimoine, mais sur ce qui a été versé.
    genre = Column(String, nullable=False)
    #: Des euros, ou des euros par mois pour un objectif de revenu.
    cible = Column(Float, nullable=False)
    #: L'année civile visée. Absente pour un objectif sans date.
    echeance_annee = Column(Integer, nullable=True)
    #: L'âge visé, pour « Retraite à 60 ans ». Sans année de naissance, il reste sans
    #: date plutôt que de recevoir une échéance supposée.
    age_cible = Column(Integer, nullable=True)
    #: La part du portefeuille destinée à cet objectif, en pourcentage.
    #:
    #: ⚠️ Saisie et non déduite. Avec plusieurs objectifs sur un même portefeuille, le
    #: logiciel ne devine pas qu'un tiers est pour la retraite et deux tiers pour
    #: l'appartement. Cent par défaut, ce qui est juste quand il n'y en a qu'un.
    part_affectee = Column(Float, nullable=True)
    versement_mensuel = Column(Float, nullable=True)
    #: Le cumul des versements déjà effectués, pour un objectif de plafond.
    #:
    #: ⚠️ **Saisissable parce que l'application ne peut pas le mesurer exactement.** Elle
    #: enregistre des achats et des ventes de titres, jamais les mouvements d'espèces du
    #: compte. Le net des transactions en est un **minorant** : l'argent viré puis laissé en
    #: liquidités n'y figure pas, et une vente non réinvestie le fait baisser alors qu'elle
    #: ne rend aucune capacité de versement. Sous-estimer un plafond fait croire à une marge
    #: qui n'existe pas, donc la mesure est **proposée** et l'épargnant peut inscrire le
    #: chiffre de son relevé.
    #:
    #: `None` signifie « prendre la mesure des transactions », pas « zéro ».
    verse_deja = Column(Float, nullable=True)
    #: ⚠️ Taux de rendement attendu et inflation sont des **hypothèses de
    #: l'épargnant**, pas des mesures. Nullables sans valeur par défaut : sans elles la
    #: projection ne rend rien, plutôt qu'un chiffre d'apparence sûre.
    taux_attendu = Column(Float, nullable=True)
    inflation = Column(Float, nullable=True)
    #: Le taux auquel l'épargnant accepte de ponctionner son capital, en % par an.
    #: Pré-rempli à 4 % par convention — voir `TAUX_RETRAIT_USUEL` — jamais imposé.
    taux_retrait = Column(Float, nullable=True)
    couleur = Column(String, nullable=True)
    cree_le = Column(DateTime, default=datetime.utcnow)


class Compte(Base):
    """
    Un compte **déclaré** par l'épargnant : son nom, son genre, sa couleur.

    ⚠️ **Cette table remplace une déduction.** Jusqu'ici l'écran rangeait chaque ligne
    dans « PEA », « CTO » ou « Crypto » d'après sa place de cotation — une inférence, pas
    une donnée, et le code le disait : « une action parisienne détenue en compte-titres
    ordinaire ira dans PEA et personne ne le saura ». Trois enveloppes devinées ne
    peuvent pas non plus décrire un compte courant ou un livret, qui ne détiennent aucun
    titre. Déclarer le compte lève les deux limites d'un coup.

    ⚠️ **L'inférence n'est pas supprimée pour autant, et il ne faut pas la supprimer.**
    Les portefeuilles existants n'ont aucun compte déclaré ; s'ils perdaient leur
    rangement, leurs lignes se retrouveraient en vrac du jour au lendemain. Les deux
    coexistent donc : ce qui est rattaché à un compte y va, le reste continue d'être
    deviné. Voir `compte_id` sur les transactions.

    ⚠️ **Rattaché au portefeuille, et c'est un choix contestable qu'on assume.** Dans la
    vie, un PEA appartient à une personne, pas à un portefeuille — quelqu'un qui tient
    deux portefeuilles devra donc le déclarer deux fois. Mais « Vos comptes » vit dans le
    tableau de bord d'un portefeuille et groupe *ses* lignes ; rattacher au compte
    utilisateur aurait fait apparaître, dans chaque portefeuille, des comptes qui ne le
    concernent pas. Le jour où l'on voudra l'inverse, la colonne se déplace et les
    lignes suivent.
    """

    __tablename__ = "comptes"
    id           = Column(String, primary_key=True)
    portfolio_id = Column(String, ForeignKey("portfolios.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    nom          = Column(String, nullable=False)
    #: courant | epargne | pea | cto | crypto — voir `GENRES_COMPTE`.
    genre        = Column(String, nullable=False)
    couleur      = Column(String, nullable=False, default="#6366F1")
    #: Les liquidités du compte, en devise du portefeuille.
    #:
    #: ⚠️ **Elles valent pour tous les genres, pas seulement pour le courant.** Un PEA
    #: porte une poche d'espèces à côté de ses titres ; la réserver aux comptes de
    #: trésorerie aurait obligé à la redemander ailleurs. Nullable : un compte dont on
    #: n'a pas saisi les liquidités n'en déclare pas zéro, il n'en déclare aucune — et la
    #: différence compte quand on additionne.
    solde        = Column(Float, nullable=True, default=None)
    #: Le rang d'affichage, choisi par l'épargnant.
    rang         = Column(Integer, nullable=False, default=0)
    cree_le      = Column(DateTime, default=datetime.utcnow)
    #: Quand le compte a été déclaré ou corrigé pour la dernière fois.
    #:
    #: ⚠️ **Un solde saisi à la main vieillit, et c'est la seule chose qui le dise.** Sur
    #: un livret, ce montant *est* la valeur du compte : il entre dans les totaux comme
    #: s'il était mesuré, alors qu'il a été tapé un jour donné et qu'il n'a bougé depuis
    #: que si quelqu'un y a repensé. Sans cette date, rien à l'écran ne distingue un solde
    #: d'hier d'un solde de l'an dernier.
    mis_a_jour_le = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    #: Depuis quand ce solde existe — **et non quand il a été saisi**.
    #:
    #: ⚠️ **C'est ce qui autorise la courbe à parler de patrimoine.** Un solde est un
    #: chiffre sans passé : pour le tracer dans le temps, il faut savoir à partir de quand
    #: il compte. Sans cette date, les deux seules issues étaient de supposer l'argent
    #: présent depuis toujours — faux dès qu'un livret est récent, et rien à l'écran ne
    #: l'aurait dit — ou de le faire apparaître le jour de la déclaration, ce qui dessine
    #: une marche verticale que l'œil lit comme une performance.
    #:
    #: ⚠️ **Nullable, et ce `NULL` veut dire « on ne sait pas ».** Les comptes déclarés
    #: avant cette colonne n'ont pas pu répondre à la question ; la courbe les traite comme
    #: présents depuis son origine, faute de mieux, et c'est le seul endroit du calcul qui
    #: repose sur une supposition. Un compte déclaré depuis, lui, porte toujours la date.
    solde_depuis  = Column(DateTime, nullable=True, default=None)


class MouvementTresorerie(Base):
    """
    Un versement ou un retrait sur un compte, daté.

    ⚠️ **C'est le passé du solde, et rien d'autre.** `Compte.solde` reste la vérité du
    présent — c'est lui qui s'affiche partout et qui entre dans les totaux. Ces mouvements
    ne le remplacent pas : ils disent comment on en est arrivé là, ce qui permet de
    remonter la courbe en arrière (solde à une date = solde actuel moins les mouvements
    postérieurs). Faire du solde une somme de mouvements aurait été plus pur, mais aurait
    obligé à réécrire tous les comptes déjà déclarés à partir d'un historique qui n'existe
    pas.

    ⚠️ **Une seule source pour le présent, un seul journal pour le passé.** Si les deux
    devaient diverger, `solde` gagne : il est le chiffre que l'épargnant relit sur son
    relevé, et c'est celui qu'on lui montre. Le journal ne façonne que ce qui précède.

    ⚠️ **Un mouvement n'est jamais un gain.** Verser 500 € monte la valeur *et* le montant
    investi d'autant : les gains, le TWR et la comparaison au repère n'en bougent pas d'un
    centime. C'est déjà la règle du portefeuille pour un achat de titres, et l'épargne ne
    peut pas y échapper — sans quoi alimenter son livret se lirait comme un résultat.

    ⚠️ **Corriger le solde n'est pas un versement, et ne doit jamais en créer un.**
    Tranché avec l'épargnant. Passer un livret de 5 000 à 5 500 € par l'écran de
    correction veut dire « je m'étais trompé », pas « j'ai versé 500 € aujourd'hui ». La
    conséquence est à connaître : puisqu'on remonte le temps depuis le solde actuel, une
    correction **réécrit tout le passé** de la courbe — le livret aura toujours valu
    5 500 €. C'est bien ce qu'une correction signifie.

    Un vrai versement s'enregistre donc ici, explicitement, avec sa date. C'est plus de
    travail à la saisie, et c'est le prix d'une courbe qui distingue l'argent qu'on ajoute
    de la faute de frappe qu'on répare. Deviner l'un à partir de l'autre aurait fait
    apparaître, sur le graphique, des apports que personne n'a faits.
    """

    __tablename__ = "mouvements_tresorerie"
    id         = Column(String, primary_key=True)
    compte_id  = Column(String, ForeignKey("comptes.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    #: Quand le mouvement a eu lieu, et non quand il a été saisi.
    date       = Column(DateTime, nullable=False, index=True)
    #: Signé : positif pour un versement, négatif pour un retrait.
    #:
    #: ⚠️ **Un seul champ signé plutôt qu'un montant et un sens.** Deux champs auraient
    #: permis d'écrire un retrait de −200 €, dont le signe se serait appliqué deux fois.
    montant    = Column(Float, nullable=False)
    note       = Column(String, nullable=True)
    cree_le    = Column(DateTime, default=datetime.utcnow)


class Transaction(Base):
    __tablename__ = "transactions"
    id           = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(String, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker       = Column(String, nullable=False, index=True)
    asset_type   = Column(String, nullable=False)           # EQUITY | ETF | CRYPTOCURRENCY | INDEX
    side         = Column(String, nullable=False)           # BUY | SELL
    quantity     = Column(Float,  nullable=False)
    unit_price   = Column(Float,  nullable=False)
    fees         = Column(Float,  default=0.0)
    executed_at  = Column(DateTime, nullable=False)
    # Mémo libre : « PEA Boursorama », « arbitrage », « dividende réinvesti ».
    # Six mois plus tard, la raison d'une ligne ne se retrouve nulle part
    # ailleurs.
    note         = Column(String, nullable=True)
    #: Le compte déclaré où l'opération a eu lieu.
    #:
    #: ⚠️ **Nullable, et il le restera.** Toutes les transactions saisies avant les
    #: comptes déclarés en sont dépourvues ; les rattacher d'office aurait demandé de
    #: deviner, c'est-à-dire de refaire l'inférence qu'on cherche justement à remplacer
    #: par une donnée. Sans compte, une ligne reste rangée par déduction, comme avant.
    #:
    #: ⚠️ **Pas de contrainte de clé étrangère.** SQLite ne sait pas ajouter une `FOREIGN
    #: KEY` par `ALTER TABLE`, et c'est par là que passe la migration douce plus bas : la
    #: colonne existerait sans contrainte sur les bases déjà créées et avec contrainte
    #: sur les neuves. Une règle qui ne vaut que sur la moitié des installations est pire
    #: qu'une règle absente, parce qu'on croit l'avoir. La suppression d'un compte
    #: détache donc ses lignes explicitement, côté route.
    compte_id    = Column(String, nullable=True, index=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)

# Migration douce : ajoute les colonnes si elles n'existent pas encore
#
# ⚠️ **Elle n'en retire aucune, et c'est volontaire.** Une colonne supprimée du modèle
# reste dans les bases déjà créées — `comptes.logo_url` depuis que les logos
# d'établissement ont été retirés. SQLAlchemy ne la lit plus, elle ne coûte rien, et la
# faire tomber demanderait un `DROP COLUMN` que les vieilles versions de SQLite ne savent
# pas faire : la table entière serait reconstruite, données comprises, pour économiser un
# champ vide. Les bases neuves, elles, ne l'auront jamais.
for table, col, typedef in [
    ("portfolios",   "total_value",   "REAL"),
    ("portfolios",   "cost_basis",    "REAL"),
    ("portfolios",   "is_simulation", "INTEGER"),
    ("portfolios",   "user_id",       "TEXT"),
    ("portfolios",   "image_url",     "TEXT"),
    ("portfolios",   "horizon_annees", "INTEGER"),
    ("portfolios",   "tolerance",      "TEXT"),
    ("portfolios",   "frais_lignes",   "JSON"),
    ("portfolios",   "couleurs_comptes", "JSON"),
    ("transactions", "note",          "TEXT"),
    ("users",        "devise",         "TEXT"),
    ("objectifs",    "verse_deja",     "REAL"),
    ("transactions", "compte_id",      "TEXT"),
    ("comptes",      "mis_a_jour_le",  "TIMESTAMP"),
    ("comptes",      "solde_depuis",   "TIMESTAMP"),
]:
    try:
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typedef} DEFAULT NULL"))
            conn.commit()
    except Exception:
        pass

def get_db():
    with Session(engine) as session:
        yield session
