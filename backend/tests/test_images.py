"""
Tests de la réception d'images téléversées.

Exécution : python -m pytest backend/tests/test_images.py -v
             (depuis la racine du repo, ou : cd backend && python -m pytest tests/ -v)

Ce module décide de l'extension sous laquelle un fichier est écrit dans
`uploads/`, un dossier servi en statique. L'extension décide donc de ce que le
navigateur fera du fichier, et c'est ce qui rend ces tests intéressants : ils
ne vérifient pas un format, ils vérifient qu'on ne peut pas faire servir un
document exécutable depuis l'origine du site.
"""
import sys, os, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from app.utils.images import (
    ImageRefusee, TAILLE_MAX, extension_reconnue, enregistrer, supprimer,
)

PNG  = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 40
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 40
GIF  = b"GIF89a" + b"\x00" * 40


@pytest.mark.parametrize("donnees, attendu", [
    (PNG, "png"), (JPEG, "jpg"), (WEBP, "webp"), (GIF, "gif"),
])
def test_formats_acceptes(donnees, attendu):
    assert extension_reconnue(donnees) == attendu


@pytest.mark.parametrize("nom, donnees", [
    # Un SVG est un document : il porte du script, et servi depuis l'origine
    # du site il s'y exécuterait.
    ("svg",   b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    ("html",  b"<!doctype html><script>alert(1)</script>"),
    ("texte", b"bonjour"),
    # Une signature valable mais placée ailleurs qu'au début ne compte pas :
    # sinon il suffirait de préfixer un document par du remplissage.
    ("png décalé", b"AAAA" + b"\x89PNG\r\n\x1a\n"),
])
def test_formats_refuses(nom, donnees):
    with pytest.raises(ImageRefusee):
        extension_reconnue(donnees)


def test_le_nom_de_fichier_ne_vient_jamais_du_client():
    """
    La destination doit être un identifiant interne. Les cas ci-dessous
    sortiraient du dossier ou y déposeraient une extension choisie par
    l'appelant.
    """
    with tempfile.TemporaryDirectory() as t:
        for mauvais in ("../../etc/passwd", "a/b", "x.y", "..", "a b"):
            with pytest.raises(ImageRefusee):
                enregistrer(PNG, t, mauvais)
        assert os.listdir(t) == []


def test_changement_de_format_ne_laisse_pas_l_ancien_fichier():
    with tempfile.TemporaryDirectory() as t:
        enregistrer(PNG, t, "abc-123")
        assert os.listdir(t) == ["abc-123.png"]
        chemin = enregistrer(JPEG, t, "abc-123")
        assert os.listdir(t) == ["abc-123.jpg"]
        assert chemin == f"/{t}/abc-123.jpg"


def test_suppression_quelle_que_soit_l_extension():
    with tempfile.TemporaryDirectory() as t:
        enregistrer(WEBP, t, "abc-123")
        supprimer(t, "abc-123")
        assert os.listdir(t) == []


def test_taille_et_vide():
    with tempfile.TemporaryDirectory() as t:
        with pytest.raises(ImageRefusee):
            enregistrer(PNG + b"\x00" * TAILLE_MAX, t, "gros")
        with pytest.raises(ImageRefusee):
            enregistrer(b"", t, "vide")
        assert os.listdir(t) == []
