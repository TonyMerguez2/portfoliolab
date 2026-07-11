from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db, Portfolio
from pydantic import BaseModel
from typing import List
import uuid

router = APIRouter(prefix="/api/v1/portfolios", tags=["Portfolios"])

class AssetInput(BaseModel):
    ticker: str
    weight: float

class PortfolioCreate(BaseModel):
    name: str
    assets: List[AssetInput]
    color: str = "#6366f1"
    total_value:   float | None = None
    cost_basis:    float | None = None
    is_simulation: bool  | None = None

class PortfolioUpdate(BaseModel):
    name: str | None = None
    assets: List[AssetInput] | None = None
    color: str | None = None
    total_value:   float | None = None
    cost_basis:    float | None = None
    is_simulation: bool  | None = None

@router.get("")
def list_portfolios(db: Session = Depends(get_db)):
    return db.query(Portfolio).order_by(Portfolio.updated_at.desc()).all()

@router.post("")
def create_portfolio(data: PortfolioCreate, db: Session = Depends(get_db)):
    p = Portfolio(
        id=str(uuid.uuid4()),
        name=data.name,
        assets=[a.dict() for a in data.assets],
        color=data.color,
        total_value=data.total_value,
        is_simulation=data.is_simulation,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p

@router.put("/{portfolio_id}")
def update_portfolio(portfolio_id: str, data: PortfolioUpdate, db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if data.name is not None: p.name = data.name
    if data.assets is not None: p.assets = [a.dict() for a in data.assets]
    if data.color is not None: p.color = data.color
    if data.total_value   is not None: p.total_value   = data.total_value
    if data.cost_basis    is not None: p.cost_basis    = data.cost_basis
    if data.is_simulation is not None: p.is_simulation = data.is_simulation
    db.commit()
    db.refresh(p)
    return p

@router.delete("/{portfolio_id}")
def delete_portfolio(portfolio_id: str, db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    db.delete(p)
    db.commit()
    return {"ok": True}
