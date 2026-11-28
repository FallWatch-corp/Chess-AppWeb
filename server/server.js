// On vérifie les variables au démarrage pour avoir une erreur claire tout de suite
// plutot qu'un plantage au milieu d'une connexion.
const VARIABLES_OBLIGATOIRES = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'SESSION_SECRET',
  'URL_API',
  'URL_CLIENT',
];
const manquantes = VARIABLES_OBLIGATOIRES.filter((nom) => !process.env[nom]);
if (manquantes.length > 0) {
  console.error(`Variables d'environnement manquantes : ${manquantes.join(', ')}`);
  process.exit(1);
}

const http = require('node:http');
const { setInterval } = require('node:timers');
const app = require('./app.js');
const { brancherTempsReel } = require('./temps-reel/index.js');
const { verifierEcheances } = require('./services/echeances.js');
const { diffuserPartie } = require('./temps-reel/diffusion.js');

const port = process.env.PORT || 3000;

// On crée le serveur HTTP nous-mêmes (au lieu de app.listen) pour le partager :
// Express répond aux requêtes HTTP, Socket.IO intercepte /socket.io/ et l'upgrade WebSocket.
const serveurHttp = http.createServer(app);
brancherTempsReel(serveurHttp);

// Termine au temps les parties quotidiennes en retard et prévient leurs joueurs.
// Une erreur ici ne doit pas arrêter le serveur : on la note et on réessaiera à la minute suivante.
function terminerLesRetards() {
  try {
    for (const id of verifierEcheances()) {
      diffuserPartie(id).catch(console.error);
    }
  } catch (erreur) {
    console.error('Vérification des échéances impossible :', erreur);
  }
}

terminerLesRetards(); // au démarrage : des parties ont pu expirer pendant que le serveur était arrêté
setInterval(terminerLesRetards, 60 * 1000); // puis toutes les minutes

serveurHttp.listen(port, () => {
  console.log(`API à l'écoute sur le port ${port}`);
});
