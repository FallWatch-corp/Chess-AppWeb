import { useState } from "react";
import { redirect, useFetcher } from "react-router";
import { Chess } from "chess.js";
import type { Route } from "./+types/partie";
import { appelerApi } from "../api.server";
import { useInterrogation } from "../hooks/useInterrogation";
import { useThemeEchiquier } from "../hooks/useThemeEchiquier";
import { Echiquier } from "../echiquier/Echiquier";
import { SelecteurTheme } from "../echiquier/SelecteurTheme";

type Couleur = "blanc" | "noir";
type JoueurPartie = { nom: string; elo: number };

type Partie = {
  id: number;
  code: string;
  statut: string;
  couleur: Couleur | null;
  fen: string;
  trait: Couleur;
  blanc: JoueurPartie | null;
  noir: JoueurPartie | null;
  coups: string[];
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Partie privée · Chess-AppWeb" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const reponse = await appelerApi(request, `/api/parties/${params.id}`);
  if (reponse.status === 401) throw redirect("/");
  if (!reponse.ok) {
    const { erreur } = await reponse.json();
    throw new Response(erreur, { status: reponse.status });
  }

  const partie: Partie = await reponse.json();
  return { partie };
}

// Envoie le coup à l'API. Après l'action, React Router relance le loader :
// la page reçoit la FEN validée par le serveur (ou l'ancienne si le coup est refusé).
export async function action({ request, params }: Route.ActionArgs) {
  const formulaire = await request.formData();
  const coup = {
    de: formulaire.get("de"),
    vers: formulaire.get("vers"),
    promotion: formulaire.get("promotion") || undefined,
  };

  const reponse = await appelerApi(request, `/api/parties/${params.id}/coups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(coup),
  });
  if (reponse.status === 401) throw redirect("/");
  if (!reponse.ok) {
    // 409 hors tour / partie terminée, 422 coup illégal, 403… : l'API donne le message
    const { erreur } = await reponse.json();
    return { erreur: erreur as string };
  }
  return { erreur: null };
}

export default function PagePartie({ loaderData }: Route.ComponentProps) {
  const { partie } = loaderData;

  // tant qu'on attend l'adversaire on redemande l'état de la partie toutes les 2 s
  useInterrogation(partie.statut === "en_attente");

  if (partie.statut !== "en_attente") {
    return <PartieEnCours partie={partie} />;
  }

  return (
    <main className="container mx-auto flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Partie privée</h1>
      <p>Donnez ce code à la personne contre qui vous voulez jouer :</p>
      <div className="flex items-center gap-3">
        <span className="rounded border px-4 py-2 font-mono text-3xl tracking-widest">
          {partie.code}
        </span>
        <BoutonCopier texte={partie.code} />
      </div>
      <p className="text-gray-500">En attente de votre adversaire…</p>
    </main>
  );
}

function PartieEnCours({ partie }: { partie: Partie }) {
  const [theme, setTheme] = useThemeEchiquier();
  const fetcher = useFetcher<typeof action>();
  // comme sur l'échiquier : l'adversaire en haut, moi en bas
  const moi = partie.couleur ?? "blanc";
  const adversaire = moi === "blanc" ? "noir" : "blanc";
  const camp = partie.trait === "blanc" ? "blancs" : "noirs";
  const messageTrait =
    partie.trait === partie.couleur ? "À vous de jouer" : `Trait aux ${camp}`;

  // Pendant l'envoi, on affiche déjà la position après le coup (affichage optimiste).
  // Dès que le loader a répondu, c'est la FEN du serveur qui s'affiche :
  // si le coup est refusé, la pièce revient donc à sa place.
  // (fenApres est vide quand le coup nous paraît illégal : on garde alors la position actuelle)
  const fenOptimiste = fetcher.formData?.get("fenApres");
  const fen = typeof fenOptimiste === "string" && fenOptimiste !== "" ? fenOptimiste : partie.fen;
  const peutJouer =
    partie.statut === "en_cours" && partie.trait === partie.couleur && fetcher.state === "idle";

  function jouer(coup: { de: string; vers: string; promotion?: "q" }) {
    // chess.js sert seulement à calculer la position à afficher en attendant ;
    // c'est le serveur qui décide si le coup est légal (même s'il nous paraît illégal ici)
    let fenApres = "";
    try {
      fenApres = new Chess(partie.fen).move({ from: coup.de, to: coup.vers, promotion: coup.promotion }).after;
    } catch {
      // coup illégal : on l'envoie quand même, le serveur répondra 422
    }
    // pas besoin d'attendre : la page se met à jour quand le loader a rechargé la partie
    void fetcher.submit(
      { de: coup.de, vers: coup.vers, promotion: coup.promotion ?? "", fenApres },
      { method: "post" },
    );
    return fenApres !== "";
  }

  const erreur = fetcher.state === "idle" ? fetcher.data?.erreur : null;

  return (
    <main className="container mx-auto flex flex-col items-center gap-4 p-8">
      <p className="text-lg font-medium">{messageTrait}</p>
      <BandeauJoueur joueur={partie[adversaire]} couleur={adversaire} trait={partie.trait} />
      <Echiquier
        fen={fen}
        couleur={partie.couleur}
        theme={theme}
        onCoup={peutJouer ? jouer : undefined}
      />
      <BandeauJoueur joueur={partie[moi]} couleur={moi} trait={partie.trait} />
      {erreur && (
        <p role="alert" className="text-red-600">
          {erreur}
        </p>
      )}
      <SelecteurTheme theme={theme} onChange={setTheme} />
    </main>
  );
}

function BandeauJoueur({
  joueur,
  couleur,
  trait,
}: {
  joueur: JoueurPartie | null;
  couleur: Couleur;
  trait: Couleur;
}) {
  return (
    <div className="flex w-full max-w-140 items-center justify-between">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={`inline-block size-3 rounded-full border border-gray-500 ${
            couleur === "blanc" ? "bg-white" : "bg-gray-900"
          }`}
        />
        <span className="sr-only">{couleur === "blanc" ? "Blancs :" : "Noirs :"}</span>
        <span className="font-semibold">{joueur?.nom ?? "?"}</span>
        <span className="font-mono text-gray-500">({joueur?.elo ?? "?"})</span>
      </span>
      {trait === couleur && <span className="text-sm text-gray-500">au trait</span>}
    </div>
  );
}

function BoutonCopier({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    await navigator.clipboard.writeText(texte);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copier}
      className="rounded border px-3 py-2 hover:bg-gray-100"
    >
      {copie ? "Copié !" : "Copier"}
    </button>
  );
}
