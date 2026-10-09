# Chess-AppWeb

Application web d'échecs en ligne : on se connecte avec GitHub, on crée une partie privée, on partage son code, et on joue contre la personne qui l'a reçu. Chaque joueur a un classement Elo.

| Partie | Technologies |
| --- | --- |
| API (`server/`) | Node.js, Express, SQLite (`node:sqlite`), chess.js |
| Client (`client/`) | React Router (mode framework, rendu côté serveur), react-chessboard, Tailwind CSS |
| Livraison | Docker, GitHub Actions, images publiées sur ghcr.io |

Le dépôt est un monorepo npm avec deux *workspaces* : `server` et `client`. Un seul `npm install` à la racine installe tout.

- [Démarrer en développement](#démarrer-en-développement)
- [Lancer les tests](#lancer-les-tests)
- [Déployer avec Docker](#déployer-avec-docker)
- [Règles des échecs : chess.js](#règles-des-échecs--chessjs)

---

## Démarrer en développement

### 1. Prérequis

- **Node.js 24**, la version utilisée par la CI et les images Docker. L'API utilise `node:sqlite` et l'option `--env-file`, qui demandent un Node récent. Vérifie avec `node --version`.
- **npm**, fourni avec Node.
- **Git**.
- Un **compte GitHub**, pour créer l'application OAuth et se connecter.
- Optionnel : **Docker Desktop**, pour démarrer avec Docker plutôt qu'avec Node.

### 2. Créer l'application GitHub OAuth

La connexion passe par GitHub. Il faut déclarer une application OAuth une fois par environnement (une pour le développement, une pour le déploiement).

1. Ouvre [github.com/settings/applications/new](https://github.com/settings/applications/new) (Settings → Developer settings → OAuth Apps → New OAuth App).
2. Remplis le formulaire :

   | Champ | Valeur en développement |
   | --- | --- |
   | Application name | ce que tu veux, par exemple `Chess-AppWeb dev` |
   | Homepage URL | `http://localhost:5173` |
   | Authorization callback URL | `http://localhost:3000/api/auth/callback` |

   L'URL de callback doit être **exactement** celle-ci : c'est l'adresse de l'API (`URL_API`) suivie de `/api/auth/callback`. Sinon, GitHub refuse la connexion.
3. Sur la page de l'application créée, copie le **Client ID**, puis clique **Generate a new client secret** et copie-le tout de suite : GitHub ne l'affiche qu'une fois.

### 3. Configurer les variables d'environnement

L'API lit ses réglages dans `server/.env`. Ce fichier est ignoré par git : **les secrets ne vont jamais dans le dépôt**.

```bash
cp server/.env.example server/.env
```

Puis complète `server/.env` :

| Variable | Rôle | Valeur en développement |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | Identifiant public de l'application OAuth | le Client ID copié à l'étape 2 |
| `GITHUB_CLIENT_SECRET` | Secret de l'application OAuth | le secret copié à l'étape 2 |
| `SESSION_SECRET` | Clé qui signe le cookie de session (HMAC) | une longue chaîne au hasard (voir ci-dessous) |
| `URL_API` | Adresse de l'API **vue par le navigateur** | `http://localhost:3000` |
| `URL_CLIENT` | Adresse du site **vue par le navigateur** | `http://localhost:5173` |
| `DATABASE_PATH` | Fichier SQLite (créé automatiquement) | `./data/chess-app.db` |

Pour générer `SESSION_SECRET` :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Au démarrage, l'API vérifie que `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, `URL_API` et `URL_CLIENT` sont définies. S'il en manque une, elle s'arrête et affiche leur liste.

Le client n'a pas besoin de fichier `.env` en développement : par défaut, il joint l'API sur `http://localhost:3000`.

### 4. Installer et lancer

```bash
npm install     # une seule fois, à la racine : installe l'API et le client
npm run dev     # lance l'API et le client en même temps
```

| Service | Adresse |
| --- | --- |
| Site (client) | <http://localhost:5173> |
| API | <http://localhost:3000> (santé : <http://localhost:3000/api/health>) |

Ouvre <http://localhost:5173> et clique **Se connecter avec GitHub**.

La base SQLite est créée au premier démarrage dans `server/data/` (ignoré par git). Pour repartir de zéro, arrête l'application et supprime ce dossier.

Pour lancer un seul des deux services : `npm run dev -w server` ou `npm run dev -w client`.

### Démarrer en développement avec Docker (optionnel)

Le fichier `compose.yml` à la racine construit les images à partir du code source. Les secrets sont lus dans un fichier `.env` **à la racine** (ignoré par git), avec les mêmes valeurs que `server/.env` :

```dotenv
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=...
```

```bash
docker compose up --build
```

Le site et l'API sont alors aux mêmes adresses qu'avec `npm run dev`. La base est gardée dans le volume Docker `donnees_sqlite`.

### Problèmes fréquents

| Symptôme | Cause probable |
| --- | --- |
| L'API s'arrête avec « Variables d'environnement manquantes » | `server/.env` absent, vide ou pas enregistré |
| Erreur 500 « fetch failed » sur le site | L'API ne tourne pas : regarde les lignes `[server]` dans le terminal |
| Page 404 chez GitHub en cliquant « Se connecter » | `GITHUB_CLIENT_ID` invalide (resté à la valeur d'exemple, par exemple) |
| GitHub affiche une erreur `redirect_uri` | L'URL de callback de l'application OAuth ne correspond pas à `URL_API` + `/api/auth/callback` |
| Une modification de `server/.env` n'est pas prise en compte | Le fichier n'est lu qu'au démarrage : relance `npm run dev` |

---

## Lancer les tests

```bash
npm test                              # tests d'intégration de l'API
npm run lint                          # ESLint sur l'API et le client
npm run typecheck --workspace=client  # vérification TypeScript du client
```

Ces commandes ne demandent ni `server/.env` ni application OAuth :

- chaque fichier de test utilise **sa propre base SQLite temporaire** (`server/tests/helpers/base-temporaire.js`), et ta base de développement n'est jamais touchée ;
- **GitHub est simulé** : `server/tests/auth.test.js` remplace `fetch` par un faux GitHub ;
- les tests envoient de vraies requêtes HTTP à l'application Express avec `supertest`, sans ouvrir de port.

Pour lancer un seul fichier : `node --test tests/parties-coups.test.js` depuis le dossier `server`.

**Intégration continue** (`.github/workflows/ci.yml`) : les tests tournent à chaque push sur `main` et sur chaque pull request. Sur `main`, si les tests passent, les images de l'API et du client sont publiées sur ghcr.io.

---

## Déployer avec Docker

La machine de déploiement n'a besoin **que de Docker** : ni Node, ni code source. Elle télécharge les images publiées par la CI sur ghcr.io.

### 1. Les images

À chaque push sur `main` dont les tests passent, la CI publie deux images :

- `ghcr.io/fallwatch-corp/chess-appweb-server`
- `ghcr.io/fallwatch-corp/chess-appweb-client`

Chacune reçoit deux tags :

- `latest`, qui suit le dernier push sur `main` ;
- `sha-xxxxxxx`, les 7 premiers caractères du commit, qui ne change jamais.

Pour un déploiement, utilise un tag **`sha-…`** : tu sais exactement quelle version tourne, et tu peux revenir en arrière. Les tags disponibles sont listés dans l'onglet **Packages** du dépôt GitHub.

Si les paquets sont privés, connecte d'abord Docker à ghcr.io avec un jeton GitHub ayant la permission `read:packages` :

```bash
docker login ghcr.io -u <ton-compte-github>
```

### 2. Préparer la machine

Copie uniquement le dossier `deploy/` sur la machine :

```text
deploy/
├── compose.yml      # les deux services, à partir des images ghcr.io
└── .env.example     # les variables attendues
```

Crée `deploy/.env` à partir de l'exemple :

```bash
cd deploy
cp .env.example .env
```

| Variable | Rôle | Exemple |
| --- | --- | --- |
| `COMPTE` | Propriétaire des images sur ghcr.io, **en minuscules** | `fallwatch-corp` |
| `TAG` | Version à déployer | `sha-c1370bd` |
| `GITHUB_CLIENT_ID` | Client ID de l'application OAuth **de production** | |
| `GITHUB_CLIENT_SECRET` | Son secret | |
| `SESSION_SECRET` | Une nouvelle longue chaîne au hasard (pas celle du développement) | |
| `URL_API` | Adresse de l'API vue par le navigateur | `http://localhost:3000` |
| `URL_CLIENT` | Adresse du site vue par le navigateur | `http://localhost:5173` |

Crée une **application OAuth distincte** pour le déploiement (voir [l'étape 2 du développement](#2-créer-lapplication-github-oauth)), avec :

- Homepage URL : la valeur de `URL_CLIENT` ;
- Authorization callback URL : la valeur de `URL_API` suivie de `/api/auth/callback`.

### 3. Démarrer

Depuis le dossier `deploy/` :

```bash
docker compose up -d          # télécharge les images et démarre en arrière-plan
docker compose ps             # état des deux services
docker compose logs -f server # journaux de l'API
```

| Service | Port | Détail |
| --- | --- | --- |
| `client` | 5173 | le site |
| `server` | 3000 | l'API ; le client la joint en interne par `http://server:3000` |

### 4. Mettre à jour, arrêter

```bash
# nouvelle version : changer TAG dans .env, puis
docker compose pull
docker compose up -d

docker compose down           # arrête ; les parties sont conservées
docker compose down -v        # arrête ET supprime la base (volume donnees_sqlite)
```

La base SQLite est dans le volume nommé `donnees_sqlite`, monté sur `/data` dans le conteneur de l'API. Elle survit à `docker compose down` et aux mises à jour. Seul `down -v` l'efface.

> **À savoir :** dans `deploy/compose.yml`, le service `client` ne reçoit pas encore `URL_API`. Le bouton « Se connecter avec GitHub » utilise donc l'adresse par défaut `http://localhost:3000`. Ça fonctionne quand le site est ouvert sur la machine de déploiement elle-même (le cas avec les valeurs de l'exemple). Pour un accès depuis une autre machine, il faudra ajouter `URL_API: ${URL_API}` à l'`environment` du service `client`.

---

## Règles des échecs : chess.js

### Pourquoi chess.js

Les règles des échecs comportent beaucoup de cas particuliers : roque (avec ses conditions), prise en passant, promotion, clouage, interdiction de laisser son roi en échec, mat, pat. Les recoder soi-même serait long et risqué. [chess.js](https://github.com/jhlywa/chess.js) est la bibliothèque JavaScript de référence pour ces règles :

- elle connaît toutes les règles et détecte le mat et le pat ;
- elle lit et produit la **FEN**, le format qu'on stocke en base pour décrire une position ;
- elle donne chaque coup en notation **SAN** (`e4`, `Nf3`, `gxh8=Q`), lisible par un humain, que l'on garde dans la liste des coups ;
- elle n'a aucune dépendance et fonctionne aussi bien dans Node (validation) que dans le navigateur ;
- elle est maintenue, testée et largement utilisée.

L'affichage de l'échiquier est confié à une autre bibliothèque, `react-chessboard`, qui ne connaît pas les règles : chacune a son rôle.

### Comment on l'intègre

**Le serveur est l'arbitre.** Le client ne décide jamais si un coup est légal.

1. Le joueur dépose une pièce : le client envoie `POST /api/parties/:id/coups` avec `{ de: "e2", vers: "e4" }` (et `promotion: "q"` pour un pion qui arrive au bout).
2. Le serveur (`server/services/coups.js`) relit la partie en base et recrée la position avec `new Chess(partie.fen)`. On repart toujours de la FEN en base, jamais de ce qu'envoie le client.
3. Il vérifie, dans cet ordre : la partie existe (`404`), le joueur y participe (`403`), la partie est en cours (`409` « La partie est terminée. »), le coup est bien formé (`400`), c'est son tour avec `chess.turn()` (`409` « Ce n'est pas votre tour. »).
4. Il joue le coup avec `chess.move({ from, to, promotion })`. Si le coup est illégal, chess.js lance une exception et l'API répond `422` « Coup illégal. ».
5. La nouvelle FEN (`chess.fen()`) et le coup en SAN sont enregistrés **dans une même transaction** (`server/repository/parties.js`, `enregistrerCoup`) : la ligne de `parties` est mise à jour et une ligne est ajoutée dans `coups`. Si l'un échoue, rien n'est enregistré.
6. La mise à jour porte la condition `WHERE fen = <ancienne FEN>` : si deux coups arrivent en même temps sur la même position, un seul est accepté.

Comme la position et la liste des coups sont en base, une partie survit à un redémarrage du serveur.

**Côté client**, chess.js sert uniquement au confort d'affichage. Pendant l'envoi, on montre déjà la position après le coup (affichage optimiste). Dès que le serveur a répondu, la page affiche la FEN qu'il renvoie : si le coup est refusé, la pièce revient à sa place et le message d'erreur de l'API s'affiche.
