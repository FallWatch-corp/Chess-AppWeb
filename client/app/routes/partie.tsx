import { useState } from "react";
import { redirect } from "react-router";
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
  // comme sur l'échiquier : l'adversaire en haut, moi en bas
  const moi = partie.couleur ?? "blanc";
  const adversaire = moi === "blanc" ? "noir" : "blanc";
  const camp = partie.trait === "blanc" ? "blancs" : "noirs";
  const messageTrait =
    partie.trait === partie.couleur ? "À vous de jouer" : `Trait aux ${camp}`;

  return (
    <main className="container mx-auto flex flex-col items-center gap-4 p-8">
      <p className="text-lg font-medium">{messageTrait}</p>
      <BandeauJoueur joueur={partie[adversaire]} couleur={adversaire} trait={partie.trait} />
      <Echiquier fen={partie.fen} couleur={partie.couleur} theme={theme} />
      <BandeauJoueur joueur={partie[moi]} couleur={moi} trait={partie.trait} />
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
