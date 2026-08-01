from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db, Portfolio
from app.core.auth import require_auth, get_current_user
from app.models.user import User
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

def _adopter_orphelins(user: User, db: Session) -> None:
    """
    Rattache au premier compte qui se connecte les portefeuilles sans
    propriétaire.

    Ils datent d'avant les comptes. Les laisser sans propriétaire les rendrait
    invisibles dès que la liste est filtrée — indiscernable, pour qui les a
    créés, d'une perte de données.
    """
    orphelins = db.query(Portfolio).filter(Portfolio.user_id.is_(None)).all()
    if not orphelins:
        return
    for p in orphelins:
        p.user_id = user.id
    db.commit()


@router.get("")
def list_portfolios(db: Session = Depends(get_db), user: User = Depends(require_auth)):
    _adopter_orphelins(user, db)
    return (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user.id)
        .order_by(Portfolio.updated_at.desc())
        .all()
    )

@router.post("")
def create_portfolio(
    data: PortfolioCreate,
    db:   Session = Depends(get_db),
    user: User    = Depends(require_auth),
):
    p = Portfolio(
        id=str(uuid.uuid4()),
        user_id=user.id,
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

def _portefeuille_du_compte(portfolio_id: str, user: User, db: Session) -> Portfolio:
    """
    Le portefeuille demandé, s'il appartient au compte.

    Un portefeuille appartenant à autrui renvoie 404 et non 403 : répondre
    « interdit » confirmerait son existence.
    """
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p or (p.user_id is not None and p.user_id != user.id):
        raise HTTPException(status_code=404, detail="Portefeuille introuvable")
    return p


@router.put("/{portfolio_id}")
def update_portfolio(
    portfolio_id: str, data: PortfolioUpdate,
    db: Session = Depends(get_db), user: User = Depends(require_auth),
):
    p = _portefeuille_du_compte(portfolio_id, user, db)
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
def delete_portfolio(
    portfolio_id: str,
    db: Session = Depends(get_db), user: User = Depends(require_auth),
):
    p = _portefeuille_du_compte(portfolio_id, user, db)
    db.delete(p)
    db.commit()
    return {"ok": True}
