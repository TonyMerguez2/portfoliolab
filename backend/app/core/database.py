from sqlalchemy import create_engine, Column, String, JSON, DateTime, Integer
from sqlalchemy.orm import DeclarativeBase, Session
from datetime import datetime
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "portfoliolab.db")
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

class Base(DeclarativeBase):
    pass

class Portfolio(Base):
    __tablename__ = "portfolios"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    assets = Column(JSON, nullable=False)  # [{ticker, weight}]
    color = Column(String, default="#6366f1")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

Base.metadata.create_all(engine)

def get_db():
    with Session(engine) as session:
        yield session
