import { Form, redirect, useNavigation, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { loader as rootLoader } from "../root";
import { appelerApi } from "../api.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Chess-AppWeb" }];
}

export async function action({ request }: Route.ActionArgs) {
  const reponse = await appelerApi(request, "/api/parties", { method: "POST" });
  if (reponse.status === 401) {
    return { erreur: "Vous devez être connecté pour créer une partie." };
  }
  if (!reponse.ok) {
    throw new Response("Impossible de créer la partie.", { status: 502 });
  }

  const partie: { id: number } = await reponse.json();
  return redirect(`/parties/${partie.id}`);
}

export default function Home({ actionData }: Route.ComponentProps) {
  const racine = useRouteLoaderData<typeof rootLoader>("root");
  const enCours = useNavigation().state !== "idle";

  return (
    <main className="container mx-auto flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Jouer une partie privée</h1>

      {racine?.joueur ? (
        <Form method="post">
          <button
            type="submit"
            disabled={enCours}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Créer une partie
          </button>
        </Form>
      ) : (
        <p className="text-gray-500">Connectez-vous pour créer une partie.</p>
      )}

      {actionData?.erreur && <p className="text-red-600">{actionData.erreur}</p>}
    </main>
  );
}
