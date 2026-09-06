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
# ⚠️ **Ne jamais construire pendant que le frontal tourne.** Les deux partagent `.next` ;
# une construction lancée sous un serveur vivant lui retire ses fichiers sous les pieds et
# le site tombe en 500 — constaté en développement. D'où l'arrêt explicite ci-dessous.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "── Récupération ──"
git pull --ff-only

echo "── API ──"
cd backend
./venv/bin/pip install -q -r requirements.txt
./venv/bin/python -m pytest tests/ -q

echo "── Frontal ──"
cd ../frontend
npm ci
npx tsc --noEmit --project tsconfig.json
npx vitest run

sudo systemctl stop novac-web
npm run build
sudo systemctl restart novac-api
sudo systemctl start novac-web

echo "── État ──"
sudo systemctl --no-pager --lines=3 status novac-api novac-web
