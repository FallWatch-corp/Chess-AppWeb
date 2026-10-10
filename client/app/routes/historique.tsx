import { Link, redirect } from "react-router";
import type { Route } from "./+types/historique";
import { appelerApi } from "../api.server";
import { CAUSES, formaterVariation } from "../fin-partie";

type PartieTerminee = {
  id: number;
  adversaire: string;
  couleur: "blanc" | "noir";
  resultat: "victoire" | "defaite" | "nulle";
  cause: string;
  eloAvant: number;
  eloApres: number;
  date: string | null;
};

const RESULTATS = { victoire: "Victoire", defaite: "Défaite", nulle: "Nulle" };

// La date est mise en forme ici, côté serveur, et pas dans le composant : sinon le serveur
// et le navigateur pourraient l'écrire différemment (fuseau horaire) et React le signalerait.
const formatDate = new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" });

export function meta({}: Route.MetaArgs) {
  return [{ title: "Historique · Chess-AppWeb" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const reponse = await appelerApi(request, "/api/parties");
  if (reponse.status === 401) {
    // pas connecté : on envoie directement à la connexion GitHub (adresse publique de l'API)
    const urlApi = process.env.URL_API ?? "http://localhost:3000";
    throw redirect(`${urlApi}/api/auth/login`);
  }
  if (!reponse.ok) {
    throw new Response("L'API est indisponible.", { status: 502 });
  }

  const parties: PartieTerminee[] = await reponse.json();
  return {
    parties: parties.map((partie) => ({
      ...partie,
      // null pour les parties terminées avant qu'on enregistre la date
      date: partie.date ? formatDate.format(new Date(partie.date)) : "—",
    })),
  };
}

export default function Historique({ loaderData }: Route.ComponentProps) {
  const { parties } = loaderData;

  return (
    <main className="container mx-auto flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Historique de mes parties</h1>

      {parties.length === 0 ? (
        <p className="text-gray-500">
          Aucune partie terminée pour l'instant.{" "}
          <Link to="/" className="underline">
            Jouer une partie
          </Link>
        </p>
      ) : (
        <div className="w-full max-w-3xl overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b text-sm text-gray-500">
              <tr>
                <th className="p-2 font-medium">Date</th>
                <th className="p-2 font-medium">Adversaire</th>
                <th className="p-2 font-medium">Ma couleur</th>
                <th className="p-2 font-medium">Résultat</th>
                <th className="p-2 font-medium">Mon Elo</th>
              </tr>
            </thead>
            <tbody>
              {parties.map((partie) => (
                <tr key={partie.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{partie.date}</td>
                  <td className="p-2 font-semibold">{partie.adversaire}</td>
                  <td className="p-2">{partie.couleur === "blanc" ? "Blancs" : "Noirs"}</td>
                  <td className="p-2">
                    {RESULTATS[partie.resultat]} {CAUSES[partie.cause] ?? ""}
                  </td>
                  <td className="p-2 font-mono whitespace-nowrap">
                    {partie.eloAvant} → {partie.eloApres} (
                    {formaterVariation(partie.eloApres - partie.eloAvant)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
