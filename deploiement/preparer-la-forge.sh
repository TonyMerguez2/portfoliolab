#!/usr/bin/env bash
#
# Ouvrir la machine à la forge, une fois pour toutes.
#
# À lancer **en root sur le serveur**, la clé publique de la forge sur l'entrée standard :
#
#   ssh root@novac.fyi 'bash -s' < deploiement/preparer-la-forge.sh <<< "$(cat ~/.ssh/novac-forge.pub)"
#
# ⚠️ **La forge entre par `novac`, jamais par root.** Une clé de déploiement finit dans les
# secrets d'une forge ; si elle fuit, elle ne doit ouvrir que ce qu'il faut pour déployer.
# `novac` possède déjà le dépôt et la construction — il ne lui manquait que le droit de
# redémarrer les deux unités, et c'est exactement ce qui lui est donné ici, ligne par ligne.
# Pas `systemctl` en entier : `systemctl edit` suffirait à se donner root.
#
# ⚠️ **Le fichier de sudoers est validé avant d'être posé.** Un `/etc/sudoers.d` invalide
# casse `sudo` pour tout le monde, y compris pour se réparer ; `visudo -c` sur une copie
# temporaire coûte une ligne et évite d'y revenir par la console de secours de l'hébergeur.

set -euo pipefail

CLE=$(cat)
[ -n "$CLE" ] || { echo "Aucune clé publique sur l'entrée standard."; exit 1; }
case "$CLE" in
  ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;;
  *) echo "Ceci ne ressemble pas à une clé publique SSH."; exit 1 ;;
esac

MAISON=$(getent passwd novac | cut -d: -f6)
[ -n "$MAISON" ] || { echo "Pas d'utilisateur novac sur cette machine."; exit 1; }

echo "── La clé de la forge, pour novac ──"
install -d -m 700 -o novac -g novac "$MAISON/.ssh"
touch "$MAISON/.ssh/authorized_keys"
if grep -qxF "$CLE" "$MAISON/.ssh/authorized_keys"; then
  echo "Déjà présente."
else
  printf '%s\n' "$CLE" >> "$MAISON/.ssh/authorized_keys"
  echo "Ajoutée."
fi
chown novac:novac "$MAISON/.ssh/authorized_keys"
chmod 600 "$MAISON/.ssh/authorized_keys"

echo "── Le droit de redémarrer les deux unités, et rien d'autre ──"
BROUILLON=$(mktemp)
cat > "$BROUILLON" <<'REGLE'
# Posé par deploiement/preparer-la-forge.sh — voir l'en-tête pour le pourquoi.
# Deux commandes exactes, pas une de plus : `novac` déploie, il n'administre pas.
novac ALL=(root) NOPASSWD: /usr/bin/systemctl restart novac-api, /usr/bin/systemctl restart novac-web
REGLE
if visudo -c -f "$BROUILLON" >/dev/null; then
  install -m 440 -o root -g root "$BROUILLON" /etc/sudoers.d/novac-deploiement
  rm -f "$BROUILLON"
  echo "Posé dans /etc/sudoers.d/novac-deploiement."
else
  rm -f "$BROUILLON"
  echo "La règle est invalide — rien n'a été posé."
  exit 1
fi

echo "── Vérification ──"
sudo -u novac sudo -n -l | grep -c "systemctl restart novac" | xargs -I{} echo "{} commande(s) autorisée(s) pour novac."
echo "Prêt. Il reste à poser la clé privée dans les secrets de la forge, sous le nom NOVAC_SSH_CLE."
