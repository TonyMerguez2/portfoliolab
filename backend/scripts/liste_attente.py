"""
Lire la liste d'attente, depuis le serveur et nulle part ailleurs.

⚠️ **C'est le seul moyen de la consulter, à dessein.** Aucune route ne la rend : une liste
d'adresses est la donnée la plus sensible du site, et un `GET` mal protégé la publie d'un
coup. La lire demande donc un accès au serveur, ce qui est exactement la barrière voulue.

Exécution :
    cd backend && ./venv/bin/python scripts/liste_attente.py
    cd backend && ./venv/bin/python scripts/liste_attente.py --csv > attente.csv
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.orm import Session

from app.core.database import engine
from app.models.attente import ListeAttente


def main() -> None:
    csv = "--csv" in sys.argv
    with Session(engine) as db:
        lignes = db.query(ListeAttente).order_by(ListeAttente.cree_le).all()

    if csv:
        print("email,origine,inscrit_le")
        for l in lignes:
            print(f"{l.email},{l.origine or ''},{l.cree_le:%Y-%m-%d %H:%M}")
        return

    if not lignes:
        print("Personne pour l'instant.")
        return

    for i, l in enumerate(lignes, 1):
        print(f"{i:>4}. {l.email:<40} {l.cree_le:%d/%m/%Y %H:%M}")
    print(f"\n{len(lignes)} inscrit(s).")


if __name__ == "__main__":
    main()
