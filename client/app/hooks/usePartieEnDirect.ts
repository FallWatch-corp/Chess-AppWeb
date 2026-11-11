import { useEffect, useState } from "react";
import { io } from "socket.io-client";

// Garde l'état d'une partie à jour en direct grâce à Socket.IO.
// partieInitiale vient du loader : c'est ce qui s'affiche au premier rendu (rendu serveur compris),
// le socket ne fait ensuite que le remplacer par l'état envoyé par le serveur.
export function usePartieEnDirect<T extends { id: number }>(urlApi: string, partieInitiale: T) {
  const [partie, setPartie] = useState(partieInitiale);
  const [connecte, setConnecte] = useState(false);

  // Quand le loader recharge (après une action), on reprend sa version.
  useEffect(() => setPartie(partieInitiale), [partieInitiale]);

  // Un effet ne s'exécute que dans le navigateur, jamais pendant le rendu serveur :
  // le socket est donc toujours ouvert par le navigateur.
  useEffect(() => {
    // withCredentials : le navigateur envoie le cookie de session à l'API (autre origine),
    // sinon le serveur verrait une connexion anonyme.
    const socket = io(urlApi, { withCredentials: true });

    // "connect" se déclenche à la première connexion ET à chaque reconnexion.
    // Une reconnexion crée un nouveau socket sans salon : on redemande donc à chaque fois
    // de rejoindre la partie, et le serveur renvoie l'état complet (coups manqués compris).
    socket.on("connect", () => {
      setConnecte(true);
      socket.emit("partie:rejoindre", partieInitiale.id, (reponse: { erreur?: string }) => {
        if (reponse.erreur) console.error(reponse.erreur);
      });
    });
    socket.on("disconnect", () => setConnecte(false));
    socket.on("partie:etat", (etat: T) => setPartie(etat));

    // Nettoyage : on ferme la connexion quand on quitte la page ou qu'on change de partie.
    // Sans lui, chaque visite laisserait un socket ouvert et le joueur paraîtrait encore présent.
    return () => {
      socket.disconnect();
    };
    // On dépend de l'id et pas de l'objet : sinon le socket serait recréé à chaque coup.
  }, [urlApi, partieInitiale.id]);

  return { partie, connecte };
}
