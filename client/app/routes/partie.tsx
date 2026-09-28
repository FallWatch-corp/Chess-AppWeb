import { useState } from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/partie";
import { appelerApi } from "../api.server";

type Partie = { id: number; code: string; statut: string };

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
