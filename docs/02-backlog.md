# Backlog

## Must

| Issue | Titre | Épique | Points | Sprint |
|---|---|---|---|---|
| [#1](../../../issues/1) | Initialiser le projet (API Express + client React Router) | Infrastructure | 2 | 1 |
| [#2](../../../issues/2) | Créer le schéma SQLite (joueurs, parties, coups) | Infrastructure | 3 | 1 |
| [#3](../../../issues/3) | Mettre en place les tests d'intégration de l'API | Infrastructure | 2 | 1 |
| [#4](../../../issues/4) | Exécuter les tests en CI à chaque push sur main | Infrastructure | 2 | 1 |
| [#5](../../../issues/5) | Conteneuriser l'API et le client | Infrastructure | 3 | 2 |
| [#6](../../../issues/6) | Publier les images sur ghcr.io depuis la CI | Infrastructure | 2 | 3 |
| [#7](../../../issues/7) | Déployer avec deploy/compose.yml et .env | Infrastructure | 2 | 3 |
| [#8](../../../issues/8) | Rédiger le README (développement et déploiement) | Infrastructure | 1 | 3 |
| [#9](../../../issues/9) | Se connecter avec GitHub | Comptes | 3 | 1 |
| [#10](../../../issues/10) | Créer mon profil joueur à la première connexion | Comptes | 2 | 1 |
| [#12](../../../issues/12) | Créer une partie privée et recevoir un code | Parties privées | 3 | 1 |
| [#13](../../../issues/13) | Rejoindre une partie avec un code | Parties privées | 3 | 2 |
| [#14](../../../issues/14) | Voir l'arrivée de mon adversaire dans la salle d'attente | Parties privées | 2 | 2 |
| [#15](../../../issues/15) | Afficher l'échiquier d'une partie | Jeu | 3 | 2 |
| [#16](../../../issues/16) | Jouer un coup quand c'est mon tour | Jeu | 3 | 2 |
| [#17](../../../issues/17) | Voir le coup de mon adversaire sans recharger | Jeu | 2 | 2 |
| [#18](../../../issues/18) | Calculer le nouveau classement Elo | Fin de partie et classement | 2 | 2 |
| [#19](../../../issues/19) | Terminer la partie par mat ou pat | Fin de partie et classement | 3 | 3 |
| [#20](../../../issues/20) | Abandonner la partie en cours | Fin de partie et classement | 3 | 3 |
| [#21](../../../issues/21) | Voir le résultat et les classements mis à jour | Fin de partie et classement | 2 | 3 |
| [#22](../../../issues/22) | Voir l'historique de mes parties | Historique | 3 | 3 |

## Should / Could

| Issue | Titre | Épique | MoSCoW | Points | Sprint |
|---|---|---|---|---|---|
| [#11](../../../issues/11) | Se déconnecter | Comptes | Should | 1 | 3 |
| [#23](../../../issues/23) | Détecter la nulle par répétition, matériel insuffisant ou 50 coups | Fin de partie et classement | Could | 1 | — |

## Won't (hors portée)

- WebSocket / Server-Sent Events (l'énoncé impose l'interrogation périodique)
- Recherche d'adversaire publique (matchmaking)
- Pendule / contrôle du temps
- Proposition de nulle entre joueurs
- Spectateurs d'une partie
- Partie contre l'ordinateur
- Clavardage entre joueurs

## Points par sprint

| Sprint | Points |
|---|---|
| 1 | 17 |
| 2 | 18 |
| 3 | 17 |
| — | 1 |

## Branches suggérées

| Issue | Branche |
|---|---|
| [#1](../../../issues/1) | `chore/1-initialiser-projet` |
| [#2](../../../issues/2) | `chore/2-schema-sqlite` |
| [#3](../../../issues/3) | `chore/3-tests-integration-api` |
| [#4](../../../issues/4) | `chore/4-ci-tests-main` |
| [#5](../../../issues/5) | `chore/5-conteneuriser-api-client` |
| [#6](../../../issues/6) | `chore/6-publier-images-ghcr` |
| [#7](../../../issues/7) | `chore/7-deploy-compose-env` |
| [#8](../../../issues/8) | `chore/8-readme-dev-deploiement` |
| [#9](../../../issues/9) | `feature/9-connexion-github` |
| [#10](../../../issues/10) | `feature/10-profil-premiere-connexion` |
| [#11](../../../issues/11) | `feature/11-deconnexion` |
| [#12](../../../issues/12) | `feature/12-creer-partie-code` |
| [#13](../../../issues/13) | `feature/13-rejoindre-partie-code` |
| [#14](../../../issues/14) | `feature/14-attente-adversaire-polling` |
| [#15](../../../issues/15) | `feature/15-afficher-echiquier` |
| [#16](../../../issues/16) | `feature/16-jouer-coup-tour` |
| [#17](../../../issues/17) | `feature/17-coup-adversaire-polling` |
| [#18](../../../issues/18) | `feature/18-calcul-elo` |
| [#19](../../../issues/19) | `feature/19-fin-mat-pat` |
| [#20](../../../issues/20) | `feature/20-abandonner-partie` |
| [#21](../../../issues/21) | `feature/21-resultat-fin-partie` |
| [#22](../../../issues/22) | `feature/22-historique-parties` |
| [#23](../../../issues/23) | `feature/23-nulle-regles-avancees` |
