# BBB Smart Manager

Plateforme web de gestion centralisee des serveurs BigBlueButton (BBB 3.0) pour l'Universite Numerique Cheikh Hamidou Kane (UN-CHK).

BBB Manager permet d'administrer un cluster BBB et ses plateformes Moodle associees depuis une interface unique : synchronisation des enregistrements, publication automatisee (unitaire ou en masse via CSV), diagnostic multi-serveurs et integration Moodle Web Services.

## Fonctionnalites

### Gestion des serveurs BBB

- **Multi-serveurs** : CRUD complet avec test de connectivite automatique a l'ajout
- **Synchronisation** : recuperation de tous les etats BBB (`processing`, `processed`, `published`, `unpublished`, `deleted`) via `getRecordings?state=any` avec pagination native BBB (offset/limit)
- **Cron auto-sync** (toutes les heures) avec lock Redis distribue
- **Suppression en cascade** : supprimer un serveur supprime aussi ses enregistrements et jobs associes en base (sans toucher au serveur BBB reel)

### Gestion des enregistrements

- **Publication unitaire** : publier un enregistrement `processed` ou `unpublished` via l'API BBB `publishRecordings`
- **Publication en masse** : import CSV/TXT de record IDs avec mapping automatique au bon serveur BBB (max 200 par lot)
- **Page de details** : metadonnees completes (identifiants, contexte pedagogique Moodle, participants, duree, taille, playback URL, historique des publications)
- **Filtres combines** : par statut, serveur, plage de dates, recherche texte sur nom/recordID/meetingID
- **Pagination** : 50 enregistrements par page, cote serveur

### Integration Moodle

- **Multi-plateformes Moodle** : CRUD avec test de connexion via `core_webservice_get_site_info`
- **Web Services REST** : client generique typesafe avec gestion automatique des erreurs Moodle
- **Tracabilite** : stockage du nom du service, de l'utilisateur WS et du nom du site pour retrouver la config cote Moodle
- **Re-validation automatique** a chaque changement de token

### Authentification et roles

- **SSO Keycloak** (OIDC) avec deconnexion complete via `end_session_endpoint`
- **Filtre par direction** (ex: DITSI) : seuls les utilisateurs de la direction autorisee peuvent se connecter
- **Roles admin / auditeur** avec masquage des actions sensibles dans l'UI
- **Middleware** : verification `isActive` a chaque requete + check redondant cote API (defense en profondeur)

### Dashboard

- **Filtre par serveur BBB** avec recalcul dynamique des statistiques
- **Repartition par etat BBB** (cartes colorees : processing, processed, published, unpublished, deleted)
- **Statistiques des jobs** (pending, running, done, failed)
- **Taux de publication** et indicateurs metier
- **Bandeau d'alerte** en cas d'echec de la derniere sync auto

### Securite

- Chiffrement **AES-256-GCM** des secrets BBB et tokens Moodle
- **Rate limiting** via Redis sur les endpoints sensibles (sync, rebuild, publication en masse)
- **Logs structures Pino** avec redaction automatique des secrets
- Validation du format de `ENCRYPTION_KEY` au demarrage (fail fast)
- Protection CSRF native NextAuth

## Stack technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Framework | Next.js (App Router) | 16.2.4 |
| Runtime | Node.js | >= 20.x |
| Gestionnaire de paquets | pnpm | >= 10.x |
| Langage | TypeScript | 5.x |
| Base de donnees | PostgreSQL | 14+ (16 recommande) |
| ORM | Prisma (avec adapter pg) | 7.7 |
| Cache / Rate limit / Cron lock | Redis (ioredis) | 6+ |
| Authentification | NextAuth + Keycloak (OIDC) | 5.0-beta |
| Frontend | React 19 + Tailwind CSS 4 | - |
| API BBB | Checksum SHA-256 + XML (xml2js) | BBB 3.0 |
| API Moodle | REST JSON (Web Services) | Moodle 4.0+ |
| Chiffrement | AES-256-GCM (Node.js crypto) | - |
| Logs | Pino + pino-pretty (dev) | 9.x |
| Cron | node-cron | 4.x |
| Icones | Heroicons | 2.x |

## Prerequis

### Systeme

- OS : Ubuntu 22.04+ / Debian 12+
- Node.js >= 20.x
- pnpm >= 10.x (`npm install -g pnpm`)
- PostgreSQL >= 14
- Redis >= 6 (rate limiting + lock cron)

### Services externes

- **Serveur(s) BigBlueButton 3.0** avec acces a l'API (URL + shared secret)
- **Keycloak** configure avec :
  - Un realm contenant les utilisateurs
  - Un client OIDC (type confidential) avec `client_id` et `client_secret`
  - Un attribut `direction` dans le profil utilisateur (utilise pour filtrer l'acces)
- **Plateforme(s) Moodle 4.0+** (optionnel) avec :
  - Web Services actives (REST protocol)
  - Un service externe contenant au minimum :
    - `core_webservice_get_site_info`
    - `core_course_get_courses_by_field`
    - `mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses`
  - Un utilisateur technique avec les permissions necessaires et un token

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

# NextAuth / SSO
NEXTAUTH_URL=https://votre-domaine.example.com
AUTH_URL=https://votre-domaine.example.com
AUTH_TRUST_HOST=true
AUTH_SECRET=                # openssl rand -base64 32

# PostgreSQL
DATABASE_URL="postgresql://user:password@127.0.0.1:5432/bbb_manager"

# Redis (rate limiting + lock cron)
REDIS_URL=redis://:password@127.0.0.1:6379/1

# Keycloak OIDC
KEYCLOAK_ISSUER=https://keycloak.example.com/realms/VOTRE_REALM
KEYCLOAK_CLIENT_ID=votre-client-id
KEYCLOAK_CLIENT_SECRET=votre-client-secret
ALLOWED_DIRECTION=DITSI

# Cron auto-sync (toutes les heures pleines)
SYNC_AUTO_ENABLED=true

# Chiffrement des secrets BBB et tokens Moodle (AES-256)
ENCRYPTION_KEY=             # openssl rand -hex 32
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

## Configuration Keycloak

1. **Site administration → Realms** : creer ou selectionner le realm (ex: `UNCHK`)
2. **Clients → Create client** :
   - Type : `OpenID Connect`
   - Client type : `confidential`
   - Valid redirect URIs : `https://votre-domaine.example.com/*`
   - Client authentication : `On`
3. **Credentials** : copier le `Client Secret` et le mettre dans `.env` comme `KEYCLOAK_CLIENT_SECRET`
4. **Users** : verifier que l'attribut `direction` est renseigne pour chaque utilisateur autorise

## Configuration Moodle (optionnel)

Pour chaque plateforme Moodle a integrer :

1. **Site administration → Advanced features** : cocher "Enable web services"
2. **Plugins → Web services → Manage protocols** : activer "REST protocol"
3. **Users → Accounts → Add new user** : creer un utilisateur technique (ex: `admin-bbbmanager`)
4. **Users → Permissions → Assign system roles** : lui attribuer un role suffisant (Manager recommande pour commencer)
5. **Web services → External services → Add** : creer un service custom (ex: `BBBManagerDISIDEV`)
6. **Functions** sur ce service : ajouter au minimum :
   - `core_webservice_get_site_info`
   - `core_course_get_courses_by_field`
   - `mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses`
7. **Web services → Manage tokens → Create token** : generer un token pour l'utilisateur technique sur ce service
8. Dans BBB Manager, ouvrir **Plateformes Moodle → Ajouter une plateforme** et renseigner :
   - Nom court (ex: `DISIDEV`)
   - URL de base (ex: `https://moodle.example.com`) sans `/webservice/rest/server.php`
   - Token genere
   - Nom du service (optionnel, pour tracabilite)

## Structure du projet

```
bbbmanager/
├── prisma/
│   ├── schema.prisma          # 5 modeles (User, BbbServer, MoodlePlatform, Recording, RebuildJob)
│   └── migrations/            # Historique des migrations
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/ # Authentification NextAuth/Keycloak
│   │   │   ├── health/             # Endpoint de monitoring
│   │   │   ├── me/                 # Session utilisateur courante
│   │   │   ├── public-stats/       # Stats anonymes pour la page login
│   │   │   ├── rebuild/            # Publication d'un enregistrement
│   │   │   ├── rebuild-batch/      # Publication en masse via CSV
│   │   │   ├── recordings/         # Liste + detail + synchronisation
│   │   │   ├── servers/            # CRUD serveurs BBB
│   │   │   ├── moodle-platforms/   # CRUD plateformes Moodle
│   │   │   ├── stats/              # Statistiques dashboard (filtrables par serveur)
│   │   │   ├── sync-status/        # Statut de la derniere sync auto
│   │   │   └── users/              # Gestion des utilisateurs (admin)
│   │   ├── (dashboard)/            # Pages protegees (layout commun)
│   │   │   ├── page.tsx            # Dashboard
│   │   │   ├── recordings/         # Liste + detail enregistrement
│   │   │   ├── rebuild/            # Publication en masse (admin)
│   │   │   ├── servers/            # Serveurs BBB
│   │   │   ├── moodle-platforms/   # Plateformes Moodle
│   │   │   └── users/              # Utilisateurs (admin)
│   │   └── login/                  # Page de connexion
│   ├── components/
│   │   ├── DashboardClient.tsx     # Dashboard (filtre serveur + stats par etat)
│   │   ├── Footer.tsx              # Footer UN-CHK
│   │   ├── LoginClient.tsx         # Page login (design split)
│   │   ├── RebuildButton.tsx       # Bouton publication (admin)
│   │   ├── Sidebar.tsx             # Navigation avec masquage admin-only
│   │   ├── SyncButton.tsx          # Bouton synchronisation manuelle
│   │   └── SyncStatusBanner.tsx    # Bandeau d'alerte si sync auto echouee
│   ├── hooks/
│   │   └── useCurrentUser.ts       # Hook client pour acceder au role
│   ├── lib/
│   │   ├── api-helpers.ts          # requireAuth + rateLimit (Redis)
│   │   ├── auth.ts                 # Configuration NextAuth + deconnexion Keycloak
│   │   ├── bbb.ts                  # Client API BigBlueButton (checksum SHA-256)
│   │   ├── constants.ts            # Constantes centralisees (etats, pagination)
│   │   ├── cron.ts                 # Scheduler auto-sync avec lock Redis
│   │   ├── crypto.ts               # Chiffrement AES-256-GCM + validation au demarrage
│   │   ├── logger.ts               # Pino (JSON en prod, colore en dev)
│   │   ├── moodle.ts               # Client REST Moodle Web Services
│   │   ├── prisma.ts               # Instance Prisma (singleton + adapter pg)
│   │   ├── redis.ts                # Client Redis (singleton, degradation gracieuse)
│   │   └── sync.ts                 # Fonction de sync factorisee (manuelle + cron)
│   ├── instrumentation.ts          # Hook Next.js : demarrage du cron au boot
│   ├── middleware.ts               # Protection routes + check isActive
│   └── types/                      # Types TypeScript (session NextAuth)
├── .env                            # Variables d'env (NE PAS COMMITTER)
├── .env.example                    # Template avec instructions
├── next.config.ts                  # Config Next.js + serverExternalPackages
├── package.json
└── pnpm-lock.yaml
```

## Schema de la base de donnees

5 tables principales :

| Table | Description |
|-------|-------------|
| `users` | Utilisateurs synchronises depuis Keycloak (kcSub, role, isActive) |
| `bbb_servers` | Serveurs BBB enregistres (URL, secret chiffre, optionnel SSH) |
| `moodle_platforms` | Plateformes Moodle (URL, token chiffre, nom du service, utilisateur WS) |
| `recordings` | Enregistrements synchronises (recordId, state, durationSec, published, rawData) |
| `rebuild_jobs` | Historique des jobs de publication (status, user, timestamps, errorMsg) |

**Relations** avec `onDelete: Cascade` :
- `Recording → BbbServer` : supprimer un serveur supprime ses recordings
- `RebuildJob → Recording` et `RebuildJob → BbbServer` : supprimer un serveur ou un enregistrement supprime les jobs associes

**Indexes optimises** :
- `recordings(start_time)` pour les filtres de date
- `recordings(server_id, state)` pour les filtres combines
- `rebuild_jobs(recording_id, status)` pour l'historique detail enregistrement

## Etats des enregistrements BBB

| Etat | Description | Action possible |
|------|-------------|-----------------|
| `processing` | BBB traite la video | Attendre |
| `processed` | Traite, pret a publier | **Publier** (si duree >= 10 min) |
| `published` | Publie et accessible | Depublier |
| `unpublished` | Retire de la lecture | **Re-publier** (si duree >= 10 min) |
| `deleted` | Supprime du serveur | Aucune |

## API endpoints

| Methode | Route | Role | Description |
|---------|-------|------|-------------|
| GET | `/api/health` | - | Verification de sante (DB) |
| GET | `/api/public-stats` | - | Stats anonymes pour la page login (rate limit 20/min/IP) |
| GET | `/api/me` | auth | Infos de la session courante |
| GET | `/api/sync-status` | auth | Statut de la derniere sync auto |
| GET | `/api/stats?serverId=` | auth | Stats dashboard, filtrables par serveur |
| GET | `/api/recordings?page=&filter=&serverId=&dateFrom=&dateTo=&search=` | auth | Liste paginee + filtres |
| GET | `/api/recordings/:id` | auth | Detail d'un enregistrement (metadata + historique jobs) |
| POST | `/api/recordings/sync` | admin | Synchronisation manuelle (rate limit 5/min/user) |
| POST | `/api/rebuild` | admin | Publie un enregistrement (rate limit 30/min/admin) |
| POST | `/api/rebuild-batch` | admin | Publie jusqu'a 200 record IDs (rate limit 3/min/admin) |
| GET | `/api/servers` | auth | Liste des serveurs BBB (sans secrets) |
| POST | `/api/servers` | admin | Ajoute un serveur BBB (avec test de connexion) |
| PUT | `/api/servers/:id` | admin | Modifie un serveur |
| DELETE | `/api/servers/:id` | admin | Supprime un serveur et ses recordings en cascade |
| GET | `/api/moodle-platforms` | auth | Liste des plateformes Moodle |
| POST | `/api/moodle-platforms` | admin | Ajoute une plateforme (avec test via getSiteInfo) |
| PUT | `/api/moodle-platforms/:id` | admin | Modifie une plateforme |
| DELETE | `/api/moodle-platforms/:id` | admin | Supprime une plateforme |
| GET | `/api/users` | admin | Liste des utilisateurs |
| PATCH | `/api/users/:id` | admin | Modifie role/statut d'un utilisateur |

## Roles et permissions

- **admin** : acces complet — gestion serveurs BBB, plateformes Moodle, utilisateurs, publication (unitaire et en masse)
- **auditeur** : consultation seule — dashboard, liste des serveurs et plateformes (sans modification), liste et detail des enregistrements, statistiques

Le premier utilisateur est cree avec le role `auditeur`. Un admin existant doit le promouvoir depuis la page Utilisateurs.

Les auditeurs voient une version lecture seule de l'interface : les boutons d'ajout, modification, suppression et publication sont masques. Les pages admin-only (`/rebuild`, `/users`) sont inaccessibles et affichent "Acces refuse" si forcees via URL.

## Synchronisation automatique

Le cron `node-cron` s'execute **toutes les heures pleines** (timezone `Africa/Dakar`) et :

1. Tente de prendre un lock Redis distribue (`SETNX` avec TTL 10 min)
2. Si le lock est pris par une autre sync (manuelle ou cron d'une autre instance), skip
3. Appelle la meme fonction `syncAllServers('cron')` que le bouton manuel
4. Persiste le resultat en Redis (TTL 7 jours) pour affichage dans l'UI
5. Libere le lock

En cas d'echec, un **bandeau rouge** apparait automatiquement en haut de toutes les pages du dashboard avec le detail des serveurs en erreur. Le bandeau est masquable par l'utilisateur jusqu'au prochain echec different.

Desactivable via `SYNC_AUTO_ENABLED=false`.

## Commandes utiles

```bash
# Logs (JSON structure en prod)
sudo tail -f /var/log/bbbmanager_output.log
sudo tail -f /var/log/bbbmanager_error.log

# Filtrer les logs d'une operation particuliere
sudo tail -f /var/log/bbbmanager_output.log | grep -i "sync\|cron"

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

# Inspecter Redis (lock cron, rate limits, sync status)
redis-cli -u "$REDIS_URL" keys 'bbbmanager:*'
redis-cli -u "$REDIS_URL" get bbbmanager:sync:last-auto-result | jq .
```

## Securite

- **Chiffrement** : les secrets des serveurs BBB et les tokens Moodle sont chiffres en AES-256-GCM avant stockage
- **Validation au demarrage** : l'application refuse de demarrer si `ENCRYPTION_KEY` est absente ou mal formee
- **Authentification** : SSO Keycloak — aucun mot de passe stocke localement
- **Middleware** : verifie l'authentification et le statut actif du compte a chaque requete
- **Defense en profondeur** : chaque route API revalide le role et `isActive` (helper `requireAuth`)
- **Rate limiting** : via Redis sur les endpoints sensibles
- **Logs structures** : Pino avec redaction automatique des champs sensibles (cookies, passwords, secrets, tokens)
- **Deconnexion complete** : la deconnexion invalide aussi la session cote Keycloak via `end_session_endpoint`
- **Prisma** : protection contre les injections SQL (requetes parametrees)
- **RBAC** : masquage cote UI + verification cote API pour toutes les actions sensibles
- **Le fichier `.env`** : contient les secrets et ne doit **jamais** etre committe

## Licence et credits

DITSI - Universite Numerique Cheikh Hamidou Kane (UN-CHK) - 2026
