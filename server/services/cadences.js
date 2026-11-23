// Les seules cadences possibles. Le client envoie un id de cette liste, jamais un temps.
// base et incrément sont en secondes. Pour quotidien, base est le temps par coup (24 h), pas le temps de la partie.
const CADENCES = [
  { id: '1+0', categorie: 'bullet', base: 60, increment: 0 },
  { id: '2+1', categorie: 'bullet', base: 120, increment: 1 },
  { id: '3+0', categorie: 'blitz', base: 180, increment: 0 },
  { id: '3+2', categorie: 'blitz', base: 180, increment: 2 },
  { id: '5+0', categorie: 'blitz', base: 300, increment: 0 },
  { id: '5+2', categorie: 'blitz', base: 300, increment: 2 },
  { id: '5+5', categorie: 'blitz', base: 300, increment: 5 },
  { id: '10+0', categorie: 'rapide', base: 600, increment: 0 },
  { id: '15+0', categorie: 'rapide', base: 900, increment: 0 },
  { id: '15+10', categorie: 'rapide', base: 900, increment: 10 },
  { id: 'quotidien', categorie: 'quotidien', base: 86400, increment: 0 },
];

function trouverCadence(id) {
  return CADENCES.find((cadence) => cadence.id === id);
}

module.exports = { CADENCES, trouverCadence };
