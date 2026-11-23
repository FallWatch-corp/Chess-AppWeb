const { Server } = require('socket.io');
const { authentifierSocket } = require('./authentification.js');
const { trouverPartieParId } = require('../repository/parties.js');
const { etatPartie } = require('../services/etat-partie.js');
const { envoyerMessage, historique } = require('../services/clavardage.js');
const { ErreurApi } = require('../services/erreur-api.js');
const { enregistrerIo } = require('./diffusion.js');
const { diffuserPresence } = require('./presence.js');

function brancherTempsReel(serveurHttp) {
  // credentials: true pour que le navigateur envoie le cookie de session ;
  // l'origine doit alors être exacte (jamais '*').
  const io = new Server(serveurHttp, {
    cors: { origin: process.env.URL_CLIENT, credentials: true },
  });
  // diffusion.js garde io pour que les routes HTTP puissent prévenir les salons.
  enregistrerIo(io);

  io.use(authentifierSocket);

  io.on('connection', (socket) => {
    console.log('Connexion', socket.id, socket.data.joueur?.nom ?? 'anonyme');

    // Salon personnel : servira pour la présence, la déconnexion au /logout et les notifications.
    if (socket.data.joueur) void socket.join(`joueur:${socket.data.joueur.id}`);

    // Le client demande à suivre une partie. Les salons sont perdus à chaque déconnexion :
    // le client doit refaire cette demande à chaque (re)connexion.
    socket.on('partie:rejoindre', (partieId, repondre) => {
      if (typeof repondre !== 'function') return;
      if (!Number.isInteger(partieId)) return repondre({ erreur: 'Identifiant invalide.' });

      const partie = trouverPartieParId(partieId);
      if (!partie) return repondre({ erreur: 'Partie introuvable.' });

      void socket.join(`partie:${partieId}`);
      repondre({ ok: true });
      // Seulement à ce socket : il arrive et a besoin de l'état complet.
      socket.emit('partie:etat', etatPartie(partie, socket.data.joueur?.id ?? null));

      // L'historique arrive à chaque (re)connexion : rien de manqué pendant une coupure.
      socket.emit('clavardage:historique', historique(partie));
      diffuserPresence(io, partieId).catch(console.error);
    });

    // Le message ne contient que partieId et texte : l'auteur vient toujours de socket.data.
    socket.on('clavardage:envoyer', (message, repondre) => {
      if (typeof repondre !== 'function') return;
      const partieId = message?.partieId;
      // Comme pour partie:rejoindre : sans ce test, "12" passerait le test du salon (`partie:12`).
      if (!Number.isInteger(partieId)) return repondre({ erreur: 'Identifiant invalide.' });
      // On n'écrit que dans une partie qu'on a rejointe (donc qu'on lit).
      if (!socket.rooms.has(`partie:${partieId}`)) {
        return repondre({ erreur: 'Rejoignez d\'abord la partie.' });
      }

      try {
        const publie = envoyerMessage(partieId, socket.data.joueur, message.texte);
        // À tout le salon, l'auteur compris : son message s'affiche comme celui des autres.
        io.to(`partie:${partieId}`).emit('clavardage:message', publie);
        repondre({ ok: true });
      } catch (erreur) {
        // Une exception dans un gestionnaire Socket.IO ferait planter le serveur : on la rattrape toujours.
        if (!(erreur instanceof ErreurApi)) console.error(erreur);
        repondre({ erreur: erreur instanceof ErreurApi ? erreur.message : 'Erreur interne.' });
      }
    });

    socket.on('partie:coup', (message, repondre) => refuserAction(socket, message, repondre));
    socket.on('partie:abandon', (message, repondre) => refuserAction(socket, message, repondre));

    socket.on('disconnecting', () => {
      socket.data.parties = [...socket.rooms]
        .filter((salon) => salon.startsWith('partie:'))
        .map((salon) => Number(salon.slice('partie:'.length)));
    });

    socket.on('disconnect', (raison) => {
      console.log('Déconnexion', socket.id, raison);
      for (const partieId of socket.data.parties ?? []) {
        diffuserPresence(io, partieId).catch(console.error);
      }
    });
  });

  return io;
}

function refuserAction(socket, message, repondre) {
  if (typeof repondre !== 'function') return;
  const partieId = message?.partieId;
  if (!Number.isInteger(partieId)) return repondre({ erreur: 'Identifiant invalide.' });

  const partie = trouverPartieParId(partieId);
  if (!partie) return repondre({ erreur: 'Partie introuvable.' });

  const joueur = socket.data.joueur;
  if (!joueur) return repondre({ erreur: 'Vous devez être connecté.' });
  if (![partie.createur, partie.blanc, partie.noir].includes(joueur.id)) {
    return repondre({ erreur: 'Vous ne participez pas à cette partie.' });
  }
  repondre({ erreur: 'Les coups et l\'abandon se font par HTTP.' });
}

module.exports = { brancherTempsReel };
