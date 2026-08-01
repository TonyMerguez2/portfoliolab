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
    total_value = Column(Float, nullable=True, default=None)
    # cost_basis : prix de revient total (montant investi à l'origine), saisi par l'utilisateur
    cost_basis     = Column(Float,   nullable=True, default=None)
    is_simulation  = Column(Boolean, nullable=True, default=None)
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
