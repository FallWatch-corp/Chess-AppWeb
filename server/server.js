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

const app = require('./app.js');

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`API à l'écoute sur le port ${port}`);
});
