"""
L'envoi de courriels, par un fournisseur.

⚠️ **Pourquoi un fournisseur et non le serveur lui-même.** Hetzner bloque le port 25 sortant
par défaut sur les comptes neufs : une machine ne peut tout simplement pas remettre un
courriel en direct. Et quand bien même — un message parti d'une adresse de centre de données
sans réputation atterrit en indésirable ou nulle part. Le fournisseur signe, retente et
rapporte ; c'est son métier.

⚠️ **Rien ne part si la clé est absente, et ce n'est pas une panne.** En développement, sur
une machine de travail, on ne veut pas qu'une inscription d'essai envoie un vrai courriel à
une vraie adresse. L'absence de `NOVAC_RESEND_CLE` fait donc taire l'envoi et le journalise ;
elle ne fait pas tomber la route.

⚠️ **Un envoi ne doit jamais faire échouer ce qu'il accompagne.** Quelqu'un qui laisse son
adresse doit être inscrit même si le fournisseur est en panne : l'inscription est le fait,
le courriel n'est qu'une politesse. Tout est donc attrapé, et l'envoi part dans un fil
détaché pour ne pas retarder la réponse — un aller-retour vers l'API se compte en centaines
de millisecondes, ce qui se sent sur un bouton.
"""

from __future__ import annotations

import logging
import os
import threading

import httpx

logger = logging.getLogger(__name__)

#: L'expéditeur. ⚠️ Le domaine doit être vérifié chez le fournisseur, sinon tout est refusé.
EXPEDITEUR = os.environ.get("NOVAC_COURRIEL_EXPEDITEUR", "Novac <bonjour@novac.fyi>")

_API = "https://api.resend.com/emails"


def configure() -> bool:
    """L'envoi est-il branché ?"""
    return bool(os.environ.get("NOVAC_RESEND_CLE"))


def envoyer(destinataire: str, sujet: str, texte: str, html: str | None = None) -> bool:
    """
    Remet un message, tout de suite, et dit si le fournisseur l'a accepté.

    ⚠️ Synchrone : à n'appeler que depuis un script ou un fil détaché, jamais dans le fil
    d'une requête web. Pour une route, voir `envoyer_en_fond`.
    """
    cle = os.environ.get("NOVAC_RESEND_CLE")
    if not cle:
        logger.info("Courriel non envoyé (NOVAC_RESEND_CLE absente) : %s → %s", sujet, destinataire)
        return False
    try:
        r = httpx.post(
            _API,
            headers={"Authorization": f"Bearer {cle}", "Content-Type": "application/json"},
            json={"from": EXPEDITEUR, "to": [destinataire], "subject": sujet,
                  "text": texte, **({"html": html} if html else {})},
            timeout=15,
        )
        if r.status_code >= 400:
            logger.error("Courriel refusé (%s) pour %s : %s", r.status_code, destinataire,
                         r.text[:200])
            return False
        return True
    except Exception:                                          # pragma: no cover
        logger.exception("Courriel : échec d'envoi à %s", destinataire)
        return False


def envoyer_en_fond(destinataire: str, sujet: str, texte: str, html: str | None = None) -> None:
    """
    Le même envoi, sans faire attendre la réponse ni pouvoir la faire échouer.

    ⚠️ Un fil détaché et non une file de tâches : il y a un envoi par inscription, sur un
    site en alpha fermée. Une file demanderait un service de plus à faire tourner et à
    surveiller, pour un débit que trois personnes par jour n'atteindront pas. Le jour où les
    inscriptions se compteront par centaines à l'heure, c'est ici que la file se branchera.
    """
    threading.Thread(target=envoyer, args=(destinataire, sujet, texte, html),
                     daemon=True, name="courriel").start()


#: Le message d'accusé de réception, en texte et en HTML.
#:
#: ⚠️ Les deux versions disent la même chose : un client qui refuse le HTML — ou un lecteur
#: qui l'a désactivé — doit lire un message entier, pas un moignon.
SUJET_INSCRIPTION = "Vous êtes sur la liste d'attente de Novac"

TEXTE_INSCRIPTION = """\
Bonjour,

Votre adresse est enregistrée sur la liste d'attente de Novac.

Novac est un tableau de bord pour suivre son patrimoine entier — portefeuilles, comptes,
objectifs — et comprendre ce qui le fait bouger. Il est en alpha fermée : nous ouvrons les
accès par petits groupes.

Vous recevrez un code dès qu'une place se libère. Rien d'autre ne vous sera envoyé.

À bientôt,
L'équipe Novac
novac.fyi

Rien de ce qui s'affiche sur Novac n'est un conseil en investissement.
"""

HTML_INSCRIPTION = """\
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            font-size:15px;line-height:1.6;color:#1B2434;max-width:520px">
  <p>Bonjour,</p>
  <p>Votre adresse est enregistrée sur la <strong>liste d'attente de Novac</strong>.</p>
  <p>Novac est un tableau de bord pour suivre son patrimoine entier — portefeuilles, comptes,
     objectifs — et comprendre ce qui le fait bouger. Il est en alpha fermée&nbsp;: nous
     ouvrons les accès par petits groupes.</p>
  <p>Vous recevrez un code dès qu'une place se libère. Rien d'autre ne vous sera envoyé.</p>
  <p style="margin-top:24px">À bientôt,<br>L'équipe Novac<br>
     <a href="https://novac.fyi" style="color:#1E6FD9">novac.fyi</a></p>
  <p style="margin-top:28px;font-size:12px;color:#6E7A91">
     Rien de ce qui s'affiche sur Novac n'est un conseil en investissement.</p>
</div>
"""
