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
#:
#: ⚠️ **`no-reply@` est un engagement, pas une formule.** Aucune boîte ne porte ce nom et
#: aucune n'a à le porter : le fournisseur vérifie le *domaine*, jamais l'adresse. En
#: contrepartie, aucun texte de message ne doit inviter à répondre — la réponse partirait
#: dans le vide sans que personne, ni l'expéditeur ni le lecteur, ne l'apprenne.
EXPEDITEUR = os.environ.get("NOVAC_COURRIEL_EXPEDITEUR", "Novac <no-reply@novac.fyi>")

#: Où doivent aller les réponses, si on veut en recevoir. Vide par défaut, et c'est cohérent
#: avec `no-reply@`.
#:
#: ⚠️ **À ne remplir que si la boîte existe vraiment**, c'est-à-dire une fois la redirection
#: posée chez le registrar. Annoncer une adresse de réponse qui rebondit est pire que ne pas
#: en annoncer : le lecteur croit avoir été entendu.
REPONSE_A = os.environ.get("NOVAC_COURRIEL_REPONSE", "")

_API = "https://api.resend.com/emails"


def configure() -> bool:
    """L'envoi est-il branché ?"""
    return bool(os.environ.get("NOVAC_RESEND_CLE"))


def envoyer(destinataire: str, sujet: str, texte: str, html: str | None = None) -> bool:
    """
    Remet un message, tout de suite, et dit si le fournisseur l'a accepté.

    ⚠️ Synchrone : à n'appeler que depuis un script ou un fil détaché, jamais dans le fil
    d'une requête web. Pour une route, voir `envoyer_en_fond`.

    ⚠️ **« Accepté » ne veut pas dire « remis ».** Un 200 dit que le fournisseur prend le
    message en charge ; ce que le destinataire en fait — boîte, indésirables, rejet — se lit
    ensuite dans les journaux du fournisseur, pas ici.
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
                  "text": texte, **({"html": html} if html else {}),
                  **({"reply_to": REPONSE_A} if REPONSE_A else {})},
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


# ── L'habillage des messages ────────────────────────────────────────────────────────────
#
# ⚠️ **Un courriel ne se met pas en page comme une page web, et trois murs le séparent du
# site.**
#
# 1. **La police du site est inatteignable.** Gmail, Outlook et Yahoo suppriment les
#    `@font-face` ; Geist ne s'affichera jamais chez eux. Seule une pile de polices système
#    est fiable, donc c'est elle qu'on écrit — inutile de faire semblant.
#
# 2. **Les feuilles de style sont facultatives.** Outlook ignore une partie de `<style>`, et
#    certains clients le retirent entièrement. Tout ce qui compte est donc en style *en
#    ligne* ; le `<style>` ne porte que le confort mobile, qui peut disparaître sans dommage.
#
# 3. **Le fond sombre est le vrai piège.** Les clients en mode sombre recolorent ce qu'ils ne
#    comprennent pas, et un message soigné en ressort en texte noir sur noir. Deux gardes :
#    l'attribut `bgcolor` sur chaque cellule — que les moteurs d'inversion respectent, à la
#    différence du seul CSS — et les deux `meta` de `color-scheme`, qui déclarent le message
#    déjà sombre et suffisent à désarmer l'inversion sur Apple Mail et iOS.
#
# ⚠️ **Le logo ne porte jamais rien d'essentiel.** Beaucoup de clients bloquent les images
# par défaut ; `logo-novac.png` est blanc sur transparence, donc absent *et* invisible sur un
# fond clair. Le mot « Novac » est écrit en texte juste à côté : c'est lui l'identité, l'image
# n'est qu'un supplément. Son `alt` est vide pour la même raison — un texte de remplacement
# blanc sur fond blanc ne sauverait rien.

#: Les couleurs, reprises de `globals.css`. En dur : un courriel n'a pas de variables CSS.
_FOND = "#030712"          # --nv-fond
_PLATEAU = "#101828"       # --nv-fond-plateau
_BORD = "#1E2939"          # --nv-bord-fort
_INTENSE = "#FFFFFF"       # --nv-texte-intense
_TEXTE = "#D1D5DC"         # --nv-texte
_ATTENUE = "#99A1AF"       # --nv-texte-secondaire
_FAIBLE = "#6A7282"        # --nv-texte-attenue

_POLICE = ("-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
           "'Helvetica Neue',Arial,sans-serif")
_MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"


def page(titre: str, apercu: str, corps: str) -> str:
    """
    Enveloppe un contenu dans l'habillage de Novac.

    `apercu` est la ligne que les boîtes affichent sous l'objet, dans la liste des messages.
    ⚠️ **Sans elle, le client va chercher le premier texte venu** — en pratique « Bonjour, »
    suivi du début du premier paragraphe, ce qui gaspille la seule ligne que beaucoup de gens
    liront. Elle est masquée dans le corps du message, où elle ferait doublon.
    """
    return f"""\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{titre}</title>
<style>
  @media only screen and (max-width:600px) {{
    .nv-marge {{ padding-left:24px !important; padding-right:24px !important; }}
    .nv-titre {{ font-size:26px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background-color:{_FOND};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;
            font-size:1px;line-height:1px">{apercu}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="{_FOND}" style="background-color:{_FOND};margin:0;padding:0">
  <tr>
    <td align="center" bgcolor="{_FOND}" style="background-color:{_FOND};padding:40px 12px">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             bgcolor="{_FOND}"
             style="width:100%;max-width:600px;background-color:{_FOND}">

        <!-- Le bloc-marque, tel qu'il est en haut à gauche du site. -->
        <tr><td class="nv-marge" bgcolor="{_FOND}"
                style="background-color:{_FOND};padding:0 40px 36px">
          <img src="https://novac.fyi/logo-novac.png" width="30" height="30" alt=""
               style="vertical-align:middle;border:0;display:inline-block">
          <span style="font-family:{_POLICE};font-size:20px;font-weight:600;
                       color:{_INTENSE};letter-spacing:-0.2px;vertical-align:middle;
                       padding-left:9px">Novac</span>
        </td></tr>

        {corps}

        <!-- Le pied : le trait sépare, la mention légale conclut. -->
        <tr><td class="nv-marge" bgcolor="{_FOND}"
                style="background-color:{_FOND};padding:40px 40px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td height="1" bgcolor="{_PLATEAU}"
                    style="background-color:{_PLATEAU};height:1px;line-height:1px;
                           font-size:0">&nbsp;</td></tr>
          </table>
        </td></tr>
        <tr><td class="nv-marge" bgcolor="{_FOND}"
                style="background-color:{_FOND};padding:24px 40px 0;
                       font-family:{_POLICE};font-size:12px;line-height:1.6;color:{_FAIBLE}">
          <a href="https://novac.fyi" style="color:{_ATTENUE};text-decoration:none">novac.fyi</a>
          &nbsp;·&nbsp; Rien de ce qui s'affiche sur Novac n'est un conseil en investissement.
          <br><br>
          Vous recevez ce message parce que votre adresse a été inscrite sur la liste
          d'attente de Novac. Cette adresse d'envoi ne reçoit pas de réponse.
        </td></tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""


def titre(texte: str) -> str:
    """Le grand titre : une phrase, pas un mot, et c'est lui qui porte le message."""
    return f"""\
        <tr><td class="nv-marge" bgcolor="{_FOND}"
                style="background-color:{_FOND};padding:0 40px 24px;
                       font-family:{_POLICE};font-size:32px;line-height:1.2;
                       font-weight:700;letter-spacing:-0.8px;color:{_INTENSE}"
                class="nv-titre">{texte}</td></tr>
"""


def paragraphe(texte: str) -> str:
    return f"""\
        <tr><td class="nv-marge" bgcolor="{_FOND}"
                style="background-color:{_FOND};padding:0 40px 18px;
                       font-family:{_POLICE};font-size:16px;line-height:1.65;
                       color:{_TEXTE}">{texte}</td></tr>
"""


def bouton(libelle: str, lien: str) -> str:
    """
    Un bouton en cellule de tableau, et non un `<a>` habillé.

    ⚠️ **Outlook ignore le remplissage d'un `inline-block`** : le même bouton écrit en `<a>`
    y perd sa hauteur et se réduit à un texte souligné. La cellule, elle, tient partout —
    c'est la seule mise en forme de bouton qui ne demande pas de rustine par client.
    """
    return f"""\
        <tr><td class="nv-marge" bgcolor="{_FOND}"
                style="background-color:{_FOND};padding:14px 40px 24px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="{_INTENSE}" align="center"
                    style="background-color:{_INTENSE};border-radius:999px">
              <a href="{lien}"
                 style="display:inline-block;padding:14px 30px;font-family:{_POLICE};
                        font-size:15px;font-weight:600;color:{_FOND};
                        text-decoration:none;border-radius:999px">{libelle}</a>
            </td></tr>
          </table>
        </td></tr>
"""


def code(valeur: str) -> str:
    """Le code d'accès, détaché et espacé — il sera recopié à la main, souvent sur un écran."""
    return f"""\
        <tr><td class="nv-marge" bgcolor="{_FOND}"
                style="background-color:{_FOND};padding:6px 40px 22px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="{_PLATEAU}" align="center"
                    style="background-color:{_PLATEAU};border:1px solid {_BORD};
                           border-radius:14px;padding:18px 30px;font-family:{_MONO};
                           font-size:26px;font-weight:600;letter-spacing:6px;
                           color:{_INTENSE}">{valeur}</td></tr>
          </table>
        </td></tr>
"""


# ── L'accusé de réception d'une inscription ─────────────────────────────────────────────
#
# ⚠️ Les deux versions disent la même chose : un client qui refuse le HTML — ou un lecteur
# qui l'a désactivé — doit lire un message entier, pas un moignon.

SUJET_INSCRIPTION = "Vous êtes sur la liste d'attente de Novac"

TEXTE_INSCRIPTION = """\
Votre adresse est enregistrée sur la liste d'attente de Novac.

Novac est un tableau de bord pour suivre son patrimoine entier — portefeuilles, comptes,
objectifs — et comprendre ce qui le fait bouger. Il est en alpha fermée : nous ouvrons les
accès par petits groupes.

Vous recevrez un code dès qu'une place se libère. Rien d'autre ne vous sera envoyé.

novac.fyi

Rien de ce qui s'affiche sur Novac n'est un conseil en investissement.
Cette adresse d'envoi ne reçoit pas de réponse.
"""

HTML_INSCRIPTION = page(
    SUJET_INSCRIPTION,
    "Vous recevrez un code dès qu'une place se libère.",
    titre("Vous êtes sur la liste.")
    + paragraphe("Votre adresse est enregistrée. Novac est en <strong "
                 f"style=\"color:{_INTENSE}\">alpha fermée</strong> : nous ouvrons les accès "
                 "par petits groupes, et vous recevrez un code dès qu'une place se libère.")
    + paragraphe("D'ici là, rien d'autre ne vous sera envoyé.")
    + paragraphe("Novac réunit vos portefeuilles, vos comptes et vos objectifs sur un même "
                 "tableau de bord, et montre ce qui les fait bouger.")
    + bouton("Découvrir Novac", "https://novac.fyi"),
)
