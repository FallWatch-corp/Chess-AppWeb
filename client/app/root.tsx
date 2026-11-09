import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useSearchParams,
} from "react-router";

import type { Route } from "./+types/root";
import { obtenirJoueurConnecte } from "./api.server";
import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
  // le bouton de connexion envoie le navigateur directement sur l'API,
  // donc il faut l'adresse publique de l'API (pas celle dans Docker)
  const urlApi = process.env.URL_API ?? "http://localhost:3000";
  return {
    joueur: await obtenirJoueurConnecte(request),
    // utilisée aussi par le navigateur pour ouvrir la connexion Socket.IO
    urlApi,
    urlConnexion: `${urlApi}/api/auth/login`,
    urlDeconnexion: `${urlApi}/api/auth/logout`,
  };
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { joueur, urlConnexion, urlDeconnexion } = loaderData;
  // l'API nous renvoie ici avec ?erreur=connexion si la connexion GitHub a raté
  const [parametres] = useSearchParams();
  const connexionRatee = parametres.get("erreur") === "connexion" && !joueur;

  return (
    <>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Link to="/" className="font-semibold">
          Chess-AppWeb
        </Link>
        {joueur ? (
          <div className="flex items-center gap-3">
            <Link to="/historique" className="underline hover:no-underline">
              Historique
            </Link>
            <span>
              {joueur.nom} · <span className="font-mono">Elo {joueur.elo}</span>
            </span>
            {/* formulaire HTML classique : c'est l'API qui efface le cookie puis nous renvoie ici */}
            <form method="post" action={urlDeconnexion}>
              <button
                type="submit"
                className="rounded border px-3 py-1.5 hover:bg-gray-100"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        ) : (
          <a
            href={urlConnexion}
            className="rounded bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700"
          >
            Se connecter avec GitHub
          </a>
        )}
      </header>
      {connexionRatee && (
        <p role="alert" className="bg-red-50 px-4 py-3 text-center text-red-700">
          La connexion avec GitHub a été annulée ou a échoué. Vous pouvez réessayer.
        </p>
      )}
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
