// Appels à l'API Express depuis les loaders et actions (côté serveur seulement).
// Le cookie de session du navigateur est transmis pour que l'API reconnaisse le joueur.
const API_URL = process.env.API_URL ?? "http://localhost:3000";

export function appelerApi(
  request: Request,
  chemin: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  return fetch(`${API_URL}${chemin}`, { ...init, headers });
}

export type Joueur = { nom: string; elo: number };

export async function obtenirJoueurConnecte(
  request: Request,
): Promise<Joueur | null> {
  const reponse = await appelerApi(request, "/api/moi");
  if (reponse.status === 401) return null;
  if (!reponse.ok) {
    throw new Response("L'API est indisponible.", { status: 502 });
  }
  return reponse.json();
}
