# BBB Smart Manager

Plateforme web de gestion centralisee des serveurs BigBlueButton (BBB 3.0) pour l'Universite Numerique Cheikh Hamidou Kane (UN-CHK).

BBB Manager permet d'administrer un cluster BBB et ses plateformes Moodle associees depuis une interface unique : synchronisation des enregistrements, publication automatisee (unitaire ou en masse via CSV), diagnostic multi-sources et detection automatique des sessions orphelines a rebuilder.

## Fonctionnalites

### Gestion des serveurs BBB

- **Multi-serveurs** : CRUD complet avec test de connectivite automatique a l'ajout
- **Synchronisation** : recuperation de tous les etats BBB (`processing`, `processed`, `published`, `unpublished`, `deleted`) via `getRecordings?state=any` avec pagination native BBB (offset/limit)
- **Cron auto-sync** (toutes les heures) avec lock Redis distribue
- **Suppression en cascade** : supprimer un serveur supprime aussi ses enregistrements et jobs associes en base (sans toucher au serveur BBB reel)
- **Index raw via Nginx** : chaque serveur peut exposer `/var/bigbluebutton/recording/raw/` via un alias Nginx avec autoindex JSON, protege par Basic Auth, pour permettre la lecture des `events.xml` (cf. **Scan raw**)

### Gestion des enregistrements

- **Publication unitaire** : publier un enregistrement `processed` ou `unpublished` via l'API BBB `publishRecordings` (duree minimum 15 min)
- **Publication en masse** : import CSV/TXT de record IDs avec mapping automatique au bon serveur BBB (max 200 par lot)
- **Page de details** : metadonnees completes (identifiants, contexte pedagogique Moodle, participants, duree, taille, playback URL, historique des publications)
- **Filtres combines** : par statut, serveur, plage de dates, recherche texte sur nom/recordID/meetingID
- **Pagination** : 50 enregistrements par page, cote serveur

### Diagnostic et detection des sessions a rebuilder

3 outils complementaires :

1. **Recherche cours** (`/moodle-search`) : a partir d'un `cmid` Moodle ou d'un `recordId` BBB, croise 3 sources (API Moodle, base BBB Manager, autoindex raw) et affiche pour chaque enregistrement son etat sur Moodle, BBB et raw, avec un verdict **Publie** ou **Rebuildable**.

2. **Diagnostic CSV** (`/diagnose`) : colle ou importe une liste de `recordId` (ex: extrait de `mdl_bigbluebuttonbn_recordings`). Pour chaque ID, le systeme cascade 4 strategies (`db` → `bbb_api` → `raw` → `inferred SHA1`) et identifie le serveur d'origine + l'etat. Generation automatique des commandes `sudo bbb-record --rebuild`, groupees par serveur et copiables en un clic.

3. **Orphelins rebuildables** (Dashboard) : carte temps reel qui agrege les recordings detectes en raw, validant les criteres (>= 15 min ET >= 2 participants) et **non publies** en base. Liste paginee avec tri par date/duree, filtre periode (7j/30j/60j/Tout) et plateforme Moodle d'origine. Bouton de copie en masse des commandes par serveur.

### Scan raw automatique

- **Cron toutes les 4 heures** (`15 */4 * * *`, timezone `Africa/Dakar`) avec lock Redis distinct
- **Fenetre de scan configurable** (`RAW_SCAN_WINDOW_DAYS = 70` par defaut) : ne fetche events.xml que pour les dossiers dont le `mtime` est dans la fenetre, pour respecter la politique de cleanup BBB (typiquement 30-60j)
- **Concurrence bornee** (`RAW_SCAN_CONCURRENCY = 20`) pour ne pas saturer les serveurs Nginx
- **Scan incremental** : ne refetch que les dossiers nouveaux ou dont le `mtime` a change
- **Auto-purge** : les `RawDiscovery` dont le dossier raw a disparu sont automatiquement supprimes (replique le cleanup BBB cote application)
- **Cross-check `published_in_db`** : a chaque scan, mise a jour du flag pour reflechir l'etat actuel de la base
- **Resultat persiste en Redis** (TTL 7 jours) pour affichage du dernier scan dans l'UI
- **Declenchement manuel** par un admin via le bouton **Scanner** sur la carte du dashboard

### Integration Moodle

- **Multi-plateformes Moodle** : CRUD avec test de connexion via `core_webservice_get_site_info`
- **Web Services REST** : client generique typesafe avec gestion automatique des erreurs Moodle
- **Tracabilite** : stockage du nom du service, de l'utilisateur WS et du nom du site pour retrouver la config cote Moodle
- **`bbb-origin-server-name`** : champ par plateforme permettant de filtrer les recordings d'une activite par plateforme Moodle (evite les fuites cross-plateforme entre Moodles partagant le meme cluster BBB)
- **Re-validation automatique** a chaque changement de token

### Authentification et roles

- **SSO Keycloak** (OIDC) avec deconnexion complete via `end_session_endpoint`
- **Filtre par direction** (ex: `DITSI`) : seuls les utilisateurs de la direction autorisee peuvent se connecter
- **Roles admin / auditeur** avec masquage des actions sensibles dans l'UI + verification cote API
- **Middleware** : verification authentification + statut actif a chaque requete

### Dashboard

- **Carte « Orphelins rebuildables »** (en tete) : compteur global, liste plate triable par date/duree, filtre periode + plateforme, copie en masse par serveur, bouton scan manuel pour les admins
- **Filtre par serveur BBB** avec recalcul dynamique des statistiques
- **Repartition par etat BBB** (cartes colorees : processing, processed, published, unpublished, deleted)
- **Statistiques des jobs** (pending, running, done, failed)
- **Taux de publication** et indicateurs metier
- **Bandeau d'alerte** en cas d'echec de la derniere sync auto

### Securite

- Chiffrement **AES-256-GCM** des secrets BBB, tokens Moodle, et credentials Basic Auth de l'index raw Nginx
- **Rate limiting** via Redis sur les endpoints sensibles (sync, rebuild, publication en masse, scan manuel)
- **Logs structures Pino** avec redaction automatique des secrets
- Validation du format de `ENCRYPTION_KEY` au demarrage (fail fast)
- Validation stricte des inputs (regex par type) cote serveur ET client
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
| API Moodle | REST JSON Web Services | Moodle 4.0+ |
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

- **Serveur(s) BigBlueButton 3.0** avec :
  - Acces a l'API (URL + shared secret)
  - **Optionnel mais fortement recommande** : un alias Nginx exposant `/var/bigbluebutton/recording/raw/` en autoindex JSON, protege par Basic Auth (cf. section **Configuration Nginx du raw**)
- **Keycloak** configure avec :
  - Un realm contenant les utilisateurs
  - Un client OIDC (type confidential) avec `client_id` et `client_secret`
  - Un attribut `direction` dans le profil utilisateur (utilise pour filtrer l'acces)
- **Plateforme(s) Moodle 4.0+** (optionnel pour le diagnostic croise) avec :
  - Web Services actives + REST protocol
  - Un service externe contenant au minimum :
    - `core_webservice_get_site_info`
    - `core_course_get_courses_by_field`
    - `core_course_get_course_module`
    - `mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses`
    - `mod_bigbluebuttonbn_get_recordings`
  - Un utilisateur technique (ex: `admin-bbbmanager`) avec les permissions necessaires
  - Un token genere pour cet utilisateur sur ce service

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

# Crons (sync horaire + scan raw 4h)
SYNC_AUTO_ENABLED=true

# Chiffrement (AES-256)
ENCRYPTION_KEY=             # openssl rand -hex 32
```

### 4. Initialiser la base de donnees

```bash
sudo -u postgres createdb bbb_manager
pnpm prisma migrate deploy
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

## Configuration Nginx du raw

Pour activer le scan raw et le diagnostic via `events.xml`, exposer le repertoire raw de chaque serveur BBB via Nginx :

```nginx
location /bbbmanager/ {
    alias /var/bigbluebutton/recording/raw/;
    autoindex on;
    autoindex_format json;
    autoindex_localtime on;
    auth_basic "BBB Manager";
    auth_basic_user_file /etc/nginx/htpasswd-bbbmanager;
}
```

Generer le `htpasswd` :

```bash
sudo htpasswd -c /etc/nginx/htpasswd-bbbmanager bbbmanager
sudo nginx -t && sudo systemctl reload nginx
```

Dans BBB Manager, ouvrir **Serveurs BBB → Modifier** et renseigner :
- `rawIndexUrl` : `https://serveur-bbb.example.com/bbbmanager/`
- `rawIndexUser` + `rawIndexPassword` : credentials Basic Auth

## Deploiement en production (systemd)

```bash
sudo systemctl enable bbbmanager
sudo systemctl start bbbmanager
sudo systemctl status bbbmanager
```

## Configuration de Moodle pour le diagnostic croise

1. Connexion en admin Moodle
2. **Site administration → Plugins → Web services → Overview** : suivre les 9 etapes officielles
3. **External services → Add** : creer un service custom (ex: `BBBManagerDISIDEV`)
4. **Functions** : ajouter au minimum :
   - `core_webservice_get_site_info`
   - `core_course_get_courses_by_field`
   - `core_course_get_course_module`
   - `mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses`
   - `mod_bigbluebuttonbn_get_recordings`
5. **Manage tokens → Create token** pour l'utilisateur technique sur ce service
6. Dans BBB Manager, **Plateformes Moodle → Ajouter** :
   - Nom court (ex: `DISIDEV`)
   - URL de base (ex: `https://moodle.example.com`)
   - Token genere
   - **`bbb-origin-server-name`** : nom de plateforme cote BBB (ex: `mzgbuq3u78p6.unchk.sn`) pour eviter les fuites cross-plateforme

## Structure du projet

```
bbbmanager/
├── prisma/
│   ├── schema.prisma          # 6 modeles (User, BbbServer, MoodlePlatform, Recording, RebuildJob, RawDiscovery)
│   └── migrations/            # Historique des migrations
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/    # NextAuth/Keycloak
│   │   │   ├── diagnose-batch/        # POST : diagnostic d'une liste de recordIds
│   │   │   ├── health/                # Verification de sante (DB)
│   │   │   ├── me/                    # Session utilisateur courante
│   │   │   ├── moodle-platforms/      # CRUD plateformes Moodle
│   │   │   ├── moodle-search/         # GET : diagnostic croise par cmid ou recordId
│   │   │   ├── public-stats/          # Stats anonymes pour la page login
│   │   │   ├── raw-scan/              # GET (statut) / POST (declenchement manuel admin)
│   │   │   ├── rebuild/               # POST : publication unitaire
│   │   │   ├── rebuildable-orphans/   # GET : liste des orphelins detectes en raw
│   │   │   ├── recordings/            # Liste + detail + sync
│   │   │   ├── servers/               # CRUD serveurs BBB
│   │   │   ├── stats/                 # Stats dashboard (filtrables)
│   │   │   ├── sync-status/           # Statut de la derniere sync auto
│   │   │   └── users/                 # Gestion des utilisateurs
│   │   ├── (dashboard)/               # Pages protegees (layout commun + sidebar)
│   │   │   ├── page.tsx               # Dashboard (carte orphelins + stats globales)
│   │   │   ├── diagnose/              # Diagnostic CSV
│   │   │   ├── moodle-platforms/      # Plateformes Moodle
│   │   │   ├── moodle-search/         # Recherche cours
│   │   │   ├── recordings/            # Liste + detail enregistrement
│   │   │   ├── servers/               # Serveurs BBB
│   │   │   └── users/                 # Utilisateurs (admin)
│   │   └── login/                     # Page de connexion
│   ├── components/
│   │   ├── DashboardClient.tsx        # Dashboard global (filtre serveur + stats)
│   │   ├── Footer.tsx                 # Footer UN-CHK
│   │   ├── LoginClient.tsx            # Page login (design split)
│   │   ├── RebuildableOrphansCard.tsx # Carte du dashboard pour les orphelins rebuildables
│   │   ├── RebuildButton.tsx          # Bouton publication unitaire (admin)
│   │   ├── Sidebar.tsx                # Navigation
│   │   ├── SyncButton.tsx             # Bouton synchronisation manuelle
│   │   └── SyncStatusBanner.tsx       # Bandeau d'alerte si sync auto echouee
│   ├── hooks/
│   │   └── useCurrentUser.ts          # Hook client pour acceder au role
│   ├── lib/
│   │   ├── api-helpers.ts             # requireAuth + rateLimit (Redis)
│   │   ├── auth.ts                    # NextAuth + deconnexion Keycloak
│   │   ├── bbb-raw.ts                 # Client autoindex Nginx + parser events.xml
│   │   ├── bbb.ts                     # Client API BigBlueButton (checksum SHA-256)
│   │   ├── constants.ts               # Constantes (seuils duree/participants, fenetres scan)
│   │   ├── cron.ts                    # 2 crons : auto-sync horaire + scan raw 4h, locks Redis
│   │   ├── crypto.ts                  # AES-256-GCM + validation au demarrage
│   │   ├── logger.ts                  # Pino structure
│   │   ├── moodle.ts                  # Client REST Moodle Web Services
│   │   ├── prisma.ts                  # Singleton Prisma + adapter pg
│   │   ├── raw-scan.ts                # Logique de scan global (autoindex → events.xml → upsert + purge)
│   │   ├── redis.ts                   # Singleton Redis (degradation gracieuse)
│   │   ├── ssh.ts                     # Module SSH (prepare, non utilise actuellement)
│   │   └── sync.ts                    # Sync factorisee (manuelle + cron)
│   ├── instrumentation.ts             # Hook Next.js : demarrage des crons au boot
│   ├── middleware.ts                  # Protection routes + check isActive
│   └── types/                         # Types TypeScript (session NextAuth)
├── scripts/                           # Scripts de debug ad-hoc (probe-*, check-*)
├── .env                               # Variables d'env (NE PAS COMMITTER)
├── .env.example                       # Template
├── next.config.ts                     # Config Next.js
├── package.json
└── pnpm-lock.yaml
```

## Schema de la base de donnees

6 tables principales :

| Table | Description |
|-------|-------------|
| `users` | Utilisateurs synchronises depuis Keycloak (kcSub, role, isActive) |
| `bbb_servers` | Serveurs BBB (URL, secret chiffre, rawIndexUrl + auth basique chiffree, optionnels SSH) |
| `moodle_platforms` | Plateformes Moodle (URL, token chiffre, nom du service, utilisateur WS, `bbb_origin_server_name`) |
| `recordings` | Enregistrements synchronises depuis l'API BBB (recordId, state, durationSec, published, rawData) |
| `rebuild_jobs` | Historique des jobs de publication via l'app (status, user, timestamps, errorMsg) |
| `raw_discoveries` | Cache des recordings detectes en raw via events.xml (durationSec, participantCount, isRebuildable, publishedInDb, rawMtimeMs) — alimente par le cron scan toutes les 4h |

**Relations** avec `onDelete: Cascade` :
- `Recording → BbbServer`
- `RebuildJob → Recording` et `RebuildJob → BbbServer`
- `RawDiscovery → BbbServer`

**Indexes optimises** :
- `recordings(start_time)`, `recordings(server_id, state)`
- `rebuild_jobs(recording_id, status)`
- `raw_discoveries(is_rebuildable, published_in_db)` pour le filtre orphelins
- `raw_discoveries(start_time_ms)` pour le filtre periode
- `raw_discoveries(bbb_origin_server_name)` pour le filtre plateforme

## Etats des enregistrements BBB

| Etat | Description | Action possible |
|------|-------------|-----------------|
| `processing` | BBB traite la video | Attendre |
| `processed` | Traite, pret a publier | **Publier** (si duree >= 15 min) |
| `published` | Publie et accessible | Depublier |
| `unpublished` | Retire de la lecture | **Re-publier** (si duree >= 15 min) |
| `deleted` | Supprime du serveur | Aucune |

## Criteres de rebuildable

Un enregistrement est considere comme **rebuildable** si **TOUS** les criteres sont satisfaits (calcule a partir de `events.xml`) :

- Duree >= **15 minutes** (`MIN_RECORDING_DURATION_SEC = 900`)
- Au moins **2 participants** distincts (`MIN_PARTICIPANTS_FOR_REBUILD = 2`)
- **Non publie** en base (`Recording.published = false` OU absent de la base)

Ces seuils sont definis dans `src/lib/constants.ts` et evalues **dynamiquement** par les requetes API : changer un seuil n'oblige pas a re-scanner.

## Diagnostic Moodle ↔ BBB ↔ Raw

3 outils complementaires :

### 1. Recherche cours (`/moodle-search`)

A partir d'un `cmid` Moodle ou d'un `recordId` BBB :

| Type | Regex | Exemple |
|------|-------|---------|
| `cmid` | `^\d{1,10}$` | `8692` |
| `recordId` | `^[a-f0-9]{40}-\d{10,13}$` | `abc...40hex...-1773327151076` |

Le systeme croise 3 sources et affiche un tableau unifie :
- **Moodle + BBB** (vert) : sync OK
- **Moodle seul** (orange) : visible sur Moodle, absent de BBB → candidat au rebuild
- **BBB seul** (bleu) : en base BBB, absent de Moodle
- **Raw seul** (violet, si applicable) : sur disque mais nulle part publie

Colonne **Etat** : `Publie` ou `Rebuildable` (avec raisons : duree, participants, ecran, webcam, chat).

### 2. Diagnostic CSV (`/diagnose`)

Coller ou importer une liste de `recordId` (ex: extrait de `mdl_bigbluebuttonbn_recordings`). Cascade 4 strategies :

1. **`db`** : trouve dans la base BBB Manager
2. **`bbb_api`** : trouve via API BBB sur l'un des serveurs actifs
3. **`raw`** : trouve via events.xml dans l'autoindex Nginx (cas typique des status=0)
4. **`inferred`** : serveur deduit par famille SHA1 (autres recordings de la meme activite en base)
5. **`not_found`** : nulle part

Pour chaque ID trouve, generation automatique de la commande `sudo bbb-record --rebuild`, copiable individuellement ou en bloc par serveur.

### 3. Orphelins rebuildables (Dashboard)

Liste **agregee globale** des recordings detectes en raw qui :
- Validant les criteres rebuildable (>= 15 min, >= 2 part.)
- Sont **non publies** en base

Filtres : periode (7j / 30j / 60j / Tout), plateforme Moodle (via `bbb-origin-server-name`).
Tableau plat trie par date ou duree (asc/desc), avec colonne **Serveur BBB**.
Bandeau de copie en masse des commandes par serveur, pour SSH groupe.

## Fonctions Moodle utilisees

| Fonction Moodle | Usage |
|-----------------|-------|
| `core_webservice_get_site_info` | Test de connexion a l'ajout d'une plateforme |
| `core_course_get_courses_by_field` | Resolution cours par id (a partir du cmid) |
| `core_course_get_course_module` | Resolution cmid → activite BBB |
| `mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses` | Liste des activites BBB d'un cours (extrait le `meetingid` SHA1) |
| `mod_bigbluebuttonbn_get_recordings` | Recordings vus par Moodle (HTML parse pour extraire les recordIDs BBB) |

## API endpoints

| Methode | Route | Role | Description |
|---------|-------|------|-------------|
| GET | `/api/health` | - | Verification de sante (DB) |
| GET | `/api/public-stats` | - | Stats anonymes pour la page login (rate limit 20/min/IP) |
| GET | `/api/me` | auth | Infos de la session courante |
| GET | `/api/sync-status` | auth | Statut de la derniere sync auto |
| GET | `/api/stats?serverId=` | auth | Stats dashboard, filtrables par serveur |
| GET | `/api/recordings?page=&filter=&serverId=&dateFrom=&dateTo=&search=` | auth | Liste paginee + filtres |
| GET | `/api/recordings/:id` | auth | Detail d'un enregistrement |
| POST | `/api/recordings/sync` | admin | Synchronisation manuelle (rate limit 5/min/user) |
| POST | `/api/rebuild` | admin | Publie un enregistrement (rate limit 30/min/admin) |
| POST | `/api/diagnose-batch` | admin | Diagnostic d'une liste de recordIds (max 200) |
| GET | `/api/moodle-search?platformId=&type=&value=` | auth | Diagnostic croise par cmid ou recordId |
| GET | `/api/rebuildable-orphans?days=&platform=` | auth | Liste des orphelins rebuildables, groupes par serveur |
| GET | `/api/raw-scan` | auth | Statut du dernier scan raw |
| POST | `/api/raw-scan` | admin | Declenche un scan raw manuel |
| GET | `/api/servers` | auth | Liste des serveurs BBB (sans secrets) |
| POST | `/api/servers` | admin | Ajoute un serveur (avec test de connexion) |
| PUT | `/api/servers/:id` | admin | Modifie un serveur |
| DELETE | `/api/servers/:id` | admin | Supprime un serveur (cascade) |
| GET | `/api/moodle-platforms` | auth | Liste des plateformes Moodle |
| POST | `/api/moodle-platforms` | admin | Ajoute une plateforme (avec test) |
| PUT | `/api/moodle-platforms/:id` | admin | Modifie une plateforme |
| DELETE | `/api/moodle-platforms/:id` | admin | Supprime une plateforme |
| GET | `/api/users` | admin | Liste des utilisateurs |
| PATCH | `/api/users/:id` | admin | Modifie role/statut |

## Roles et permissions

- **admin** : acces complet — gestion serveurs BBB, plateformes Moodle, utilisateurs, publication (unitaire et en masse), declenchement de scan manuel
- **auditeur** : consultation seule — dashboard, liste des serveurs et plateformes (sans modification), liste et detail des enregistrements, statistiques, recherche cours

Le premier utilisateur est cree avec le role `auditeur`. Un admin existant doit le promouvoir depuis la page Utilisateurs.

## Cron : synchronisation automatique

### Cron sync (`0 * * * *`)

S'execute **toutes les heures pleines** (timezone `Africa/Dakar`) et :

1. Tente de prendre un lock Redis distribue (`SETNX` avec TTL 10 min)
2. Si le lock est pris, skip
3. Appelle `syncAllServers('cron')` (meme code que le bouton manuel)
4. Persiste le resultat en Redis (TTL 7 jours) pour affichage UI
5. Libere le lock

### Cron raw-scan (`15 */4 * * *`)

S'execute **toutes les 4 heures** (decale du sync horaire pour eviter les races) et :

1. Lock Redis distinct (TTL 30 min)
2. Pour chaque serveur actif avec `rawIndexUrl` :
   - Liste l'autoindex
   - Filtre par `mtimeMs >= now - 70j` (fenetre configurable)
   - Fetch events.xml en concurrence bornee (20)
   - Upsert en `raw_discoveries` avec cross-check `published`
   - Auto-purge des entrees disparues
3. Persiste le resultat en Redis

En cas d'echec d'une sync, un **bandeau rouge** apparait en haut du dashboard avec le detail des serveurs en erreur.

Desactivable via `SYNC_AUTO_ENABLED=false`.

## Commandes utiles

```bash
# Logs (JSON structure en prod)
sudo tail -f /var/log/bbbmanager_output.log
sudo tail -f /var/log/bbbmanager_error.log

# Filtrer les logs
sudo tail -f /var/log/bbbmanager_output.log | grep -i "sync\|cron\|raw-scan"

# Redemarrage
sudo systemctl restart bbbmanager

# Mise a jour
cd /var/www/html/bbbmanager
git pull
pnpm install
pnpm prisma migrate deploy
pnpm prisma generate
pnpm build
sudo systemctl restart bbbmanager

# Sante
curl http://localhost:3456/api/health

# Inspecter Redis (locks, rate limits, statuts)
redis-cli -u "$REDIS_URL" keys 'bbbmanager:*'
redis-cli -u "$REDIS_URL" get bbbmanager:sync:last-auto-result | jq .
redis-cli -u "$REDIS_URL" get bbbmanager:raw-scan:last-result | jq .

# Compter les orphelins rebuildables (DB)
psql "$DATABASE_URL" -c "SELECT s.name, COUNT(*) FROM raw_discoveries r JOIN bbb_servers s ON s.id = r.server_id WHERE r.duration_sec >= 900 AND r.participant_count >= 2 AND r.published_in_db = false GROUP BY s.name ORDER BY 2 DESC;"
```

## Securite

- **Chiffrement AES-256-GCM** : secrets BBB, tokens Moodle, et credentials Basic Auth de l'index raw chiffres en base
- **Validation au demarrage** : l'application refuse de demarrer si `ENCRYPTION_KEY` est absente ou mal formee (fail fast)
- **SSO Keycloak** : aucun mot de passe stocke localement
- **Deconnexion complete** : invalide aussi la session cote Keycloak via `end_session_endpoint`
- **Middleware** : verifie authentification + statut actif a chaque requete
- **Defense en profondeur** : chaque route API revalide le role et `isActive` (helper `requireAuth`)
- **Rate limiting** : Redis sur les endpoints sensibles (sync, rebuild, diagnose-batch, raw-scan manuel)
- **RBAC** : roles admin/auditeur verifies cote API + masques cote UI
- **Validation stricte des inputs** : regex par type sur tous les champs (serveur ET client)
- **Logs structures Pino** : redaction automatique des champs sensibles (cookies, passwords, secrets, tokens)
- **Prisma** : protection contre les injections SQL (requetes parametrees)
- **Le fichier `.env`** : contient les secrets et ne doit **jamais** etre committe

---

DITSI — Universite Numerique Cheikh Hamidou Kane (UN-CHK) — 2026
