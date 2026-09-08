"""
Écrire à la liste d'attente : leur donner le code, ou les prévenir.

⚠️ **Rien ne part sans `--vraiment`.** Par défaut le script montre à qui il écrirait et
s'arrête. Un envoi groupé ne se rattrape pas : une fois le message parti, il est parti, et
une erreur de destinataire ou de contenu se lit chez tout le monde en même temps.

Exécution :
    cd backend
    ./venv/bin/python scripts/inviter.py                       # montre, n'envoie rien
    ./venv/bin/python scripts/inviter.py --code novac-xxxx     # montre le message avec le code
    ./venv/bin/python scripts/inviter.py --code novac-xxxx --vraiment
    ./venv/bin/python scripts/inviter.py --code novac-xxxx --a sacha@exemple.com --vraiment

⚠️ **`--a` limite l'envoi à une adresse**, pour s'écrire à soi-même avant d'écrire à tous.
C'est le seul essai qui vaille : il traverse le fournisseur, les signatures et les filtres.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.orm import Session

from app.core.database import engine
from app.models.attente import ListeAttente
from app.services import courriel

SUJET = "Votre accès à Novac est ouvert"

TEXTE = """\
Une place s'est libérée : voici votre code d'accès à Novac.

    {code}

Rendez-vous sur https://novac.fyi et saisissez-le dans « J'ai un code d'accès ».

Novac est en alpha : des choses manquent, d'autres changeront. C'est précisément le moment
où vos remarques comptent le plus.

À bientôt,
L'équipe Novac

Rien de ce qui s'affiche sur Novac n'est un conseil en investissement.
Cette adresse d'envoi ne reçoit pas de réponse.
"""

# ⚠️ **Plus aucune invitation à répondre.** Les messages partent de `no-reply@novac.fyi`, une
# adresse que personne ne relève : la phrase « répondez à ce message » qui figurait ici
# promettait un canal inexistant, et une réponse s'y serait perdue sans que ni son auteur ni
# nous ne l'apprenions. Pour rouvrir ce canal, il faut d'abord une vraie boîte — voir
# `NOVAC_COURRIEL_REPONSE` dans `app/services/courriel.py`.

HTML = (
    courriel.page(
        SUJET,
        "Votre code d'accès à l'alpha de Novac.",
        courriel.titre("Votre accès est ouvert.")
        + courriel.paragraphe("Une place s'est libérée. Voici votre code&nbsp;:")
        + courriel.code("{code}")
        + courriel.paragraphe("Saisissez-le dans «&nbsp;J'ai un code d'accès&nbsp;» sur "
                              "novac.fyi.")
        + courriel.bouton("Ouvrir Novac", "https://novac.fyi")
        + courriel.paragraphe("Novac est en alpha&nbsp;: des choses manquent, d'autres "
                              "changeront. C'est précisément le moment où vos remarques "
                              "comptent le plus."),
    )
)


def main() -> None:
    a = argparse.ArgumentParser(description="Écrire à la liste d'attente de Novac.")
    a.add_argument("--code", help="Le code d'accès à communiquer.")
    a.add_argument("--a", help="N'écrire qu'à cette adresse, pour un essai.")
    a.add_argument("--vraiment", action="store_true", help="Envoyer pour de bon.")
    args = a.parse_args()

    with Session(engine) as db:
        adresses = [l.email for l in db.query(ListeAttente).order_by(ListeAttente.cree_le).all()]
    if args.a:
        adresses = [args.a]

    if not adresses:
        print("Personne à qui écrire.")
        return
    if not args.code:
        print("Aucun code donné (--code). Destinataires qui recevraient le message :")
        for e in adresses:
            print("   ", e)
        return

    texte = TEXTE.format(code=args.code)
    # ⚠️ **`replace` et non `format` :** le gabarit HTML porte une règle `@media`, donc de
    # vraies accolades. `format` les prendrait pour des champs à remplir et lèverait un
    # `KeyError` sur le premier sélecteur venu — au moment de l'envoi, pas au démarrage.
    html = HTML.replace("{code}", args.code)

    if not args.vraiment:
        print(f"ESSAI À BLANC — {len(adresses)} destinataire(s), rien ne part.\n")
        for e in adresses:
            print("   ", e)
        print("\n--- le message ---\n")
        print(texte)
        print("Relancez avec --vraiment pour envoyer.")
        return

    if not courriel.configure():
        print("NOVAC_RESEND_CLE est absente : rien ne peut partir.")
        return

    envoyes = 0
    for e in adresses:
        if courriel.envoyer(e, SUJET, texte, html):
            envoyes += 1
            print("  envoyé :", e)
        else:
            print("  ÉCHEC  :", e)
        # ⚠️ Un souffle entre deux envois : les fournisseurs limitent le débit, et une salve
        # de cent messages en une seconde se fait écarter au lieu d'être remise.
        time.sleep(0.6)
    print(f"\n{envoyes}/{len(adresses)} message(s) remis au fournisseur.")


if __name__ == "__main__":
    main()
