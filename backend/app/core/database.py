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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
    created_at   = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)

# Migration douce : ajoute les colonnes si elles n'existent pas encore
for table, col, typedef in [
    ("portfolios",   "total_value",   "REAL"),
    ("portfolios",   "cost_basis",    "REAL"),
    ("portfolios",   "is_simulation", "INTEGER"),
    ("portfolios",   "user_id",       "TEXT"),
    ("portfolios",   "image_url",     "TEXT"),
    ("portfolios",   "horizon_annees", "INTEGER"),
    ("portfolios",   "tolerance",      "TEXT"),
    ("portfolios",   "frais_lignes",   "JSON"),
    ("transactions", "note",          "TEXT"),
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
