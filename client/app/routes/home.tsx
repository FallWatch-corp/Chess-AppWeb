import { Form, redirect, useNavigation, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { loader as rootLoader } from "../root";
import { appelerApi } from "../api.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Chess-AppWeb" }];
}

// Les deux formulaires de la page arrivent ici, on les differencie avec "intent"
export async function action({ request }: Route.ActionArgs) {
  const formulaire = await request.formData();
  const rejoindre = formulaire.get("intent") === "rejoindre";

  const reponse = rejoindre
    ? await appelerApi(request, "/api/parties/rejoindre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: formulaire.get("code") }),
      })
    : await appelerApi(request, "/api/parties", { method: "POST" });

  if (reponse.status === 401) {
    return { erreur: "Vous devez être connecté pour jouer." };
  }
  // 403, 404 et 409 : l'API nous donne deja le message a afficher
  if ([403, 404, 409].includes(reponse.status)) {
    const { erreur } = await reponse.json();
    return { erreur };
  }
  if (!reponse.ok) {
    throw new Response("Le serveur ne répond pas correctement.", { status: 502 });
  }

  const partie: { id: number } = await reponse.json();
  return redirect(`/parties/${partie.id}`);
}

export default function Home({ actionData }: Route.ComponentProps) {
  const racine = useRouteLoaderData<typeof rootLoader>("root");
  const enCours = useNavigation().state !== "idle";

  if (!racine?.joueur) {
    return (
      <main className="container mx-auto flex flex-col items-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">Jouer une partie privée</h1>
        <p className="text-gray-500">Connectez-vous pour jouer.</p>
      </main>
    );
  }

  return (
    <main className="container mx-auto flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Jouer une partie privée</h1>

      <Form method="post">
        <button
          type="submit"
          name="intent"
          value="creer"
          disabled={enCours}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Créer une partie
        </button>
      </Form>

      <p className="text-gray-500">ou</p>

      <Form method="post" className="flex gap-2">
        <label htmlFor="code" className="sr-only">
          Code de la partie
        </label>
        <input
          id="code"
          name="code"
          required
          maxLength={6}
          placeholder="Code"
          autoComplete="off"
          className="w-32 rounded border px-3 py-2 font-mono uppercase tracking-widest"
        />
        <button
          type="submit"
          name="intent"
          value="rejoindre"
          disabled={enCours}
          className="rounded border px-4 py-2 hover:bg-gray-100 disabled:opacity-50"
        >
          Rejoindre
        </button>
      </Form>

      {actionData?.erreur && (
        <p role="alert" className="text-red-600">
          {actionData.erreur}
        </p>
      )}
    </main>
  );
}
