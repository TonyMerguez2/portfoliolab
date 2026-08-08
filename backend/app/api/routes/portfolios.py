from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db, Portfolio
from app.core.auth import require_auth, get_current_user
from app.models.user import User
from app.utils.images import ImageRefusee, TAILLE_MAX, enregistrer, supprimer
from pydantic import BaseModel
from typing import List
import uuid

DOSSIER_IMAGES = "uploads"

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
    # Profil de risque déclaré : horizon en années, et tolérance parmi
    # `prudent`, `equilibre`, `dynamique`. Voir `profil_cible`.
    horizon_annees: int | None = None
    tolerance:      str | None = None
    # Frais courants saisis à la main, `{ticker: pourcentage par an}`. Voir la note
    # sur `Portfolio.frais_lignes` : le fournisseur de cours ne publie presque jamais
    # le TER des ETF européens, et l'épargnant l'a sur son document d'information.
    frais_lignes: dict[str, float] | None = None

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
    if data.horizon_annees is not None: p.horizon_annees = data.horizon_annees
    if data.tolerance is not None:
        # ⚠️ Validé ici et non seulement à la lecture : une tolérance inconnue
        # ferait taire les trois facteurs de risque sans que rien ne le dise, et
        # le portefeuille paraîtrait simplement moins bien noté.
        from app.services.analyse import TOLERANCES
        if data.tolerance not in TOLERANCES:
            raise HTTPException(
                status_code=422,
                detail=f"tolerance doit valoir l'une de {', '.join(TOLERANCES)}",
            )
        p.tolerance = data.tolerance
    if data.frais_lignes is not None:
        # ⚠️ Validé à l'écriture, comme la tolérance. Un TER hors bornes ne doit pas
        # entrer en base : moyenné avec les autres, il déplacerait la note sans que
        # rien ne signale l'erreur de saisie.
        #
        # Les bornes sont celles du marché réel — de 0,03 % pour un tracker large à
        # 3 % pour un fonds actif — élargies à 5 % pour ne pas refuser un produit
        # inhabituel. Zéro est accepté : certains fonds n'ont réellement aucun frais
        # courant, et c'est une information.
        #
        # La borne haute protège surtout d'une confusion d'unité : quelqu'un qui tape
        # « 15 » pour 0,15 % verra son erreur refusée au lieu d'obtenir zéro sur cent
        # aux frais.
        propres: dict[str, float] = {}
        for ticker, valeur in data.frais_lignes.items():
            try:
                v = float(valeur)
            except (TypeError, ValueError):
                raise HTTPException(status_code=422,
                                    detail=f"frais illisibles pour {ticker}")
            if not 0.0 <= v <= 5.0:
                raise HTTPException(
                    status_code=422,
                    detail=f"frais de {ticker} : {v} % par an est hors de 0 à 5 % — "
                           "le taux s'exprime en pourcentage annuel, par exemple 0,15",
                )
            propres[str(ticker).upper()] = v
        p.frais_lignes = propres
    db.commit()
    db.refresh(p)
    return p

@router.post("/{portfolio_id}/image")
async def upload_portfolio_image(
    portfolio_id: str, file: UploadFile = File(...),
    db: Session = Depends(get_db), user: User = Depends(require_auth),
):
    """
    Reçoit l'image de profil d'un portefeuille.

    Le portefeuille est d'abord résolu contre le compte : c'est ce qui empêche
    d'écrire dans le dossier d'un portefeuille qui n'est pas le sien, et c'est
    aussi ce qui garantit que le nom du fichier vient d'un identifiant interne.

    La lecture est bornée avant l'écriture. `UploadFile` n'impose aucune limite
    de son côté : sans ce garde-fou, la taille du fichier écrit serait celle que
    l'appelant décide.
    """
    p = _portefeuille_du_compte(portfolio_id, user, db)
    donnees = await file.read(TAILLE_MAX + 1)
    try:
        p.image_url = enregistrer(donnees, DOSSIER_IMAGES, p.id)
    except ImageRefusee as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{portfolio_id}/image")
def delete_portfolio_image(
    portfolio_id: str,
    db: Session = Depends(get_db), user: User = Depends(require_auth),
):
    p = _portefeuille_du_compte(portfolio_id, user, db)
    supprimer(DOSSIER_IMAGES, p.id)
    p.image_url = None
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{portfolio_id}")
def delete_portfolio(
    portfolio_id: str,
    db: Session = Depends(get_db), user: User = Depends(require_auth),
):
    p = _portefeuille_du_compte(portfolio_id, user, db)
    # Le fichier n'est pas dans la base : la cascade des clés étrangères ne le
    # verrait pas passer, et il resterait indéfiniment dans `uploads/`.
    supprimer(DOSSIER_IMAGES, p.id)
    db.delete(p)
    db.commit()
    return {"ok": True}
