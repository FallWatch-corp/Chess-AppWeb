// Une erreur avec un code HTTP. Le middleware dans app.js la renvoie en JSON.
class ErreurApi extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

module.exports = { ErreurApi };
