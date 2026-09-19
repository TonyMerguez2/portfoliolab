#!/usr/bin/env bash
#
# Déployer une nouvelle version. À lancer sur le serveur, en tant que `novac`.
#
#   cd /srv/novac/portfoliolab && ./deploiement/mettre-a-jour.sh
#
# ⚠️ **Construire avant de redémarrer, jamais l'inverse.** `npm run start` sert le contenu
# de `.next` : redémarrer sans construire relance l'ancienne version sans rien signaler, et
# on cherche pendant vingt minutes pourquoi le correctif n'est pas là.
#
# ⚠️ **Ne jamais construire dans le dossier que le serveur est en train de lire.** Les deux
# partagent `.next` ; une construction lancée sous un serveur vivant lui retire ses fichiers
# sous les pieds. La parade évidente — l'arrêter le temps de construire — coûtait trois à
# quatre minutes de site mort à chaque déploiement, **pages et appels d'API confondus**
# puisque ces derniers passent par le même serveur. Ce n'est pas théorique : relevé dans le
# journal de Caddy pendant qu'un visiteur s'en servait, avec un enregistrement perdu et un
# écran qui ne disait rien d'utile. On construit donc à côté, serveur vivant, et la bascule
# ne renomme que deux dossiers.
#
# ⚠️ **Les tests du serveur ne tournent pas ici, et c'est délibéré.** La suite du backend
# écrit dans la base que l'unité `novac-api` utilise — il n'y a pas de base d'essai séparée.
# Les lancer sur le serveur reviendrait à faire passer des écritures d'essai sur les données
# réelles. Ils tournent en développement, avant de pousser.

set -euo pipefail
cd "$(dirname "$0")/.."

NEUF=".next-neuf"
PRECEDENT=".next-precedent"

# ⚠️ **Le script sert des deux côtés du `sudo`, et il le faut.** Le dépôt appartient à
# `novac` — git refuse d'y toucher en root, « dubious ownership » — mais `systemctl` demande
# root. Lancé en root comme en novac, chaque commande part donc sous la bonne identité,
# plutôt que de laisser l'opérateur composer à la main une suite qu'il finira par abréger.
PROPRIETAIRE=$(stat -c %U .)
proprio() { if [ "$(id -un)" = "$PROPRIETAIRE" ]; then "$@"; else sudo -u "$PROPRIETAIRE" "$@"; fi; }
service() { if [ "$(id -u)" = 0 ]; then systemctl "$@"; else sudo systemctl "$@"; fi; }

echo "── Récupération ──"
proprio git pull --ff-only

echo "── Dépendances de l'API ──"
proprio backend/venv/bin/pip install -q -r backend/requirements.txt

cd frontend

echo "── Dépendances du frontal ──"
proprio npm ci --silent

echo "── Vérifications ──"
proprio npx tsc --noEmit
proprio npx vitest run

echo "── Construction, serveur vivant ──"
proprio rm -rf "$NEUF"
# ⚠️ Le cache est recopié : sans lui, chaque construction repart de zéro et dure deux fois
#    plus longtemps. Il appartient à une version de Next, d'où le `|| true` — une copie
#    manquée coûte du temps, jamais une construction fausse.
proprio mkdir -p "$NEUF"
proprio cp -a .next/cache "$NEUF/" 2>/dev/null || true
proprio env NOVAC_DIST="$NEUF" npm run build

# ⚠️ **Tout ce qui suit doit rester court : c'est la seule fenêtre où le site est mort.**
# Renommer deux dossiers sur le même système de fichiers est instantané ; y glisser une
# construction, une installation ou un test ramènerait les quatre minutes de coupure.
echo "── Bascule ──"
service stop novac-web
proprio rm -rf "$PRECEDENT"
proprio mv .next "$PRECEDENT"
proprio mv "$NEUF" .next
service start novac-web

echo "── État ──"
service --no-pager --lines=3 status novac-api novac-web
