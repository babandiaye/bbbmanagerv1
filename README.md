# BBB Smart Manager

Application web de gestion centralisee des serveurs BigBlueButton (BBB 3.0).
Permet de synchroniser, visualiser, publier et administrer les enregistrements de plusieurs serveurs BBB depuis une interface unique.

## Fonctionnalites

- **Multi-serveurs** : ajout et gestion de plusieurs serveurs BBB avec test de connectivite automatique
- **Synchronisation** : recuperation de tous les enregistrements (published, unpublished, processed, processing) via l'API BBB avec pagination native (offset/limit)
- **Publication** : publication des enregistrements en etat `processed` ou `unpublished` dont la duree depasse 10 minutes
- **Dashboard** : statistiques en temps reel (taux de publication, enregistrements publiables, jobs en cours)
- **Gestion des utilisateurs** : authentification SSO Keycloak, roles admin/auditeur, activation/desactivation des comptes
- **Securite** : chiffrement AES-256-GCM des secrets BBB, middleware d'authentification, RBAC
- **Pagination** : affichage des enregistrements par pages de 50

## Stack technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Framework | Next.js (App Router) | 16.2.4 |
| Runtime | Node.js | >= 20.x |
| Gestionnaire de paquets | pnpm | >= 10.x |
| Langage | TypeScript | 5.x |
| Base de donnees | PostgreSQL | 14+ |
| ORM | Prisma (avec adapter pg) | 7.7 |
| Authentification | NextAuth + Keycloak (OIDC) | 5.0-beta |
| Frontend | React 19 + Tailwind CSS 4 | - |
| API BBB | Checksum SHA-256 + XML (xml2js) | BBB 3.0 |
| Chiffrement | AES-256-GCM (Node.js crypto) | - |
| Icones | Heroicons | 2.x |

## Prerequis

### Systeme

- **OS** : Ubuntu 22.04+ / Debian 12+
- **Node.js** >= 20.x
- **pnpm** >= 10.x (`npm install -g pnpm`)
- **PostgreSQL** >= 14

### Services externes

- **Serveur(s) BigBlueButton 3.0** avec acces a l'API (URL + shared secret)
- **Keycloak** configure avec :
  - Un realm contenant les utilisateurs
  - Un client OIDC (type confidential) avec `client_id` et `client_secret`
  - Un attribut `direction` dans le profil utilisateur (utilise pour filtrer l'acces)

## Installation

### 1. Cloner le projet

```bash
cd /var/www/html
git clone <url-du-repo> bbbmanager
cd bbbmanager
```

### 2. Installer les dependances

```bash
pnpm install
```

### 3. Configurer les variables d'environnement

Copier le fichier d'exemple et l'adapter :

```bash
cp .env.example .env
```

Variables requises :

```env
# App
NODE_ENV=production
PORT=3456

# NextAuth
NEXTAUTH_URL=https://votre-domaine.example.com
AUTH_URL=https://votre-domaine.example.com
AUTH_TRUST_HOST=true
AUTH_SECRET=                # Generer avec : openssl rand -base64 32

# PostgreSQL
DATABASE_URL="postgresql://user:password@127.0.0.1:5432/bbb_manager"

# Keycloak OIDC
KEYCLOAK_ISSUER=https://keycloak.example.com/realms/VOTRE_REALM
KEYCLOAK_CLIENT_ID=votre-client-id
KEYCLOAK_CLIENT_SECRET=votre-client-secret
ALLOWED_DIRECTION=DITSI     # Direction autorisee a acceder a l'application

# Chiffrement des secrets BBB (AES-256)
ENCRYPTION_KEY=             # Generer avec : openssl rand -hex 32
```

### 4. Initialiser la base de donnees

```bash
# Creer la base de donnees
sudo -u postgres createdb bbb_manager

# Appliquer les migrations Prisma
pnpm prisma migrate deploy

# Generer le client Prisma
pnpm prisma generate
```

### 5. Build de production

```bash
pnpm build
```

### 6. Tester le lancement

```bash
pnpm start
# L'application demarre sur http://localhost:3456
```

## Deploiement en production (systemd)

### 1. Creer le service systemd

```bash
sudo tee /etc/systemd/system/bbbmanager.service > /dev/null << 'EOF'
[Unit]
Description=BBB Smart Manager
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/var/www/html/bbbmanager
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=3
Environment="NODE_ENV=production"
LimitNOFILE=50000
StandardOutput=append:/var/log/bbbmanager_output.log
StandardError=append:/var/log/bbbmanager_error.log

[Install]
WantedBy=multi-user.target
EOF
```

### 2. Activer et demarrer le service

```bash
sudo systemctl daemon-reload
sudo systemctl enable bbbmanager
sudo systemctl start bbbmanager
```

### 3. Verifier le statut

```bash
sudo systemctl status bbbmanager
curl http://localhost:3456/api/health
# Reponse attendue : {"status":"ok","db":"connected"}
```

### 4. Configurer le reverse proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name bbbsmartmanager.example.com;

    ssl_certificate     /etc/letsencrypt/live/bbbsmartmanager.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bbbsmartmanager.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Structure du projet

```
bbbmanager/
├── prisma/
│   ├── schema.prisma          # Schema de la base de donnees (4 modeles)
│   └── migrations/            # Historique des migrations
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/  # Authentification NextAuth/Keycloak
│   │   │   ├── health/              # Endpoint de monitoring
│   │   │   ├── rebuild/             # Publication d'enregistrements
│   │   │   ├── recordings/          # Liste + synchronisation
│   │   │   ├── servers/             # CRUD serveurs BBB
│   │   │   ├── stats/               # Statistiques dashboard
│   │   │   └── users/               # Gestion des utilisateurs
│   │   ├── (dashboard)/             # Pages protegees (dashboard, recordings, servers, users)
│   │   └── login/                   # Page de connexion
│   ├── components/
│   │   ├── Footer.tsx               # Footer UN-CHK
│   │   ├── RebuildButton.tsx        # Bouton de publication (client component)
│   │   ├── Sidebar.tsx              # Navigation laterale
│   │   └── SyncButton.tsx           # Bouton de synchronisation (client component)
│   ├── lib/
│   │   ├── auth.ts                  # Configuration NextAuth + Keycloak
│   │   ├── bbb.ts                   # Client API BigBlueButton
│   │   ├── constants.ts             # Constantes (duree min, etats, pagination)
│   │   ├── crypto.ts                # Chiffrement AES-256-GCM
│   │   └── prisma.ts                # Instance Prisma (singleton)
│   ├── middleware.ts                # Protection des routes + verification isActive
│   └── types/                       # Types TypeScript (session NextAuth)
├── .env                             # Variables d'environnement (NE PAS COMMITTER)
├── next.config.ts                   # Configuration Next.js
├── package.json
└── pnpm-lock.yaml
```

## Schema de la base de donnees

4 tables principales :

- **users** : utilisateurs synchronises depuis Keycloak (kcSub, role, isActive)
- **bbb_servers** : serveurs BBB enregistres (URL, secret chiffre)
- **recordings** : enregistrements synchronises (recordId, state, durationSec, published)
- **rebuild_jobs** : historique des jobs de publication (status, user, timestamps)

## Etats des enregistrements BBB

| Etat | Description | Action possible |
|------|-------------|-----------------|
| `processing` | BBB traite la video | Attendre |
| `processed` | Traite, pret a publier | **Publier** (si duree >= 10 min) |
| `published` | Publie et accessible | Depublier |
| `unpublished` | Retire de la lecture | **Re-publier** (si duree >= 10 min) |
| `deleted` | Supprime du serveur | Aucune |

## API endpoints

| Methode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/health` | Non | Verification de sante (DB) |
| GET | `/api/recordings?page=1&filter=rebuildable` | Oui | Liste paginee des enregistrements |
| POST | `/api/recordings/sync` | Oui | Synchronise depuis tous les serveurs BBB actifs |
| POST | `/api/rebuild` | Admin | Publie un enregistrement (processed/unpublished) |
| GET | `/api/servers` | Oui | Liste des serveurs (sans secrets) |
| POST | `/api/servers` | Admin | Ajoute un serveur BBB (avec test de connexion) |
| PUT | `/api/servers/:id` | Admin | Modifie un serveur |
| DELETE | `/api/servers/:id` | Admin | Supprime un serveur |
| GET | `/api/users` | Admin | Liste des utilisateurs |
| PATCH | `/api/users/:id` | Admin | Modifie role/statut d'un utilisateur |
| GET | `/api/stats` | Oui | Statistiques du dashboard |

## Roles

- **admin** : acces complet (gestion serveurs, utilisateurs, publication)
- **auditeur** : consultation seule (dashboard, enregistrements, statistiques)

Le premier utilisateur est cree avec le role `auditeur`. Un admin existant doit le promouvoir depuis la page Utilisateurs.

## Commandes utiles

```bash
# Logs
sudo tail -f /var/log/bbbmanager_output.log
sudo tail -f /var/log/bbbmanager_error.log

# Redemarrage
sudo systemctl restart bbbmanager

# Mise a jour
cd /var/www/html/bbbmanager
git pull
pnpm install
pnpm prisma migrate deploy
pnpm build
sudo systemctl restart bbbmanager

# Sante
curl http://localhost:3456/api/health
```

## Securite

- Les secrets des serveurs BBB sont chiffres en AES-256-GCM avant stockage en base
- L'authentification passe par Keycloak (OIDC) — aucun mot de passe stocke localement
- Le middleware verifie l'authentification et le statut actif du compte a chaque requete
- Les routes API verifient le role (admin/auditeur) pour les operations sensibles
- Prisma protege contre les injections SQL (requetes parametrees)
- Le fichier `.env` contient les secrets et ne doit **jamais** etre committe

---

DITSI - Universite Numerique Cheikh Hamidou Kane (UN-CHK) - 2026
