"""
La route du bandeau d'actifs.

⚠️ **Sous `/api/v1/`, et c'est une correction.** Elle vivait à `/ticker`, à la racine de
l'API — donc hors des réécritures de `next.config.js`, qui ne relaient que `/api/v1/*` et
`/uploads/*`. En production, l'adresse ne menait nulle part : le middleware la renvoyait
vers la porte en 307, et derrière la porte Next répondait 404, faute de page de ce nom. Le
bandeau était monté, la requête échouait, le garde `actifs.length > 0` masquait tout. Trois
composants l'appelaient toutes les trente secondes pour rien.

⚠️ **Ouverte sans code d'accès, volontairement.** Elle est listée dans `OUVERTS`
(`frontend/src/middleware.ts`) parce que la page d'accès doit pouvoir l'afficher avant
d'avoir laissé entrer qui que ce soit. C'est tenable parce qu'elle ne rend que des cours
de marché et qu'elle sert un instantané partagé — voir `services/bandeau.py`.
"""

from fastapi import APIRouter

from app.services.bandeau import instantane

router = APIRouter(prefix="/api/v1", tags=["Bandeau"])


@router.get("/bandeau")
async def bandeau() -> dict:
    return instantane()
