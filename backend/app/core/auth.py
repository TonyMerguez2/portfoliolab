import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User

#: La valeur qui a servi tant que le site n'a tourné que sur une machine de travail.
#:
#: ⚠️ **Elle est publique par nature** : elle est écrite dans le code, donc dans le dépôt,
#: donc lisible par quiconque y accède. Qui la connaît peut forger un jeton pour n'importe
#: quel compte — signer `{"sub": "<id de la victime>"}` suffit, il n'y a rien d'autre à
#: deviner. Sans conséquence en local, où le seul compte est le vôtre ; inacceptable dès que
#: le site est joignable depuis Internet.
_SECRET_DE_TRAVAIL = "novac-secret-key-change-in-production"

#: La clé qui signe les jetons de session, lue dans l'environnement.
#:
#: ⚠️ **Changer cette valeur déconnecte tout le monde**, une fois. Les jetons déjà émis ont
#: été signés par l'ancienne et ne se vérifient plus : chacun se reconnecte, et c'est tout.
#: C'est le prix à payer une seule fois, au passage en ligne.
SECRET_KEY = os.environ.get("NOVAC_JWT_SECRET") or _SECRET_DE_TRAVAIL

# ⚠️ **Le serveur refuse de démarrer plutôt que de tourner avec la clé du dépôt.** Un
# avertissement dans un journal se lit après coup, et une variable oubliée ne se remarque
# par aucun symptôme : le site fonctionne parfaitement, il est seulement ouvert. Le seul
# garde-fou qui tienne est celui qui empêche le démarrage — bruyant, immédiat, impossible à
# manquer. `NOVAC_ENV=production` est ce que pose l'unité systemd, voir `deploiement/`.
if SECRET_KEY == _SECRET_DE_TRAVAIL and os.environ.get("NOVAC_ENV") == "production":
    raise RuntimeError(
        "NOVAC_JWT_SECRET est absent alors que NOVAC_ENV=production. La clé de signature "
        "des sessions serait celle du dépôt, que tout le monde peut lire. "
        "Posez-en une aléatoire : openssl rand -hex 32"
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == user_id).first()
    except JWTError:
        return None

def require_auth(user: User = Depends(get_current_user)):
    """Dépendance stricte : lève 401 si le JWT est absent ou invalide."""
    from fastapi import HTTPException
    if user is None:
        raise HTTPException(status_code=401, detail="Authentification requise")
    return user
