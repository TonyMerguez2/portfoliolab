# Mettre Novac en ligne

Une machine, deux processus, un domaine. Ce dossier contient tout ce qui se copie sur le
serveur ; ce fichier est la suite de gestes, dans l'ordre.

> ⚠️ **Ce qui n'est pas fait ici.** Acheter le domaine, ouvrir le compte chez l'hébergeur et
> créer la machine sont des gestes à faire vous-même : ils engagent un paiement et une
> identité. Le reste — configuration, mise en service, vérification — est prêt.

---

## 1. Le domaine, en premier

Achetez `novac.xyz`, puis créez deux enregistrements DNS vers l'adresse IPv4 de la machine :

    A     novac.xyz        <IP de la machine>
    A     www.novac.xyz    <IP de la machine>

Attendez que ça réponde avant de continuer — Caddy demandera le certificat au premier
démarrage, et Let's Encrypt limite les tentatives ratées :

```bash
dig +short novac.xyz
```

## 2. La machine

Un petit VPS suffit : 2 Go de mémoire, 1 vCPU, Debian 12 ou Ubuntu 24.04. Le site est deux
processus et un fichier SQLite ; ce qui consomme, c'est la construction de Next.

⚠️ **2 Go est un plancher, pas un confort.** `npm run build` a besoin de plus d'un gigaoctet
et se fait tuer par le noyau sur une machine à 1 Go. Si l'hébergeur ne propose que cela,
prévoyez un fichier d'échange de 2 Go avant la première construction.

```bash
sudo adduser --system --group --home /srv/novac novac
sudo apt update && sudo apt install -y python3-venv git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo apt install -y caddy    # voir caddyserver.com si le paquet n'est pas dans vos dépôts
```

## 3. Le code

```bash
sudo -u novac git clone <votre dépôt> /srv/novac/portfoliolab
cd /srv/novac/portfoliolab/backend && sudo -u novac python3 -m venv venv
sudo -u novac ./venv/bin/pip install -r requirements.txt
cd ../frontend && sudo -u novac npm ci
```

## 4. Les secrets

```bash
sudo install -d -m 750 -o root -g novac /etc/novac
sudo cp /srv/novac/portfoliolab/deploiement/novac.env.exemple /etc/novac/novac.env
sudo chown root:novac /etc/novac/novac.env && sudo chmod 640 /etc/novac/novac.env
openssl rand -hex 32   # deux fois : une clé de session, un secret de cookie
sudo nano /etc/novac/novac.env
```

Quatre lignes doivent être remplies : `NOVAC_ENV`, `NOVAC_JWT_SECRET`,
`NOVAC_ACCES_MOT_DE_PASSE`, `NOVAC_ACCES_SECRET`.

⚠️ **L'API refuse de démarrer si `NOVAC_JWT_SECRET` manque alors que `NOVAC_ENV=production`.**
C'est voulu : une clé de session oubliée ne produit aucun symptôme — le site marche, il est
seulement ouvert à qui sait forger un jeton. Un démarrage qui échoue se remarque.

⚠️ **La porte de l'alpha, elle, n'a pas de garde équivalente** : `NOVAC_ACCES_MOT_DE_PASSE`
vide veut dire « site public », ce qui est un état légitime le jour de l'ouverture. C'est
donc à vous de le vérifier, une fois — étape 7.

## 5. La première construction

```bash
cd /srv/novac/portfoliolab/frontend && sudo -u novac npm run build
```

## 6. Mise en service

```bash
sudo cp /srv/novac/portfoliolab/deploiement/novac-*.service /etc/systemd/system/
sudo cp /srv/novac/portfoliolab/deploiement/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now novac-api novac-web
sudo systemctl reload caddy
sudo systemctl status novac-api novac-web
```

## 7. Vérifier, depuis chez vous

Trois commandes, et une fenêtre de navigation privée.

```bash
curl -sI https://novac.xyz/portfolio | head -1        # attendu : 307 vers /acces
curl -s  https://novac.xyz/api/v1/portfolios          # attendu : {"detail":"Alpha fermée"}
curl -sI https://novac.xyz/acces      | head -1       # attendu : 200
```

Puis, dans une fenêtre privée : ouvrez `https://novac.xyz`. Vous devez voir la porte, pas le
site. ⚠️ Ne le vérifiez pas dans votre fenêtre habituelle — un cookie d'accès posé pendant
les essais vous ferait entrer et conclure à tort que la porte fonctionne.

Enfin, laissez une adresse dans l'encadré, et relisez-la depuis le serveur :

```bash
cd /srv/novac/portfoliolab/backend && ./venv/bin/python scripts/liste_attente.py
```

## Vivre avec

**Déployer une version** — `./deploiement/mettre-a-jour.sh`, qui construit avant de
redémarrer et joue les tests au passage.

**Lire la liste d'attente** — `scripts/liste_attente.py`, avec `--csv` pour l'exporter.
Aucune route web ne la rend : c'est le seul chemin, à dessein.

**Sauvegarder** — deux choses portent tout ce qui n'est pas reconstructible :

```bash
backend/portfoliolab.db     # comptes, portefeuilles, transactions, liste d'attente
backend/uploads/            # images de portefeuille
```

⚠️ **Copiez la base avec `sqlite3 … ".backup"` et non `cp`** : un `cp` pendant une écriture
donne un fichier corrompu qui se restaure sans erreur et perd des lignes.

```bash
sqlite3 backend/portfoliolab.db ".backup /var/backups/novac-$(date +%F).db"
```

## Ce qui reste à surveiller

**Le débit des cours.** Les données viennent de yfinance, qui étrangle les adresses de
centres de données bien plus vite que celle de chez vous — c'est arrivé pendant les tests,
462 titres refusés d'un coup. Attendez-vous à des courbes vides aux premières heures. Si
cela gêne, la réponse est un fournisseur avec une clé, pas un contournement.

**La base est un fichier.** SQLite tient sans peine la charge d'une alpha à quelques
dizaines de personnes. Ce qu'elle ne tient pas, c'est plusieurs processus qui écrivent — d'où
un seul travailleur uvicorn. Changer de base vient avant d'augmenter ce chiffre.

**Deux panneaux sans porte.** Le profil de risque et les frais des fonds n'ont plus d'entrée
dans l'interface. Ils pondèrent le score et pèsent la moitié du pilier Construction : un
testeur verra deux piliers « hors calcul » sans pouvoir y remédier. À rebrancher avant
d'inviter du monde.
