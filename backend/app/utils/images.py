"""
Réception d'une image téléversée.

Le type est déduit du **contenu**, jamais du nom de fichier. C'est la seule
façon sûre de nommer le fichier écrit : le dossier `uploads/` est servi en
statique, donc l'extension décide de ce que le navigateur fera du fichier.
Une extension recopiée depuis le nom fourni par le client laisserait déposer
un `.html` ou un `.svg` — servi depuis l'origine du site, il y exécuterait du
script. Et un nom comme « a.b/../../x » ferait sortir l'écriture du dossier.

Le SVG est refusé pour cette raison : c'est un document, il peut porter du
script, et rien ici n'en a besoin.
"""

import hashlib
import os

# Les premiers octets de chaque format accepté, et l'extension qui leur
# correspond. Le WebP se reconnaît en deux morceaux : « RIFF », quatre octets
# de taille, puis « WEBP ».
SIGNATURES: list[tuple[bytes, int, str]] = [
    (b"\x89PNG\r\n\x1a\n", 0, "png"),
    (b"\xff\xd8\xff",      0, "jpg"),
    (b"GIF87a",            0, "gif"),
    (b"GIF89a",            0, "gif"),
    (b"WEBP",              8, "webp"),
]

TAILLE_MAX = 4 * 1024 * 1024  # 4 Mio


class ImageRefusee(Exception):
    """Le contenu reçu n'est pas une image d'un format accepté."""


def extension_reconnue(donnees: bytes) -> str:
    for motif, position, ext in SIGNATURES:
        if donnees[position:position + len(motif)] == motif:
            return ext
    raise ImageRefusee(
        "Format non reconnu. Attendu : PNG, JPEG, GIF ou WebP."
    )


def enregistrer(donnees: bytes, dossier: str, base: str) -> str:
    """
    Écrit l'image et renvoie son chemin public.

    `base` doit être un identifiant interne — un UUID de portefeuille, pas une
    chaîne venue du client. La vérification ci-dessous est une seconde barrière,
    pas la première.
    """
    if len(donnees) > TAILLE_MAX:
        raise ImageRefusee(f"Image trop lourde (maximum {TAILLE_MAX // 1024 // 1024} Mio).")
    if not donnees:
        raise ImageRefusee("Fichier vide.")
    if not base.replace("-", "").replace("_", "").isalnum():
        raise ImageRefusee("Identifiant de destination invalide.")

    ext = extension_reconnue(donnees)
    os.makedirs(dossier, exist_ok=True)

    # Les anciennes versions portent une autre extension si le format a changé.
    # Sans ce ménage, un PNG remplacé par un JPEG laisserait le premier derrière
    # lui, servi par personne mais conservé indéfiniment.
    for autre in {e for _, _, e in SIGNATURES}:
        vieux = os.path.join(dossier, f"{base}.{autre}")
        if autre != ext and os.path.exists(vieux):
            os.remove(vieux)

    chemin = os.path.join(dossier, f"{base}.{ext}")
    with open(chemin, "wb") as f:
        f.write(donnees)

    # ⚠️ Une empreinte du contenu dans l'URL, sans quoi la nouvelle image ne
    # s'affiche pas.
    #
    # Le fichier porte l'identifiant du portefeuille, donc son chemin ne change
    # jamais d'un envoi au suivant. Le client recevait alors deux fois la même
    # URL : le navigateur gardait l'image déjà décodée, et React ne touchait même
    # pas au `src` puisque la chaîne était identique. Un recadrage était bien
    # écrit sur le disque et restait invisible jusqu'au rechargement complet de la
    # page — exactement le symptôme rapporté, sur la vignette comme dans le menu.
    #
    # L'empreinte du contenu plutôt que l'heure : deux envois du même fichier
    # rendent la même URL, donc le cache du navigateur sert encore à quelque
    # chose. Huit caractères suffisent à distinguer deux cadrages d'une même
    # photo — ce n'est pas un usage de sécurité, seulement un identifiant de
    # version.
    empreinte = hashlib.sha256(donnees).hexdigest()[:8]
    return f"/{dossier}/{base}.{ext}?v={empreinte}"


def supprimer(dossier: str, base: str) -> None:
    """Retire l'image, quelle que soit l'extension sous laquelle elle a été écrite."""
    if not base.replace("-", "").replace("_", "").isalnum():
        return
    for ext in {e for _, _, e in SIGNATURES}:
        chemin = os.path.join(dossier, f"{base}.{ext}")
        if os.path.exists(chemin):
            os.remove(chemin)
