# Chess-AppWeb

Application web d'échecs en ligne : on se connecte avec GitHub, on crée une partie privée en choisissant sa cadence, on partage son code, et on joue contre la personne qui l'a reçu. Chaque joueur a un classement Elo.

| Partie | Technologies |
| --- | --- |
| API (`server/`) | Node.js, Express, Socket.IO, SQLite (`node:sqlite`), chess.js |
| Client (`client/`) | React Router (mode framework, rendu côté serveur), socket.io-client, react-chessboard, Tailwind CSS |
| Livraison | Docker, GitHub Actions, images publiées sur ghcr.io |

Le dépôt est un monorepo npm avec deux *workspaces* : `server` et `client`. Un seul `npm install` à la racine installe tout.

- [Démarrer en développement](#démarrer-en-développement)
- [Lancer les tests](#lancer-les-tests)
- [Déployer avec Docker](#déployer-avec-docker)
- [Règles des échecs : chess.js](#règles-des-échecs--chessjs)
- [Cadences](#cadences)
- [Temps réel : Socket.IO](#temps-réel--socketio)

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
- les tests envoient de vraies requêtes HTTP à l'application Express avec `supertest`, sans ouvrir de port ;
- les tests du temps réel (`server/tests/temps-reel.test.js` et `server/tests/clavardage.test.js`) démarrent un vrai serveur HTTP + Socket.IO sur un port libre et s'y connectent avec `socket.io-client`, avec un vrai cookie signé (`server/tests/helpers/temps-reel.js`).

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
| `URL_API` | Adresse de l'API vue par le navigateur (connexion GitHub et Socket.IO) | `http://localhost:3000` |
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

---

## Cadences

À la création, le joueur choisit une cadence parmi des boutons regroupés par catégorie. Une cadence s'écrit `base+incrément` : `3+2` veut dire 3 minutes pour toute la partie, plus 2 secondes ajoutées après chaque coup.

| Catégorie | Cadences |
| --- | --- |
| Bullet | `1+0`, `2+1` |
| Blitz | `3+0`, `3+2`, `5+0`, `5+2`, `5+5` |
| Rapide | `10+0`, `15+0`, `15+10` |
| Quotidien | `quotidien` : 1 jour pour chaque coup (voir [Les parties quotidiennes](#les-parties-quotidiennes)) |

La pendule qui décompte le temps des parties en direct viendra avec #58 ; pour l'instant, leur cadence est enregistrée et affichée.

### Une seule liste, côté serveur

La liste n'existe qu'à un seul endroit : `server/services/cadences.js`. Chaque cadence y a un `id` (`"3+2"`), une `categorie` (`bullet`, `blitz`, `rapide` ou `quotidien`), une `base` et un `increment`, **tous deux en secondes** (`3+2` → `base: 180, increment: 2`). Le client ne la recopie pas : il la demande au serveur (`GET /api/cadences`) pour afficher les boutons.

Le client n'envoie qu'un **identifiant** de cette liste, jamais un temps : il ne peut pas inventer une cadence de 2 heures ou de 0 seconde.

### L'API

| Requête | Réponse |
| --- | --- |
| `GET /api/cadences` | La liste complète. Publique (pas besoin d'être connecté). |
| `POST /api/parties` avec `{ "cadence": "3+2" }` | `201` et la partie créée. Sans `cadence`, la partie est en `10+0`. Un id qui n'est pas dans la liste répond `400` « Cadence inconnue. », et rien n'est enregistré. |
| `GET /api/parties/code/:code` | L'aperçu avant de rejoindre : `{ "createur": "alice", "cadence": { … } }`, rien d'autre. Le code est accepté en minuscules et avec des espaces, comme pour `/rejoindre`. `404` si le code est inconnu, `409` si la partie a déjà commencé. Connexion obligatoire. |

`GET /api/parties/:id`, la diffusion `partie:etat` et l'historique (`GET /api/parties`) contiennent aussi la cadence, toujours sous sa forme complète : `{ "id": "3+2", "categorie": "blitz", "base": 180, "increment": 2 }`.

### Rejoindre en deux temps

Sur l'accueil, « Rejoindre » ne rejoint plus tout de suite. La page appelle d'abord l'aperçu et affiche « Partie de alice · Blitz 3 min + 2 s », avec un bouton « Rejoindre la partie » qui envoie le vrai `POST /api/parties/rejoindre`. On sait ainsi à quel rythme on va jouer avant de s'engager.

### En base

La table `parties` garde seulement l'id, dans la colonne `cadence` (`TEXT NOT NULL DEFAULT '10+0'`). Le serveur retrouve la catégorie et les temps dans la liste à chaque lecture. Une base créée avant les cadences reçoit la colonne au démarrage (`ALTER TABLE` dans `server/repository/db.js`), et ses parties passent en `10+0`.

### Les parties quotidiennes

En quotidien (`{ "id": "quotidien", "categorie": "quotidien", "base": 86400, "increment": 0 }`), chaque joueur a **24 heures pour jouer chaque coup** : on joue à son rythme, sans rester devant l'écran. Ici, `base` est le temps par coup, pas le temps de la partie.

- **L'échéance est en base.** La colonne `parties.echeance` (texte ISO, `null` pour les autres cadences) garde la date limite du prochain coup. Elle est posée quand l'adversaire rejoint, puis remise à 24 h à chaque coup, dans la même écriture que le coup (`prochaineEcheance` dans `server/services/cadences.js`). Comme elle est en base, elle survit à un redémarrage.
- **Le serveur vérifie au démarrage, puis toutes les minutes** (`terminerLesRetards` dans `server/server.js`, qui appelle `verifierEcheances` de `server/services/echeances.js`). Une partie dont l'échéance est passée se termine **au temps** (cause `temps`) : le camp au trait perd, et les Elo changent comme pour une autre fin. Les joueurs connectés reçoivent la fin par `partie:etat`.
- **Nulle si l'adversaire ne peut pas mater** : avec le roi seul, ou le roi et un seul fou ou cavalier, il ne pourrait pas gagner, donc la partie est nulle (cause `temps` aussi). C'est la règle de la FIDE pour une chute du drapeau.
- **Un coup en retard est refusé**, même avant la vérification de la minute suivante : `POST /api/parties/:id/coups` répond `409` « Le temps est écoulé. ».
- **Pas de délai de retour de 60 secondes** : fermer la page est normal en quotidien. La présence en ligne / hors ligne reste affichée, sans compte à rebours.
- **Plusieurs parties en même temps** : rien n'empêche un joueur d'avoir plusieurs parties quotidiennes en cours, en plus d'une partie en direct.
- **Côté client**, `GET /api/parties/:id` et `partie:etat` contiennent `echeance`. La page affiche « 18 h 42 min pour jouer », arrondi à la minute supérieure et mis à jour toutes les 30 secondes. Ce texte est calculé **seulement dans le navigateur** (après le premier rendu) : le serveur et le navigateur n'ont pas la même heure, et React refuserait deux rendus différents à l'hydratation. Une fois l'échéance passée, la page affiche « Temps écoulé » jusqu'à ce que le serveur termine la partie.

---

## Temps réel : Socket.IO

Quand un joueur joue, son adversaire et les spectateurs voient le coup **aussitôt**, sans recharger la page : c'est le serveur qui prévient le navigateur, par une connexion Socket.IO.

N'importe qui peut suivre une partie avec son lien, même sans compte : `GET /api/parties/:id` est public. Celui qui n'y joue pas la reçoit en spectateur (`couleur: null`), sans le code d'invitation, réservé au créateur. Il ne peut ni jouer ni abandonner : ces actions passent par HTTP et répondent `401` ou `403`.

### Le parcours d'un coup

1. Alice dépose une pièce : le client envoie `POST /api/parties/:id/coups` (HTTP, comme au projet 1).
2. Le serveur valide le coup avec chess.js et l'enregistre en base (voir [Comment on l'intègre](#comment-on-lintègre)), puis répond à Alice avec l'état à jour.
3. La route appelle ensuite `diffuserPartie(id)` (`server/temps-reel/diffusion.js`), sans faire attendre la réponse.
4. `diffuserPartie` récupère les sockets du salon `partie:<id>` et envoie à chacun un événement `partie:etat`, avec l'état **calculé pour lui** (sa `couleur` : `blanc`, `noir` ou `null` pour un spectateur).
5. Chez Bob, le hook `usePartieEnDirect` (`client/app/hooks/usePartieEnDirect.ts`) reçoit `partie:etat` et remplace l'état affiché.

Le même parcours vaut pour l'abandon et pour l'arrivée de l'adversaire dans la salle d'attente (`POST /api/parties/rejoindre`).

### Les événements

| Événement | Sens | Contenu | Rôle |
| --- | --- | --- | --- |
| `partie:rejoindre` | client → serveur | l'id de la partie, et un accusé de réception | Entrer dans le salon `partie:<id>`. Réponse `{ ok: true }` ou `{ erreur }` |
| `partie:etat` | serveur → client | l'état complet de la partie (le même objet que `GET /api/parties/:id`) | Envoyé à l'arrivée dans le salon, puis à chaque changement |
| `partie:presence` | serveur → client | `{ blanc, noir, retour }` : chaque couleur `en_ligne` ou `hors_ligne`, et dans `retour` les millisecondes qu'il reste à un joueur déconnecté pour revenir (`null` sans délai) | Envoyé à tout le salon quand quelqu'un y entre ou se déconnecte |
| `partie:coup`, `partie:abandon` | client → serveur | `{ partieId }`, et un accusé de réception | Toujours refusés, la partie n'est jamais modifiée. Réponse selon `socket.data` : « Vous devez être connecté. », « Vous ne participez pas à cette partie. » ou, pour un joueur, « Les coups et l'abandon se font par HTTP. » |

L'état est fabriqué à un seul endroit, `server/services/etat-partie.js`, utilisé à la fois par la route HTTP et par Socket.IO : les deux chemins envoient toujours le même format.

Les événements du clavardage sont décrits plus bas, dans [Le clavardage](#le-clavardage).

### Les salons

- `partie:<id>` : tous ceux qui regardent une partie (les deux joueurs et les spectateurs).
- `joueur:<id>` : toutes les connexions d'un joueur connecté (plusieurs onglets ou appareils). Prévu pour la présence et les notifications.

Un socket perd ses salons à chaque déconnexion. Le client redemande donc `partie:rejoindre` à **chaque** événement `connect`, première connexion comme reconnexion, et le serveur lui renvoie l'état complet, coups manqués compris.

### La présence (en ligne / hors ligne)

- La présence se déduit des connexions ouvertes dans le salon `partie:<id>` (`server/temps-reel/presence.js`) : un joueur est `en_ligne` si au moins un socket du salon porte son identité (`socket.data.joueur`). Un spectateur ou un anonyme ne compte pour aucune couleur.
- Elle est recalculée et envoyée à tout le salon quand un socket entre dans la partie (`partie:rejoindre`) et quand un socket se déconnecte. À la déconnexion, le socket a déjà quitté ses salons : on note donc ses parties dans l'événement `disconnecting`, puis on recalcule dans `disconnect`.
- **Deuxième onglet : permis.** Un joueur peut ouvrir la même partie dans plusieurs onglets ou appareils. Fermer un onglet ne le met pas hors ligne tant qu'un autre reste ouvert, puisqu'on compte les joueurs et non les sockets. Les actions passent par HTTP et le serveur refuse un coup hors tour : deux onglets ne peuvent pas jouer deux fois.
- Côté client, l'indicateur s'affiche à côté de l'adversaire ; un spectateur le voit à côté des deux joueurs. Si notre propre connexion tombe, l'indicateur disparaît jusqu'à la reconnexion, plutôt que d'afficher une information périmée.

### Le délai de retour (60 secondes)

Un joueur qui se déconnecte en pleine partie a 60 secondes pour revenir. Sinon, il perd par abandon.

- **C'est le serveur qui décide** (`server/temps-reel/delai-retour.js`). À chaque calcul de la présence, un joueur `hors_ligne` dans une partie `en_cours` reçoit une minuterie `setTimeout` de 60 secondes, et un joueur revenu `en_ligne` voit la sienne annulée.
- **À l'expiration**, le serveur appelle le même service qu'un abandon ordinaire (`abandonner` dans `server/services/fin-partie.js`) : même vérification, même calcul des deux Elo, même mise à jour conditionnelle en base. Puis il diffuse la partie terminée au salon.
- **Les deux joueurs déconnectés** : chacun a sa minuterie. La première qui expire termine la partie ; la seconde est annulée, et un éventuel abandon tardif serait de toute façon refusé, car la partie n'est plus en cours.
- **Seulement en partie en cours** : pas de délai en salle d'attente ni après la fin.
- **Pas en quotidien** : une partie quotidienne n'a que son échéance de 24 h par coup (voir [Les parties quotidiennes](#les-parties-quotidiennes)).
- **Le créateur absent quand l'adversaire arrive** : s'il a fermé son onglet en salle d'attente, son délai de 60 secondes commence dès que l'adversaire rejoint, puisque la partie est alors en cours. C'est voulu : sans ce délai, la partie resterait bloquée indéfiniment.
- **Calculer la présence démarre et annule les minuteries.** `presencePartie` (`server/temps-reel/presence.js`) ne se contente pas de lire les connexions : elle appelle `synchroniserDelais`. Un délai déjà commencé n'est jamais relancé : un spectateur qui arrive, ou un nouveau calcul, ne remet pas les 60 secondes à zéro.
- **Le navigateur ne fait qu'afficher.** Le serveur envoie le temps restant en millisecondes (et pas une heure), ce qui évite les écarts entre l'horloge du serveur et celle du navigateur. Le client en déduit une échéance locale et affiche le compte à rebours à côté du joueur déconnecté. Il ne termine jamais la partie lui-même : la fin arrive par `partie:etat`.
- La variable `DELAI_RETOUR_MS` (optionnelle, 60000 par défaut) change la durée. Les tests la mettent à 300 ms.

### L'identité d'une connexion

- La connexion est authentifiée **une seule fois, à son ouverture**, par le cookie de session (`server/temps-reel/authentification.js`). C'est le seul moment où le cookie voyage : il est dans les en-têtes de la requête HTTP d'ouverture, pas dans les messages.
- Le serveur vérifie la signature avec la même fonction que pour HTTP (`readSession`), puis range le joueur dans `socket.data.joueur` (`{ id, nom }`, ou `null` pour un anonyme).
- **Le serveur ne lit jamais une identité dans le contenu d'un message.** Un message peut contenir n'importe quoi : `partieId` est validé, et l'identité vient toujours de `socket.data`.
- Une connexion sans session est acceptée comme anonyme : elle peut regarder une partie, jamais jouer.
- Le navigateur envoie le cookie parce que le client ouvre la connexion avec `withCredentials: true` et que le serveur l'autorise pour la seule origine `URL_CLIENT` (`cors: { origin: URL_CLIENT, credentials: true }`).

### Pourquoi les actions passent par HTTP

L'énoncé laisse le choix : jouer un coup et abandonner passent par HTTP ou par Socket.IO. **On garde HTTP pour les actions, et Socket.IO sert uniquement à diffuser.**

- **Un vrai code de réponse.** Un coup refusé renvoie `400`, `403`, `409` ou `422` avec un message, et le client sait que *son* action a échoué. Avec Socket.IO, il faudrait réinventer ces réponses avec des accusés de réception.
- **Rien à réécrire.** Les routes, la validation et les tests d'intégration du projet 1 restent valables tels quels.
- **Une seule porte d'entrée pour modifier une partie.** Les règles (tour, joueur de la partie, coup légal) sont vérifiées à un seul endroit, les services, appelés uniquement par les routes HTTP. Socket.IO ne peut modifier aucune partie : un spectateur ne peut donc pas jouer par ce chemin. (Le clavardage écrit par Socket.IO, mais seulement dans la table `messages` : voir [Le clavardage](#le-clavardage).)
- **L'identité reste celle de la requête.** Chaque requête HTTP porte le cookie du moment. Si le joueur se déconnecte dans un onglet, un autre onglet resté ouvert ne peut plus jouer, même si son socket est encore ouvert.
- **La diffusion n'est pas bloquante.** Le coup est enregistré avant d'être diffusé. Si la diffusion échouait, le coup resterait valide, et le client le verrait au prochain rechargement.

Le prix de ce choix : un joueur reçoit son propre coup deux fois (la réponse HTTP et la diffusion). C'est sans effet, puisque c'est le même état et que le client remplace simplement l'ancien.

### Le clavardage

Joueurs et spectateurs discutent sous l'échiquier, en salle d'attente, pendant et après la partie.

**Pourquoi l'envoi passe par Socket.IO, contrairement aux actions.** Un message ne modifie pas la partie : il n'y a ni règle du jeu à vérifier, ni loader à recharger. Un accusé de réception (`{ ok }` ou `{ erreur }`) suffit à dire à l'auteur si son message est refusé, et la connexion est déjà ouverte vers le bon salon.

#### Les événements du clavardage

| Événement | Sens | Contenu | Rôle |
| --- | --- | --- | --- |
| `clavardage:historique` | serveur → client | les 50 derniers messages de la partie | Envoyé à ce socket seulement, juste après `partie:etat`, à chaque `partie:rejoindre` (donc aussi à chaque reconnexion) |
| `clavardage:envoyer` | client → serveur | `{ partieId, texte }`, et un accusé de réception | Écrire dans le clavardage. Réponse `{ ok: true }` ou `{ erreur }` |
| `clavardage:message` | serveur → salon | `{ id, auteur, role, texte, envoyeLe }` | Un nouveau message, envoyé à tout le salon, auteur compris |

#### Le parcours d'un message

1. Bob tape un message : le client émet `clavardage:envoyer` avec `{ partieId, texte }` (`envoyerMessage` dans `usePartieEnDirect`).
2. `server/temps-reel/index.js` vérifie que ce socket a bien rejoint le salon `partie:<partieId>` : on n'écrit que dans une partie qu'on lit.
3. `envoyerMessage` (`server/services/clavardage.js`) applique les règles, puis enregistre le message en base (`server/repository/messages.js`).
4. Le message est diffusé avec `io.to('partie:<id>')`, donc **à tout le salon, auteur compris**. Le client n'ajoute jamais un message au moment de l'envoyer : il l'ajoute en le recevant, tel que le serveur l'a validé.

#### Les règles, vérifiées par le serveur

| Règle | Refus |
| --- | --- |
| L'auteur vient de `socket.data.joueur` (la session), jamais du message | — |
| Un anonyme lit, mais n'écrit pas ; le panneau l'invite à se connecter | `Connectez-vous pour écrire.` |
| Texte non vide une fois les espaces retirés, 300 caractères au maximum (aussi garanti par un `CHECK` en base) | `Le message est vide.` / `Le message dépasse 300 caractères.` |
| Un message par seconde **par joueur** (et pas par onglet) | `Doucement : un message par seconde au maximum.` |
| Après la fin de la partie, lecture seule | `La partie est terminée : le clavardage est en lecture seule.` |

**Le rôle affiché** (Blancs, Noirs, Spectateur) n'est pas enregistré : il est calculé à chaque lecture à partir de la partie. Le créateur qui écrit en salle d'attente n'a pas encore de couleur et apparaît comme « Joueur » ; ses messages afficheront sa couleur une fois la partie commencée.

**Pas de HTML injecté.** Le serveur enregistre le texte tel quel ; c'est l'affichage qui protège : React échappe `{m.texte}`, et le client n'utilise jamais `dangerouslySetInnerHTML`. Un `<script>` s'affiche donc comme du texte.

**L'historique** est relu en base à chaque `partie:rejoindre` : il est reçu en arrivant, après une coupure et après un redémarrage du serveur. Le client *remplace* sa liste par l'historique (pas de doublons à la reconnexion) et *ajoute* chaque `clavardage:message`.

### Limites connues

- **Délai de retour en mémoire.** Les minuteries de 60 secondes sont perdues si le serveur redémarre : un joueur déconnecté à ce moment-là n'aura plus de délai jusqu'au prochain calcul de la présence. L'enregistrement de l'échéance en base est prévu avec #60.
- **Une seule instance du serveur.** Les salons vivent en mémoire, dans le processus Node. Avec deux instances derrière un répartiteur de charge, une diffusion n'atteindrait que les clients de la même instance. Il faudrait l'adaptateur Redis de Socket.IO (`@socket.io/redis-adapter`) et des sessions persistantes (*sticky sessions*).
- **Déconnexion dans un autre onglet.** `/logout` efface le cookie, mais un socket déjà ouvert dans un autre onglet garde son identité jusqu'à sa fermeture. Il ne peut plus jouer (les actions passent par HTTP), mais il reçoit encore les diffusions et peut encore écrire dans le clavardage. Correction possible : fermer les sockets du salon `joueur:<id>` au `/logout`.
- **Limite de débit du clavardage en mémoire.** Elle est perdue au redémarrage (sans gravité) et ne serait pas partagée entre plusieurs instances du serveur. La `Map` qui la garde (`derniersMessages`) n'est jamais vidée : une entrée par joueur ayant écrit depuis le démarrage, ce qui reste négligeable à notre échelle.
- **Historique limité.** Seuls les 50 derniers messages sont envoyés en arrivant ; les plus anciens restent en base mais ne sont pas affichés.
- **Deux sources pour l'affichage.** La réponse HTTP et la diffusion mettent toutes deux la page à jour ; si elles arrivaient dans le désordre, un état plus ancien pourrait s'afficher brièvement.
