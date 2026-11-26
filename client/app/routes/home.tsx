import { Form, redirect, useNavigation, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { loader as rootLoader } from "../root";
import { appelerApi } from "../api.server";
import { categoriesCadences, formaterCadence, libelleCadence, type Cadence } from "../cadence";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Chess-AppWeb" }];
}

// Les formulaires de la page arrivent ici, on les differencie avec "intent" :
// "creer" (bouton d'une cadence), "apercu" (voir la partie avant de la rejoindre), "rejoindre" (confirmer).
export async function action({ request }: Route.ActionArgs) {
  const formulaire = await request.formData();
  const rejoindre = formulaire.get("intent") === "rejoindre";

  if (formulaire.get("intent") === "apercu") {
    // Le serveur ne renvoie pas le code : on le garde ici pour le bouton de confirmation.
    const code = String(formulaire.get("code") ?? "").trim().toUpperCase();
    const reponse = await appelerApi(request, `/api/parties/code/${encodeURIComponent(code)}`);
    // 404 et 409 : l'API nous donne deja le message a afficher
    if ([404, 409].includes(reponse.status)) {
      const { erreur } = await reponse.json();
      return { erreur };
    }
    if (!reponse.ok) {
      throw new Response("Le serveur ne répond pas correctement.", { status: 502 });
    }
    const apercu: { createur: string; cadence: Cadence } = await reponse.json();
    return { apercu: { code, ...apercu } };
  }

  const reponse = rejoindre
    ? await appelerApi(request, "/api/parties/rejoindre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: formulaire.get("code") }),
      })
    : await appelerApi(request, "/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadence: formulaire.get("cadence") }),
      });

  if (reponse.status === 401) {
    return { erreur: "Vous devez être connecté pour jouer." };
  }
  // 400, 403, 404 et 409 : l'API nous donne deja le message a afficher
  if ([400, 403, 404, 409].includes(reponse.status)) {
    const { erreur } = await reponse.json();
    return { erreur };
  }
  if (!reponse.ok) {
    throw new Response("Le serveur ne répond pas correctement.", { status: 502 });
  }

  const partie: { id: number } = await reponse.json();
  return redirect(`/parties/${partie.id}`);
}

// La liste vient du serveur : elle n'est définie qu'à un seul endroit (server/services/cadences.js).
export async function loader({ request }: Route.LoaderArgs) {
  const reponse = await appelerApi(request, "/api/cadences");
  if (!reponse.ok) {
    throw new Response("Le serveur ne répond pas correctement.", { status: 502 });
  }
  const cadences: Cadence[] = await reponse.json();
  return { cadences };
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const racine = useRouteLoaderData<typeof rootLoader>("root");
  const enCours = useNavigation().state !== "idle";
  const { cadences } = loaderData;

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

      <Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="intent" value="creer" />
        {Object.entries(categoriesCadences).map(([categorie, libelle]) => (
          <fieldset key={categorie} className="flex items-center gap-2">
            <legend className="mb-1 text-sm text-gray-500">{libelle}</legend>
            {cadences
              .filter((c) => c.categorie === categorie)
              .map((c) => (
                <button key={c.id} type="submit" name="cadence" value={c.id} disabled={enCours} className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
                  {formaterCadence(c)}
                </button>
              ))}
          </fieldset>
        ))}
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
          value="apercu"
          disabled={enCours}
          className="rounded border px-4 py-2 hover:bg-gray-100 disabled:opacity-50"
        >
          Rejoindre
        </button>
      </Form>

      {actionData?.apercu && (
        <>
          <p className="text-gray-500">
            Partie de {actionData.apercu.createur} · {libelleCadence(actionData.apercu.cadence)}
          </p>
          <Form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="code" value={actionData.apercu.code} />
            <button type="submit" name="intent" value="rejoindre" disabled={enCours} className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
              Rejoindre la partie
            </button>
          </Form>
        </>
      )}

      {actionData?.erreur && (
        <p role="alert" className="text-red-600">
          {actionData.erreur}
        </p>
      )}
    </main>
  );
}
