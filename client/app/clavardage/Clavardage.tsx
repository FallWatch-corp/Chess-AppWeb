import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MessageClavardage } from "../hooks/usePartieEnDirect";

const ROLES = { blanc: "Blancs", noir: "Noirs", joueur: "Joueur", spectateur: "Spectateur" } as const;
const LONGUEUR_MAX = 300; // la même limite que le serveur, qui vérifie de toute façon

type Props = {
  messages: MessageClavardage[];
  estConnecte: boolean;
  ferme: boolean;
  urlConnexion: string;
  envoyer: (texte: string) => Promise<string | null>;
};

export function Clavardage({ messages, estConnecte, ferme, urlConnexion, envoyer }: Props) {
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enEnvoi, setEnEnvoi] = useState(false);
  const liste = useRef<HTMLUListElement>(null);

  // On garde le dernier message visible en faisant défiler la liste seulement.
  // Pas de scrollIntoView : il fait aussi défiler la page, et un joueur qui regarde l'échiquier
  // serait emmené vers le bas à chaque message reçu.
  // Les accolades comptent : un effet ne doit rien renvoyer d'autre qu'une fonction de nettoyage.
  useEffect(() => {
    if (liste.current) liste.current.scrollTop = liste.current.scrollHeight;
  }, [messages]);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setEnEnvoi(true);
    const refus = await envoyer(texte);
    setEnEnvoi(false);
    setErreur(refus);
    if (!refus) setTexte("");
  }

  return (
    <section aria-label="Clavardage" className="flex w-full max-w-md flex-col gap-2 rounded border p-3">
      <h2 className="font-semibold">Clavardage</h2>
      {/* aria-live : les lecteurs d'écran annoncent les nouveaux messages sans que l'on quitte l'échiquier */}
      <ul ref={liste} aria-live="polite" className="h-48 overflow-y-auto text-sm">
        {messages.length === 0 && <li className="text-gray-500">Aucun message pour l'instant.</li>}
        {messages.map((m) => (
          // {m.texte} est échappé par React : un "<script>" s'affiche comme du texte.
          <li key={m.id}>
            <span className="font-medium">{m.auteur}</span>{" "}
            <span className="text-gray-500">({ROLES[m.role]})</span> : {m.texte}
          </li>
        ))}
      </ul>

      {ferme ? (
        <p className="text-sm text-gray-500">Partie terminée : le clavardage est en lecture seule.</p>
      ) : !estConnecte ? (
        <p className="text-sm">
          <a href={urlConnexion} className="underline">Connectez-vous</a> pour écrire.
        </p>
      ) : (
        <form onSubmit={soumettre} className="flex gap-2">
          <input
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            maxLength={LONGUEUR_MAX}
            aria-label="Message"
            placeholder="Votre message"
            className="flex-1 rounded border px-2 py-1"
          />
          <button type="submit" disabled={enEnvoi || texte.trim() === ""} className="rounded border px-3 py-1 disabled:opacity-50">
            Envoyer
          </button>
        </form>
      )}
      {erreur && <p role="alert" className="text-sm text-red-600">{erreur}</p>}
    </section>
  );
}
