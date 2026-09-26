#!/usr/bin/env bash
#
# Recevoir une construction faite ailleurs, et basculer dessus.
#
# Lancé par le workflow `deployer.yml` après l'envoi de `.next-neuf`, sous l'identité
# `novac` :
#
#   ./deploiement/recevoir.sh <empreinte du commit construit>
#
# ⚠️ **Rien ne se construit ici — c'est tout l'objet.** Voir l'en-tête du workflow pour le
# pourquoi. `mettre-a-jour.sh` reste à côté pour le jour où il faut déployer sans la forge ;
# il construit sur la machine, avec les dix minutes que ça coûte.
#
# ⚠️ **L'empreinte est vérifiée, pas supposée.** La forge construit un commit précis et la
# machine, elle, tire la tête de la branche : deux poussées rapprochées suffiraient à
# basculer sur un `.next` qui n'est pas celui du code présent. L'écart ne se verrait nulle
# part — ni dans le journal, ni à l'écran — jusqu'à une erreur incompréhensible.

set -euo pipefail
cd "$(dirname "$0")/.."

ATTENDU="${1:-}"
NEUF="frontend/.next-neuf"

[ -f "$NEUF/BUILD_ID" ] || { echo "Pas de construction reçue dans $NEUF."; exit 1; }

echo "── Récupération ──"
# L'empreinte du verrou avant et après : les dépendances ne se réinstallent que si elles ont
# bougé. `npm ci` efface `node_modules` sous un serveur qui tourne — à ne faire que lorsqu'il
# le faut vraiment.
verrou() { md5sum frontend/package-lock.json | cut -d' ' -f1; }
avant=$(verrou)
git pull --ff-only
apres=$(verrou)

if [ -n "$ATTENDU" ]; then
  ici=$(git rev-parse HEAD)
  if [ "$ici" != "$ATTENDU" ]; then
    echo "La construction reçue est celle de $ATTENDU, la machine est sur $ici. Rien n'est basculé."
    exit 1
  fi
fi

echo "── Dépendances de l'API ──"
backend/venv/bin/pip install -q -r backend/requirements.txt

if [ "$avant" != "$apres" ]; then
  echo "── Dépendances du frontal (le verrou a bougé) ──"
  (cd frontend && npm ci --silent)
else
  echo "── Dépendances du frontal : inchangées ──"
fi

echo "── Bascule ──"
cd frontend
rm -rf .next-precedent
[ -d .next ] && mv .next .next-precedent
mv .next-neuf .next
cd ..

# ⚠️ Les deux unités, et dans cet ordre : l'API d'abord, parce que les pages qu'on va servir
# l'interrogent dès leur premier rendu.
sudo systemctl restart novac-api
sudo systemctl restart novac-web

echo "── État ──"
systemctl is-active novac-api novac-web
