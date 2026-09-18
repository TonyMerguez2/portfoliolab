"""
Les alertes macroéconomiques d'un portefeuille : les lire, les marquer, les écarter.

⚠️ **Portefeuille en entrée, compte en sortie.** Les échéances dépendent du portefeuille
— ses tickers décident des zones — mais l'état « vue » et « écartée » appartient au
compte : celui qui écarte une décision de la BCE sur un portefeuille ne veut pas la
revoir sur l'autre. C'est pourquoi la lecture est sous `/portfolios/{id}` et les deux
écritures ne le sont pas.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_auth
from app.core.database import Portfolio, get_db
from app.models.user import User
from app.services.alertes import alertes, marquer_vues, supprimer

router = APIRouter(prefix="/api/v1", tags=["Alertes"])


def _portefeuille(portfolio_id: str, user: User, db: Session) -> Portfolio:
    """Le portefeuille demandé, s'il appartient au compte. 404 sinon, jamais 403."""
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p or (p.user_id is not None and p.user_id != user.id):
        raise HTTPException(404, "Portefeuille introuvable")
    return p


@router.get("/portfolios/{portfolio_id}/alertes")
async def lister(portfolio_id: str, db: Session = Depends(get_db),
                 user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    tickers = [a.get("ticker") for a in (p.assets or []) if a.get("ticker")]
    return {"alertes": alertes(db, user.id, tickers)}


class CorpsVues(BaseModel):
    cles: list[str]


@router.post("/alertes/vues")
async def marquer(corps: CorpsVues, db: Session = Depends(get_db),
                  user: User = Depends(require_auth)):
    """
    ⚠️ **Un lot et non une clé à la fois.** L'écran annonce plusieurs alertes d'un coup ;
    une route par clé aurait fait partir cinq requêtes pour un seul chargement de page.
    """
    return {"marquees": marquer_vues(db, user.id, corps.cles)}


@router.delete("/alertes/{cle}")
async def ecarter(cle: str, db: Session = Depends(get_db),
                  user: User = Depends(require_auth)):
    supprimer(db, user.id, cle)
    return {"supprimee": cle}
