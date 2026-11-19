import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

// Un message tel que le serveur l'envoie (server/services/clavardage.js, messagePublic).
// role est calculé par le serveur : "joueur" = le créateur, tant que sa couleur n'est pas tirée.
export type MessageClavardage = {
  id: number;
  auteur: string;
  role: "blanc" | "noir" | "joueur" | "spectateur";
  texte: string;
  envoyeLe: string;
};

// Garde l'état d'une partie et son clavardage à jour en direct grâce à Socket.IO.
// partieInitiale vient du loader : c'est ce qui s'affiche au premier rendu (rendu serveur compris),
// le socket ne fait ensuite que le remplacer par l'état envoyé par le serveur.
export function usePartieEnDirect<T extends { id: number }>(urlApi: string, partieInitiale: T) {
  const [partie, setPartie] = useState(partieInitiale);
  const [connecte, setConnecte] = useState(false);
  // Vide au rendu serveur : l'historique n'arrive que par le socket, donc dans le navigateur.
  const [messages, setMessages] = useState<MessageClavardage[]>([]);
  // Le socket est créé dans l'effet, mais envoyerMessage (plus bas) en a besoin.
  // Une ref et pas un state : changer de socket ne doit pas provoquer un nouveau rendu.
  const socketRef = useRef<Socket | null>(null);

  // Quand le loader recharge (après une action), on reprend sa version.
  useEffect(() => setPartie(partieInitiale), [partieInitiale]);

  // Un effet ne s'exécute que dans le navigateur, jamais pendant le rendu serveur :
  // le socket est donc toujours ouvert par le navigateur.
  useEffect(() => {
    // withCredentials : le navigateur envoie le cookie de session à l'API (autre origine),
    // sinon le serveur verrait une connexion anonyme.
    const socket = io(urlApi, { withCredentials: true });
    socketRef.current = socket;

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

    // Tous les écouteurs sont posés ici, AVANT que la connexion aboutisse :
    // l'historique, envoyé juste après partie:rejoindre, ne peut donc pas arriver sans personne pour l'écouter.
    // Remplace (et n'ajoute pas) : à une reconnexion, on reçoit tout l'historique, sans doublons.
    socket.on("clavardage:historique", (liste: MessageClavardage[]) => setMessages(liste));
    // Le serveur l'envoie à tout le salon, auteur compris : on n'ajoute jamais un message au moment de l'envoyer.
    socket.on("clavardage:message", (message: MessageClavardage) =>
      setMessages((avant) => [...avant, message]),
    );

    // Nettoyage : on ferme la connexion quand on quitte la page ou qu'on change de partie.
    // Sans lui, chaque visite laisserait un socket ouvert et le joueur paraîtrait encore présent.
    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
    // On dépend de l'id et pas de l'objet : sinon le socket serait recréé à chaque coup.
  }, [urlApi, partieInitiale.id]);

  // Envoie un message au clavardage. Renvoie le refus du serveur (texte vide, trop long,
  // trop rapide, partie terminée…), ou null si le message est accepté.
  // useCallback : la fonction reste la même d'un rendu à l'autre, tant que la partie ne change pas.
  const envoyerMessage = useCallback(
    async (texte: string): Promise<string | null> => {
      const socket = socketRef.current;
      if (!socket?.connected) return "Connexion perdue, réessayez dans un instant.";
      try {
        // emitWithAck rejette si la connexion tombe pendant l'envoi ; timeout : il rejette aussi
        // si le serveur ne répond plus. Sans ce try, le bouton Envoyer resterait bloqué.
        const reponse: { ok?: true; erreur?: string } = await socket
          .timeout(5000)
          .emitWithAck("clavardage:envoyer", { partieId: partieInitiale.id, texte });
        return reponse.erreur ?? null;
      } catch {
        return "Connexion perdue, réessayez dans un instant.";
      }
    },
    [partieInitiale.id],
  );

  return { partie, connecte, messages, envoyerMessage };
}
