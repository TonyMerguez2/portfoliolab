from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
import os, shutil
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth import hash_password, verify_password, create_token, require_auth
from app.models.user import User
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
import uuid


def _normaliser_email(email: str) -> str:
    """
    Une adresse se compare sans casse ni espaces.

    La partie domaine est insensible à la casse par norme, et aucun service
    grand public ne distingue « Sacha@ » de « sacha@ ». Or la recherche était
    littérale : une majuscule mise par le clavier — ce que font les téléphones
    sur le premier caractère — ne trouvait aucun compte, et l'utilisateur
    lisait « mot de passe incorrect ».
    """
    return (email or "").strip().lower()


def _tronquer(mot_de_passe: str) -> str:
    """
    bcrypt n'accepte que 72 octets et lève au-delà depuis la version 5.

    Il tronquait silencieusement auparavant : refuser maintenant renverrait une
    erreur 500 sur un mot de passe long qui fonctionnait la veille.
    """
    b = (mot_de_passe or "").encode("utf-8")
    return b[:72].decode("utf-8", "ignore") if len(b) > 72 else mot_de_passe

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

class RegisterInput(BaseModel):
    email: str
    password: str
    username: str | None = None

class LoginInput(BaseModel):
    email: str
    password: str

class UpdateProfileInput(BaseModel):
    username: str | None = None
    avatar_url: str | None = None

@router.post("/register")
def register(data: RegisterInput, db: Session = Depends(get_db)):
    email = _normaliser_email(data.email)
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        hashed_password=hash_password(_tronquer(data.password)),
        username=data.username or data.email.split("@")[0],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "avatar_url": user.avatar_url}}

@router.post("/login")
def login(data: LoginInput, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == _normaliser_email(data.email)).first()
    if not user or not verify_password(_tronquer(data.password), user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    token = create_token(user.id)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "avatar_url": user.avatar_url}}

@router.get("/me")
def me(user: User = Depends(require_auth)):
    """
    Le compte de la session en cours.

    Cette route était un talon : elle renvoyait `{"message": ...}` avec un 200
    quel que soit le jeton — ou son absence. Tout appelant s'en servant pour
    vérifier une session la croyait donc valide, et celui qui enregistrait la
    réponse remplaçait le compte mémorisé par ce message.
    """
    return {
        "id":         user.id,
        "email":      user.email,
        "username":   user.username,
        "avatar_url": user.avatar_url,
    }

@router.put("/profile")
def update_profile(data: UpdateProfileInput, authorization: str = Header(None), db: Session = Depends(get_db)):
    from app.core.auth import get_current_user, oauth2_scheme
    token = authorization.replace("Bearer ", "") if authorization else None
    if not token:
        raise HTTPException(status_code=401, detail="Non autorisé")
    from app.core.auth import SECRET_KEY, ALGORITHM
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if data.username is not None: user.username = data.username
    if data.avatar_url is not None: user.avatar_url = data.avatar_url
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "username": user.username, "avatar_url": user.avatar_url}

@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), authorization: str = Header(None), db: Session = Depends(get_db)):
    from app.core.auth import SECRET_KEY, ALGORITHM
    from jose import jwt, JWTError
    token = authorization.replace("Bearer ", "") if authorization else None
    if not token:
        raise HTTPException(status_code=401, detail="Non autorisé")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    ext = file.filename.split(".")[-1] if file.filename else "jpg"
    filename = f"{user_id}.{ext}"
    path = f"uploads/{filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    url = f"/uploads/{filename}"
    user.avatar_url = url
    db.commit()
    return {"avatar_url": url}
